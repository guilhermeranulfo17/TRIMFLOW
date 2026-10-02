-- Etapa 6 · Ações do vendedor, tarefas, visitas e a caixa priorizada.
--
-- Mesmo padrão das etapas anteriores: security definer, search_path vazio, auditoria e códigos
-- de erro estáveis. Nenhuma escrita direta nas tabelas (leads, notas, tarefas, visitas,
-- reservas): só por estas funções. Nenhuma assinatura existente muda.
-- Ordem de trava quando lead e agenda estão envolvidos: SEMPRE agenda (advisory) e depois lead.

-- ---------------------------------------------------------------------------
-- Regras puras (espelhos em src/domain, com teste de equivalência)
-- ---------------------------------------------------------------------------

/** Espelho: domain/publico/status-lead.ts (transicaoLead). Eventos novos da Etapa 6 no fim. */
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
      when 'orcamento_criado' then
        case when p_status in ('pre_reservado', 'reservado') then p_status::text
             else 'em_andamento' end
      when 'versao_criada' then
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
      when 'orcamento_expirado' then
        case when p_status = 'em_andamento' then 'frio' else p_status::text end
      -- Etapa 6: o vendedor falou com o cliente (ou confirmou uma visita com ele)
      when 'contato_registrado' then
        case when p_status in ('novo', 'abandonou', 'frio') then 'em_andamento' else p_status::text end
      when 'visita_confirmada' then
        case when p_status in ('novo', 'abandonou', 'frio') then 'em_andamento' else p_status::text end
      when 'perdido' then 'perdido'
      else p_status::text
    end)::public.status_lead,
    (case
      when p_evento in ('pre_reserva_pedida', 'visita_pedida', 'visita_confirmada') then 'quente'
      when p_evento in ('orcamento_concluido', 'orcamento_criado', 'versao_criada')
           and p_temperatura <> 'quente' then 'morno'
      else p_temperatura::text
    end)::public.temperatura_lead;
$$;

/** Reabrir um perdido. Espelho: domain/publico/status-lead.ts (statusAoReabrir). */
create or replace function public._lead_status_reaberto(p_antes public.status_lead)
returns public.status_lead
language sql
immutable
set search_path = ''
as $$
  select (case
    -- a pré-reserva foi cancelada ao perder: o horário pode já estar ocupado
    when p_antes in ('novo', 'em_andamento', 'abandonou', 'frio') then p_antes::text
    else 'em_andamento'
  end)::public.status_lead;
$$;

/** Lead aberto sem nenhuma ação há 7 dias fica frio. Espelho: domain/leads/temperatura.ts. */
create or replace function public._temperatura_inatividade(
  p_status public.status_lead, p_atual public.temperatura_lead, p_ultima timestamptz,
  p_agora timestamptz
)
returns public.temperatura_lead
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status in ('novo', 'em_andamento', 'abandonou', 'frio', 'pre_reservado')
         and p_ultima <= p_agora - interval '7 days' then 'frio'
    else p_atual
  end::public.temperatura_lead;
$$;

/**
 * Grupo da caixa (1 = mais urgente). Espelho: domain/leads/prioridade.ts (grupoDoLead).
 *   1 pré-reserva ativa · 2 visita pedida ou confirmada até amanhã · 3 tarefa atrasada ou de hoje
 *   4 quente · 5 novo sem contato · 6 em andamento com próximo contato vencido
 *   7 demais abertos · 8 reservado, realizado, perdido e cancelado (fora da caixa padrão)
 */
create or replace function public._lead_grupo(
  p_status public.status_lead, p_temperatura public.temperatura_lead,
  p_pre_expira timestamptz, p_visita_pedida boolean, p_visita_proxima timestamptz,
  p_tarefa_vence timestamptz, p_primeiro_contato timestamptz, p_proximo_contato timestamptz,
  p_agora timestamptz, p_fim_hoje timestamptz, p_fim_amanha timestamptz
)
returns integer
language sql
immutable
-- sem SET search_path: assim o planner embute a função em caixa_leads (só expressões e
-- tipos qualificados, nenhuma tabela)
as $$
  select case
    when p_status in ('reservado', 'realizado', 'perdido', 'cancelado') then 8
    when p_pre_expira is not null and p_pre_expira > p_agora then 1
    when coalesce(p_visita_pedida, false)
         or (p_visita_proxima is not null and p_visita_proxima < p_fim_amanha) then 2
    when p_tarefa_vence is not null and p_tarefa_vence < p_fim_hoje then 3
    when p_temperatura = 'quente' then 4
    when p_status = 'novo' and p_primeiro_contato is null then 5
    when p_status = 'em_andamento' and p_proximo_contato is not null
         and p_proximo_contato <= p_agora then 6
    else 7
  end;
$$;

/** Chave de ordem dentro do grupo (crescente). Espelho: domain/leads/prioridade.ts (ordemNoGrupo). */
create or replace function public._lead_ordem(
  p_grupo integer, p_pre_expira timestamptz, p_visita_ref timestamptz, p_tarefa_vence timestamptz,
  p_proximo_contato timestamptz, p_criado timestamptz, p_ultima_atividade timestamptz
)
returns double precision
language sql
immutable
-- sem SET search_path: assim o planner embute a função em caixa_leads (só expressões e
-- tipos qualificados, nenhuma tabela)
as $$
  select case p_grupo
    when 1 then extract(epoch from p_pre_expira)          -- vence primeiro no topo
    when 2 then extract(epoch from p_visita_ref)          -- pedido mais antigo / visita mais próxima
    when 3 then extract(epoch from p_tarefa_vence)        -- mais atrasada primeiro
    when 5 then extract(epoch from p_criado)              -- quem espera há mais tempo
    when 6 then extract(epoch from p_proximo_contato)     -- mais vencido primeiro
    else -extract(epoch from p_ultima_atividade)          -- quente e demais: mais recente primeiro
  end::double precision;
$$;

