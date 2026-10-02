-- Etapa 8 · Números: métricas do link, conversão, origem, perdas, atendimento e ocupação.
--
-- ESPELHO de src/domain/numeros (metricas.ts, ocupacao.ts), com teste de equivalência numa
-- tabela de casos. Mudou uma, mude a outra. Definições exatas: docs/ARQUITETURA.md (§53).
--
-- Leitura só por funções security definer que conferem o usuário logado: o dono vê a empresa
-- toda; o vendedor só os leads dele (sem funil de visitas). Lead de teste nunca entra.
-- Datas: data civil no fuso da empresa, período inclusivo.

-- ---------------------------------------------------------------------------
-- Índices de apoio
-- ---------------------------------------------------------------------------
create index if not exists atividades_empresa_pedidos_idx
  on public.atividades (empresa_id, lead_id)
  where tipo in ('pre_reserva_pedida', 'visita_pedida');

create index if not exists funil_eventos_empresa_evento_idx
  on public.funil_eventos (empresa_id, criado_em, evento);

create index if not exists avisos_lead_idx on public.avisos (lead_id) where lead_id is not null;

create index if not exists reservas_empresa_confirmadas_idx
  on public.reservas (empresa_id, lead_id)
  where tipo = 'confirmada' and status in ('ativa', 'realizada');

-- ---------------------------------------------------------------------------
-- Fatos (um por lead, reserva e evento do funil), sem lead de teste
-- ---------------------------------------------------------------------------

