-- Item 1 · VERIFICAÇÃO (somente leitura). Pode rodar já, antes do deploy.
-- Orçamentos "aceito" (versão vigente, fora de teste) sem reserva viva: nem pré-reserva ativa no
-- prazo, nem reserva confirmada ativa, nem festa realizada. Depois do deploy, o mesmo check existe
-- como função: select * from public.interno_aceitos_sem_reserva(true);  (e na tela /interno/diagnostico)
-- Saída: só empresa, número do orçamento e situação (nada do cliente final).

select e.nome as empresa,
       (e.eh_demo or e.eh_apresentacao or e.isenta) as conta_de_teste,
       o.id as orcamento_id, o.numero, o.versao, o.aceito_em, o.data as data_festa,
       case
         when r.id is null then 'sem_reserva'
         when r.status = 'ativa' and r.tipo = 'pre_reserva' then 'pre_reserva_vencida_sem_job'
         when r.status = 'vencida' then 'pre_reserva_vencida'
         when r.status = 'cancelada' and r.tipo = 'pre_reserva' then 'pre_reserva_cancelada'
         when r.status = 'cancelada' then 'reserva_cancelada'
         else r.status::text
       end as situacao,
       r.id as reserva_id, r.expira_em
from public.orcamentos o
join public.empresas e on e.id = o.empresa_id
left join lateral (
  select x.* from public.reservas x where x.orcamento_id = o.id
  order by x.criado_em desc limit 1) r on true
where o.status = 'aceito' and not o.eh_teste
  and not exists (
    select 1 from public.reservas v
    where v.orcamento_id = o.id
      and (v.status = 'realizada'
           or (v.status = 'ativa' and (v.tipo = 'confirmada' or v.expira_em > now()))))
order by conta_de_teste, o.aceito_em;
