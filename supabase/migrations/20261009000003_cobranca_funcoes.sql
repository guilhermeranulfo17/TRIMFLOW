-- Etapa 9A · Cobrança: situação da conta, eventos do Asaas, limites do plano, conta somente
-- leitura, avisos de cobrança, acesso de suporte e ações do /interno.
--
-- Compatível com o código da Etapa 8: nenhuma assinatura de função usada pelo app muda.
-- Os triggers novos (limites e somente leitura) também protegem o código antigo.

-- ---------------------------------------------------------------------------
-- 1. Regras puras (espelhos em src/domain/cobranca, com teste de equivalência)
-- ---------------------------------------------------------------------------

/** Espelho: domain/cobranca/situacao.ts (situacaoConta). */
create or replace function public._situacao_conta(
  p_agora timestamptz, p_fuso text, p_trial_ate timestamptz, p_isenta boolean,
  p_suspensa_manual boolean, p_status text, p_pago_ate date, p_atrasada_desde date
)
returns public.plano_empresa
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hoje   date := (p_agora at time zone coalesce(p_fuso, 'America/Sao_Paulo'))::date;
  v_atraso integer;
begin
  if coalesce(p_suspensa_manual, false) then
    return 'suspenso';
  end if;
  if coalesce(p_isenta, false) then
    return 'ativo';
  end if;
  if p_pago_ate is not null and v_hoje <= p_pago_ate then
    return case when p_status = 'cancelada' then 'cancelado' else 'ativo' end::public.plano_empresa;
  end if;
  if p_status = 'ativa' and p_pago_ate is not null then
    v_atraso := v_hoje - coalesce(p_atrasada_desde, p_pago_ate + 1);
    if v_atraso <= 0 then
      return 'ativo';
    end if;
    return case when v_atraso <= 7 then 'inadimplente' else 'suspenso' end::public.plano_empresa;
  end if;
  if p_trial_ate is not null and p_agora < p_trial_ate then
    return 'trial';
  end if;
  return 'suspenso';
end;
$$;

