-- Etapa 4 · Status do lead sincronizado com a agenda.
--
-- 1. _lead_transicao: regra pura de status/temperatura (espelho em src/domain/publico/status-lead.ts,
--    com teste de equivalência). _lead_aplicar_evento aplica a regra e grava a atividade.
-- 2. _criar_reserva_core: o corpo de criar_reserva, agora compartilhado com publico.pre_reservar.
--    criar_reserva mantém a MESMA assinatura e o MESMO comportamento.
-- 3. confirmar_reserva, cancelar_reserva, vencer_pre_reservas e marcar_realizadas: mesmas
--    assinaturas; quando a reserva não tem lead, o comportamento é idêntico ao da Etapa 3.
-- 4. abandonar_leads: lead "novo" sem atividade há 24h vira "abandonou" (job a cada 15 min).

-- ---------------------------------------------------------------------------
-- Regra de status (pura)
-- ---------------------------------------------------------------------------
create or replace function public._lead_transicao(
  p_status public.status_lead, p_temperatura public.temperatura_lead, p_evento text,
  out status public.status_lead, out temperatura public.temperatura_lead
)
language sql
immutable
set search_path = ''
as $$
  select
    (case p_evento
      when 'lead_criado' then 'novo'
      when 'voltou' then
        case when p_status in ('abandonou', 'frio', 'novo', 'perdido', 'cancelado', 'realizado')
             then 'em_andamento' else p_status::text end
      when 'orcamento_concluido' then
        case when p_status in ('pre_reservado', 'reservado') then p_status::text
             else 'em_andamento' end
      when 'pre_reserva_pedida' then
        case when p_status = 'reservado' then 'reservado' else 'pre_reservado' end
      when 'pre_reserva_vencida' then
        case when p_status = 'pre_reservado' then 'em_andamento' else p_status::text end
      when 'pre_reserva_cancelada' then
        case when p_status = 'pre_reservado' then 'em_andamento' else p_status::text end
      when 'reserva_confirmada' then 'reservado'
      when 'reserva_cancelada' then
        case when p_status = 'reservado' then 'cancelado' else p_status::text end
      when 'realizada' then 'realizado'
      when 'abandonou' then
        case when p_status = 'novo' then 'abandonou' else p_status::text end
      else p_status::text
    end)::public.status_lead,
    (case
      when p_evento in ('pre_reserva_pedida', 'visita_pedida') then 'quente'
      when p_evento = 'orcamento_concluido' and p_temperatura <> 'quente' then 'morno'
      else p_temperatura::text
    end)::public.temperatura_lead;
$$;

/** Aplica um evento ao lead: status, temperatura, última atividade e linha do tempo. */
create or replace function public._lead_aplicar_evento(
  p_lead uuid,
  p_evento text,
  p_orcamento uuid default null,
  p_autor public.autor_atividade default 'sistema',
  p_usuario uuid default null,
  p_dados jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead  public.leads%rowtype;
  v_novo  record;
  v_tipo  public.tipo_atividade;
  v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
begin
  select * into v_lead from public.leads l where l.id = p_lead for update;
  if v_lead.id is null then
    return;
  end if;
  select * into v_novo from public._lead_transicao(v_lead.status, v_lead.temperatura, p_evento);

  v_tipo := case p_evento
    when 'pre_reserva_cancelada' then 'reserva_cancelada'
    when 'realizada' then 'status_alterado'
    when 'abandonou' then 'status_alterado'
    else p_evento
  end::public.tipo_atividade;

  if v_novo.status <> v_lead.status then
    v_dados := v_dados || jsonb_build_object('status_antes', v_lead.status, 'status_depois', v_novo.status);
  end if;

  update public.leads set
    status = v_novo.status,
    temperatura = v_novo.temperatura,
    -- Ações do sistema (jobs) não contam como atividade do cliente.
    ultima_atividade_em = case when p_autor = 'sistema' then ultima_atividade_em else now() end
  where id = p_lead;

  insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, usuario_id)
  values (v_lead.empresa_id, p_lead, p_orcamento, v_tipo, v_dados, p_autor, p_usuario);
end;
$$;

