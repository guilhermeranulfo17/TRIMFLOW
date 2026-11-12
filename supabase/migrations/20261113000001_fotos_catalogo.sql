-- Fotos em opcionais e nas seções do cardápio (nov/2026, ARQUITETURA §83).
--
-- Tudo aditivo (funciona com o código da versão anterior):
-- - opcionais.fotos: lista de caminhos no bucket "midia" (como pacotes.fotos);
-- - secoes_cardapio.foto_url: caminho de UMA foto da seção (nulo = sem foto). Guarda o
--   caminho no bucket, não a URL: a URL pública é montada pelo servidor (urlPublicaMidia).
-- As fotos do catálogo usam a pasta {empresa_id}/pacotes/ (mesmas regras de tamanho e formato
-- e mesmas policies do Storage). Os checks garantem que só entra caminho da própria empresa.
-- As duas tabelas já têm RLS por empresa, UPDATE só do dono e o trigger _exigir_escrita.
-- publico._contexto_da_empresa usa to_jsonb(linha): as colunas novas chegam ao servidor sem
-- mudar a função (o contexto nunca vai ao navegador).

/** true se todo elemento da lista é um caminho de foto do catálogo da empresa. */
create or replace function public._fotos_catalogo_da_empresa(p_fotos jsonb, p_empresa uuid)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_fotos) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(p_fotos) f
      where jsonb_typeof(f) <> 'string'
         or (f #>> '{}') !~ ('^' || p_empresa::text || '/pacotes/[0-9a-f-]{36}\.webp$')
    );
$$;

revoke all on function public._fotos_catalogo_da_empresa(jsonb, uuid) from public, anon;

alter table public.opcionais add column if not exists fotos jsonb not null default '[]'::jsonb;

alter table public.opcionais drop constraint if exists opcionais_fotos_validas;
alter table public.opcionais add constraint opcionais_fotos_validas
  check (public._fotos_catalogo_da_empresa(fotos, empresa_id) and jsonb_array_length(fotos) <= 6);

comment on column public.opcionais.fotos is
  'Caminhos no bucket midia ({empresa_id}/pacotes/{uuid}.webp); a primeira vai na proposta.';

alter table public.secoes_cardapio add column if not exists foto_url text;

alter table public.secoes_cardapio drop constraint if exists secoes_cardapio_foto_valida;
alter table public.secoes_cardapio add constraint secoes_cardapio_foto_valida
  check (foto_url is null
    or foto_url ~ ('^' || empresa_id::text || '/pacotes/[0-9a-f-]{36}\.webp$'));

comment on column public.secoes_cardapio.foto_url is
  'Caminho da foto da seção no bucket midia ({empresa_id}/pacotes/{uuid}.webp), não a URL.';
