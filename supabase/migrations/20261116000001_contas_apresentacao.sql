-- Contas de apresentação (novembro de 2026): uma empresa por modelo de negócio (infantil,
-- casamento e 15 anos, eventos, domicílio) para a equipe Orkestra apresentar o sistema em
-- chamada de vídeo. Diferente da demo da landing (eh_demo, somente leitura e recriada todo dia):
-- conta comum, editável, de cortesia (isenta: sem cobrança, nunca suspende) e só recriada quando
-- a equipe pede no /interno. Só expansão: uma coluna com default e funções novas (service_role).

-- ---------------------------------------------------------------------------------------------
-- 1. Marca
-- ---------------------------------------------------------------------------------------------

alter table public.empresas
  add column if not exists eh_apresentacao boolean not null default false;

comment on column public.empresas.eh_apresentacao is
  'Conta de apresentação da equipe Orkestra (dados fictícios, cortesia). Fora da lista e das '
  'métricas do /interno; recriada só pelo /interno.';

-- ---------------------------------------------------------------------------------------------
-- 2. Criar (ou recriar do zero) a conta de um modelo
-- ---------------------------------------------------------------------------------------------

/**
 * Apaga a conta de apresentação com este slug (se houver) e cria a nova com o usuário dono
 * (Termos vigentes aceitos). O catálogo do modelo é gravado pelo servidor (gravarModelo) na
 * mesma transação; depois apresentacao_popular gera os dados. Nunca toca numa empresa real:
 * slug ou usuário de uma empresa que não é de apresentação é recusado.
 */
create or replace function public.apresentacao_criar(
  p_slug text,
  p_segmento public.segmento_empresa,
  p_nome text,
  p_cidade text,
  p_sobre text,
  p_slogan text,
  p_diferenciais text[],
  p_usuario uuid,
  p_email text,
  p_usuario_nome text,
  p_versao text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_antiga uuid;
begin
  perform pg_advisory_xact_lock(hashtext('orkestra:apresentacao:' || coalesce(p_slug, '')));
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) not between 3 and 60 then
    raise exception 'APRESENTACAO_SLUG_INVALIDO' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.empresas e where e.slug = p_slug and not e.eh_apresentacao) then
    raise exception 'APRESENTACAO_SLUG_OCUPADO' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.usuarios u join public.empresas e on e.id = u.empresa_id
             where u.id = p_usuario and not (e.eh_apresentacao and e.slug = p_slug)) then
    raise exception 'APRESENTACAO_USUARIO_DE_OUTRA_EMPRESA' using errcode = 'unique_violation';
  end if;

  -- recriar: a conta anterior sai inteira (os filhos caem em cascata)
  for v_antiga in select e.id from public.empresas e where e.slug = p_slug and e.eh_apresentacao loop
    perform set_config('orkestra.permitir_escrita', '1', true);
    delete from public.cobranca_eventos where empresa_id = v_antiga;
    delete from public.usuarios where empresa_id = v_antiga;
    delete from public.empresas where id = v_antiga;
  end loop;

  insert into public.empresas (
    nome, slug, segmento, eh_apresentacao, isenta, cidade, whatsapp_e164, sobre, slogan,
    diferenciais, bairro, onboarding_passo, onboarding_iniciado_em, onboarding_concluido_em,
    link_testado_em, link_na_bio_em, criado_em
  ) values (
    left(p_nome, 120), p_slug, p_segmento, true, true, left(p_cidade, 80), '+5534990000000',
    left(p_sobre, 600), left(p_slogan, 120), coalesce(p_diferenciais[1:3], '{}'), 'Centro', 5,
    now() - interval '61 days', now() - interval '61 days' + interval '9 minutes',
    now() - interval '60 days', now() - interval '60 days', now() - interval '61 days'
  ) returning id into v_id;

  insert into public.usuarios (id, empresa_id, nome, email, perfil, termos_versao, termos_aceitos_em)
  values (p_usuario, v_id, left(p_usuario_nome, 120), p_email, 'dono', p_versao, now());
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Valor aproximado de um pacote (para os orçamentos fictícios)
-- ---------------------------------------------------------------------------------------------

