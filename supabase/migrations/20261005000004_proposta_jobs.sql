-- Etapa 5 · Job de expiração dos orçamentos (pg_cron).
-- expirar_orcamentos todo dia às 04:10 de Brasília (07:10 UTC): marca expiradas as versões
-- vigentes enviadas/visualizadas com validade vencida e passa o lead em andamento para frio.
-- Toda leitura já trata validade vencida como expirada, mesmo antes do job.
-- Em bancos sem pg_cron (Postgres puro dos testes), nada é agendado.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: job de expiração não agendado.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- cron.schedule com o mesmo nome substitui o job (idempotente).
  perform cron.schedule(
    'orkestra-expirar-orcamentos', '10 7 * * *', 'select public.expirar_orcamentos()');
end;
$$;
