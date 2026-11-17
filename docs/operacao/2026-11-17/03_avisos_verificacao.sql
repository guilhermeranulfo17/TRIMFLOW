-- Item 2 · VERIFICAÇÃO (somente leitura). Entregas de avisos fora do painel, por canal, status e
-- motivo (últimos 30 dias, sem contas de demonstração/apresentação/cortesia).
-- Depois do deploy: select * from public.interno_entregas_resumo(30, false);
--                   select public.interno_canais_retrato(false);   (e /interno/diagnostico)

select x.canal, x.status, coalesce(x.erro_codigo, '') as motivo, count(*) as total,
       max(x.atualizado_em) as ultima
from public.avisos_entregas x
join public.empresas e on e.id = x.empresa_id
where x.atualizado_em > now() - interval '30 days'
  and not (e.eh_demo or e.eh_apresentacao or e.isenta)
group by 1, 2, 3
order by 1, 2, 4 desc;

-- Retrato dos canais: inscrições de push e WhatsApp ligado (contas reais)
select
  (select count(*) from public.push_inscricoes i join public.empresas e on e.id = i.empresa_id
    where not (e.eh_demo or e.eh_apresentacao or e.isenta)) as inscricoes_push,
  (select count(*) from public.preferencias_avisos p join public.empresas e on e.id = p.empresa_id
    where p.whatsapp_ativo and not (e.eh_demo or e.eh_apresentacao or e.isenta)) as whatsapp_ligado,
  (select count(*) from public.avisos_entregas where canal = 'push') as entregas_push_total;

-- Avisos críticos sem nenhuma entrega fora do painel (o que o e-mail de reserva passa a cobrir)
select a.tipo, count(*) as avisos_sem_entrega
from public.avisos a
join public.empresas e on e.id = a.empresa_id
where a.tipo in ('pagamento_falhou', 'conta_suspensa', 'pre_reserva_vencendo')
  and a.criado_em > now() - interval '30 days'
  and not (e.eh_demo or e.eh_apresentacao or e.isenta)
  and not exists (select 1 from public.avisos_entregas x where x.aviso_id = a.id
                  and x.status = 'enviado')
group by 1;
