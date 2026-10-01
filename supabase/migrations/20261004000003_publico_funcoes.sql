-- Etapa 4 · Funções do link público (schema publico).
--
-- Quem chama: SÓ o servidor do Orkestra, por conexão direta, numa transação com role anon
-- (comAnon em src/server/db/anon.ts). O schema publico NÃO é exposto na API do Supabase.
-- Mesmo assim cada função revalida tudo: empresa existe, plano não suspenso, estado do
-- orçamento, validade e limites por IP/WhatsApp/empresa. anon não lê nenhuma tabela.
--
-- Nunca devolvem dado de outra pessoa: o lead existente não é revelado (a resposta de
-- iniciar_orcamento é sempre um token novo) e a proposta só sai com o token certo.
--
-- Erros com código estável na mensagem (PUBLICO_*, LIMITE_EXCEDIDO); o app traduz.

-- ---------------------------------------------------------------------------
-- Helpers internos (sem grant)
-- ---------------------------------------------------------------------------

/** Empresa pelo slug (null se não existir). */
create or replace function publico._empresa(p_slug text)
returns public.empresas
language sql
stable
security definer
set search_path = ''
as $$
  select e.* from public.empresas e where e.slug = lower(btrim(coalesce(p_slug, ''))) limit 1;
$$;

/** Empresa ativa (não suspensa) pelo slug, ou erro. */
create or replace function publico._empresa_ativa(p_slug text)
returns public.empresas
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.empresas;
begin
  v_e := publico._empresa(p_slug);
  if v_e.id is null then
    raise exception 'PUBLICO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  if v_e.plano = 'suspenso' then
    raise exception 'PUBLICO_SUSPENSO' using errcode = 'insufficient_privilege';
  end if;
  return v_e;
end;
$$;

/** Hoje (data civil) no fuso da empresa. */
create or replace function publico._hoje(p_empresa uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone e.fuso)::date from public.empresas e where e.id = p_empresa;
$$;

/** Token aleatório base64url (2 × gen_random_uuid = 244 bits). */
create or replace function publico._novo_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(decode(
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '='),
    '+/', '-_');
$$;

/**
 * Limites por janela de 1 hora. Registra a tentativa (só hashes) e devolve true; se algum
 * limite já foi atingido, levanta LIMITE_EXCEDIDO (ou devolve false com p_silencioso).
 */
create or replace function publico._limitar(
  p_acao text, p_empresa uuid, p_ip_hash text, p_whatsapp text default null,
  p_silencioso boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lim_ip   integer;
  v_lim_wpp  integer;
  v_lim_emp  integer;
  v_wpp_hash text;
  v_chaves   text[][];
  v_i        integer;
  v_total    integer;
begin
  select l.ip, l.wpp, l.emp into v_lim_ip, v_lim_wpp, v_lim_emp
  from (values
    ('iniciar',     10,   5,    300),
    ('pre_reserva',  5,   3,     60),
    ('visita',       5,   3,     60),
    ('funil',      400, null, 5000)
  ) as l(acao, ip, wpp, emp)
  where l.acao = p_acao;
  if v_lim_ip is null then
    raise exception 'PUBLICO_ACAO_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;

  if p_whatsapp is not null then
    v_wpp_hash := encode(sha256(convert_to(p_empresa::text || ':' || p_whatsapp, 'UTF8')), 'hex');
  end if;

  v_chaves := array[
    array['ip', coalesce(nullif(btrim(coalesce(p_ip_hash, '')), ''), 'sem-ip'), v_lim_ip::text],
    array['whatsapp', coalesce(v_wpp_hash, ''), coalesce(v_lim_wpp::text, '')],
    array['empresa', p_empresa::text, v_lim_emp::text]
  ];

  for v_i in 1 .. array_length(v_chaves, 1) loop
    continue when v_chaves[v_i][2] = '' or v_chaves[v_i][3] = '';
    select count(*) into v_total from publico.tentativas t
    where t.acao = p_acao and t.chave_tipo = v_chaves[v_i][1] and t.chave_hash = v_chaves[v_i][2]
      and t.criado_em > now() - interval '1 hour';
    if v_total >= v_chaves[v_i][3]::integer then
      if p_silencioso then
        return false;
      end if;
      raise exception 'LIMITE_EXCEDIDO' using errcode = 'program_limit_exceeded';
    end if;
  end loop;

  for v_i in 1 .. array_length(v_chaves, 1) loop
    continue when v_chaves[v_i][2] = '' or v_chaves[v_i][3] = '';
    insert into publico.tentativas (acao, chave_tipo, chave_hash, empresa_id)
    values (p_acao, v_chaves[v_i][1], v_chaves[v_i][2], p_empresa);
  end loop;
  return true;
end;
$$;

/** Orçamento pelo token (trava a linha). Erro se não existir ou se a empresa estiver suspensa. */
create or replace function publico._orcamento(p_token text)
returns public.orcamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orcamentos;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,}$' then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  select * into v_o from public.orcamentos o where o.token = p_token for update;
  if v_o.id is null then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.empresas e where e.id = v_o.empresa_id and e.plano = 'suspenso') then
    raise exception 'PUBLICO_SUSPENSO' using errcode = 'insufficient_privilege';
  end if;
  return v_o;
