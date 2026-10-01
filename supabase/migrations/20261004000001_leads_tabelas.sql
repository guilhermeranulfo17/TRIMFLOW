-- Etapa 4 · Leads, orçamentos do link público, atividades, visitas e funil.
-- Leitura: qualquer usuário ativo da empresa. Escrita: SÓ pelas funções security definer
-- (schema publico e funções da agenda). anon não lê nenhuma tabela.

create type public.origem_lead as enum (
  'instagram', 'google', 'indicacao', 'whatsapp', 'link_direto', 'interno', 'outro');
create type public.status_lead as enum (
  'novo', 'em_andamento', 'abandonou', 'pre_reservado', 'reservado', 'frio', 'perdido',
  'cancelado', 'realizado');
create type public.temperatura_lead as enum ('frio', 'morno', 'quente');
create type public.status_orcamento as enum (
  'em_montagem', 'enviado', 'visualizado', 'substituido', 'aceito', 'expirado');
create type public.canal_orcamento as enum ('publico', 'interno');
create type public.tipo_item_orcamento as enum (
  'pacote', 'opcional', 'hora_extra', 'deslocamento', 'avulso', 'ajuste_dia', 'desconto');
create type public.tipo_atividade as enum (
  'lead_criado', 'orcamento_iniciado', 'orcamento_concluido', 'voltou', 'pre_reserva_pedida',
  'pre_reserva_vencida', 'visita_pedida', 'whatsapp_clicado', 'reserva_confirmada',
  'reserva_cancelada', 'status_alterado');
create type public.autor_atividade as enum ('cliente', 'usuario', 'sistema');
create type public.periodo_visita as enum ('manha', 'tarde', 'noite');
create type public.status_visita as enum ('solicitada', 'confirmada', 'realizada', 'cancelada');
create type public.evento_funil as enum ('passo_visto', 'passo_concluido', 'abandono');

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas (id) on delete cascade,
  nome                 text not null check (char_length(btrim(nome)) between 1 and 120),
  whatsapp_e164        text not null check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email                text check (email is null or char_length(email) <= 200),
  origem               public.origem_lead not null default 'link_direto',
  status               public.status_lead not null default 'novo',
  temperatura          public.temperatura_lead not null default 'frio',
  ultimo_passo         smallint check (ultimo_passo is null or ultimo_passo between 0 and 6),
  consentimento_em     timestamptz,
  consentimento_versao text check (consentimento_versao is null or char_length(consentimento_versao) <= 40),
  consentimento_texto  text check (consentimento_texto is null or char_length(consentimento_texto) <= 1000),
  eh_teste             boolean not null default false,
  ultima_atividade_em  timestamptz not null default now(),
  proximo_contato_em   timestamptz,
  motivo_perda         text check (motivo_perda is null or char_length(motivo_perda) <= 300),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (id, empresa_id),
  -- O dono testando o próprio link com o próprio número não colide com um cliente real.
  unique (empresa_id, eh_teste, whatsapp_e164)
);

comment on table public.leads is 'Quem pediu orçamento. Nasce no passo do WhatsApp do link público.';
comment on column public.leads.eh_teste is 'Criado no modo teste (dono logado testando o próprio link).';

create index leads_empresa_status_idx on public.leads (empresa_id, status);
create index leads_empresa_atividade_idx on public.leads (empresa_id, ultima_atividade_em desc);

create trigger leads_atualizado_em before update on public.leads
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- orcamentos (do link público nesta etapa; a proposta completa vem na Etapa 5)
-- ---------------------------------------------------------------------------
create table public.orcamentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  lead_id         uuid not null,
  numero          integer not null check (numero > 0),
  versao          integer not null default 1 check (versao > 0),
  token           text not null unique check (token ~ '^[A-Za-z0-9_-]{32,}$'),
  status          public.status_orcamento not null default 'em_montagem',
  canal           public.canal_orcamento not null default 'publico',
  origem          public.origem_lead not null default 'link_direto',
  rascunho        jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(rascunho) = 'object' and pg_column_size(rascunho) <= 16384),
  passo_atual     smallint not null default 3 check (passo_atual between 1 and 6),
  resultado       jsonb check (resultado is null or jsonb_typeof(resultado) = 'object'),
  total_centavos  integer check (total_centavos is null or total_centavos >= 0),
  validade_ate    date,
  eh_teste        boolean not null default false,
  tipo_evento_id  uuid,
  data            date,
  turno_id        uuid,
  espaco_id       uuid,
  convidados      integer check (convidados is null or convidados between 1 and 100000),
  enviado_em      timestamptz,
  visualizado_em  timestamptz,
  aceito_em       timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (id, empresa_id),
  unique (empresa_id, numero),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade,
  foreign key (tipo_evento_id, empresa_id) references public.tipos_evento (id, empresa_id) on delete set null (tipo_evento_id),
  foreign key (turno_id, empresa_id) references public.turnos (id, empresa_id) on delete set null (turno_id),
  foreign key (espaco_id, empresa_id) references public.espacos (id, empresa_id) on delete set null (espaco_id),
  check ((status = 'em_montagem') = (resultado is null))
);