-- ---------------------------------------------------------------------------
-- Núcleo: _lead_aplicar_evento (mesma assinatura) agora também
--   · cancela as tarefas abertas quando o lead vira perdido, reservado ou realizado;
--   · limpa os dados da perda quando o lead sai de "perdido";
--   · registra a ação do vendedor (primeiro contato, última ação e responsável, se vazio).
-- ---------------------------------------------------------------------------
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
  v_acao  boolean := p_autor = 'usuario' and p_usuario is not null
                     and p_evento <> 'responsavel_alterado';
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
    ultima_atividade_em = case when p_autor = 'sistema' then ultima_atividade_em else now() end,
    primeiro_contato_em = case when v_acao then coalesce(primeiro_contato_em, now()) else primeiro_contato_em end,
    ultima_acao_vendedor_em = case when v_acao then now() else ultima_acao_vendedor_em end,
    responsavel_id = case
      when v_acao and responsavel_id is null
           and exists (select 1 from public.usuarios u
                       where u.id = p_usuario and u.empresa_id = v_lead.empresa_id and u.ativo)
        then p_usuario
      else responsavel_id end,
    -- saiu de "perdido" (reaberto ou o cliente voltou): a perda deixa de valer
    perdido_em = case when v_lead.status = 'perdido' and v_novo.status <> 'perdido' then null else perdido_em end,
    motivo_perda_codigo = case when v_lead.status = 'perdido' and v_novo.status <> 'perdido' then null else motivo_perda_codigo end,
    motivo_perda = case when v_lead.status = 'perdido' and v_novo.status <> 'perdido' then null else motivo_perda end,
    status_antes_de_perder = case when v_lead.status = 'perdido' and v_novo.status <> 'perdido' then null else status_antes_de_perder end
  where id = p_lead;

  if v_novo.status <> v_lead.status and v_novo.status in ('perdido', 'reservado', 'realizado') then
    update public.tarefas set cancelada_em = now()
    where lead_id = p_lead and feita_em is null and cancelada_em is null;
  end if;

  insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, usuario_id)
  values (v_lead.empresa_id, p_lead, p_orcamento, v_tipo, v_dados, p_autor, p_usuario);
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers de acesso (dono e vendedor ativos da empresa)
-- ---------------------------------------------------------------------------
create or replace function public._leads_exigir_usuario()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
begin
  if v_empresa is null or public.perfil_do_usuario() is null then
    raise exception 'LEAD_SEM_PERMISSAO' using errcode = 'insufficient_privilege';
  end if;
  return v_empresa;
end;
$$;

/** Trava o lead da empresa do usuário (for update) ou LEAD_NAO_ENCONTRADO. */
create or replace function public._lead_do_usuario(p_empresa uuid, p_lead uuid)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
begin
  select * into v_lead from public.leads l
  where l.id = p_lead and l.empresa_id = p_empresa for update;
  if v_lead.id is null then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  return v_lead;
end;
$$;

