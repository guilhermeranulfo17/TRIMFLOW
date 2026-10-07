-- Etapa 10 · PR 2 · Contrato no painel: avisos ao dono, selo na Agenda, Números, cópia do PDF por
-- e-mail ao cliente (se o dono marcar) e o contrato de exemplo da demo. Tudo aditivo.

-- ---------------------------------------------------------------------------------------------
-- 1. Cópia do PDF assinado por e-mail ao cliente (o dono decide no envio)
-- ---------------------------------------------------------------------------------------------

alter table public.contratos
  add column if not exists enviar_copia_email boolean not null default false;
comment on column public.contratos.enviar_copia_email is
  'O dono pediu para mandar a cópia do PDF assinado ao e-mail do cliente (só com e-mail no lead).';
alter table public.contratos
  add column if not exists copia_email_enviada_em timestamptz;
comment on column public.contratos.copia_email_enviada_em is
  'Quando a cópia do PDF assinado saiu para o e-mail do cliente (uma vez só).';

/**
 * Cópia do PDF ao cliente, logo depois da assinatura: devolve o e-mail e marca o envio na mesma
 * chamada (uma vez só, mesmo com duas abas). Só o servidor chama, com o token do link.
 */
create or replace function publico.contrato_copia_email(p_slug text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contratos;
begin
  v_c := publico._contrato(p_slug, p_token, true);
  if v_c.id is null or v_c.status <> 'concluido' or not v_c.enviar_copia_email
     or v_c.email_cliente is null or v_c.copia_email_enviada_em is not null
     or v_c.anonimizado_em is not null or v_c.eh_teste then
    return null;
  end if;
  update public.contratos set copia_email_enviada_em = now() where id = v_c.id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_c.empresa_id, null, 'contrato.copia_email', 'contrato', v_c.id, '{}'::jsonb);
  return jsonb_build_object('id', v_c.id, 'email', v_c.email_cliente);
end;
$$;
revoke all on function publico.contrato_copia_email(text, text) from public, authenticated;
grant execute on function publico.contrato_copia_email(text, text) to anon;

