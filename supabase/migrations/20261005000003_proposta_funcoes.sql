-- Etapa 5 · Funções da proposta: versões, orçamento interno, rastreio de aberturas e expiração.
--
-- Mesmo padrão das etapas anteriores: security definer, search_path vazio, códigos estáveis.
-- O resultado congelado e o conteúdo da versão são calculados pelo servidor (calcularOrcamento e
-- domain/proposta); o banco revalida empresa, perfil, estado, limites e o desconto do vendedor.
-- Assinaturas usadas pelo código da Etapa 4 continuam existindo (só o comportamento evolui).

-- ---------------------------------------------------------------------------
-- Regras puras (espelhos em src/domain, com teste de equivalência)
-- ---------------------------------------------------------------------------
create or replace function public._lead_transicao(
  p_status public.status_lead, p_temperatura public.temperatura_lead, p_evento text,
  out status public.status_lead, out temperatura public.temperatura_lead
)
language sql
immutable
set search_path = ''
as $$
  select
    (case p_evento
      when 'lead_criado' then 'novo'
      when 'voltou' then
        case when p_status in ('abandonou', 'frio', 'novo', 'perdido', 'cancelado', 'realizado')
             then 'em_andamento' else p_status::text end
      when 'orcamento_concluido' then
        case when p_status in ('pre_reservado', 'reservado') then p_status::text
             else 'em_andamento' end
      when 'orcamento_criado' then
        case when p_status in ('pre_reservado', 'reservado') then p_status::text
             else 'em_andamento' end
      when 'versao_criada' then
        case when p_status in ('pre_reservado', 'reservado') then p_status::text
             else 'em_andamento' end
      when 'pre_reserva_pedida' then
        case when p_status = 'reservado' then 'reservado' else 'pre_reservado' end
      when 'pre_reserva_vencida' then
        case when p_status = 'pre_reservado' then 'em_andamento' else p_status::text end
      when 'pre_reserva_cancelada' then
        case when p_status = 'pre_reservado' then 'em_andamento' else p_status::text end
      when 'reserva_confirmada' then 'reservado'
      when 'reserva_cancelada' then
        case when p_status = 'reservado' then 'cancelado' else p_status::text end
      when 'realizada' then 'realizado'
      when 'abandonou' then
        case when p_status = 'novo' then 'abandonou' else p_status::text end
      when 'orcamento_expirado' then
        case when p_status = 'em_andamento' then 'frio' else p_status::text end
      else p_status::text
    end)::public.status_lead,
    (case
      when p_evento in ('pre_reserva_pedida', 'visita_pedida') then 'quente'
      when p_evento in ('orcamento_concluido', 'orcamento_criado', 'versao_criada')
           and p_temperatura <> 'quente' then 'morno'
      else p_temperatura::text
    end)::public.temperatura_lead;
$$;

/** Reabriu a proposta 2 vezes ou mais nos últimos 3 dias = quente (espelho: domain/proposta/temperatura). */
create or replace function public._temperatura_aberturas(
  p_instantes timestamptz[], p_agora timestamptz, p_atual public.temperatura_lead
)
returns public.temperatura_lead
language sql
immutable
set search_path = ''
as $$
  select case
    when (select count(*) from unnest(coalesce(p_instantes, '{}')) i
          where i > p_agora - interval '3 days' and i <= p_agora) >= 2 then 'quente'
    else p_atual
  end::public.temperatura_lead;
$$;

-- _lead_aplicar_evento mapeia eventos para o tipo de atividade; os novos eventos usam o próprio nome.
create or replace function public._lead_aplicar_evento(
  p_lead uuid,
  p_evento text,
  p_orcamento uuid default null,
  p_autor public.autor_atividade default 'sistema',
  p_usuario uuid default null,
  p_dados jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead  public.leads%rowtype;
  v_novo  record;
  v_tipo  public.tipo_atividade;
  v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
begin
  select * into v_lead from public.leads l where l.id = p_lead for update;
  if v_lead.id is null then
    return;
  end if;
  select * into v_novo from public._lead_transicao(v_lead.status, v_lead.temperatura, p_evento);

  v_tipo := case p_evento
    when 'pre_reserva_cancelada' then 'reserva_cancelada'
    when 'realizada' then 'status_alterado'
    when 'abandonou' then 'status_alterado'
    else p_evento
  end::public.tipo_atividade;

  if v_novo.status <> v_lead.status then
    v_dados := v_dados || jsonb_build_object('status_antes', v_lead.status, 'status_depois', v_novo.status);
  end if;

  update public.leads set
    status = v_novo.status,
    temperatura = v_novo.temperatura,
    ultima_atividade_em = case when p_autor = 'sistema' then ultima_atividade_em else now() end
  where id = p_lead;

  insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, usuario_id)
  values (v_lead.empresa_id, p_lead, p_orcamento, v_tipo, v_dados, p_autor, p_usuario);
end;
$$;

-- ---------------------------------------------------------------------------
-- Versão vigente e expiração
-- ---------------------------------------------------------------------------

