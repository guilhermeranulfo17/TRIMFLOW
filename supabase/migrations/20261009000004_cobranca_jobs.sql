-- Etapa 9A · Jobs da cobrança (pg_cron + pg_net).
--
--   orkestra-situacoes             de hora em hora   public.atualizar_situacoes()
--   orkestra-cobranca-reconciliar  diário 07:10 UTC  public.chamar_reconciliacao_cobranca()
--                                  (04:10 em São Paulo)
--
-- A reconciliação chama POST {site}/api/cobranca/reconciliar com "Authorization: Bearer
-- {segredo}" (os mesmos orkestra_site_url e orkestra_cron_secret do Vault usados pelos avisos).
-- Sem pg_cron/pg_net/Vault (CI, Postgres local), nada é agendado.

create or replace function public.chamar_reconciliacao_cobranca()
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
  -- nada a conferir sem assinatura nem implantação em aberto
  if not exists (select 1 from public.assinaturas a where a.asaas_assinatura_id is not null)
     and not exists (select 1 from public.cobrancas c
                     where c.tipo = 'implantacao' and c.status in ('pendente', 'vencida')) then
    return null;
  end if;
  execute $q$select net.http_post(url := $1, headers := $2, body := '{}'::jsonb,
                                  timeout_milliseconds := 25000)$q$
    into v_id
    using rtrim(v_url, '/') || '/api/cobranca/reconciliar',
          jsonb_build_object('Authorization', 'Bearer ' || v_segredo,
                             'Content-Type', 'application/json');
  return v_id;
end;
$$;

revoke all on function public.chamar_reconciliacao_cobranca() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: jobs da cobrança não agendados.';
    return;
  end if;
  create extension if not exists pg_cron;

  -- cron.schedule com o mesmo nome substitui o job (idempotente).
  perform cron.schedule('orkestra-situacoes', '7 * * * *', 'select public.atualizar_situacoes()');

  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    perform cron.schedule('orkestra-cobranca-reconciliar', '10 7 * * *',
                          'select public.chamar_reconciliacao_cobranca()');
  else
    raise notice 'pg_net indisponível: reconciliação da cobrança não agendada.';
  end if;
end;
$$;
