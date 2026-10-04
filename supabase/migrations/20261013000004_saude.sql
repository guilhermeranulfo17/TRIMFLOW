-- Etapa 9B · B.3 Observabilidade: dados para GET /api/saude (monitor de disponibilidade).
-- Só números e nomes de jobs; nada de empresa, lead ou usuário. Executada pela conexão
-- administrativa do servidor (service_role/postgres), nunca pela API.

create or replace function public.saude_sistema(p_agora timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fila  integer;
  v_jobs  jsonb := null;
begin
  -- minutos de atraso da entrega pendente mais antiga (0 = em dia)
  select coalesce(max(extract(epoch from (p_agora - e.proximo_envio_em)) / 60), 0)::integer
    into v_fila
  from public.avisos_entregas e
  where e.status in ('pendente', 'enviando') and e.proximo_envio_em <= p_agora;

  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'nome', j.jobname,
               'agenda', j.schedule,
               'ativo', j.active,
               'ultima', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
               'ultimo_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid
                                 order by d.start_time desc limit 1))
             order by j.jobname), '[]'::jsonb)
      from cron.job j where j.jobname like 'orkestra-%'
    $q$ into v_jobs;
  end if;

  return jsonb_build_object('fila_atraso_min', v_fila, 'jobs', v_jobs);
end;
$$;

revoke all on function public.saude_sistema(timestamptz) from public, anon, authenticated;
grant execute on function public.saude_sistema(timestamptz) to service_role;
