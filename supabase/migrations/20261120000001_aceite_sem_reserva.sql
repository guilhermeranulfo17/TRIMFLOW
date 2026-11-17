-- Ajustes da análise de 17/11/2026 · Item 1: orçamento "aceito" que ficava sem reserva (§99).
--
-- Causa: o aceite (_orcamento_pre_reservar) marca o orçamento como "aceito" e cria a
-- pré-reserva. Quando a pré-reserva vencia (vencer_pre_reservas) ou era cancelada
-- (cancelar_reserva, troca de data), o lead voltava para "em andamento", mas o orçamento ficava
-- "aceito" para sempre. Resultado: o cliente não conseguia pedir de novo pelo link
-- (PUBLICO_ORCAMENTO_FECHADO) e o dono não conseguia pré-reservar pelo orçamento
-- (ORCAMENTO_ESTADO_INVALIDO); confirmar e estender também recusam pré-reserva vencida.
--
-- Regra nova: quando a PRÉ-RESERVA de um orçamento deixa de valer (vencida ou cancelada) e o
-- orçamento não tem outra reserva viva, o orçamento volta de "aceito" para "visualizado" (ou
-- "enviado", se o cliente nunca abriu). A proposta reabre para o cliente e o dono pré-reserva de
-- novo com um toque. Reserva CONFIRMADA cancelada não reabre nada (o lead vira "cancelado").
-- aceito_em fica como histórico. Validade vencida segue a regra de sempre (expirar_orcamentos).
--
-- Só expansão: função de trigger, trigger e funções de diagnóstico novas.

-- ---------------------------------------------------------------------------------------------
-- 0. Contas fora das métricas (Item 7): demonstração, apresentação e cortesia (isenta).
--    ESPELHO de domain/interno/contas (contaForaDasMetricas), com teste de equivalência.
-- ---------------------------------------------------------------------------------------------
create or replace function public._empresa_fora_das_metricas(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select e.eh_demo or e.eh_apresentacao or e.isenta
                   from public.empresas e where e.id = p_empresa), false);
$$;
revoke all on function public._empresa_fora_das_metricas(uuid) from public, anon, authenticated;
grant execute on function public._empresa_fora_das_metricas(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 1. Reserva viva de um orçamento (a mesma regra que publico.pre_reservar e _orcamento_concluir
--    já usam): confirmada ativa, pré-reserva ativa dentro do prazo ou festa realizada.
-- ---------------------------------------------------------------------------------------------
create or replace function public._orcamento_tem_reserva_viva(p_orcamento uuid, p_ignorar uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reservas r
    where r.orcamento_id = p_orcamento
      and r.id is distinct from p_ignorar
      and (r.status = 'realizada'
           or (r.status = 'ativa' and (r.tipo = 'confirmada' or r.expira_em > now()))));
$$;
revoke all on function public._orcamento_tem_reserva_viva(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Trigger: pré-reserva vencida ou cancelada reabre o orçamento aceito
-- ---------------------------------------------------------------------------------------------
create or replace function public._orcamento_reabrir_aceite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orcamentos;
begin
  select * into v_o from public.orcamentos o where o.id = new.orcamento_id for update;
  if v_o.id is null or v_o.status <> 'aceito' then
    return null;
  end if;
  if public._orcamento_tem_reserva_viva(v_o.id, new.id) then
    return null;
  end if;
  update public.orcamentos set
    status = case when v_o.visualizado_em is not null or v_o.aberturas > 0
                  then 'visualizado' else 'enviado' end::public.status_orcamento
  where id = v_o.id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_o.empresa_id, auth.uid(), 'orcamento.aceite_reaberto', 'orcamento', v_o.id,
          jsonb_build_object('reserva_id', new.id, 'reserva_status', new.status));
  return null;
end;
$$;
revoke all on function public._orcamento_reabrir_aceite() from public, anon, authenticated;

drop trigger if exists reservas_reabrir_aceite on public.reservas;
create trigger reservas_reabrir_aceite
  after update of status on public.reservas
  for each row
  when (old.status = 'ativa' and new.status in ('vencida', 'cancelada')
        and old.tipo = 'pre_reserva' and new.orcamento_id is not null)
  execute function public._orcamento_reabrir_aceite();

-- ---------------------------------------------------------------------------------------------
-- 3. Diagnóstico reaproveitável (somente leitura) para o /interno e a análise semanal:
--    orçamentos aceitos sem reserva viva (ativa dentro do prazo, confirmada ou realizada).
--    situacao: pre_reserva_vencida | pre_reserva_vencida_sem_job | pre_reserva_cancelada |
--              reserva_cancelada | sem_reserva
--    Contas de teste (demo, apresentação, isenta) só com p_incluir_teste.
-- ---------------------------------------------------------------------------------------------
create or replace function public.interno_aceitos_sem_reserva(p_incluir_teste boolean default false)
returns table (
  empresa_id      uuid,
  empresa         text,
  conta_teste     boolean,
  orcamento_id    uuid,
  numero          integer,
  versao          integer,
  aceito_em       timestamptz,
  data_festa      date,
  situacao        text,
  reserva_id      uuid,
  reserva_expira_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.empresa_id, e.nome, public._empresa_fora_das_metricas(e.id), o.id, o.numero, o.versao,
    o.aceito_em, o.data,
    case
      when r.id is null then 'sem_reserva'
      when r.status = 'ativa' and r.tipo = 'pre_reserva' then 'pre_reserva_vencida_sem_job'
      when r.status = 'vencida' then 'pre_reserva_vencida'
      when r.status = 'cancelada' and r.tipo = 'pre_reserva' then 'pre_reserva_cancelada'
      when r.status = 'cancelada' then 'reserva_cancelada'
      else r.status::text
    end,
    r.id, r.expira_em
  from public.orcamentos o
  join public.empresas e on e.id = o.empresa_id
  left join lateral (
    select x.* from public.reservas x where x.orcamento_id = o.id
    order by x.criado_em desc limit 1) r on true
  where o.status = 'aceito' and not o.eh_teste
    and not public._orcamento_tem_reserva_viva(o.id)
    and (coalesce(p_incluir_teste, false) or not public._empresa_fora_das_metricas(e.id))
  order by o.aceito_em;
$$;
revoke all on function public.interno_aceitos_sem_reserva(boolean) from public, anon, authenticated;
grant execute on function public.interno_aceitos_sem_reserva(boolean) to service_role;
comment on function public.interno_aceitos_sem_reserva(boolean) is
  'Diagnóstico (somente leitura, /interno): orçamentos aceitos sem reserva viva. Item 1 da análise de 17/11/2026.';
