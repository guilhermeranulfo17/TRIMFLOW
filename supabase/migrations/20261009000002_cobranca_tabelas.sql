-- Etapa 9A · Cobrança: planos, cupons, assinaturas, cobranças, eventos do Asaas, auditoria
-- interna e acesso de suporte.
--
-- Tudo aditivo. Regra de acesso: o dono LÊ o que é da empresa dele; ninguém escreve pela API.
-- A escrita é do servidor (server/db/admin, server-only) e das funções da migration 3.

-- ---------------------------------------------------------------------------
-- planos: editáveis só pelo /interno
-- ---------------------------------------------------------------------------
create table public.planos (
  codigo                 text primary key check (codigo ~ '^[a-z_]{3,30}$'),
  nome                   text not null check (char_length(btrim(nome)) between 2 and 60),
  preco_mensal_centavos  integer not null check (preco_mensal_centavos > 0),
  preco_anual_centavos   integer not null check (preco_anual_centavos > 0),
  max_usuarios           integer not null check (max_usuarios >= 1),
  -- null = ilimitado
  max_espacos            integer check (max_espacos is null or max_espacos >= 1),
  whatsapp_avisos        boolean not null default false,
  follow_up              boolean not null default false,
  numeros_completo       boolean not null default false,
  ordem                  smallint not null default 0,
  ativo                  boolean not null default true,
  atualizado_em          timestamptz not null default now()
);

comment on table public.planos is
  'Planos à venda. Teste (trial) usa os recursos do Profissional. Preço em centavos.';

insert into public.planos (codigo, nome, preco_mensal_centavos, preco_anual_centavos,
  max_usuarios, max_espacos, whatsapp_avisos, follow_up, numeros_completo, ordem)
values
  ('essencial', 'Essencial', 14700, 147000, 2, 1, false, false, false, 1),
  ('profissional', 'Profissional', 24700, 247000, 5, null, true, true, true, 2)
on conflict (codigo) do nothing;

create trigger planos_atualizado_em
  before update on public.planos
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- cupons e usos
-- ---------------------------------------------------------------------------
create table public.cupons (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null check (codigo ~ '^[A-Z0-9_-]{3,30}$'),
  plano_codigo       text not null references public.planos (codigo),
  ciclo              text not null default 'mensal' check (ciclo in ('mensal', 'anual')),
  desconto_centavos  integer not null check (desconto_centavos > 0),
  duracao_meses      smallint not null check (duracao_meses between 1 and 36),
  -- null = sem limite de usos
  max_usos           integer check (max_usos is null or max_usos >= 1),
  usos               integer not null default 0 check (usos >= 0),
  valido_ate         timestamptz,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  check (max_usos is null or usos <= max_usos)
);

create unique index cupons_codigo_idx on public.cupons (upper(codigo));

comment on table public.cupons is
  'Desconto em centavos sobre o preço do plano/ciclo por duracao_meses a partir da assinatura.';

-- Fundador: R$ 97/mês (24700 - 15000) por 12 meses no Profissional mensal, para os 10 primeiros.
insert into public.cupons (codigo, plano_codigo, ciclo, desconto_centavos, duracao_meses, max_usos)
values ('FUNDADOR', 'profissional', 'mensal', 15000, 12, 10)
on conflict do nothing;

create table public.cupons_usos (
  id          uuid primary key default gen_random_uuid(),
  cupom_id    uuid not null references public.cupons (id),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  criado_em   timestamptz not null default now(),
  unique (cupom_id, empresa_id)
);

create index cupons_usos_empresa_idx on public.cupons_usos (empresa_id);