/** Versão vigente do mesmo número (a mais recente não substituída). */
create or replace function public._orcamento_vigente(p_empresa uuid, p_numero integer)
returns public.orcamentos
language sql
stable
security definer
set search_path = ''
as $$
  select o.* from public.orcamentos o
  where o.empresa_id = p_empresa and o.numero = p_numero and o.status <> 'substituido'
  order by o.versao desc limit 1;
$$;

/** Marca a versão como expirada e aplica o evento no lead (em andamento → frio). */
create or replace function public._orcamento_expirar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orcamentos;
begin
  update public.orcamentos set status = 'expirado'
  where id = p_id and status in ('enviado', 'visualizado')
  returning * into v_o;
  if v_o.id is not null then
    perform public._lead_aplicar_evento(v_o.lead_id, 'orcamento_expirado', v_o.id, 'sistema', null,
      jsonb_build_object('numero', v_o.numero, 'versao', v_o.versao, 'validade_ate', v_o.validade_ate));
  end if;
end;
$$;

create or replace function public.expirar_orcamentos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_id    uuid;
begin
  for v_id in
    select o.id from public.orcamentos o
    join public.empresas e on e.id = o.empresa_id
    where o.status in ('enviado', 'visualizado')
      and o.validade_ate < (now() at time zone e.fuso)::date
    for update of o
  loop
    perform public._orcamento_expirar(v_id);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Núcleo: concluir a versão de partida (em montagem) ou criar uma versão nova
-- ---------------------------------------------------------------------------
create or replace function public._orcamento_concluir(
  p_base public.orcamentos,
  p_resultado jsonb,
  p_itens jsonb,
  p_total integer,
  p_validade date,
  p_rascunho jsonb,
  p_tipo_evento_id uuid,
  p_data date,
  p_turno_id uuid,
  p_espaco_id uuid,
  p_convidados integer,
  p_pacote_id uuid,
  p_conteudo jsonb,
  p_observacoes text,
  p_observacoes_internas text,
  p_desconto_motivo text,
  p_fora_antecedencia boolean,
  p_autor public.autor_atividade,
  p_usuario uuid
)
returns public.orcamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_novo    public.orcamentos;
  v_versao  integer;
  v_reserva public.reservas;
  v_mudou   boolean;
  v_lead    public.leads;
  v_res_id  uuid;