comment on column public.orcamentos.token is 'Segredo do link da proposta (≥ 32 caracteres base64url, ~244 bits).';
comment on column public.orcamentos.resultado is 'ResultadoOrcamento congelado (com versaoMotor) no momento da conclusão.';

create index orcamentos_empresa_lead_idx on public.orcamentos (empresa_id, lead_id, criado_em desc);

create trigger orcamentos_atualizado_em before update on public.orcamentos
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- orcamento_itens (cópia das linhas: nunca referência viva ao catálogo)
-- ---------------------------------------------------------------------------
create table public.orcamento_itens (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references public.empresas (id) on delete cascade,
  orcamento_id             uuid not null,
  ordem                    smallint not null check (ordem >= 0),
  tipo                     public.tipo_item_orcamento not null,
  descricao                text not null check (char_length(descricao) between 1 and 200),
  quantidade               integer not null check (quantidade >= 0),
  valor_unitario_centavos  integer not null,
  subtotal_centavos        integer not null,
  detalhe                  text check (detalhe is null or char_length(detalhe) <= 500),
  foreign key (orcamento_id, empresa_id) references public.orcamentos (id, empresa_id) on delete cascade
);

create index orcamento_itens_orcamento_idx on public.orcamento_itens (orcamento_id, ordem);

-- ---------------------------------------------------------------------------
-- atividades (linha do tempo do lead)
-- ---------------------------------------------------------------------------
create table public.atividades (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  lead_id       uuid not null,
  orcamento_id  uuid,
  tipo          public.tipo_atividade not null,
  dados         jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object'),
  autor         public.autor_atividade not null,
  usuario_id    uuid references public.usuarios (id) on delete set null,
  -- clock_timestamp: várias atividades na mesma transação ficam na ordem em que aconteceram.
  criado_em     timestamptz not null default clock_timestamp(),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade,
  foreign key (orcamento_id, empresa_id) references public.orcamentos (id, empresa_id) on delete set null (orcamento_id)
);

create index atividades_lead_idx on public.atividades (lead_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- visitas (pedido de visita pelo link; agenda de visitas fica para depois)
-- ---------------------------------------------------------------------------
create table public.visitas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  lead_id         uuid not null,
  orcamento_id    uuid,
  data_preferida  date not null,
  periodo         public.periodo_visita not null,
  observacoes     text check (observacoes is null or char_length(observacoes) <= 500),
  status          public.status_visita not null default 'solicitada',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade,
  foreign key (orcamento_id, empresa_id) references public.orcamentos (id, empresa_id) on delete set null (orcamento_id)
);

create index visitas_lead_idx on public.visitas (lead_id);

create trigger visitas_atualizado_em before update on public.visitas
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- funil_eventos (métrica do wizard; nenhum dado pessoal)
-- ---------------------------------------------------------------------------
create table public.funil_eventos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  sessao      uuid not null,
  passo       smallint not null check (passo between 0 and 6),
  evento      public.evento_funil not null,
  origem      public.origem_lead not null default 'link_direto',
  criado_em   timestamptz not null default now()
);

comment on column public.funil_eventos.passo is '0 = página do buffet; 1 a 6 = passos do wizard.';

create index funil_eventos_empresa_idx on public.funil_eventos (empresa_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- reservas ganham as FKs para lead e orçamento (colunas já existiam, todas nulas)
-- ---------------------------------------------------------------------------
alter table public.reservas
  add constraint reservas_lead_fk foreign key (lead_id, empresa_id)
    references public.leads (id, empresa_id) on delete set null (lead_id),
  add constraint reservas_orcamento_fk foreign key (orcamento_id, empresa_id)
    references public.orcamentos (id, empresa_id) on delete set null (orcamento_id);

create index reservas_lead_idx on public.reservas (lead_id) where lead_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: leitura na mesma empresa; nenhuma escrita direta.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['leads', 'orcamentos', 'orcamento_itens', 'atividades', 'visitas',
                           'funil_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (empresa_id = public.empresa_do_usuario())',
      t || '_select_mesma_empresa', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schema publico: funções chamadas SÓ pelo servidor (role anon, conexão direta).
-- NÃO deve ser exposto na API do Supabase (Settings → API → Exposed schemas).
-- ---------------------------------------------------------------------------
create schema if not exists publico;
revoke all on schema publico from public;
grant usage on schema publico to anon;
-- Funções novas não nascem executáveis por todo mundo.
alter default privileges in schema publico revoke execute on functions from public;

-- Tentativas (limites por IP, WhatsApp e empresa). Só hashes, nunca o valor.
create table publico.tentativas (
  id          uuid primary key default gen_random_uuid(),
  acao        text not null check (acao in ('iniciar', 'pre_reserva', 'visita', 'funil')),
  chave_tipo  text not null check (chave_tipo in ('ip', 'whatsapp', 'empresa')),
  chave_hash  text not null check (char_length(chave_hash) between 1 and 128),
  empresa_id  uuid references public.empresas (id) on delete cascade,
  criado_em   timestamptz not null default now()
);

create index tentativas_janela_idx on publico.tentativas (acao, chave_tipo, chave_hash, criado_em);
create index tentativas_criado_idx on publico.tentativas (criado_em);

alter table publico.tentativas enable row level security;
revoke all on publico.tentativas from public, anon, authenticated;
grant all on publico.tentativas to service_role;
