-- Etapa 9B · B.5 Conta de demonstração.
--
-- Uma empresa marcada (eh_demo) com o modelo infantil e 60 dias de dados fictícios, recriada todo
-- dia às 03:00 (horário de Brasília) pela rota /api/demo/recriar (pg_cron → pg_net, CRON_SECRET).
-- O visitante entra sem senha num usuário único; o banco recusa TODA escrita feita com a sessão
-- dele (DEMO_SOMENTE_LEITURA), inclusive nas funções que liberam a conta suspensa. O link público
-- da demo funciona em modo teste: lead e orçamento nascem com eh_teste (nada vira lead real nem
-- entra em métricas). Tudo aditivo: coluna com default, funções e triggers novos.

-- ---------------------------------------------------------------------------------------------
-- 1. Marca da empresa de demonstração (no máximo uma)
-- ---------------------------------------------------------------------------------------------

alter table public.empresas add column if not exists eh_demo boolean not null default false;
create unique index if not exists empresas_uma_demo_idx on public.empresas ((true)) where eh_demo;
comment on column public.empresas.eh_demo is
  'Empresa de demonstração (Etapa 9B): recriada todo dia, somente leitura para o visitante.';

/** A empresa é a de demonstração? (sem RLS: usada pelos triggers). */
create or replace function public._empresa_demo(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select e.eh_demo from public.empresas e where e.id = p_empresa), false);
$$;
revoke all on function public._empresa_demo(uuid) from public, anon, authenticated;

/** Montagem da demo em andamento (só a conexão administrativa liga, na própria transação). */
create or replace function public._demo_montando()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('orkestra.demo_montagem', true), '') = '1';
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Somente leitura: o visitante da demo nunca escreve (antes de qualquer liberação)
-- ---------------------------------------------------------------------------------------------

/**
 * Mesma regra da Etapa 9A (conta suspensa = somente leitura) e, antes dela, a da demo: com sessão
 * de usuário (auth.uid()) numa empresa de demonstração, nada passa, nem com
 * orkestra.permitir_escrita (LGPD, aceite). O link público (anon) e os jobs seguem.
 */
create or replace function public._exigir_escrita()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  if tg_table_name = 'empresas' then
    v_empresa := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_empresa := case when tg_op = 'DELETE' then old.empresa_id else new.empresa_id end;
  end if;
  if auth.uid() is not null and not public._demo_montando() and public._empresa_demo(v_empresa) then
    raise exception 'DEMO_SOMENTE_LEITURA' using errcode = 'insufficient_privilege';
  end if;
  if auth.uid() is null or coalesce(current_setting('orkestra.permitir_escrita', true), '') = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.empresas e where e.id = v_empresa and e.plano = 'suspenso') then
    raise exception 'CONTA_SOMENTE_LEITURA' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

/** Só a regra da demo, para as tabelas que seguem graváveis com a conta suspensa (avisos…). */
create or replace function public._exigir_nao_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := case when tg_op = 'DELETE' then old.empresa_id else new.empresa_id end;
begin
  if auth.uid() is not null and not public._demo_montando() and public._empresa_demo(v_empresa) then
    raise exception 'DEMO_SOMENTE_LEITURA' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Toda tabela de public com empresa_id que ainda não tem o _exigir_escrita (avisos, push,
-- preferências, auditoria, suporte, cobrança, aceites, funil…).
do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'empresa_id' and tb.table_type = 'BASE TABLE'
      and not exists (
        select 1 from pg_trigger g
        where g.tgrelid = format('public.%I', c.table_name)::regclass and not g.tgisinternal
          and g.tgfoid = 'public._exigir_escrita()'::regprocedure)
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_nao_demo', t);
    execute format('create trigger %I before insert or update or delete on public.%I '
                   'for each row execute function public._exigir_nao_demo()', t || '_nao_demo', t);
  end loop;
end;
$$;

/**
 * Link público da demo = modo teste, também no banco: lead e orçamento criados por qualquer um
 * (fora da montagem) nascem como teste, longe das métricas e da caixa.
 */
create or replace function public._demo_eh_teste()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public._demo_montando() and public._empresa_demo(new.empresa_id) then
    new.eh_teste := true;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_demo_teste on public.leads;
create trigger leads_demo_teste before insert on public.leads
  for each row execute function public._demo_eh_teste();
