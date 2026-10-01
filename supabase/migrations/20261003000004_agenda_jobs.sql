-- Etapa 3 · Jobs da agenda (pg_cron).
-- vencer_pre_reservas a cada 5 minutos; marcar_realizadas todo dia às 04:00 de Brasília
-- (07:00 UTC; o Brasil não tem horário de verão desde 2019).
-- Os jobs só persistem o estado: toda leitura e checagem de conflito já tratam pré-reserva
-- vencida como livre. Em bancos sem pg_cron (Postgres puro dos testes), nada é agendado.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: jobs da agenda não agendados.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- cron.schedule com o mesmo nome substitui o job (idempotente).
  perform cron.schedule(
    'orkestra-vencer-pre-reservas', '*/5 * * * *', 'select public.vencer_pre_reservas()');
  perform cron.schedule(
    'orkestra-marcar-realizadas', '0 7 * * *', 'select public.marcar_realizadas()');
end;
$$;