-- emitir_contrato: igual à da Etapa 10 PR 1, agora com enviar_copia_email
create or replace function public.emitir_contrato(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u        public.usuarios := public._contrato_dono();
  v_e        public.empresas;
  v_lead     public.leads;
  v_o        public.orcamentos;
  v_r        public.reservas;
  v_ant      public.contratos;
  v_plano    public.planos;
  v_c        public.contratos;
  v_validade integer := coalesce(nullif(p ->> 'validade_dias', '')::integer, 14);
  v_texto    text := p ->> 'texto';
  v_exige    boolean := coalesce((p ->> 'exige_codigo')::boolean, false);
  v_email    text := nullif(btrim(coalesce(p ->> 'email_cliente', '')), '');
  v_ano      integer;
  v_numero   integer;
  v_versao   integer := 1;
begin
  if p is null or jsonb_typeof(p) <> 'object' or v_texto is null
     or jsonb_typeof(coalesce(p -> 'valores', '{}')) <> 'object'
     or jsonb_typeof(coalesce(p -> 'variaveis', '{}')) <> 'object'
     or coalesce(p ->> 'token_hash', '') !~ '^[0-9a-f]{64}$'
     or v_validade not between 1 and 60 then
    raise exception 'CONTRATO_INVALIDO' using errcode = 'check_violation';
  end if;
  -- trava a empresa: numeração sem buracos nem repetição
  select * into v_e from public.empresas e where e.id = v_u.empresa_id for update;

  select * into v_lead from public.leads l
  where l.id = nullif(p ->> 'lead_id', '')::uuid and l.empresa_id = v_e.id;
  if v_lead.id is null or v_lead.anonimizado_em is not null then
    raise exception 'CONTRATO_LEAD_INVALIDO' using errcode = 'check_violation';
  end if;
  if nullif(p ->> 'orcamento_id', '') is not null then
    select * into v_o from public.orcamentos o
    where o.id = (p ->> 'orcamento_id')::uuid and o.empresa_id = v_e.id and o.lead_id = v_lead.id;
    if v_o.id is null then
      raise exception 'CONTRATO_ORCAMENTO_INVALIDO' using errcode = 'check_violation';
    end if;
  end if;
  if nullif(p ->> 'reserva_id', '') is not null then
    select * into v_r from public.reservas r
    where r.id = (p ->> 'reserva_id')::uuid and r.empresa_id = v_e.id
      and (r.lead_id = v_lead.id or (v_o.id is not null and r.orcamento_id = v_o.id));
    if v_r.id is null then
      raise exception 'CONTRATO_RESERVA_INVALIDA' using errcode = 'check_violation';
    end if;
  end if;
  if v_o.id is null and v_r.id is null then
    raise exception 'CONTRATO_SEM_ORIGEM' using errcode = 'check_violation';
  end if;
  if v_exige and v_email is null then
    raise exception 'CONTRATO_CODIGO_SEM_EMAIL' using errcode = 'check_violation';
  end if;

  if nullif(p ->> 'substitui_contrato_id', '') is not null then
    select * into v_ant from public.contratos c
    where c.id = (p ->> 'substitui_contrato_id')::uuid and c.empresa_id = v_e.id
      and c.lead_id = v_lead.id
    for update;
    if v_ant.id is null or v_ant.status in ('concluido', 'rascunho', 'assinado_cliente') then
      raise exception 'CONTRATO_NAO_REFAZ' using errcode = 'check_violation';
    end if;
    v_versao := v_ant.versao + 1;
    if v_ant.status <> 'cancelado' then
      update public.contratos set status = 'cancelado', cancelado_em = now(), cancelado_por = v_u.id,
        cancelamento_motivo = 'Refeito'
      where id = v_ant.id;
      insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
      values (v_e.id, v_u.id, 'contrato.cancelado', 'contrato', v_ant.id,
              jsonb_build_object('motivo', 'Refeito'));
    end if;
  end if;

  if not v_lead.eh_teste then
    v_plano := public._plano_vigente(v_e.id);
    if v_plano.contratos_mes is not null
       and public._contratos_no_mes(v_e.id) >= v_plano.contratos_mes then
      raise exception 'LIMITE_PLANO_CONTRATOS' using errcode = 'check_violation',
        detail = v_plano.contratos_mes::text;
    end if;
  end if;

  v_ano := extract(year from (now() at time zone v_e.fuso))::integer;
  select coalesce(max(c.numero), 0) + 1 into v_numero from public.contratos c
  where c.empresa_id = v_e.id and c.ano = v_ano;

  insert into public.contratos (
    empresa_id, ano, numero, versao, substitui_contrato_id, lead_id, orcamento_id, reserva_id,
    modelo_id, modelo_origem, titulo, status, texto, hash, valores, variaveis, exige_codigo,
    email_cliente, token_hash, expira_em, enviado_em, enviado_por, eh_teste, criado_por,
    enviar_copia_email)
  values (
    v_e.id, v_ano, v_numero, v_versao, v_ant.id, v_lead.id, v_o.id, v_r.id,
    nullif(p ->> 'modelo_id', '')::uuid, nullif(p ->> 'modelo_origem', ''), btrim(p ->> 'titulo'),
    'enviado', v_texto, encode(sha256(convert_to(v_texto, 'UTF8')), 'hex'),
    coalesce(p -> 'valores', '{}'::jsonb), coalesce(p -> 'variaveis', '{}'::jsonb), v_exige,
    v_email, p ->> 'token_hash', now() + make_interval(days => v_validade), now(), v_u.id,
    v_lead.eh_teste, v_u.id,
    coalesce((p ->> 'enviar_copia_email')::boolean, false) and v_email is not null)
  returning * into v_c;

  -- o buffet assina ao enviar
  insert into public.contrato_assinaturas (empresa_id, contrato_id, parte, nome, representa,
    documento_mascarado, usuario_id, ip_hash, user_agent, hash_documento, metodo, codigo_verificado)
  values (v_e.id, v_c.id, 'buffet', v_u.nome, coalesce(v_e.razao_social, v_e.nome),
          case when v_e.cnpj is not null then 'CNPJ ' || public._formatar_cnpj(v_e.cnpj) end,
          v_u.id, nullif(p ->> 'ip_hash', ''), left(nullif(p ->> 'user_agent', ''), 400),
          v_c.hash, 'aceite', false);

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_e.id, v_u.id, 'contrato.enviado', 'contrato', v_c.id,
          jsonb_build_object('ano', v_ano, 'numero', v_numero, 'versao', v_versao,
                             'lead_id', v_lead.id, 'orcamento_id', v_o.id, 'reserva_id', v_r.id,
                             'substitui', v_ant.id, 'hash', v_c.hash, 'exige_codigo', v_exige,
                             'expira_em', v_c.expira_em));
  return jsonb_build_object('id', v_c.id, 'ano', v_ano, 'numero', v_numero, 'versao', v_versao,
                            'expira_em', v_c.expira_em);
