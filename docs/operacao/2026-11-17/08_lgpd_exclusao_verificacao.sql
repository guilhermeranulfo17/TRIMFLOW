-- Item 6 · VERIFICAÇÃO (somente leitura). Exclusões de conta agendadas e a rotina que executa.
-- NÃO rode lgpd_excluir_empresa à mão: quem executa é a rota /api/lgpd/processar (pg_cron 06:40
-- UTC, depois de apagar Storage e Auth). O teste da exclusão completa roda no CI
-- (tests/integration/lgpd-exclusao-completa.test.ts) com uma empresa de teste.

-- 1. Contas com exclusão pedida
select e.nome as empresa, e.exclusao_solicitada_em, e.exclusao_agendada_para, e.plano,
       e.exclusao_agendada_para - now() as falta
from public.empresas e
where e.exclusao_agendada_para is not null
order by e.exclusao_agendada_para;

-- 2. Os jobs que fazem a exclusão e a retenção estão agendados e rodando?
select j.jobname, j.schedule, j.active,
       (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as ultima_execucao,
       (select d.status from cron.job_run_details d where d.jobid = j.jobid
        order by d.start_time desc limit 1) as ultimo_status
from cron.job j
where j.jobname in ('orkestra-lgpd-exclusao', 'orkestra-lgpd-retencao');

-- 3. Os segredos do Vault que o job usa existem? (só o nome, nunca o valor)
select name from vault.secrets where name in ('orkestra_site_url', 'orkestra_cron_secret');

-- 4. Assinaturas (plano e soluções) ainda vivas em conta com exclusão pedida (devem ser zero:
--    o pedido cancela no Asaas; desde o §99 também as soluções)
select e.nome as empresa, 'plano' as tipo, a.status from public.assinaturas a
join public.empresas e on e.id = a.empresa_id
where e.exclusao_agendada_para is not null and a.status <> 'cancelada'
union all
select e.nome, 'solução ' || m.modulo, m.status from public.modulo_assinaturas m
join public.empresas e on e.id = m.empresa_id
where e.exclusao_agendada_para is not null and m.status <> 'cancelada';
