-- Seed de desenvolvimento. Dados 100% fictícios.
-- Senha de todos os usuários: demo12345
--
--   Buffet Demo (infantil)  → dono@demo.local (dono), vendedor@demo.local (vendedor)
--   Buffet Teste B (eventos) → dono@testeb.local (dono)   — para testar isolamento entre empresas
--
-- Os usuários do Auth são criados SEM nome_buffet nos metadados, então o trigger de cadastro
-- não age; empresas e usuarios são inseridos explicitamente com ids fixos.

insert into public.empresas (id, nome, slug, segmento, whatsapp_e164, email, cidade, uf, plano, trial_ate)
values
  ('11111111-1111-4111-8111-111111111111', 'Buffet Demo', 'buffet-demo', 'infantil',
   '+5534991000001', 'contato@demo.local', 'Uberlândia', 'MG', 'trial', now() + interval '14 days'),
  ('22222222-2222-4222-8222-222222222222', 'Buffet Teste B', 'buffet-teste-b', 'eventos',
   '+5511991000002', 'contato@testeb.local', 'São Paulo', 'SP', 'trial', now() + interval '14 days')
on conflict (id) do nothing;

with novos (id, email, nome) as (
  values
    ('1a000000-0000-4000-8000-000000000001'::uuid, 'dono@demo.local', 'Dona Demo'),
    ('1a000000-0000-4000-8000-000000000002'::uuid, 'vendedor@demo.local', 'Vendedor Demo'),
    ('2b000000-0000-4000-8000-000000000001'::uuid, 'dono@testeb.local', 'Dono Teste B')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', n.id, 'authenticated', 'authenticated', n.email,
  extensions.crypt('demo12345', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  jsonb_build_object('nome', n.nome),
  now(), now(), '', '', '', ''
from novos n
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id, u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.id in (
  '1a000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000002',
  '2b000000-0000-4000-8000-000000000001'
)
on conflict do nothing;

insert into public.usuarios (id, empresa_id, nome, email, whatsapp_e164, perfil, limite_desconto_pct)
values
  ('1a000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'Dona Demo', 'dono@demo.local', '+5534991000001', 'dono', 100),
  ('1a000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'Vendedor Demo', 'vendedor@demo.local', '+5534991000003', 'vendedor', 5),
  ('2b000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'Dono Teste B', 'dono@testeb.local', '+5511991000002', 'dono', 100)
on conflict (id) do nothing;

insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
select e.id, null, 'seed.criada', 'empresa', e.id, '{"origem": "seed"}'::jsonb
from public.empresas e
where e.id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
  and not exists (select 1 from public.auditoria a where a.empresa_id = e.id and a.acao = 'seed.criada');

-- ---------------------------------------------------------------------------
-- Catálogo do Buffet Demo = modelo infantil (src/domain/modelos/infantil.ts).
-- Um teste de integração confere que os dois continuam iguais.
-- Idempotente: só grava se o Buffet Demo ainda não tiver pacotes.
-- O Buffet Teste B fica sem catálogo (testes de isolamento e de "carregar modelo").
-- ---------------------------------------------------------------------------
do $$
declare
  demo constant uuid := '11111111-1111-4111-8111-111111111111';
  t_aniversario uuid;
  p_alegria uuid;
  p_super uuid;
  p_encanto uuid;
  o_personagem uuid;
  o_bolo uuid;
begin
  if exists (select 1 from public.pacotes where empresa_id = demo) then
    return;
  end if;

  insert into public.tipos_evento (empresa_id, nome, icone, ordem)
    values (demo, 'Aniversário infantil', 'party-popper', 0) returning id into t_aniversario;
  insert into public.tipos_evento (empresa_id, nome, icone, ordem)
    values (demo, 'Chá revelação', 'baby', 1);
  insert into public.tipos_evento (empresa_id, nome, icone, ordem)
    values (demo, 'Batizado', 'church', 2);

  insert into public.espacos (empresa_id, nome, capacidade_max, no_local_do_cliente, ordem)
    values (demo, 'Salão principal', 120, false, 0);

  insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana, ordem) values
    (demo, 'Almoço', '10:00', 240, '{0,1,2,3,4,5,6}', 0),
    (demo, 'Tarde', '15:00', 240, '{0,1,2,3,4,5,6}', 1),
    (demo, 'Noite', '20:00', 240, '{0,1,2,3,4,5,6}', 2);

  insert into public.ajustes_dia (empresa_id, tipo, dia_semana, ajuste_bp) values
    (demo, 'dia_semana', 1, -1500),
    (demo, 'dia_semana', 2, -1500),
    (demo, 'dia_semana', 3, -1500),
    (demo, 'dia_semana', 4, -1500),
    (demo, 'dia_semana', 6, 1000);

  insert into public.faixas_idade (empresa_id, rotulo, idade_min, idade_max, fator_bp, ordem) values
    (demo, '0 a 5 anos', 0, 5, 0, 0),
    (demo, '6 a 10 anos', 6, 10, 5000, 1),
    (demo, '11 anos ou mais', 11, null, 10000, 2);

  insert into public.pacotes (empresa_id, nome, subtitulo, descricao, destaque, modelo_preco,
      valor_excedente_centavos, min_convidados, max_convidados, duracao_inclusa_min,
      valor_hora_extra_centavos, ordem)
    values (demo, 'Alegria', 'O essencial para uma festa gostosa',
      'Salgados fritos na hora, bebidas, doces e bolo.', false, 'por_faixa',
      7500, 15, 120, 240, 35000, 0)
    returning id into p_alegria;
  insert into public.pacotes (empresa_id, nome, subtitulo, descricao, destaque, modelo_preco,
      valor_excedente_centavos, min_convidados, max_convidados, duracao_inclusa_min,
      valor_hora_extra_centavos, ordem)
    values (demo, 'Super', 'O mais escolhido',
      'Mais variedade de salgados, prato quente e mesa de doces.', true, 'por_faixa',
      8500, 15, 120, 240, 45000, 1)
    returning id into p_super;
  insert into public.pacotes (empresa_id, nome, subtitulo, descricao, destaque, modelo_preco,
      valor_excedente_centavos, min_convidados, max_convidados, duracao_inclusa_min,
      valor_hora_extra_centavos, ordem)
    values (demo, 'Encanto', 'Completo, com bolo cenográfico',
      'Tudo do Super, mais finger foods, doces finos e bolo cenográfico.', false, 'por_faixa',
      10500, 15, 120, 240, 60000, 2)
    returning id into p_encanto;

  insert into public.faixas_preco (empresa_id, pacote_id, ate_convidados, valor_centavos) values
    (demo, p_alegria, 30, 290000), (demo, p_alegria, 50, 390000), (demo, p_alegria, 80, 560000),
    (demo, p_super, 30, 340000), (demo, p_super, 50, 450000), (demo, p_super, 80, 650000),
    (demo, p_encanto, 30, 420000), (demo, p_encanto, 50, 560000), (demo, p_encanto, 80, 810000);

  insert into public.secoes_cardapio (empresa_id, pacote_id, nome, itens, ordem) values
    (demo, p_alegria, 'Salgados', '{"Coxinha","Bolinha de queijo","Risole de carne","Enroladinho de salsicha"}', 0),
    (demo, p_alegria, 'Bebidas', '{"Refrigerante","Suco natural","Água"}', 1),
    (demo, p_alegria, 'Doces', '{"Brigadeiro","Beijinho"}', 2),
    (demo, p_alegria, 'Bolo', '{"Bolo de chocolate com brigadeiro"}', 3),
    (demo, p_super, 'Entradas', '{"Mini pizza","Pão de queijo"}', 0),
    (demo, p_super, 'Salgados', '{"Coxinha","Kibe","Esfiha","Empadinha","Risole de queijo"}', 1),
    (demo, p_super, 'Prato quente', '{"Mini hambúrguer","Batata frita"}', 2),
    (demo, p_super, 'Bebidas', '{"Refrigerante","Suco natural","Água"}', 3),
    (demo, p_super, 'Doces', '{"Brigadeiro","Beijinho","Cajuzinho","Bicho de pé"}', 4),
    (demo, p_encanto, 'Finger foods', '{"Mini quiche","Bruschetta","Mini wrap"}', 0),
    (demo, p_encanto, 'Salgados', '{"Coxinha","Kibe","Esfiha","Empadinha","Croquete"}', 1),
    (demo, p_encanto, 'Prato quente', '{"Escondidinho","Mini hambúrguer","Batata rústica"}', 2),
    (demo, p_encanto, 'Bebidas', '{"Refrigerante","Suco natural","Água aromatizada"}', 3),
    (demo, p_encanto, 'Doces finos', '{"Brigadeiro gourmet","Trufa","Camafeu","Bombom de uva"}', 4);

  insert into public.opcionais (empresa_id, nome, descricao, cobranca, preco_centavos, qtd_min, qtd_max, ordem)
    values (demo, 'Mesa temática', 'Decoração da mesa do bolo no tema da festa.', 'fixo', 60000, 1, 1, 0);
  insert into public.opcionais (empresa_id, nome, descricao, cobranca, preco_centavos, qtd_min, qtd_max, ordem)
    values (demo, 'Personagem vivo', 'Personagem animando a festa por 1 hora.', 'por_unidade', 35000, 1, 3, 1)
    returning id into o_personagem;
  insert into public.opcionais (empresa_id, nome, descricao, cobranca, preco_centavos, qtd_min, qtd_max, ordem)
    values (demo, 'Recreação extra', 'Monitor de recreação adicional.', 'por_hora', 18000, 1, 4, 2);
  insert into public.opcionais (empresa_id, nome, descricao, cobranca, preco_centavos, qtd_min, qtd_max, ordem)
    values (demo, 'Bolo cenográfico', 'Bolo decorativo para as fotos.', 'fixo', 25000, 1, 1, 3)
    returning id into o_bolo;

  insert into public.opcional_tipos_evento (empresa_id, opcional_id, tipo_evento_id)
    values (demo, o_personagem, t_aniversario);
  insert into public.opcional_pacotes (empresa_id, opcional_id, pacote_id, relacao)
    values (demo, o_bolo, p_encanto, 'incluso');

  update public.regras_comerciais set
    validade_dias = 15,
    prazo_pre_reserva_horas = 48,
    antecedencia_min_dias = 7,
    sinal_bp = 3000,
    parcelas_max = 3,
    prazo_ultima_parcela_dias = 7,
    formas_pagamento = '{"Pix","Cartão de crédito"}',
    condicoes_texto = 'Sinal de 30% para reservar a data. Saldo parcelado, com a última parcela até 7 dias antes da festa.',
    nao_incluso_texto = 'Bebidas alcoólicas, decoração personalizada e itens que não estão no pacote.',
    cancelamento_texto = 'Cancelamento com mais de 30 dias de antecedência: devolução de 50% do sinal. Com menos de 30 dias, o sinal não é devolvido.',
    modo_exibicao_preco = 'exato',
    ajuste_incide = 'pacote',
    deslocamento_modelo = 'nenhum',
    deslocamento_km_gratis = 0,
    deslocamento_valor_km_centavos = 0
  where empresa_id = demo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Agenda do Buffet Demo (Etapa 3). Datas relativas a hoje, para o seed nunca envelhecer.
-- Idempotente: só grava se o Buffet Demo ainda não tiver reservas.
--   3 reservas confirmadas no próximo mês (dias 25, 26 e 27, turnos diferentes)
--   1 pré-reserva que vence em 20h, 1 pré-reserva já vencida
--   1 bloqueio de dia inteiro e 1 bloqueio de um turno
-- ---------------------------------------------------------------------------
do $$
declare
  demo      constant uuid := '11111111-1111-4111-8111-111111111111';
  dona      constant uuid := '1a000000-0000-4000-8000-000000000001';
  vendedor  constant uuid := '1a000000-0000-4000-8000-000000000002';
  v_espaco  uuid;
  v_fuso    text;
  v_interv  integer;
  v_mes     date := (date_trunc('month', current_date) + interval '1 month')::date;
begin
  if exists (select 1 from public.reservas where empresa_id = demo) then
    return;
  end if;
  select id into v_espaco from public.espacos where empresa_id = demo order by ordem limit 1;
  if v_espaco is null then
    return;
  end if;
  select e.fuso, r.intervalo_entre_eventos_min into v_fuso, v_interv
  from public.empresas e join public.regras_comerciais r on r.empresa_id = e.id where e.id = demo;

  insert into public.reservas (
    empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, expira_em, cliente_nome,
    cliente_whatsapp_e164, convidados, valor_total_centavos, sinal_centavos, sinal_pago_em,
    criado_por, confirmada_por, confirmada_em
  )
  select demo, v_espaco, t.id, x.data, i.inicio, i.fim, x.tipo::public.tipo_reserva,
         x.status::public.status_reserva, x.expira_em, x.cliente, x.whatsapp, x.convidados,
         x.valor, x.sinal, x.sinal_pago_em, x.criado_por,
         case when x.tipo = 'confirmada' then x.criado_por end,
         case when x.tipo = 'confirmada' then now() end
  from (values
    ('Almoço', v_mes + 24, 'confirmada', 'ativa', null::timestamptz, 'Ana Paula Ribeiro',
     '+5534991112201', 60, 650000, 195000, current_date, dona),
    ('Tarde', v_mes + 25, 'confirmada', 'ativa', null::timestamptz, 'Carlos Menezes',
     '+5534991112202', 80, 780000, 234000, current_date, dona),
    ('Noite', v_mes + 26, 'confirmada', 'ativa', null::timestamptz, 'Juliana Prado',
     null, 45, null, null, null, vendedor),
    ('Tarde', current_date + 3, 'pre_reserva', 'ativa', now() + interval '20 hours',
     'Mariana Costa', '+5534991112204', 50, null, null, null, vendedor),
    ('Noite', current_date + 4, 'pre_reserva', 'vencida', now() - interval '2 hours',
     'Roberto Lima', '+5534991112205', 70, null, null, null, vendedor)
  ) as x(turno, data, tipo, status, expira_em, cliente, whatsapp, convidados, valor, sinal,
         sinal_pago_em, criado_por)
  join public.turnos t on t.empresa_id = demo and t.nome = x.turno
  cross join lateral public._agenda_intervalo(x.data, t.hora_inicio, t.duracao_min, v_fuso, v_interv) i;

  insert into public.bloqueios (empresa_id, data, turno_id, espaco_id, motivo, criado_por)
  values (demo, current_date + 5, null, null, 'Manutenção do salão', dona);
  insert into public.bloqueios (empresa_id, data, turno_id, espaco_id, motivo, criado_por)
  select demo, current_date + 6, t.id, v_espaco, 'Evento da família', dona
  from public.turnos t where t.empresa_id = demo and t.nome = 'Noite';
end;
$$;

-- ---------------------------------------------------------------------------
-- Leads do link público (Etapa 4). Datas relativas a hoje. Idempotente: só grava se o Buffet
-- Demo ainda não tiver leads.
--   Carla (novo: deu o WhatsApp, está escolhendo o pacote)
--   Rafael (em andamento: viu a proposta; pediu visita)
--   Beatriz (abandonou: parou antes de concluir, há 2 dias)
--   Patrícia (pré-reservado: pré-reserva pelo link, vence em 40h)
--   Marcos (reservado: pré-reserva pelo link confirmada com sinal)
-- Teste B: 1 lead novo. Funil: algumas sessões anônimas.
-- ---------------------------------------------------------------------------
do $$
declare
  demo      constant uuid := '11111111-1111-4111-8111-111111111111';
  teste_b   constant uuid := '22222222-2222-4222-8222-222222222222';
  dona      constant uuid := '1a000000-0000-4000-8000-000000000001';
  v_tipo    uuid;
  v_espaco  uuid;
  v_fuso    text;
  v_interv  integer;
  v_lead    uuid;
  v_orc     uuid;
  r         record;
begin
  if exists (select 1 from public.leads where empresa_id = demo) then
    return;
  end if;
  select id into v_tipo from public.tipos_evento where empresa_id = demo order by ordem limit 1;
  select id into v_espaco from public.espacos where empresa_id = demo order by ordem limit 1;
  if v_tipo is null or v_espaco is null then
    return;
  end if;
  select e.fuso, rc.intervalo_entre_eventos_min into v_fuso, v_interv
  from public.empresas e join public.regras_comerciais rc on rc.empresa_id = e.id where e.id = demo;

  for r in
    select * from (values
      (1, 'Carla Mendes', '+5534991113301', 'instagram', 'novo', 'frio', 4, interval '2 hours',
       'em_montagem', 'Tarde', 35, 55, null::integer, null::text),
      (2, 'Rafael Souza', '+5534991113302', 'google', 'em_andamento', 'quente', 6, interval '5 hours',
       'visualizado', 'Tarde', 40, 60, 450000, null),
      (3, 'Beatriz Nunes', '+5534991113303', 'link_direto', 'abandonou', 'frio', 3, interval '2 days',
       'em_montagem', 'Almoço', 50, 40, null, null),
      (4, 'Patrícia Lima', '+5534991113304', 'whatsapp', 'pre_reservado', 'quente', 6, interval '1 hour',
       'aceito', 'Noite', 45, 70, 560000, 'pre_reserva'),
      (5, 'Marcos Oliveira', '+5534991113305', 'indicacao', 'reservado', 'quente', 6, interval '1 day',
       'aceito', 'Almoço', 60, 80, 680000, 'confirmada')
    ) as x(n, nome, whatsapp, origem, status, temperatura, passo, ha, status_orc, turno, dias,
           convidados, total, reserva)
  loop
    insert into public.leads (
      empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
      consentimento_em, consentimento_versao, consentimento_texto, ultima_atividade_em, criado_em
    ) values (
      demo, r.nome, r.whatsapp, r.origem::public.origem_lead, r.status::public.status_lead,
      r.temperatura::public.temperatura_lead, r.passo, now() - r.ha - interval '10 minutes',
      '2026-10-v1', 'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.',
      now() - r.ha, now() - r.ha - interval '10 minutes'
    ) returning id into v_lead;

    insert into public.orcamentos (
      empresa_id, lead_id, numero, token, status, canal, origem, rascunho, passo_atual,
      resultado, total_centavos, validade_ate, tipo_evento_id, data, turno_id, espaco_id,
      convidados, enviado_em, aceito_em, criado_em
    )
    select demo, v_lead, r.n, 'seedDemoOrcamento' || r.n || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
           r.status_orc::public.status_orcamento, 'publico', r.origem::public.origem_lead,
           jsonb_build_object('tipoEventoId', v_tipo, 'turnoId', t.id, 'adultos', r.convidados,
                              'criancas', '[]'::jsonb, 'opcionais', '[]'::jsonb, 'horasExtras', 0,
                              'data', (current_date + r.dias)::text),
           r.passo,
           case when r.total is not null then jsonb_build_object(
             'versaoMotor', 1, 'ok', true, 'erros', '[]'::jsonb, 'avisos', '[]'::jsonb,
             'convidadosEquivalentes', r.convidados, 'pessoasFisicas', r.convidados,
             'linhas', '[]'::jsonb, 'subtotalCentavos', r.total, 'descontoCentavos', 0,
             'totalCentavos', r.total, 'porConvidadoCentavos', r.total / r.convidados,
             'sinalCentavos', r.total * 3 / 10, 'saldoCentavos', r.total - r.total * 3 / 10,
             'parcelas', '[]'::jsonb) end,
           r.total, case when r.total is not null then current_date + 15 end,
           v_tipo, current_date + r.dias, t.id, v_espaco, r.convidados,
           case when r.total is not null then now() - r.ha end,
           case when r.status_orc = 'aceito' then now() - r.ha end,
           now() - r.ha - interval '8 minutes'
    from public.turnos t where t.empresa_id = demo and t.nome = r.turno
    returning id into v_orc;

    if r.total is not null then
      insert into public.orcamento_itens (empresa_id, orcamento_id, ordem, tipo, descricao, quantidade,
        valor_unitario_centavos, subtotal_centavos, detalhe)
      values
        (demo, v_orc, 0, 'pacote', 'Pacote Super', r.convidados, (r.total - 60000) / r.convidados,
         r.total - 60000, r.convidados || ' convidados equivalentes'),
        (demo, v_orc, 1, 'opcional', 'Mesa temática', 1, 60000, 60000, 'Valor fixo');
    end if;

    insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
    values
      (demo, v_lead, null, 'lead_criado', jsonb_build_object('origem', r.origem), 'cliente',
       now() - r.ha - interval '10 minutes'),
      (demo, v_lead, v_orc, 'orcamento_iniciado', jsonb_build_object('numero', r.n), 'cliente',
       now() - r.ha - interval '8 minutes');
    if r.total is not null then
      insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
      values (demo, v_lead, v_orc, 'orcamento_concluido',
              jsonb_build_object('total_centavos', r.total, 'data', current_date + r.dias),
              'cliente', now() - r.ha - interval '2 minutes');
    end if;
    if r.status = 'abandonou' then
      insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, criado_em)
      values (demo, v_lead, 'status_alterado',
              jsonb_build_object('status_antes', 'novo', 'status_depois', 'abandonou'), 'sistema',
              now() - r.ha + interval '24 hours');
    end if;

    if r.reserva is not null then
      insert into public.reservas (
        empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, expira_em, origem,
        cliente_nome, cliente_whatsapp_e164, tipo_evento_id, convidados, valor_total_centavos,
        sinal_centavos, sinal_pago_em, observacoes, lead_id, orcamento_id, confirmada_por,
        confirmada_em
      )
      select demo, v_espaco, t.id, current_date + r.dias, i.inicio, i.fim,
             r.reserva::public.tipo_reserva, 'ativa',
             case when r.reserva = 'pre_reserva' then now() + interval '40 hours' end,
             'link_publico', r.nome, r.whatsapp, v_tipo, r.convidados, r.total,
             case when r.reserva = 'confirmada' then r.total * 3 / 10 end,
             case when r.reserva = 'confirmada' then current_date end,
             'Pré-reserva pelo link (orçamento nº ' || r.n || ').', v_lead, v_orc,
             case when r.reserva = 'confirmada' then dona end,
             case when r.reserva = 'confirmada' then now() - interval '20 hours' end
      from public.turnos t
      cross join lateral public._agenda_intervalo(current_date + r.dias, t.hora_inicio,
        t.duracao_min, v_fuso, v_interv) i
      where t.empresa_id = demo and t.nome = r.turno;

      insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, usuario_id, criado_em)
      values (demo, v_lead, v_orc, 'pre_reserva_pedida',
              jsonb_build_object('data', current_date + r.dias), 'cliente', null, now() - r.ha);
      if r.reserva = 'confirmada' then
        insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, usuario_id, criado_em)
        values (demo, v_lead, v_orc, 'reserva_confirmada',
                jsonb_build_object('data', current_date + r.dias), 'usuario', dona,
                now() - interval '20 hours');
      end if;
    end if;

    if r.n = 2 then
      insert into public.visitas (empresa_id, lead_id, orcamento_id, data_preferida, periodo, observacoes)
      values (demo, v_lead, v_orc, current_date + 3, 'tarde', 'Quero ver o salão montado.');
      insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
      values (demo, v_lead, v_orc, 'visita_pedida',
              jsonb_build_object('data_preferida', current_date + 3, 'periodo', 'tarde'), 'cliente',
              now() - r.ha);
    end if;
  end loop;

  -- Funil: sessões anônimas (sem dado pessoal).
  insert into public.funil_eventos (empresa_id, sessao, passo, evento, origem, criado_em)
  select demo, s.sessao, p.passo, 'passo_visto', 'instagram', now() - interval '1 day' + p.passo * interval '1 minute'
  from (values ('5e000000-0000-4000-8000-000000000001'::uuid, 6),
               ('5e000000-0000-4000-8000-000000000002'::uuid, 3),
               ('5e000000-0000-4000-8000-000000000003'::uuid, 1)) as s(sessao, ate)
  cross join generate_series(0, 6) as p(passo)
  where p.passo <= s.ate;

  -- Teste B: um lead novo, sem orçamento concluído.
  if exists (select 1 from public.empresas where id = teste_b) then
    insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, ultimo_passo,
      consentimento_em, consentimento_versao, consentimento_texto)
    values (teste_b, 'Lead do Teste B', '+5534991113399', 'link_direto', 'novo', 3, now(),
      '2026-10-v1', 'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.')
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Proposta (Etapa 5): rodapé do Buffet Demo, textos de abertura e política de convidados.
-- Idempotente: só preenche o que estiver vazio.
-- ---------------------------------------------------------------------------
update public.empresas set
  razao_social = coalesce(razao_social, 'Buffet Demo Festas Ltda'),
  cnpj = coalesce(cnpj, '11222333000181'),
  endereco = coalesce(endereco, 'Av. Rondon Pacheco, 1000 - Uberlândia/MG')