-- ---------------------------------------------------------------------------
-- dados de cobrança da empresa (pagador no Asaas)
-- ---------------------------------------------------------------------------
create table public.empresas_cobranca (
  empresa_id        uuid primary key references public.empresas (id) on delete cascade,
  nome              text not null check (char_length(btrim(nome)) between 2 and 120),
  -- CPF (11) ou CNPJ (14), só dígitos, validado em domain/cobranca/documento
  documento         text not null check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  email             text not null check (email ~ '^[^@\s]+@[^@\s]+$' and char_length(email) <= 200),
  asaas_cliente_id  text unique check (asaas_cliente_id is null or char_length(asaas_cliente_id) <= 60),
  atualizado_em     timestamptz not null default now()
);

create trigger empresas_cobranca_atualizado_em
  before update on public.empresas_cobranca
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- assinaturas: no máximo uma não cancelada por empresa
-- ---------------------------------------------------------------------------
create table public.assinaturas (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas (id) on delete cascade,
  asaas_assinatura_id   text unique check (asaas_assinatura_id is null or char_length(asaas_assinatura_id) <= 60),
  plano_codigo          text not null references public.planos (codigo),
  ciclo                 text not null check (ciclo in ('mensal', 'anual')),
  -- valor cobrado hoje (com cupom, se houver)
  valor_centavos        integer not null check (valor_centavos >= 0),
  cupom_id              uuid references public.cupons (id),
  cupom_codigo          text,
  -- último dia com desconto (a reconciliação volta ao preço cheio depois)
  cupom_ate             date,
  status                text not null default 'pendente' check (status in ('pendente', 'ativa', 'cancelada')),
  -- último dia coberto por pagamento confirmado (data civil no fuso da empresa)
  pago_ate              date,
  -- vencimento da cobrança mais antiga em atraso (null = em dia)
  atrasada_desde        date,
  criada_em             timestamptz not null default now(),
  cancelada_em          timestamptz,
  cancelamento_motivo   text check (cancelamento_motivo is null or cancelamento_motivo in (
    'preco', 'poucos_leads', 'nao_usei', 'fechou', 'outro_sistema', 'faltou_recurso', 'outro')),
  cancelamento_texto    text check (cancelamento_texto is null or char_length(cancelamento_texto) <= 1000),
  atualizado_em         timestamptz not null default now(),
  unique (id, empresa_id),
  check ((status = 'cancelada') = (cancelada_em is not null))
);

create unique index assinaturas_vigente_idx on public.assinaturas (empresa_id)
  where status <> 'cancelada';
create index assinaturas_empresa_idx on public.assinaturas (empresa_id, criada_em desc);

create trigger assinaturas_atualizado_em
  before update on public.assinaturas
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- cobranças (faturas do Asaas): da assinatura ou avulsas (implantação)
-- ---------------------------------------------------------------------------
create table public.cobrancas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas (id) on delete cascade,
  assinatura_id      uuid,
  asaas_cobranca_id  text not null unique check (char_length(asaas_cobranca_id) <= 60),
  tipo               text not null default 'assinatura' check (tipo in ('assinatura', 'implantacao')),
  valor_centavos     integer not null check (valor_centavos >= 0),
  vencimento         date not null,
  status             text not null default 'pendente' check (status in (
    'pendente', 'vencida', 'confirmada', 'recebida', 'estornada', 'cancelada')),
  forma              text check (forma is null or forma in ('PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED')),
  link_fatura        text check (link_fatura is null or (link_fatura ~ '^https?://' and char_length(link_fatura) <= 500)),
  pago_em            timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  foreign key (assinatura_id, empresa_id) references public.assinaturas (id, empresa_id) on delete cascade
);

create index cobrancas_empresa_idx on public.cobrancas (empresa_id, vencimento desc);
create index cobrancas_assinatura_idx on public.cobrancas (assinatura_id);

