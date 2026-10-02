-- Etapa 7 · Avisos e follow-up automático: funções.
--
-- Nenhuma função existente muda. Os avisos de eventos (pré-reserva e visita pedidas pelo link)
-- e o cancelamento automático das tarefas nascem de triggers em `atividades` (toda ação do lead
-- grava uma atividade, na MESMA transação); "cliente esquentou", de um trigger na temperatura.
-- Avisos de tempo e tarefas automáticas: jobs (20261007000003). Envio: /api/avisos/processar,
-- fora de qualquer transação, pela fila reservar_entregas / concluir_entrega.

-- ---------------------------------------------------------------------------
-- Datas no fuso da empresa (auxiliares puras)
-- ---------------------------------------------------------------------------
create or replace function public._instante_local(p_data date, p_hora time, p_fuso text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_data + p_hora) at time zone p_fuso;
$$;

create or replace function public._dia_local(p_instante timestamptz, p_fuso text)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_instante at time zone p_fuso)::date;
$$;

/** Espelho: domain/follow-up/regras.ts (proximoHorarioComercial). Seg–sáb, 9h às 18h. */
create or replace function public._proximo_horario_comercial(p_instante timestamptz, p_fuso text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_dia  date := public._dia_local(p_instante, p_fuso);
  v_hora time := (p_instante at time zone p_fuso)::time;
begin
  for i in 0..7 loop
    if extract(dow from v_dia) <> 0 then
      if i = 0 and v_hora >= '09:00' and v_hora < '18:00' then
        return p_instante;
      end if;
      if i > 0 or v_hora < '09:00' then
        return public._instante_local(v_dia, '09:00', p_fuso);
      end if;
    end if;
    v_dia := v_dia + 1;
  end loop;
  return p_instante;
end;
$$;

-- ---------------------------------------------------------------------------
-- Regras puras dos avisos (espelhos em src/domain/avisos, com teste de equivalência)
-- ---------------------------------------------------------------------------

/** Espelho: domain/avisos/silencio.ts (agendarAviso). */
create or replace function public._aviso_agendar(
  p_agora timestamptz, p_fuso text, p_inicio time, p_fim time
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hoje date := public._dia_local(p_agora, p_fuso);
  v_t    time := (p_agora at time zone p_fuso)::time;
begin
  if p_inicio = p_fim then
    return p_agora;
  end if;
  if p_inicio < p_fim then
    if v_t >= p_inicio and v_t < p_fim then
      return public._instante_local(v_hoje, p_fim, p_fuso);
    end if;
    return p_agora;
  end if;
  if v_t >= p_inicio then
    return public._instante_local(v_hoje + 1, p_fim, p_fuso);
  end if;
  if v_t < p_fim then
    return public._instante_local(v_hoje, p_fim, p_fuso);
  end if;
  return p_agora;
end;
$$;

/** Espelho: domain/avisos/canais.ts (canaisDoTipo). Canais externos ligados para o tipo. */
create or replace function public._aviso_canais(p_tipo public.tipo_aviso, p_canais jsonb)
returns text[]
language sql
stable
set search_path = ''
as $$
  with escolhidos as (
    select case
      when p_tipo <> 'teste' and jsonb_typeof(coalesce(p_canais, '{}'::jsonb) -> p_tipo::text) = 'array'
        then array(select jsonb_array_elements_text(p_canais -> p_tipo::text))
      else case p_tipo
        when 'orcamentos_sem_acao' then array['push']
        when 'cliente_parou' then array[]::text[]
        when 'cliente_esquentou' then array[]::text[]
        else array['push', 'whatsapp'] end
    end as c
  )
  select coalesce(array_agg(v.canal order by v.ordem), array[]::text[])
  from (values ('push', 1), ('whatsapp', 2)) v(canal, ordem), escolhidos e
  where v.canal = any(e.c)
    and (v.canal = 'push' or p_tipo in
         ('pre_reserva_pedida', 'visita_pedida', 'pre_reserva_vencendo', 'resumo_diario', 'teste'));
$$;

-- ---------------------------------------------------------------------------
-- Núcleo: criar aviso (idempotente, agrupado, com silêncio e entregas)
-- ---------------------------------------------------------------------------

/** Quem recebe o aviso de um lead (espelho: domain/avisos/destinatario.ts). */
create or replace function public._aviso_destinatarios(p_empresa uuid, p_lead uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with resp as (
    select l.responsavel_id as id from public.leads l
    join public.usuarios u on u.id = l.responsavel_id and u.ativo
    where l.id = p_lead and l.empresa_id = p_empresa
  ),
  donos as (
    select u.id, coalesce(p.receber_de_vendedores, false) as rdv
    from public.usuarios u
    left join public.preferencias_avisos p on p.usuario_id = u.id
    where u.empresa_id = p_empresa and u.perfil = 'dono' and u.ativo
  )
  select id from resp
  union
  select d.id from donos d where not exists (select 1 from resp) or d.rdv;
$$;

/**
 * Cria o aviso (o painel mostra na hora) e as entregas de push e WhatsApp conforme as
 * preferências, a partir de `agendado_para` (fim do silêncio). Idempotente pela chave; um aviso
 * do mesmo tipo para o mesmo lead e usuário em 10 min soma no anterior. Lead de teste: nada.
 */
create or replace function public._aviso_criar(
  p_empresa uuid, p_usuario uuid, p_tipo public.tipo_aviso, p_lead uuid, p_dados jsonb,
  p_chave text, p_silencio boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_prefs   public.preferencias_avisos%rowtype;
  v_fuso    text;
  v_quando  timestamptz := now();
  v_canais  text[];
begin
  if p_lead is not null and exists (select 1 from public.leads l where l.id = p_lead and l.eh_teste) then
    return null;
  end if;
  if exists (select 1 from public.avisos a where a.chave = p_chave) then
    return null;
  end if;

  if p_lead is not null then
    select a.id into v_id from public.avisos a
    where a.usuario_id = p_usuario and a.lead_id = p_lead and a.tipo = p_tipo
      and a.criado_em > now() - interval '10 minutes'
    order by a.criado_em desc limit 1
    for update;
    if v_id is not null then
      update public.avisos set dados = coalesce(p_dados, '{}'::jsonb), agrupados = agrupados + 1,
        lido_em = null
      where id = v_id;
      return v_id;
    end if;
  end if;

  select * into v_prefs from public.preferencias_avisos p where p.usuario_id = p_usuario;
  select e.fuso into v_fuso from public.empresas e where e.id = p_empresa;
  if p_silencio then
    v_quando := public._aviso_agendar(now(), coalesce(v_fuso, 'America/Sao_Paulo'),
      coalesce(v_prefs.silencio_inicio, '22:00'), coalesce(v_prefs.silencio_fim, '07:00'));
  end if;

  insert into public.avisos (empresa_id, usuario_id, tipo, lead_id, dados, chave, agendado_para)
  values (p_empresa, p_usuario, p_tipo, p_lead, coalesce(p_dados, '{}'::jsonb), p_chave, v_quando)
  on conflict (chave) do nothing
  returning id into v_id;
  if v_id is null then
    return null;
  end if;

  v_canais := public._aviso_canais(p_tipo, v_prefs.canais);
  if 'push' = any(v_canais)
     and exists (select 1 from public.push_inscricoes i where i.usuario_id = p_usuario) then
    insert into public.avisos_entregas (empresa_id, aviso_id, canal, proximo_envio_em)
    values (p_empresa, v_id, 'push', v_quando);
  end if;
  if 'whatsapp' = any(v_canais) and coalesce(v_prefs.whatsapp_ativo, false) then
    insert into public.avisos_entregas (empresa_id, aviso_id, canal, proximo_envio_em)
    values (p_empresa, v_id, 'whatsapp', v_quando);
  end if;
  return v_id;
end;
$$;

/** Um aviso para cada destinatário do lead (chave = base:usuario). */
create or replace function public._aviso_para_lead(
  p_lead uuid, p_tipo public.tipo_aviso, p_dados jsonb, p_chave_base text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_u    uuid;
  v_n    integer := 0;
begin
  select * into v_lead from public.leads l where l.id = p_lead;
  if v_lead.id is null or v_lead.eh_teste then
    return 0;
  end if;
  for v_u in select public._aviso_destinatarios(v_lead.empresa_id, v_lead.id) loop
    if public._aviso_criar(v_lead.empresa_id, v_u, p_tipo, v_lead.id, p_dados,
                           p_chave_base || ':' || v_u) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

/** A situação do aviso ainda existe? (resolvida antes do envio = entrega ignorada) */
create or replace function public._aviso_ainda_vale(p_aviso uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_a public.avisos%rowtype;
begin
  select * into v_a from public.avisos a where a.id = p_aviso;
  if v_a.id is null then
    return false;
  end if;
  if v_a.tipo in ('pre_reserva_pedida', 'pre_reserva_vencendo') and v_a.dados ? 'reserva_id' then
    return exists (select 1 from public.reservas r
                   where r.id = (v_a.dados ->> 'reserva_id')::uuid
                     and r.status = 'ativa' and r.tipo = 'pre_reserva');
  end if;
  if v_a.tipo = 'visita_pedida' and v_a.dados ? 'visita_id' then
    return exists (select 1 from public.visitas v
                   where v.id = (v_a.dados ->> 'visita_id')::uuid and v.status = 'solicitada');
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Follow-up: fatos do lead e regras puras (espelho: domain/follow-up/regras.ts)
-- ---------------------------------------------------------------------------

/** A situação do lead que as regras olham (mesmos campos de FatosFollowUp, em snake_case). */
create or replace function public._follow_up_fatos(p_lead uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with l as (select * from public.leads where id = p_lead),
  o as (
    select ob.id, ob.status, ob.enviado_em, ob.validade_ate, ob.aberturas, ob.data
    from public.orcamentos ob, l
    where ob.lead_id = l.id and ob.status not in ('substituido', 'em_montagem')
    order by ob.criado_em desc limit 1
  ),
  r as (
    select rs.expira_em, rs.criado_em, rs.sinal_centavos from public.reservas rs, l
    where rs.lead_id = l.id and rs.status = 'ativa' and rs.tipo = 'pre_reserva'
    order by rs.criado_em desc limit 1
  )
  select jsonb_build_object(
    'status', l.status,
    'temperatura', l.temperatura,
    'quente_desde', case when l.temperatura = 'quente' then (
      select max(a.criado_em) from public.atividades a
      where a.lead_id = l.id and a.autor = 'cliente'
        and a.tipo in ('proposta_aberta', 'visita_pedida', 'pre_reserva_pedida')) end,
    'proposta_enviada_em', (select enviado_em from o),
    'orcamento_status', (select status from o),
    'orcamento_id', (select id from o),
    'proposta_aberta', coalesce((select aberturas from o), 0) > 0,
    'validade_ate', (select validade_ate from o),
    'data_festa', (select data from o),
    'ultima_acao_cliente_em', (
      select max(a.criado_em) from public.atividades a
      where a.lead_id = l.id and a.autor = 'cliente'
        and a.tipo in ('pre_reserva_pedida', 'visita_pedida', 'whatsapp_clicado')),
    'ultima_acao_vendedor_em', l.ultima_acao_vendedor_em,
    'pre_reserva_expira_em', (select expira_em from r),
    'pre_reserva_criada_em', (select criado_em from r),
    'visita_em', (
      select min(v.data_hora) from public.visitas v
      where v.lead_id = l.id and v.status = 'confirmada' and v.data_hora > now() - interval '3 hours'),
    'visita_realizada_em', (
      select max(v.realizada_em) from public.visitas v
      where v.lead_id = l.id and v.status = 'realizada'),
    'sem_resposta_feita_em', (
      select max(t.feita_em) from public.tarefas t
      where t.lead_id = l.id and t.regra = 'sem_resposta_24h' and t.feita_em is not null)
  )
  from l;
$$;

/** Espelho: domain/follow-up/regras.ts (avaliarRegra). 'criar', 'cancelar' ou 'nada'. */
create or replace function public._follow_up_avaliar(
  p_regra text, p_f jsonb, p_agora timestamptz, p_fuso text, p_prazo integer,
  p_criada timestamptz default null
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status   text := p_f ->> 'status';
  v_aberto   boolean := v_status in ('novo', 'em_andamento', 'abandonou', 'frio', 'pre_reservado');
  v_sem_pre  boolean := v_aberto and v_status <> 'pre_reservado';
  v_enviada  timestamptz := (p_f ->> 'proposta_enviada_em')::timestamptz;
  v_cliente  timestamptz := (p_f ->> 'ultima_acao_cliente_em')::timestamptz;
  v_vendedor timestamptz := (p_f ->> 'ultima_acao_vendedor_em')::timestamptz;
  v_feita    timestamptz := (p_f ->> 'sem_resposta_feita_em')::timestamptz;
  v_validade date := (p_f ->> 'validade_ate')::date;
  v_orc      text := p_f ->> 'orcamento_status';
  v_expira   timestamptz := (p_f ->> 'pre_reserva_expira_em')::timestamptz;
  v_pre_em   timestamptz := (p_f ->> 'pre_reserva_criada_em')::timestamptz;
  v_visita   timestamptz := (p_f ->> 'visita_em')::timestamptz;
  v_real     timestamptz := (p_f ->> 'visita_realizada_em')::timestamptz;
  v_quente   timestamptz := (p_f ->> 'quente_desde')::timestamptz;
  v_hoje     date := public._dia_local(p_agora, p_fuso);
  v_prazo    integer := coalesce(p_prazo, case p_regra
                  when 'sem_resposta_24h' then 24 when 'segundo_toque' then 3
                  when 'proposta_vencendo' then 2 when 'pre_reserva_vencendo' then 12
                  when 'quente_sem_contato' then 2 else 0 end);
  v_aplica   boolean;
  v_base     timestamptz;
  v_quando   timestamptz;
begin
  case p_regra
    when 'sem_resposta_24h' then
      v_aplica := v_sem_pre and v_enviada is not null
        and not coalesce(v_cliente > v_enviada, false) and not coalesce(v_vendedor > v_enviada, false);
      v_base := v_enviada;
      v_quando := v_enviada + make_interval(hours => v_prazo);
    when 'segundo_toque' then
      v_aplica := v_sem_pre and v_feita is not null
        and not coalesce(v_cliente > v_feita, false) and not coalesce(v_vendedor > v_feita, false);
      v_base := v_feita;
      v_quando := v_feita + make_interval(hours => v_prazo * 24);
    when 'proposta_vencendo' then
      v_aplica := v_sem_pre and v_orc in ('enviado', 'visualizado')
        and v_validade is not null and v_validade >= v_hoje;
      v_base := v_enviada;
      v_quando := public._instante_local(v_validade - v_prazo, '09:00', p_fuso);
    when 'proposta_vencida' then
      v_aplica := v_sem_pre and v_orc = 'expirado' and v_validade is not null;
      v_base := v_enviada;
      v_quando := public._instante_local(v_validade + 1, '09:00', p_fuso);
    when 'pre_reserva_vencendo' then
      v_aplica := v_aberto and v_expira is not null and v_expira > p_agora and v_pre_em is not null;
      v_base := v_pre_em;
      v_quando := v_expira - make_interval(hours => v_prazo);
    when 'visita_amanha' then
      v_aplica := v_aberto and v_visita is not null
        and public._dia_local(v_visita, p_fuso) >= v_hoje + 1;
      v_base := public._instante_local(public._dia_local(v_visita, p_fuso) - 1, '00:00', p_fuso);
      v_quando := public._instante_local(public._dia_local(v_visita, p_fuso) - 1, '09:00', p_fuso);
    when 'pos_visita' then
      v_aplica := v_sem_pre and v_real is not null;
      v_base := v_real;
      v_quando := public._instante_local(public._dia_local(v_real, p_fuso) + 1, '09:00', p_fuso);
    when 'quente_sem_contato' then
      v_aplica := v_sem_pre and p_f ->> 'temperatura' = 'quente' and v_quente is not null
        and not coalesce(v_vendedor > v_quente, false);
      v_base := v_quente;
      v_quando := public._proximo_horario_comercial(v_quente + make_interval(hours => v_prazo), p_fuso);
    else
      return 'nada';
  end case;

  if not coalesce(v_aplica, false) then
    return 'cancelar';
  end if;
  if p_criada is not null and v_base is not null and p_criada < v_base then
    return 'cancelar';
  end if;
  if v_quando is null or p_agora < v_quando then
    return 'nada';
  end if;
  if p_criada is not null and (v_base is null or p_criada >= v_base) then
    return 'nada';
  end if;
  return 'criar';
end;
$$;

/** Espelho: domain/follow-up/titulos.ts (tituloTarefa). */
create or replace function public._follow_up_titulo(
  p_regra text, p_nome text, p_visita timestamptz, p_fuso text
)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_regra
    when 'sem_resposta_24h' then 'Chamar ' || n || ': recebeu a proposta e não respondeu'
    when 'segundo_toque' then 'Segundo contato com ' || n || ': ainda sem resposta'
    when 'proposta_vencendo' then 'Avisar ' || n || ': a proposta está para vencer'
    when 'proposta_vencida' then 'Último contato com ' || n || ': a proposta venceu'
    when 'pre_reserva_vencendo' then 'Cobrar o sinal de ' || n || ': a pré-reserva vence logo'
    when 'visita_amanha' then 'Confirmar a visita de ' || n || ' amanhã'
      || coalesce(' às ' || to_char(p_visita at time zone p_fuso, 'HH24:MI'), '')
    when 'pos_visita' then 'Perguntar o que ' || n || ' achou da visita e oferecer a pré-reserva'
    when 'quente_sem_contato' then n || ' está quente: chame agora'
  end
  from (select split_part(btrim(p_nome), ' ', 1) as n) x;
$$;

/** Reavalia as tarefas automáticas abertas de um lead e cancela as que não fazem mais sentido. */
create or replace function public._follow_up_reavaliar_lead(p_lead uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t      record;
  v_f      jsonb;
  v_fuso   text;
  v_n      integer := 0;
begin
  if not exists (select 1 from public.tarefas t
                 where t.lead_id = p_lead and t.origem = 'regra'
                   and t.feita_em is null and t.cancelada_em is null) then
    return 0;
  end if;
  v_f := public._follow_up_fatos(p_lead);
  select e.fuso into v_fuso from public.leads l join public.empresas e on e.id = l.empresa_id
  where l.id = p_lead;
  for v_t in
    select t.id, t.regra, t.criado_em, rf.prazo from public.tarefas t
    left join public.regras_follow_up rf on rf.empresa_id = t.empresa_id and rf.regra = t.regra
    where t.lead_id = p_lead and t.origem = 'regra' and t.feita_em is null and t.cancelada_em is null
  loop
    if public._follow_up_avaliar(v_t.regra, v_f, now(), v_fuso, v_t.prazo, v_t.criado_em) = 'cancelar' then
      update public.tarefas set cancelada_em = now() where id = v_t.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: avisos dos eventos do link e cancelamento na hora
-- ---------------------------------------------------------------------------
create or replace function public._atividade_avisos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead   public.leads%rowtype;
  v_dados  jsonb;
  v_rid    uuid;
begin
  select * into v_lead from public.leads l where l.id = new.lead_id;
  if v_lead.id is null or v_lead.eh_teste then
    return null;
  end if;

  if new.autor = 'cliente' and new.tipo = 'pre_reserva_pedida' then
    v_rid := nullif(new.dados ->> 'reserva_id', '')::uuid;
    select jsonb_build_object(
      'reserva_id', r.id, 'lead_nome', v_lead.nome, 'tipo_evento', te.nome, 'data', r.data,
      'turno', tu.nome, 'convidados', r.convidados,
      'total_centavos', coalesce(r.valor_total_centavos, o.total_centavos), 'expira_em', r.expira_em)
    into v_dados
    from public.reservas r
    left join public.tipos_evento te on te.id = r.tipo_evento_id
    left join public.turnos tu on tu.id = r.turno_id
    left join public.orcamentos o on o.id = r.orcamento_id
    where r.id = v_rid;
    if v_dados is not null then
      perform public._aviso_para_lead(v_lead.id, 'pre_reserva_pedida', v_dados,
                                      'pre_reserva_pedida:' || v_rid);
    end if;
  elsif new.autor = 'cliente' and new.tipo = 'visita_pedida' then
    select jsonb_build_object(
      'visita_id', v.id, 'lead_nome', v_lead.nome, 'data_preferida', v.data_preferida,
      'periodo', v.periodo, 'total_centavos', o.total_centavos)
    into v_dados
    from public.visitas v
    left join public.orcamentos o on o.id = v.orcamento_id
    where v.lead_id = v_lead.id and v.status = 'solicitada'
    order by v.criado_em desc limit 1;
    if v_dados is not null then
      perform public._aviso_para_lead(v_lead.id, 'visita_pedida', v_dados,
                                      'visita_pedida:' || (v_dados ->> 'visita_id'));
    end if;
  end if;

  perform public._follow_up_reavaliar_lead(v_lead.id);
  return null;
end;
$$;

create trigger atividades_avisos
  after insert on public.atividades
  for each row execute function public._atividade_avisos();

/** Ficou quente por reabrir a proposta (registrar_abertura atualiza a temperatura direto). */
create or replace function public._lead_esquentou()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aberturas integer;
  v_fuso      text;
begin
  if new.eh_teste or not exists (
    select 1 from public.atividades a
    where a.lead_id = new.id and a.tipo = 'proposta_aberta' and a.criado_em = now()) then
    return null;
  end if;
  select coalesce(sum(o.aberturas), 0) into v_aberturas from public.orcamentos o
  where o.lead_id = new.id and o.status <> 'substituido';
  select e.fuso into v_fuso from public.empresas e where e.id = new.empresa_id;
  perform public._aviso_para_lead(new.id, 'cliente_esquentou',
    jsonb_build_object('lead_nome', new.nome, 'aberturas', v_aberturas),
    'cliente_esquentou:' || new.id || ':' || public._dia_local(now(), coalesce(v_fuso, 'America/Sao_Paulo')));
  perform public._follow_up_reavaliar_lead(new.id);
  return null;
end;
$$;

create trigger leads_esquentou
  after update of temperatura on public.leads
  for each row when (old.temperatura is distinct from new.temperatura and new.temperatura = 'quente')
  execute function public._lead_esquentou();

-- ---------------------------------------------------------------------------
-- Jobs (só service_role; agendados em 20261007000003)
-- ---------------------------------------------------------------------------

/**
 * Avisos de tempo: pré-reserva vencendo (12h), orçamentos sem ação (a cada 2h, 9h–18h, seg–sáb),
 * cliente parou no meio (passo ≥ 3, 30 min parado) e resumo diário (8h; zerado não sai).
 * Idempotente: as chaves impedem repetir.
 */
create or replace function public.gerar_avisos_tempo()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n     integer := 0;
  v_r     record;
  v_e     record;
  v_u     record;
  v_local timestamp;
  v_hoje  date;
  v_hora  integer;
  v_dados jsonb;
begin
  -- 1. pré-reserva vencendo (faltam 12h ou menos)
  for v_r in
    select r.id, r.lead_id, r.expira_em, r.sinal_centavos, l.nome
    from public.reservas r join public.leads l on l.id = r.lead_id
    where r.status = 'ativa' and r.tipo = 'pre_reserva' and not l.eh_teste
      and r.expira_em > now() and r.expira_em <= now() + interval '12 hours'
  loop
    v_n := v_n + public._aviso_para_lead(v_r.lead_id, 'pre_reserva_vencendo',
      jsonb_build_object('reserva_id', v_r.id, 'lead_nome', v_r.nome, 'expira_em', v_r.expira_em,
                         'sinal_centavos', v_r.sinal_centavos),
      'pre_reserva_vencendo:' || v_r.id);
  end loop;

  -- 2. cliente parou no meio (passou do passo 3, sem orçamento concluído, 30 min parado)
  for v_r in
    select l.id, l.nome, l.ultimo_passo from public.leads l
    where not l.eh_teste and l.status in ('novo', 'abandonou') and l.ultimo_passo >= 3
      and l.ultima_atividade_em < now() - interval '30 minutes'
      and l.ultima_atividade_em > now() - interval '1 day'
      and not exists (select 1 from public.orcamentos o
                      where o.lead_id = l.id and o.status not in ('em_montagem', 'substituido'))
  loop
    v_n := v_n + public._aviso_para_lead(v_r.id, 'cliente_parou',
      jsonb_build_object('lead_nome', v_r.nome, 'passo', v_r.ultimo_passo),
      'cliente_parou:' || v_r.id);
  end loop;

  for v_e in select e.id, e.fuso from public.empresas e loop
    v_local := now() at time zone v_e.fuso;
    v_hoje := v_local::date;
    v_hora := extract(hour from v_local)::integer;

    -- 3. orçamentos sem ação do vendedor (a cada 2h no horário comercial)
    if extract(dow from v_hoje) <> 0 and v_hora between 9 and 17 then
      for v_u in
        with sem_acao as (
          select l.id, coalesce(o.total_centavos, 0) as total
          from public.leads l
          join lateral (
            select ob.total_centavos from public.orcamentos ob
            where ob.lead_id = l.id and ob.status in ('enviado', 'visualizado')
              and ob.criado_em > now() - interval '7 days'
            order by ob.criado_em desc limit 1) o on true
          where l.empresa_id = v_e.id and not l.eh_teste and l.ultima_acao_vendedor_em is null
            and l.status in ('novo', 'em_andamento', 'abandonou')
        )
        select d.usuario, count(*)::integer as quantidade, sum(s.total)::bigint as total
        from sem_acao s, lateral public._aviso_destinatarios(v_e.id, s.id) d(usuario)
        group by d.usuario
      loop
        if public._aviso_criar(v_e.id, v_u.usuario, 'orcamentos_sem_acao', null,
             jsonb_build_object('quantidade', v_u.quantidade, 'total_centavos', v_u.total),
             'orcamentos_sem_acao:' || v_u.usuario || ':' || v_hoje || ':' || ((v_hora - 9) / 2)) is not null then
          v_n := v_n + 1;
        end if;
      end loop;
    end if;

    -- 4. resumo diário às 8h (dono: a empresa toda; vendedor: os leads dele e as tarefas dele)
    if v_hora >= 8 then
      for v_u in
        select u.id, u.perfil from public.usuarios u where u.empresa_id = v_e.id and u.ativo
          and not exists (select 1 from public.avisos a where a.chave = 'resumo_diario:' || u.id || ':' || v_hoje)
      loop
        select jsonb_build_object(
          'novos_ontem', (select count(*) from public.leads l
            where l.empresa_id = v_e.id and not l.eh_teste
              and public._dia_local(l.criado_em, v_e.fuso) = v_hoje - 1
              and (v_u.perfil = 'dono' or l.responsavel_id = v_u.id)),
          'pre_reservas_hoje', (select count(*) from public.reservas r join public.leads l on l.id = r.lead_id
            where r.empresa_id = v_e.id and r.status = 'ativa' and r.tipo = 'pre_reserva' and not l.eh_teste
              and public._dia_local(r.expira_em, v_e.fuso) = v_hoje
              and (v_u.perfil = 'dono' or l.responsavel_id = v_u.id)),
          'visitas_hoje', (select count(*) from public.visitas v join public.leads l on l.id = v.lead_id
            where v.empresa_id = v_e.id and v.status = 'confirmada' and not l.eh_teste
              and public._dia_local(v.data_hora, v_e.fuso) = v_hoje
              and (v_u.perfil = 'dono' or l.responsavel_id = v_u.id)),
          'tarefas_hoje', (select count(*) from public.tarefas t
            where t.empresa_id = v_e.id and t.responsavel_id = v_u.id
              and t.feita_em is null and t.cancelada_em is null
              and public._dia_local(t.vence_efetivo, v_e.fuso) = v_hoje and t.vence_efetivo >= now()),
          'atrasadas', (select count(*) from public.tarefas t
            where t.empresa_id = v_e.id and t.responsavel_id = v_u.id
              and t.feita_em is null and t.cancelada_em is null and t.vence_efetivo < now())
        ) into v_dados;
        if (select bool_or((value)::integer > 0) from jsonb_each_text(v_dados)) then
          if public._aviso_criar(v_e.id, v_u.id, 'resumo_diario', null, v_dados,
               'resumo_diario:' || v_u.id || ':' || v_hoje, false) is not null then
            v_n := v_n + 1;
          end if;
        end if;
      end loop;
    end if;
  end loop;

  return v_n;
end;
$$;

/**
 * Follow-up automático: para cada lead aberto (não teste) com algo a acompanhar, avalia as
 * regras ligadas da empresa. Cria no máximo uma tarefa aberta por regra (índice
 * tarefas_regra_aberta_idx + on conflict do nothing) e cancela as que não fazem mais sentido.
 */
create or replace function public.gerar_tarefas_automaticas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l       record;
  v_r       record;
  v_f       jsonb;
  v_av      text;
  v_criada  timestamptz;
  v_resp    uuid;
  v_criadas integer := 0;
  v_cancel  integer := 0;
  v_id      uuid;
begin
  for v_l in
    select l.id, l.empresa_id, l.nome, l.responsavel_id, e.fuso
    from public.leads l join public.empresas e on e.id = l.empresa_id
    where not l.eh_teste
      and l.status in ('novo', 'em_andamento', 'abandonou', 'frio', 'pre_reservado')
      and (l.temperatura = 'quente'
           or exists (select 1 from public.orcamentos o where o.lead_id = l.id and o.enviado_em is not null)
           or exists (select 1 from public.reservas r where r.lead_id = l.id and r.status = 'ativa')
           or exists (select 1 from public.visitas v where v.lead_id = l.id and v.status in ('confirmada', 'realizada'))
           or exists (select 1 from public.tarefas t where t.lead_id = l.id and t.origem = 'regra'
                      and t.feita_em is null and t.cancelada_em is null))
  loop
    v_f := null;
    for v_r in
      select rf.regra, rf.prazo from public.regras_follow_up rf
      where rf.empresa_id = v_l.empresa_id and rf.ligada
    loop
      if v_f is null then
        v_f := public._follow_up_fatos(v_l.id);
      end if;
      select max(t.criado_em) into v_criada from public.tarefas t
      where t.lead_id = v_l.id and t.regra = v_r.regra and t.origem = 'regra';
      v_av := public._follow_up_avaliar(v_r.regra, v_f, now(), v_l.fuso, v_r.prazo, v_criada);

      if v_av = 'criar' then
        v_resp := v_l.responsavel_id;
        if v_resp is null then
          select u.id into v_resp from public.usuarios u
          where u.empresa_id = v_l.empresa_id and u.perfil = 'dono' and u.ativo
          order by u.criado_em limit 1;
        end if;
        insert into public.tarefas (empresa_id, lead_id, orcamento_id, titulo, responsavel_id,
          vence_em, origem, regra, mensagem_dados)
        values (v_l.empresa_id, v_l.id, (v_f ->> 'orcamento_id')::uuid,
          public._follow_up_titulo(v_r.regra, v_l.nome, (v_f ->> 'visita_em')::timestamptz, v_l.fuso),
          v_resp, now(), 'regra', v_r.regra,
          jsonb_build_object('regra', v_r.regra,
            'proposta_aberta', coalesce((v_f ->> 'proposta_aberta')::boolean, false),
            'visita_em', v_f -> 'visita_em'))
        on conflict (lead_id, regra) where regra is not null and feita_em is null and cancelada_em is null
        do nothing
        returning id into v_id;
        if v_id is not null then
          v_criadas := v_criadas + 1;
          insert into public.atividades (empresa_id, lead_id, tipo, dados, autor)
          values (v_l.empresa_id, v_l.id, 'tarefa_criada',
                  jsonb_build_object('tarefa_id', v_id, 'automatica', true, 'regra', v_r.regra,
                    'titulo', public._follow_up_titulo(v_r.regra, v_l.nome,
                      (v_f ->> 'visita_em')::timestamptz, v_l.fuso)),
                  'sistema');
          v_id := null;
        end if;
      elsif v_av = 'cancelar' then
        update public.tarefas set cancelada_em = now()
        where lead_id = v_l.id and regra = v_r.regra and origem = 'regra'
          and feita_em is null and cancelada_em is null;
        if found then
          v_cancel := v_cancel + 1;
        end if;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('criadas', v_criadas, 'canceladas', v_cancel);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fila de entregas (só service_role). O envio acontece FORA de transação, na rota.
-- ---------------------------------------------------------------------------

/**
 * Reserva um lote de entregas vencidas (for update skip locked: dois processadores nunca pegam
 * a mesma) e marca "enviando" com aluguel de 2 min. Antes: devolve à fila as presas e ignora
 * as que já foram resolvidas.
 */
create or replace function public.reservar_entregas(p_limite integer default 50)
returns table (
  entrega_id uuid, canal public.canal_aviso, tentativas integer, aviso_id uuid,
  tipo public.tipo_aviso, dados jsonb, lead_id uuid, agrupados integer, usuario_id uuid,
  fuso text, whatsapp_numero text, inscricoes jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  update public.avisos_entregas e set status = 'pendente', bloqueado_ate = null, atualizado_em = now()
  where e.status = 'enviando' and e.bloqueado_ate < now();

  update public.avisos_entregas e set status = 'ignorado', erro_codigo = 'RESOLVIDO', atualizado_em = now()
  where e.status = 'pendente' and e.proximo_envio_em <= now()
    and not public._aviso_ainda_vale(e.aviso_id);

  return query
  with alvo as (
    select e.id from public.avisos_entregas e
    where e.status = 'pendente' and e.proximo_envio_em <= now()
    order by e.proximo_envio_em
    limit greatest(1, least(coalesce(p_limite, 50), 200))
    for update skip locked
  ),
  marcadas as (
    update public.avisos_entregas e set status = 'enviando', tentativas = e.tentativas + 1,
      bloqueado_ate = now() + interval '2 minutes', atualizado_em = now()
    from alvo where e.id = alvo.id
    returning e.id, e.canal, e.tentativas, e.aviso_id
  )
  select m.id, m.canal, m.tentativas, a.id, a.tipo, a.dados, a.lead_id, a.agrupados, a.usuario_id,
    emp.fuso, p.whatsapp_numero,
    case when m.canal = 'push' then coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth))
      from public.push_inscricoes i where i.usuario_id = a.usuario_id), '[]'::jsonb) end
  from marcadas m
  join public.avisos a on a.id = m.aviso_id
  join public.empresas emp on emp.id = a.empresa_id
  left join public.preferencias_avisos p on p.usuario_id = a.usuario_id;
end;
$$;

/**
 * Resultado de uma entrega: 'enviado', 'ignorado' (canal sem configuração, sem destino) ou
 * 'erro' (nova tentativa com espera crescente: 1, 5, 15 e 60 min; na 5ª falha, 'falhou').
 * Endpoints de push que responderam 404/410 são apagados.
 */
create or replace function public.concluir_entrega(
  p_entrega uuid, p_resultado text, p_erro text default null, p_endpoints_invalidos text[] default null
)
returns public.status_entrega
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e      public.avisos_entregas%rowtype;
  v_status public.status_entrega;
begin
  if p_endpoints_invalidos is not null and cardinality(p_endpoints_invalidos) > 0 then
    delete from public.push_inscricoes where endpoint = any(p_endpoints_invalidos);
  end if;
  select * into v_e from public.avisos_entregas e where e.id = p_entrega for update;
  if v_e.id is null then
    return null;
  end if;
  if p_resultado = 'enviado' then
    v_status := 'enviado';
    update public.avisos_entregas set status = 'enviado', enviado_em = now(), bloqueado_ate = null,
      erro_codigo = null, atualizado_em = now()
    where id = p_entrega;
    if v_e.canal = 'push' then
      update public.push_inscricoes i set ultimo_uso_em = now()
      from public.avisos a where a.id = v_e.aviso_id and i.usuario_id = a.usuario_id;
    end if;
  elsif p_resultado = 'ignorado' then
    v_status := 'ignorado';
    update public.avisos_entregas set status = 'ignorado', bloqueado_ate = null,
      erro_codigo = left(p_erro, 80), atualizado_em = now()
    where id = p_entrega;
  else
    v_status := case when v_e.tentativas >= 5 then 'falhou' else 'pendente' end::public.status_entrega;
    update public.avisos_entregas set status = v_status, bloqueado_ate = null,
      erro_codigo = left(coalesce(p_erro, 'ERRO'), 80), atualizado_em = now(),
      proximo_envio_em = now() + case v_e.tentativas
        when 1 then interval '1 minute' when 2 then interval '5 minutes'
        when 3 then interval '15 minutes' else interval '60 minutes' end
    where id = p_entrega;
  end if;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funções do usuário (authenticated): só nos próprios dados
-- ---------------------------------------------------------------------------
create or replace function public._avisos_usuario()
returns public.usuarios
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.usuarios;
begin
  select * into v from public.usuarios u
  where u.id = auth.uid() and u.ativo;
  if v.id is null then
    raise exception 'AVISO_SEM_PERMISSAO' using errcode = 'insufficient_privilege';
  end if;
  return v;
end;
$$;

/** Marca como lidos (todos os não lidos, se p_ids for nulo). Não audita: é leitura. */
create or replace function public.marcar_avisos_lidos(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._avisos_usuario();
  v_n integer;
begin
  update public.avisos set lido_em = now()
  where usuario_id = v_u.id and empresa_id = v_u.empresa_id and lido_em is null
    and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.salvar_preferencias_avisos(
  p_canais jsonb, p_silencio_inicio time, p_silencio_fim time, p_receber_de_vendedores boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u     record := public._avisos_usuario();
  v_antes jsonb;
  v_k     text;
begin
  if p_canais is null or jsonb_typeof(p_canais) <> 'object' then
    raise exception 'AVISO_PREFERENCIA_INVALIDA' using errcode = 'check_violation';
  end if;
  for v_k in select jsonb_object_keys(p_canais) loop
    if v_k not in ('pre_reserva_pedida', 'visita_pedida', 'pre_reserva_vencendo', 'orcamentos_sem_acao',
                   'cliente_parou', 'cliente_esquentou', 'resumo_diario')
       or jsonb_typeof(p_canais -> v_k) <> 'array'
       or exists (select 1 from jsonb_array_elements_text(p_canais -> v_k) c(v)
                  where c.v not in ('push', 'whatsapp')) then
      raise exception 'AVISO_PREFERENCIA_INVALIDA' using errcode = 'check_violation';
    end if;
  end loop;
  select to_jsonb(p) into v_antes from public.preferencias_avisos p where p.usuario_id = v_u.id;
  insert into public.preferencias_avisos as p (usuario_id, empresa_id, canais, silencio_inicio,
    silencio_fim, receber_de_vendedores)
  values (v_u.id, v_u.empresa_id, p_canais, coalesce(p_silencio_inicio, '22:00'),
    coalesce(p_silencio_fim, '07:00'), coalesce(p_receber_de_vendedores, false) and v_u.perfil = 'dono')
  on conflict (usuario_id) do update set canais = excluded.canais,
    silencio_inicio = excluded.silencio_inicio, silencio_fim = excluded.silencio_fim,
    receber_de_vendedores = excluded.receber_de_vendedores, atualizado_em = now();
  perform public._auditar_lead(v_u.empresa_id, 'preferencias_avisos.salvar', 'preferencias_avisos',
    v_u.id, jsonb_build_object('antes', v_antes, 'depois', jsonb_build_object('canais', p_canais,
      'silencio_inicio', p_silencio_inicio, 'silencio_fim', p_silencio_fim)));
end;
$$;

create or replace function public.inscrever_push(
  p_endpoint text, p_p256dh text, p_auth text, p_aparelho text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._avisos_usuario();
begin
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then
    raise exception 'AVISO_PUSH_INVALIDO' using errcode = 'check_violation';
  end if;
  insert into public.push_inscricoes as i (empresa_id, usuario_id, endpoint, p256dh, auth, aparelho)
  values (v_u.empresa_id, v_u.id, p_endpoint, p_p256dh, p_auth, left(nullif(btrim(p_aparelho), ''), 80))
  on conflict (endpoint) do update set empresa_id = excluded.empresa_id, usuario_id = excluded.usuario_id,
    p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho;
  perform public._auditar_lead(v_u.empresa_id, 'push.inscrever', 'push_inscricoes', v_u.id,
    jsonb_build_object('aparelho', p_aparelho));
end;
$$;

create or replace function public.remover_push(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._avisos_usuario();
begin
  delete from public.push_inscricoes where endpoint = p_endpoint and usuario_id = v_u.id;
  if found then
    perform public._auditar_lead(v_u.empresa_id, 'push.remover', 'push_inscricoes', v_u.id, '{}'::jsonb);
  end if;
end;
$$;

/** Liga os avisos pelo WhatsApp: número confirmado (E.164) e aceite registrado. */
create or replace function public.ativar_whatsapp(p_numero text, p_aceite boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._avisos_usuario();
begin
  if not coalesce(p_aceite, false) then
    raise exception 'AVISO_WHATSAPP_SEM_ACEITE' using errcode = 'check_violation';
  end if;
  if p_numero is null or p_numero !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'AVISO_WHATSAPP_NUMERO' using errcode = 'check_violation';
  end if;
  insert into public.preferencias_avisos as p (usuario_id, empresa_id, whatsapp_ativo, whatsapp_numero,
    whatsapp_aceite_em)
  values (v_u.id, v_u.empresa_id, true, p_numero, now())
  on conflict (usuario_id) do update set whatsapp_ativo = true, whatsapp_numero = excluded.whatsapp_numero,
    whatsapp_aceite_em = now(), atualizado_em = now();
  perform public._auditar_lead(v_u.empresa_id, 'whatsapp.ativar', 'preferencias_avisos', v_u.id,
    jsonb_build_object('aceite_em', now()));
end;
$$;

create or replace function public.desativar_whatsapp()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._avisos_usuario();
begin
  update public.preferencias_avisos set whatsapp_ativo = false, atualizado_em = now()
  where usuario_id = v_u.id;
  perform public._auditar_lead(v_u.empresa_id, 'whatsapp.desativar', 'preferencias_avisos', v_u.id,
    '{}'::jsonb);
end;
$$;

/** Aviso de teste para o próprio usuário (sai em todos os canais ligados, ignorando o silêncio). */
create or replace function public.criar_aviso_teste()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._avisos_usuario();
begin
  return public._aviso_criar(v_u.empresa_id, v_u.id, 'teste', null, '{}'::jsonb,
                             'teste:' || v_u.id || ':' || gen_random_uuid(), false);
end;
$$;

/** Dono liga/desliga uma regra de follow-up e ajusta o prazo (limites de domain/follow-up). */
create or replace function public.salvar_regra_follow_up(p_regra text, p_ligada boolean, p_prazo integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u     record := public._avisos_usuario();
  v_antes jsonb;
  v_ok    boolean;
begin
  if v_u.perfil <> 'dono' then
    raise exception 'AVISO_SO_DONO' using errcode = 'insufficient_privilege';
  end if;
  v_ok := case p_regra
    when 'sem_resposta_24h' then p_prazo between 6 and 72
    when 'segundo_toque' then p_prazo between 1 and 7
    when 'proposta_vencendo' then p_prazo between 1 and 5
    when 'pre_reserva_vencendo' then p_prazo between 2 and 24
    when 'quente_sem_contato' then p_prazo between 1 and 8
    when 'proposta_vencida' then p_prazo is null
    when 'visita_amanha' then p_prazo is null
    when 'pos_visita' then p_prazo is null
    else false end;
  if not coalesce(v_ok, false) then
    raise exception 'FOLLOW_UP_PRAZO_INVALIDO' using errcode = 'check_violation';
  end if;
  perform public.criar_regras_follow_up(v_u.empresa_id);
  select to_jsonb(r) into v_antes from public.regras_follow_up r
  where r.empresa_id = v_u.empresa_id and r.regra = p_regra;
  update public.regras_follow_up set ligada = coalesce(p_ligada, ligada), prazo = p_prazo, atualizado_em = now()
  where empresa_id = v_u.empresa_id and regra = p_regra;
  perform public._auditar_lead(v_u.empresa_id, 'regra_follow_up.salvar', 'regras_follow_up', null,
    jsonb_build_object('regra', p_regra, 'antes', v_antes,
      'depois', jsonb_build_object('ligada', p_ligada, 'prazo', p_prazo)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public._aviso_destinatarios(uuid, uuid)',
    'public._aviso_criar(uuid, uuid, public.tipo_aviso, uuid, jsonb, text, boolean)',
    'public._aviso_para_lead(uuid, public.tipo_aviso, jsonb, text)',
    'public._aviso_ainda_vale(uuid)',
    'public._follow_up_fatos(uuid)',
    'public._follow_up_reavaliar_lead(uuid)',
    'public._atividade_avisos()',
    'public._lead_esquentou()',
    'public._avisos_usuario()',
    'public.gerar_avisos_tempo()',
    'public.gerar_tarefas_automaticas()',
    'public.reservar_entregas(integer)',
    'public.concluir_entrega(uuid, text, text, text[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.gerar_avisos_tempo()',
    'public.gerar_tarefas_automaticas()',
    'public.reservar_entregas(integer)',
    'public.concluir_entrega(uuid, text, text, text[])',
    'public._follow_up_fatos(uuid)'
  ] loop
    execute format('grant execute on function %s to service_role', f);
  end loop;

  foreach f in array array[
    'public.marcar_avisos_lidos(uuid[])',
    'public.salvar_preferencias_avisos(jsonb, time, time, boolean)',
    'public.inscrever_push(text, text, text, text)',
    'public.remover_push(text)',
    'public.ativar_whatsapp(text, boolean)',
    'public.desativar_whatsapp()',
    'public.criar_aviso_teste()',
    'public.salvar_regra_follow_up(text, boolean, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- regras puras: acessíveis ao service_role (testes de equivalência)
  foreach f in array array[
    'public._aviso_agendar(timestamptz, text, time, time)',
    'public._aviso_canais(public.tipo_aviso, jsonb)',
    'public._follow_up_avaliar(text, jsonb, timestamptz, text, integer, timestamptz)',
    'public._follow_up_titulo(text, text, timestamptz, text)',
    'public._proximo_horario_comercial(timestamptz, text)',
    'public._instante_local(date, time, text)',
    'public._dia_local(timestamptz, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
