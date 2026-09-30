-- Etapa 2 · Identidade do buffet: logo, capa, cor da marca e "sobre", editáveis pelo dono.
-- Também valida empresas.fuso contra os fusos que o Postgres conhece.

alter table public.empresas
  add column logo_path text,
  add column capa_path text,
  add column cor_marca text not null default '#7C5CD6',
  add column sobre text,
  add constraint empresas_cor_marca_hex check (cor_marca ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint empresas_sobre_tamanho check (char_length(sobre) <= 600),
  -- Caminhos no bucket "midia" sempre dentro da pasta da própria empresa.
  add constraint empresas_logo_path_propria check (
    logo_path is null or logo_path ~ ('^' || id::text || '/logo/[0-9a-f-]{36}\.webp$')
  ),
  add constraint empresas_capa_path_propria check (
    capa_path is null or capa_path ~ ('^' || id::text || '/capa/[0-9a-f-]{36}\.webp$')
  );

comment on column public.empresas.logo_path is 'Caminho no bucket midia: {empresa_id}/logo/{uuid}.webp';
comment on column public.empresas.capa_path is 'Caminho no bucket midia: {empresa_id}/capa/{uuid}.webp';

-- O dono passa a editar também as colunas novas (slug, plano e trial_ate continuam fora).
grant update (logo_path, capa_path, cor_marca, sobre) on public.empresas to authenticated;

-- ---------------------------------------------------------------------------
-- Fuso horário válido
-- ---------------------------------------------------------------------------
create or replace function public.validar_fuso_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = new.fuso) then
    raise exception 'Fuso horário inválido: %', new.fuso using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_fuso_empresa() from public, anon, authenticated;

create trigger empresas_validar_fuso
  before insert or update of fuso on public.empresas
  for each row execute function public.validar_fuso_empresa();