where id = '11111111-1111-4111-8111-111111111111';

update public.tipos_evento set texto_abertura = case nome
    when 'Aniversário infantil' then 'Olá, {nome}! Que alegria fazer parte desse dia. Preparamos a proposta do aniversário em {data}, para {convidados} convidados, com tudo o que o {buffet} oferece para a festa ser inesquecível.'
    when 'Chá revelação' then 'Olá, {nome}! Preparamos com carinho a proposta do seu chá revelação em {data}, para {convidados} convidados.'
    else 'Olá, {nome}! Segue a proposta para {tipo} em {data}, para {convidados} convidados no {buffet}.'
  end
where empresa_id = '11111111-1111-4111-8111-111111111111' and texto_abertura is null;

update public.regras_comerciais set alteracao_convidados_texto =
  'O número de convidados pode ser ajustado até 7 dias antes da festa. Convidados a mais são cobrados pelo valor por convidado da proposta.'
where empresa_id = '11111111-1111-4111-8111-111111111111' and alteracao_convidados_texto = '';

-- ---------------------------------------------------------------------------
-- Propostas da Etapa 5 no Buffet Demo. Datas relativas a hoje. Idempotente: só grava se ainda
-- não houver orçamentos com token "seedEtapa5…". Conteúdo congelado montado do catálogo atual.
--   Fernanda (nº 0006, 3 versões: muda convidados e depois o pacote; vigente visualizada)
--   Gustavo  (nº 0007, orçamento interno do vendedor: desconto de 5% e item avulso; enviado)
--   Helena   (nº 0008, proposta vencida há 3 dias; lead frio)
--   Igor     (nº 0009, proposta aberta 3 vezes em 2 dias; lead quente)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.seed_conteudo(p_pacote text, p_adultos integer, p_nome text,
  p_data date, p_tipo uuid)