end;
$$;

-- Linha do tempo do contrato (e a checagem de "abriu de novo" do link): auditoria por entidade
create index if not exists auditoria_entidade_idx on public.auditoria (entidade_id, criado_em desc)
  where entidade_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 2. Avisos ao dono: abriu (primeira vez), assinou, pediu ajuste, vence em 2 dias
-- ---------------------------------------------------------------------------------------------

/** E-mail do aviso: os da conta e o "contrato assinado" (espelho: domain/avisos/canais). */
create or replace function public._aviso_email(p_tipo public.tipo_aviso)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tipo in ('boas_vindas', 'teste_acabando', 'fatura_criada', 'pagamento_confirmado',
                    'pagamento_falhou', 'conta_suspensa', 'exportacao_pronta', 'exclusao_agendada',
                    'contrato_assinado');
$$;

/**
 * Os eventos do contrato já entram na auditoria (o link do cliente grava sem usuário): este
 * trigger transforma os que interessam ao dono em avisos (sino, push e, no assinado, e-mail),
 * pelo mesmo _aviso_criar (chave única, silêncio, preferências). Contrato de teste não avisa.
 */
create or replace function public._contrato_avisar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c    public.contratos;
  v_tipo public.tipo_aviso;
  v_nome text;
  v_u    record;
begin
  v_tipo := case new.acao
    when 'contrato.visualizado' then
      case when coalesce((new.dados ->> 'primeira')::boolean, false) then 'contrato_aberto' end
    when 'contrato.assinado' then 'contrato_assinado'
    when 'contrato.recusado' then 'contrato_ajuste'
  end;
  if v_tipo is null then
    return null;
  end if;
  select * into v_c from public.contratos c where c.id = new.entidade_id;
  if v_c.id is null or v_c.eh_teste
     or exists (select 1 from public.empresas e where e.id = v_c.empresa_id and e.eh_demo) then
    return null;
  end if;
  select coalesce(nullif(btrim(l.nome), ''), 'Cliente') into v_nome
  from public.leads l where l.id = v_c.lead_id;
  for v_u in
    select u.id from public.usuarios u
    where u.empresa_id = v_c.empresa_id and u.ativo and u.perfil = 'dono'
  loop
    perform public._aviso_criar(v_c.empresa_id, v_u.id, v_tipo, v_c.lead_id,
      jsonb_build_object('lead_nome', v_nome, 'contrato_id', v_c.id,
                         'contrato', v_c.ano || '-' || lpad(v_c.numero::text, 4, '0')),
      v_tipo::text || ':' || v_c.id || ':' || v_u.id, true);
  end loop;
  return null;
end;
$$;

create trigger auditoria_contrato_avisos
  after insert on public.auditoria
  for each row when (new.entidade = 'contrato')
  execute function public._contrato_avisar();