end;
$$;

/** Valida as escolhas denormalizadas do orçamento (todas da mesma empresa e ativas). */
create or replace function publico._validar_escolhas(
  p_empresa uuid, p_tipo_evento_id uuid, p_turno_id uuid, p_espaco_id uuid, p_convidados integer
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_tipo_evento_id is not null and not exists (
       select 1 from public.tipos_evento t where t.id = p_tipo_evento_id and t.empresa_id = p_empresa and t.ativo)
     or p_turno_id is not null and not exists (
       select 1 from public.turnos t where t.id = p_turno_id and t.empresa_id = p_empresa and t.ativo)
     or p_espaco_id is not null and not exists (
       select 1 from public.espacos e where e.id = p_espaco_id and e.empresa_id = p_empresa and e.ativo)
     or p_convidados is not null and p_convidados not between 1 and 100000 then
    raise exception 'PUBLICO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vitrine
-- ---------------------------------------------------------------------------

/** Dados da página do buffet. Nunca e-mail, plano detalhado nem ids. */
create or replace function publico.buffet(p_slug text)
returns table (
  nome text, slug text, sobre text, logo_path text, capa_path text, cor_marca text,
  whatsapp_e164 text, cidade text, uf text, fuso text, suspenso boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.nome, e.slug, e.sobre, e.logo_path, e.capa_path, e.cor_marca, e.whatsapp_e164,
         e.cidade, e.uf::text, e.fuso, e.plano = 'suspenso'
  from public.empresas e
  where e.slug = lower(btrim(coalesce(p_slug, '')));
$$;

/** Slug atual de um slug antigo ainda válido (redirecionamento 308). */
create or replace function publico.slug_atual(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug
  from public.slugs_antigos s
  join public.empresas e on e.id = s.empresa_id
  where s.slug = lower(btrim(coalesce(p_slug, ''))) and s.expira_em > now();
$$;

/**
 * Catálogo ATIVO + regras, para o servidor montar o ContextoPreco (mesmo mapper do painel).
 * Inclui preços: NUNCA é serializado para o navegador; o servidor monta a vitrine conforme o
 * modo de exibição de preço.
 */
create or replace function publico.contexto_preco(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.empresas;
begin
  v_e := publico._empresa_ativa(p_slug);
  return jsonb_build_object(
    'fuso', v_e.fuso,
    'hoje', publico._hoje(v_e.id),
    'regras', (select to_jsonb(r) - 'empresa_id' from public.regras_comerciais r where r.empresa_id = v_e.id),
    'tipos_evento', coalesce((select jsonb_agg(to_jsonb(t) - 'empresa_id' order by t.ordem, t.nome)
      from public.tipos_evento t where t.empresa_id = v_e.id and t.ativo), '[]'),
    'espacos', coalesce((select jsonb_agg(to_jsonb(x) - 'empresa_id' order by x.ordem, x.nome)
      from public.espacos x where x.empresa_id = v_e.id and x.ativo), '[]'),
    'turnos', coalesce((select jsonb_agg(to_jsonb(t) - 'empresa_id' order by t.ordem, t.hora_inicio)
      from public.turnos t where t.empresa_id = v_e.id and t.ativo), '[]'),
    'ajustes_dia', coalesce((select jsonb_agg(to_jsonb(a) - 'empresa_id')
      from public.ajustes_dia a where a.empresa_id = v_e.id), '[]'),
    'feriados', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' order by f.data)
      from public.feriados f where f.empresa_id = v_e.id), '[]'),
    'faixas_idade', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' order by f.idade_min)
      from public.faixas_idade f
      where f.empresa_id = v_e.id
        and (f.pacote_id is null or exists (
          select 1 from public.pacotes p where p.id = f.pacote_id and p.ativo))), '[]'),
    'pacotes', coalesce((select jsonb_agg(to_jsonb(p) - 'empresa_id' order by p.ordem, p.nome)
      from public.pacotes p where p.empresa_id = v_e.id and p.ativo), '[]'),
    'faixas_preco', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' order by f.ate_convidados)
      from public.faixas_preco f join public.pacotes p on p.id = f.pacote_id and p.ativo
      where f.empresa_id = v_e.id), '[]'),
    'secoes_cardapio', coalesce((select jsonb_agg(to_jsonb(s) - 'empresa_id' order by s.ordem)
      from public.secoes_cardapio s join public.pacotes p on p.id = s.pacote_id and p.ativo
      where s.empresa_id = v_e.id), '[]'),
    'pacote_tipos_evento', coalesce((select jsonb_agg(to_jsonb(v) - 'empresa_id')
      from public.pacote_tipos_evento v where v.empresa_id = v_e.id), '[]'),
    'opcionais', coalesce((select jsonb_agg(to_jsonb(o) - 'empresa_id' order by o.ordem, o.nome)
      from public.opcionais o where o.empresa_id = v_e.id and o.ativo), '[]'),
    'opcional_pacotes', coalesce((select jsonb_agg(to_jsonb(v) - 'empresa_id')
      from public.opcional_pacotes v where v.empresa_id = v_e.id), '[]'),
    'opcional_tipos_evento', coalesce((select jsonb_agg(to_jsonb(v) - 'empresa_id')
      from public.opcional_tipos_evento v where v.empresa_id = v_e.id), '[]'),
    'faixas_deslocamento', coalesce((select jsonb_agg(to_jsonb(d) - 'empresa_id' order by d.ate_km)
      from public.faixas_deslocamento d where d.empresa_id = v_e.id), '[]')
  );