returns jsonb language sql as $$
  select jsonb_build_object(
    'formato', 1,
    'pacote', (select jsonb_build_object('nome', p.nome, 'duracaoInclusaMin', p.duracao_inclusa_min,
        'secoes', coalesce((select jsonb_agg(jsonb_build_object('nome', s.nome, 'itens', to_jsonb(s.itens))
                                             order by s.ordem)
                            from public.secoes_cardapio s
                            where s.pacote_id = p.id and cardinality(s.itens) > 0), '[]'::jsonb))
      from public.pacotes p
      where p.empresa_id = '11111111-1111-4111-8111-111111111111' and p.nome = p_pacote),
    'convidados', jsonb_build_object('adultos', p_adultos, 'criancas', '[]'::jsonb),
    'espaco', (select jsonb_build_object('nome', e.nome, 'noLocalDoCliente', e.no_local_do_cliente,
        'localCliente', null)
      from public.espacos e where e.empresa_id = '11111111-1111-4111-8111-111111111111'
      order by e.ordem limit 1),
    'abertura', (select replace(replace(replace(replace(replace(t.texto_abertura,
        '{nome}', split_part(p_nome, ' ', 1)), '{data}', to_char(p_data, 'DD/MM/YYYY')),
        '{convidados}', p_adultos::text), '{tipo}', lower(t.nome)),
        '{buffet}', 'Buffet Demo')
      from public.tipos_evento t where t.id = p_tipo),
    'textos', (select jsonb_build_object('condicoes', r.condicoes_texto,
        'formasPagamento', to_jsonb(r.formas_pagamento), 'naoIncluso', r.nao_incluso_texto,
        'cancelamento', r.cancelamento_texto, 'alteracaoConvidados', r.alteracao_convidados_texto,
        'sinalBp', r.sinal_bp)
      from public.regras_comerciais r
      where r.empresa_id = '11111111-1111-4111-8111-111111111111'));