drop trigger if exists orcamentos_demo_teste on public.orcamentos;
create trigger orcamentos_demo_teste before insert on public.orcamentos
  for each row execute function public._demo_eh_teste();

/** A demo nunca manda e-mail (o e-mail do usuário dela não existe de verdade). */
create or replace function public._demo_sem_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.canal = 'email' and public._empresa_demo(new.empresa_id) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists avisos_entregas_demo_sem_email on public.avisos_entregas;
create trigger avisos_entregas_demo_sem_email before insert on public.avisos_entregas
  for each row execute function public._demo_sem_email();

do $$
declare
  f text;
begin
  foreach f in array array['public._exigir_nao_demo()', 'public._demo_eh_teste()',
                           'public._demo_sem_email()', 'public._demo_montando()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- Storage: o visitante da demo não envia nem apaga arquivos (política restritiva, somada às do dono)
do $$
declare
  op text;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  foreach op in array array['insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on storage.objects', 'midia_' || op || '_nao_demo');
    if op = 'insert' then
      execute format('create policy %I on storage.objects as restrictive for insert to authenticated '
        'with check (not exists (select 1 from public.empresas e '
        'where e.id = public.empresa_do_usuario() and e.eh_demo))', 'midia_' || op || '_nao_demo');
    else
      execute format('create policy %I on storage.objects as restrictive for %s to authenticated '
        'using (not exists (select 1 from public.empresas e '
        'where e.id = public.empresa_do_usuario() and e.eh_demo))', 'midia_' || op || '_nao_demo', op);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Recriar a demo (conexão administrativa: rota /api/demo/recriar e a entrada /demo/entrar)
-- ---------------------------------------------------------------------------------------------

/**
 * Apaga a demo anterior inteira e cria a empresa nova com o usuário único (perfil dono, Termos da
 * versão vigente aceitos). O catálogo do modelo infantil é gravado pelo servidor (gravarModelo) na
 * mesma transação; depois demo_popular gera os dados. Nunca toca numa empresa real: slug de uma
 * empresa que não é demo é recusado.
 */
create or replace function public.demo_recriar(
  p_slug text, p_usuario uuid, p_email text, p_versao text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_antiga uuid;
begin
  perform set_config('orkestra.demo_montagem', '1', true);
  perform pg_advisory_xact_lock(hashtext('orkestra:demo'));
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) not between 3 and 60 then
    raise exception 'DEMO_SLUG_INVALIDO' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.empresas e where e.slug = p_slug and not e.eh_demo) then
    raise exception 'DEMO_SLUG_OCUPADO' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.usuarios u join public.empresas e on e.id = u.empresa_id
             where u.id = p_usuario and not e.eh_demo) then
    raise exception 'DEMO_USUARIO_DE_OUTRA_EMPRESA' using errcode = 'unique_violation';
  end if;

  for v_antiga in select e.id from public.empresas e where e.eh_demo loop
    delete from public.cobranca_eventos where empresa_id = v_antiga;
    delete from public.usuarios where empresa_id = v_antiga;
    delete from public.empresas where id = v_antiga;
  end loop;

  insert into public.empresas (
    nome, slug, segmento, eh_demo, isenta, cidade, whatsapp_e164, sobre, slogan, diferenciais,
    bairro, onboarding_passo, onboarding_iniciado_em, onboarding_concluido_em, link_testado_em,
    link_na_bio_em, criado_em
  ) values (
    'Buffet Alegria (demonstração)', p_slug, 'infantil', true, true, 'Uberlândia',
    '+5534990000000',
    'Festas infantis com brinquedão, monitores e cardápio feito na hora. Dados fictícios de demonstração.',
    'A festa que a criançada lembra o ano inteiro',
    array['Monitores em todas as festas', 'Cardápio feito na hora', 'Estacionamento próprio'],
    'Centro', 5, now() - interval '61 days', now() - interval '61 days' + interval '9 minutes',
    now() - interval '60 days', now() - interval '60 days', now() - interval '61 days'
  ) returning id into v_id;

  insert into public.usuarios (id, empresa_id, nome, email, perfil, termos_versao, termos_aceitos_em)
  values (p_usuario, v_id, 'Visitante da demonstração', p_email, 'dono', p_versao, now());
  return v_id;
end;
$$;