/** Por pessoa: preço × convidados; por faixa: a faixa que cabe ou a maior + excedentes. */
create or replace function public._apresentacao_total(p_pacote uuid, p_convidados integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(coalesce(
    case when p.modelo_preco = 'por_pessoa' then p.preco_pessoa_centavos * p_convidados
    else coalesce(
      (select f.valor_centavos from public.faixas_preco f
        where f.pacote_id = p.id and f.ate_convidados >= p_convidados
        order by f.ate_convidados limit 1),
      (select f.valor_centavos + greatest(p_convidados - f.ate_convidados, 0)
                                 * coalesce(p.valor_excedente_centavos, 0)
        from public.faixas_preco f where f.pacote_id = p.id
        order by f.ate_convidados desc limit 1))
    end, 0), 100000)
  from public.pacotes p where p.id = p_pacote;
$$;

/** Proposta congelada (mesmo formato de montarConteudo) para os orçamentos fictícios. */
create or replace function public._apresentacao_conteudo(
  p_empresa uuid, p_pacote uuid, p_convidados integer, p_nome text, p_data date, p_tipo uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'formato', 1,
    'pacote', (select jsonb_build_object('nome', p.nome, 'duracaoInclusaMin', p.duracao_inclusa_min,
        'secoes', coalesce((select jsonb_agg(jsonb_build_object('nome', s.nome, 'itens', to_jsonb(s.itens))
                                             order by s.ordem)
                            from public.secoes_cardapio s
                            where s.pacote_id = p.id and cardinality(s.itens) > 0), '[]'::jsonb))
      from public.pacotes p where p.id = p_pacote),
    'convidados', jsonb_build_object('adultos', p_convidados, 'criancas', '[]'::jsonb),
    'espaco', (select jsonb_build_object('nome', e.nome, 'noLocalDoCliente', e.no_local_do_cliente,
        'localCliente', case when e.no_local_do_cliente then 'Jardim Karaíba, Uberlândia' end)
      from public.espacos e where e.empresa_id = p_empresa order by e.ordem limit 1),
    'abertura', (select replace(replace(replace(replace(replace(coalesce(t.texto_abertura, ''),
        '{nome}', split_part(p_nome, ' ', 1)), '{data}', to_char(p_data, 'DD/MM/YYYY')),
        '{convidados}', p_convidados::text), '{tipo}', lower(t.nome)),
        '{buffet}', (select e.nome from public.empresas e where e.id = p_empresa))
      from public.tipos_evento t where t.id = p_tipo),
    'textos', (select jsonb_build_object('condicoes', r.condicoes_texto,
        'formasPagamento', to_jsonb(r.formas_pagamento), 'naoIncluso', r.nao_incluso_texto,
        'cancelamento', r.cancelamento_texto, 'alteracaoConvidados', r.alteracao_convidados_texto,
        'sinalBp', r.sinal_bp)
      from public.regras_comerciais r where r.empresa_id = p_empresa));
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Dados fictícios (60 dias, datas relativas a hoje), servem para qualquer modelo
-- ---------------------------------------------------------------------------------------------

/**
 * Visitas ao link por várias origens, ~50 leads em todos os estados, orçamentos com proposta,
 * perdas por motivo, pedidos de visita e pré-reserva com tempo de atendimento, reservas
 * confirmadas, uma pré-reserva esperando, tarefas, notas e avisos; preços confirmados, uma data
 * especial e um item incluso que o cliente pode retirar. Usa os pacotes, o espaço, o tipo de
 * festa e os turnos do próprio catálogo (gravado antes, na mesma transação).
 */
create or replace function public.apresentacao_popular(p_empresa uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  origens  constant public.origem_lead[] :=
    array['instagram', 'instagram', 'whatsapp', 'google', 'qrcode', 'link_direto', 'indicacao', 'instagram']::public.origem_lead[];
  motivos  constant public.motivo_perda[] :=
    array['preco', 'preco', 'data_indisponivel', 'concorrente', 'sem_resposta', 'desistiu', 'fora_da_area']::public.motivo_perda[];
  nomes    constant text[] := array['Ana', 'Bruna', 'Caio', 'Débora', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'Júlio'];
  sobren   constant text[] := array['Lima', 'Souza', 'Rocha', 'Prado', 'Melo', 'Dias', 'Pires'];
  consent  constant text := 'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.';
  v_e      public.empresas;
  v_dono   uuid;
  v_espaco uuid;
  v_tipo   uuid;
  v_turnos uuid[];
  v_pacotes uuid[];
  v_interv integer;
  v_lead   uuid;
  v_orc    uuid;
  v_numero integer := 0;
  v_criado timestamptz;
  v_status public.status_lead;
  v_pacote uuid;
  v_pac_nome text;
  v_min    integer;
  v_max    integer;
  v_conv   integer;
  v_total  integer;
  v_data   date;
  v_turno  uuid;
  v_sessao uuid;
  v_n      integer := 0;
  v_nome   text;
  v_fone   text;
  i        integer;
  d        integer;
  s        integer;
begin
  select * into v_e from public.empresas e where e.id = p_empresa and e.eh_apresentacao;
  if v_e.id is null then
    raise exception 'APRESENTACAO_INEXISTENTE' using errcode = 'no_data_found';
  end if;
  select u.id into v_dono from public.usuarios u where u.empresa_id = p_empresa and u.perfil = 'dono' limit 1;
  select id into v_espaco from public.espacos where empresa_id = p_empresa order by ordem limit 1;
  select id into v_tipo from public.tipos_evento where empresa_id = p_empresa order by ordem limit 1;
  select array_agg(id order by ordem) into v_turnos from public.turnos where empresa_id = p_empresa;
  select array_agg(id order by ordem) into v_pacotes
    from (select id, ordem from public.pacotes where empresa_id = p_empresa and ativo
          order by ordem limit 3) p;
  select r.intervalo_entre_eventos_min into v_interv from public.regras_comerciais r where r.empresa_id = p_empresa;
  if v_espaco is null or v_tipo is null or v_turnos is null or v_pacotes is null then
    raise exception 'APRESENTACAO_SEM_CATALOGO' using errcode = 'no_data_found';
  end if;

  -- preços do modelo confirmados (a equipe "digitou")
  update public.pacotes set preco_confirmado_em = now() where empresa_id = p_empresa;
  update public.opcionais set preco_confirmado_em = now() where empresa_id = p_empresa;

  -- novidades da Fase 6 à mostra: um incluso retirável (com desconto) e uma data especial
  update public.opcional_pacotes v set removivel = true, desconto_retirada_centavos = 15000
  where (v.opcional_id, v.pacote_id) = (
    select v2.opcional_id, v2.pacote_id from public.opcional_pacotes v2
    join public.opcionais o on o.id = v2.opcional_id
    where v2.empresa_id = p_empresa and v2.relacao = 'incluso'
    order by o.ordem limit 1);
  insert into public.feriados (empresa_id, data, nome, ajuste_bp)
  values (p_empresa, make_date(extract(year from current_date)::integer + 1, 12, 24),
          'Véspera de Natal', 2000)
  on conflict do nothing;

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

  -- ~50 leads espalhados em 60 dias
  for i in 1..50 loop
    v_criado := now() - ((i * 37) % 58 + 2) * interval '1 day' - (i * 13 % 600) * interval '1 minute';
    v_status := case
      when i % 7 = 0 then 'reservado'
      when i % 7 in (1, 5) then 'perdido'
      when i % 7 = 3 then 'abandonou'
      when i % 7 = 4 then 'frio'
      else 'em_andamento' end;
    v_nome := nomes[1 + i % 10] || ' ' || sobren[1 + i % 7];
    v_fone := '+5534997' || lpad(i::text, 6, '0');
    v_pacote := v_pacotes[1 + i % array_length(v_pacotes, 1)];
    select p.nome, coalesce(p.min_convidados, 30), coalesce(p.max_convidados, 200)
      into v_pac_nome, v_min, v_max from public.pacotes p where p.id = v_pacote;
    v_conv := least(v_max, v_min + (i * 7) % greatest(v_max - v_min + 1, 1));
    v_total := public._apresentacao_total(v_pacote, v_conv);
    v_data := (current_date + (i * 3 % 50) + 20)::date;
    v_turno := v_turnos[1 + i % array_length(v_turnos, 1)];

    insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
      responsavel_id, criado_em, ultima_atividade_em, perdido_em, motivo_perda_codigo, status_antes_de_perder,
      primeiro_contato_em, consentimento_em, consentimento_versao, consentimento_texto)
    values (p_empresa, v_nome, v_fone,
      case when i % 11 = 0 then 'interno' else origens[1 + i % 8] end,
      v_status,
      (case when i % 5 = 0 then 'quente' when i % 3 = 0 then 'morno' else 'frio' end)::public.temperatura_lead,
      case when i % 4 = 0 then 3 else 6 end,
      v_dono, v_criado, v_criado + interval '1 day',
      case when v_status = 'perdido' then v_criado + ((i % 9) + 2) * interval '1 day' end,
      case when v_status = 'perdido' then motivos[1 + i % 7] end,
      case when v_status = 'perdido' then 'em_andamento'::public.status_lead end,
      case when i % 4 <> 3 then v_criado + ((i * 17) % 300 + 5) * interval '1 minute' end,
      v_criado, 'apresentacao', consent)
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
        jsonb_build_object('tipoEventoId', v_tipo, 'turnoId', v_turno, 'adultos', v_conv,
          'criancas', '[]'::jsonb, 'opcionais', '[]'::jsonb, 'horasExtras', 0,
          'pacoteId', v_pacote, 'data', v_data::text),
        6,
        jsonb_build_object('versaoMotor', 1, 'ok', true, 'erros', '[]'::jsonb, 'avisos', '[]'::jsonb,
          'convidadosEquivalentes', v_conv, 'pessoasFisicas', v_conv,
          'linhas', jsonb_build_array(jsonb_build_object('tipo', 'pacote', 'descricao', 'Pacote ' || v_pac_nome,
            'quantidade', v_conv, 'valorUnitarioCentavos', v_total / v_conv,
            'subtotalCentavos', v_total, 'detalhe', v_conv || ' convidados')),
          'subtotalCentavos', v_total, 'descontoCentavos', 0, 'totalCentavos', v_total,
          'porConvidadoCentavos', v_total / v_conv, 'sinalCentavos', v_total * 3 / 10,
          'saldoCentavos', v_total - v_total * 3 / 10, 'parcelas', '[]'::jsonb),
        v_total,
        case when i % 9 = 4 then current_date - 2 else (v_criado + interval '15 days')::date end,
        v_tipo, v_data, v_turno, v_espaco, v_conv, v_pacote,
        public._apresentacao_conteudo(p_empresa, v_pacote, v_conv, v_nome, v_data, v_tipo),
        v_criado + interval '20 minutes', v_criado + interval '2 hours', 1 + i % 3,
        v_criado + interval '1 day', v_criado + interval '10 minutes')
      returning id into v_orc;

      insert into public.orcamento_itens (empresa_id, orcamento_id, ordem, tipo, descricao, quantidade,
        valor_unitario_centavos, subtotal_centavos, detalhe, referencia_id)
      values (p_empresa, v_orc, 0, 'pacote', 'Pacote ' || v_pac_nome, v_conv, v_total / v_conv,
        v_total, v_conv || ' convidados', v_pacote);

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

    -- reservado: reserva confirmada (turnos alternados; data ocupada fica de fora)
    if v_status = 'reservado' and not exists (
      select 1 from public.reservas r where r.empresa_id = p_empresa and r.data = v_data
        and r.turno_id = v_turno and r.status = 'ativa') then
      insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, origem,
        cliente_nome, cliente_whatsapp_e164, tipo_evento_id, convidados, valor_total_centavos,
        sinal_centavos, sinal_pago_em, lead_id, orcamento_id, criado_em, confirmada_em, confirmada_por)
      select p_empresa, v_espaco, t.id, v_data, iv.inicio, iv.fim, 'confirmada', 'ativa', 'orcamento',
        v_nome, v_fone, v_tipo, v_conv, v_total, v_total * 3 / 10,
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
  -- tarefas (atrasada e de hoje), uma nota e um aviso
  insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
    criado_em, ultima_atividade_em, consentimento_em, consentimento_versao, consentimento_texto)
  values (p_empresa, 'Carla Mendes', '+5534997900001', 'instagram', 'novo', 'morno', 4,
    now() - interval '40 minutes', now() - interval '35 minutes', now() - interval '40 minutes',
    'apresentacao', consent),
    (p_empresa, 'Rafael Souza', '+5534997900002', 'qrcode', 'novo', 'frio', 3,
    now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours',
    'apresentacao', consent);

  v_numero := v_numero + 1;
  v_data := current_date + 26;
  v_pacote := v_pacotes[least(2, array_length(v_pacotes, 1))];
  select p.nome, coalesce(p.min_convidados, 30), coalesce(p.max_convidados, 200)
    into v_pac_nome, v_min, v_max from public.pacotes p where p.id = v_pacote;
  v_conv := least(v_max, greatest(v_min, 100));
  v_total := public._apresentacao_total(v_pacote, v_conv);
  insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
    responsavel_id, criado_em, ultima_atividade_em, consentimento_em, consentimento_versao, consentimento_texto)
  values (p_empresa, 'Patrícia Lima', '+5534997900003', 'whatsapp', 'pre_reservado', 'quente', 6, v_dono,
    now() - interval '5 hours', now() - interval '1 hour', now() - interval '5 hours', 'apresentacao', consent)
  returning id into v_lead;
  insert into public.orcamentos (empresa_id, lead_id, numero, token, status, canal, origem, rascunho,
    passo_atual, resultado, total_centavos, validade_ate, tipo_evento_id, data, turno_id, espaco_id,
    convidados, pacote_id, conteudo, enviado_em, aceito_em, criado_em)
  values (p_empresa, v_lead, v_numero, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    'aceito', 'publico', 'whatsapp',
    jsonb_build_object('tipoEventoId', v_tipo, 'turnoId', v_turnos[1], 'adultos', v_conv,
      'criancas', '[]'::jsonb, 'opcionais', '[]'::jsonb, 'horasExtras', 0, 'pacoteId', v_pacote,
      'data', v_data::text),
    6,
    jsonb_build_object('versaoMotor', 1, 'ok', true, 'erros', '[]'::jsonb, 'avisos', '[]'::jsonb,
      'convidadosEquivalentes', v_conv, 'pessoasFisicas', v_conv,
      'linhas', jsonb_build_array(jsonb_build_object('tipo', 'pacote', 'descricao', 'Pacote ' || v_pac_nome,
        'quantidade', v_conv, 'valorUnitarioCentavos', v_total / v_conv, 'subtotalCentavos', v_total,
        'detalhe', v_conv || ' convidados')),
      'subtotalCentavos', v_total, 'descontoCentavos', 0, 'totalCentavos', v_total,
      'porConvidadoCentavos', v_total / v_conv, 'sinalCentavos', v_total * 3 / 10,
      'saldoCentavos', v_total - v_total * 3 / 10, 'parcelas', '[]'::jsonb),
    v_total, current_date + 15, v_tipo, v_data, v_turnos[1], v_espaco, v_conv, v_pacote,
    public._apresentacao_conteudo(p_empresa, v_pacote, v_conv, 'Patrícia Lima', v_data, v_tipo),
    now() - interval '4 hours', now() - interval '1 hour', now() - interval '5 hours')
  returning id into v_orc;
  insert into public.orcamento_itens (empresa_id, orcamento_id, ordem, tipo, descricao, quantidade,
    valor_unitario_centavos, subtotal_centavos, detalhe, referencia_id)
  values (p_empresa, v_orc, 0, 'pacote', 'Pacote ' || v_pac_nome, v_conv, v_total / v_conv, v_total,
    v_conv || ' convidados', v_pacote);
  if not exists (select 1 from public.reservas r where r.empresa_id = p_empresa and r.data = v_data
                 and r.turno_id = v_turnos[1] and r.status = 'ativa') then
    insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, expira_em,
      origem, cliente_nome, cliente_whatsapp_e164, tipo_evento_id, convidados, valor_total_centavos,
      observacoes, lead_id, orcamento_id)
    select p_empresa, v_espaco, t.id, v_data, iv.inicio, iv.fim, 'pre_reserva', 'ativa',
      now() + interval '40 hours', 'link_publico', 'Patrícia Lima', '+5534997900003', v_tipo, v_conv,
      v_total, 'Pré-reserva pelo link (orçamento nº ' || v_numero || ').', v_lead, v_orc
    from public.turnos t
    cross join lateral public._agenda_intervalo(v_data, t.hora_inicio, t.duracao_min, v_e.fuso, v_interv) iv
    where t.id = v_turnos[1];
  end if;
  insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
  values (p_empresa, v_lead, v_orc, 'pre_reserva_pedida', jsonb_build_object('data', v_data), 'cliente',
    now() - interval '1 hour');
  insert into public.avisos (empresa_id, usuario_id, tipo, lead_id, chave, criado_em, agendado_para, dados)
  values (p_empresa, v_dono, 'pre_reserva_pedida', v_lead, 'apresentacao:aviso:pre:' || v_lead,
    now() - interval '1 hour', now() - interval '1 hour',
    jsonb_build_object('lead_nome', 'Patrícia Lima', 'data', v_data))
  on conflict do nothing;
  insert into public.tarefas (empresa_id, lead_id, orcamento_id, titulo, responsavel_id, vence_em, criado_por)
  values (p_empresa, v_lead, v_orc, 'Confirmar o sinal da pré-reserva', v_dono, now() + interval '3 hours', v_dono);

  insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
    responsavel_id, criado_em, ultima_atividade_em, consentimento_em, consentimento_versao, consentimento_texto)
  values (p_empresa, 'Igor Teixeira', '+5534997900004', 'google', 'em_andamento', 'quente', 6, v_dono,
    now() - interval '1 day', now() - interval '2 hours', now() - interval '1 day', 'apresentacao', consent)
  returning id into v_lead;
  insert into public.visitas (empresa_id, lead_id, data_preferida, periodo, observacoes)
  values (p_empresa, v_lead, current_date + 2, 'tarde', 'Quero ver o espaço montado.');
  insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, criado_em)
  values (p_empresa, v_lead, 'visita_pedida',
    jsonb_build_object('data_preferida', current_date + 2, 'periodo', 'tarde'), 'cliente', now() - interval '2 hours');
  insert into public.notas (empresa_id, lead_id, autor_id, texto)
  values (p_empresa, v_lead, v_dono, 'Prefere sábado à noite. Quer ver o espaço antes de fechar.');
  insert into public.tarefas (empresa_id, lead_id, titulo, responsavel_id, vence_em, criado_por, criado_em)
  values (p_empresa, v_lead, 'Ligar para combinar a visita', v_dono, now() - interval '20 hours', v_dono,
    now() - interval '1 day');

  -- isenta: situação "ativo" (sem faixa de teste nem cobrança)
  perform public._atualizar_situacao(p_empresa);
  return v_n + 4;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Contrato já assinado de exemplo (mesmo desenho do da demo)
