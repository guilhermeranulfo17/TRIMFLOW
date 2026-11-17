-- Item 7 · BASE DA ANÁLISE SEMANAL (somente leitura). Números da plataforma SEM as contas de
-- demonstração (eh_demo), apresentação (eh_apresentacao) e cortesia (isenta).
-- Depois do deploy, prefira a função (mesma regra, com teste de equivalência no CI):
--   select public.interno_metricas_plataforma(false);   -- sem contas de teste
--   select public.interno_metricas_plataforma(true);    -- todas
-- Regra para QUALQUER consulta nova da análise semanal: filtre as empresas com
--   not public._empresa_fora_das_metricas(e.id)
-- (antes do deploy: not (e.eh_demo or e.eh_apresentacao or e.isenta)).

with emp as (
  select e.* from public.empresas e where not (e.eh_demo or e.eh_apresentacao or e.isenta)
)
select
  (select count(*) from emp) as empresas,
  (select count(*) from public.leads l join emp e on e.id = l.empresa_id where not l.eh_teste) as leads,
  (select count(*) from public.orcamentos o join emp e on e.id = o.empresa_id
    where not o.eh_teste and o.status <> 'em_montagem') as orcamentos,
  (select count(*) from public.orcamentos o join emp e on e.id = o.empresa_id
    where not o.eh_teste and o.status = 'aceito') as aceitos,
  (select count(*) from public.reservas r join emp e on e.id = r.empresa_id
    where r.tipo = 'confirmada' and r.status in ('ativa', 'realizada')) as reservas_confirmadas,
  (select count(*) from public.empresas e where e.eh_demo or e.eh_apresentacao or e.isenta) as contas_de_teste_fora;

-- As contas de teste, para conferir quem está fora
select e.nome, e.eh_demo, e.eh_apresentacao, e.isenta, e.plano
from public.empresas e where e.eh_demo or e.eh_apresentacao or e.isenta order by e.nome;
