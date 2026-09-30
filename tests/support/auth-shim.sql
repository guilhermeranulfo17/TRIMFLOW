-- Shim mínimo do ambiente Supabase para rodar os testes de integração num Postgres puro
-- (sem Docker). NÃO é usado em produção nem com `supabase start`: lá o schema auth é real.
-- Reproduz só o que as migrations, o seed e os testes usam, inclusive os privilégios padrão
-- do Supabase (que concedem tudo a anon/authenticated) para que nossos REVOKEs sejam testados.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table if not exists auth.users (
  instance_id             uuid,
  id                      uuid primary key,
  aud                     varchar(255),
  role                    varchar(255),
  email                   varchar(255) unique,
  encrypted_password      varchar(255),
  email_confirmed_at      timestamptz,
  last_sign_in_at         timestamptz,
  raw_app_meta_data       jsonb,
  raw_user_meta_data      jsonb,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),
  confirmation_token      varchar(255) default '',
  recovery_token          varchar(255) default '',
  email_change_token_new  varchar(255) default '',
  email_change            varchar(255) default ''
);

create table if not exists auth.identities (
  id               uuid primary key default gen_random_uuid(),
  provider_id      text not null,
  user_id          uuid not null references auth.users (id) on delete cascade,
  identity_data    jsonb not null,
  provider         text not null,
  last_sign_in_at  timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (provider_id, provider)
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
