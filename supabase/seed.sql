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
    (demo, 'Almoço', '11:00', 240, '{0,1,2,3,4,5,6}', 0),
    (demo, 'Tarde', '15:00', 240, '{0,1,2,3,4,5,6}', 1),
    (demo, 'Noite', '19:00', 240, '{0,1,2,3,4,5,6}', 2);

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