begin
  if p_resultado is null or jsonb_typeof(p_resultado) <> 'object'
     or p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 100
     or p_total is null or p_total < 0
     or p_validade is null or p_validade < publico._hoje(p_base.empresa_id)
     or p_tipo_evento_id is null or p_data is null or p_turno_id is null or p_espaco_id is null
     or p_convidados is null
     or (p_conteudo is not null and jsonb_typeof(p_conteudo) <> 'object') then
    raise exception 'ORCAMENTO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  perform publico._validar_escolhas(p_base.empresa_id, p_tipo_evento_id, p_turno_id, p_espaco_id, p_convidados);
  if p_pacote_id is not null and not exists (
    select 1 from public.pacotes p where p.id = p_pacote_id and p.empresa_id = p_base.empresa_id
  ) then
    raise exception 'ORCAMENTO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;

  -- Numeração e versões: uma transação por vez por empresa (a agenda também trava a empresa).
  perform pg_advisory_xact_lock(hashtextextended('orcamento:' || p_base.empresa_id::text, 0));
  perform public._agenda_travar(p_base.empresa_id);

  if p_base.status = 'em_montagem' then
    update public.orcamentos set
      status = 'enviado', enviado_em = now(), resultado = p_resultado, total_centavos = p_total,
      validade_ate = p_validade, rascunho = coalesce(p_rascunho, rascunho), passo_atual = 6,
      tipo_evento_id = p_tipo_evento_id, data = p_data, turno_id = p_turno_id,
      espaco_id = p_espaco_id, convidados = p_convidados, pacote_id = p_pacote_id,
      conteudo = p_conteudo, observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
      observacoes_internas = nullif(btrim(coalesce(p_observacoes_internas, '')), ''),
      desconto_motivo = nullif(btrim(coalesce(p_desconto_motivo, '')), ''),
      fora_antecedencia = coalesce(p_fora_antecedencia, false)
    where id = p_base.id
    returning * into v_novo;
  else
    if p_base.status = 'substituido' then
      raise exception 'ORCAMENTO_VERSAO_ANTIGA' using errcode = 'check_violation';
    end if;
    select coalesce(max(o.versao), 0) + 1 into v_versao
    from public.orcamentos o where o.empresa_id = p_base.empresa_id and o.numero = p_base.numero;

    -- A anterior deixa de ser vigente antes da nova nascer (índice de uma vigente por número).
    update public.orcamentos set status = 'substituido' where id = p_base.id;
    insert into public.orcamentos (
      empresa_id, lead_id, numero, versao, token, status, canal, origem, rascunho, passo_atual,
      resultado, total_centavos, validade_ate, eh_teste, tipo_evento_id, data, turno_id,
      espaco_id, convidados, enviado_em, criado_por, observacoes, observacoes_internas,
      desconto_motivo, fora_antecedencia, conteudo, pacote_id
    ) values (
      p_base.empresa_id, p_base.lead_id, p_base.numero, v_versao, publico._novo_token(), 'enviado',
      p_base.canal, p_base.origem, coalesce(p_rascunho, p_base.rascunho), 6, p_resultado, p_total,
      p_validade, p_base.eh_teste, p_tipo_evento_id, p_data, p_turno_id, p_espaco_id,
      p_convidados, now(), coalesce(p_base.criado_por, p_usuario),
      nullif(btrim(coalesce(p_observacoes, '')), ''),
      nullif(btrim(coalesce(p_observacoes_internas, '')), ''),
      nullif(btrim(coalesce(p_desconto_motivo, '')), ''), coalesce(p_fora_antecedencia, false),
      p_conteudo, p_pacote_id
    ) returning * into v_novo;

    -- Reserva da versão anterior (pré-reserva ou confirmada ainda ativa)
    select * into v_reserva from public.reservas r
    where r.orcamento_id = p_base.id and r.status = 'ativa'
      and (r.tipo = 'confirmada' or r.expira_em > now())
    order by r.criado_em desc limit 1
    for update;
    if v_reserva.id is not null then
      v_mudou := v_reserva.data is distinct from p_data
              or v_reserva.turno_id is distinct from p_turno_id
              or v_reserva.espaco_id is distinct from p_espaco_id;
      if not v_mudou then
        update public.reservas set
          orcamento_id = v_novo.id, convidados = p_convidados, valor_total_centavos = p_total
        where id = v_reserva.id;
        update public.orcamentos set status = 'aceito', aceito_em = coalesce(p_base.aceito_em, now())
        where id = v_novo.id returning * into v_novo;
      elsif v_reserva.tipo = 'confirmada' then
        raise exception 'ORCAMENTO_RESERVA_CONFIRMADA' using errcode = 'check_violation';
      else
        -- Troca atômica: libera a antiga e cria a nova; se o slot novo não estiver livre, a
        -- função de reserva recusa e NADA muda (a pré-reserva antiga continua).
        update public.reservas set
          status = 'cancelada', cancelada_em = now(), cancelada_por = p_usuario,
          motivo_cancelamento = 'orçamento alterado (versão ' || v_versao || ')'
        where id = v_reserva.id;
        select * into v_lead from public.leads l where l.id = p_base.lead_id;
        v_res_id := public._criar_reserva_core(
          p_base.empresa_id, p_espaco_id, p_turno_id, p_data, 'pre_reserva', v_lead.nome,
          v_lead.whatsapp_e164, p_tipo_evento_id, p_convidados, p_total, null, null,
          'Pré-reserva movida pela versão ' || v_versao || ' do orçamento nº ' || p_base.numero || '.',
          v_reserva.origem, v_lead.id, v_novo.id, p_usuario);
        update public.orcamentos set status = 'aceito', aceito_em = now()
        where id = v_novo.id returning * into v_novo;
        perform public._lead_aplicar_evento(v_lead.id, 'pre_reserva_cancelada', p_base.id, p_autor,
          p_usuario, jsonb_build_object('reserva_id', v_reserva.id, 'data', v_reserva.data,
                                        'tipo', 'pre_reserva', 'motivo', 'orçamento alterado'));
        perform public._lead_aplicar_evento(v_lead.id, 'pre_reserva_pedida', v_novo.id, p_autor,
          p_usuario, jsonb_build_object('reserva_id', v_res_id, 'data', p_data));
      end if;
    end if;
  end if;

  insert into public.orcamento_itens (
    empresa_id, orcamento_id, ordem, tipo, descricao, quantidade, valor_unitario_centavos,
    subtotal_centavos, detalhe, referencia_id
  )
  select v_novo.empresa_id, v_novo.id, (i.ordem - 1)::smallint,
         (i.item ->> 'tipo')::public.tipo_item_orcamento, left(i.item ->> 'descricao', 200),
         (i.item ->> 'quantidade')::integer, (i.item ->> 'valorUnitarioCentavos')::integer,
         (i.item ->> 'subtotalCentavos')::integer, left(nullif(i.item ->> 'detalhe', ''), 500),
         case when i.item ->> 'referenciaId' ~ '^[0-9a-f-]{36}$'
              then (i.item ->> 'referenciaId')::uuid end
  from jsonb_array_elements(p_itens) with ordinality as i(item, ordem);

  update public.leads set ultimo_passo = 6 where id = v_novo.lead_id;
  perform public._lead_aplicar_evento(v_novo.lead_id,
    case when v_novo.versao > 1 then 'versao_criada'
         when v_novo.canal = 'interno' then 'orcamento_criado'
         else 'orcamento_concluido' end,
    v_novo.id, p_autor, p_usuario,
    jsonb_build_object('numero', v_novo.numero, 'versao', v_novo.versao,
                       'total_centavos', p_total, 'data', p_data));
  return v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pré-reserva a partir de uma versão (link público e painel)
-- ---------------------------------------------------------------------------
create or replace function public._orcamento_pre_reservar(
  p_o public.orcamentos, p_origem public.origem_reserva, p_autor public.autor_atividade,
  p_usuario uuid
)
returns public.reservas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead     public.leads;
  v_anterior record;
  v_id       uuid;
  v_reserva  public.reservas;