/** Modelo da proposta congelada (o mesmo formato de montarConteudo), para os orçamentos da demo. */
create or replace function public._demo_conteudo(
  p_empresa uuid, p_pacote text, p_adultos integer, p_nome text, p_data date, p_tipo uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'formato', 1,
    'pacote', (select jsonb_build_object('nome', p.nome, 'duracaoInclusaMin', p.duracao_inclusa_min,
        'secoes', coalesce((select jsonb_agg(jsonb_build_object('nome', s.nome, 'itens', to_jsonb(s.itens))
                                             order by s.ordem)
                            from public.secoes_cardapio s
                            where s.pacote_id = p.id and cardinality(s.itens) > 0), '[]'::jsonb))
      from public.pacotes p where p.empresa_id = p_empresa and p.nome = p_pacote),
    'convidados', jsonb_build_object('adultos', p_adultos, 'criancas', '[]'::jsonb),
    'espaco', (select jsonb_build_object('nome', e.nome, 'noLocalDoCliente', e.no_local_do_cliente,
        'localCliente', null)
      from public.espacos e where e.empresa_id = p_empresa order by e.ordem limit 1),
    'abertura', (select replace(replace(replace(replace(replace(t.texto_abertura,
        '{nome}', split_part(p_nome, ' ', 1)), '{data}', to_char(p_data, 'DD/MM/YYYY')),
        '{convidados}', p_adultos::text), '{tipo}', lower(t.nome)),
        '{buffet}', (select e.nome from public.empresas e where e.id = p_empresa))
      from public.tipos_evento t where t.id = p_tipo),
    'textos', (select jsonb_build_object('condicoes', r.condicoes_texto,
        'formasPagamento', to_jsonb(r.formas_pagamento), 'naoIncluso', r.nao_incluso_texto,
        'cancelamento', r.cancelamento_texto, 'alteracaoConvidados', r.alteracao_convidados_texto,
        'sinalBp', r.sinal_bp)
      from public.regras_comerciais r where r.empresa_id = p_empresa));
$$;

/**
 * Dados fictícios de 60 dias (datas relativas a hoje): visitas ao link por várias origens,
 * ~50 leads em todos os estados, orçamentos com proposta, perdas por motivos, pedidos de visita e
 * pré-reserva com tempo de atendimento, reservas confirmadas, uma pré-reserva esperando, tarefas
 * e notas. Números e Agenda cheios. Chamada só na montagem (demo_recriar antes, mesma transação).
 */