-- rotina diária: agora também avisa "contrato vence em 2 dias"
create or replace function public.contratos_rotina(p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r       record;
  v_exp     integer := 0;
  v_anon    integer := 0;
  v_codigos integer;
  v_venc    integer := 0;
begin
  for v_r in
    select c.id, c.empresa_id from public.contratos c
    where c.status = 'enviado' and c.expira_em <= p_agora
    limit 2000
  loop
    update public.contratos set status = 'expirado' where id = v_r.id;
    insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
    values (v_r.empresa_id, null, 'contrato.expirado', 'contrato', v_r.id, '{}'::jsonb);
    v_exp := v_exp + 1;
  end loop;

  for v_r in
    select c.id, l.whatsapp_e164 from public.contratos c
    join public.leads l on l.id = c.lead_id
    where c.status = 'concluido' and c.anonimizado_em is null
      and coalesce(nullif(c.valores ->> 'data', '')::date, (c.concluido_em at time zone 'UTC')::date)
          < (p_agora - interval '5 years')::date
    limit 500
  loop
    perform public._contrato_anonimizar(v_r.id, '{}',
      right(regexp_replace(coalesce(v_r.whatsapp_e164, ''), '\D', '', 'g'), 8));
    v_anon := v_anon + 1;
  end loop;

  -- link vencendo em até 2 dias: aviso para os donos (uma vez por link)
  for v_r in
    select c.id, c.empresa_id, c.lead_id, c.ano, c.numero, c.expira_em,
           coalesce(nullif(btrim(l.nome), ''), 'Cliente') as nome
    from public.contratos c join public.leads l on l.id = c.lead_id
    where c.status = 'enviado' and not c.eh_teste
      and c.expira_em > p_agora and c.expira_em <= p_agora + interval '2 days'
    limit 2000
  loop
    perform public._aviso_criar(v_r.empresa_id, u.id, 'contrato_vencendo', v_r.lead_id,
      jsonb_build_object('lead_nome', v_r.nome, 'contrato_id', v_r.id,
                         'contrato', v_r.ano || '-' || lpad(v_r.numero::text, 4, '0'),
                         'expira_em', v_r.expira_em),
      'contrato_vencendo:' || v_r.id || ':' || to_char(v_r.expira_em, 'YYYYMMDDHH24MI') || ':' || u.id,
      true)
    from public.usuarios u
    where u.empresa_id = v_r.empresa_id and u.ativo and u.perfil = 'dono';
    v_venc := v_venc + 1;
  end loop;

  delete from public.contrato_codigos k where k.criado_em < p_agora - interval '1 day';
  get diagnostics v_codigos = row_count;
  return jsonb_build_object('expirados', v_exp, 'anonimizados', v_anon, 'codigos', v_codigos,
    'vencendo', v_venc);
end;
$$;

-- aviso de link vencendo some se o contrato já não está mais aberto
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
  if v_a.tipo = 'contrato_vencendo' and v_a.dados ? 'contrato_id' then
    return exists (select 1 from public.contratos c
                   where c.id = (v_a.dados ->> 'contrato_id')::uuid and c.status = 'enviado'
                     and c.expira_em > now());
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Selo na Agenda e na reserva (dono e vendedor veem só o status, da própria empresa)
-- ---------------------------------------------------------------------------------------------

create or replace function public.status_contrato_da_reserva(p_reserva uuid, p_orcamento uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.status::text from public.contratos c
  where c.empresa_id = public.empresa_do_usuario()
    and (c.reserva_id = p_reserva or (p_orcamento is not null and c.orcamento_id = p_orcamento))
    and c.status <> 'cancelado'
  order by c.criado_em desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Números: contratos enviados e assinados no período e tempo médio até assinar (dono)
--    Espelho: domain/numeros/contratos (metricasContratos), com teste de equivalência.
-- ---------------------------------------------------------------------------------------------

create or replace function public.numeros_contratos(p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_u    public.usuarios;
  v_fuso text;
  v_r    jsonb;
begin
  select * into v_u from public.usuarios u where u.id = auth.uid() and u.ativo;
  if v_u.id is null or v_u.perfil <> 'dono' then
    return null;
  end if;
  select e.fuso into v_fuso from public.empresas e where e.id = v_u.empresa_id;
  select jsonb_build_object(
    'enviados', count(*) filter (where (c.enviado_em at time zone v_fuso)::date between p_de and p_ate),
    'assinados', count(*) filter (where c.concluido_em is not null
                                    and (c.concluido_em at time zone v_fuso)::date between p_de and p_ate),
    'tempo_medio_min', round(avg(extract(epoch from (c.concluido_em - c.enviado_em)) / 60)
                         filter (where c.concluido_em is not null
                                   and (c.concluido_em at time zone v_fuso)::date between p_de and p_ate))::integer
  ) into v_r
  from public.contratos c
  where c.empresa_id = v_u.empresa_id and not c.eh_teste and c.enviado_em is not null;
  return v_r;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Demo: um contrato de exemplo já assinado (o texto vem do servidor, com o modelo infantil)
-- ---------------------------------------------------------------------------------------------

create or replace function public.demo_contrato_exemplo(p_empresa uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e    public.empresas;
  v_r    public.reservas;
  v_dono public.usuarios;
  v_id   uuid;
  v_hash text := encode(sha256(convert_to(p ->> 'texto', 'UTF8')), 'hex');
  v_env  timestamptz := now() - interval '3 days';
  v_fim  timestamptz := now() - interval '2 days';
begin
  select * into v_e from public.empresas e where e.id = p_empresa;
  if v_e.id is null or not v_e.eh_demo then
    raise exception 'DEMO_INVALIDA' using errcode = 'check_violation';
  end if;
  select * into v_r from public.reservas r
  where r.id = nullif(p ->> 'reserva_id', '')::uuid and r.empresa_id = p_empresa and r.lead_id is not null;
  if v_r.id is null then
    return null;
  end if;
  select * into v_dono from public.usuarios u where u.empresa_id = p_empresa and u.perfil = 'dono' limit 1;
  insert into public.contratos (empresa_id, ano, numero, lead_id, orcamento_id, reserva_id, modelo_origem,
    titulo, status, texto, hash, valores, variaveis, token_hash, expira_em, enviado_em, enviado_por,
    visualizado_em, concluido_em, criado_por)
  values (p_empresa, extract(year from now())::integer, 1, v_r.lead_id, v_r.orcamento_id, v_r.id,
    nullif(p ->> 'modelo_origem', ''),
    coalesce(nullif(p ->> 'titulo', ''), 'Contrato de prestação de serviços de festa infantil'), 'concluido',
    p ->> 'texto', v_hash, coalesce(p -> 'valores', '{}'::jsonb), '{}'::jsonb,
    encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
    v_env + interval '14 days', v_env, v_dono.id, v_env + interval '2 hours', v_fim, v_dono.id)
  returning id into v_id;
  insert into public.contrato_assinaturas (empresa_id, contrato_id, parte, nome, representa,
    documento_mascarado, usuario_id, assinado_em, hash_documento, metodo)
  values (p_empresa, v_id, 'buffet', v_dono.nome, v_e.nome, null, v_dono.id, v_env, v_hash, 'aceite');
  insert into public.contrato_assinaturas (empresa_id, contrato_id, parte, nome, documento_mascarado,
    assinado_em, hash_documento, metodo, codigo_verificado)
  values (p_empresa, v_id, 'cliente', coalesce(nullif(p ->> 'cliente', ''), v_r.cliente_nome),
          '***.123.456-**', v_fim, v_hash, 'aceite', false);
  -- linha do tempo do exemplo (a demo nunca gera aviso: _contrato_avisar ignora a demo)
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados, criado_em)
  values
    (p_empresa, v_dono.id, 'contrato.enviado', 'contrato', v_id, jsonb_build_object('versao', 1), v_env),
    (p_empresa, null, 'contrato.visualizado', 'contrato', v_id, jsonb_build_object('primeira', true),
     v_env + interval '2 hours'),
    (p_empresa, null, 'contrato.assinado', 'contrato', v_id,
     jsonb_build_object('parte', 'cliente', 'metodo', 'aceite'), v_fim);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Permissões
-- ---------------------------------------------------------------------------------------------

revoke all on function public._contrato_avisar() from public, anon, authenticated;
revoke all on function public.status_contrato_da_reserva(uuid, uuid) from public, anon;
grant execute on function public.status_contrato_da_reserva(uuid, uuid) to authenticated;
revoke all on function public.numeros_contratos(date, date) from public, anon;
grant execute on function public.numeros_contratos(date, date) to authenticated;
revoke all on function public.demo_contrato_exemplo(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.demo_contrato_exemplo(uuid, jsonb) to service_role;
revoke all on function public.emitir_contrato(jsonb) from public, anon;
grant execute on function public.emitir_contrato(jsonb) to authenticated;
revoke all on function public.contratos_rotina(timestamptz) from public, anon, authenticated;
grant execute on function public.contratos_rotina(timestamptz) to service_role;
revoke all on function public._aviso_email(public.tipo_aviso) from public, anon, authenticated;