/** Espelho: domain/cobranca/limites.ts (codigoPlanoVigente). */
create or replace function public._codigo_plano(
  p_situacao public.plano_empresa, p_isenta boolean, p_plano_assinatura text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_situacao = 'trial' then 'profissional'
    when p_plano_assinatura is not null then p_plano_assinatura
    when coalesce(p_isenta, false) then 'profissional'
    else 'essencial'
  end;
$$;

/** Espelho: domain/cobranca/asaas-eventos.ts (proximoStatus). Nunca regride. */
create or replace function public._cobranca_proximo_status(p_atual text, p_novo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_atual is null then p_novo
    when p_atual = 'cancelada' then p_atual
    when p_novo = 'cancelada' then case when p_atual in ('pendente', 'vencida') then p_novo else p_atual end
    when (case p_novo when 'pendente' then 0 when 'vencida' then 1 when 'confirmada' then 2
                      when 'recebida' then 3 when 'estornada' then 4 else -1 end)
       > (case p_atual when 'pendente' then 0 when 'vencida' then 1 when 'confirmada' then 2
                       when 'recebida' then 3 when 'estornada' then 4 else -1 end)
      then p_novo
    else p_atual
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Assinatura de referência, plano vigente e situação da empresa
-- ---------------------------------------------------------------------------

/**
 * A assinatura que decide a situação: a ativa; senão a cancelada que ainda cobre hoje; senão a
 * pendente; senão a cancelada mais recente.
 */
create or replace function public._assinatura_referencia(p_empresa uuid)
returns public.assinaturas
language sql
stable
security definer
set search_path = ''
as $$
  select a.* from public.assinaturas a
  join public.empresas e on e.id = a.empresa_id
  where a.empresa_id = p_empresa
  order by
    (a.status = 'ativa') desc,
    (a.status = 'cancelada' and a.pago_ate >= (now() at time zone e.fuso)::date) desc,
    (a.status = 'pendente') desc,
    a.criada_em desc
  limit 1;
$$;

/** Plano que vale para os limites (teste e cortesia sem assinatura = Profissional). */
create or replace function public._plano_vigente(p_empresa uuid)
returns public.planos
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.planos p
  where p.codigo = (
    select public._codigo_plano(e.plano, e.isenta, (public._assinatura_referencia(e.id)).plano_codigo)
    from public.empresas e where e.id = p_empresa);
$$;

/** Avisos de cobrança para todos os donos ativos (chave = base:usuario). */
create or replace function public._aviso_donos(
  p_empresa uuid, p_tipo public.tipo_aviso, p_dados jsonb, p_chave_base text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u uuid;
  v_n integer := 0;
begin
  for v_u in select u.id from public.usuarios u
             where u.empresa_id = p_empresa and u.perfil = 'dono' and u.ativo loop
    if public._aviso_criar(p_empresa, v_u, p_tipo, null, p_dados, p_chave_base || ':' || v_u)
       is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

/**
 * Recalcula e grava empresas.plano. Na mudança: auditoria e aviso (carência ou suspensa).
 * Chamada pelo webhook, pela reconciliação, pelo job de hora em hora e pelo /interno.
 */
create or replace function public._atualizar_situacao(p_empresa uuid, p_agora timestamptz default now())
returns public.plano_empresa
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e     public.empresas;
  v_a     public.assinaturas;
  v_nova  public.plano_empresa;
  v_hoje  date;
  v_inic  date;
begin
  select * into v_e from public.empresas e where e.id = p_empresa for update;
  if v_e.id is null then
    return null;
  end if;
  v_a := public._assinatura_referencia(p_empresa);
  v_nova := public._situacao_conta(p_agora, v_e.fuso, v_e.trial_ate, v_e.isenta,
    v_e.suspensa_manual_em is not null, v_a.status, v_a.pago_ate, v_a.atrasada_desde);
  if v_nova is not distinct from v_e.plano then
    return v_nova;
  end if;

  update public.empresas set plano = v_nova where id = p_empresa;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (p_empresa, null, 'conta.situacao', 'empresa', p_empresa,
          jsonb_build_object('antes', v_e.plano, 'depois', v_nova));

  v_hoje := (p_agora at time zone v_e.fuso)::date;
  if v_nova = 'inadimplente' then
    v_inic := coalesce(v_a.atrasada_desde, v_a.pago_ate + 1);
    perform public._aviso_donos(p_empresa, 'carencia',
      jsonb_build_object('suspende_em', v_inic + 8), 'carencia:' || p_empresa || ':' || v_inic);
  elsif v_nova = 'suspenso' then
    perform public._aviso_donos(p_empresa, 'conta_suspensa', '{}'::jsonb,
      'conta_suspensa:' || p_empresa || ':' || v_hoje);
  end if;
  return v_nova;
end;
$$;

/**
 * Job de hora em hora: situação de todas as empresas + "teste acabando" a 3 dias e a 1 dia do
 * fim (só quem ainda não assinou). Idempotente pelas chaves dos avisos.
 */
create or replace function public.atualizar_situacoes(p_agora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e      record;
  v_n      integer := 0;
  v_resta  interval;
  v_marco  integer;
begin
  for v_e in select e.id from public.empresas e order by e.id loop
    if public._atualizar_situacao(v_e.id, p_agora) = 'trial' then
      select e.trial_ate - p_agora into v_resta from public.empresas e where e.id = v_e.id;
      v_marco := case when v_resta <= interval '1 day' then 1
                      when v_resta <= interval '3 days' then 3 end;
      if v_marco is not null and not exists (
        select 1 from public.assinaturas a where a.empresa_id = v_e.id and a.status <> 'cancelada') then
        v_n := v_n + public._aviso_donos(v_e.id, 'teste_acabando',
          jsonb_build_object('dias', greatest(1, ceil(extract(epoch from v_resta) / 86400))::integer),
          'teste_acabando:' || v_marco || ':' || v_e.id);
      end if;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Eventos do Asaas (webhook e reconciliação), numa transação só
-- ---------------------------------------------------------------------------

/** pago_ate e atrasada_desde da assinatura a partir das cobranças; pagou = ativa. */
create or replace function public._recalcular_assinatura(p_assinatura uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.assinaturas;
begin
  select * into v_a from public.assinaturas a where a.id = p_assinatura for update;
  if v_a.id is null then
    return;
  end if;
  update public.assinaturas a set
    pago_ate = (select max((c.vencimento + case v_a.ciclo when 'anual' then interval '1 year'
                                                         else interval '1 month' end)::date - 1)
                from public.cobrancas c
                where c.assinatura_id = v_a.id and c.status in ('confirmada', 'recebida')),
    atrasada_desde = (select min(c.vencimento) from public.cobrancas c
                      where c.assinatura_id = v_a.id and c.status = 'vencida')
  where a.id = v_a.id;
  update public.assinaturas a set status = 'ativa'
  where a.id = v_a.id and a.status = 'pendente' and a.pago_ate is not null;
end;
$$;

/**
 * Registra um evento já normalizado pelo servidor (domain/cobranca/asaas-eventos) e aplica o
 * efeito. Idempotente pelo id do evento; status de cobrança nunca regride; tudo na mesma
 * transação (falhou no meio = nada gravado e o Asaas reenvia).
 * Devolve: duplicado | ignorado | sem_empresa | cobranca | assinatura_cancelada.
 */
create or replace function public.cobranca_registrar_evento(p_evento jsonb, p_payload jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento    uuid;
  v_c         jsonb := p_evento -> 'cobranca';
  v_ac        jsonb := p_evento -> 'assinatura_cancelada';
  v_ass       public.assinaturas;
  v_empresa   uuid;
  v_ref       text;
  v_atual     public.cobrancas;
  v_novo      text;
  v_cob       uuid;
  v_resultado text;
begin
  insert into public.cobranca_eventos (asaas_evento_id, tipo, payload)
  values (p_evento ->> 'evento_id', p_evento ->> 'tipo', coalesce(p_payload, '{}'::jsonb))
  on conflict (asaas_evento_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return 'duplicado';
  end if;

  if not coalesce((p_evento ->> 'tratado')::boolean, false) then
    update public.cobranca_eventos set ignorado = true, processado_em = now(), resultado = 'ignorado'
    where id = v_evento;
    return 'ignorado';
  end if;

  -- assinatura cancelada no Asaas
  if v_ac is not null and jsonb_typeof(v_ac) = 'object' then
    select * into v_ass from public.assinaturas a where a.asaas_assinatura_id = v_ac ->> 'asaas_id';
    if v_ass.id is null then
      update public.cobranca_eventos set processado_em = now(), resultado = 'sem_empresa'
      where id = v_evento;
      return 'sem_empresa';
    end if;
    perform pg_advisory_xact_lock(hashtext('cobranca:' || v_ass.empresa_id));
    update public.assinaturas set status = 'cancelada', cancelada_em = coalesce(cancelada_em, now())
    where id = v_ass.id and status <> 'cancelada';
    perform public._atualizar_situacao(v_ass.empresa_id);
    update public.cobranca_eventos set empresa_id = v_ass.empresa_id, processado_em = now(),
      resultado = 'assinatura_cancelada'
    where id = v_evento;
    return 'assinatura_cancelada';
  end if;

  if v_c is null or jsonb_typeof(v_c) <> 'object' then
    update public.cobranca_eventos set ignorado = true, processado_em = now(), resultado = 'ignorado'
    where id = v_evento;
    return 'ignorado';
  end if;

  -- de quem é a cobrança: assinatura > cobrança já conhecida > referência (empresa_id) > cliente
  if v_c ->> 'assinatura_asaas_id' is not null then
    select * into v_ass from public.assinaturas a where a.asaas_assinatura_id = v_c ->> 'assinatura_asaas_id';
    v_empresa := v_ass.empresa_id;
  end if;
  if v_empresa is null then
    select c.empresa_id into v_empresa from public.cobrancas c where c.asaas_cobranca_id = v_c ->> 'asaas_id';
  end if;
  v_ref := v_c ->> 'referencia';
  if v_empresa is null and v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select e.id into v_empresa from public.empresas e where e.id = v_ref::uuid;
  end if;
  if v_empresa is null and v_c ->> 'cliente_asaas_id' is not null then
    select ec.empresa_id into v_empresa from public.empresas_cobranca ec
    where ec.asaas_cliente_id = v_c ->> 'cliente_asaas_id';
  end if;
  if v_empresa is null then
    update public.cobranca_eventos set processado_em = now(), resultado = 'sem_empresa'
    where id = v_evento;
    return 'sem_empresa';
  end if;

  -- um evento por empresa de cada vez (dois webhooks simultâneos não se atropelam)
  perform pg_advisory_xact_lock(hashtext('cobranca:' || v_empresa));

  select * into v_atual from public.cobrancas c where c.asaas_cobranca_id = v_c ->> 'asaas_id' for update;
  v_novo := public._cobranca_proximo_status(v_atual.status, v_c ->> 'status');

  if v_atual.id is null then
    insert into public.cobrancas (empresa_id, assinatura_id, asaas_cobranca_id, tipo, valor_centavos,
      vencimento, status, forma, link_fatura, pago_em)
    values (v_empresa, v_ass.id, v_c ->> 'asaas_id',
      case when v_ass.id is null then 'implantacao' else 'assinatura' end,
      (v_c ->> 'valor_centavos')::integer, (v_c ->> 'vencimento')::date, v_novo,
      v_c ->> 'forma', v_c ->> 'link_fatura',
      case when v_novo in ('confirmada', 'recebida') then coalesce((v_c ->> 'pago_em')::date::timestamptz, now()) end)
    returning id into v_cob;
  else
    v_cob := v_atual.id;
    update public.cobrancas set
      valor_centavos = coalesce((v_c ->> 'valor_centavos')::integer, valor_centavos),
      vencimento = case when v_novo in ('pendente', 'vencida')
                        then coalesce((v_c ->> 'vencimento')::date, vencimento) else vencimento end,
      status = v_novo,
      forma = coalesce(v_c ->> 'forma', forma),
      link_fatura = coalesce(v_c ->> 'link_fatura', link_fatura),
      pago_em = case when v_novo in ('confirmada', 'recebida')
                     then coalesce(pago_em, (v_c ->> 'pago_em')::date::timestamptz, now()) else pago_em end
    where id = v_atual.id;
  end if;

  if v_ass.id is not null then
    perform public._recalcular_assinatura(v_ass.id);
  end if;

  -- avisos só quando o status muda de verdade
  if v_novo is distinct from v_atual.status then
    if v_novo = 'pendente' and v_atual.id is null then
      perform public._aviso_donos(v_empresa, 'fatura_criada',
        jsonb_build_object('valor_centavos', (v_c ->> 'valor_centavos')::integer,
                           'vencimento', v_c ->> 'vencimento'),
        'fatura_criada:' || v_cob);
    elsif v_novo in ('confirmada', 'recebida') and coalesce(v_atual.status, '') not in ('confirmada', 'recebida') then
      perform public._aviso_donos(v_empresa, 'pagamento_confirmado',
        jsonb_build_object('valor_centavos', (v_c ->> 'valor_centavos')::integer),
        'pagamento_confirmado:' || v_cob);
    elsif v_novo = 'vencida' then
      perform public._aviso_donos(v_empresa, 'pagamento_falhou',
        jsonb_build_object('valor_centavos', (v_c ->> 'valor_centavos')::integer,
                           'vencimento', v_c ->> 'vencimento'),
        'pagamento_falhou:' || v_cob);
    end if;
  end if;

  perform public._atualizar_situacao(v_empresa);
  v_resultado := 'cobranca';
  update public.cobranca_eventos set empresa_id = v_empresa, processado_em = now(), resultado = v_resultado
  where id = v_evento;
  return v_resultado;
end;
$$;

/**
 * Reserva um uso do cupom para a empresa (trava o cupom; esgotado ou já usado = erro).
 * Chamada pelo servidor na mesma transação que grava a assinatura.
 */
create or replace function public.cobranca_reservar_cupom(p_cupom uuid, p_empresa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.cupons;
begin
  select * into v_c from public.cupons c where c.id = p_cupom for update;
  if v_c.id is null or not v_c.ativo or (v_c.valido_ate is not null and v_c.valido_ate < now()) then
    raise exception 'CUPOM_INVALIDO' using errcode = 'check_violation';
  end if;
  if v_c.max_usos is not null and v_c.usos >= v_c.max_usos then
    raise exception 'CUPOM_ESGOTADO' using errcode = 'check_violation';
  end if;
  insert into public.cupons_usos (cupom_id, empresa_id) values (p_cupom, p_empresa)
  on conflict (cupom_id, empresa_id) do nothing;
  if not found then
    raise exception 'CUPOM_JA_USADO' using errcode = 'check_violation';
  end if;
  update public.cupons set usos = usos + 1 where id = p_cupom;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Limites do plano (valem para QUALQUER caminho de escrita, inclusive o admin)
-- ---------------------------------------------------------------------------

create or replace function public._limite_usuarios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p     public.planos;
  v_ativos integer;
begin
  if not new.ativo or (tg_op = 'UPDATE' and old.ativo and old.empresa_id = new.empresa_id) then
    return new;
  end if;
  v_p := public._plano_vigente(new.empresa_id);
  if v_p.codigo is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('limite_usuarios:' || new.empresa_id));
  select count(*) into v_ativos from public.usuarios u
  where u.empresa_id = new.empresa_id and u.ativo and u.id <> new.id;
  if v_ativos >= v_p.max_usuarios then
    raise exception 'LIMITE_PLANO_USUARIOS' using errcode = 'check_violation',
      detail = 'max=' || v_p.max_usuarios;
  end if;
  return new;
end;
$$;

create trigger usuarios_limite_plano
  before insert or update of ativo, empresa_id on public.usuarios
  for each row execute function public._limite_usuarios();

create or replace function public._limite_espacos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p      public.planos;
  v_ativos integer;
begin
  if not new.ativo or (tg_op = 'UPDATE' and old.ativo) then
    return new;
  end if;
  v_p := public._plano_vigente(new.empresa_id);
  if v_p.codigo is null or v_p.max_espacos is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('limite_espacos:' || new.empresa_id));
  select count(*) into v_ativos from public.espacos x
  where x.empresa_id = new.empresa_id and x.ativo and x.id <> new.id;
  if v_ativos >= v_p.max_espacos then
    raise exception 'LIMITE_PLANO_ESPACOS' using errcode = 'check_violation',
      detail = 'max=' || v_p.max_espacos;
  end if;
  return new;
end;
$$;

create trigger espacos_limite_plano
  before insert or update of ativo on public.espacos
  for each row execute function public._limite_espacos();

create or replace function public._limite_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.whatsapp_ativo and (tg_op = 'INSERT' or not old.whatsapp_ativo)
     and not coalesce((public._plano_vigente(new.empresa_id)).whatsapp_avisos, true) then
    raise exception 'LIMITE_PLANO_WHATSAPP' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger preferencias_avisos_limite_plano
  before insert or update of whatsapp_ativo on public.preferencias_avisos
  for each row execute function public._limite_whatsapp();

create or replace function public._limite_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ligada and not old.ligada
     and not coalesce((public._plano_vigente(new.empresa_id)).follow_up, true) then
    raise exception 'LIMITE_PLANO_FOLLOW_UP' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger regras_follow_up_limite_plano
  before update of ligada on public.regras_follow_up
  for each row execute function public._limite_follow_up();

/** Tarefa automática: empresa suspensa ou sem follow-up no plano não recebe (ignora em silêncio). */
create or replace function public._tarefa_regra_permitida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origem = 'regra' and (
       exists (select 1 from public.empresas e where e.id = new.empresa_id and e.plano = 'suspenso')
       or not coalesce((public._plano_vigente(new.empresa_id)).follow_up, true)) then
    return null;
  end if;
  return new;
end;
$$;

create trigger tarefas_regra_permitida
  before insert on public.tarefas
  for each row execute function public._tarefa_regra_permitida();

-- ---------------------------------------------------------------------------
-- 5. Conta suspensa = painel somente leitura
-- ---------------------------------------------------------------------------

/**
 * Recusa escrita de usuário logado (auth.uid() presente: painel, RLS ou funções security
 * definer chamadas por ele) quando a empresa está suspensa. Jobs, webhook e servidor via admin
 * (sem claims) e o link público (anon) seguem. GUC orkestra.permitir_escrita = '1' libera
 * casos revisados na própria transação.
 */
create or replace function public._exigir_escrita()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  if auth.uid() is null or coalesce(current_setting('orkestra.permitir_escrita', true), '') = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'empresas' then
    v_empresa := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_empresa := case when tg_op = 'DELETE' then old.empresa_id else new.empresa_id end;
  end if;
  if exists (select 1 from public.empresas e where e.id = v_empresa and e.plano = 'suspenso') then
    raise exception 'CONTA_SOMENTE_LEITURA' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Toda tabela de public com empresa_id (e empresas). Tabela nova: ligar na própria migration
-- (o teste de integração confere pelo catálogo).
do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'empresa_id' and tb.table_type = 'BASE TABLE'
      and c.table_name not in ('avisos', 'avisos_entregas', 'auditoria', 'auditoria_interna',
        'acessos_suporte', 'assinaturas', 'cobrancas', 'cobranca_eventos', 'cupons_usos',
        'empresas_cobranca', 'push_inscricoes', 'preferencias_avisos', 'funil_eventos')
    union all select 'empresas'
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_somente_leitura', t);
    execute format('create trigger %I before insert or update or delete on public.%I '
                   'for each row execute function public._exigir_escrita()', t || '_somente_leitura', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Avisos: empresa suspensa só recebe os de cobrança; WhatsApp só no plano com o recurso
-- ---------------------------------------------------------------------------

/** Espelho: domain/avisos/canais.ts (canaisDoTipo). Cobrança: push sempre, sem preferência. */
create or replace function public._aviso_canais(p_tipo public.tipo_aviso, p_canais jsonb)
returns text[]
language sql
stable
set search_path = ''
as $$
  with escolhidos as (
    select case
      when p_tipo in ('teste_acabando', 'fatura_criada', 'pagamento_confirmado', 'pagamento_falhou',
                      'carencia', 'conta_suspensa')
        then array['push']
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
  v_cobr    boolean := p_tipo in ('teste_acabando', 'fatura_criada', 'pagamento_confirmado',
                                  'pagamento_falhou', 'carencia', 'conta_suspensa');
begin
  if p_lead is not null and exists (select 1 from public.leads l where l.id = p_lead and l.eh_teste) then
    return null;
  end if;
  -- Etapa 9A: conta suspensa não recebe avisos de operação (só os de cobrança)
  if not v_cobr and exists (select 1 from public.empresas e where e.id = p_empresa and e.plano = 'suspenso') then
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
  if 'whatsapp' = any(v_canais) and coalesce(v_prefs.whatsapp_ativo, false)
     and coalesce((public._plano_vigente(p_empresa)).whatsapp_avisos, true) then
    insert into public.avisos_entregas (empresa_id, aviso_id, canal, proximo_envio_em)
    values (p_empresa, v_id, 'whatsapp', v_quando);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Acesso de suporte (consentimento do dono) e marca de suporte na auditoria
-- ---------------------------------------------------------------------------

/** O dono permite o suporte por 7 dias (substitui um consentimento vigente). */
create or replace function public.permitir_suporte()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_expira  timestamptz := now() + interval '7 days';
  v_id      uuid;
begin
  if v_empresa is null or public.perfil_do_usuario() is distinct from 'dono' then
    raise exception 'Só o dono pode permitir o acesso do suporte.' using errcode = 'insufficient_privilege';
  end if;
  update public.acessos_suporte set revogado_em = now(), revogado_por = auth.uid()
  where empresa_id = v_empresa and revogado_em is null and expira_em > now();
  insert into public.acessos_suporte (empresa_id, concedido_por, expira_em)
  values (v_empresa, auth.uid(), v_expira)
  returning id into v_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'suporte.permitido', 'acesso_suporte', v_id,
          jsonb_build_object('expira_em', v_expira));
  return v_expira;
end;
$$;

create or replace function public.revogar_suporte()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_n       integer;
begin
  if v_empresa is null or public.perfil_do_usuario() is distinct from 'dono' then
    raise exception 'Só o dono pode revogar o acesso do suporte.' using errcode = 'insufficient_privilege';
  end if;
  update public.acessos_suporte set revogado_em = now(), revogado_por = auth.uid()
  where empresa_id = v_empresa and revogado_em is null and expira_em > now();
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.auditoria (empresa_id, usuario_id, acao, entidade, dados)
    values (v_empresa, auth.uid(), 'suporte.revogado', 'acesso_suporte', '{}'::jsonb);
  end if;
  return v_n;
end;
$$;

/** Consentimento vigente da empresa (servidor confere a cada request do suporte). */
create or replace function public.suporte_vigente(p_empresa uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(a.expira_em) from public.acessos_suporte a
  where a.empresa_id = p_empresa and a.revogado_em is null and a.expira_em > now();
$$;

/** Tudo o que o suporte faz na conta fica marcado na auditoria da empresa. */
create or replace function public._auditoria_marca_suporte()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_admin text := nullif(current_setting('orkestra.suporte_admin', true), '');
begin
  if v_admin is not null then
    new.dados := coalesce(new.dados, '{}'::jsonb) || jsonb_build_object('suporte', v_admin);
  end if;
  return new;
end;
$$;

create trigger auditoria_marca_suporte
  before insert on public.auditoria
  for each row execute function public._auditoria_marca_suporte();

-- ---------------------------------------------------------------------------
-- 8. Ações do /interno (só o servidor, via conexão administrativa)
-- ---------------------------------------------------------------------------

create or replace function public.interno_registrar(
  p_admin text, p_acao text, p_empresa uuid, p_dados jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auditoria_interna (admin_email, acao, empresa_id, dados)
  values (lower(p_admin), p_acao, p_empresa, coalesce(p_dados, '{}'::jsonb));
$$;

create or replace function public.interno_estender_teste(p_empresa uuid, p_dias integer, p_admin text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ate timestamptz;
begin
  if p_dias is null or p_dias not between 1 and 90 then
    raise exception 'Dias inválidos.' using errcode = 'check_violation';
  end if;
  update public.empresas set trial_ate = greatest(coalesce(trial_ate, now()), now()) + make_interval(days => p_dias)
  where id = p_empresa
  returning trial_ate into v_ate;
  if v_ate is null then
    raise exception 'Empresa não encontrada.' using errcode = 'no_data_found';
  end if;
  perform public._atualizar_situacao(p_empresa);
  perform public.interno_registrar(p_admin, 'teste.estendido', p_empresa,
    jsonb_build_object('dias', p_dias, 'trial_ate', v_ate));
  return v_ate;
end;
$$;

create or replace function public.interno_suspender(p_empresa uuid, p_motivo text, p_admin text)
returns public.plano_empresa
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.empresas set suspensa_manual_em = now(),
    motivo_suspensao = left(nullif(btrim(coalesce(p_motivo, '')), ''), 300)
  where id = p_empresa;
  perform public.interno_registrar(p_admin, 'empresa.suspensa', p_empresa,
    jsonb_build_object('motivo', p_motivo));
  return public._atualizar_situacao(p_empresa);
end;
$$;

create or replace function public.interno_reativar(p_empresa uuid, p_admin text)
returns public.plano_empresa
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.empresas set suspensa_manual_em = null, motivo_suspensao = null where id = p_empresa;
  perform public.interno_registrar(p_admin, 'empresa.reativada', p_empresa);
  return public._atualizar_situacao(p_empresa);
end;
$$;

create or replace function public.interno_isentar(p_empresa uuid, p_isenta boolean, p_admin text)
returns public.plano_empresa
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.empresas set isenta = coalesce(p_isenta, false) where id = p_empresa;
  perform public.interno_registrar(p_admin, case when p_isenta then 'empresa.isenta' else 'empresa.cobrada' end,
    p_empresa);
  return public._atualizar_situacao(p_empresa);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Link público de empresa suspensa: só a vitrine (sem wizard, sem proposta nova)
-- ---------------------------------------------------------------------------

/** Montagem do contexto (catálogo ativo com preço confirmado + regras) de uma empresa. */
create or replace function publico._contexto_da_empresa(v_e public.empresas)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'fuso', v_e.fuso,
    'hoje', publico._hoje(v_e.id),
    'regras', (select to_jsonb(r) - 'empresa_id' from public.regras_comerciais r where r.empresa_id = v_e.id),
    'tipos_evento', coalesce((select jsonb_agg(to_jsonb(t) - 'empresa_id' order by t.ordem, t.nome)
      from public.tipos_evento t where t.empresa_id = v_e.id and t.ativo), '[]'),
    'espacos', coalesce((select jsonb_agg(to_jsonb(x) - 'empresa_id' order by x.ordem, x.nome)
      from public.espacos x where x.empresa_id = v_e.id and x.ativo), '[]'),
    'turnos', coalesce((select jsonb_agg(to_jsonb(t) - 'empresa_id' order by t.ordem, t.hora_inicio)
      from public.turnos t where t.empresa_id = v_e.id and t.ativo), '[]'),
    'ajustes_dia', coalesce((select jsonb_agg(to_jsonb(a) - 'empresa_id')
      from public.ajustes_dia a where a.empresa_id = v_e.id), '[]'),
    'feriados', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' order by f.data)
      from public.feriados f where f.empresa_id = v_e.id), '[]'),
    'faixas_idade', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' order by f.idade_min)
      from public.faixas_idade f
      where f.empresa_id = v_e.id
        and (f.pacote_id is null or exists (
          select 1 from public.pacotes p where p.id = f.pacote_id and p.ativo and p.preco_confirmado_em is not null))), '[]'),
    'pacotes', coalesce((select jsonb_agg(to_jsonb(p) - 'empresa_id' order by p.ordem, p.nome)
      from public.pacotes p where p.empresa_id = v_e.id and p.ativo and p.preco_confirmado_em is not null), '[]'),
    'faixas_preco', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' order by f.ate_convidados)
      from public.faixas_preco f join public.pacotes p on p.id = f.pacote_id and p.ativo and p.preco_confirmado_em is not null
      where f.empresa_id = v_e.id), '[]'),
    'secoes_cardapio', coalesce((select jsonb_agg(to_jsonb(s) - 'empresa_id' order by s.ordem)
      from public.secoes_cardapio s join public.pacotes p on p.id = s.pacote_id and p.ativo and p.preco_confirmado_em is not null
      where s.empresa_id = v_e.id), '[]'),
    'pacote_tipos_evento', coalesce((select jsonb_agg(to_jsonb(v) - 'empresa_id')
      from public.pacote_tipos_evento v where v.empresa_id = v_e.id), '[]'),
    'opcionais', coalesce((select jsonb_agg(to_jsonb(o) - 'empresa_id' order by o.ordem, o.nome)
      from public.opcionais o where o.empresa_id = v_e.id and o.ativo and o.preco_confirmado_em is not null), '[]'),
    'opcional_pacotes', coalesce((select jsonb_agg(to_jsonb(v) - 'empresa_id')
      from public.opcional_pacotes v where v.empresa_id = v_e.id), '[]'),
    'opcional_tipos_evento', coalesce((select jsonb_agg(to_jsonb(v) - 'empresa_id')
      from public.opcional_tipos_evento v where v.empresa_id = v_e.id), '[]'),
    'faixas_deslocamento', coalesce((select jsonb_agg(to_jsonb(d) - 'empresa_id' order by d.ate_km)
      from public.faixas_deslocamento d where d.empresa_id = v_e.id), '[]')
  );
end;
$$;

/** Mesma assinatura e resultado de antes (empresa suspensa continua recusada). */
create or replace function publico.contexto_preco(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return publico._contexto_da_empresa(publico._empresa_ativa(p_slug));
end;
$$;

/**
 * Igual a contexto_preco, mas também para empresa suspensa: o servidor monta SÓ a vitrine com
 * ele (o wizard e as funções de escrita continuam recusando). Preços nunca vão ao navegador.
 */
create or replace function publico.contexto_vitrine(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.empresas;
begin
  v_e := publico._empresa(p_slug);
  if v_e.id is null then
    raise exception 'PUBLICO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  return publico._contexto_da_empresa(v_e);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Privilégios: tudo fechado; app só executa o que o painel usa
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  -- internas e do servidor (conexão administrativa): ninguém pela API
  foreach f in array array[
    'public._situacao_conta(timestamptz, text, timestamptz, boolean, boolean, text, date, date)',
    'public._codigo_plano(public.plano_empresa, boolean, text)',
    'public._cobranca_proximo_status(text, text)',
    'public._assinatura_referencia(uuid)',
    'public._plano_vigente(uuid)',
    'public._aviso_donos(uuid, public.tipo_aviso, jsonb, text)',
    'public._atualizar_situacao(uuid, timestamptz)',
    'public.atualizar_situacoes(timestamptz)',
    'public._recalcular_assinatura(uuid)',
    'public.cobranca_registrar_evento(jsonb, jsonb)',
    'public.cobranca_reservar_cupom(uuid, uuid)',
    'public._limite_usuarios()', 'public._limite_espacos()', 'public._limite_whatsapp()',
    'public._limite_follow_up()', 'public._tarefa_regra_permitida()', 'public._exigir_escrita()',
    'public._auditoria_marca_suporte()', 'public.suporte_vigente(uuid)',
    'public.interno_registrar(text, text, uuid, jsonb)',
    'public.interno_estender_teste(uuid, integer, text)',
    'public.interno_suspender(uuid, text, text)', 'public.interno_reativar(uuid, text)',
    'public.interno_isentar(uuid, boolean, text)',
    'publico._contexto_da_empresa(public.empresas)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;

  -- painel (dono): consentimento do suporte
  foreach f in array array['public.permitir_suporte()', 'public.revogar_suporte()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- link público: como as demais funções do schema publico, só anon
  execute 'revoke all on function publico.contexto_vitrine(text) from public, authenticated, service_role';
  execute 'grant execute on function publico.contexto_vitrine(text) to anon';
end;
$$;

-- _aviso_canais e _aviso_criar foram redefinidas com a mesma assinatura: os privilégios da
-- Etapa 7 continuam valendo.

-- Situação inicial de todas as empresas (com o backfill da migration 2, ninguém é suspenso).
select public.atualizar_situacoes();