$$;

do $$
declare
  demo      constant uuid := '11111111-1111-4111-8111-111111111111';
  vendedor  constant uuid := '1a000000-0000-4000-8000-000000000002';
  v_tipo    uuid;
  v_espaco  uuid;
  v_turno   uuid;
  v_lead    uuid;
  v_orc     uuid;
  v_itens   jsonb;
  v_sub     integer;
  v_total   integer;
  r         record;
begin
  if exists (select 1 from public.orcamentos where token like 'seedEtapa5%')
     or not exists (select 1 from public.leads where empresa_id = demo) then
    return;
  end if;
  select id into v_tipo from public.tipos_evento where empresa_id = demo order by ordem limit 1;
  select id into v_espaco from public.espacos where empresa_id = demo order by ordem limit 1;
  select id into v_turno from public.turnos where empresa_id = demo and nome = 'Tarde';
  if v_tipo is null or v_espaco is null or v_turno is null then
    return;
  end if;

  -- leads
  for r in
    select * from (values
      ('Fernanda Castro', '+5534991113306', 'instagram', 'em_andamento', 'morno', interval '20 hours'),
      ('Gustavo Ramos', '+5534991113307', 'whatsapp', 'em_andamento', 'frio', interval '3 hours'),
      ('Helena Prado', '+5534991113308', 'google', 'frio', 'frio', interval '3 days'),
      ('Igor Teixeira', '+5534991113309', 'indicacao', 'em_andamento', 'quente', interval '1 hour')
    ) as x(nome, whatsapp, origem, status, temperatura, ha)
  loop
    insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura,
      ultimo_passo, consentimento_em, consentimento_versao, consentimento_texto,
      ultima_atividade_em, criado_em)
    values (demo, r.nome, r.whatsapp, r.origem::public.origem_lead, r.status::public.status_lead,
      r.temperatura::public.temperatura_lead, 6,
      case when r.origem <> 'whatsapp' then now() - interval '4 days' end,
      case when r.origem <> 'whatsapp' then '2026-10-v1' end,
      case when r.origem <> 'whatsapp' then 'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.' end,
      now() - r.ha, now() - interval '4 days')
    on conflict do nothing;
  end loop;

  -- versões: (numero, versao, lead, status, pacote, adultos, valor pacote, dias, criado, canal,
  --           avulso, desconto bp, aberturas, validade em dias a partir da criação)
  for r in
    select * from (values
      (6, 1, 'Fernanda Castro', 'substituido', 'Alegria', 40, 390000, 45, interval '3 days', 'publico', false, 0, 0),
      (6, 2, 'Fernanda Castro', 'substituido', 'Alegria', 55, 450000, 45, interval '2 days', 'publico', false, 0, 0),
      (6, 3, 'Fernanda Castro', 'visualizado', 'Super', 55, 520000, 45, interval '20 hours', 'interno', false, 0, 1),
      (7, 1, 'Gustavo Ramos', 'enviado', 'Super', 60, 560000, 60, interval '3 hours', 'interno', true, 500, 0),
      (8, 1, 'Helena Prado', 'expirado', 'Alegria', 50, 450000, 30, interval '18 days', 'publico', false, 0, 1),
      (9, 1, 'Igor Teixeira', 'visualizado', 'Encanto', 70, 780000, 75, interval '2 days', 'publico', false, 0, 3)
    ) as x(numero, versao, nome, status, pacote, adultos, valor, dias, ha, canal, avulso, desconto_bp, aberturas)
  loop
    select id into v_lead from public.leads where empresa_id = demo and nome = r.nome;
    v_itens := jsonb_build_array(jsonb_build_object('tipo', 'pacote', 'descricao', 'Pacote ' || r.pacote,
      'quantidade', r.adultos, 'valorUnitarioCentavos', r.valor / r.adultos, 'subtotalCentavos', r.valor,
      'detalhe', r.adultos || ' convidados equivalentes',
      'referenciaId', (select id from public.pacotes where empresa_id = demo and nome = r.pacote)));
    if r.numero = 6 and r.versao = 3 or r.numero = 9 then
      v_itens := v_itens || jsonb_build_object('tipo', 'opcional', 'descricao', 'Mesa temática',
        'quantidade', 1, 'valorUnitarioCentavos', 60000, 'subtotalCentavos', 60000, 'detalhe', 'Valor fixo',
        'referenciaId', (select id from public.opcionais where empresa_id = demo and nome = 'Mesa temática'));
    end if;
    if r.avulso then
      v_itens := v_itens || jsonb_build_object('tipo', 'avulso', 'descricao', 'Mesa de doces extra',
        'quantidade', 1, 'valorUnitarioCentavos', 35000, 'subtotalCentavos', 35000, 'detalhe', '1 × R$ 350,00');
    end if;
    v_sub := (select sum((i ->> 'subtotalCentavos')::integer) from jsonb_array_elements(v_itens) i);
    if r.desconto_bp > 0 then
      v_itens := v_itens || jsonb_build_object('tipo', 'desconto', 'descricao', 'Desconto',
        'quantidade', 1, 'valorUnitarioCentavos', -(v_sub * r.desconto_bp / 10000),
        'subtotalCentavos', -(v_sub * r.desconto_bp / 10000), 'detalhe', '5% sobre o subtotal');
    end if;
    v_total := v_sub - v_sub * r.desconto_bp / 10000;

    insert into public.orcamentos (empresa_id, lead_id, numero, versao, token, status, canal, origem,
      rascunho, passo_atual, resultado, total_centavos, validade_ate, tipo_evento_id, data, turno_id,
      espaco_id, convidados, pacote_id, conteudo, criado_por, observacoes, observacoes_internas,
      desconto_motivo, aberturas, ultima_abertura_em, canal_envio, enviado_em, visualizado_em, criado_em)
    values (demo, v_lead, r.numero, r.versao,
      'seedEtapa5Orc' || r.numero || 'v' || r.versao || 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
      r.status::public.status_orcamento, r.canal::public.canal_orcamento,
      (select origem from public.leads where id = v_lead),
      jsonb_build_object('tipoEventoId', v_tipo, 'turnoId', v_turno, 'adultos', r.adultos,
        'criancas', '[]'::jsonb, 'opcionais', '[]'::jsonb, 'horasExtras', 0,
        'pacoteId', (select id from public.pacotes where empresa_id = demo and nome = r.pacote),
        'data', (current_date + r.dias)::text),
      6,
      jsonb_build_object('versaoMotor', 1, 'ok', true, 'erros', '[]'::jsonb, 'avisos', '[]'::jsonb,
        'convidadosEquivalentes', r.adultos, 'pessoasFisicas', r.adultos, 'linhas', v_itens,
        'subtotalCentavos', v_sub, 'descontoCentavos', v_sub - v_total, 'totalCentavos', v_total,
        'porConvidadoCentavos', v_total / r.adultos, 'sinalCentavos', v_total * 3 / 10,
        'saldoCentavos', v_total - v_total * 3 / 10, 'parcelas', '[]'::jsonb),
      v_total,
      case when r.status = 'expirado' then current_date - 3 else (now() - r.ha)::date + 15 end,
      v_tipo, current_date + r.dias, v_turno, v_espaco, r.adultos,
      (select id from public.pacotes where empresa_id = demo and nome = r.pacote),
      pg_temp.seed_conteudo(r.pacote, r.adultos, r.nome, current_date + r.dias, v_tipo),
      case when r.canal = 'interno' then vendedor end,
      case when r.avulso then 'Decoração tema safári inclusa.' end,
      case when r.avulso then 'Cliente pediu desconto pelo WhatsApp.' end,
      case when r.desconto_bp > 0 then 'Cliente indicado pela Patrícia.' end,
      r.aberturas,
      case when r.aberturas > 0 then now() - interval '1 hour' end,
      case when r.avulso then 'whatsapp' end,
      now() - r.ha,
      case when r.aberturas > 0 then now() - r.ha + interval '1 hour' end,
      now() - r.ha)
    returning id into v_orc;

    insert into public.orcamento_itens (empresa_id, orcamento_id, ordem, tipo, descricao, quantidade,
      valor_unitario_centavos, subtotal_centavos, detalhe, referencia_id)
    select demo, v_orc, (o.n - 1)::integer, (o.i ->> 'tipo')::public.tipo_item_orcamento,
      o.i ->> 'descricao', (o.i ->> 'quantidade')::integer, (o.i ->> 'valorUnitarioCentavos')::integer,
      (o.i ->> 'subtotalCentavos')::integer, o.i ->> 'detalhe', (o.i ->> 'referenciaId')::uuid
    from jsonb_array_elements(v_itens) with ordinality as o(i, n);

    -- linha do tempo
    insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, usuario_id, criado_em)
    select demo, v_lead, v_orc, a.tipo::public.tipo_atividade, a.dados, a.autor::public.autor_atividade,
      a.usuario, a.quando
    from (values
      (case when r.versao > 1 then 'versao_criada'
            when r.canal = 'interno' then 'orcamento_criado' else 'orcamento_concluido' end,
       jsonb_build_object('numero', r.numero, 'versao', r.versao, 'total_centavos', v_total,
         'data', current_date + r.dias),
       case when r.canal = 'interno' then 'usuario' else 'cliente' end,
       case when r.canal = 'interno' then vendedor end,
       now() - r.ha)
    ) as a(tipo, dados, autor, usuario, quando);
    if r.versao = 1 then
      insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, usuario_id, criado_em)
      values (demo, v_lead, 'lead_criado',
        case when r.canal = 'interno' then jsonb_build_object('origem', 'whatsapp', 'canal', 'interno')
             else jsonb_build_object('origem', 'link_direto') end,
        case when r.canal = 'interno' then 'usuario' else 'cliente' end::public.autor_atividade,
        case when r.canal = 'interno' then vendedor end,
        now() - r.ha - interval '5 minutes');
    end if;
    if r.avulso then
      insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, usuario_id, criado_em)
      values (demo, v_lead, v_orc, 'proposta_enviada',
        jsonb_build_object('canal', 'whatsapp', 'numero', r.numero, 'versao', r.versao),
        'usuario', vendedor, now() - r.ha + interval '2 minutes');
    end if;
    insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
    select demo, v_lead, v_orc, 'proposta_aberta',
      jsonb_build_object('vez', g, 'numero', r.numero, 'versao', r.versao), 'cliente',
      case when r.aberturas = 1 then now() - r.ha + interval '1 hour'
           else now() - interval '2 days' + (g - 1) * interval '23 hours' end
    from generate_series(1, r.aberturas) g;
    if r.status = 'expirado' then
      insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
      values (demo, v_lead, v_orc, 'orcamento_expirado',
        jsonb_build_object('numero', r.numero, 'versao', r.versao, 'validade_ate', current_date - 3),
        'sistema', now() - interval '2 days');
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Caixa de leads (Etapa 6) no Buffet Demo: completa ~25 leads cobrindo todos os grupos de
-- prioridade e status. Idempotente: só grava se ainda não houver o lead "Lívia Moraes".
--   perdidos (preço, concorrente, sem resposta, outro), visita confirmada hoje e pedido de visita,
--   tarefas atrasadas, de hoje e futuras, notas, com e sem responsável, próximo contato vencido,
--   quentes, novos esperando, frio parado, realizado e cancelado.
-- ---------------------------------------------------------------------------
do $$
declare
  demo     constant uuid := '11111111-1111-4111-8111-111111111111';
  dona     constant uuid := '1a000000-0000-4000-8000-000000000001';
  vendedor constant uuid := '1a000000-0000-4000-8000-000000000002';
  hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_lead   uuid;
  r        record;
