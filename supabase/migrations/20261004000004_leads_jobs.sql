-- Etapa 4 · Job dos leads (pg_cron).
-- abandonar_leads a cada 15 minutos: lead "novo" (deu o WhatsApp e não concluiu) sem atividade
-- há 24h vira "abandonou". O mesmo job limpa as tentativas antigas dos limites do link público.
-- Em bancos sem pg_cron (Postgres puro dos testes), nada é agendado.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: job dos leads não agendado.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- cron.schedule com o mesmo nome substitui o job (idempotente).
  perform cron.schedule(
    'orkestra-abandonar-leads', '*/15 * * * *', 'select public.abandonar_leads()');
end;
$$;