begin
  perform public._agenda_travar(p_o.empresa_id);
  select * into v_lead from public.leads l where l.id = p_o.lead_id;

  -- Uma pré-reserva ativa por lead: a anterior vinda do link ou de orçamento é liberada.
  -- Pré-reservas manuais do dono nunca são tocadas (o WhatsApp não é verificado).
  for v_anterior in
    select r.id, r.data, r.orcamento_id from public.reservas r
    where r.lead_id = v_lead.id and r.status = 'ativa' and r.tipo = 'pre_reserva'
      and r.origem in ('link_publico', 'orcamento') and r.expira_em > now()
    for update
  loop
    update public.reservas set
      status = 'cancelada', cancelada_em = now(), cancelada_por = p_usuario,
      motivo_cancelamento = 'cliente escolheu outra data'
    where id = v_anterior.id;
    perform public._lead_aplicar_evento(v_lead.id, 'pre_reserva_cancelada', v_anterior.orcamento_id,
      p_autor, p_usuario, jsonb_build_object('reserva_id', v_anterior.id, 'data', v_anterior.data,
                                              'motivo', 'cliente escolheu outra data'));
  end loop;

  v_id := public._criar_reserva_core(
    p_o.empresa_id, p_o.espaco_id, p_o.turno_id, p_o.data, 'pre_reserva', v_lead.nome,
    v_lead.whatsapp_e164, p_o.tipo_evento_id, p_o.convidados, p_o.total_centavos, null, null,
    case when p_origem = 'link_publico'
         then 'Pré-reserva pelo link (orçamento nº ' || p_o.numero || ').'
         else 'Pré-reserva do orçamento nº ' || p_o.numero || ' (versão ' || p_o.versao || ').' end,
    p_origem, v_lead.id, p_o.id, p_usuario);
  select * into v_reserva from public.reservas r where r.id = v_id;

  update public.orcamentos set status = 'aceito', aceito_em = now() where id = p_o.id;
  perform public._lead_aplicar_evento(v_lead.id, 'pre_reserva_pedida', p_o.id, p_autor, p_usuario,
    jsonb_build_object('reserva_id', v_id, 'data', p_o.data, 'expira_em', v_reserva.expira_em));
  return v_reserva;
end;
$$;

-- ---------------------------------------------------------------------------
-- Painel (dono e vendedor)
-- ---------------------------------------------------------------------------

/**
 * Orçamento interno: cria (ou reaproveita) o lead pelo WhatsApp e grava a versão 1, ou cria
 * uma versão nova de um orçamento existente. O resultado vem calculado pelo servidor; aqui o
 * desconto é conferido contra o limite do vendedor (o dono não tem limite).
 */
create or replace function public.salvar_orcamento_interno(
  p_orcamento_id uuid,
  p_whatsapp_e164 text,
  p_nome text,
  p_origem public.origem_lead,
  p_resultado jsonb,
  p_itens jsonb,
  p_total_centavos integer,
  p_validade_ate date,
  p_rascunho jsonb,
  p_tipo_evento_id uuid,
  p_data date,
  p_turno_id uuid,
  p_espaco_id uuid,
  p_convidados integer,
  p_pacote_id uuid,
  p_conteudo jsonb,
  p_observacoes text,
  p_observacoes_internas text,
  p_desconto_motivo text,
  p_fora_antecedencia boolean
)
returns table (id uuid, token text, numero integer, versao integer, lead_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa  uuid := public._agenda_exigir_usuario();
  v_perfil   public.perfil_usuario := public.perfil_do_usuario();
  v_limite   numeric;
  v_desconto integer := coalesce((p_resultado ->> 'descontoCentavos')::integer, 0);
  v_subtotal integer := coalesce((p_resultado ->> 'subtotalCentavos')::integer, 0);
  v_base     public.orcamentos;
  v_lead     public.leads;
  v_nome     text := btrim(coalesce(p_nome, ''));
  v_numero   integer;
  v_o        public.orcamentos;
begin
  -- Limite de desconto do usuário (no banco também, não só no servidor)
  if v_desconto > 0 and v_perfil <> 'dono' then
    select u.limite_desconto_pct into v_limite from public.usuarios u where u.id = auth.uid();
    if v_subtotal <= 0 or v_desconto::numeric * 10000 > round(coalesce(v_limite, 0) * 100) * v_subtotal then
      raise exception 'ORCAMENTO_DESCONTO_ACIMA_LIMITE' using errcode = 'check_violation';
    end if;
  end if;

  if p_orcamento_id is not null then
    select * into v_base from public.orcamentos o
    where o.id = p_orcamento_id and o.empresa_id = v_empresa for update;
    if v_base.id is null then
      raise exception 'ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
    end if;
  else
    if char_length(v_nome) not between 2 and 120
       or p_whatsapp_e164 is null or p_whatsapp_e164 !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'ORCAMENTO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('orcamento:' || v_empresa::text, 0));
    select * into v_lead from public.leads l
    where l.empresa_id = v_empresa and l.eh_teste = false and l.whatsapp_e164 = p_whatsapp_e164
    for update;
    if v_lead.id is null then
      insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status)
      values (v_empresa, v_nome, p_whatsapp_e164, coalesce(p_origem, 'outro'), 'novo')
      returning * into v_lead;
      perform public._lead_aplicar_evento(v_lead.id, 'lead_criado', null, 'usuario', auth.uid(),
        jsonb_build_object('origem', coalesce(p_origem, 'outro'), 'canal', 'interno'));
    else
      perform public._lead_aplicar_evento(v_lead.id, 'voltou', null, 'usuario', auth.uid(),
        jsonb_build_object('canal', 'interno'));
    end if;
    select coalesce(max(o.numero), 0) + 1 into v_numero from public.orcamentos o where o.empresa_id = v_empresa;
    insert into public.orcamentos (
      empresa_id, lead_id, numero, token, status, canal, origem, rascunho, passo_atual, criado_por
    ) values (
      v_empresa, v_lead.id, v_numero, publico._novo_token(), 'em_montagem', 'interno',
      coalesce(p_origem, 'outro'), '{}'::jsonb, 6, auth.uid()
    ) returning * into v_base;
  end if;

  v_o := public._orcamento_concluir(
    v_base, p_resultado, p_itens, p_total_centavos, p_validade_ate, p_rascunho, p_tipo_evento_id,
    p_data, p_turno_id, p_espaco_id, p_convidados, p_pacote_id, p_conteudo, p_observacoes,
    p_observacoes_internas, p_desconto_motivo, p_fora_antecedencia, 'usuario', auth.uid());

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(),
    case when v_o.versao > 1 then 'orcamento.versao_criada' else 'orcamento.criado' end,
    'orcamento', v_o.id,
    jsonb_build_object('numero', v_o.numero, 'versao', v_o.versao, 'total_centavos', v_o.total_centavos,
                       'desconto_centavos', v_desconto));

  return query select v_o.id, v_o.token, v_o.numero, v_o.versao, v_o.lead_id;
