-- Etapa 2 · Troca de slug com redirecionamento do link antigo por 12 meses.

create table public.slugs_antigos (
  slug        text primary key
                check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  expira_em   timestamptz not null,
  criado_em   timestamptz not null default now()
);

comment on table public.slugs_antigos is
  'Slugs que a empresa já usou. /b/{slug antigo} redireciona para o atual até expira_em.';

create index slugs_antigos_empresa_id_idx on public.slugs_antigos (empresa_id);

alter table public.slugs_antigos enable row level security;
revoke all on public.slugs_antigos from public, anon, authenticated;
grant all on public.slugs_antigos to service_role;
grant select on public.slugs_antigos to authenticated;

create policy slugs_antigos_select_propria
  on public.slugs_antigos for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

-- ---------------------------------------------------------------------------
-- alterar_slug: única forma de trocar o slug (a coluna não tem grant de update).
-- ---------------------------------------------------------------------------
create or replace function public.alterar_slug(novo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_atual   text;
  v_novo    text := lower(btrim(coalesce(novo, '')));
begin
  if v_empresa is null or public.perfil_do_usuario() is distinct from 'dono' then
    raise exception 'Só o dono pode alterar o link do buffet.' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_novo) not between 3 and 60 or v_novo !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Link inválido: use de 3 a 60 letras minúsculas, números e hífens.'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.slug into v_atual from public.empresas e where e.id = v_empresa for update;
  if v_novo = v_atual then
    return v_novo;
  end if;

  perform pg_advisory_xact_lock(hashtext('empresas.slug:' || v_novo));

  if exists (select 1 from public.empresas e where e.slug = v_novo and e.id <> v_empresa)
     or exists (
       select 1 from public.slugs_antigos s
       where s.slug = v_novo and s.empresa_id <> v_empresa and s.expira_em > now()
     ) then
    raise exception 'Esse link já está em uso por outro buffet.' using errcode = 'unique_violation';
  end if;

  -- Libera o slug escolhido: antigo da própria empresa ou antigo já expirado de outra.
  delete from public.slugs_antigos s where s.slug = v_novo;

  insert into public.slugs_antigos (slug, empresa_id, expira_em)
  values (v_atual, v_empresa, now() + interval '12 months')
  on conflict (slug) do update
    set empresa_id = excluded.empresa_id, expira_em = excluded.expira_em, criado_em = now();

  update public.empresas set slug = v_novo where id = v_empresa;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (
    v_empresa, auth.uid(), 'empresa.slug_alterado', 'empresa', v_empresa,
    jsonb_build_object('antes', v_atual, 'depois', v_novo)
  );

  return v_novo;
end;
$$;

revoke all on function public.alterar_slug(text) from public, anon;
grant execute on function public.alterar_slug(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leitura pública para o redirecionamento de /b/{slug}.
-- ---------------------------------------------------------------------------
create or replace function public.slug_atual_por_antigo(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug
  from public.slugs_antigos s
  join public.empresas e on e.id = s.empresa_id
  where s.slug = p_slug
    and s.expira_em > now()
$$;

revoke all on function public.slug_atual_por_antigo(text) from public;
grant execute on function public.slug_atual_por_antigo(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cadastro: um slug antigo ainda válido de outra empresa também conta como ocupado.
-- (Redefine a função da Etapa 0; mesma assinatura, mesmo comportamento para o resto.)
-- ---------------------------------------------------------------------------
create or replace function public.resolver_slug_disponivel(base text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidato text := base;
  n int := 1;
  sufixo text;
begin
  if base is null
     or char_length(base) not between 3 and 60
     or base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Slug inválido: %', coalesce(base, '(vazio)')
      using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtext('empresas.slug:' || base));

  while exists (select 1 from public.empresas e where e.slug = candidato)
     or exists (select 1 from public.slugs_antigos s where s.slug = candidato and s.expira_em > now()) loop
    n := n + 1;
    sufixo := '-' || n;
    candidato := rtrim(left(base, 60 - char_length(sufixo)), '-') || sufixo;
  end loop;

  return candidato;
end;
$$;

revoke all on function public.resolver_slug_disponivel(text) from public, anon, authenticated;
grant execute on function public.resolver_slug_disponivel(text) to service_role;
