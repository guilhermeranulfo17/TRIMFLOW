-- Etapa 0 · Fundação: empresas, usuários e auditoria.
-- Convenções: ids uuid (nunca sequenciais expostos), instantes em timestamptz (UTC),
-- telefone em E.164, nomes de domínio em português.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.segmento_empresa as enum ('infantil', 'eventos', 'domicilio');
create type public.plano_empresa as enum ('trial', 'ativo', 'suspenso');
create type public.perfil_usuario as enum ('dono', 'vendedor');

-- ---------------------------------------------------------------------------
-- atualizado_em mantido por trigger
-- ---------------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- empresas
-- ---------------------------------------------------------------------------
create table public.empresas (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (char_length(btrim(nome)) between 2 and 120),
  slug            text not null unique
                    check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  segmento        public.segmento_empresa not null,
  whatsapp_e164   text check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email           text check (email ~ '^[^@\s]+@[^@\s]+$'),
  cidade          text check (char_length(cidade) <= 120),
  uf              char(2) check (uf ~ '^[A-Z]{2}$'),
  fuso            text not null default 'America/Sao_Paulo',
  plano           public.plano_empresa not null default 'trial',
  trial_ate       timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

comment on table public.empresas is 'Tenant do Orkestra: um buffet. Toda linha de negócio pertence a uma empresa.';
comment on column public.empresas.slug is 'Identificador público em /b/{slug}. Minúsculo, a-z0-9 e hífen, 3 a 60 caracteres.';

create trigger empresas_atualizado_em
  before update on public.empresas
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- usuarios (1:1 com auth.users)
-- ---------------------------------------------------------------------------
create table public.usuarios (
  id                   uuid primary key references auth.users (id) on delete cascade,
  empresa_id           uuid not null references public.empresas (id) on delete restrict,
  nome                 text not null check (char_length(btrim(nome)) between 2 and 120),
  email                text not null,
  whatsapp_e164        text check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  perfil               public.perfil_usuario not null default 'vendedor',
  limite_desconto_pct  numeric(5, 2) not null default 0 check (limite_desconto_pct between 0 and 100),
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

comment on table public.usuarios is 'Pessoa que acessa o painel. id = auth.users.id. Pertence a exatamente uma empresa.';

create index usuarios_empresa_id_idx on public.usuarios (empresa_id);

create trigger usuarios_atualizado_em
  before update on public.usuarios
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- auditoria (somente inserção)
-- ---------------------------------------------------------------------------
create table public.auditoria (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  usuario_id   uuid references public.usuarios (id) on delete set null,
  acao         text not null check (char_length(acao) between 1 and 100),
  entidade     text not null check (char_length(entidade) between 1 and 100),
  entidade_id  uuid,
  dados        jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now()
);

comment on table public.auditoria is 'Registro de quem fez o quê e quando. Append-only.';

create index auditoria_empresa_criado_idx on public.auditoria (empresa_id, criado_em desc);
create index auditoria_usuario_id_idx on public.auditoria (usuario_id);