end;
$$;

/** Pré-reserva a partir de um orçamento (painel). Aceita data dentro da antecedência se marcado. */
create or replace function public.pre_reservar_orcamento(p_orcamento_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._agenda_exigir_usuario();
  v_o       public.orcamentos;
  v_hoje    date;
  v_antec   integer;
  v_reserva public.reservas;
begin
  select * into v_o from public.orcamentos o
  where o.id = p_orcamento_id and o.empresa_id = v_empresa for update;
  if v_o.id is null then
    raise exception 'ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  if v_o.status not in ('enviado', 'visualizado') then
    raise exception 'ORCAMENTO_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  v_hoje := publico._hoje(v_empresa);
  if v_o.validade_ate < v_hoje then
    raise exception 'ORCAMENTO_EXPIRADO' using errcode = 'check_violation';
  end if;
  select r.antecedencia_min_dias into v_antec from public.regras_comerciais r where r.empresa_id = v_empresa;
  if v_o.data < v_hoje + v_antec and not v_o.fora_antecedencia then
    raise exception 'ORCAMENTO_ANTECEDENCIA' using errcode = 'check_violation';
  end if;
  if v_o.eh_teste then
    raise exception 'ORCAMENTO_TESTE' using errcode = 'check_violation';
  end if;
  v_reserva := public._orcamento_pre_reservar(v_o, 'orcamento', 'usuario', auth.uid());
  return v_reserva.expira_em;
end;
$$;

/** "Proposta enviada" pelo WhatsApp, link copiado ou PDF baixado. */
create or replace function public.marcar_orcamento_enviado(p_orcamento_id uuid, p_canal text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._agenda_exigir_usuario();
  v_o       public.orcamentos;
begin
  if p_canal is null or p_canal not in ('whatsapp', 'link', 'pdf') then
    raise exception 'ORCAMENTO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  update public.orcamentos set canal_envio = p_canal
  where id = p_orcamento_id and empresa_id = v_empresa
  returning * into v_o;
  if v_o.id is null then
    raise exception 'ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  perform public._lead_aplicar_evento(v_o.lead_id, 'proposta_enviada', v_o.id, 'usuario', auth.uid(),
    jsonb_build_object('canal', p_canal, 'numero', v_o.numero, 'versao', v_o.versao));
end;
$$;

-- ---------------------------------------------------------------------------
-- Schema publico
-- ---------------------------------------------------------------------------

/**
 * Orçamento pelo token, sempre resolvido para a versão VIGENTE do mesmo número, só dentro do
 * buffet do slug (trava a linha). Quem tem o token de qualquer versão é o mesmo cliente.
 */
create or replace function publico._orcamento(p_slug text, p_token text)
returns public.orcamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.orcamentos;
  v_o      public.orcamentos;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,}$' then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  select o.* into v_pedido from public.orcamentos o
  join public.empresas e on e.id = o.empresa_id
  where o.token = p_token and e.slug = lower(btrim(coalesce(p_slug, '')));
  if v_pedido.id is null then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.empresas e where e.id = v_pedido.empresa_id and e.plano = 'suspenso') then
    raise exception 'PUBLICO_SUSPENSO' using errcode = 'insufficient_privilege';
  end if;
  select o.* into v_o from public.orcamentos o
  where o.empresa_id = v_pedido.empresa_id and o.numero = v_pedido.numero and o.status <> 'substituido'
  order by o.versao desc limit 1
  for update;
  return coalesce(v_o, v_pedido);
