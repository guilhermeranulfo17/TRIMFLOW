-- Etapa 9B · B.0: capa em duas larguras. O caminho salvo passa a ser `{uuid}-1920.webp` (a de
-- 960 px fica ao lado, com o mesmo id). Capas antigas (`{uuid}.webp`) continuam válidas.
alter table public.empresas drop constraint if exists empresas_capa_path_propria;
alter table public.empresas add constraint empresas_capa_path_propria check (
  capa_path is null or capa_path ~ ('^' || id::text || '/capa/[0-9a-f-]{36}(-1920)?\.webp$')
);
