-- Etapa 7 · Jobs dos avisos e do follow-up (pg_cron + pg_net).
--
--   orkestra-avisos-tempo         a cada 5 min   public.gerar_avisos_tempo()
--   orkestra-tarefas-automaticas  a cada 15 min  public.gerar_tarefas_automaticas()
--   orkestra-processar-avisos     a cada minuto  public.chamar_processador_avisos()
--
-- O processador chama POST {site}/api/avisos/processar com "Authorization: Bearer {segredo}".
-- URL e segredo ficam no Supabase Vault (nomes orkestra_site_url e orkestra_cron_secret),
-- NUNCA aqui. O job é sempre agendado e a função não faz nada enquanto os segredos não
-- existirem (cadastrar depois do merge já liga a fila). SQL do Vault: docs/AVISOS_CONFIGURACAO.md.
-- Em bancos sem pg_cron/pg_net/Vault (CI, Postgres local), nada é agendado.

create or replace function public.chamar_processador_avisos()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_segredo text;
  v_id      bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'orkestra_site_url'$q$
    into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'orkestra_cron_secret'$q$
    into v_segredo;
  if v_url is null or v_segredo is null then
    return null;
  end if;
  -- só se houver algo a enviar (evita uma chamada HTTP por minuto à toa)
  if not exists (select 1 from public.avisos_entregas e
                 where e.status in ('pendente', 'enviando') and e.proximo_envio_em <= now()) then
    return null;
  end if;
  execute $q$select net.http_post(url := $1, headers := $2, body := '{}'::jsonb,
                                  timeout_milliseconds := 25000)$q$
    into v_id
    using rtrim(v_url, '/') || '/api/avisos/processar',
          jsonb_build_object('Authorization', 'Bearer ' || v_segredo,
                             'Content-Type', 'application/json');
  return v_id;
end;
$$;

revoke all on function public.chamar_processador_avisos() from public, anon, authenticated;
grant execute on function public.chamar_processador_avisos() to service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: jobs de avisos e follow-up não agendados.';
    return;
  end if;
  create extension if not exists pg_cron;

  perform cron.schedule('orkestra-avisos-tempo', '*/5 * * * *', 'select public.gerar_avisos_tempo()');
  perform cron.schedule('orkestra-tarefas-automaticas', '*/15 * * * *',
                        'select public.gerar_tarefas_automaticas()');

  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    perform cron.schedule('orkestra-processar-avisos', '* * * * *',
                          'select public.chamar_processador_avisos()');
  else
    raise notice 'pg_net indisponível: processador de avisos não agendado (use a rota com after()).';
  end if;
end;
$$;