end;
$$;

/** Estado do orçamento vigente (retomar o wizard). Null se o token não existir neste buffet. */
create or replace function publico.estado_orcamento(p_slug text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pedido public.orcamentos;
  v_o      public.orcamentos;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,}$' then
    return null;
  end if;
  select o.* into v_pedido from public.orcamentos o
  join public.empresas e on e.id = o.empresa_id
  where o.token = p_token and e.slug = lower(btrim(coalesce(p_slug, ''))) and e.plano <> 'suspenso';
  if v_pedido.id is null then
    return null;
  end if;
  v_o := public._orcamento_vigente(v_pedido.empresa_id, v_pedido.numero);
  v_o := coalesce(v_o, v_pedido);
  return jsonb_build_object(
    'status', case when v_o.status in ('enviado', 'visualizado')
                        and v_o.validade_ate < publico._hoje(v_o.empresa_id)
                   then 'expirado' else v_o.status::text end,
    'passo_atual', v_o.passo_atual, 'rascunho', v_o.rascunho, 'eh_teste', v_o.eh_teste,
    'numero', v_o.numero, 'versao', v_o.versao, 'token', v_o.token,
    -- o próprio cliente (dono do token) vê o próprio nome na abertura da proposta
    'cliente_nome', (select btrim(l.nome) from public.leads l where l.id = v_o.lead_id),
    'observacoes', v_o.observacoes);
end;
$$;

/**
 * Conclui (wizard) ou cria versão nova do orçamento, com o resultado e o conteúdo CALCULADOS
 * PELO SERVIDOR. Aceita proposta expirada (o cliente refaz com os preços de hoje).
 */
create or replace function publico.concluir_versao(
  p_slug text,
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
  p_convidados integer,
  p_pacote_id uuid,
  p_conteudo jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orcamentos;
begin
  v_o := publico._orcamento(p_slug, p_token);
  if v_o.status not in ('em_montagem', 'enviado', 'visualizado', 'expirado') then
    raise exception 'PUBLICO_ORCAMENTO_FECHADO' using errcode = 'check_violation';
  end if;
  if p_validade_ate is null or p_validade_ate < publico._hoje(v_o.empresa_id) then
    raise exception 'PUBLICO_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  v_o := public._orcamento_concluir(
    v_o, p_resultado, p_itens, p_total_centavos, p_validade_ate, p_rascunho, p_tipo_evento_id,
    p_data, p_turno_id, p_espaco_id, p_convidados, p_pacote_id, p_conteudo,
    v_o.observacoes, v_o.observacoes_internas, v_o.desconto_motivo, false, 'cliente', null);
  return v_o.token;
end;
$$;