create or replace function public._auditar_lead(
  p_empresa uuid, p_acao text, p_entidade text, p_id uuid, p_dados jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (p_empresa, auth.uid(), p_acao, p_entidade, p_id, coalesce(p_dados, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Contato, dados do lead, responsável e mensagem pronta
-- ---------------------------------------------------------------------------
create or replace function public.registrar_contato(
  p_lead uuid, p_canal public.canal_contato, p_resumo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_resumo  text := nullif(btrim(coalesce(p_resumo, '')), '');
begin
  if p_canal is null or char_length(coalesce(v_resumo, '')) > 500 then
    raise exception 'LEAD_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  perform public._lead_do_usuario(v_empresa, p_lead);
  perform public._lead_aplicar_evento(p_lead, 'contato_registrado', null, 'usuario', auth.uid(),
    jsonb_build_object('canal', p_canal, 'resumo', v_resumo));
  perform public._auditar_lead(v_empresa, 'lead.contato_registrado', 'lead', p_lead,
    jsonb_build_object('canal', p_canal));
end;
$$;

create or replace function public.atualizar_dados_lead(p_lead uuid, p_nome text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_lead    public.leads%rowtype;
  v_nome    text := btrim(coalesce(p_nome, ''));
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if char_length(v_nome) not between 1 and 120
     or (v_email is not null and (char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')) then
    raise exception 'LEAD_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  v_lead := public._lead_do_usuario(v_empresa, p_lead);
  update public.leads set nome = v_nome, email = v_email where id = p_lead;
  perform public._auditar_lead(v_empresa, 'lead.dados_alterados', 'lead', p_lead,
    jsonb_build_object('antes', jsonb_build_object('nome', v_lead.nome, 'email', v_lead.email),
                       'depois', jsonb_build_object('nome', v_nome, 'email', v_email)));
end;
$$;

/** Dono atribui a qualquer usuário ativo; vendedor só assume para si. */
create or replace function public.atribuir_responsavel(p_lead uuid, p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_lead    public.leads%rowtype;
  v_nome    text;
begin
  if public.perfil_do_usuario() <> 'dono' and p_usuario is distinct from auth.uid() then
    raise exception 'LEAD_SO_ASSUMIR' using errcode = 'insufficient_privilege';
  end if;
  select u.nome into v_nome from public.usuarios u
  where u.id = p_usuario and u.empresa_id = v_empresa and u.ativo;
  if v_nome is null then
    raise exception 'LEAD_USUARIO_INVALIDO' using errcode = 'invalid_parameter_value';
  end if;
  v_lead := public._lead_do_usuario(v_empresa, p_lead);
  if v_lead.responsavel_id is not distinct from p_usuario then
    return;
  end if;
  update public.leads set responsavel_id = p_usuario where id = p_lead;
  perform public._lead_aplicar_evento(p_lead, 'responsavel_alterado', null, 'usuario', auth.uid(),
    jsonb_build_object('de', v_lead.responsavel_id, 'para', p_usuario, 'para_nome', v_nome));
  perform public._auditar_lead(v_empresa, 'lead.responsavel_alterado', 'lead', p_lead,
    jsonb_build_object('antes', v_lead.responsavel_id, 'depois', p_usuario));
end;
$$;

/** O vendedor abriu o WhatsApp com uma mensagem pronta (nada é enviado automaticamente). */
create or replace function public.registrar_mensagem(
  p_lead uuid, p_situacao text, p_tarefa uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
begin
  if p_situacao is null or p_situacao !~ '^[a-z_]{1,40}$' then
    raise exception 'LEAD_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  perform public._lead_do_usuario(v_empresa, p_lead);
  if p_tarefa is not null and not exists (
    select 1 from public.tarefas t where t.id = p_tarefa and t.lead_id = p_lead) then
    raise exception 'TAREFA_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  perform public._lead_aplicar_evento(p_lead, 'mensagem_copiada', null, 'usuario', auth.uid(),
    jsonb_build_object('situacao', p_situacao, 'tarefa_id', p_tarefa));
end;
$$;

-- ---------------------------------------------------------------------------
-- Notas
-- ---------------------------------------------------------------------------
create or replace function public.adicionar_nota(p_lead uuid, p_texto text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_texto   text := btrim(coalesce(p_texto, ''));
  v_id      uuid;
begin
  if char_length(v_texto) not between 1 and 2000 then
    raise exception 'NOTA_TEXTO_INVALIDO' using errcode = 'invalid_parameter_value';
  end if;
  perform public._lead_do_usuario(v_empresa, p_lead);
  insert into public.notas (empresa_id, lead_id, autor_id, texto)
  values (v_empresa, p_lead, auth.uid(), v_texto)
  returning id into v_id;
  perform public._lead_aplicar_evento(p_lead, 'nota', null, 'usuario', auth.uid(),
    jsonb_build_object('nota_id', v_id, 'trecho', left(v_texto, 140)));
  perform public._auditar_lead(v_empresa, 'nota.criada', 'nota', v_id,
    jsonb_build_object('lead_id', p_lead));
  return v_id;
end;
$$;

create or replace function public._nota_do_usuario(p_empresa uuid, p_nota uuid, p_apagar boolean)
returns public.notas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota public.notas%rowtype;
begin
  select * into v_nota from public.notas n
  where n.id = p_nota and n.empresa_id = p_empresa for update;
  if v_nota.id is null then
    raise exception 'NOTA_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  -- o dono apaga qualquer nota; editar e apagar a própria só em até 24h
  if p_apagar and public.perfil_do_usuario() = 'dono' then
    return v_nota;
  end if;
  if v_nota.autor_id is distinct from auth.uid() then
    raise exception 'NOTA_SO_AUTOR' using errcode = 'insufficient_privilege';
  end if;
  if v_nota.criado_em < now() - interval '24 hours' then
    raise exception 'NOTA_PRAZO_ENCERRADO' using errcode = 'check_violation';
  end if;
  return v_nota;
end;
$$;

create or replace function public.editar_nota(p_nota uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_nota    public.notas%rowtype;
  v_texto   text := btrim(coalesce(p_texto, ''));
begin
  if char_length(v_texto) not between 1 and 2000 then
    raise exception 'NOTA_TEXTO_INVALIDO' using errcode = 'invalid_parameter_value';
  end if;
  v_nota := public._nota_do_usuario(v_empresa, p_nota, false);
  update public.notas set texto = v_texto, editado_em = now() where id = p_nota;
  update public.atividades a set dados = a.dados || jsonb_build_object('trecho', left(v_texto, 140))
  where a.lead_id = v_nota.lead_id and a.tipo = 'nota' and a.dados ->> 'nota_id' = p_nota::text;
  perform public._auditar_lead(v_empresa, 'nota.editada', 'nota', p_nota,
    jsonb_build_object('antes', v_nota.texto, 'depois', v_texto));
end;
$$;

create or replace function public.apagar_nota(p_nota uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_nota    public.notas%rowtype;
begin
  v_nota := public._nota_do_usuario(v_empresa, p_nota, true);
  delete from public.atividades a
  where a.lead_id = v_nota.lead_id and a.tipo = 'nota' and a.dados ->> 'nota_id' = p_nota::text;
  delete from public.notas where id = p_nota;
  perform public._auditar_lead(v_empresa, 'nota.apagada', 'nota', p_nota,
    jsonb_build_object('lead_id', v_nota.lead_id, 'autor_id', v_nota.autor_id, 'texto', v_nota.texto));
end;
$$;

-- ---------------------------------------------------------------------------
-- Tarefas (manuais; a Etapa 7 cria por regra usando o índice único por regra aberta)
-- ---------------------------------------------------------------------------
create or replace function public._tarefa_do_usuario(p_empresa uuid, p_tarefa uuid)
returns public.tarefas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tarefas%rowtype;
begin
  select * into v_t from public.tarefas t
  where t.id = p_tarefa and t.empresa_id = p_empresa for update;
  if v_t.id is null then
    raise exception 'TAREFA_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  return v_t;
end;
$$;

create or replace function public._tarefa_validar_quando(p_quando timestamptz)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_quando is null then
    raise exception 'TAREFA_DATA_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

create or replace function public.criar_tarefa(
  p_lead uuid, p_titulo text, p_vence_em timestamptz, p_descricao text default null,
  p_responsavel uuid default null, p_orcamento uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_lead    public.leads%rowtype;
  v_titulo  text := btrim(coalesce(p_titulo, ''));
  v_desc    text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_resp    uuid;
  v_id      uuid;
begin
  perform public._tarefa_validar_quando(p_vence_em);
  if char_length(v_titulo) not between 1 and 160 or char_length(coalesce(v_desc, '')) > 1000
     or p_vence_em < now() - interval '1 day' or p_vence_em > now() + interval '2 years' then
    raise exception 'TAREFA_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  v_lead := public._lead_do_usuario(v_empresa, p_lead);
  v_resp := coalesce(p_responsavel, v_lead.responsavel_id, auth.uid());
  if not exists (select 1 from public.usuarios u where u.id = v_resp and u.empresa_id = v_empresa and u.ativo) then
    raise exception 'LEAD_USUARIO_INVALIDO' using errcode = 'invalid_parameter_value';
  end if;
  if p_orcamento is not null and not exists (
    select 1 from public.orcamentos o where o.id = p_orcamento and o.lead_id = p_lead) then
    raise exception 'ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  insert into public.tarefas (empresa_id, lead_id, orcamento_id, titulo, descricao, responsavel_id,
    vence_em, origem, criado_por)
  values (v_empresa, p_lead, p_orcamento, v_titulo, v_desc, v_resp, p_vence_em, 'manual', auth.uid())
  returning id into v_id;
  perform public._lead_aplicar_evento(p_lead, 'tarefa_criada', p_orcamento, 'usuario', auth.uid(),
    jsonb_build_object('tarefa_id', v_id, 'titulo', v_titulo, 'vence_em', p_vence_em));
  perform public._auditar_lead(v_empresa, 'tarefa.criada', 'tarefa', v_id,
    jsonb_build_object('lead_id', p_lead, 'titulo', v_titulo, 'vence_em', p_vence_em,
                       'responsavel_id', v_resp));
  return v_id;
end;
$$;

create or replace function public.concluir_tarefa(p_tarefa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_t       public.tarefas%rowtype;
begin
  v_t := public._tarefa_do_usuario(v_empresa, p_tarefa);
  if v_t.feita_em is not null or v_t.cancelada_em is not null then
    raise exception 'TAREFA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  perform public._lead_do_usuario(v_empresa, v_t.lead_id);
  update public.tarefas set feita_em = now(), feita_por = auth.uid() where id = p_tarefa;
  if v_t.regra = 'proximo_contato' then
    update public.leads set proximo_contato_em = null where id = v_t.lead_id;
  end if;
  perform public._lead_aplicar_evento(v_t.lead_id, 'tarefa_feita', v_t.orcamento_id, 'usuario',
    auth.uid(), jsonb_build_object('tarefa_id', p_tarefa, 'titulo', v_t.titulo));
  perform public._auditar_lead(v_empresa, 'tarefa.concluida', 'tarefa', p_tarefa,
    jsonb_build_object('lead_id', v_t.lead_id));
end;
$$;

create or replace function public.adiar_tarefa(p_tarefa uuid, p_para timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_t       public.tarefas%rowtype;
begin
  perform public._tarefa_validar_quando(p_para);
  if p_para <= now() or p_para > now() + interval '2 years' then
    raise exception 'TAREFA_DATA_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
  v_t := public._tarefa_do_usuario(v_empresa, p_tarefa);
  if v_t.feita_em is not null or v_t.cancelada_em is not null then
    raise exception 'TAREFA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  update public.tarefas set adiada_para = p_para where id = p_tarefa;
  if v_t.regra = 'proximo_contato' then
    update public.leads set proximo_contato_em = p_para where id = v_t.lead_id;
  end if;
  perform public._auditar_lead(v_empresa, 'tarefa.adiada', 'tarefa', p_tarefa,
    jsonb_build_object('lead_id', v_t.lead_id, 'antes', coalesce(v_t.adiada_para, v_t.vence_em),
                       'depois', p_para));
end;
$$;

create or replace function public.reabrir_tarefa(p_tarefa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_t       public.tarefas%rowtype;
begin
  v_t := public._tarefa_do_usuario(v_empresa, p_tarefa);
  if v_t.feita_em is null and v_t.cancelada_em is null then
    raise exception 'TAREFA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  begin
    update public.tarefas set feita_em = null, feita_por = null, cancelada_em = null
    where id = p_tarefa;
  exception when unique_violation then
    raise exception 'TAREFA_DUPLICADA' using errcode = 'unique_violation';
  end;
  perform public._auditar_lead(v_empresa, 'tarefa.reaberta', 'tarefa', p_tarefa,
    jsonb_build_object('lead_id', v_t.lead_id));
end;
$$;

create or replace function public.cancelar_tarefa(p_tarefa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_t       public.tarefas%rowtype;
begin
  v_t := public._tarefa_do_usuario(v_empresa, p_tarefa);
  if v_t.feita_em is not null or v_t.cancelada_em is not null then
    raise exception 'TAREFA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  update public.tarefas set cancelada_em = now() where id = p_tarefa;
  if v_t.regra = 'proximo_contato' then
    update public.leads set proximo_contato_em = null where id = v_t.lead_id;
  end if;
  perform public._auditar_lead(v_empresa, 'tarefa.cancelada', 'tarefa', p_tarefa,
    jsonb_build_object('lead_id', v_t.lead_id));
end;
$$;

/** Próximo contato: grava a data e cria (ou move) a tarefa "Falar com {nome}". */
create or replace function public.definir_proximo_contato(p_lead uuid, p_quando timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_lead    public.leads%rowtype;
  v_id      uuid;
begin
  perform public._tarefa_validar_quando(p_quando);
  if p_quando <= now() or p_quando > now() + interval '2 years' then
    raise exception 'TAREFA_DATA_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
  v_lead := public._lead_do_usuario(v_empresa, p_lead);
  update public.leads set proximo_contato_em = p_quando where id = p_lead;
  select t.id into v_id from public.tarefas t
  where t.lead_id = p_lead and t.regra = 'proximo_contato'
    and t.feita_em is null and t.cancelada_em is null
  for update;
  if v_id is not null then
    update public.tarefas set vence_em = p_quando, adiada_para = null,
      titulo = left('Falar com ' || v_lead.nome, 160)
    where id = v_id;
  else
    insert into public.tarefas (empresa_id, lead_id, titulo, responsavel_id, vence_em, origem,
      regra, criado_por)
    values (v_empresa, p_lead, left('Falar com ' || v_lead.nome, 160),
      coalesce(v_lead.responsavel_id, auth.uid()), p_quando, 'manual', 'proximo_contato', auth.uid())
    returning id into v_id;
    perform public._lead_aplicar_evento(p_lead, 'tarefa_criada', null, 'usuario', auth.uid(),
      jsonb_build_object('tarefa_id', v_id, 'titulo', 'Falar com ' || v_lead.nome,
                         'vence_em', p_quando, 'proximo_contato', true));
  end if;
  perform public._auditar_lead(v_empresa, 'lead.proximo_contato', 'lead', p_lead,
    jsonb_build_object('antes', v_lead.proximo_contato_em, 'depois', p_quando, 'tarefa_id', v_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perdido e reabrir
-- ---------------------------------------------------------------------------
create or replace function public.marcar_perdido(
  p_lead uuid, p_codigo public.motivo_perda, p_detalhe text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_lead    public.leads%rowtype;
  v_detalhe text := nullif(btrim(coalesce(p_detalhe, '')), '');
  v_r       record;
begin
  if p_codigo is null or char_length(coalesce(v_detalhe, '')) > 300 then
    raise exception 'LEAD_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  if p_codigo = 'outro' and v_detalhe is null then
    raise exception 'LEAD_MOTIVO_OBRIGATORIO' using errcode = 'invalid_parameter_value';
  end if;
  -- agenda antes do lead (mesma ordem de confirmar_reserva): concorrência sem deadlock
  perform public._agenda_travar(v_empresa);
  v_lead := public._lead_do_usuario(v_empresa, p_lead);
  if v_lead.status = 'reservado' or exists (
    select 1 from public.reservas r
    where r.lead_id = p_lead and r.status = 'ativa' and r.tipo = 'confirmada') then
    raise exception 'LEAD_RESERVADO_NAO_PERDE' using errcode = 'check_violation';
  end if;
  if v_lead.status not in ('novo', 'em_andamento', 'abandonou', 'frio', 'pre_reservado') then
    raise exception 'LEAD_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;

  -- pré-reserva ativa: cancelada com o motivo (o horário fica livre)
  for v_r in
    select r.* from public.reservas r
    where r.lead_id = p_lead and r.status = 'ativa' and r.tipo = 'pre_reserva'
    for update
  loop
    update public.reservas set status = 'cancelada', cancelada_por = auth.uid(),
      cancelada_em = now(), motivo_cancelamento = 'Lead marcado como perdido'
    where id = v_r.id;
    perform public._auditar_lead(v_empresa, 'reserva.cancelada', 'reserva', v_r.id,
      jsonb_build_object('tipo', v_r.tipo, 'motivo', 'Lead marcado como perdido'));
    perform public._lead_aplicar_evento(p_lead, 'pre_reserva_cancelada', v_r.orcamento_id,
      'usuario', auth.uid(), jsonb_build_object('reserva_id', v_r.id, 'data', v_r.data,
        'tipo', v_r.tipo, 'motivo', 'Lead marcado como perdido'));
  end loop;

  update public.leads set
    motivo_perda_codigo = p_codigo, motivo_perda = v_detalhe, perdido_em = now(),
    status_antes_de_perder = v_lead.status
  where id = p_lead;
  perform public._lead_aplicar_evento(p_lead, 'perdido', null, 'usuario', auth.uid(),
    jsonb_build_object('motivo', p_codigo, 'detalhe', v_detalhe, 'status_antes', v_lead.status));
  perform public._auditar_lead(v_empresa, 'lead.perdido', 'lead', p_lead,
    jsonb_build_object('motivo', p_codigo, 'detalhe', v_detalhe, 'status_antes', v_lead.status));
end;
$$;

create or replace function public.reabrir_lead(p_lead uuid)
returns public.status_lead
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_lead    public.leads%rowtype;
  v_novo    public.status_lead;
begin
  v_lead := public._lead_do_usuario(v_empresa, p_lead);
  if v_lead.status <> 'perdido' then
    raise exception 'LEAD_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  v_novo := public._lead_status_reaberto(coalesce(v_lead.status_antes_de_perder, 'em_andamento'));
  update public.leads set status = v_novo, perdido_em = null, motivo_perda_codigo = null,
    motivo_perda = null, status_antes_de_perder = null
  where id = p_lead;
  perform public._lead_aplicar_evento(p_lead, 'reaberto', null, 'usuario', auth.uid(),
    jsonb_build_object('status_antes', 'perdido', 'status_depois', v_novo,
                       'motivo_anterior', v_lead.motivo_perda_codigo));
  perform public._auditar_lead(v_empresa, 'lead.reaberto', 'lead', p_lead,
    jsonb_build_object('status_depois', v_novo));
  return v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visitas
-- ---------------------------------------------------------------------------
create or replace function public._visita_periodo(p_data_hora timestamptz, p_fuso text)
returns public.periodo_visita
language sql
stable
set search_path = ''
as $$
  select (case
    when extract(hour from p_data_hora at time zone p_fuso) < 12 then 'manha'
    when extract(hour from p_data_hora at time zone p_fuso) < 18 then 'tarde'
    else 'noite'
  end)::public.periodo_visita;
$$;

create or replace function public._visita_do_usuario(p_empresa uuid, p_visita uuid)
returns public.visitas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_v public.visitas%rowtype;
begin
  select * into v_v from public.visitas v
  where v.id = p_visita and v.empresa_id = p_empresa for update;
  if v_v.id is null then
    raise exception 'VISITA_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  return v_v;
end;
$$;

create or replace function public._visita_validar_quando(p_data_hora timestamptz)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_data_hora is null or p_data_hora < now() - interval '1 hour'
     or p_data_hora > now() + interval '1 year' then
    raise exception 'VISITA_DATA_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

/** Visita criada direto pelo vendedor (já combinada com o cliente). */
create or replace function public.agendar_visita(
  p_lead uuid, p_data_hora timestamptz, p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_fuso    text;
  v_obs     text := nullif(btrim(coalesce(p_observacoes, '')), '');
  v_id      uuid;
begin
  perform public._visita_validar_quando(p_data_hora);
  if char_length(coalesce(v_obs, '')) > 500 then
    raise exception 'VISITA_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  perform public._lead_do_usuario(v_empresa, p_lead);
  select e.fuso into v_fuso from public.empresas e where e.id = v_empresa;
  insert into public.visitas (empresa_id, lead_id, data_preferida, periodo, observacoes, status,
    data_hora, confirmada_por, confirmada_em, criado_por)
  values (v_empresa, p_lead, (p_data_hora at time zone v_fuso)::date,
    public._visita_periodo(p_data_hora, v_fuso), v_obs, 'confirmada', p_data_hora, auth.uid(),
    now(), auth.uid())
  returning id into v_id;
  perform public._lead_aplicar_evento(p_lead, 'visita_confirmada', null, 'usuario', auth.uid(),
    jsonb_build_object('visita_id', v_id, 'data_hora', p_data_hora));
  perform public._auditar_lead(v_empresa, 'visita.agendada', 'visita', v_id,
    jsonb_build_object('lead_id', p_lead, 'data_hora', p_data_hora));
  return v_id;
end;
$$;

/** Confirma (com dia e hora) um pedido de visita vindo do link. */
create or replace function public.confirmar_visita(p_visita uuid, p_data_hora timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_v       public.visitas%rowtype;
  v_fuso    text;
begin
  perform public._visita_validar_quando(p_data_hora);
  v_v := public._visita_do_usuario(v_empresa, p_visita);
  if v_v.status <> 'solicitada' then
    raise exception 'VISITA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  perform public._lead_do_usuario(v_empresa, v_v.lead_id);
  select e.fuso into v_fuso from public.empresas e where e.id = v_empresa;
  update public.visitas set status = 'confirmada', data_hora = p_data_hora,
    data_preferida = (p_data_hora at time zone v_fuso)::date,
    periodo = public._visita_periodo(p_data_hora, v_fuso),
    confirmada_por = auth.uid(), confirmada_em = now()
  where id = p_visita;
  perform public._lead_aplicar_evento(v_v.lead_id, 'visita_confirmada', v_v.orcamento_id, 'usuario',
    auth.uid(), jsonb_build_object('visita_id', p_visita, 'data_hora', p_data_hora));
  perform public._auditar_lead(v_empresa, 'visita.confirmada', 'visita', p_visita,
    jsonb_build_object('lead_id', v_v.lead_id, 'data_hora', p_data_hora));
end;
$$;

create or replace function public.remarcar_visita(p_visita uuid, p_data_hora timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_v       public.visitas%rowtype;
  v_fuso    text;
begin
  perform public._visita_validar_quando(p_data_hora);
  v_v := public._visita_do_usuario(v_empresa, p_visita);
  if v_v.status <> 'confirmada' then
    raise exception 'VISITA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  perform public._lead_do_usuario(v_empresa, v_v.lead_id);
  select e.fuso into v_fuso from public.empresas e where e.id = v_empresa;
  update public.visitas set data_hora = p_data_hora,
    data_preferida = (p_data_hora at time zone v_fuso)::date,
    periodo = public._visita_periodo(p_data_hora, v_fuso)
  where id = p_visita;
  perform public._lead_aplicar_evento(v_v.lead_id, 'visita_confirmada', v_v.orcamento_id, 'usuario',
    auth.uid(), jsonb_build_object('visita_id', p_visita, 'data_hora', p_data_hora,
                                   'remarcada', true, 'antes', v_v.data_hora));
  perform public._auditar_lead(v_empresa, 'visita.remarcada', 'visita', p_visita,
    jsonb_build_object('lead_id', v_v.lead_id, 'antes', v_v.data_hora, 'depois', p_data_hora));
end;
$$;

create or replace function public.cancelar_visita(p_visita uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_v       public.visitas%rowtype;
  v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if char_length(coalesce(v_motivo, '')) > 300 then
    raise exception 'VISITA_DADOS_INVALIDOS' using errcode = 'invalid_parameter_value';
  end if;
  v_v := public._visita_do_usuario(v_empresa, p_visita);
  if v_v.status not in ('solicitada', 'confirmada') then
    raise exception 'VISITA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  perform public._lead_do_usuario(v_empresa, v_v.lead_id);
  update public.visitas set status = 'cancelada', cancelada_em = now(), motivo_cancelamento = v_motivo
  where id = p_visita;
  perform public._lead_aplicar_evento(v_v.lead_id, 'visita_cancelada', v_v.orcamento_id, 'usuario',
    auth.uid(), jsonb_build_object('visita_id', p_visita, 'motivo', v_motivo));
  perform public._auditar_lead(v_empresa, 'visita.cancelada', 'visita', p_visita,
    jsonb_build_object('lead_id', v_v.lead_id, 'motivo', v_motivo));
end;
$$;

create or replace function public.marcar_visita_realizada(p_visita uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._leads_exigir_usuario();
  v_v       public.visitas%rowtype;
begin
  v_v := public._visita_do_usuario(v_empresa, p_visita);
  if v_v.status <> 'confirmada' then
    raise exception 'VISITA_ESTADO_INVALIDO' using errcode = 'check_violation';
  end if;
  perform public._lead_do_usuario(v_empresa, v_v.lead_id);
  update public.visitas set status = 'realizada', realizada_em = now() where id = p_visita;
  perform public._lead_aplicar_evento(v_v.lead_id, 'visita_realizada', v_v.orcamento_id, 'usuario',
    auth.uid(), jsonb_build_object('visita_id', p_visita));
  perform public._auditar_lead(v_empresa, 'visita.realizada', 'visita', p_visita,
    jsonb_build_object('lead_id', v_v.lead_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Job: esfriar leads parados há 7 dias (pg_cron, 04:20 de Brasília)
-- ---------------------------------------------------------------------------
create or replace function public.esfriar_leads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  update public.leads l set temperatura = 'frio'
  where l.temperatura <> 'frio'
    and public._temperatura_inatividade(l.status, l.temperatura, l.ultima_atividade_em, now()) = 'frio';
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura da caixa (security invoker: o RLS vale; uma consulta só por página)
--
-- Filtros (jsonb, todos opcionais): status[], temperatura[], origem[], responsavel
-- ('meus' | 'sem' | uuid), evento_de / evento_ate (data da festa da versão vigente),
-- atrasadas (bool), busca (nome ou telefone), teste (bool: inclui leads de teste),
-- atalho ('pre_reservas' | 'visitas' | 'tarefas_hoje' | 'atrasadas' | 'novos').
-- Sem filtro de status: só os abertos (grupo 1 a 7). Cursor: {"g": grupo, "o": ordem, "id": uuid}.
-- ---------------------------------------------------------------------------
create or replace function public.caixa_leads(
  p_filtros jsonb default '{}'::jsonb, p_cursor jsonb default null, p_limite integer default 30
)
returns table (
  id uuid, nome text, whatsapp_e164 text, email text, status public.status_lead,
  temperatura public.temperatura_lead, origem public.origem_lead, eh_teste boolean,
  responsavel_id uuid, responsavel_nome text, criado_em timestamptz,
  ultima_atividade_em timestamptz, primeiro_contato_em timestamptz,
  proximo_contato_em timestamptz, grupo integer, ordem double precision,
  pre_reserva_expira_em timestamptz, visita_pedida boolean, visita_pedida_em timestamptz,
  visita_proxima timestamptz,
  tarefa_vence timestamptz, tarefa_titulo text, tem_atrasada boolean, aberturas integer,
  orcamento_id uuid, orcamento_numero integer, orcamento_token text, total_centavos integer,
  evento_data date, evento_tipo text, evento_turno text, evento_convidados integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- materialized: calculado uma vez (empresa_do_usuario() não é reavaliada por linha)
  with param as materialized (
    select
      now() as agora,
      (date_trunc('day', now() at time zone e.fuso) + interval '1 day') at time zone e.fuso as fim_hoje,
      (date_trunc('day', now() at time zone e.fuso) + interval '2 days') at time zone e.fuso as fim_amanha,
      e.id as empresa_id,
      auth.uid() as eu,
      coalesce(p_filtros, '{}'::jsonb) as f,
      nullif(regexp_replace(coalesce(p_filtros ->> 'busca', ''), '\D', '', 'g'), '') as digitos,
      nullif(btrim(coalesce(p_filtros ->> 'busca', '')), '') as busca
    from public.empresas e
    where e.id = public.empresa_do_usuario()
  ),
  -- Agregados por lead (uma varredura por tabela e hash join; mais barato que lateral por lead)
  pr as (
    select r.lead_id, min(r.expira_em) as expira
    from public.reservas r
    where r.empresa_id = (select empresa_id from param) and r.status = 'ativa'
      and r.tipo = 'pre_reserva' and r.expira_em > now() and r.lead_id is not null
    group by r.lead_id
  ),
  vi as (
    select v.lead_id, bool_or(v.status = 'solicitada') as pedida,
           min(v.criado_em) filter (where v.status = 'solicitada') as pedida_em,
           min(v.data_hora) filter (where v.status = 'confirmada'
                                    and v.data_hora >= now() - interval '3 hours') as proxima
    from public.visitas v
    where v.empresa_id = (select empresa_id from param) and v.status in ('solicitada', 'confirmada')
    group by v.lead_id
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
    select l.*, pr.expira, vi.pedida, vi.pedida_em, vi.proxima, ta.vence as t_vence,
      ta.titulo as t_titulo, at.tem as t_atrasada, o.id as o_id, o.numero as o_numero,
      o.token as o_token, o.total_centavos as o_total, o.data as o_data,
      o.convidados as o_convidados, o.aberturas as o_aberturas, o.tipo_evento_id as o_tipo,
      o.turno_id as o_turno, p.agora, p.fim_hoje, p.fim_amanha
    from param p
    join public.leads l on l.empresa_id = p.empresa_id
    left join pr on pr.lead_id = l.id
    left join vi on vi.lead_id = l.id
    left join ta on ta.lead_id = l.id
    left join at on at.lead_id = l.id
    left join o on o.lead_id = l.id
    where (coalesce((p.f ->> 'teste')::boolean, false) or not l.eh_teste)
      and (case when p.f ? 'status' then l.status::text in (select jsonb_array_elements_text(p.f -> 'status'))
                else l.status not in ('reservado', 'realizado', 'perdido', 'cancelado') end)
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
  ),
  com_grupo as (
    select b.*,
      public._lead_grupo(b.status, b.temperatura, b.expira, b.pedida, b.proxima, b.t_vence,
                         b.primeiro_contato_em, b.proximo_contato_em, b.agora, b.fim_hoje,
                         b.fim_amanha) as g
    from base b
  ),
  filtrado as (
    select c.*,
      public._lead_ordem(c.g, c.expira, coalesce(c.pedida_em, c.proxima), c.t_vence,
                         c.proximo_contato_em, c.criado_em, c.ultima_atividade_em) as ord
    from com_grupo c, param p
    where (not p.f ? 'evento_de' or c.o_data >= (p.f ->> 'evento_de')::date)
      and (not p.f ? 'evento_ate' or c.o_data <= (p.f ->> 'evento_ate')::date)
      and (not coalesce((p.f ->> 'atrasadas')::boolean, false) or coalesce(c.t_atrasada, false))
      and (case p.f ->> 'atalho'
             when 'pre_reservas' then c.expira is not null
             when 'visitas' then coalesce(c.pedida, false) or (c.proxima is not null and c.proxima < c.fim_amanha)
             when 'tarefas_hoje' then c.t_vence is not null and c.t_vence >= c.agora and c.t_vence < c.fim_hoje
             when 'atrasadas' then c.t_vence is not null and c.t_vence < c.agora
             when 'novos' then c.status = 'novo' and c.primeiro_contato_em is null
             else true end)
  ),
  -- primeiro ordena e corta a página; só então busca os nomes (responsável, tipo, turno)
  pagina as (
    select f.* from filtrado f
    where p_cursor is null
       or (f.g, f.ord, f.id) > ((p_cursor ->> 'g')::integer, (p_cursor ->> 'o')::double precision,
                                (p_cursor ->> 'id')::uuid)
    order by f.g, f.ord, f.id
    limit greatest(1, least(coalesce(p_limite, 30), 100))
  )
  select f.id, f.nome, f.whatsapp_e164, f.email, f.status, f.temperatura, f.origem, f.eh_teste,
    f.responsavel_id, u.nome, f.criado_em, f.ultima_atividade_em, f.primeiro_contato_em,
    f.proximo_contato_em, f.g, f.ord, f.expira, coalesce(f.pedida, false), f.pedida_em, f.proxima, f.t_vence,
    f.t_titulo, coalesce(f.t_atrasada, false), coalesce(f.o_aberturas, 0), f.o_id, f.o_numero,
    f.o_token, f.o_total, f.o_data, te.nome, tu.nome, f.o_convidados
  from pagina f
  left join public.usuarios u on u.id = f.responsavel_id
  left join public.tipos_evento te on te.id = f.o_tipo
  left join public.turnos tu on tu.id = f.o_turno
  order by f.g, f.ord, f.id;
$$;

/** Contadores do topo "Hoje" (da empresa; tarefas são as do usuário). */
create or replace function public.resumo_hoje()
returns table (pre_reservas integer, visitas integer, tarefas_hoje integer, atrasadas integer,
               novos integer, pedem_acao integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with param as (
    select now() as agora,
      (date_trunc('day', now() at time zone e.fuso) + interval '1 day') at time zone e.fuso as fim_hoje,
      (date_trunc('day', now() at time zone e.fuso) + interval '2 days') at time zone e.fuso as fim_amanha,
      e.id as empresa_id, auth.uid() as eu
    from public.empresas e where e.id = public.empresa_do_usuario()
  ),
  abertos as (
    select l.id from public.leads l, param p
    where l.empresa_id = p.empresa_id and not l.eh_teste
      and l.status not in ('reservado', 'realizado', 'perdido', 'cancelado')
  ),
  com_pre as (
    select distinct r.lead_id as id from public.reservas r, param p
    where r.empresa_id = p.empresa_id and r.status = 'ativa' and r.tipo = 'pre_reserva'
      and r.expira_em > p.agora and r.lead_id in (select id from abertos)
  ),
  com_visita as (
    select distinct v.lead_id as id from public.visitas v, param p
    where v.empresa_id = p.empresa_id and v.lead_id in (select id from abertos)
      and (v.status = 'solicitada'
           or (v.status = 'confirmada' and v.data_hora >= p.agora - interval '3 hours'
               and v.data_hora < p.fim_amanha))
  ),
  minhas as (
    select t.* from public.tarefas t, param p
    where t.empresa_id = p.empresa_id and t.feita_em is null and t.cancelada_em is null
      and (t.responsavel_id = p.eu or t.responsavel_id is null)
      and t.lead_id in (select id from abertos)
  )
  select
    (select count(*) from com_pre)::integer,
    (select count(*) from com_visita)::integer,
    (select count(*) from minhas m, param p where m.vence_efetivo >= p.agora and m.vence_efetivo < p.fim_hoje)::integer,
    (select count(*) from minhas m, param p where m.vence_efetivo < p.agora)::integer,
    (select count(*) from public.leads l
      where l.id in (select id from abertos) and l.status = 'novo' and l.primeiro_contato_em is null)::integer,
    (select count(*) from (select id from com_pre union select id from com_visita) x)::integer;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public._lead_status_reaberto(public.status_lead)',
    'public._temperatura_inatividade(public.status_lead, public.temperatura_lead, timestamptz, timestamptz)',
    'public._leads_exigir_usuario()',
    'public._lead_do_usuario(uuid, uuid)',
    'public._auditar_lead(uuid, text, text, uuid, jsonb)',
    'public._nota_do_usuario(uuid, uuid, boolean)',
    'public._tarefa_do_usuario(uuid, uuid)',
    'public._tarefa_validar_quando(timestamptz)',
    'public._visita_periodo(timestamptz, text)',
    'public._visita_do_usuario(uuid, uuid)',
    'public._visita_validar_quando(timestamptz)',
    'public.esfriar_leads()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.registrar_contato(uuid, public.canal_contato, text)',
    'public.atualizar_dados_lead(uuid, text, text)',
    'public.atribuir_responsavel(uuid, uuid)',
    'public.registrar_mensagem(uuid, text, uuid)',
    'public.adicionar_nota(uuid, text)',
    'public.editar_nota(uuid, text)',
    'public.apagar_nota(uuid)',
    'public.criar_tarefa(uuid, text, timestamptz, text, uuid, uuid)',
    'public.concluir_tarefa(uuid)',
    'public.adiar_tarefa(uuid, timestamptz)',
    'public.reabrir_tarefa(uuid)',
    'public.cancelar_tarefa(uuid)',
    'public.definir_proximo_contato(uuid, timestamptz)',
    'public.marcar_perdido(uuid, public.motivo_perda, text)',
    'public.reabrir_lead(uuid)',
    'public.agendar_visita(uuid, timestamptz, text)',
    'public.confirmar_visita(uuid, timestamptz)',
    'public.remarcar_visita(uuid, timestamptz)',
    'public.cancelar_visita(uuid, text)',
    'public.marcar_visita_realizada(uuid)',
    'public.caixa_leads(jsonb, jsonb, integer)',
    'public.resumo_hoje()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

grant execute on function public.esfriar_leads() to service_role;
-- As regras puras ficam acessíveis ao service_role (testes de equivalência).
grant execute on function public._lead_status_reaberto(public.status_lead) to service_role;
grant execute on function public._temperatura_inatividade(public.status_lead, public.temperatura_lead, timestamptz, timestamptz) to service_role;
-- Grupo e ordem da caixa são puros e usados por caixa_leads (security invoker).
revoke all on function public._lead_grupo(public.status_lead, public.temperatura_lead, timestamptz, boolean, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
revoke all on function public._lead_ordem(integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public._lead_grupo(public.status_lead, public.temperatura_lead, timestamptz, boolean, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public._lead_ordem(integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
