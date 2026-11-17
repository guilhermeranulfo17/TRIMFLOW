-- Item 4 · VERIFICAÇÃO (somente leitura). O que veio do sandbox do Asaas.
-- Depois do deploy: select * from public.interno_cobrancas_sandbox();  (e /interno/diagnostico)

select 'cobranca' as origem, c.status, count(*) as total, min(c.vencimento), max(c.vencimento)
from public.cobrancas c where c.link_fatura ilike '%sandbox.asaas.com%' group by 2
union all
select 'modulo_cobranca', c.status, count(*), min(c.vencimento), max(c.vencimento)
from public.modulo_cobrancas c where c.link_fatura ilike '%sandbox.asaas.com%' group by 2
order by 1, 2;

-- Assinaturas ligadas a cobranças do sandbox, por empresa (sem dado do pagador)
select e.nome as empresa, e.plano as situacao_conta, a.status as assinatura, a.plano_codigo,
       a.criada_em
from public.assinaturas a join public.empresas e on e.id = a.empresa_id
where exists (select 1 from public.cobrancas c where c.assinatura_id = a.id
              and c.link_fatura ilike '%sandbox.asaas.com%')
order by a.criada_em;

-- Clientes do Asaas cadastrados (os ids do sandbox NÃO valem na produção)
select count(*) as clientes_com_id_asaas from public.empresas_cobranca where asaas_cliente_id is not null;