begin
  if exists (select 1 from public.leads where empresa_id = demo and nome = 'Lívia Moraes')
     or not exists (select 1 from public.empresas where id = demo) then
    return;
  end if;

  for r in
    select * from (values
      -- nome, whatsapp, origem, status, temperatura, ha, responsavel, motivo, detalhe, primeiro contato
      ('Lívia Moraes', '+5534991114401', 'instagram', 'novo', 'frio', interval '30 minutes', null::uuid, null, null, false),
      ('Otávio Ribeiro', '+5534991114402', 'google', 'novo', 'frio', interval '26 hours', null, null, null, false),
      ('Sabrina Costa', '+5534991114403', 'indicacao', 'em_andamento', 'quente', interval '2 hours', vendedor, null, null, true),
      ('Tiago Almeida', '+5534991114404', 'whatsapp', 'em_andamento', 'morno', interval '1 day', vendedor, null, null, true),
      ('Vanessa Pires', '+5534991114405', 'instagram', 'em_andamento', 'morno', interval '3 days', dona, null, null, true),
      ('Wesley Martins', '+5534991114406', 'link_direto', 'em_andamento', 'morno', interval '5 hours', vendedor, null, null, true),
      ('Yasmin Rocha', '+5534991114407', 'google', 'em_andamento', 'morno', interval '6 hours', null, null, null, true),
      ('Bruno Teixeira', '+5534991114408', 'instagram', 'frio', 'frio', interval '9 days', vendedor, null, null, true),
      ('Camila Duarte', '+5534991114409', 'google', 'perdido', 'morno', interval '4 days', vendedor, 'preco', 'Achou acima do orçamento', true),
      ('Diego Fernandes', '+5534991114410', 'indicacao', 'perdido', 'morno', interval '6 days', dona, 'concorrente', null, true),
      ('Elaine Barros', '+5534991114411', 'instagram', 'perdido', 'frio', interval '12 days', vendedor, 'sem_resposta', null, true),
      ('Fábio Nogueira', '+5534991114412', 'whatsapp', 'perdido', 'frio', interval '8 days', null, 'outro', 'Mudou de cidade', true),
      ('Gabriela Lopes', '+5534991114413', 'link_direto', 'realizado', 'quente', interval '20 days', dona, null, null, true),
      ('Henrique Sales', '+5534991114414', 'google', 'cancelado', 'morno', interval '15 days', vendedor, null, null, true),
      ('Isabela Freitas', '+5534991114415', 'instagram', 'em_andamento', 'quente', interval '3 hours', vendedor, null, null, true),
      ('João Pedro Lima', '+5534991114416', 'indicacao', 'abandonou', 'frio', interval '2 days', null, null, null, false)
    ) as x(nome, whatsapp, origem, status, temperatura, ha, responsavel, motivo, detalhe, contato)
  loop
    insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
      consentimento_em, consentimento_versao, consentimento_texto, ultima_atividade_em, criado_em,
      responsavel_id, motivo_perda_codigo, motivo_perda, perdido_em, status_antes_de_perder,
      primeiro_contato_em, ultima_acao_vendedor_em)
    values (demo, r.nome, r.whatsapp, r.origem::public.origem_lead, r.status::public.status_lead,
      r.temperatura::public.temperatura_lead, 6, now() - r.ha - interval '1 hour', '2026-10-v1',
      'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.', now() - r.ha,
      now() - r.ha - interval '1 hour', r.responsavel, r.motivo::public.motivo_perda, r.detalhe,
      case when r.status = 'perdido' then now() - r.ha end,
      case when r.status = 'perdido' then 'em_andamento'::public.status_lead end,
      case when r.contato then now() - r.ha - interval '30 minutes' end,
      case when r.contato then now() - r.ha end)
    on conflict do nothing
    returning id into v_lead;
    if v_lead is null then
      continue;
    end if;

    insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, criado_em)
    values (demo, v_lead, 'lead_criado', jsonb_build_object('origem', r.origem), 'cliente',
      now() - r.ha - interval '1 hour');
    if r.contato then
      insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, usuario_id, criado_em)
      values (demo, v_lead, 'contato_registrado', jsonb_build_object('canal', 'whatsapp'), 'usuario',
        coalesce(r.responsavel, vendedor), now() - r.ha - interval '30 minutes');
    end if;
    if r.status = 'perdido' then
      insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, usuario_id, criado_em)
      values (demo, v_lead, 'perdido', jsonb_build_object('motivo', r.motivo, 'detalhe', r.detalhe,
        'status_antes', 'em_andamento', 'status_depois', 'perdido'),
        'usuario', coalesce(r.responsavel, vendedor), now() - r.ha);
    end if;
  end loop;

  -- visita confirmada para hoje às 15h (Sabrina) e pedido de visita do link (Tiago)
  insert into public.visitas (empresa_id, lead_id, data_preferida, periodo, status, data_hora,
    confirmada_por, confirmada_em, criado_por)
  select demo, l.id, hoje, 'tarde', 'confirmada',
    (hoje + time '15:00') at time zone 'America/Sao_Paulo', vendedor, now() - interval '1 day', vendedor
  from public.leads l where l.empresa_id = demo and l.nome = 'Sabrina Costa';
  insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, usuario_id, criado_em)
  select demo, l.id, 'visita_confirmada',
    jsonb_build_object('data_hora', (hoje + time '15:00') at time zone 'America/Sao_Paulo'),
    'usuario', vendedor, now() - interval '1 day'
  from public.leads l where l.empresa_id = demo and l.nome = 'Sabrina Costa';
  insert into public.visitas (empresa_id, lead_id, data_preferida, periodo, observacoes)
  select demo, l.id, hoje + 2, 'manha', 'Quero levar meus pais.'
  from public.leads l where l.empresa_id = demo and l.nome = 'Tiago Almeida';
  insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, criado_em)
  select demo, l.id, 'visita_pedida', jsonb_build_object('data_preferida', hoje + 2, 'periodo', 'manha'),
    'cliente', now() - interval '20 hours'
  from public.leads l where l.empresa_id = demo and l.nome = 'Tiago Almeida';

  -- tarefas: atrasada, de hoje, futuras e uma com mensagem sugerida
  insert into public.tarefas (empresa_id, lead_id, titulo, responsavel_id, vence_em, origem,
    mensagem_sugerida, criado_por, criado_em)
  select demo, l.id, t.titulo, coalesce(l.responsavel_id, vendedor), t.vence, 'manual', t.msg,
    coalesce(l.responsavel_id, vendedor), now() - interval '2 days'
  from (values
    ('Wesley Martins', 'Mandar fotos do salão decorado', now() - interval '3 hours', null::text),
    ('Vanessa Pires', 'Ligar para fechar o cardápio', (hoje + time '17:30') at time zone 'America/Sao_Paulo', null),
    ('Tiago Almeida', 'Enviar cardápio infantil em PDF', (hoje + 1 + time '09:00') at time zone 'America/Sao_Paulo',
      'Oi, Tiago! Separei o cardápio infantil completo para você dar uma olhada. Posso te mandar por aqui?'),
    ('Isabela Freitas', 'Confirmar número de convidados', (hoje + 3 + time '10:00') at time zone 'America/Sao_Paulo', null)
  ) as t(nome, titulo, vence, msg)
  join public.leads l on l.empresa_id = demo and l.nome = t.nome;
  insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, usuario_id, criado_em)
  select demo, t.lead_id, 'tarefa_criada', jsonb_build_object('tarefa_id', t.id, 'titulo', t.titulo),
    'usuario', t.criado_por, t.criado_em
  from public.tarefas t
  join public.leads l on l.id = t.lead_id
  where t.empresa_id = demo and l.nome in ('Wesley Martins', 'Vanessa Pires', 'Tiago Almeida', 'Isabela Freitas');

  -- próximo contato vencido (Yasmin: em andamento, sem responsável)
  update public.leads set proximo_contato_em = now() - interval '2 hours'
  where empresa_id = demo and nome = 'Yasmin Rocha';
  insert into public.tarefas (empresa_id, lead_id, titulo, vence_em, origem, regra, criado_por, criado_em)
  select demo, l.id, 'Falar com ' || l.nome, now() - interval '2 hours', 'manual', 'proximo_contato',
    vendedor, now() - interval '1 day'
  from public.leads l where l.empresa_id = demo and l.nome = 'Yasmin Rocha';

  -- notas
  insert into public.notas (empresa_id, lead_id, autor_id, texto, criado_em)
  select demo, l.id, n.autor, n.texto, now() - n.ha
  from (values
    ('Sabrina Costa', vendedor, 'Festa de 7 anos do Theo. Tema dinossauros. Prefere sábado à tarde.', interval '1 day'),
    ('Vanessa Pires', dona, 'Cliente antiga: fez a festa da filha mais velha com a gente em 2024.', interval '2 days'),
    ('Camila Duarte', vendedor, 'Pediu 20% de desconto; ofereci 5%. Disse que vai pensar.', interval '5 days')
  ) as n(nome, autor, texto, ha)
  join public.leads l on l.empresa_id = demo and l.nome = n.nome;
  insert into public.atividades (empresa_id, lead_id, tipo, dados, autor, usuario_id, criado_em)
  select demo, n.lead_id, 'nota', jsonb_build_object('nota_id', n.id, 'trecho', left(n.texto, 140)),
    'usuario', n.autor_id, n.criado_em
  from public.notas n where n.empresa_id = demo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Avisos e follow-up automático (Etapa 7) no Buffet Demo. Idempotente (chaves fixas "seed7:").