create or replace function public.demo_popular(p_empresa uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  origens  constant public.origem_lead[] :=
    array['instagram', 'instagram', 'whatsapp', 'google', 'qrcode', 'link_direto', 'indicacao', 'instagram']::public.origem_lead[];
  motivos  constant public.motivo_perda[] :=
    array['preco', 'preco', 'data_indisponivel', 'concorrente', 'sem_resposta', 'desistiu', 'fora_da_area']::public.motivo_perda[];
  pacotes_ constant text[] := array['Alegria', 'Super', 'Encanto'];
  nomes    constant text[] := array['Ana', 'Bruna', 'Caio', 'Débora', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'Júlio'];
  sobren   constant text[] := array['Lima', 'Souza', 'Rocha', 'Prado', 'Melo', 'Dias', 'Pires'];
  v_e      public.empresas;
  v_dono   uuid;
  v_espaco uuid;
  v_tipo   uuid;
  v_turnos uuid[];
  v_interv integer;
  v_lead   uuid;
  v_orc    uuid;
  v_numero integer := 0;
  v_criado timestamptz;
  v_status public.status_lead;
  v_pacote text;
  v_adultos integer;
  v_total  integer;
  v_data   date;
  v_turno  uuid;
  v_sessao uuid;
  v_n      integer := 0;
  v_nome   text;
  i        integer;
  d        integer;
  s        integer;
begin
  perform set_config('orkestra.demo_montagem', '1', true);
  select * into v_e from public.empresas e where e.id = p_empresa and e.eh_demo;
  if v_e.id is null then
    raise exception 'DEMO_INEXISTENTE' using errcode = 'no_data_found';
  end if;
  select u.id into v_dono from public.usuarios u where u.empresa_id = p_empresa limit 1;
  select id into v_espaco from public.espacos where empresa_id = p_empresa order by ordem limit 1;
  select id into v_tipo from public.tipos_evento where empresa_id = p_empresa order by ordem limit 1;
  select array_agg(id order by ordem) into v_turnos from public.turnos where empresa_id = p_empresa;
  select r.intervalo_entre_eventos_min into v_interv from public.regras_comerciais r where r.empresa_id = p_empresa;
  if v_espaco is null or v_tipo is null or v_turnos is null then
    raise exception 'DEMO_SEM_CATALOGO' using errcode = 'no_data_found';
  end if;

  -- preços do modelo confirmados (o dono da demo "digitou")
  update public.pacotes set preco_confirmado_em = now() where empresa_id = p_empresa;
  update public.opcionais set preco_confirmado_em = now() where empresa_id = p_empresa;

  -- visitas ao link: 60 dias, 6 a 14 sessões por dia, cada uma com a sua origem
  for d in 0..59 loop
    for s in 1..(6 + (d * 7) % 9) loop
      v_sessao := gen_random_uuid();
      v_criado := now() - d * interval '1 day' - (s * 47 % 600) * interval '1 minute';
      insert into public.funil_eventos (empresa_id, sessao, passo, evento, origem, criado_em)
      values (p_empresa, v_sessao, 0, 'pagina_vista', origens[1 + (d + s) % 8], v_criado);
      if (d + s) % 10 < 4 then
        insert into public.funil_eventos (empresa_id, sessao, passo, evento, origem, criado_em)
        values (p_empresa, v_sessao, 1, 'passo_concluido', origens[1 + (d + s) % 8], v_criado + interval '1 minute'),
               (p_empresa, v_sessao, 2, 'passo_visto', origens[1 + (d + s) % 8], v_criado + interval '1 minute');
        if (d + s) % 10 < 2 then
          insert into public.funil_eventos (empresa_id, sessao, passo, evento, origem, criado_em)
          values (p_empresa, v_sessao, 3, 'passo_visto', origens[1 + (d + s) % 8], v_criado + interval '3 minutes');
        end if;
      end if;
    end loop;
  end loop;

  -- ~50 leads espalhados em 60 dias (o mais antigo primeiro, numeração crescente)
  for i in 1..50 loop
    v_criado := now() - ((i * 37) % 58 + 2) * interval '1 day' - (i * 13 % 600) * interval '1 minute';
    v_status := case
      when i % 7 = 0 then 'reservado'
      when i % 7 in (1, 5) then 'perdido'
      when i % 7 = 3 then 'abandonou'
      when i % 7 = 4 then 'frio'
      else 'em_andamento' end;
    v_nome := nomes[1 + i % 10] || ' ' || sobren[1 + i % 7];
    v_pacote := pacotes_[1 + i % 3];
    v_adultos := 40 + (i * 7) % 50;
    v_total := 380000 + (i * 7919 % 40) * 10000;
    v_data := (current_date + (i * 3 % 50) + 20)::date;
    v_turno := v_turnos[1 + i % array_length(v_turnos, 1)];

    insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
      responsavel_id, criado_em, ultima_atividade_em, perdido_em, motivo_perda_codigo, status_antes_de_perder,
      primeiro_contato_em, consentimento_em, consentimento_versao, consentimento_texto)
    values (p_empresa, v_nome, '+5534997' || lpad(i::text, 6, '0'),
      case when i % 11 = 0 then 'interno' else origens[1 + i % 8] end,
      v_status,
      (case when i % 5 = 0 then 'quente' when i % 3 = 0 then 'morno' else 'frio' end)::public.temperatura_lead,
      case when i % 4 = 0 then 3 else 6 end,
      v_dono, v_criado, v_criado + interval '1 day',
      case when v_status = 'perdido' then v_criado + ((i % 9) + 2) * interval '1 day' end,
      case when v_status = 'perdido' then motivos[1 + i % 7] end,
      case when v_status = 'perdido' then 'em_andamento'::public.status_lead end,
      case when i % 4 <> 3 then v_criado + ((i * 17) % 300 + 5) * interval '1 minute' end,
      v_criado, 'demo', 'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.')
    returning id into v_lead;
    v_n := v_n + 1;

    insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, criado_em)
    values (p_empresa, v_lead, 'lead_criado', jsonb_build_object('origem', origens[1 + i % 8]), 'cliente', v_criado);

    v_orc := null;
    if i % 4 <> 0 then
      v_numero := v_numero + 1;
      insert into public.orcamentos (empresa_id, lead_id, numero, token, status, canal, origem,
        rascunho, passo_atual, resultado, total_centavos, validade_ate, tipo_evento_id, data, turno_id,
        espaco_id, convidados, pacote_id, conteudo, enviado_em, visualizado_em, aberturas,
        ultima_abertura_em, criado_em)
      values (p_empresa, v_lead, v_numero,
        replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        (case when v_status = 'reservado' then 'aceito'
              when i % 9 = 4 then 'expirado' else 'visualizado' end)::public.status_orcamento,
        (case when i % 11 = 0 then 'interno' else 'publico' end)::public.canal_orcamento,
        case when i % 11 = 0 then 'interno' else origens[1 + i % 8] end,
        jsonb_build_object('tipoEventoId', v_tipo, 'turnoId', v_turno, 'adultos', v_adultos,
          'criancas', '[]'::jsonb, 'opcionais', '[]'::jsonb, 'horasExtras', 0,
          'pacoteId', (select id from public.pacotes where empresa_id = p_empresa and nome = v_pacote),
          'data', v_data::text),
        6,
        jsonb_build_object('versaoMotor', 1, 'ok', true, 'erros', '[]'::jsonb, 'avisos', '[]'::jsonb,
          'convidadosEquivalentes', v_adultos, 'pessoasFisicas', v_adultos,
          'linhas', jsonb_build_array(jsonb_build_object('tipo', 'pacote', 'descricao', 'Pacote ' || v_pacote,
            'quantidade', v_adultos, 'valorUnitarioCentavos', v_total / v_adultos,
            'subtotalCentavos', v_total, 'detalhe', v_adultos || ' convidados equivalentes')),
          'subtotalCentavos', v_total, 'descontoCentavos', 0, 'totalCentavos', v_total,
          'porConvidadoCentavos', v_total / v_adultos, 'sinalCentavos', v_total * 3 / 10,
          'saldoCentavos', v_total - v_total * 3 / 10, 'parcelas', '[]'::jsonb),
        v_total,
        case when i % 9 = 4 then current_date - 2 else (v_criado + interval '15 days')::date end,
        v_tipo, v_data, v_turno, v_espaco, v_adultos,
        (select id from public.pacotes where empresa_id = p_empresa and nome = v_pacote),
        public._demo_conteudo(p_empresa, v_pacote, v_adultos, v_nome, v_data, v_tipo),
        v_criado + interval '20 minutes', v_criado + interval '2 hours', 1 + i % 3,
        v_criado + interval '1 day', v_criado + interval '10 minutes')
      returning id into v_orc;

      insert into public.orcamento_itens (empresa_id, orcamento_id, ordem, tipo, descricao, quantidade,
        valor_unitario_centavos, subtotal_centavos, detalhe)
      values (p_empresa, v_orc, 0, 'pacote', 'Pacote ' || v_pacote, v_adultos, v_total / v_adultos,
        v_total, v_adultos || ' convidados equivalentes');

      insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
      values (p_empresa, v_lead, v_orc, 'orcamento_concluido',
        jsonb_build_object('numero', v_numero, 'total_centavos', v_total, 'data', v_data), 'cliente',
        v_criado + interval '20 minutes');
    end if;

    -- pedido de pré-reserva ou visita pelo cliente e a primeira ação depois (tempo de atendimento)
    if i % 3 <> 2 then
      insert into public.atividades (empresa_id, lead_id, tipo, autor, criado_em, dados)
      values (p_empresa, v_lead, case when i % 2 = 0 then 'pre_reserva_pedida' else 'visita_pedida' end::public.tipo_atividade,
        'cliente', v_criado + interval '30 minutes', '{}'::jsonb);
      if i % 4 <> 3 then
        insert into public.atividades (empresa_id, lead_id, tipo, autor, usuario_id, criado_em, dados)
        values (p_empresa, v_lead, 'contato_registrado', 'usuario', v_dono,
          v_criado + interval '30 minutes' + ((i * 23) % 240 + 4) * interval '1 minute',
          jsonb_build_object('canal', 'whatsapp'));
      end if;
    end if;

    if v_status = 'perdido' then
      insert into public.atividades (empresa_id, lead_id, tipo, autor, usuario_id, criado_em, dados)
      values (p_empresa, v_lead, 'perdido', 'usuario', v_dono,
        v_criado + ((i % 9) + 2) * interval '1 day', jsonb_build_object('motivo', motivos[1 + i % 7]));
    end if;

    -- reservado: reserva confirmada em datas espaçadas (turnos alternados)
    if v_status = 'reservado' then
      insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, origem,
        cliente_nome, cliente_whatsapp_e164, tipo_evento_id, convidados, valor_total_centavos,
        sinal_centavos, sinal_pago_em, lead_id, orcamento_id, criado_em, confirmada_em, confirmada_por)
      select p_empresa, v_espaco, t.id, v_data, iv.inicio, iv.fim, 'confirmada', 'ativa', 'orcamento',
        v_nome, '+5534997' || lpad(i::text, 6, '0'), v_tipo, v_adultos, v_total, v_total * 3 / 10,
        (v_criado + interval '3 days')::date, v_lead, v_orc, v_criado + interval '1 day',
        v_criado + interval '3 days', v_dono
      from public.turnos t
      cross join lateral public._agenda_intervalo(v_data, t.hora_inicio, t.duracao_min, v_e.fuso, v_interv) iv
      where t.id = v_turno;
      insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, usuario_id, criado_em)
      values (p_empresa, v_lead, v_orc, 'reserva_confirmada', jsonb_build_object('data', v_data),
        'usuario', v_dono, v_criado + interval '3 days');
    end if;
  end loop;

  -- hoje na caixa: dois leads novos, uma pré-reserva esperando o sinal, um pedido de visita,
  -- tarefas (atrasada e de hoje) e uma nota
  v_numero := v_numero + 1;
  insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
    criado_em, ultima_atividade_em, consentimento_em, consentimento_versao, consentimento_texto)
  values (p_empresa, 'Carla Mendes', '+5534997900001', 'instagram', 'novo', 'morno', 4,
    now() - interval '40 minutes', now() - interval '35 minutes', now() - interval '40 minutes', 'demo',
    'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.'),
    (p_empresa, 'Rafael Souza', '+5534997900002', 'qrcode', 'novo', 'frio', 3,
    now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours', 'demo',
    'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.');

  v_data := current_date + 26;
  v_total := 560000;
  insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
    responsavel_id, criado_em, ultima_atividade_em, consentimento_em, consentimento_versao, consentimento_texto)
  values (p_empresa, 'Patrícia Lima', '+5534997900003', 'whatsapp', 'pre_reservado', 'quente', 6, v_dono,
    now() - interval '5 hours', now() - interval '1 hour', now() - interval '5 hours', 'demo',
    'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.')
  returning id into v_lead;
  insert into public.orcamentos (empresa_id, lead_id, numero, token, status, canal, origem, rascunho,
    passo_atual, resultado, total_centavos, validade_ate, tipo_evento_id, data, turno_id, espaco_id,
    convidados, pacote_id, conteudo, enviado_em, aceito_em, criado_em)
  values (p_empresa, v_lead, v_numero, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    'aceito', 'publico', 'whatsapp',
    jsonb_build_object('tipoEventoId', v_tipo, 'turnoId', v_turnos[1], 'adultos', 70, 'criancas', '[]'::jsonb,
      'opcionais', '[]'::jsonb, 'horasExtras', 0, 'data', v_data::text),
    6,
    jsonb_build_object('versaoMotor', 1, 'ok', true, 'erros', '[]'::jsonb, 'avisos', '[]'::jsonb,
      'convidadosEquivalentes', 70, 'pessoasFisicas', 70,
      'linhas', jsonb_build_array(jsonb_build_object('tipo', 'pacote', 'descricao', 'Pacote Super',
        'quantidade', 70, 'valorUnitarioCentavos', v_total / 70, 'subtotalCentavos', v_total,
        'detalhe', '70 convidados equivalentes')),
      'subtotalCentavos', v_total, 'descontoCentavos', 0, 'totalCentavos', v_total,
      'porConvidadoCentavos', v_total / 70, 'sinalCentavos', v_total * 3 / 10,
      'saldoCentavos', v_total - v_total * 3 / 10, 'parcelas', '[]'::jsonb),
    v_total, current_date + 15, v_tipo, v_data, v_turnos[1], v_espaco, 70,
    (select id from public.pacotes where empresa_id = p_empresa and nome = 'Super'),
    public._demo_conteudo(p_empresa, 'Super', 70, 'Patrícia Lima', v_data, v_tipo),
    now() - interval '4 hours', now() - interval '1 hour', now() - interval '5 hours')
  returning id into v_orc;
  insert into public.orcamento_itens (empresa_id, orcamento_id, ordem, tipo, descricao, quantidade,
    valor_unitario_centavos, subtotal_centavos, detalhe)
  values (p_empresa, v_orc, 0, 'pacote', 'Pacote Super', 70, v_total / 70, v_total, '70 convidados equivalentes');
  insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, expira_em,
    origem, cliente_nome, cliente_whatsapp_e164, tipo_evento_id, convidados, valor_total_centavos,
    observacoes, lead_id, orcamento_id)
  select p_empresa, v_espaco, t.id, v_data, iv.inicio, iv.fim, 'pre_reserva', 'ativa',
    now() + interval '40 hours', 'link_publico', 'Patrícia Lima', '+5534997900003', v_tipo, 70, v_total,
    'Pré-reserva pelo link (orçamento nº ' || v_numero || ').', v_lead, v_orc
  from public.turnos t
  cross join lateral public._agenda_intervalo(v_data, t.hora_inicio, t.duracao_min, v_e.fuso, v_interv) iv
  where t.id = v_turnos[1];
  insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
  values (p_empresa, v_lead, v_orc, 'pre_reserva_pedida', jsonb_build_object('data', v_data), 'cliente',
    now() - interval '1 hour');
  insert into public.avisos (empresa_id, usuario_id, tipo, lead_id, chave, criado_em, agendado_para, dados)
  values (p_empresa, v_dono, 'pre_reserva_pedida', v_lead, 'demo:aviso:pre:' || v_lead,
    now() - interval '1 hour', now() - interval '1 hour',
    jsonb_build_object('lead_nome', 'Patrícia Lima', 'data', v_data));
  insert into public.tarefas (empresa_id, lead_id, orcamento_id, titulo, responsavel_id, vence_em, criado_por)
  values (p_empresa, v_lead, v_orc, 'Confirmar o sinal da pré-reserva', v_dono, now() + interval '3 hours', v_dono);

  insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
    responsavel_id, criado_em, ultima_atividade_em, consentimento_em, consentimento_versao, consentimento_texto)
  values (p_empresa, 'Igor Teixeira', '+5534997900004', 'google', 'em_andamento', 'quente', 6, v_dono,
    now() - interval '1 day', now() - interval '2 hours', now() - interval '1 day', 'demo',
    'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.')
  returning id into v_lead;
  insert into public.visitas (empresa_id, lead_id, data_preferida, periodo, observacoes)
  values (p_empresa, v_lead, current_date + 2, 'tarde', 'Quero ver o salão montado.');
  insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, criado_em)
  values (p_empresa, v_lead, 'visita_pedida',
    jsonb_build_object('data_preferida', current_date + 2, 'periodo', 'tarde'), 'cliente', now() - interval '2 hours');
  insert into public.notas (empresa_id, lead_id, autor_id, texto)
  values (p_empresa, v_lead, v_dono, 'Prefere festa no sábado à tarde. Tem dois filhos (5 e 8 anos).');
  insert into public.tarefas (empresa_id, lead_id, titulo, responsavel_id, vence_em, criado_por, criado_em)
  values (p_empresa, v_lead, 'Ligar para combinar a visita', v_dono, now() - interval '20 hours', v_dono,
    now() - interval '1 day');

  -- isenta: situação "ativo" (sem faixa de teste nem cobrança)
  perform public._atualizar_situacao(p_empresa);
  return v_n + 4;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.demo_recriar(text, uuid, text, text)', 'public.demo_popular(uuid)',
                           'public._demo_conteudo(uuid, text, integer, text, date, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Job diário: 03:00 em Brasília (06:00 UTC) chama a rota que recria a demo
-- ---------------------------------------------------------------------------------------------

create or replace function public.chamar_recriar_demo()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_segredo text;
  v_id      bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'orkestra_site_url'$q$
    into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'orkestra_cron_secret'$q$
    into v_segredo;
  if v_url is null or v_segredo is null then
    return null;
  end if;
  execute $q$select net.http_post(url := $1, headers := $2, body := '{}'::jsonb,
                                  timeout_milliseconds := 25000)$q$
    into v_id
    using rtrim(v_url, '/') || '/api/demo/recriar',
          jsonb_build_object('Authorization', 'Bearer ' || v_segredo,
                             'Content-Type', 'application/json');
  return v_id;
end;
$$;
revoke all on function public.chamar_recriar_demo() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron/pg_net indisponível: recriação diária da demo não agendada.';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  perform cron.schedule('orkestra-demo-recriar', '0 6 * * *', 'select public.chamar_recriar_demo()');
end;
$$;
