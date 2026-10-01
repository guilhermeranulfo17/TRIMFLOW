-- Etapa 5 · Versões do orçamento e exclusão vira desativação no catálogo.
--
-- Versões: um orçamento = um número; cada alteração = uma linha nova (versao 1, 2, 3…) com o
-- mesmo (empresa_id, numero). Vigente = status <> 'substituido'; só uma por número.
-- Os orçamentos existentes viram a versão 1 dos seus números (já têm versao = 1).
-- Compatível com o código da Etapa 4: os números hoje já são únicos.

alter table public.orcamentos drop constraint if exists orcamentos_empresa_id_numero_key;
alter table public.orcamentos
  add constraint orcamentos_empresa_numero_versao_key unique (empresa_id, numero, versao);

create unique index orcamentos_vigente_idx
  on public.orcamentos (empresa_id, numero) where status <> 'substituido';

comment on column public.orcamentos.versao is
  'Versão do mesmo número. Toda alteração cria uma versão nova; a anterior vira substituido.';

-- ---------------------------------------------------------------------------
-- Backfill das colunas derivadas (a partir do resultado já congelado; nada é reescrito)
-- ---------------------------------------------------------------------------
update public.orcamentos o
set pacote_id = (l.linha ->> 'referenciaId')::uuid
from (
  select o2.id, x.linha
  from public.orcamentos o2
  cross join lateral jsonb_array_elements(coalesce(o2.resultado -> 'linhas', '[]'::jsonb)) as x(linha)
  where x.linha ->> 'tipo' = 'pacote'
    and x.linha ->> 'referenciaId' ~ '^[0-9a-f-]{36}$'
) l
where l.id = o.id and o.pacote_id is null;

update public.orcamento_itens i
set referencia_id = (x.linha ->> 'referenciaId')::uuid
from public.orcamentos o
cross join lateral jsonb_array_elements(coalesce(o.resultado -> 'linhas', '[]'::jsonb))
  with ordinality as x(linha, ordem)
where i.orcamento_id = o.id
  and i.ordem = x.ordem - 1
  and i.referencia_id is null
  and x.linha ->> 'referenciaId' ~ '^[0-9a-f-]{36}$';

-- ---------------------------------------------------------------------------
-- Exclusão vira desativação: item do catálogo usado por algum orçamento não pode ser excluído.
-- Quando a própria empresa está sendo apagada (cascata), a exclusão é liberada.
-- ---------------------------------------------------------------------------
create or replace function public._catalogo_em_uso(p_tabela text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_tabela
    when 'pacotes' then exists (select 1 from public.orcamentos o where o.pacote_id = p_id)
    when 'opcionais' then exists (select 1 from public.orcamento_itens i where i.referencia_id = p_id and i.tipo = 'opcional')
    when 'turnos' then exists (select 1 from public.orcamentos o where o.turno_id = p_id)
    when 'espacos' then exists (select 1 from public.orcamentos o where o.espaco_id = p_id)
    when 'tipos_evento' then exists (select 1 from public.orcamentos o where o.tipo_evento_id = p_id)
    else false
  end;
$$;

create or replace function public._catalogo_impedir_exclusao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.empresas e where e.id = old.empresa_id) then
    return old; -- a empresa inteira está sendo apagada
  end if;
  if public._catalogo_em_uso(tg_table_name, old.id) then
    raise exception 'CATALOGO_ITEM_EM_USO' using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['pacotes', 'opcionais', 'turnos', 'espacos', 'tipos_evento'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_impedir_exclusao_em_uso', t);
    execute format(
      'create trigger %I before delete on public.%I for each row execute function public._catalogo_impedir_exclusao()',
      t || '_impedir_exclusao_em_uso', t);
  end loop;
end;
$$;

/** Itens do catálogo da empresa do usuário que já foram usados em orçamentos (telas: Desativar). */
create or replace function public.catalogo_em_uso()
returns table (tabela text, id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select 'pacotes', o.pacote_id from public.orcamentos o
  where o.empresa_id = public.empresa_do_usuario() and o.pacote_id is not null
  union
  select 'opcionais', i.referencia_id from public.orcamento_itens i
  where i.empresa_id = public.empresa_do_usuario() and i.tipo = 'opcional' and i.referencia_id is not null
  union
  select 'turnos', o.turno_id from public.orcamentos o
  where o.empresa_id = public.empresa_do_usuario() and o.turno_id is not null
  union
  select 'espacos', o.espaco_id from public.orcamentos o
  where o.empresa_id = public.empresa_do_usuario() and o.espaco_id is not null
  union
  select 'tipos_evento', o.tipo_evento_id from public.orcamentos o
  where o.empresa_id = public.empresa_do_usuario() and o.tipo_evento_id is not null;
$$;

revoke all on function public._catalogo_em_uso(text, uuid) from public, anon, authenticated;
revoke all on function public._catalogo_impedir_exclusao() from public, anon, authenticated;
revoke all on function public.catalogo_em_uso() from public, anon;
grant execute on function public.catalogo_em_uso() to authenticated;
