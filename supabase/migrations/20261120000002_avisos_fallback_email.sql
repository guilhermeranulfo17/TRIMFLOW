-- Ajustes da análise de 17/11/2026 · Item 2: avisos críticos não ficam só como "ignorado" (§99).
--
-- Situação: WhatsApp desligado (CANAL_DESLIGADO) e quase ninguém com push inscrito. Push só gera
-- entrega quando o usuário tem inscrição; sem ela, nada saía além do painel.
--
-- Regra nova (ESPELHO de domain/avisos/canais: TIPOS_EMAIL_RESERVA = _aviso_email_reserva):
--   pagamento_falhou, conta_suspensa e pre_reserva_vencendo têm o e-mail como reserva.
--   (a) na criação: se nenhum canal externo (push/WhatsApp) foi enfileirado, o e-mail entra já;
--   (b) na conclusão: se a entrega de push/WhatsApp termina "ignorado" ou "falhou" e nenhuma outra
--       entrega do aviso saiu ou ainda pode sair, o e-mail entra na fila.
--   O e-mail vai para o e-mail de login do próprio destinatário do aviso. Aviso de lead por
--   e-mail vai SEM dado do cliente (domain/email/modelos monta um texto genérico com o link).
--
-- O motivo de cada "ignorado" já fica em avisos_entregas.erro_codigo; o diagnóstico novo
-- (interno_entregas_resumo) agrupa por canal, status e motivo para o /interno.
-- Só expansão: funções novas e CREATE OR REPLACE das duas funções da fila (mesma assinatura).

create or replace function public._aviso_email_reserva(p_tipo public.tipo_aviso)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tipo in ('pagamento_falhou', 'conta_suspensa', 'pre_reserva_vencendo');
$$;
revoke all on function public._aviso_email_reserva(public.tipo_aviso) from public, anon, authenticated;

/**
 * Põe o e-mail na fila como reserva de um aviso crítico. Não faz nada se o tipo não tem reserva,
 * se o destinatário não tem e-mail ativo, ou se outra entrega do aviso já saiu ou ainda pode sair.
 */
create or replace function public._aviso_cair_para_email(p_aviso uuid, p_quando timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.avisos;
begin
  select * into v_a from public.avisos a where a.id = p_aviso;
  if v_a.id is null or not public._aviso_email_reserva(v_a.tipo) then
    return false;
  end if;
  if not exists (select 1 from public.usuarios u where u.id = v_a.usuario_id and u.ativo
                 and position('@' in coalesce(u.email, '')) > 1) then
    return false;
  end if;
  if exists (select 1 from public.avisos_entregas e
             where e.aviso_id = p_aviso and e.status in ('enviado', 'pendente', 'enviando')) then
    return false;
  end if;
  insert into public.avisos_entregas (empresa_id, aviso_id, canal, proximo_envio_em)
  values (v_a.empresa_id, v_a.id, 'email', coalesce(p_quando, now()))
  on conflict (aviso_id, canal) do nothing;
  return found;
end;
$$;
revoke all on function public._aviso_cair_para_email(uuid, timestamptz) from public, anon, authenticated;

-- _aviso_criar: igual à versão anterior (20261016000002), com o e-mail de reserva no fim.
create or replace function public._aviso_criar(p_empresa uuid, p_usuario uuid, p_tipo public.tipo_aviso,
  p_lead uuid, p_dados jsonb, p_chave text, p_silencio boolean default true)
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
                                  'pagamento_falhou', 'carencia', 'conta_suspensa',
                                  'boas_vindas', 'exportacao_pronta', 'exclusao_agendada');
begin
  if p_lead is not null and exists (select 1 from public.leads l where l.id = p_lead and l.eh_teste) then
    return null;
  end if;
  -- Etapa 9A: conta suspensa não recebe avisos de operação (só os de cobrança e da conta)
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
  -- Etapa 9B: avisos da conta também por e-mail (para o e-mail de login do dono)
  if public._aviso_email(p_tipo)
     and exists (select 1 from public.usuarios u where u.id = p_usuario and u.ativo
                 and u.perfil = 'dono' and position('@' in u.email) > 1) then
    insert into public.avisos_entregas (empresa_id, aviso_id, canal, proximo_envio_em)
    values (p_empresa, v_id, 'email', v_quando)
    on conflict (aviso_id, canal) do nothing;
  end if;
  -- Análise de 17/11/2026: aviso crítico sem nenhum canal externo vai por e-mail
  perform public._aviso_cair_para_email(v_id, v_quando);
  return v_id;
end;
$$;

-- concluir_entrega: igual à versão anterior, com o e-mail de reserva quando push/WhatsApp não sai.
create or replace function public.concluir_entrega(p_entrega uuid, p_resultado text,
  p_erro text default null, p_endpoints_invalidos text[] default null)
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
  if v_status in ('ignorado', 'falhou') and v_e.canal <> 'email' then
    perform public._aviso_cair_para_email(v_e.aviso_id);
  end if;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Diagnóstico (somente leitura, /interno): entregas por canal, status e motivo, nos últimos
-- p_dias, e o retrato das inscrições de push e do WhatsApp. Contas de teste fora por padrão.
-- ---------------------------------------------------------------------------------------------
create or replace function public.interno_entregas_resumo(p_dias integer default 30,
  p_incluir_teste boolean default false)
returns table (canal text, status text, motivo text, total bigint, ultima timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.canal::text, e.status::text, coalesce(e.erro_codigo, '') as motivo, count(*),
         max(e.atualizado_em)
  from public.avisos_entregas e
  where e.atualizado_em > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)))
    and (coalesce(p_incluir_teste, false) or not public._empresa_fora_das_metricas(e.empresa_id))
  group by 1, 2, 3
  order by 1, 2, 4 desc;
$$;
revoke all on function public.interno_entregas_resumo(integer, boolean) from public, anon, authenticated;
grant execute on function public.interno_entregas_resumo(integer, boolean) to service_role;

create or replace function public.interno_canais_retrato(p_incluir_teste boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'inscricoes_push', (select count(*) from public.push_inscricoes i
                        where coalesce(p_incluir_teste, false)
                           or not public._empresa_fora_das_metricas(i.empresa_id)),
    'usuarios_com_push', (select count(distinct i.usuario_id) from public.push_inscricoes i
                          where coalesce(p_incluir_teste, false)
                             or not public._empresa_fora_das_metricas(i.empresa_id)),
    'usuarios_com_whatsapp', (select count(*) from public.preferencias_avisos p
                              where p.whatsapp_ativo
                                and (coalesce(p_incluir_teste, false)
                                     or not public._empresa_fora_das_metricas(p.empresa_id))),
    'usuarios_ativos', (select count(*) from public.usuarios u
                        where u.ativo and (coalesce(p_incluir_teste, false)
                                           or not public._empresa_fora_das_metricas(u.empresa_id))));
$$;
revoke all on function public.interno_canais_retrato(boolean) from public, anon, authenticated;
grant execute on function public.interno_canais_retrato(boolean) to service_role;
