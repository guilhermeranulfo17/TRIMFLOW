-- Item 5 · VERIFICAÇÃO (somente leitura). Reservas confirmadas ativas, de hoje em diante, sem
-- sinal, sem recebimento no Financeiro e sem plano de pagamento.
-- Depois do deploy: select * from public.interno_sinal_pendente(false);  (e /interno/diagnostico)

select e.nome as empresa, (e.eh_demo or e.eh_apresentacao or e.isenta) as conta_de_teste,
       r.id as reserva_id, r.data, r.valor_total_centavos, r.sinal_centavos, r.sinal_pago_em,
       r.confirmada_em
from public.reservas r
join public.empresas e on e.id = r.empresa_id
where r.tipo = 'confirmada' and r.status = 'ativa'
  and r.data >= (now() at time zone e.fuso)::date
  and coalesce(r.sinal_centavos, 0) = 0
  and not exists (select 1 from public.recebimentos rc where rc.reserva_id = r.id
                  and rc.estornado_em is null)
  and not exists (select 1 from public.reserva_parcelas p where p.reserva_id = r.id)
order by conta_de_teste, r.data;
