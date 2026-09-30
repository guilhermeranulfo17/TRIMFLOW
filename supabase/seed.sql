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
