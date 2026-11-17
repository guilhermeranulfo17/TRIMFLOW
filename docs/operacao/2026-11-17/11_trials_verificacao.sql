-- Item 8 · VERIFICAÇÃO (somente leitura). Testes grátis acabando e o que já foi avisado.
-- Depois do deploy: select * from public.interno_trials_terminando(14, false);  (e /interno/diagnostico)
-- Regra: "teste acabando" a 3 dias e a 1 dia do fim (job orkestra-situacoes, de hora em hora),
-- painel + push + e-mail do dono. Desde o §99 também para quem tem assinatura pendente.

select e.nome as empresa, e.trial_ate, e.plano,
       (select a.status from public.assinaturas a where a.empresa_id = e.id and a.status <> 'cancelada'
        order by a.criada_em desc limit 1) as assinatura,
       (select count(*) from public.avisos v where v.empresa_id = e.id and v.tipo = 'teste_acabando') as avisos,
       (select string_agg(x.status::text || coalesce(':' || x.erro_codigo, ''), ', ')
        from public.avisos_entregas x join public.avisos v on v.id = x.aviso_id
        where v.empresa_id = e.id and v.tipo = 'teste_acabando' and x.canal = 'email') as emails
from public.empresas e
where e.plano = 'trial' and e.trial_ate <= now() + interval '14 days'
  and not (e.eh_demo or e.eh_apresentacao or e.isenta)
order by e.trial_ate;

-- O job de situação está rodando? (última execução e status)
select j.jobname, j.schedule, j.active,
       (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as ultima_execucao
from cron.job j where j.jobname in ('orkestra-situacoes', 'orkestra-processar-avisos', 'orkestra-avisos-tempo');
