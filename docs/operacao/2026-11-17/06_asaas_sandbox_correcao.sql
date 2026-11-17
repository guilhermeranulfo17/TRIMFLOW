-- Item 4 · ENCERRAR AS COBRANÇAS E ASSINATURAS DE TESTE (SANDBOX). NÃO FOI EXECUTADO.
-- Rode só na virada para a produção (docs/COBRANCA.md, "Virada para produção"), DEPOIS de trocar
-- as variáveis na Vercel e ANTES do primeiro buffet assinar de verdade. SQL Editor, papel postgres.
--
-- O que faz (só no NOSSO banco; no Asaas sandbox nada precisa ser feito, ele não cobra ninguém):
--   * cobranças e cobranças de soluções do sandbox ainda "pendente" ou "vencida" → "cancelada";
--   * assinaturas (plano e soluções) PENDENTES ligadas a elas → "cancelada" (motivo "outro");
--   * apaga o id de cliente do Asaas de cada pagador (o id do sandbox não existe na produção;
--     o próximo "Assinar" cria o cliente de novo na produção com os mesmos dados);
--   * recalcula a situação das contas afetadas e registra no /interno (auditoria_interna).
-- NÃO mexe em cobrança paga (confirmada/recebida) nem em assinatura ATIVA: essas aparecem na
-- conferência do fim para você decidir caso a caso (ex.: dar cortesia no /interno).
-- A conta de demonstração fica de fora (ela é recriada todo dia).
--
-- Como usar: rode inteiro (termina em ROLLBACK e só mostra), confira, troque por COMMIT.

begin;

create temp table _sandbox_cob on commit drop as
select c.id, c.empresa_id, c.assinatura_id, c.status from public.cobrancas c
join public.empresas e on e.id = c.empresa_id
where c.link_fatura ilike '%sandbox.asaas.com%' and c.status in ('pendente', 'vencida')
  and not e.eh_demo;

create temp table _sandbox_mod on commit drop as
select c.id, c.empresa_id, c.modulo_assinatura_id, c.status from public.modulo_cobrancas c
join public.empresas e on e.id = c.empresa_id
where c.link_fatura ilike '%sandbox.asaas.com%' and c.status in ('pendente', 'vencida')
  and not e.eh_demo;

-- o que vai mudar
select 'cobranca' as origem, status, count(*) from _sandbox_cob group by 2
union all select 'modulo_cobranca', status, count(*) from _sandbox_mod group by 2;

update public.cobrancas c set status = 'cancelada' from _sandbox_cob s where c.id = s.id;
update public.modulo_cobrancas c set status = 'cancelada' from _sandbox_mod s where c.id = s.id;

update public.assinaturas a set status = 'cancelada', cancelada_em = now(),
  cancelamento_motivo = 'outro',
  cancelamento_texto = 'Cobrança de teste (sandbox) encerrada na virada para produção'
where a.status = 'pendente' and a.id in (select assinatura_id from _sandbox_cob where assinatura_id is not null);

update public.modulo_assinaturas a set status = 'cancelada', cancelada_em = now()
where a.status = 'pendente' and a.id in (select modulo_assinatura_id from _sandbox_mod
                                         where modulo_assinatura_id is not null);

-- ids de cliente do sandbox: só se NENHUMA cobrança de produção existe ainda
update public.empresas_cobranca set asaas_cliente_id = null
where asaas_cliente_id is not null
  and not exists (select 1 from public.cobrancas c where c.link_fatura is not null
                  and c.link_fatura not ilike '%sandbox.asaas.com%');

select public._atualizar_situacao(x.empresa_id)
from (select empresa_id from _sandbox_cob union select empresa_id from _sandbox_mod) x;

insert into public.auditoria_interna (admin_email, acao, empresa_id, dados)
select 'sistema@orkestra', 'cobranca.sandbox_encerrada', x.empresa_id,
       jsonb_build_object('origem', 'virada_producao_2026-11')
from (select empresa_id from _sandbox_cob union select empresa_id from _sandbox_mod) x;

-- conferência: o que sobrou do sandbox e precisa de decisão manual
select e.nome as empresa, 'assinatura ativa paga no sandbox' as atencao
from public.assinaturas a join public.empresas e on e.id = a.empresa_id
where a.status = 'ativa' and exists (select 1 from public.cobrancas c where c.assinatura_id = a.id
                                     and c.link_fatura ilike '%sandbox.asaas.com%')
union all
select e.nome, 'cobrança do sandbox paga (confirmada/recebida)'
from public.cobrancas c join public.empresas e on e.id = c.empresa_id
where c.link_fatura ilike '%sandbox.asaas.com%' and c.status in ('confirmada', 'recebida');

rollback;  -- troque por COMMIT depois de conferir
