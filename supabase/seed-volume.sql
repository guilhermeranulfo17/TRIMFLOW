-- Seed de VOLUME (opcional, fora do seed padrão): 5.000 leads numa empresa só, para medir a
-- caixa de leads (explain analyze de public.caixa_leads). Dados 100% fictícios. Idempotente.
-- Uso: pnpm db:seed:volume   (nunca em produção)
--   Buffet Volume → dono@volume.local (senha demo12345), 3 vendedores
--   5.000 leads em todos os status, ~2.500 orçamentos, ~1.000 tarefas, 300 pré-reservas, 200 visitas

insert into public.empresas (id, nome, slug, segmento, plano, trial_ate)
values ('33333333-3333-4333-8333-333333333333', 'Buffet Volume', 'buffet-volume', 'infantil',
        'trial', now() + interval '14 days')
on conflict (id) do nothing;

with novos (id, email, nome, perfil) as (
  values
    ('3c000000-0000-4000-8000-000000000001'::uuid, 'dono@volume.local', 'Dono Volume', 'dono'),
    ('3c000000-0000-4000-8000-000000000002'::uuid, 'vendedor1@volume.local', 'Vendedora Um', 'vendedor'),
    ('3c000000-0000-4000-8000-000000000003'::uuid, 'vendedor2@volume.local', 'Vendedor Dois', 'vendedor'),
    ('3c000000-0000-4000-8000-000000000004'::uuid, 'vendedor3@volume.local', 'Vendedora Três', 'vendedor')
), u as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
    recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', n.id, 'authenticated', 'authenticated', n.email,
    extensions.crypt('demo12345', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('nome', n.nome),
    now(), now(), '', '', '', ''
  from novos n
  on conflict (id) do nothing
  returning id
)
insert into public.usuarios (id, empresa_id, nome, email, perfil)
select n.id, '33333333-3333-4333-8333-333333333333', n.nome, n.email, n.perfil::public.perfil_usuario
from novos n
on conflict (id) do nothing;

-- Etapa 9B: aceite dos termos vigentes (src/domain/legal/versao.ts)
update public.usuarios set termos_versao = '2026-10-04', termos_aceitos_em = now()
where empresa_id = '33333333-3333-4333-8333-333333333333';

do $$
declare
  vol constant uuid := '33333333-3333-4333-8333-333333333333';
  v_tipo uuid;
  v_turno uuid;
  v_espaco uuid;
begin
  if exists (select 1 from public.leads where empresa_id = vol) then
    raise notice 'Buffet Volume já tem leads: nada a fazer.';
    return;
  end if;
  insert into public.tipos_evento (empresa_id, nome) values (vol, 'Aniversário') returning id into v_tipo;
  insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
    values (vol, 'Tarde', '15:00', 240, '{0,1,2,3,4,5,6}') returning id into v_turno;
  insert into public.espacos (empresa_id, nome, capacidade_max, eventos_simultaneos)
    values (vol, 'Salão', 300, 50) returning id into v_espaco;

  -- 5.000 leads em todos os status, temperaturas e responsáveis
  insert into public.leads (empresa_id, nome, whatsapp_e164, origem, status, temperatura,
    ultima_atividade_em, criado_em, responsavel_id, primeiro_contato_em, proximo_contato_em,
    motivo_perda_codigo, perdido_em, status_antes_de_perder)
  select vol, 'Cliente ' || g, '+55349' || lpad(g::text, 8, '0'),
    (array['instagram','google','indicacao','whatsapp','link_direto','outro'])[1 + g % 6]::public.origem_lead,
    s.status, (array['frio','morno','quente'])[1 + (g * 7) % 3]::public.temperatura_lead,
    now() - (g % 720) * interval '1 hour', now() - (g % 900) * interval '1 hour' - interval '1 hour',
    case when g % 4 = 0 then null
         else ('3c000000-0000-4000-8000-00000000000' || (1 + g % 4))::uuid end,
    case when s.status <> 'novo' or g % 3 = 0 then now() - (g % 700) * interval '1 hour' end,
    case when g % 11 = 0 then now() + ((g % 96) - 48) * interval '1 hour' end,
    case when s.status = 'perdido' then 'preco'::public.motivo_perda end,
    case when s.status = 'perdido' then now() - interval '3 days' end,
    case when s.status = 'perdido' then 'em_andamento'::public.status_lead end
  from generate_series(1, 5000) g
  cross join lateral (select (array['novo','em_andamento','em_andamento','em_andamento','abandonou',
    'frio','pre_reservado','reservado','perdido','realizado','cancelado'])[1 + g % 11]::public.status_lead as status) s;

  -- metade com orçamento concluído
  insert into public.orcamentos (empresa_id, lead_id, numero, token, status, canal, rascunho, passo_atual,
    resultado, total_centavos, validade_ate, tipo_evento_id, data, turno_id, espaco_id, convidados,
    enviado_em, aberturas)
  select vol, l.id, row_number() over (order by l.criado_em),
    'volume' || replace(l.id::text, '-', '') || 'xx',
    'enviado', 'publico', '{}'::jsonb, 6,
    jsonb_build_object('versaoMotor', 1, 'ok', true, 'totalCentavos', 450000, 'sinalCentavos', 135000),
    450000, current_date + 15, v_tipo, current_date + 30 + (abs(hashtext(l.id::text)) % 300),
    v_turno, v_espaco, 60, now() - interval '1 day', abs(hashtext(l.id::text)) % 4
  from public.leads l
  where l.empresa_id = vol and abs(hashtext(l.id::text)) % 2 = 0;

  -- pré-reservas ativas para parte dos pré-reservados
  insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status,
    expira_em, origem, cliente_nome, lead_id, orcamento_id)
  select vol, v_espaco, v_turno, o.data,
    (o.data + time '15:00') at time zone 'America/Sao_Paulo',
    (o.data + time '19:00') at time zone 'America/Sao_Paulo',
    'pre_reserva', 'ativa', now() + (1 + abs(hashtext(l.id::text)) % 70) * interval '1 hour',
    'link_publico', l.nome, l.id, o.id
  from public.leads l join public.orcamentos o on o.lead_id = l.id
  where l.empresa_id = vol and l.status = 'pre_reservado'
  limit 300;

  -- visitas: pedidos e confirmadas
  insert into public.visitas (empresa_id, lead_id, data_preferida, periodo, status, data_hora)
  select vol, l.id, current_date + 2, 'tarde',
    case when abs(hashtext(l.id::text)) % 2 = 0 then 'solicitada' else 'confirmada' end::public.status_visita,
    case when abs(hashtext(l.id::text)) % 2 = 1 then now() + (abs(hashtext(l.id::text)) % 72) * interval '1 hour' end
  from public.leads l
  where l.empresa_id = vol and l.status in ('em_andamento', 'novo')
  limit 200;

  -- tarefas abertas espalhadas (atrasadas, hoje e futuras)
  insert into public.tarefas (empresa_id, lead_id, titulo, responsavel_id, vence_em, origem)
  select vol, l.id, 'Retornar contato', l.responsavel_id,
    now() + ((abs(hashtext(l.id::text)) % 240) - 72) * interval '1 hour', 'manual'
  from public.leads l
  where l.empresa_id = vol and l.status in ('novo', 'em_andamento', 'abandonou', 'frio', 'pre_reservado')
    and abs(hashtext(l.id::text)) % 3 = 0;

  analyze public.leads;
  analyze public.orcamentos;
  analyze public.tarefas;
  analyze public.visitas;
  analyze public.reservas;
end;
$$;
