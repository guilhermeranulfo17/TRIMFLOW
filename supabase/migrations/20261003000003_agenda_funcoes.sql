-- Etapa 3 · Funções da agenda. TODA escrita em reservas e bloqueios passa por aqui.
--
-- Regras (as mesmas de src/domain/agenda, com teste de equivalência):
-- - Slot = espaço + data + turno. Intervalo = [data + hora_inicio no fuso da empresa,
--   início + duração + intervalo entre eventos).
-- - Ocupam: pré-reserva ativa e não vencida (expira_em > now()), reserva confirmada ativa.
--   Pré-reserva com expira_em <= now() conta como LIVRE mesmo antes do job marcar "vencida".
-- - Conflito por horário: [a.inicio, a.fim) e [b.inicio, b.fim) se sobrepõem quando
--   a.inicio < b.fim e b.inicio < a.fim. O slot fica indisponível quando as ocupações
--   sobrepostas no mesmo espaço chegam a espacos.eventos_simultaneos.
-- - Bloqueio vale para o slot quando a data é a mesma, o turno é nulo ou igual e o espaço é
--   nulo ou igual.
-- - Trava: pg_advisory_xact_lock por EMPRESA antes de qualquer checagem. Turnos que passam da
--   meia-noite alcançam outras datas e bloqueios podem valer para todos os espaços; travar por
--   empresa é correto em todos esses casos e a contenção num buffet é desprezível.
-- - Erros com código estável na mensagem (AGENDA_*); o app traduz para português.

-- ---------------------------------------------------------------------------
-- Helpers internos (sem grant para os usuários do painel)
-- ---------------------------------------------------------------------------
create or replace function public._agenda_intervalo(
  p_data date, p_hora time, p_duracao_min integer, p_fuso text, p_intervalo_min integer,
  out inicio timestamptz, out fim timestamptz
)
language sql
stable
set search_path = ''
as $$
  select ((p_data + p_hora) at time zone p_fuso),
         ((p_data + p_hora) at time zone p_fuso) + make_interval(mins => p_duracao_min + p_intervalo_min);
$$;

create or replace function public._agenda_travar(p_empresa uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('agenda:' || p_empresa::text, 0));
$$;

