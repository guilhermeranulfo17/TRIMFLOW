-- Etapa 6 · Job que esfria os leads parados (pg_cron).
-- esfriar_leads todo dia às 04:20 de Brasília (07:20 UTC): lead aberto sem nenhuma ação (do
-- cliente ou do vendedor) há 7 dias fica com temperatura "frio" (regra em _temperatura_inatividade,
-- espelho em domain/leads/temperatura). Em bancos sem pg_cron, nada é agendado.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: job de esfriar leads não agendado.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- cron.schedule com o mesmo nome substitui o job (idempotente).
  perform cron.schedule(
    'orkestra-esfriar-leads', '20 7 * * *', 'select public.esfriar_leads()');
end;
$$;