end;
$$;

/**
 * Disponibilidade pública: só "disponível ou não" por data × turno × espaço. Nunca o motivo,
 * nem cliente. Datas antes de hoje + antecedência mínima e turnos que já começaram saem como
 * indisponíveis. Máximo de 62 dias por chamada.
 */
create or replace function publico.disponibilidade(
  p_slug text, p_de date, p_ate date, p_espaco_id uuid default null
)
returns table (data date, turno_id uuid, espaco_id uuid, disponivel boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e      public.empresas;
  v_minimo date;
begin
  v_e := publico._empresa_ativa(p_slug);
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de + 1 > 62 then
    raise exception 'PUBLICO_PERIODO_INVALIDO' using errcode = 'check_violation';
  end if;
  select publico._hoje(v_e.id) + r.antecedencia_min_dias into v_minimo
  from public.regras_comerciais r where r.empresa_id = v_e.id;

  return query
  select d.data, d.turno_id, d.espaco_id,
         d.estado = 'livre' and d.vagas > 0 and d.data >= v_minimo
           and ((d.data + t.hora_inicio) at time zone v_e.fuso) > now()
  from public._disponibilidade(v_e.id, p_de, p_ate, p_espaco_id) d
  join public.turnos t on t.id = d.turno_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wizard
-- ---------------------------------------------------------------------------

/**
 * Passo 3 (WhatsApp): cria ou reutiliza o lead e abre um orçamento em montagem.
 * A resposta é sempre um token novo, exista ou não o lead (não revela nada de ninguém).
 * Lead existente: o nome NÃO é sobrescrito; o nome digitado vai para a atividade "voltou".
 */
create or replace function publico.iniciar_orcamento(
  p_slug text,
  p_nome text,
  p_whatsapp_e164 text,
  p_consentimento_versao text,
  p_consentimento_texto text,
  p_origem public.origem_lead,
  p_rascunho jsonb,
  p_tipo_evento_id uuid,
  p_data date,
  p_turno_id uuid,
  p_espaco_id uuid,
  p_convidados integer,
  p_ip_hash text,
  p_teste boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e      public.empresas;
  v_lead   public.leads;
  v_numero integer;
  v_token  text;
  v_orc    uuid;
  v_nome   text := btrim(coalesce(p_nome, ''));
  v_teste  boolean := coalesce(p_teste, false);
begin
  v_e := publico._empresa_ativa(p_slug);
  if char_length(v_nome) not between 2 and 120
     or p_whatsapp_e164 is null or p_whatsapp_e164 !~ '^\+[1-9][0-9]{7,14}$'
     or char_length(btrim(coalesce(p_consentimento_versao, ''))) = 0
     or char_length(btrim(coalesce(p_consentimento_texto, ''))) = 0 then
    raise exception 'PUBLICO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  perform publico._validar_escolhas(v_e.id, p_tipo_evento_id, p_turno_id, p_espaco_id, p_convidados);
  perform publico._limitar('iniciar', v_e.id, p_ip_hash, p_whatsapp_e164);

  -- Numeração sequencial e lead único por WhatsApp: uma transação por vez por empresa.
  perform pg_advisory_xact_lock(hashtextextended('orcamento:' || v_e.id::text, 0));

  select * into v_lead from public.leads l
  where l.empresa_id = v_e.id and l.eh_teste = v_teste and l.whatsapp_e164 = p_whatsapp_e164
  for update;

  if v_lead.id is null then
    insert into public.leads (
      empresa_id, nome, whatsapp_e164, origem, status, ultimo_passo, consentimento_em,
      consentimento_versao, consentimento_texto, eh_teste
    ) values (
      v_e.id, v_nome, p_whatsapp_e164, coalesce(p_origem, 'link_direto'), 'novo', 3, now(),
      btrim(p_consentimento_versao), btrim(p_consentimento_texto), v_teste
    ) returning * into v_lead;
    perform public._lead_aplicar_evento(v_lead.id, 'lead_criado', null, 'cliente', null,
      jsonb_build_object('origem', coalesce(p_origem, 'link_direto')));
  else
    update public.leads set
      consentimento_em = now(),
      consentimento_versao = btrim(p_consentimento_versao),
      consentimento_texto = btrim(p_consentimento_texto),
      ultimo_passo = greatest(coalesce(ultimo_passo, 0), 3)
    where id = v_lead.id;
    perform public._lead_aplicar_evento(v_lead.id, 'voltou', null, 'cliente', null,
      jsonb_build_object('nome_informado', v_nome, 'origem', coalesce(p_origem, 'link_direto')));
  end if;

  select coalesce(max(o.numero), 0) + 1 into v_numero
  from public.orcamentos o where o.empresa_id = v_e.id;
  v_token := publico._novo_token();

  insert into public.orcamentos (
    empresa_id, lead_id, numero, token, status, canal, origem, rascunho, passo_atual, eh_teste,
    tipo_evento_id, data, turno_id, espaco_id, convidados
  ) values (
    v_e.id, v_lead.id, v_numero, v_token, 'em_montagem', 'publico',
    coalesce(p_origem, 'link_direto'), coalesce(p_rascunho, '{}'::jsonb), 3, v_teste,
    p_tipo_evento_id, p_data, p_turno_id, p_espaco_id, p_convidados
  ) returning id into v_orc;

  perform public._lead_aplicar_evento(v_lead.id, 'orcamento_iniciado', v_orc, 'cliente', null,
    jsonb_build_object('numero', v_numero));
  return v_token;
end;
$$;

/** Guarda o rascunho e o passo (retomar no celular). Não mexe no resultado congelado. */
create or replace function publico.atualizar_rascunho(
  p_token text,
  p_rascunho jsonb,
  p_passo smallint,
  p_tipo_evento_id uuid,
  p_data date,
  p_turno_id uuid,
  p_espaco_id uuid,
  p_convidados integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orcamentos;
begin
  v_o := publico._orcamento(p_token);
  if v_o.status not in ('em_montagem', 'enviado', 'visualizado') then
    raise exception 'PUBLICO_ORCAMENTO_FECHADO' using errcode = 'check_violation';
  end if;
  if p_passo is null or p_passo not between 1 and 6 then
    raise exception 'PUBLICO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  perform publico._validar_escolhas(v_o.empresa_id, p_tipo_evento_id, p_turno_id, p_espaco_id, p_convidados);

  update public.orcamentos set
    rascunho = coalesce(p_rascunho, '{}'::jsonb), passo_atual = p_passo,
    tipo_evento_id = case when status = 'em_montagem' then p_tipo_evento_id else tipo_evento_id end,
    data = case when status = 'em_montagem' then p_data else data end,
    turno_id = case when status = 'em_montagem' then p_turno_id else turno_id end,
    espaco_id = case when status = 'em_montagem' then p_espaco_id else espaco_id end,
    convidados = case when status = 'em_montagem' then p_convidados else convidados end
  where id = v_o.id;
  update public.leads set
    ultimo_passo = greatest(coalesce(ultimo_passo, 0), p_passo), ultima_atividade_em = now()
  where id = v_o.lead_id;
end;
$$;

/**
 * Conclui o orçamento com o resultado CALCULADO PELO SERVIDOR (calcularOrcamento) e o congela.
 * Em montagem: congela este. Já enviado/visualizado (o cliente voltou e mudou algo): cria um
 * orçamento novo, marca o anterior como substituído e devolve o token novo.
 */
create or replace function publico.concluir_orcamento(
  p_token text,
  p_resultado jsonb,
  p_itens jsonb,
  p_total_centavos integer,
  p_validade_ate date,
  p_rascunho jsonb,
  p_tipo_evento_id uuid,
  p_data date,
  p_turno_id uuid,
  p_espaco_id uuid,
  p_convidados integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.orcamentos;
  v_id     uuid;
  v_token  text;
  v_numero integer;
begin
  v_o := publico._orcamento(p_token);
  if v_o.status not in ('em_montagem', 'enviado', 'visualizado') then
    raise exception 'PUBLICO_ORCAMENTO_FECHADO' using errcode = 'check_violation';
  end if;
  if p_resultado is null or jsonb_typeof(p_resultado) <> 'object'
     or p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 100
     or p_total_centavos is null or p_total_centavos < 0
     or p_validade_ate is null or p_validade_ate < publico._hoje(v_o.empresa_id)
     or p_tipo_evento_id is null or p_data is null or p_turno_id is null or p_espaco_id is null
     or p_convidados is null then
    raise exception 'PUBLICO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  perform publico._validar_escolhas(v_o.empresa_id, p_tipo_evento_id, p_turno_id, p_espaco_id, p_convidados);

  if v_o.status = 'em_montagem' then
    v_id := v_o.id;
    v_token := v_o.token;
    update public.orcamentos set
      status = 'enviado', enviado_em = now(), resultado = p_resultado,
      total_centavos = p_total_centavos, validade_ate = p_validade_ate,
      rascunho = coalesce(p_rascunho, rascunho), passo_atual = 6,
      tipo_evento_id = p_tipo_evento_id, data = p_data, turno_id = p_turno_id,
      espaco_id = p_espaco_id, convidados = p_convidados
    where id = v_id;
  else
    perform pg_advisory_xact_lock(hashtextextended('orcamento:' || v_o.empresa_id::text, 0));
    select coalesce(max(o.numero), 0) + 1 into v_numero
    from public.orcamentos o where o.empresa_id = v_o.empresa_id;
    v_token := publico._novo_token();
    insert into public.orcamentos (
      empresa_id, lead_id, numero, token, status, canal, origem, rascunho, passo_atual, resultado,
      total_centavos, validade_ate, eh_teste, tipo_evento_id, data, turno_id, espaco_id,
      convidados, enviado_em
    ) values (
      v_o.empresa_id, v_o.lead_id, v_numero, v_token, 'enviado', v_o.canal, v_o.origem,
      coalesce(p_rascunho, v_o.rascunho), 6, p_resultado, p_total_centavos, p_validade_ate,
      v_o.eh_teste, p_tipo_evento_id, p_data, p_turno_id, p_espaco_id, p_convidados, now()
    ) returning id into v_id;
    update public.orcamentos set status = 'substituido' where id = v_o.id;
  end if;

  insert into public.orcamento_itens (
    empresa_id, orcamento_id, ordem, tipo, descricao, quantidade, valor_unitario_centavos,
    subtotal_centavos, detalhe
  )
  select v_o.empresa_id, v_id, (i.ordem - 1)::smallint, (i.item ->> 'tipo')::public.tipo_item_orcamento,
         left(i.item ->> 'descricao', 200), (i.item ->> 'quantidade')::integer,
         (i.item ->> 'valorUnitarioCentavos')::integer, (i.item ->> 'subtotalCentavos')::integer,
         left(nullif(i.item ->> 'detalhe', ''), 500)
  from jsonb_array_elements(p_itens) with ordinality as i(item, ordem);

  update public.leads set ultimo_passo = 6 where id = v_o.lead_id;
  perform public._lead_aplicar_evento(v_o.lead_id, 'orcamento_concluido', v_id, 'cliente', null,
    jsonb_build_object('total_centavos', p_total_centavos, 'data', p_data));
  return v_token;
end;
$$;

/**
 * Proposta congelada pelo token, só dentro do buffet do slug. Marca "visualizado" e
 * "expirado" (validade vencida). Devolve só o primeiro nome do cliente.
 */
create or replace function publico.proposta(p_slug text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.orcamentos;
  v_e       public.empresas;
  v_hoje    date;
  v_reserva jsonb;
begin
  v_e := publico._empresa(p_slug);
  if v_e.id is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,}$' then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  select * into v_o from public.orcamentos o
  where o.token = p_token and o.empresa_id = v_e.id for update;
  if v_o.id is null or v_o.status = 'em_montagem' then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  v_hoje := publico._hoje(v_e.id);
  if v_o.status in ('enviado', 'visualizado') and v_o.validade_ate < v_hoje then
    update public.orcamentos set status = 'expirado' where id = v_o.id returning * into v_o;
  elsif v_o.status = 'enviado' then
    update public.orcamentos set status = 'visualizado', visualizado_em = now()
    where id = v_o.id returning * into v_o;
  end if;

  select jsonb_build_object('tipo', r.tipo, 'status', r.status, 'expira_em', r.expira_em)
    into v_reserva
  from public.reservas r
  where r.orcamento_id = v_o.id and r.status = 'ativa'
    and (r.tipo = 'confirmada' or r.expira_em > now())
  order by r.criado_em desc limit 1;

  return jsonb_build_object(
    'numero', v_o.numero,
    'status', v_o.status,
    'eh_teste', v_o.eh_teste,
    'enviado_em', v_o.enviado_em,
    'validade_ate', v_o.validade_ate,
    'hoje', v_hoje,
    'resultado', v_o.resultado,
    'total_centavos', v_o.total_centavos,
    'data', v_o.data,
    'convidados', v_o.convidados,
    'tipo_evento', (select t.nome from public.tipos_evento t where t.id = v_o.tipo_evento_id),
    'turno', (select jsonb_build_object('nome', t.nome, 'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'))
              from public.turnos t where t.id = v_o.turno_id),
    'espaco', (select x.nome from public.espacos x where x.id = v_o.espaco_id),
    'cliente_primeiro_nome', (select split_part(btrim(l.nome), ' ', 1) from public.leads l where l.id = v_o.lead_id),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'tipo', i.tipo, 'descricao', i.descricao, 'quantidade', i.quantidade,
        'valor_unitario_centavos', i.valor_unitario_centavos,
        'subtotal_centavos', i.subtotal_centavos, 'detalhe', i.detalhe) order by i.ordem)
      from public.orcamento_itens i where i.orcamento_id = v_o.id), '[]'),
    'reserva', v_reserva,
    'suspenso', v_e.plano = 'suspenso',
    'regras', (select jsonb_build_object(
        'prazo_pre_reserva_horas', r.prazo_pre_reserva_horas, 'sinal_bp', r.sinal_bp,
        'cancelamento_texto', r.cancelamento_texto)
      from public.regras_comerciais r where r.empresa_id = v_e.id)
  );