-- ---------------------------------------------------------------------------
-- Núcleo de criação de reserva (sem checagem de usuário: quem chama decide a empresa)
-- ---------------------------------------------------------------------------
create or replace function public._criar_reserva_core(
  p_empresa uuid,
  p_espaco_id uuid,
  p_turno_id uuid,
  p_data date,
  p_tipo public.tipo_reserva,
  p_cliente_nome text,
  p_cliente_whatsapp_e164 text,
  p_tipo_evento_id uuid,
  p_convidados integer,
  p_valor_total_centavos integer,
  p_sinal_centavos integer,
  p_sinal_pago_em date,
  p_observacoes text,
  p_origem public.origem_reserva,
  p_lead_id uuid,
  p_orcamento_id uuid,
  p_autor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fuso       text;
  v_intervalo  integer;
  v_prazo      integer;
  v_turno      public.turnos%rowtype;
  v_capacidade integer;
  v_inicio     timestamptz;
  v_fim        timestamptz;
  v_ocupadas   integer;
  v_id         uuid;
begin
  perform public._agenda_travar(p_empresa);

  select e.fuso, r.intervalo_entre_eventos_min, r.prazo_pre_reserva_horas
    into v_fuso, v_intervalo, v_prazo
  from public.empresas e
  join public.regras_comerciais r on r.empresa_id = e.id
  where e.id = p_empresa;

  select * into v_turno from public.turnos t
  where t.id = p_turno_id and t.empresa_id = p_empresa and t.ativo;
  select es.eventos_simultaneos into v_capacidade from public.espacos es
  where es.id = p_espaco_id and es.empresa_id = p_empresa and es.ativo;
  if v_turno.id is null or v_capacidade is null then
    raise exception 'AGENDA_REFERENCIA_INVALIDA' using errcode = 'foreign_key_violation';
  end if;

  if p_data is null or p_data < (now() at time zone v_fuso)::date then
    raise exception 'AGENDA_DATA_PASSADA' using errcode = 'check_violation';
  end if;
  if not (extract(dow from p_data)::smallint = any (v_turno.dias_semana)) then
    raise exception 'AGENDA_TURNO_FORA_DO_DIA' using errcode = 'check_violation';
  end if;

  select i.inicio, i.fim into v_inicio, v_fim
  from public._agenda_intervalo(p_data, v_turno.hora_inicio, v_turno.duracao_min, v_fuso, v_intervalo) i;
  if v_inicio < now() then
    raise exception 'AGENDA_DATA_PASSADA' using errcode = 'check_violation';
  end if;

  if public._agenda_bloqueado(p_empresa, p_data, p_turno_id, p_espaco_id) then
    raise exception 'AGENDA_BLOQUEADO' using errcode = 'check_violation';
  end if;

  select o.total into v_ocupadas
  from public._agenda_ocupacoes(p_empresa, p_espaco_id, v_inicio, v_fim) o;
  if v_ocupadas >= v_capacidade then
    raise exception 'AGENDA_SLOT_OCUPADO' using errcode = 'check_violation';
  end if;

  insert into public.reservas (
    empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, expira_em, origem,
    cliente_nome, cliente_whatsapp_e164, tipo_evento_id, convidados, valor_total_centavos,
    sinal_centavos, sinal_pago_em, observacoes, lead_id, orcamento_id, criado_por,
    confirmada_por, confirmada_em
  ) values (
    p_empresa, p_espaco_id, p_turno_id, p_data, v_inicio, v_fim, p_tipo, 'ativa',
    case when p_tipo = 'pre_reserva' then now() + make_interval(hours => v_prazo) end,
    coalesce(p_origem, 'manual'),
    btrim(p_cliente_nome), nullif(btrim(coalesce(p_cliente_whatsapp_e164, '')), ''),
    p_tipo_evento_id, p_convidados, p_valor_total_centavos, p_sinal_centavos, p_sinal_pago_em,
    nullif(btrim(coalesce(p_observacoes, '')), ''), p_lead_id, p_orcamento_id, p_autor,
    case when p_tipo = 'confirmada' then p_autor end,
    case when p_tipo = 'confirmada' then now() end
  )
  returning id into v_id;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (p_empresa, p_autor,
    case when p_tipo = 'confirmada' then 'reserva.registrada' else 'reserva.pre_reservada' end,
    'reserva', v_id,
    jsonb_build_object('data', p_data, 'turno_id', p_turno_id, 'espaco_id', p_espaco_id,
                       'tipo', p_tipo, 'origem', coalesce(p_origem, 'manual')));
  return v_id;
end;
$$;

-- Mesma assinatura e comportamento da Etapa 3 (o painel continua chamando esta).
create or replace function public.criar_reserva(
  p_espaco_id uuid,
  p_turno_id uuid,
  p_data date,
  p_tipo public.tipo_reserva,
  p_cliente_nome text,
  p_cliente_whatsapp_e164 text default null,
  p_tipo_evento_id uuid default null,
  p_convidados integer default null,
  p_valor_total_centavos integer default null,
  p_sinal_centavos integer default null,
  p_sinal_pago_em date default null,
  p_observacoes text default null,
  p_origem public.origem_reserva default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._criar_reserva_core(
    public._agenda_exigir_usuario(), p_espaco_id, p_turno_id, p_data, p_tipo, p_cliente_nome,
    p_cliente_whatsapp_e164, p_tipo_evento_id, p_convidados, p_valor_total_centavos,
    p_sinal_centavos, p_sinal_pago_em, p_observacoes, p_origem, null, null, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Transições (mesmas assinaturas; sincronizam o lead quando houver)
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_reserva(
  p_id uuid, p_sinal_centavos integer default null, p_sinal_pago_em date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._agenda_exigir_usuario();
  v_r       public.reservas%rowtype;
begin
  perform public._agenda_travar(v_empresa);
  select * into v_r from public.reservas r where r.id = p_id and r.empresa_id = v_empresa for update;
  if v_r.id is null then
    raise exception 'AGENDA_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  if v_r.tipo <> 'pre_reserva' or v_r.status <> 'ativa' then
    raise exception 'AGENDA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  if v_r.expira_em <= now() then
    raise exception 'AGENDA_PRE_RESERVA_VENCIDA' using errcode = 'check_violation';
  end if;
  if p_sinal_centavos is not null and p_sinal_centavos < 0 then
    raise exception 'AGENDA_VALOR_INVALIDO' using errcode = 'check_violation';
  end if;

  update public.reservas set
    tipo = 'confirmada', expira_em = null,
    sinal_centavos = coalesce(p_sinal_centavos, sinal_centavos),
    sinal_pago_em = coalesce(
      p_sinal_pago_em, sinal_pago_em,
      (now() at time zone (select e.fuso from public.empresas e where e.id = v_empresa))::date),
    confirmada_por = auth.uid(), confirmada_em = now()
  where id = p_id;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'reserva.confirmada', 'reserva', p_id,
    jsonb_build_object('sinal_centavos', p_sinal_centavos, 'sinal_pago_em', p_sinal_pago_em));

  if v_r.lead_id is not null then
    perform public._lead_aplicar_evento(v_r.lead_id, 'reserva_confirmada', v_r.orcamento_id,
      'usuario', auth.uid(), jsonb_build_object('reserva_id', p_id, 'data', v_r.data));
  end if;
end;
$$;

create or replace function public.cancelar_reserva(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._agenda_exigir_usuario();
  v_r       public.reservas%rowtype;
begin
  perform public._agenda_travar(v_empresa);
  select * into v_r from public.reservas r where r.id = p_id and r.empresa_id = v_empresa for update;
  if v_r.id is null then
    raise exception 'AGENDA_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  if v_r.status <> 'ativa' then
    raise exception 'AGENDA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;

  update public.reservas set
    status = 'cancelada', cancelada_por = auth.uid(), cancelada_em = now(),
    motivo_cancelamento = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = p_id;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'reserva.cancelada', 'reserva', p_id,
    jsonb_build_object('tipo', v_r.tipo, 'motivo', p_motivo));

  if v_r.lead_id is not null then
    perform public._lead_aplicar_evento(v_r.lead_id,
      case when v_r.tipo = 'pre_reserva' then 'pre_reserva_cancelada' else 'reserva_cancelada' end,
      v_r.orcamento_id, 'usuario', auth.uid(),
      jsonb_build_object('reserva_id', p_id, 'data', v_r.data, 'tipo', v_r.tipo,
                         'motivo', nullif(btrim(coalesce(p_motivo, '')), '')));
  end if;
end;
$$;

create or replace function public.vencer_pre_reservas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_r     record;
begin
  for v_r in
    select r.id, r.lead_id, r.orcamento_id, r.data from public.reservas r
    where r.status = 'ativa' and r.tipo = 'pre_reserva' and r.expira_em <= now()
    for update
  loop
    update public.reservas set status = 'vencida' where id = v_r.id;
    v_total := v_total + 1;
    if v_r.lead_id is not null then
      perform public._lead_aplicar_evento(v_r.lead_id, 'pre_reserva_vencida', v_r.orcamento_id,
        'sistema', null, jsonb_build_object('reserva_id', v_r.id, 'data', v_r.data));
    end if;
  end loop;
  return v_total;
end;
$$;

create or replace function public.marcar_realizadas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_r     record;
begin
  for v_r in
    select r.id, r.lead_id, r.orcamento_id, r.data from public.reservas r
    where r.status = 'ativa' and r.tipo = 'confirmada' and r.fim < now()
    for update
  loop
    update public.reservas set status = 'realizada' where id = v_r.id;
    v_total := v_total + 1;
    if v_r.lead_id is not null then
      perform public._lead_aplicar_evento(v_r.lead_id, 'realizada', v_r.orcamento_id,
        'sistema', null, jsonb_build_object('reserva_id', v_r.id, 'data', v_r.data));
    end if;
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leads que pararam antes de concluir o orçamento
-- ---------------------------------------------------------------------------
create or replace function public.abandonar_leads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_id    uuid;
begin
  for v_id in
    select l.id from public.leads l
    where l.status = 'novo' and l.ultima_atividade_em < now() - interval '24 hours'
    for update
  loop
    perform public._lead_aplicar_evento(v_id, 'abandonou', null, 'sistema');
    v_total := v_total + 1;
  end loop;

  -- Limpeza das tentativas usadas nos limites (só servem para a última hora).
  delete from publico.tentativas where criado_em < now() - interval '2 days';
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: helpers fechados; as funções do painel mantêm os grants da Etapa 3.
-- ---------------------------------------------------------------------------
revoke all on function public._lead_transicao(public.status_lead, public.temperatura_lead, text) from public, anon, authenticated;
revoke all on function public._lead_aplicar_evento(uuid, text, uuid, public.autor_atividade, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._criar_reserva_core(uuid, uuid, uuid, date, public.tipo_reserva, text, text, uuid, integer, integer, integer, date, text, public.origem_reserva, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.abandonar_leads() from public, anon, authenticated;
grant execute on function public.abandonar_leads() to service_role;
