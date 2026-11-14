-- Mensagem programada (§93): o vendedor deixa uma mensagem pronta para mandar ao cliente num
-- dia e hora. Na hora, o sistema avisa (painel e push) e a mensagem vai pelo WhatsApp do próprio
-- vendedor com um toque. Nunca envia nada sozinho ao cliente final. É uma tarefa com
-- mensagem_sugerida (coluna que já existe); só expansão: duas funções e um job.

/**
 * Cria a tarefa com a mensagem pronta (mesmas regras de criar_tarefa: lead da empresa, responsável
 * ativo, prazo válido, evento na linha do tempo e auditoria).
 */
create or replace function public.agendar_mensagem(
  p_lead uuid, p_titulo text, p_vence_em timestamptz, p_mensagem text,
  p_responsavel uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_lead    public.leads%rowtype;
  v_titulo  text := btrim(coalesce(p_titulo, ''));
  v_msg     text := btrim(coalesce(p_mensagem, ''));
  v_resp    uuid;
  v_id      uuid;
begin
  perform public._tarefa_validar_quando(p_vence_em);
  if char_length(v_titulo) not between 1 and 160 or char_length(v_msg) not between 1 and 1000
     or p_vence_em < now() - interval '1 day' or p_vence_em > now() + interval '2 years' then
    raise exception 'TAREFA_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  v_lead := public._lead_do_usuario(v_empresa, p_lead);
  v_resp := coalesce(p_responsavel, v_lead.responsavel_id, auth.uid());
  if not exists (select 1 from public.usuarios u where u.id = v_resp and u.empresa_id = v_empresa and u.ativo) then
    raise exception 'LEAD_USUARIO_INVALIDO' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.tarefas (empresa_id, lead_id, titulo, responsavel_id, vence_em, origem,
    mensagem_sugerida, criado_por)
  values (v_empresa, p_lead, v_titulo, v_resp, p_vence_em, 'manual', v_msg, auth.uid())
  returning id into v_id;
  perform public._lead_aplicar_evento(p_lead, 'tarefa_criada', null, 'usuario', auth.uid(),
    jsonb_build_object('tarefa_id', v_id, 'titulo', v_titulo, 'vence_em', p_vence_em,
                       'mensagem', true));
  perform public._auditar_lead(v_empresa, 'tarefa.criada', 'tarefa', v_id,
    jsonb_build_object('lead_id', p_lead, 'titulo', v_titulo, 'vence_em', p_vence_em,
                       'responsavel_id', v_resp, 'mensagem', true));
  return v_id;
end;
$$;

revoke all on function public.agendar_mensagem(uuid, text, timestamptz, text, uuid) from public, anon;
grant execute on function public.agendar_mensagem(uuid, text, timestamptz, text, uuid) to authenticated;

/**
 * Job (5 em 5 min): mensagem programada que chegou na hora vira aviso para o responsável. A chave
 * leva o vencimento: adiar a tarefa gera um aviso novo na nova hora. Demo e lead de teste fora
 * (_aviso_criar ignora lead de teste).
 */
create or replace function public.gerar_avisos_mensagens()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
  v_n integer := 0;
begin
  for v_t in
    select t.id, t.empresa_id, t.lead_id, t.responsavel_id, t.vence_efetivo, l.nome as lead_nome
    from public.tarefas t
    join public.leads l on l.id = t.lead_id
    join public.empresas e on e.id = t.empresa_id
    where t.mensagem_sugerida is not null and t.origem = 'manual'
      and t.feita_em is null and t.cancelada_em is null and t.responsavel_id is not null
      and t.vence_efetivo <= now() and t.vence_efetivo > now() - interval '1 day'
      and not e.eh_demo
  loop
    if public._aviso_criar(v_t.empresa_id, v_t.responsavel_id, 'mensagem_programada', v_t.lead_id,
         jsonb_build_object('lead_nome', v_t.lead_nome, 'tarefa_id', v_t.id,
                            'vence_em', v_t.vence_efetivo),
         'mensagem:' || v_t.id || ':' || extract(epoch from v_t.vence_efetivo)::bigint) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.gerar_avisos_mensagens() from public, anon, authenticated;
grant execute on function public.gerar_avisos_mensagens() to service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: aviso de mensagem programada não agendado.';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.schedule('orkestra-avisos-mensagens', '*/5 * * * *',
                        'select public.gerar_avisos_mensagens()');
end;
$$;