-- Assinatura da Etapa 4 (o app anterior continua chamando esta durante o deploy).
create or replace function publico.concluir_orcamento(
  p_slug text,
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
begin
  return publico.concluir_versao(
    p_slug, p_token, p_resultado, p_itens, p_total_centavos, p_validade_ate, p_rascunho,
    p_tipo_evento_id, p_data, p_turno_id, p_espaco_id, p_convidados,
    (select (l ->> 'referenciaId')::uuid from jsonb_array_elements(coalesce(p_resultado -> 'linhas', '[]')) l
     where l ->> 'tipo' = 'pacote' and l ->> 'referenciaId' ~ '^[0-9a-f-]{36}$' limit 1),
    null);
end;
$$;

/** Proposta vencida → versão nova com os preços de hoje (calculados pelo servidor). */
create or replace function publico.atualizar_precos(
  p_slug text,
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
  p_convidados integer,
  p_pacote_id uuid,
  p_conteudo jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orcamentos;
begin
  v_o := publico._orcamento(p_slug, p_token);
  if not (v_o.status = 'expirado'
          or (v_o.status in ('enviado', 'visualizado') and v_o.validade_ate < publico._hoje(v_o.empresa_id))) then
    raise exception 'PUBLICO_ORCAMENTO_VIGENTE' using errcode = 'check_violation';
  end if;
  if v_o.status <> 'expirado' then
    perform public._orcamento_expirar(v_o.id);
    select * into v_o from public.orcamentos o where o.id = v_o.id;
  end if;
  v_o := public._orcamento_concluir(
    v_o, p_resultado, p_itens, p_total_centavos, p_validade_ate, p_rascunho, p_tipo_evento_id,
    p_data, p_turno_id, p_espaco_id, p_convidados, p_pacote_id, p_conteudo,
    v_o.observacoes, v_o.observacoes_internas, v_o.desconto_motivo, false, 'cliente', null);
  return v_o.token;
end;
$$;

/**
 * Proposta pelo token: sempre a versão vigente (com o aviso de que o token pedido era antigo),
 * o conteúdo congelado e o estado. NUNCA devolve observações internas, motivo do desconto nem
 * quem criou. Validade vencida = expirada já na leitura.
 */
create or replace function publico.proposta(p_slug text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido  public.orcamentos;
  v_o       public.orcamentos;
  v_e       public.empresas;
  v_hoje    date;
  v_reserva jsonb;
begin
  v_e := publico._empresa(p_slug);
  if v_e.id is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,}$' then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  select * into v_pedido from public.orcamentos o where o.token = p_token and o.empresa_id = v_e.id;
  if v_pedido.id is null then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  v_o := coalesce(public._orcamento_vigente(v_e.id, v_pedido.numero), v_pedido);
  if v_o.status = 'em_montagem' then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  v_hoje := publico._hoje(v_e.id);
  if v_o.status in ('enviado', 'visualizado') and v_o.validade_ate < v_hoje then
    perform public._orcamento_expirar(v_o.id);
    select * into v_o from public.orcamentos o where o.id = v_o.id;
  end if;

  select jsonb_build_object('tipo', r.tipo, 'status', r.status, 'expira_em', r.expira_em)
    into v_reserva
  from public.reservas r
  where r.orcamento_id = v_o.id and r.status = 'ativa'
    and (r.tipo = 'confirmada' or r.expira_em > now())
  order by r.criado_em desc limit 1;

  return jsonb_build_object(
    'numero', v_o.numero,
    'versao', v_o.versao,
    'token', v_o.token,
    'token_antigo', v_o.token <> p_token,
    'atualizada_em', v_o.enviado_em,
    'status', v_o.status,
    'eh_teste', v_o.eh_teste,
    'enviado_em', v_o.enviado_em,
    'validade_ate', v_o.validade_ate,
    'hoje', v_hoje,
    'resultado', v_o.resultado,
    'conteudo', v_o.conteudo,
    'observacoes', v_o.observacoes,
    'total_centavos', v_o.total_centavos,
    'data', v_o.data,
    'convidados', v_o.convidados,
    'tipo_evento', (select t.nome from public.tipos_evento t where t.id = v_o.tipo_evento_id),
    'turno', (select jsonb_build_object('nome', t.nome, 'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'))
              from public.turnos t where t.id = v_o.turno_id),
    'espaco', (select x.nome from public.espacos x where x.id = v_o.espaco_id),
    'cliente_primeiro_nome', (select split_part(btrim(l.nome), ' ', 1) from public.leads l where l.id = v_o.lead_id),
    'cliente_nome', (select btrim(l.nome) from public.leads l where l.id = v_o.lead_id),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'tipo', i.tipo, 'descricao', i.descricao, 'quantidade', i.quantidade,
        'valor_unitario_centavos', i.valor_unitario_centavos,
        'subtotal_centavos', i.subtotal_centavos, 'detalhe', i.detalhe) order by i.ordem)
      from public.orcamento_itens i where i.orcamento_id = v_o.id), '[]'),
    'reserva', v_reserva,
    'suspenso', v_e.plano = 'suspenso',
    'empresa', jsonb_build_object(
      'nome', v_e.nome, 'razao_social', v_e.razao_social, 'cnpj', v_e.cnpj,
      'endereco', v_e.endereco, 'whatsapp_e164', v_e.whatsapp_e164,
      'rodape_orkestra', v_e.rodape_orkestra),
    'regras', (select jsonb_build_object(
        'prazo_pre_reserva_horas', r.prazo_pre_reserva_horas, 'sinal_bp', r.sinal_bp,
        'cancelamento_texto', r.cancelamento_texto)
      from public.regras_comerciais r where r.empresa_id = v_e.id)
  );
end;
$$;

/**
 * Abertura da proposta pelo cliente. Usuário logado da própria empresa não conta (decisão do
 * servidor pela sessão). Atividade no máximo 1 vez a cada 30 min por orçamento; reabriu 2 vezes
 * ou mais em 3 dias = lead quente. Excesso por IP é ignorado em silêncio.
 */