/** Ação do vendedor = a mesma de leads.primeiro_contato_em (autor usuário, menos troca de responsável). */
create or replace function public._numeros_leads(p_empresa uuid, p_vendedor uuid)
returns table (
  id uuid, criado_em timestamptz, origem public.origem_lead, responsavel_id uuid,
  status public.status_lead, temperatura public.temperatura_lead,
  orcamento_completo boolean, pediu_pre_ou_visita boolean, tem_reserva_confirmada boolean,
  proposta_status public.status_orcamento, total_vigente_centavos integer,
  perdido_em timestamptz, motivo_perda text,
  acao_cliente_em timestamptz, contato_apos_acao_em timestamptz,
  aviso_em timestamptz, contato_apos_aviso_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with l as (
    select * from public.leads x
    where x.empresa_id = p_empresa and not x.eh_teste
      and (p_vendedor is null or x.responsavel_id = p_vendedor)
  ),
  vig as (
    select distinct on (o.lead_id) o.lead_id, o.status, o.total_centavos
    from public.orcamentos o
    where o.empresa_id = p_empresa and o.status <> 'substituido'
    order by o.lead_id, o.criado_em desc
  ),
  orc as (
    select o.lead_id, bool_or(o.status <> 'em_montagem') as concluido
    from public.orcamentos o where o.empresa_id = p_empresa group by o.lead_id
  ),
  ped as (
    select a.lead_id,
           min(a.criado_em) filter (where a.autor = 'cliente') as acao
    from public.atividades a
    where a.empresa_id = p_empresa and a.tipo in ('pre_reserva_pedida', 'visita_pedida')
    group by a.lead_id
  ),
  res as (
    select distinct r.lead_id from public.reservas r
    where r.empresa_id = p_empresa and r.lead_id is not null
      and r.tipo = 'confirmada' and r.status in ('ativa', 'realizada')
  ),
  av as (
    select a.lead_id, min(a.agendado_para) as aviso
    from public.avisos a
    where a.empresa_id = p_empresa and a.lead_id is not null
      and a.tipo in ('pre_reserva_pedida', 'visita_pedida')
    group by a.lead_id
  )
  select l.id, l.criado_em, l.origem, l.responsavel_id, l.status, l.temperatura,
         coalesce(l.ultimo_passo, 0) >= 6 or coalesce(orc.concluido, false),
         ped.lead_id is not null,
         res.lead_id is not null,
         vig.status, vig.total_centavos,
         l.perdido_em, l.motivo_perda_codigo::text,
         ped.acao,
         case when ped.acao is not null then (
           select min(x.criado_em) from public.atividades x
           where x.lead_id = l.id and x.autor = 'usuario' and x.usuario_id is not null
             and x.tipo <> 'responsavel_alterado' and x.criado_em >= ped.acao) end,
         av.aviso,
         case when av.aviso is not null then (
           select min(x.criado_em) from public.atividades x
           where x.lead_id = l.id and x.autor = 'usuario' and x.usuario_id is not null
             and x.tipo <> 'responsavel_alterado' and x.criado_em >= av.aviso) end
  from l
  left join vig on vig.lead_id = l.id
  left join orc on orc.lead_id = l.id
  left join ped on ped.lead_id = l.id
  left join res on res.lead_id = l.id
  left join av on av.lead_id = l.id;
$$;

/** Reservas confirmadas (ativas ou realizadas) de leads reais. Valor: reserva → vigente → 0. */
create or replace function public._numeros_reservas(p_empresa uuid, p_vendedor uuid)
returns table (lead_id uuid, confirmada_em timestamptz, valor_centavos integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.lead_id, coalesce(r.confirmada_em, r.criado_em),
         coalesce(r.valor_total_centavos, (
           select o.total_centavos from public.orcamentos o
           where o.lead_id = r.lead_id and o.status <> 'substituido'
           order by o.criado_em desc limit 1), 0)
  from public.reservas r
  join public.leads l on l.id = r.lead_id and not l.eh_teste
   and (p_vendedor is null or l.responsavel_id = p_vendedor)
  where r.empresa_id = p_empresa and r.tipo = 'confirmada' and r.status in ('ativa', 'realizada');
$$;

/** Eventos do funil entre dois instantes (o filtro por data civil é feito por quem chama). */
create or replace function public._numeros_funil(p_empresa uuid, p_de timestamptz, p_ate timestamptz)
returns table (sessao uuid, evento public.evento_funil, passo smallint, origem public.origem_lead,
               criado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.sessao, f.evento, f.passo, f.origem, f.criado_em
  from public.funil_eventos f
  where f.empresa_id = p_empresa and f.criado_em >= p_de and f.criado_em < p_ate;
$$;

-- ---------------------------------------------------------------------------
-- Cálculo (espelho de calcularResumo, porOrigem, motivosDePerda e atendimento)
-- ---------------------------------------------------------------------------

/** Mediana de inteiros: o do meio, ou a média dos dois do meio arredondada meio para cima. */
create or replace function public._mediana(p_valores integer[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when n = 0 then null
    when n % 2 = 1 then v[(n + 1) / 2]
    else floor((v[n / 2] + v[n / 2 + 1])::numeric / 2 + 0.5)::integer
  end
  from (select coalesce(array_agg(x order by x), '{}') as v,
               coalesce(cardinality(array_agg(x)), 0) as n
        from unnest(p_valores) x) s;
$$;

create or replace function public._razao_bp(p_num numeric, p_den numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_den > 0 then floor(p_num * 10000 / p_den + 0.5)::integer end;
$$;

/**
 * Todas as métricas do período e do anterior (mesmo tamanho). p_vendedor não nulo = só os
 * leads dele, sem funil de visitas. Devolve jsonb (chaves em snake_case).
 */
create or replace function public._numeros_calcular(
  p_empresa uuid, p_vendedor uuid, p_fuso text, p_de date, p_ate date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with
  per as (
    select 'atual'::text as chave, p_de as de, p_ate as ate
    union all
    select 'anterior', p_de - (p_ate - p_de + 1), p_de - 1
  ),
  lf as materialized (
    select f.*, (f.criado_em at time zone p_fuso)::date as dia,
           f.status in ('reservado', 'realizado', 'perdido', 'cancelado')
             or f.proposta_status = 'expirado' as decidido,
           f.status in ('reservado', 'realizado') as reservado
    from public._numeros_leads(p_empresa, p_vendedor) f
  ),
  rf as materialized (
    select r.*, (r.confirmada_em at time zone p_fuso)::date as dia
    from public._numeros_reservas(p_empresa, p_vendedor) r
  ),
  ff as materialized (
    select f.*, (f.criado_em at time zone p_fuso)::date as dia
    from public._numeros_funil(
      p_empresa,
      ((p_de - (p_ate - p_de + 1))::timestamp at time zone p_fuso) - interval '1 day',
      ((p_ate + 1)::timestamp at time zone p_fuso) + interval '1 day') f
    where p_vendedor is null
  ),
  resumo as (
    select per.chave, jsonb_build_object(
      'visitas', (select count(distinct f.sessao) from ff f
                  where f.evento = 'pagina_vista' and f.dia between per.de and per.ate),
      'inicios', (select count(distinct f.sessao) from ff f
                  where ((f.evento = 'passo_concluido' and f.passo >= 1)
                         or (f.evento = 'passo_visto' and f.passo >= 2))
                    and f.dia between per.de and per.ate),
      'leads', (select count(*) from lf where lf.dia between per.de and per.ate),
      'funil_leads', (select count(*) from lf where lf.dia between per.de and per.ate
                        and lf.origem <> 'interno'),
      'funil_completos', (select count(*) from lf where lf.dia between per.de and per.ate
                            and lf.origem <> 'interno' and lf.orcamento_completo),
      'funil_pre_visitas', (select count(*) from lf where lf.dia between per.de and per.ate
                              and lf.origem <> 'interno' and lf.pediu_pre_ou_visita),
      'funil_reservas', (select count(*) from lf where lf.dia between per.de and per.ate
                           and lf.origem <> 'interno' and lf.tem_reserva_confirmada),
      'reservas', (select count(distinct rf.lead_id) from rf where rf.dia between per.de and per.ate),
      'valor_reservado_centavos', (select coalesce(sum(rf.valor_centavos), 0) from rf
                                   where rf.dia between per.de and per.ate),
      'decididos', (select count(*) from lf where lf.dia between per.de and per.ate and lf.decidido),
      'reservados_decididos', (select count(*) from lf where lf.dia between per.de and per.ate
                                 and lf.decidido and lf.reservado),
      'conversao_bp', public._razao_bp(
        (select count(*) from lf where lf.dia between per.de and per.ate and lf.decidido and lf.reservado),
        (select count(*) from lf where lf.dia between per.de and per.ate and lf.decidido)),
      'em_aberto_centavos', (select coalesce(sum(coalesce(lf.total_vigente_centavos, 0)), 0) from lf
        where lf.status in ('em_andamento', 'pre_reservado')
           or (lf.temperatura = 'quente'
               and lf.status in ('novo', 'em_andamento', 'abandonou', 'frio', 'pre_reservado')))
    ) as dados
    from per
  ),
  coorte as (
    select lf.origem, count(*) as leads,
           count(*) filter (where lf.decidido) as dec,
           count(*) filter (where lf.decidido and lf.reservado) as resd
    from lf where lf.dia between p_de and p_ate group by lf.origem
  ),
  origem_res as (
    select lf.origem, count(distinct rf.lead_id) as reservas, sum(rf.valor_centavos) as valor
    from rf join lf on lf.id = rf.lead_id
    where rf.dia between p_de and p_ate group by lf.origem
  ),
  por_origem as (
    select coalesce(c.origem, r.origem) as origem, coalesce(c.leads, 0) as leads,
           coalesce(r.reservas, 0) as reservas, public._razao_bp(coalesce(c.resd, 0), coalesce(c.dec, 0)) as conversao_bp,
           coalesce(r.valor, 0) as valor
    from coorte c full join origem_res r on r.origem = c.origem
  ),
  perdas as (
    select coalesce(lf.motivo_perda, 'outro') as motivo, count(*) as quantidade
    from lf where lf.status = 'perdido' and lf.perdido_em is not null
      and (lf.perdido_em at time zone p_fuso)::date between p_de and p_ate
    group by 1
  ),
  acoes as (
    select lf.responsavel_id, lf.contato_apos_acao_em,
           case when lf.contato_apos_acao_em is not null then
             greatest(0, round(extract(epoch from (lf.contato_apos_acao_em - lf.acao_cliente_em)) / 60))::integer end as min_acao,
           case when lf.aviso_em is not null and lf.contato_apos_aviso_em is not null then
             greatest(0, round(extract(epoch from (lf.contato_apos_aviso_em - lf.aviso_em)) / 60))::integer end as min_aviso
    from lf where lf.acao_cliente_em is not null
      and (lf.acao_cliente_em at time zone p_fuso)::date between p_de and p_ate
  ),
  atend as (
    select a.responsavel_id, count(*) as acoes,
           count(*) filter (where a.contato_apos_acao_em is null) as sem_contato,
           public._mediana(array_agg(a.min_acao) filter (where a.min_acao is not null)) as mediana_min,
           public._mediana(array_agg(a.min_aviso) filter (where a.min_aviso is not null)) as mediana_aviso_min
    from acoes a group by a.responsavel_id
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate,
    'resumo', (select dados from resumo where chave = 'atual'),
    'anterior', (select dados from resumo where chave = 'anterior'),
    'por_origem', coalesce((select jsonb_agg(jsonb_build_object(
        'origem', o.origem, 'leads', o.leads, 'reservas', o.reservas,
        'conversao_bp', o.conversao_bp, 'valor_reservado_centavos', o.valor)
        order by o.valor desc, o.leads desc, o.origem::text collate "C") from por_origem o), '[]'),
    'motivos', coalesce((select jsonb_agg(jsonb_build_object(
        'motivo', m.motivo, 'quantidade', m.quantidade,
        'bp', coalesce(public._razao_bp(m.quantidade, (select sum(quantidade) from perdas)), 0))
        order by m.quantidade desc, m.motivo collate "C") from perdas m), '[]'),
    'atendimento', jsonb_build_object(
      'total', (select jsonb_build_object(
          'responsavel_id', '*', 'acoes', count(*),
          'sem_contato', count(*) filter (where a.contato_apos_acao_em is null),
          'mediana_min', public._mediana(array_agg(a.min_acao) filter (where a.min_acao is not null)),
          'mediana_aviso_min', public._mediana(array_agg(a.min_aviso) filter (where a.min_aviso is not null)))
        from acoes a),
      'por_vendedor', coalesce((select jsonb_agg(jsonb_build_object(
          'responsavel_id', t.responsavel_id, 'acoes', t.acoes, 'sem_contato', t.sem_contato,
          'mediana_min', t.mediana_min, 'mediana_aviso_min', t.mediana_aviso_min)
          order by t.acoes desc, coalesce(t.responsavel_id::text, 'null') collate "C") from atend t), '[]'))
  );
$$;

/** Números do usuário logado (dono: tudo; vendedor: só os leads dele). */
create or replace function public.numeros(p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_u    public.usuarios;
  v_fuso text;
begin
  select * into v_u from public.usuarios u where u.id = auth.uid() and u.ativo;
  if v_u.id is null then
    raise exception 'NUMEROS_SEM_PERMISSAO' using errcode = 'insufficient_privilege';
  end if;
  if p_de is null or p_ate is null or p_de > p_ate or p_ate - p_de > 366 then
    raise exception 'NUMEROS_PERIODO_INVALIDO' using errcode = 'check_violation';
  end if;
  select e.fuso into v_fuso from public.empresas e where e.id = v_u.empresa_id;
  return public._numeros_calcular(
    v_u.empresa_id, case when v_u.perfil = 'vendedor' then v_u.id end, v_fuso, p_de, p_ate);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ocupação (espelho de calcularOcupacao e datasLivres)
-- ---------------------------------------------------------------------------

/**
 * Ocupação de hoje até a véspera de hoje + 3 meses, e fins de semana com vaga de
 * hoje + antecedência mínima até hoje + 60 dias. Slot = data × espaço ativo × turno ativo do
 * dia da semana, com a capacidade do espaço; bloqueado sai; ocupado = reservas ativas
 * (confirmadas ou pré-reservas não vencidas) no mesmo dia, espaço e turno, até a capacidade.
 */
create or replace function public._numeros_ocupacao(p_empresa uuid, p_hoje date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with
  lim as (
    select p_hoje as de,
           ((p_hoje + interval '3 months')::date - 1) as ate,
           p_hoje + coalesce((select r.antecedencia_min_dias from public.regras_comerciais r
                              where r.empresa_id = p_empresa), 0) as livre_de,
           p_hoje + 60 as livre_ate
  ),
  dias as (
    select d::date as data
    from lim, generate_series(least(lim.de, lim.livre_de), greatest(lim.ate, lim.livre_ate), interval '1 day') d
  ),
  slots as (
    select d.data, t.id as turno_id, t.ordem as turno_ordem, e.id as espaco_id,
           e.eventos_simultaneos as cap
    from dias d
    join public.turnos t on t.empresa_id = p_empresa and t.ativo
     and extract(dow from d.data)::smallint = any (t.dias_semana)
    join public.espacos e on e.empresa_id = p_empresa and e.ativo
    where not exists (
      select 1 from public.bloqueios b
      where b.empresa_id = p_empresa and b.data = d.data
        and (b.turno_id is null or b.turno_id = t.id)
        and (b.espaco_id is null or b.espaco_id = e.id))
  ),
  oc as (
    select r.data, r.turno_id, r.espaco_id, count(*) as n
    from public.reservas r, lim
    where r.empresa_id = p_empresa and r.status = 'ativa'
      and (r.tipo = 'confirmada' or r.expira_em > now())
      and r.data between least(lim.de, lim.livre_de) and greatest(lim.ate, lim.livre_ate)
    group by 1, 2, 3
  ),
  s as (
    select slots.*, least(slots.cap, coalesce(oc.n, 0))::integer as res
    from slots left join oc using (data, turno_id, espaco_id)
  ),
  periodo as (select s.* from s, lim where s.data between lim.de and lim.ate),
  livres as (
    select s.data, s.turno_id, min(s.turno_ordem) as ordem
    from s, lim
    where s.data between lim.livre_de and lim.livre_ate
      and extract(dow from s.data) in (0, 6) and s.res < s.cap
    group by 1, 2
  )
  select jsonb_build_object(
    'de', (select de from lim), 'ate', (select ate from lim),
    'total', (select jsonb_build_object('disponiveis', coalesce(sum(cap), 0), 'reservados', coalesce(sum(res), 0),
                                        'bp', public._razao_bp(coalesce(sum(res), 0), coalesce(sum(cap), 0)))
              from periodo),
    'por_mes', coalesce((select jsonb_agg(x order by x ->> 'mes') from (
        select jsonb_build_object('mes', to_char(data, 'YYYY-MM'), 'disponiveis', sum(cap),
                                  'reservados', sum(res), 'bp', public._razao_bp(sum(res), sum(cap))) as x
        from periodo group by to_char(data, 'YYYY-MM')) m), '[]'),
    'por_dia_turno', coalesce((select jsonb_agg(x order by (x ->> 'dia')::int, x ->> 'turno_id' collate "C") from (
        select jsonb_build_object('dia', extract(dow from data)::int, 'turno_id', turno_id,
                                  'disponiveis', sum(cap), 'reservados', sum(res),
                                  'bp', public._razao_bp(sum(res), sum(cap))) as x
        from periodo group by extract(dow from data), turno_id) t), '[]'),
    'datas_livres', coalesce((select jsonb_agg(jsonb_build_object('data', l.data, 'turno_ids', l.ids) order by l.data)
      from (select data, jsonb_agg(turno_id order by ordem, turno_id::text collate "C") as ids
            from livres group by data) l), '[]')
  );
$$;

create or replace function public.numeros_ocupacao()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios;
  v_e public.empresas;
begin
  select * into v_u from public.usuarios u where u.id = auth.uid() and u.ativo;
  if v_u.id is null then
    raise exception 'NUMEROS_SEM_PERMISSAO' using errcode = 'insufficient_privilege';
  end if;
  select * into v_e from public.empresas e where e.id = v_u.empresa_id;
  return public._numeros_ocupacao(v_e.id, (now() at time zone v_e.fuso)::date);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: helpers fechados; numeros e numeros_ocupacao para authenticated
-- ---------------------------------------------------------------------------
revoke all on function public._numeros_leads(uuid, uuid) from public, anon, authenticated;
revoke all on function public._numeros_reservas(uuid, uuid) from public, anon, authenticated;
revoke all on function public._numeros_funil(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public._numeros_calcular(uuid, uuid, text, date, date) from public, anon, authenticated;
revoke all on function public._numeros_ocupacao(uuid, date) from public, anon, authenticated;
revoke all on function public._mediana(integer[]) from public, anon;
revoke all on function public._razao_bp(numeric, numeric) from public, anon;
revoke all on function public.numeros(date, date) from public, anon;
revoke all on function public.numeros_ocupacao() from public, anon;
grant execute on function public.numeros(date, date) to authenticated;
grant execute on function public.numeros_ocupacao() to authenticated;
