-- Etapa 13 · Funil de leads: as negociações da caixa em colunas (Novo, Em conversa, Proposta,
-- Pré-reserva, Reservado e a faixa Perdidos e frios). Só leitura: nenhuma tabela nova, nenhuma
-- escrita. Mover um card chama as funções que já existem (registrar_contato, marcar_perdido,
-- reabrir_lead, pre_reservar_orcamento, confirmar_reserva).

/**
 * Etapa do lead no funil. ESPELHO de domain/leads/funil.ts (etapaDoFunil), com teste de
 * equivalência. `p_orcamento` = status do orçamento vigente mais recente (null sem orçamento).
 * Realizado fica fora (null): a festa já aconteceu.
 */
create or replace function public._funil_etapa(
  p_status public.status_lead, p_orcamento public.status_orcamento
)
returns text
language sql
immutable
-- sem SET search_path: o planner embute a função em funil_leads (só expressões)
as $$
  select case
    when p_status in ('novo', 'abandonou') then 'novo'
    when p_status = 'em_andamento' then
      case when p_orcamento in ('enviado', 'visualizado') then 'proposta' else 'conversa' end
    when p_status = 'pre_reservado' then 'pre_reserva'
    when p_status = 'reservado' then 'reservado'
    when p_status in ('frio', 'perdido', 'cancelado') then 'perdido'
    else null
  end;
$$;

/**
 * Cards do funil: até p_limite por etapa (mais recentes primeiro), com o total de leads e a soma
 * das propostas de cada etapa. Mesmos filtros da caixa (menos status e atalhos). Security
 * invoker: o RLS de leads, orçamentos, reservas e tarefas vale aqui.
 */
create or replace function public.funil_leads(
  p_filtros jsonb default '{}'::jsonb, p_limite integer default 50
)
returns table (
  id uuid, nome text, status public.status_lead, temperatura public.temperatura_lead,
  eh_teste boolean, responsavel_id uuid, responsavel_nome text, ultima_atividade_em timestamptz,
  etapa text, etapa_total integer, etapa_soma_centavos bigint,
  orcamento_id uuid, orcamento_status public.status_orcamento, orcamento_reservavel boolean,
  total_centavos integer, evento_data date, evento_tipo text,
  pre_reserva_expira_em timestamptz, tarefa_vence timestamptz, tarefa_titulo text,
  tem_atrasada boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with param as materialized (
    select
      e.id as empresa_id,
      (now() at time zone e.fuso)::date as hoje,
      auth.uid() as eu,
      coalesce(p_filtros, '{}'::jsonb) as f,
      nullif(regexp_replace(coalesce(p_filtros ->> 'busca', ''), '\D', '', 'g'), '') as digitos,
      nullif(btrim(coalesce(p_filtros ->> 'busca', '')), '') as busca
    from public.empresas e
    where e.id = public.empresa_do_usuario()
  ),
  pr as (
    select r.lead_id, min(r.expira_em) as expira
    from public.reservas r
    where r.empresa_id = (select empresa_id from param) and r.status = 'ativa'
      and r.tipo = 'pre_reserva' and r.expira_em > now() and r.lead_id is not null
    group by r.lead_id
  ),
  ta as (
    select distinct on (t.lead_id) t.lead_id, t.vence_efetivo as vence, t.titulo
    from public.tarefas t
    where t.empresa_id = (select empresa_id from param) and t.feita_em is null
      and t.cancelada_em is null and (t.responsavel_id = auth.uid() or t.responsavel_id is null)
    order by t.lead_id, t.vence_efetivo
  ),
  at as (
    select t.lead_id, true as tem
    from public.tarefas t
    where t.empresa_id = (select empresa_id from param) and t.feita_em is null
      and t.cancelada_em is null and t.vence_efetivo < now()
    group by t.lead_id
  ),
  o as (
    select distinct on (o.lead_id) o.*
    from public.orcamentos o
    where o.empresa_id = (select empresa_id from param)
      and o.status not in ('substituido', 'em_montagem')
    order by o.lead_id, o.criado_em desc
  ),
  base as (
    select l.id, l.nome, l.status, l.temperatura, l.eh_teste, l.responsavel_id,
      l.ultima_atividade_em, public._funil_etapa(l.status, o.status) as etapa,
      o.id as o_id, o.status as o_status,
      (o.status in ('enviado', 'visualizado') and not o.eh_teste
       and (o.validade_ate is null or o.validade_ate >= p.hoje)) as o_reservavel,
      o.total_centavos as o_total, o.data as o_data, o.tipo_evento_id as o_tipo,
      pr.expira, ta.vence as t_vence, ta.titulo as t_titulo, at.tem as t_atrasada
    from param p
    join public.leads l on l.empresa_id = p.empresa_id
    left join pr on pr.lead_id = l.id
    left join ta on ta.lead_id = l.id
    left join at on at.lead_id = l.id
    left join o on o.lead_id = l.id
    where l.status <> 'realizado'
      and (coalesce((p.f ->> 'teste')::boolean, false) or not l.eh_teste)
      and (not p.f ? 'temperatura'
           or l.temperatura::text in (select jsonb_array_elements_text(p.f -> 'temperatura')))
      and (not p.f ? 'origem' or l.origem::text in (select jsonb_array_elements_text(p.f -> 'origem')))
      and (p.f ->> 'responsavel' is null
           or (case p.f ->> 'responsavel'
                 when 'meus' then l.responsavel_id = p.eu
                 when 'sem' then l.responsavel_id is null
                 else l.responsavel_id::text = p.f ->> 'responsavel' end))
      and (p.busca is null
           or l.nome ilike '%' || replace(replace(replace(p.busca, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           or (char_length(coalesce(p.digitos, '')) >= 4 and l.whatsapp_e164 like '%' || p.digitos || '%'))
      and (not p.f ? 'evento_de' or o.data >= (p.f ->> 'evento_de')::date)
      and (not p.f ? 'evento_ate' or o.data <= (p.f ->> 'evento_ate')::date)
  ),
  numerado as (
    select b.*,
      row_number() over (partition by b.etapa order by b.ultima_atividade_em desc, b.id) as n,
      count(*) over (partition by b.etapa) as total,
      coalesce(sum(b.o_total) over (partition by b.etapa), 0) as soma
    from base b
  )
  select x.id, x.nome, x.status, x.temperatura, x.eh_teste, x.responsavel_id, u.nome,
    x.ultima_atividade_em, x.etapa, x.total::integer, x.soma::bigint, x.o_id, x.o_status,
    coalesce(x.o_reservavel, false), x.o_total, x.o_data, te.nome, x.expira, x.t_vence,
    x.t_titulo, coalesce(x.t_atrasada, false)
  from numerado x
  left join public.usuarios u on u.id = x.responsavel_id
  left join public.tipos_evento te on te.id = x.o_tipo
  where x.n <= greatest(1, least(coalesce(p_limite, 50), 100))
  order by x.etapa, x.n;
$$;

revoke all on function public.funil_leads(jsonb, integer) from public, anon;
grant execute on function public.funil_leads(jsonb, integer) to authenticated;
revoke all on function public._funil_etapa(public.status_lead, public.status_orcamento) from public, anon;
grant execute on function public._funil_etapa(public.status_lead, public.status_orcamento) to authenticated, service_role;
