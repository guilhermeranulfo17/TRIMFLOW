-- Etapa 9B · B.4 E-mail (Resend) como canal da fila de avisos.
--
-- Avisos da conta (boas-vindas, teste acabando, fatura, pagamento, conta suspensa, exportação e
-- exclusão) ganham uma entrega 'email' para o e-mail de login do dono. Mesma fila da Etapa 7:
-- reservar_entregas (agora devolve o e-mail) → canal → concluir_entrega. A entrega é única por
-- (aviso, canal) e o aviso é único pela chave: o mesmo e-mail nunca sai duas vezes. Sem
-- RESEND_API_KEY o servidor marca a entrega como ignorada (nada quebra).
-- Tudo aditivo: o código anterior não usa o canal novo e lê reservar_entregas por nome.

/** Tipos que também vão por e-mail. Espelho: domain/avisos/canais.ts (recebeEmail). */
create or replace function public._aviso_email(p_tipo public.tipo_aviso)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tipo in ('boas_vindas', 'teste_acabando', 'fatura_criada', 'pagamento_confirmado',
                    'pagamento_falhou', 'conta_suspensa', 'exportacao_pronta', 'exclusao_agendada');
$$;

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
                      'carencia', 'conta_suspensa', 'boas_vindas', 'exportacao_pronta',
                      'exclusao_agendada')
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
  return v_id;
end;
$$;


-- reservar_entregas devolve uma coluna nova (email): muda o tipo de retorno, então drop + create.
drop function if exists public.reservar_entregas(integer);

create or replace function public.reservar_entregas(p_limite integer default 50)
returns table (
  entrega_id uuid, canal public.canal_aviso, tentativas integer, aviso_id uuid,
  tipo public.tipo_aviso, dados jsonb, lead_id uuid, agrupados integer, usuario_id uuid,
  fuso text, whatsapp_numero text, inscricoes jsonb, email text
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
      from public.push_inscricoes i where i.usuario_id = a.usuario_id), '[]'::jsonb) end,
    case when m.canal = 'email' then u.email end
  from marcadas m
  join public.avisos a on a.id = m.aviso_id
  join public.empresas emp on emp.id = a.empresa_id
  left join public.preferencias_avisos p on p.usuario_id = a.usuario_id
  left join public.usuarios u on u.id = a.usuario_id and u.ativo;
end;
$$;


revoke all on function public.reservar_entregas(integer) from public, anon, authenticated;
grant execute on function public.reservar_entregas(integer) to service_role;
revoke all on function public._aviso_email(public.tipo_aviso) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Avisos da conta: exclusão agendada, exportação feita e boas-vindas
-- ---------------------------------------------------------------------------------------------

/**
 * O dono pede a exclusão da conta: fica suspensa (somente leitura, ainda dá para exportar) e é
 * excluída de vez em 30 dias. A assinatura no Asaas é cancelada pelo servidor antes de chamar.
 */
create or replace function public.solicitar_exclusao_conta()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._lgpd_exigir_dono();
  v_e       public.empresas;
  v_quando  timestamptz := now() + interval '30 days';
begin
  perform set_config('orkestra.permitir_escrita', '1', true);
  select * into v_e from public.empresas e where e.id = v_empresa for update;
  if v_e.exclusao_agendada_para is not null then
    return v_e.exclusao_agendada_para;
  end if;
  update public.empresas set
    exclusao_solicitada_em = now(),
    exclusao_agendada_para = v_quando,
    -- reaproveita a suspensão manual (painel somente leitura); não pisa numa do /interno
    suspensa_manual_em = coalesce(suspensa_manual_em, now()),
    motivo_suspensao = case when suspensa_manual_em is null then 'exclusao_solicitada'
                            else motivo_suspensao end
  where id = v_empresa;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'conta.exclusao_solicitada', 'empresa', v_empresa,
          jsonb_build_object('exclusao_em', v_quando));
  perform public._atualizar_situacao(v_empresa);
  -- Etapa 9B · B.4: aviso (painel, push e e-mail) para todos os donos, sem esperar o silêncio
  perform public._aviso_criar(v_empresa, u.id, 'exclusao_agendada',
            null, jsonb_build_object('em', v_quando),
            'exclusao_agendada:' || v_empresa || ':' || extract(epoch from v_quando)::bigint || ':' || u.id,
            false)
  from public.usuarios u where u.empresa_id = v_empresa and u.perfil = 'dono' and u.ativo;
  return v_quando;
end;
$$;
revoke all on function public.solicitar_exclusao_conta() from public, anon;
grant execute on function public.solicitar_exclusao_conta() to authenticated;


/** Registro da exportação completa da empresa (o ZIP é montado no servidor com o RLS do dono). */
create or replace function public.lgpd_registrar_exportacao()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._lgpd_exigir_dono();
begin
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'empresa.exportada', 'empresa', v_empresa, '{}'::jsonb);
  -- Etapa 9B · B.4: aviso de segurança (painel, push e e-mail) para quem exportou. Uma por
  -- minuto no máximo (a chave inclui o minuto): baixar de novo logo em seguida não repete.
  perform public._aviso_criar(v_empresa, auth.uid(), 'exportacao_pronta', null, '{}'::jsonb,
    'exportacao_pronta:' || auth.uid() || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI'),
    false);
end;
$$;

/**
 * Boas-vindas ao dono que acabou de criar a conta (cadastro com e-mail ou com o Google), com o
 * link do buffet. Uma vez por empresa (chave), sem esperar o horário de silêncio.
 */
create or replace function public.avisar_boas_vindas()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios;
  v_e public.empresas;
begin
  select * into v_u from public.usuarios u where u.id = auth.uid() and u.ativo;
  if v_u.id is null or v_u.perfil <> 'dono' then
    return null;
  end if;
  select * into v_e from public.empresas e where e.id = v_u.empresa_id;
  return public._aviso_criar(v_e.id, v_u.id, 'boas_vindas', null,
    jsonb_build_object('buffet', v_e.nome, 'slug', v_e.slug),
    'boas_vindas:' || v_e.id, false);
end;
$$;
revoke all on function public.avisar_boas_vindas() from public, anon;
grant execute on function public.avisar_boas_vindas() to authenticated;