create or replace function publico.registrar_abertura(
  p_slug text, p_token text, p_eh_usuario_empresa boolean, p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o        public.orcamentos;
  v_lead     public.leads;
  v_nova     public.temperatura_lead;
  v_instantes timestamptz[];
begin
  if coalesce(p_eh_usuario_empresa, false) then
    return;
  end if;
  v_o := publico._orcamento(p_slug, p_token);
  if v_o.status = 'em_montagem' or v_o.eh_teste then
    return;
  end if;
  if not publico._limitar('abertura', v_o.empresa_id, p_ip_hash, null, true) then
    return;
  end if;

  update public.orcamentos set
    aberturas = aberturas + 1, ultima_abertura_em = now(),
    status = case when status = 'enviado' then 'visualizado' else status end,
    visualizado_em = coalesce(visualizado_em, now())
  where id = v_o.id
  returning * into v_o;

  if not exists (
    select 1 from public.atividades a
    join public.orcamentos o on o.id = a.orcamento_id
    where o.empresa_id = v_o.empresa_id and o.numero = v_o.numero
      and a.tipo = 'proposta_aberta' and a.criado_em > now() - interval '30 minutes'
  ) then
    perform public._lead_aplicar_evento(v_o.lead_id, 'proposta_aberta', v_o.id, 'cliente', null,
      jsonb_build_object('vez', v_o.aberturas, 'numero', v_o.numero, 'versao', v_o.versao));
  end if;

  select * into v_lead from public.leads l where l.id = v_o.lead_id for update;
  select array_agg(a.criado_em) into v_instantes from public.atividades a
  where a.lead_id = v_lead.id and a.tipo = 'proposta_aberta' and a.criado_em > now() - interval '3 days';
  -- clock_timestamp: a atividade recém-gravada usa o relógio real, não o início da transação.
  v_nova := public._temperatura_aberturas(v_instantes, clock_timestamp(), v_lead.temperatura);
  if v_nova <> v_lead.temperatura then
    update public.leads set temperatura = v_nova where id = v_lead.id;
  end if;
end;
$$;

/** "Quero reservar esta data". O token precisa ser o da versão vigente (senão a tela recarrega). */
create or replace function publico.pre_reservar(p_slug text, p_token text, p_ip_hash text)
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
begin
  v_o := publico._orcamento(p_slug, p_token);
  if v_o.token <> p_token then
    return jsonb_build_object('ok', false, 'codigo', 'PROPOSTA_ATUALIZADA', 'token', v_o.token);
  end if;
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
  if v_o.status in ('enviado', 'visualizado') and v_o.validade_ate < v_hoje then
    perform public._orcamento_expirar(v_o.id);
    return jsonb_build_object('ok', false, 'codigo', 'ORCAMENTO_EXPIRADO');
  end if;
  if v_o.status = 'expirado' then
    return jsonb_build_object('ok', false, 'codigo', 'ORCAMENTO_EXPIRADO');
  end if;
  if v_o.status not in ('enviado', 'visualizado') then
    raise exception 'PUBLICO_ORCAMENTO_FECHADO' using errcode = 'check_violation';
  end if;

  perform publico._limitar('pre_reserva', v_o.empresa_id, p_ip_hash, v_lead.whatsapp_e164);
  perform public._agenda_travar(v_o.empresa_id);

  if v_o.data < v_hoje + v_regras.antecedencia_min_dias and not v_o.fora_antecedencia then
    return jsonb_build_object('ok', false, 'codigo', 'SLOT_INDISPONIVEL', 'sugestoes',
      publico._sugestoes(v_o.empresa_id, v_o.data, v_o.turno_id, v_o.espaco_id));
  end if;

  select coalesce(bool_or(d.estado = 'livre' and d.vagas > 0), false) into v_livre
  from public._disponibilidade(v_o.empresa_id, v_o.data, v_o.data, v_o.espaco_id) d
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

  v_reserva := public._orcamento_pre_reservar(v_o, 'link_publico', 'cliente', null);
  return jsonb_build_object('ok', true, 'simulada', false, 'expira_em', v_reserva.expira_em,
    'sinal_centavos', coalesce((v_o.resultado ->> 'sinalCentavos')::integer, 0),
    'total_centavos', v_o.total_centavos, 'numero', v_o.numero);
end;
$$;

-- Limites: aberturas e PDFs por IP (excesso ignorado ou recusado conforme a função).
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
    ('funil',      400, null, 5000),
    ('abertura',   120, null, 5000),
    ('pdf',         30, null, 2000)
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

/** Limite de PDFs por IP (a rota do PDF chama antes de gerar). */
create or replace function publico.limitar_pdf(p_slug text, p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.empresas;
begin
  v_e := publico._empresa(p_slug);
  if v_e.id is null then
    return false;
  end if;
  return publico._limitar('pdf', v_e.id, p_ip_hash, null, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on function public._temperatura_aberturas(timestamptz[], timestamptz, public.temperatura_lead) from public, anon, authenticated;
revoke all on function public._orcamento_vigente(uuid, integer) from public, anon, authenticated;
revoke all on function public._orcamento_expirar(uuid) from public, anon, authenticated;
revoke all on function public._orcamento_concluir(public.orcamentos, jsonb, jsonb, integer, date, jsonb, uuid, date, uuid, uuid, integer, uuid, jsonb, text, text, text, boolean, public.autor_atividade, uuid) from public, anon, authenticated;
revoke all on function public._orcamento_pre_reservar(public.orcamentos, public.origem_reserva, public.autor_atividade, uuid) from public, anon, authenticated;
revoke all on function public.expirar_orcamentos() from public, anon, authenticated;
grant execute on function public.expirar_orcamentos() to service_role;

revoke all on function public.salvar_orcamento_interno(uuid, text, text, public.origem_lead, jsonb, jsonb, integer, date, jsonb, uuid, date, uuid, uuid, integer, uuid, jsonb, text, text, text, boolean) from public, anon;
revoke all on function public.pre_reservar_orcamento(uuid) from public, anon;
revoke all on function public.marcar_orcamento_enviado(uuid, text) from public, anon;
grant execute on function public.salvar_orcamento_interno(uuid, text, text, public.origem_lead, jsonb, jsonb, integer, date, jsonb, uuid, date, uuid, uuid, integer, uuid, jsonb, text, text, text, boolean) to authenticated;
grant execute on function public.pre_reservar_orcamento(uuid) to authenticated;
grant execute on function public.marcar_orcamento_enviado(uuid, text) to authenticated;

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