end;
$$;

/** Sugestões: até 3 datas livres no mesmo turno e espaço, nos 60 dias seguintes. */
create or replace function publico._sugestoes(
  p_empresa uuid, p_data date, p_turno_id uuid, p_espaco_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_minimo date;
  v_fuso   text;
  v_de     date;
begin
  select publico._hoje(p_empresa) + r.antecedencia_min_dias into v_minimo
  from public.regras_comerciais r where r.empresa_id = p_empresa;
  select e.fuso into v_fuso from public.empresas e where e.id = p_empresa;
  v_de := greatest(p_data + 1, v_minimo);
  return coalesce((
    select jsonb_agg(jsonb_build_object('data', s.data, 'turno_id', s.turno_id) order by s.data)
    from (
      select d.data, d.turno_id
      from public._disponibilidade(p_empresa, v_de, p_data + 60, p_espaco_id) d
      join public.turnos t on t.id = d.turno_id
      where d.turno_id = p_turno_id and d.estado = 'livre' and d.vagas > 0
        and ((d.data + t.hora_inicio) at time zone v_fuso) > now()
      order by d.data
      limit 3
    ) s
  ), '[]');
end;
$$;

/**
 * "Quero reservar esta data": pré-reserva com prazo, ligada ao lead e ao orçamento.
 * Conflito → { ok: false, codigo: 'SLOT_INDISPONIVEL', sugestoes }. Modo teste: valida tudo e
 * não grava reserva (simulada = true).
 */
create or replace function publico.pre_reservar(p_token text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.orcamentos;
  v_lead     public.leads;
  v_regras   public.regras_comerciais;
  v_hoje     date;
  v_livre    boolean;
  v_reserva  public.reservas;
  v_id       uuid;
  v_anterior record;
begin
  v_o := publico._orcamento(p_token);
  select * into v_lead from public.leads l where l.id = v_o.lead_id;
  select * into v_regras from public.regras_comerciais r where r.empresa_id = v_o.empresa_id;
  v_hoje := publico._hoje(v_o.empresa_id);

  -- Duplo clique: já pré-reservado por este orçamento → devolve a mesma.
  if v_o.status = 'aceito' then
    select * into v_reserva from public.reservas r
    where r.orcamento_id = v_o.id and r.status = 'ativa'
      and (r.tipo = 'confirmada' or r.expira_em > now())
    order by r.criado_em desc limit 1;
    if v_reserva.id is not null then
      return jsonb_build_object('ok', true, 'simulada', false, 'expira_em', v_reserva.expira_em,
        'sinal_centavos', coalesce((v_o.resultado ->> 'sinalCentavos')::integer, 0),
        'total_centavos', v_o.total_centavos, 'numero', v_o.numero);
    end if;
  end if;
  if v_o.status not in ('enviado', 'visualizado') then
    raise exception 'PUBLICO_ORCAMENTO_FECHADO' using errcode = 'check_violation';
  end if;
  if v_o.validade_ate < v_hoje then
    update public.orcamentos set status = 'expirado' where id = v_o.id;
    -- O status precisa persistir: devolve o erro sem desfazer a transação.
    return jsonb_build_object('ok', false, 'codigo', 'ORCAMENTO_EXPIRADO');
  end if;

  perform publico._limitar('pre_reserva', v_o.empresa_id, p_ip_hash, v_lead.whatsapp_e164);
  perform public._agenda_travar(v_o.empresa_id);

  if v_o.data < v_hoje + v_regras.antecedencia_min_dias then
    return jsonb_build_object('ok', false, 'codigo', 'SLOT_INDISPONIVEL', 'sugestoes',
      publico._sugestoes(v_o.empresa_id, v_o.data, v_o.turno_id, v_o.espaco_id));
  end if;

  select coalesce(bool_or(d.disponivel), false) into v_livre
  from publico.disponibilidade(
    (select e.slug from public.empresas e where e.id = v_o.empresa_id),
    v_o.data, v_o.data, v_o.espaco_id) d
  where d.turno_id = v_o.turno_id;
  if not v_livre then
    return jsonb_build_object('ok', false, 'codigo', 'SLOT_INDISPONIVEL', 'sugestoes',
      publico._sugestoes(v_o.empresa_id, v_o.data, v_o.turno_id, v_o.espaco_id));
  end if;

  if v_o.eh_teste then
    return jsonb_build_object('ok', true, 'simulada', true,
      'expira_em', now() + make_interval(hours => v_regras.prazo_pre_reserva_horas),
      'sinal_centavos', coalesce((v_o.resultado ->> 'sinalCentavos')::integer, 0),
      'total_centavos', v_o.total_centavos, 'numero', v_o.numero);
  end if;

  -- Uma pré-reserva ativa por lead: a anterior vinda do link é liberada.
  for v_anterior in
    select r.id, r.data, r.orcamento_id from public.reservas r
    where r.lead_id = v_lead.id and r.status = 'ativa' and r.tipo = 'pre_reserva'
      and r.origem = 'link_publico' and r.expira_em > now()
    for update
  loop
    update public.reservas set
      status = 'cancelada', cancelada_em = now(),
      motivo_cancelamento = 'cliente escolheu outra data'
    where id = v_anterior.id;
    perform public._lead_aplicar_evento(v_lead.id, 'pre_reserva_cancelada', v_anterior.orcamento_id,
      'cliente', null, jsonb_build_object('reserva_id', v_anterior.id, 'data', v_anterior.data,
                                          'motivo', 'cliente escolheu outra data'));
  end loop;

  v_id := public._criar_reserva_core(
    v_o.empresa_id, v_o.espaco_id, v_o.turno_id, v_o.data, 'pre_reserva', v_lead.nome,
    v_lead.whatsapp_e164, v_o.tipo_evento_id, v_o.convidados, v_o.total_centavos, null, null,
    'Pré-reserva pelo link (orçamento nº ' || v_o.numero || ').', 'link_publico', v_lead.id,
    v_o.id, null);
  select * into v_reserva from public.reservas r where r.id = v_id;

  update public.orcamentos set status = 'aceito', aceito_em = now() where id = v_o.id;
  perform public._lead_aplicar_evento(v_lead.id, 'pre_reserva_pedida', v_o.id, 'cliente', null,
    jsonb_build_object('reserva_id', v_id, 'data', v_o.data, 'expira_em', v_reserva.expira_em));

  return jsonb_build_object('ok', true, 'simulada', false, 'expira_em', v_reserva.expira_em,
    'sinal_centavos', coalesce((v_o.resultado ->> 'sinalCentavos')::integer, 0),
    'total_centavos', v_o.total_centavos, 'numero', v_o.numero);
end;
$$;

/** "Quero visitar": registra o pedido (a agenda de visitas fica para depois). */
create or replace function publico.solicitar_visita(
  p_token text, p_data_preferida date, p_periodo public.periodo_visita, p_observacoes text,
  p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o    public.orcamentos;
  v_wpp  text;
begin
  v_o := publico._orcamento(p_token);
  if v_o.status in ('em_montagem', 'substituido') then
    raise exception 'PUBLICO_ORCAMENTO_FECHADO' using errcode = 'check_violation';
  end if;
  if p_data_preferida is null or p_data_preferida < publico._hoje(v_o.empresa_id)
     or p_data_preferida > publico._hoje(v_o.empresa_id) + 365 or p_periodo is null
     or char_length(coalesce(p_observacoes, '')) > 500 then
    raise exception 'PUBLICO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  select l.whatsapp_e164 into v_wpp from public.leads l where l.id = v_o.lead_id;
  perform publico._limitar('visita', v_o.empresa_id, p_ip_hash, v_wpp);

  insert into public.visitas (empresa_id, lead_id, orcamento_id, data_preferida, periodo, observacoes)
  values (v_o.empresa_id, v_o.lead_id, v_o.id, p_data_preferida, p_periodo,
          nullif(btrim(coalesce(p_observacoes, '')), ''));
  perform public._lead_aplicar_evento(v_o.lead_id, 'visita_pedida', v_o.id, 'cliente', null,
    jsonb_build_object('data_preferida', p_data_preferida, 'periodo', p_periodo));
end;
$$;

/** Atividades que o cliente pode registrar (hoje só o clique no WhatsApp). */
create or replace function publico.registrar_atividade(p_token text, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orcamentos;
begin
  if p_tipo is distinct from 'whatsapp_clicado' then
    raise exception 'PUBLICO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  v_o := publico._orcamento(p_token);
  -- Sem inundar a linha do tempo: no máximo 10 cliques por orçamento por hora.
  if (select count(*) from public.atividades a
      where a.orcamento_id = v_o.id and a.tipo = 'whatsapp_clicado'
        and a.criado_em > now() - interval '1 hour') >= 10 then
    return;
  end if;
  perform public._lead_aplicar_evento(v_o.lead_id, 'whatsapp_clicado', v_o.id, 'cliente');
end;
$$;

/** Funil do wizard (sem dado pessoal). Modo teste e excesso são ignorados em silêncio. */
create or replace function publico.registrar_funil(
  p_slug text, p_sessao uuid, p_passo smallint, p_evento public.evento_funil,
  p_origem public.origem_lead, p_ip_hash text, p_teste boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.empresas;
begin
  v_e := publico._empresa(p_slug);
  if v_e.id is null or v_e.plano = 'suspenso' or coalesce(p_teste, false)
     or p_sessao is null or p_passo is null or p_passo not between 0 and 6 or p_evento is null then
    return;
  end if;
  if not publico._limitar('funil', v_e.id, p_ip_hash, null, true) then
    return;
  end if;
  insert into public.funil_eventos (empresa_id, sessao, passo, evento, origem)
  values (v_e.id, p_sessao, p_passo, p_evento, coalesce(p_origem, 'link_direto'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: helpers fechados; funções públicas só para anon.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'publico'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
    if left(f.proname, 1) <> '_' then
      execute format('grant execute on function %s to anon', f.assinatura);
    end if;
  end loop;
end;
$$;
