-- Item 1 · CORREÇÃO DOS CASOS EXISTENTES. NÃO FOI EXECUTADO. Rode só depois de aprovar, no SQL
-- Editor do Supabase (papel postgres), DEPOIS do deploy da migration 20261120000001.
--
-- Aplica aos casos antigos a mesma regra que o trigger novo aplica daqui para a frente: orçamento
-- "aceito" cuja última reserva é PRÉ-RESERVA vencida ou cancelada (e sem outra reserva viva) volta
-- para "visualizado" (ou "enviado", se o cliente nunca abriu). Reserva CONFIRMADA cancelada não é
-- tocada. Cada orçamento corrigido ganha uma linha de auditoria.
--
-- Esperado hoje: 3 casos (1 conta trial real e 2 contas de apresentação). As contas de
-- apresentação são recriadas a cada "Recriar" no /interno; incluí-las ou não é escolha sua
-- (variável abaixo).
--
-- Como usar:
--   1. Rode o bloco inteiro como está: ele termina em ROLLBACK e só mostra o que faria.
--   2. Confira a lista (deve bater com 01_aceitos_sem_reserva_verificacao.sql).
--   3. Troque o ROLLBACK do fim por COMMIT e rode de novo.

begin;

-- true = corrige também as contas de apresentação/demonstração/cortesia
select set_config('orkestra.corrigir_contas_teste', 'true', true);

create temp table _corrigir on commit drop as
select o.id as orcamento_id, o.empresa_id, o.numero, o.versao,
       case when o.visualizado_em is not null or o.aberturas > 0 then 'visualizado' else 'enviado' end as novo_status,
       r.id as reserva_id, r.status as reserva_status
from public.orcamentos o
join public.empresas e on e.id = o.empresa_id
join lateral (
  select x.* from public.reservas x where x.orcamento_id = o.id
  order by x.criado_em desc limit 1) r on true
where o.status = 'aceito' and not o.eh_teste
  and r.tipo = 'pre_reserva' and r.status in ('vencida', 'cancelada')
  and not exists (
    select 1 from public.reservas v
    where v.orcamento_id = o.id
      and (v.status = 'realizada'
           or (v.status = 'ativa' and (v.tipo = 'confirmada' or v.expira_em > now()))))
  and (current_setting('orkestra.corrigir_contas_teste')::boolean
       or not (e.eh_demo or e.eh_apresentacao or e.isenta));

-- o que vai mudar
select c.*, e.nome as empresa from _corrigir c join public.empresas e on e.id = c.empresa_id;

update public.orcamentos o set status = c.novo_status::public.status_orcamento
from _corrigir c where o.id = c.orcamento_id and o.status = 'aceito';

insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
select c.empresa_id, null, 'orcamento.aceite_reaberto', 'orcamento', c.orcamento_id,
       jsonb_build_object('reserva_id', c.reserva_id, 'reserva_status', c.reserva_status,
                          'origem', 'correcao_2026-11-17')
from _corrigir c;

-- conferência: deve sobrar só reserva confirmada cancelada (se houver)
select count(*) as aceitos_sem_reserva_restantes
from public.orcamentos o
where o.status = 'aceito' and not o.eh_teste
  and not exists (select 1 from public.reservas v where v.orcamento_id = o.id
                  and (v.status = 'realizada'
                       or (v.status = 'ativa' and (v.tipo = 'confirmada' or v.expira_em > now()))));

rollback;  -- troque por COMMIT depois de conferir