/** Ocupações ativas (não vencidas) que se sobrepõem ao intervalo no espaço. */
create or replace function public._agenda_ocupacoes(
  p_empresa uuid, p_espaco uuid, p_inicio timestamptz, p_fim timestamptz
)
returns table (total integer, confirmadas integer, expira_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer,
         (count(*) filter (where r.tipo = 'confirmada'))::integer,
         min(r.expira_em) filter (where r.tipo = 'pre_reserva')
  from public.reservas r
  where r.empresa_id = p_empresa
    and r.espaco_id = p_espaco
    and r.status = 'ativa'
    and (r.tipo = 'confirmada' or r.expira_em > now())
    and r.inicio < p_fim
    and p_inicio < r.fim;
$$;

create or replace function public._agenda_bloqueado(
  p_empresa uuid, p_data date, p_turno uuid, p_espaco uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bloqueios b
    where b.empresa_id = p_empresa
      and b.data = p_data
      and (b.turno_id is null or b.turno_id = p_turno)
      and (b.espaco_id is null or b.espaco_id = p_espaco)
  );
$$;

/** Usuário ativo da empresa (dono ou vendedor); devolve a empresa ou erro. */
create or replace function public._agenda_exigir_usuario(p_somente_dono boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_perfil  public.perfil_usuario := public.perfil_do_usuario();
begin
  if v_empresa is null or v_perfil is null then
    raise exception 'AGENDA_SEM_PERMISSAO' using errcode = 'insufficient_privilege';
  end if;
  if p_somente_dono and v_perfil <> 'dono' then
    raise exception 'AGENDA_SO_DONO' using errcode = 'insufficient_privilege';
  end if;
  return v_empresa;
end;
$$;

-- ---------------------------------------------------------------------------
-- criar_reserva: pré-reserva (com prazo) ou reserva já confirmada (evento fechado fora).
-- ---------------------------------------------------------------------------
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
declare
  v_empresa    uuid := public._agenda_exigir_usuario();
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
  perform public._agenda_travar(v_empresa);

  select e.fuso, r.intervalo_entre_eventos_min, r.prazo_pre_reserva_horas
    into v_fuso, v_intervalo, v_prazo
  from public.empresas e
  join public.regras_comerciais r on r.empresa_id = e.id
  where e.id = v_empresa;

  select * into v_turno from public.turnos t
  where t.id = p_turno_id and t.empresa_id = v_empresa and t.ativo;
  select es.eventos_simultaneos into v_capacidade from public.espacos es
  where es.id = p_espaco_id and es.empresa_id = v_empresa and es.ativo;
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

  if public._agenda_bloqueado(v_empresa, p_data, p_turno_id, p_espaco_id) then
    raise exception 'AGENDA_BLOQUEADO' using errcode = 'check_violation';
  end if;

  select o.total into v_ocupadas
  from public._agenda_ocupacoes(v_empresa, p_espaco_id, v_inicio, v_fim) o;
  if v_ocupadas >= v_capacidade then
    raise exception 'AGENDA_SLOT_OCUPADO' using errcode = 'check_violation';
  end if;

  insert into public.reservas (
    empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, expira_em, origem,
    cliente_nome, cliente_whatsapp_e164, tipo_evento_id, convidados, valor_total_centavos,
    sinal_centavos, sinal_pago_em, observacoes, criado_por,
    confirmada_por, confirmada_em
  ) values (
    v_empresa, p_espaco_id, p_turno_id, p_data, v_inicio, v_fim, p_tipo, 'ativa',
    case when p_tipo = 'pre_reserva' then now() + make_interval(hours => v_prazo) end,
    coalesce(p_origem, 'manual'),
    btrim(p_cliente_nome), nullif(btrim(coalesce(p_cliente_whatsapp_e164, '')), ''),
    p_tipo_evento_id, p_convidados, p_valor_total_centavos, p_sinal_centavos, p_sinal_pago_em,
    nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid(),
    case when p_tipo = 'confirmada' then auth.uid() end,
    case when p_tipo = 'confirmada' then now() end
  )
  returning id into v_id;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(),
    case when p_tipo = 'confirmada' then 'reserva.registrada' else 'reserva.pre_reservada' end,
    'reserva', v_id,
    jsonb_build_object('data', p_data, 'turno_id', p_turno_id, 'espaco_id', p_espaco_id,
                       'tipo', p_tipo, 'origem', coalesce(p_origem, 'manual')));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transições de uma reserva existente
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
end;
$$;

create or replace function public.estender_pre_reserva(p_id uuid, p_horas integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._agenda_exigir_usuario();
  v_r       public.reservas%rowtype;
  v_nova    timestamptz;
begin
  if p_horas is null or p_horas not between 1 and 720 then
    raise exception 'AGENDA_HORAS_INVALIDAS' using errcode = 'check_violation';
  end if;
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

  v_nova := v_r.expira_em + make_interval(hours => p_horas);
  update public.reservas set expira_em = v_nova where id = p_id;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'reserva.prazo_estendido', 'reserva', p_id,
    jsonb_build_object('antes', v_r.expira_em, 'depois', v_nova));
  return v_nova;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bloqueios (só dono). Aceita um período de uma vez (ex.: férias coletivas).
-- ---------------------------------------------------------------------------
create or replace function public.criar_bloqueio(
  p_de date, p_ate date, p_turno_id uuid default null, p_espaco_id uuid default null,
  p_motivo text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._agenda_exigir_usuario(true);
  v_fuso    text;
  v_conflito date;
  v_criados integer;
begin
  perform public._agenda_travar(v_empresa);
  select e.fuso into v_fuso from public.empresas e where e.id = v_empresa;

  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 365 then
    raise exception 'AGENDA_PERIODO_INVALIDO' using errcode = 'check_violation';
  end if;
  if p_de < (now() at time zone v_fuso)::date then
    raise exception 'AGENDA_DATA_PASSADA' using errcode = 'check_violation';
  end if;
  if p_turno_id is not null and not exists (
    select 1 from public.turnos t where t.id = p_turno_id and t.empresa_id = v_empresa
  ) or p_espaco_id is not null and not exists (
    select 1 from public.espacos e where e.id = p_espaco_id and e.empresa_id = v_empresa
  ) then
    raise exception 'AGENDA_REFERENCIA_INVALIDA' using errcode = 'foreign_key_violation';
  end if;

  select min(r.data) into v_conflito
  from public.reservas r
  where r.empresa_id = v_empresa
    and r.data between p_de and p_ate
    and r.status = 'ativa'
    and (r.tipo = 'confirmada' or r.expira_em > now())
    and (p_turno_id is null or r.turno_id = p_turno_id)
    and (p_espaco_id is null or r.espaco_id = p_espaco_id);
  if v_conflito is not null then
    raise exception 'AGENDA_BLOQUEIO_COM_RESERVA'
      using errcode = 'check_violation', detail = to_char(v_conflito, 'YYYY-MM-DD');
  end if;

  insert into public.bloqueios (empresa_id, data, turno_id, espaco_id, motivo, criado_por)
  select v_empresa, d::date, p_turno_id, p_espaco_id,
         nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid()
  from generate_series(p_de, p_ate, interval '1 day') d
  on conflict (empresa_id, data, turno_id, espaco_id) do nothing;
  get diagnostics v_criados = row_count;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'bloqueio.criado', 'bloqueio', null,
    jsonb_build_object('de', p_de, 'ate', p_ate, 'turno_id', p_turno_id,
                       'espaco_id', p_espaco_id, 'motivo', p_motivo, 'criados', v_criados));
  return v_criados;
end;
$$;

create or replace function public.remover_bloqueio(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._agenda_exigir_usuario(true);
  v_b       public.bloqueios%rowtype;
begin
  perform public._agenda_travar(v_empresa);
  delete from public.bloqueios b where b.id = p_id and b.empresa_id = v_empresa
  returning * into v_b;
  if v_b.id is null then
    raise exception 'AGENDA_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'bloqueio.removido', 'bloqueio', p_id,
    jsonb_build_object('data', v_b.data, 'turno_id', v_b.turno_id, 'espaco_id', v_b.espaco_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Disponibilidade: estado de cada data × turno do dia × espaço ativo. Nunca expõe cliente.
-- _disponibilidade não checa o usuário (a Etapa 4 vai chamá-la por um wrapper por slug);
-- disponibilidade é a versão do painel.
-- ---------------------------------------------------------------------------
create or replace function public._disponibilidade(
  p_empresa_id uuid, p_de date, p_ate date, p_espaco_id uuid default null
)
returns table (
  data date, turno_id uuid, espaco_id uuid, estado text, vagas integer, capacidade integer,
  expira_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fuso      text;
  v_intervalo integer;
begin
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de + 1 > 400 then
    raise exception 'AGENDA_PERIODO_INVALIDO' using errcode = 'check_violation';
  end if;
  select e.fuso, r.intervalo_entre_eventos_min into v_fuso, v_intervalo
  from public.empresas e join public.regras_comerciais r on r.empresa_id = e.id
  where e.id = p_empresa_id;

  return query
  with slots as (
    select dia::date as data, t.id as turno_id, e.id as espaco_id,
           e.eventos_simultaneos as cap, i.inicio, i.fim
    from generate_series(p_de, p_ate, interval '1 day') dia
    join public.turnos t
      on t.empresa_id = p_empresa_id and t.ativo
     and extract(dow from dia)::smallint = any (t.dias_semana)
    join public.espacos e
      on e.empresa_id = p_empresa_id and e.ativo
     and (p_espaco_id is null or e.id = p_espaco_id)
    cross join lateral public._agenda_intervalo(
      dia::date, t.hora_inicio, t.duracao_min, v_fuso, v_intervalo) i
  )
  select s.data, s.turno_id, s.espaco_id,
         case
           when b.bloqueado then 'bloqueado'
           when o.total >= s.cap then
             case when s.cap > 1 then 'lotado'
                  when o.confirmadas > 0 then 'reservado'
                  else 'pre_reservado' end
           else 'livre'
         end,
         case when b.bloqueado then 0 else greatest(s.cap - o.total, 0) end,
         s.cap,
         o.expira_em
  from slots s
  cross join lateral public._agenda_ocupacoes(p_empresa_id, s.espaco_id, s.inicio, s.fim) o
  cross join lateral (
    select public._agenda_bloqueado(p_empresa_id, s.data, s.turno_id, s.espaco_id) as bloqueado
  ) b
  order by s.data, s.inicio, s.espaco_id;
end;
$$;

create or replace function public.disponibilidade(
  p_empresa_id uuid, p_de date, p_ate date, p_espaco_id uuid default null
)
returns table (
  data date, turno_id uuid, espaco_id uuid, estado text, vagas integer, capacidade integer,
  expira_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_empresa_id is distinct from public._agenda_exigir_usuario() then
    raise exception 'AGENDA_SEM_PERMISSAO' using errcode = 'insufficient_privilege';
  end if;
  return query select * from public._disponibilidade(p_empresa_id, p_de, p_ate, p_espaco_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Jobs (pg_cron): só persistem o estado; as leituras já tratam vencidas como livres.
-- ---------------------------------------------------------------------------
create or replace function public.vencer_pre_reservas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  update public.reservas set status = 'vencida'
  where status = 'ativa' and tipo = 'pre_reserva' and expira_em <= now();
  get diagnostics v_total = row_count;
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
  v_total integer;
begin
  update public.reservas set status = 'realizada'
  where status = 'ativa' and tipo = 'confirmada' and fim < now();
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: tudo fechado; o painel executa só as funções públicas da agenda.
-- anon NÃO recebe disponibilidade nesta etapa (a Etapa 4 cria o wrapper por slug).
-- ---------------------------------------------------------------------------
revoke all on function public._agenda_intervalo(date, time, integer, text, integer) from public, anon, authenticated;
revoke all on function public._agenda_travar(uuid) from public, anon, authenticated;
revoke all on function public._agenda_ocupacoes(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public._agenda_bloqueado(uuid, date, uuid, uuid) from public, anon, authenticated;
revoke all on function public._agenda_exigir_usuario(boolean) from public, anon, authenticated;
revoke all on function public._disponibilidade(uuid, date, date, uuid) from public, anon, authenticated;
revoke all on function public.vencer_pre_reservas() from public, anon, authenticated;
revoke all on function public.marcar_realizadas() from public, anon, authenticated;
revoke all on function public.criar_reserva(uuid, uuid, date, public.tipo_reserva, text, text, uuid, integer, integer, integer, date, text, public.origem_reserva) from public, anon;
revoke all on function public.confirmar_reserva(uuid, integer, date) from public, anon;
revoke all on function public.cancelar_reserva(uuid, text) from public, anon;
revoke all on function public.estender_pre_reserva(uuid, integer) from public, anon;
revoke all on function public.criar_bloqueio(date, date, uuid, uuid, text) from public, anon;
revoke all on function public.remover_bloqueio(uuid) from public, anon;
revoke all on function public.disponibilidade(uuid, date, date, uuid) from public, anon;

grant execute on function public.criar_reserva(uuid, uuid, date, public.tipo_reserva, text, text, uuid, integer, integer, integer, date, text, public.origem_reserva) to authenticated;
grant execute on function public.confirmar_reserva(uuid, integer, date) to authenticated;
grant execute on function public.cancelar_reserva(uuid, text) to authenticated;
grant execute on function public.estender_pre_reserva(uuid, integer) to authenticated;
grant execute on function public.criar_bloqueio(date, date, uuid, uuid, text) to authenticated;
grant execute on function public.remover_bloqueio(uuid) to authenticated;
grant execute on function public.disponibilidade(uuid, date, date, uuid) to authenticated;
grant execute on function public._disponibilidade(uuid, date, date, uuid) to service_role;
grant execute on function public.vencer_pre_reservas() to service_role;
grant execute on function public.marcar_realizadas() to service_role;