-- ---------------------------------------------------------------------------------------------

create or replace function public.apresentacao_contrato_exemplo(p_empresa uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e    public.empresas;
  v_r    public.reservas;
  v_dono public.usuarios;
  v_id   uuid;
  v_hash text := encode(sha256(convert_to(p ->> 'texto', 'UTF8')), 'hex');
  v_env  timestamptz := now() - interval '3 days';
  v_fim  timestamptz := now() - interval '2 days';
begin
  select * into v_e from public.empresas e where e.id = p_empresa;
  if v_e.id is null or not v_e.eh_apresentacao then
    raise exception 'APRESENTACAO_INVALIDA' using errcode = 'check_violation';
  end if;
  select * into v_r from public.reservas r
  where r.id = nullif(p ->> 'reserva_id', '')::uuid and r.empresa_id = p_empresa and r.lead_id is not null;
  if v_r.id is null then
    return null;
  end if;
  select * into v_dono from public.usuarios u where u.empresa_id = p_empresa and u.perfil = 'dono' limit 1;
  insert into public.contratos (empresa_id, ano, numero, lead_id, orcamento_id, reserva_id, modelo_origem,
    titulo, status, texto, hash, valores, variaveis, token_hash, expira_em, enviado_em, enviado_por,
    visualizado_em, concluido_em, criado_por)
  values (p_empresa, extract(year from now())::integer, 1, v_r.lead_id, v_r.orcamento_id, v_r.id,
    nullif(p ->> 'modelo_origem', ''),
    coalesce(nullif(p ->> 'titulo', ''), 'Contrato de prestação de serviços'), 'concluido',
    p ->> 'texto', v_hash, coalesce(p -> 'valores', '{}'::jsonb), '{}'::jsonb,
    encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
    v_env + interval '14 days', v_env, v_dono.id, v_env + interval '2 hours', v_fim, v_dono.id)
  returning id into v_id;
  insert into public.contrato_assinaturas (empresa_id, contrato_id, parte, nome, representa,
    documento_mascarado, usuario_id, assinado_em, hash_documento, metodo)
  values (p_empresa, v_id, 'buffet', v_dono.nome, v_e.nome, null, v_dono.id, v_env, v_hash, 'aceite');
  insert into public.contrato_assinaturas (empresa_id, contrato_id, parte, nome, documento_mascarado,
    assinado_em, hash_documento, metodo, codigo_verificado)
  values (p_empresa, v_id, 'cliente', coalesce(nullif(p ->> 'cliente', ''), v_r.cliente_nome),
          '***.123.456-**', v_fim, v_hash, 'aceite', false);
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados, criado_em)
  values
    (p_empresa, v_dono.id, 'contrato.enviado', 'contrato', v_id, jsonb_build_object('versao', 1), v_env),
    (p_empresa, null, 'contrato.visualizado', 'contrato', v_id, jsonb_build_object('primeira', true),
     v_env + interval '2 hours'),
    (p_empresa, null, 'contrato.assinado', 'contrato', v_id,
     jsonb_build_object('parte', 'cliente', 'metodo', 'aceite'), v_fim);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Permissões: só a conexão administrativa (/interno)
-- ---------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.apresentacao_criar(text, public.segmento_empresa, text, text, text, text, text[], uuid, text, text, text)',
    'public._apresentacao_total(uuid, integer)',
    'public._apresentacao_conteudo(uuid, uuid, integer, text, date, uuid)',
    'public.apresentacao_popular(uuid)',
    'public.apresentacao_contrato_exemplo(uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