create trigger cobrancas_atualizado_em
  before update on public.cobrancas
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- eventos recebidos do Asaas (idempotência do webhook e da reconciliação)
-- ---------------------------------------------------------------------------
create table public.cobranca_eventos (
  id               uuid primary key default gen_random_uuid(),
  asaas_evento_id  text not null unique check (char_length(asaas_evento_id) between 1 and 120),
  tipo             text not null check (char_length(tipo) between 1 and 60),
  empresa_id       uuid references public.empresas (id) on delete set null,
  -- só ids, valores, datas e status (domain/cobranca/asaas-eventos limparPayload)
  payload          jsonb not null default '{}'::jsonb,
  recebido_em      timestamptz not null default now(),
  processado_em    timestamptz,
  ignorado         boolean not null default false,
  resultado        text check (resultado is null or char_length(resultado) <= 80)
);

create index cobranca_eventos_empresa_idx on public.cobranca_eventos (empresa_id, recebido_em desc);

-- ---------------------------------------------------------------------------
-- auditoria do /interno (equipe Orkestra): ninguém do painel lê
-- ---------------------------------------------------------------------------
create table public.auditoria_interna (
  id           uuid primary key default gen_random_uuid(),
  admin_email  text not null check (char_length(admin_email) between 3 and 200),
  acao         text not null check (char_length(acao) between 1 and 100),
  empresa_id   uuid references public.empresas (id) on delete set null,
  dados        jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now()
);

create index auditoria_interna_criado_idx on public.auditoria_interna (criado_em desc);
create index auditoria_interna_empresa_idx on public.auditoria_interna (empresa_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- consentimento do dono para o suporte acessar a conta (7 dias, revogável)
-- ---------------------------------------------------------------------------
create table public.acessos_suporte (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  concedido_por  uuid not null,
  concedido_em   timestamptz not null default now(),
  expira_em      timestamptz not null,
  revogado_em    timestamptz,
  revogado_por   uuid,
  foreign key (concedido_por, empresa_id) references public.usuarios (id, empresa_id) on delete cascade,
  check (expira_em > concedido_em)
);

create index acessos_suporte_empresa_idx on public.acessos_suporte (empresa_id, expira_em desc);

-- ---------------------------------------------------------------------------
-- empresas: suspensão manual (/interno) e isenção (cortesia, sem assinatura)
-- ---------------------------------------------------------------------------
alter table public.empresas
  add column suspensa_manual_em timestamptz,
  add column motivo_suspensao   text check (motivo_suspensao is null or char_length(motivo_suspensao) <= 300),
  add column isenta             boolean not null default false;

comment on column public.empresas.isenta is
  'Conta de cortesia: fica ativa sem assinatura (contas já ativas antes da cobrança, parceiros).';

-- Backfill: ninguém em produção é suspenso pelo primeiro job.
-- * teste em andamento ou vencido ganha 14 dias a partir de hoje;
-- * conta já "ativo" (sem cobrança até aqui) vira cortesia.
update public.empresas
set trial_ate = greatest(coalesce(trial_ate, now()), now() + interval '14 days')
where plano = 'trial';

update public.empresas set isenta = true where plano = 'ativo';

-- ---------------------------------------------------------------------------
-- RLS e privilégios
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['planos', 'cupons', 'cupons_usos', 'empresas_cobranca', 'assinaturas',
                           'cobrancas', 'cobranca_eventos', 'auditoria_interna',
                           'acessos_suporte'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- planos: qualquer usuário logado vê (tela de Plano, mensagens de limite)
grant select on public.planos to authenticated;
create policy planos_select_todos on public.planos for select to authenticated using (true);

-- o que é da empresa: só o dono lê
grant select on public.empresas_cobranca, public.assinaturas, public.cobrancas,
  public.acessos_suporte to authenticated;

create policy empresas_cobranca_select_dono on public.empresas_cobranca for select to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = 'dono');
create policy assinaturas_select_dono on public.assinaturas for select to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = 'dono');
create policy cobrancas_select_dono on public.cobrancas for select to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = 'dono');
create policy acessos_suporte_select_dono on public.acessos_suporte for select to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = 'dono');

-- cupons, cupons_usos, cobranca_eventos e auditoria_interna: sem policy (o painel não lê).
