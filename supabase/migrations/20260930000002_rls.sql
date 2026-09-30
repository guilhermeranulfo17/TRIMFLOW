-- Etapa 0 · Multiempresa com RLS.
-- Regra: usuário autenticado só lê e escreve linhas da própria empresa.
-- Vendedor não altera empresas nem usuarios. anon não acessa nenhuma tabela.

-- ---------------------------------------------------------------------------
-- Funções de tenant (security definer para não recursar nas policies de usuarios)
-- ---------------------------------------------------------------------------
create or replace function public.empresa_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.empresa_id
  from public.usuarios u
  where u.id = auth.uid()
    and u.ativo
$$;

comment on function public.empresa_do_usuario() is
  'empresa_id do usuário autenticado (null se não autenticado ou inativo).';

create or replace function public.perfil_do_usuario()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select u.perfil
  from public.usuarios u
  where u.id = auth.uid()
    and u.ativo
$$;

revoke all on function public.empresa_do_usuario() from public, anon;
revoke all on function public.perfil_do_usuario() from public, anon;
grant execute on function public.empresa_do_usuario() to authenticated, service_role;
grant execute on function public.perfil_do_usuario() to authenticated, service_role;

revoke all on function public.tocar_atualizado_em() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS ligado em todas as tabelas
-- ---------------------------------------------------------------------------
alter table public.empresas enable row level security;
alter table public.usuarios enable row level security;
alter table public.auditoria enable row level security;

-- Privilégios: começa do zero (o Supabase concede tudo por padrão) e libera o mínimo.
revoke all on public.empresas, public.usuarios, public.auditoria from public, anon, authenticated;
grant all on public.empresas, public.usuarios, public.auditoria to service_role;

-- empresas -------------------------------------------------------------------
grant select on public.empresas to authenticated;
-- slug, plano e trial_ate não são editáveis pelo painel (troca de slug e cobrança vêm depois).
grant update (nome, segmento, whatsapp_e164, email, cidade, uf, fuso) on public.empresas to authenticated;

create policy empresas_select_propria
  on public.empresas for select to authenticated
  using (id = public.empresa_do_usuario());

create policy empresas_update_dono
  on public.empresas for update to authenticated
  using (id = public.empresa_do_usuario() and public.perfil_do_usuario() = 'dono')
  with check (id = public.empresa_do_usuario() and public.perfil_do_usuario() = 'dono');

-- usuarios -------------------------------------------------------------------
grant select on public.usuarios to authenticated;
grant update (nome, whatsapp_e164, perfil, limite_desconto_pct, ativo) on public.usuarios to authenticated;

create policy usuarios_select_mesma_empresa
  on public.usuarios for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

create policy usuarios_update_dono
  on public.usuarios for update to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = 'dono')
  with check (empresa_id = public.empresa_do_usuario());

-- auditoria ------------------------------------------------------------------
grant select, insert on public.auditoria to authenticated;

create policy auditoria_select_mesma_empresa
  on public.auditoria for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

create policy auditoria_insert_proprio
  on public.auditoria for insert to authenticated
  with check (empresa_id = public.empresa_do_usuario() and usuario_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Toda empresa mantém ao menos um dono ativo.
-- ---------------------------------------------------------------------------
create or replace function public.garantir_dono_ativo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.perfil = 'dono' and old.ativo
     and (new.perfil <> 'dono' or not new.ativo)
     and not exists (
       select 1 from public.usuarios u
       where u.empresa_id = old.empresa_id
         and u.id <> old.id
         and u.perfil = 'dono'
         and u.ativo
     ) then
    raise exception 'A empresa precisa de pelo menos um dono ativo.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.garantir_dono_ativo() from public, anon, authenticated;

create trigger usuarios_garantir_dono_ativo
  before update of perfil, ativo on public.usuarios
  for each row execute function public.garantir_dono_ativo();