--   avisos lidos e não lidos de todos os tipos (dona e vendedor), preferências dos dois
--   (o vendedor com silêncio 23:00–08:00), "segundo toque" desligado e tarefas automáticas
--   abertas e canceladas.
-- ---------------------------------------------------------------------------
do $$
declare
  demo     constant uuid := '11111111-1111-4111-8111-111111111111';
  dona     constant uuid := '1a000000-0000-4000-8000-000000000001';
  vendedor constant uuid := '1a000000-0000-4000-8000-000000000002';
  hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not exists (select 1 from public.empresas where id = demo) then
    return;
  end if;

  insert into public.preferencias_avisos (usuario_id, empresa_id, canais, silencio_inicio, silencio_fim,
    receber_de_vendedores)
  values
    (dona, demo, '{"cliente_esquentou": ["push"]}'::jsonb, '22:00', '07:00', false),
    (vendedor, demo, '{"orcamentos_sem_acao": []}'::jsonb, '23:00', '08:00', false)
  on conflict (usuario_id) do nothing;

  update public.regras_follow_up set ligada = false
  where empresa_id = demo and regra = 'segundo_toque' and ligada;

  insert into public.avisos (empresa_id, usuario_id, tipo, lead_id, dados, chave, criado_em, lido_em)
  select demo, a.usuario, a.tipo::public.tipo_aviso, l.id, a.dados, a.chave, now() - a.ha,
    case when a.lido then now() - a.ha + interval '10 minutes' end
  from (values
    ('seed7:pre_reserva_pedida', dona, 'pre_reserva_pedida', 'Patrícia Lima',
      jsonb_build_object('lead_nome', 'Patrícia Lima', 'tipo_evento', 'Aniversário infantil',
        'data', (hoje + 45)::text, 'turno', 'Noite', 'convidados', 70, 'total_centavos', 560000,
        'expira_em', now() + interval '37 hours'), interval '11 hours', false),
    ('seed7:visita_pedida', vendedor, 'visita_pedida', 'Tiago Almeida',
      jsonb_build_object('lead_nome', 'Tiago Almeida', 'data_preferida', (hoje + 2)::text,
        'periodo', 'tarde', 'total_centavos', 410000), interval '3 hours', false),
    ('seed7:pre_reserva_vencendo', dona, 'pre_reserva_vencendo', 'Patrícia Lima',
      jsonb_build_object('lead_nome', 'Patrícia Lima', 'expira_em', now() + interval '37 hours'),
      interval '1 day', true),
    ('seed7:orcamentos_sem_acao', dona, 'orcamentos_sem_acao', null,
      jsonb_build_object('quantidade', 3, 'total_centavos', 1840000), interval '5 hours', true),
    ('seed7:cliente_parou', dona, 'cliente_parou', 'Beatriz Nunes',
      jsonb_build_object('lead_nome', 'Beatriz Nunes', 'passo', 4), interval '2 hours', false),
    ('seed7:cliente_esquentou', vendedor, 'cliente_esquentou', 'Sabrina Costa',
      jsonb_build_object('lead_nome', 'Sabrina Costa', 'aberturas', 3), interval '90 minutes', false),
    ('seed7:resumo_diario:dona', dona, 'resumo_diario', null,
      jsonb_build_object('novos_ontem', 2, 'pre_reservas_hoje', 1, 'visitas_hoje', 1, 'tarefas_hoje', 2,
        'atrasadas', 1), interval '20 hours', true),
    ('seed7:resumo_diario:vendedor', vendedor, 'resumo_diario', null,
      jsonb_build_object('novos_ontem', 0, 'pre_reservas_hoje', 0, 'visitas_hoje', 1, 'tarefas_hoje', 1,
        'atrasadas', 1), interval '20 hours', true)
  ) as a(chave, usuario, tipo, lead_nome, dados, ha, lido)
  left join public.leads l on l.empresa_id = demo and l.nome = a.lead_nome
  on conflict (chave) do nothing;

  -- tarefas automáticas: abertas (Igor: proposta sem resposta; Isabela: quente sem contato) e
  -- uma cancelada (Fernanda: o vendedor falou com ela antes)
  insert into public.tarefas (empresa_id, lead_id, titulo, responsavel_id, vence_em, origem, regra,
    mensagem_dados, criado_em, cancelada_em)
  select demo, l.id, public._follow_up_titulo(t.regra, l.nome, null, 'America/Sao_Paulo'),
    coalesce(l.responsavel_id, dona), now() - t.ha, 'regra', t.regra,
    jsonb_build_object('regra', t.regra, 'proposta_aberta', t.aberta), now() - t.ha,
    case when t.cancelada then now() - t.ha + interval '3 hours' end
  from (values
    ('Igor Teixeira', 'sem_resposta_24h', true, interval '2 hours', false),
    ('Isabela Freitas', 'quente_sem_contato', true, interval '40 minutes', false),
    ('Fernanda Castro', 'sem_resposta_24h', false, interval '2 days', true)
  ) as t(nome, regra, aberta, ha, cancelada)
  join public.leads l on l.empresa_id = demo and l.nome = t.nome
  where not exists (select 1 from public.tarefas x where x.lead_id = l.id and x.regra = t.regra and x.origem = 'regra');
end;
$$;
