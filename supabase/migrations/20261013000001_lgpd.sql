-- Etapa 9B · B.1 LGPD
--
-- O buffet é o controlador dos dados dos leads; o Orkestra é o operador.
--   1. Colunas novas (todas aditivas: nullable ou com default)
--   2. Anonimização de um lead (pedido do titular ou retenção) e exportação dos dados dele
--   3. Retenção automática (job diário) e limpezas periódicas
--   4. Exclusão da conta com 30 dias para desistir (a exclusão definitiva roda na rota
--      /api/lgpd/processar, que também apaga o Storage e os usuários do Auth)
--   5. Aceite versionado dos Termos e da Política de Privacidade
--   6. Auditoria: leitura só do dono (pendência da Etapa 2)
--   7. Jobs (pg_cron)

-- ---------------------------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------------------------

-- Lead anonimizado: nome "Titular removido", WhatsApp e e-mail apagados. O hash é irreversível
-- (sha256 com um valor aleatório descartado): só marca que ali havia uma pessoa real.
alter table public.leads alter column whatsapp_e164 drop not null;
alter table public.leads
  add column if not exists anonimizado_em timestamptz,
  add column if not exists titular_hash text
    check (titular_hash is null or titular_hash ~ '^[0-9a-f]{64}$');

comment on column public.leads.anonimizado_em is
  'LGPD: dados pessoais removidos (pedido do titular ou retenção). Números agregados ficam.';

alter table public.empresas
  add column if not exists retencao_leads_meses smallint not null default 24
    check (retencao_leads_meses in (12, 24, 36, 60)),
  add column if not exists exclusao_solicitada_em timestamptz,
  add column if not exists exclusao_agendada_para timestamptz;

comment on column public.empresas.retencao_leads_meses is
  'LGPD: leads sem reserva e sem atividade há mais que isso são anonimizados pelo job diário.';
comment on column public.empresas.exclusao_agendada_para is
  'LGPD: exclusão definitiva da conta (30 dias depois do pedido; até lá a conta fica suspensa).';

alter table public.usuarios
  add column if not exists termos_versao text check (termos_versao is null or char_length(termos_versao) <= 40),
  add column if not exists termos_aceitos_em timestamptz;

-- Histórico dos aceites (prova de quem aceitou qual versão e quando)
create table if not exists public.aceites_termos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,
  versao      text not null check (char_length(versao) between 1 and 40),
  aceito_em   timestamptz not null default now()
);
create index if not exists aceites_termos_usuario_idx on public.aceites_termos (usuario_id, aceito_em desc);
create index if not exists aceites_termos_empresa_idx on public.aceites_termos (empresa_id);

alter table public.aceites_termos enable row level security;
revoke all on public.aceites_termos from public, anon, authenticated;
grant all on public.aceites_termos to service_role;
grant select on public.aceites_termos to authenticated;
drop policy if exists aceites_termos_select_proprios on public.aceites_termos;
create policy aceites_termos_select_proprios on public.aceites_termos for select to authenticated
  using (usuario_id = (select auth.uid()));
-- Sem trigger de somente leitura (_exigir_escrita): aceitar os termos novos precisa funcionar com a
-- conta suspensa (senão o dono não entra nem para exportar os dados). Escrita só por função.

-- ---------------------------------------------------------------------------------------------
-- 2. Lead: anonimização e exportação
-- ---------------------------------------------------------------------------------------------

/** O texto contém um dos termos (palavra inteira, sem caixa) ou os 8 últimos dígitos do telefone? */
create or replace function public._lgpd_contem(p text, p_termos text[], p_digitos text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null and (
    exists (
      select 1 from unnest(p_termos) t
      where char_length(t) >= 3
        and lower(p) ~ ('(^|[^[:alnum:]])'
                        || regexp_replace(t, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
                        || '($|[^[:alnum:]])'))
    or (char_length(coalesce(p_digitos, '')) >= 8
        and position(p_digitos in regexp_replace(p, '\D', '', 'g')) > 0)
  );
$$;

create or replace function public._lgpd_redigir_texto(p text, p_termos text[], p_digitos text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when public._lgpd_contem(p, p_termos, p_digitos) then 'Titular removido' else p end;
$$;

/** Troca, em qualquer profundidade, as strings com dado do titular por "Titular removido". */
create or replace function public._lgpd_redigir_jsonb(p jsonb, p_termos text[], p_digitos text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null then
    return null;
  end if;
  case jsonb_typeof(p)
    when 'object' then
      return coalesce((select jsonb_object_agg(e.k, public._lgpd_redigir_jsonb(e.v, p_termos, p_digitos))
                       from jsonb_each(p) e(k, v)), '{}'::jsonb);
    when 'array' then
      return coalesce((select jsonb_agg(public._lgpd_redigir_jsonb(a.v, p_termos, p_digitos) order by a.i)
                       from jsonb_array_elements(p) with ordinality a(v, i)), '[]'::jsonb);
    when 'string' then
      return to_jsonb(public._lgpd_redigir_texto(p #>> '{}', p_termos, p_digitos));
    else
      return p;
  end case;
end;
$$;

-- Chaves de texto livre removidas dos jsonb do lead (resumo do contato, detalhe da perda…)
create or replace function public._lgpd_chaves_livres()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['resumo', 'detalhe', 'texto', 'observacoes', 'observacao', 'mensagem', 'nome',
               'lead_nome', 'cliente_nome', 'email', 'whatsapp', 'whatsapp_e164', 'telefone',
               'clienteNome', 'clienteWhatsapp', 'cliente'];
$$;

/**
 * Anonimiza um lead (núcleo, sem checar quem chama). Nome vira "Titular removido", WhatsApp e
 * e-mail somem, notas são apagadas e textos livres zerados em todas as tabelas ligadas ao lead
 * (orçamentos, itens, reservas, atividades, tarefas, visitas, avisos e auditoria). Status, datas,
 * valores e origem ficam: Números não muda. Pré-reserva ativa é cancelada (libera a data).
 * Reserva confirmada de evento futuro bloqueia (LGPD_RESERVA_FUTURA).
 * Devolve false se o lead já estava anonimizado.
 */
create or replace function public._lgpd_anonimizar_lead(
  p_empresa uuid, p_lead uuid, p_motivo text, p_usuario uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead     public.leads%rowtype;
  v_fuso     text;
  v_termos   text[];
  v_digitos  text;
  v_orcs     uuid[];
  v_reservas uuid[];
  v_outros   uuid[];
  v_r        record;
  v_chaves   text[] := public._lgpd_chaves_livres();
begin
  -- LGPD vale também com a conta suspensa (o trigger de somente leitura libera esta transação)
  perform set_config('orkestra.permitir_escrita', '1', true);
  -- agenda antes do lead (mesma ordem das outras funções): concorrência sem deadlock
  perform public._agenda_travar(p_empresa);
  select * into v_lead from public.leads l where l.id = p_lead and l.empresa_id = p_empresa for update;
  if v_lead.id is null then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  if v_lead.anonimizado_em is not null then
    return false;
  end if;

  select e.fuso into v_fuso from public.empresas e where e.id = p_empresa;
  if exists (select 1 from public.reservas r
             where r.empresa_id = p_empresa and r.lead_id = p_lead and r.tipo = 'confirmada'
               and r.status = 'ativa'
               and r.data >= (now() at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date) then
    raise exception 'LGPD_RESERVA_FUTURA' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(o.id), '{}') into v_orcs
  from public.orcamentos o where o.empresa_id = p_empresa and o.lead_id = p_lead;
  select coalesce(array_agg(r.id), '{}') into v_reservas
  from public.reservas r
  where r.empresa_id = p_empresa and (r.lead_id = p_lead or r.orcamento_id = any (v_orcs));

  -- Termos a procurar: nome inteiro e cada nome, e-mail, e os nomes das reservas (podem ter sido
  -- digitados diferente). Telefone pelos 8 últimos dígitos (pega qualquer formatação).
  select array_agg(distinct t) into v_termos from (
    select lower(btrim(x)) as t
    from unnest(array[v_lead.nome, v_lead.email, split_part(coalesce(v_lead.email, ''), '@', 1)]) x
    union all
    select lower(p) from regexp_split_to_table(coalesce(v_lead.nome, ''), '\s+') p
    union all
    select lower(btrim(r.cliente_nome)) from public.reservas r where r.id = any (v_reservas)
    union all
    select lower(p) from public.reservas r, regexp_split_to_table(r.cliente_nome, '\s+') p
    where r.id = any (v_reservas)
  ) s where t is not null and char_length(t) >= 3 and t <> 'titular removido';
  v_termos := coalesce(v_termos, '{}');
  v_digitos := right(regexp_replace(coalesce(v_lead.whatsapp_e164, ''), '\D', '', 'g'), 8);

  -- pré-reserva ativa: cancelada (o horário fica livre), como em marcar_perdido
  for v_r in
    select r.* from public.reservas r
    where r.id = any (v_reservas) and r.status = 'ativa' and r.tipo = 'pre_reserva'
    for update
  loop
    update public.reservas set status = 'cancelada', cancelada_por = p_usuario,
      cancelada_em = now(), motivo_cancelamento = 'Dados removidos a pedido do titular'
    where id = v_r.id;
    perform public._lead_aplicar_evento(p_lead, 'pre_reserva_cancelada', v_r.orcamento_id,
      case when p_usuario is null then 'sistema' else 'usuario' end::public.autor_atividade,
      p_usuario, jsonb_build_object('reserva_id', v_r.id, 'data', v_r.data, 'tipo', v_r.tipo,
                                    'motivo', 'Dados removidos a pedido do titular'));
  end loop;

  -- ids de notas, tarefas e visitas (para limpar a auditoria delas)
  select coalesce(array_agg(x.id), '{}') into v_outros from (
    select n.id from public.notas n where n.lead_id = p_lead
    union all select t.id from public.tarefas t where t.lead_id = p_lead
    union all select v.id from public.visitas v where v.lead_id = p_lead
  ) x;

  update public.leads set
    nome = 'Titular removido',
    whatsapp_e164 = null,
    email = null,
    motivo_perda = case when motivo_perda_codigo = 'outro' then 'Titular removido' end,
    anonimizado_em = now(),
    titular_hash = encode(sha256(convert_to(gen_random_uuid()::text || ':'
                                            || coalesce(v_lead.whatsapp_e164, ''), 'UTF8')), 'hex')
  where id = p_lead;

  update public.reservas set
    cliente_nome = 'Titular removido',
    cliente_whatsapp_e164 = null,
    observacoes = null,
    motivo_cancelamento = case when motivo_cancelamento is null then null
                               else public._lgpd_redigir_texto(motivo_cancelamento, v_termos, v_digitos) end
  where id = any (v_reservas);

  update public.orcamentos set
    observacoes = null,
    observacoes_internas = null,
    desconto_motivo = null,
    rascunho = public._lgpd_redigir_jsonb(rascunho - v_chaves, v_termos, v_digitos),
    resultado = public._lgpd_redigir_jsonb(resultado, v_termos, v_digitos),
    conteudo = public._lgpd_redigir_jsonb(conteudo, v_termos, v_digitos)
  where id = any (v_orcs);

  update public.orcamento_itens set
    descricao = public._lgpd_redigir_texto(descricao, v_termos, v_digitos),
    detalhe = public._lgpd_redigir_texto(detalhe, v_termos, v_digitos)
  where empresa_id = p_empresa and orcamento_id = any (v_orcs);

  delete from public.notas where lead_id = p_lead;

  update public.atividades set dados = public._lgpd_redigir_jsonb(dados - v_chaves, v_termos, v_digitos)
  where lead_id = p_lead;

  update public.tarefas set
    titulo = public._lgpd_redigir_texto(titulo, v_termos, v_digitos),
    descricao = null,
    mensagem_sugerida = null,
    mensagem_dados = null
  where lead_id = p_lead;

  update public.visitas set observacoes = null, motivo_cancelamento = null where lead_id = p_lead;

  update public.avisos set dados = public._lgpd_redigir_jsonb(dados - v_chaves, v_termos, v_digitos)
  where empresa_id = p_empresa
    and (lead_id = p_lead or (lead_id is null and public._lgpd_contem(dados::text, v_termos, v_digitos)));

  update public.auditoria set dados = public._lgpd_redigir_jsonb(dados, v_termos, v_digitos)
  where empresa_id = p_empresa
    and (entidade_id = p_lead or entidade_id = any (v_orcs) or entidade_id = any (v_reservas)
         or entidade_id = any (v_outros));

  -- hash do WhatsApp usado nos limites do link público
  if v_lead.whatsapp_e164 is not null then
    delete from publico.tentativas t
    where t.chave_tipo = 'whatsapp'
      and t.chave_hash = encode(sha256(convert_to(p_empresa::text || ':' || v_lead.whatsapp_e164, 'UTF8')), 'hex');
  end if;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (p_empresa, p_usuario, 'lead.anonimizado', 'lead', p_lead,
          jsonb_build_object('motivo', p_motivo));
  return true;
end;
$$;

revoke all on function public._lgpd_contem(text, text[], text) from public, anon, authenticated;
revoke all on function public._lgpd_redigir_texto(text, text[], text) from public, anon, authenticated;
revoke all on function public._lgpd_redigir_jsonb(jsonb, text[], text) from public, anon, authenticated;
revoke all on function public._lgpd_chaves_livres() from public, anon, authenticated;
revoke all on function public._lgpd_anonimizar_lead(uuid, uuid, text, uuid) from public, anon, authenticated;

/** Dono confirma a empresa do usuário logado (ou SEM_PERMISSAO). */
create or replace function public._lgpd_exigir_dono()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
begin
  if v_empresa is null or public.perfil_do_usuario() is distinct from 'dono' then
    raise exception 'SEM_PERMISSAO' using errcode = 'insufficient_privilege';
  end if;
  return v_empresa;
end;
$$;
revoke all on function public._lgpd_exigir_dono() from public, anon, authenticated;

/** Pedido do titular: o dono apaga os dados pessoais de um lead (fica na auditoria). */
create or replace function public.lgpd_apagar_lead(p_lead uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._lgpd_exigir_dono();
begin
  return public._lgpd_anonimizar_lead(v_empresa, p_lead, 'pedido_titular', auth.uid());
end;
$$;
revoke all on function public.lgpd_apagar_lead(uuid) from public, anon;
grant execute on function public.lgpd_apagar_lead(uuid) to authenticated;

/**
 * Dados de um lead para o titular (dono exporta): dados, orçamentos (com itens), atividades,
 * visitas, reservas, notas e tarefas. Só da empresa do dono; grava "lead.exportado".
 */
create or replace function public.lgpd_exportar_lead(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._lgpd_exigir_dono();
  v_lead    public.leads%rowtype;
  v_saida   jsonb;
begin
  perform set_config('orkestra.permitir_escrita', '1', true);
  select * into v_lead from public.leads l where l.id = p_lead and l.empresa_id = v_empresa;
  if v_lead.id is null then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  v_saida := jsonb_build_object(
    'exportado_em', now(),
    'lead', (select to_jsonb(l) - 'empresa_id' - 'responsavel_id' - 'titular_hash'
             from public.leads l where l.id = p_lead),
    'orcamentos', coalesce((
      select jsonb_agg((to_jsonb(o) - 'empresa_id' - 'criado_por' - 'rascunho')
                       || jsonb_build_object('itens', coalesce((
                            select jsonb_agg(to_jsonb(i) - 'empresa_id' - 'orcamento_id' order by i.ordem)
                            from public.orcamento_itens i where i.orcamento_id = o.id), '[]'::jsonb))
                       order by o.numero, o.versao)
      from public.orcamentos o where o.lead_id = p_lead and o.empresa_id = v_empresa), '[]'::jsonb),
    'atividades', coalesce((
      select jsonb_agg(to_jsonb(a) - 'empresa_id' - 'lead_id' - 'usuario_id' order by a.criado_em)
      from public.atividades a where a.lead_id = p_lead and a.empresa_id = v_empresa), '[]'::jsonb),
    'visitas', coalesce((
      select jsonb_agg(to_jsonb(v) - 'empresa_id' - 'lead_id' - 'confirmada_por' - 'criado_por'
                       order by v.criado_em)
      from public.visitas v where v.lead_id = p_lead and v.empresa_id = v_empresa), '[]'::jsonb),
    'reservas', coalesce((
      select jsonb_agg(to_jsonb(r) - 'empresa_id' - 'lead_id' - 'criado_por' - 'confirmada_por'
                       - 'cancelada_por' order by r.data)
      from public.reservas r
      where r.empresa_id = v_empresa
        and (r.lead_id = p_lead or r.orcamento_id in (select o.id from public.orcamentos o
                                                     where o.lead_id = p_lead))), '[]'::jsonb),
    'notas', coalesce((
      select jsonb_agg(jsonb_build_object('texto', n.texto, 'criado_em', n.criado_em) order by n.criado_em)
      from public.notas n where n.lead_id = p_lead and n.empresa_id = v_empresa), '[]'::jsonb),
    'tarefas', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', t.titulo, 'descricao', t.descricao,
                                          'vence_em', t.vence_em, 'feita_em', t.feita_em,
                                          'cancelada_em', t.cancelada_em) order by t.criado_em)
      from public.tarefas t where t.lead_id = p_lead and t.empresa_id = v_empresa), '[]'::jsonb)
  );

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'lead.exportado', 'lead', p_lead, '{}'::jsonb);
  return v_saida;
end;
$$;
revoke all on function public.lgpd_exportar_lead(uuid) from public, anon;
grant execute on function public.lgpd_exportar_lead(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Retenção e limpezas
-- ---------------------------------------------------------------------------------------------

/** Prazo de retenção dos leads (dono; 12, 24, 36 ou 60 meses). */
create or replace function public.salvar_retencao_leads(p_meses integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._lgpd_exigir_dono();
  v_antes   smallint;
begin
  if p_meses is null or p_meses not in (12, 24, 36, 60) then
    raise exception 'RETENCAO_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
  perform set_config('orkestra.permitir_escrita', '1', true);
  select e.retencao_leads_meses into v_antes from public.empresas e where e.id = v_empresa for update;
  update public.empresas set retencao_leads_meses = p_meses where id = v_empresa;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'empresa.retencao_alterada', 'empresa', v_empresa,
          jsonb_build_object('antes', v_antes, 'depois', p_meses));
end;
$$;
revoke all on function public.salvar_retencao_leads(integer) from public, anon;
grant execute on function public.salvar_retencao_leads(integer) to authenticated;

/**
 * Job diário (03:20 em São Paulo). Devolve quantos itens tratou.
 * - leads reais sem reserva confirmada e sem atividade há mais que o prazo da empresa: anonimizados
 *   (no máximo 500 por execução; o resto fica para o dia seguinte);
 * - leads de teste (modo teste do dono) com mais de 30 dias: apagados (não entram em Números);
 * - funil_eventos e landing_contagem com mais de 25 meses (o maior período de Números é 366 dias,
 *   comparado com os 366 anteriores);
 * - avisos com mais de 90 dias (as entregas vão junto) e entregas concluídas com mais de 30 dias.
 */
create or replace function public.lgpd_retencao(p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r          record;
  v_anon       integer := 0;
  v_teste      integer;
  v_funil      integer;
  v_landing    integer;
  v_avisos     integer;
  v_entregas   integer;
begin
  for v_r in
    select l.id, l.empresa_id from public.leads l
    join public.empresas e on e.id = l.empresa_id
    where not l.eh_teste and l.anonimizado_em is null
      and coalesce(l.ultima_atividade_em, l.criado_em)
          < p_agora - make_interval(months => e.retencao_leads_meses)
      and l.status not in ('pre_reservado', 'reservado')
      and not exists (select 1 from public.reservas r
                      where r.lead_id = l.id and r.tipo = 'confirmada'
                        and r.status in ('ativa', 'realizada'))
    order by l.criado_em
    limit 500
  loop
    if public._lgpd_anonimizar_lead(v_r.empresa_id, v_r.id, 'retencao', null) then
      v_anon := v_anon + 1;
    end if;
  end loop;

  delete from public.leads l
  where l.eh_teste and coalesce(l.ultima_atividade_em, l.criado_em) < p_agora - interval '30 days';
  get diagnostics v_teste = row_count;

  delete from public.funil_eventos f where f.criado_em < p_agora - interval '25 months';
  get diagnostics v_funil = row_count;
  delete from public.landing_contagem c where c.dia < (p_agora - interval '25 months')::date;
  get diagnostics v_landing = row_count;
  delete from public.avisos a where a.criado_em < p_agora - interval '90 days';
  get diagnostics v_avisos = row_count;
  delete from public.avisos_entregas e
  where e.status in ('enviado', 'ignorado', 'falhou') and e.atualizado_em < p_agora - interval '30 days';
  get diagnostics v_entregas = row_count;

  return jsonb_build_object('leads_anonimizados', v_anon, 'leads_teste_apagados', v_teste,
    'funil_eventos', v_funil, 'landing_contagem', v_landing, 'avisos', v_avisos,
    'entregas', v_entregas);
end;
$$;
revoke all on function public.lgpd_retencao(timestamptz) from public, anon, authenticated;
grant execute on function public.lgpd_retencao(timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Exclusão da conta (30 dias para desistir)
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
  return v_quando;
end;
$$;
revoke all on function public.solicitar_exclusao_conta() from public, anon;
grant execute on function public.solicitar_exclusao_conta() to authenticated;

create or replace function public.desistir_exclusao_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._lgpd_exigir_dono();
  v_e       public.empresas;
begin
  perform set_config('orkestra.permitir_escrita', '1', true);
  select * into v_e from public.empresas e where e.id = v_empresa for update;
  if v_e.exclusao_agendada_para is null then
    raise exception 'EXCLUSAO_NAO_AGENDADA' using errcode = 'check_violation';
  end if;
  update public.empresas set
    exclusao_solicitada_em = null,
    exclusao_agendada_para = null,
    suspensa_manual_em = case when motivo_suspensao = 'exclusao_solicitada' then null
                              else suspensa_manual_em end,
    motivo_suspensao = case when motivo_suspensao = 'exclusao_solicitada' then null
                            else motivo_suspensao end
  where id = v_empresa;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'conta.exclusao_cancelada', 'empresa', v_empresa, '{}'::jsonb);
  perform public._atualizar_situacao(v_empresa);
end;
$$;
revoke all on function public.desistir_exclusao_conta() from public, anon;
grant execute on function public.desistir_exclusao_conta() to authenticated;

/** Contas com a exclusão vencida (rota /api/lgpd/processar, conexão administrativa). */
create or replace function public.lgpd_contas_a_excluir(p_agora timestamptz default now())
returns table (empresa_id uuid, usuarios uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, coalesce((select array_agg(u.id) from public.usuarios u where u.empresa_id = e.id), '{}')
  from public.empresas e
  where e.exclusao_agendada_para is not null and e.exclusao_agendada_para <= p_agora
  order by e.exclusao_agendada_para
  limit 20;
$$;
revoke all on function public.lgpd_contas_a_excluir(timestamptz) from public, anon, authenticated;
grant execute on function public.lgpd_contas_a_excluir(timestamptz) to service_role;

/**
 * Exclusão definitiva (depois do Storage e dos usuários do Auth). Recusa se o prazo não venceu.
 * Apaga os usuários da empresa, os eventos do Asaas guardados (têm dados do pagador) e a empresa
 * (o resto vai em cascata). Fica só uma linha em auditoria_interna, sem dado pessoal.
 */
create or replace function public.lgpd_excluir_empresa(p_empresa uuid, p_agora timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.empresas;
begin
  select * into v_e from public.empresas e where e.id = p_empresa for update;
  if v_e.id is null then
    return false;
  end if;
  if v_e.exclusao_agendada_para is null or v_e.exclusao_agendada_para > p_agora then
    raise exception 'EXCLUSAO_FORA_DO_PRAZO' using errcode = 'check_violation';
  end if;
  delete from public.cobranca_eventos where empresa_id = p_empresa;
  delete from public.usuarios where empresa_id = p_empresa;
  delete from public.empresas where id = p_empresa;
  insert into public.auditoria_interna (admin_email, acao, empresa_id, dados)
  values ('sistema@orkestra', 'empresa.excluida', null,
          jsonb_build_object('empresa_id', p_empresa, 'solicitada_em', v_e.exclusao_solicitada_em));
  return true;
end;
$$;
revoke all on function public.lgpd_excluir_empresa(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.lgpd_excluir_empresa(uuid, timestamptz) to service_role;

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
end;
$$;
revoke all on function public.lgpd_registrar_exportacao() from public, anon;
grant execute on function public.lgpd_registrar_exportacao() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Aceite versionado (a versão vigente fica no código: domain/legal/versao.ts)
-- ---------------------------------------------------------------------------------------------

create or replace function public.registrar_aceite(p_versao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_empresa uuid := public.empresa_do_usuario();
begin
  if v_usuario is null or v_empresa is null then
    raise exception 'SEM_PERMISSAO' using errcode = 'insufficient_privilege';
  end if;
  if p_versao is null or p_versao !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$' then
    raise exception 'VERSAO_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
  perform set_config('orkestra.permitir_escrita', '1', true);
  insert into public.aceites_termos (empresa_id, usuario_id, versao) values (v_empresa, v_usuario, p_versao);
  update public.usuarios set termos_versao = p_versao, termos_aceitos_em = now() where id = v_usuario;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, v_usuario, 'termos.aceitos', 'usuario', v_usuario,
          jsonb_build_object('versao', p_versao));
end;
$$;
revoke all on function public.registrar_aceite(text) from public, anon;
grant execute on function public.registrar_aceite(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Auditoria: só o dono lê (o vendedor não vê o que os outros fizeram)
-- ---------------------------------------------------------------------------------------------
drop policy if exists auditoria_select_mesma_empresa on public.auditoria;
drop policy if exists auditoria_select_dono on public.auditoria;
create policy auditoria_select_dono on public.auditoria for select to authenticated
  using (empresa_id = (select public.empresa_do_usuario())
         and (select public.perfil_do_usuario()) = 'dono');

-- ---------------------------------------------------------------------------------------------
-- 7. Jobs
--   orkestra-lgpd-retencao  diário 06:20 UTC (03:20 em SP)  public.lgpd_retencao()
--   orkestra-lgpd-exclusao  diário 06:40 UTC (03:40 em SP)  POST {site}/api/lgpd/processar
-- A exclusão definitiva passa pela rota (Storage e Auth só pela API); mesmos segredos do Vault
-- dos avisos (orkestra_site_url e orkestra_cron_secret). Sem pg_cron/pg_net, nada é agendado.
-- ---------------------------------------------------------------------------------------------
create or replace function public.chamar_exclusao_contas()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_segredo text;
  v_id      bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  if not exists (select 1 from public.empresas e
                 where e.exclusao_agendada_para is not null and e.exclusao_agendada_para <= now()) then
    return null;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'orkestra_site_url'$q$
    into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'orkestra_cron_secret'$q$
    into v_segredo;
  if v_url is null or v_segredo is null then
    return null;
  end if;
  execute $q$select net.http_post(url := $1, headers := $2, body := '{}'::jsonb,
                                  timeout_milliseconds := 25000)$q$
    into v_id
    using rtrim(v_url, '/') || '/api/lgpd/processar',
          jsonb_build_object('Authorization', 'Bearer ' || v_segredo,
                             'Content-Type', 'application/json');
  return v_id;
end;
$$;
revoke all on function public.chamar_exclusao_contas() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: jobs da LGPD não agendados.';
    return;
  end if;
  create extension if not exists pg_cron;
  -- cron.schedule com o mesmo nome substitui o job (idempotente).
  perform cron.schedule('orkestra-lgpd-retencao', '20 6 * * *', 'select public.lgpd_retencao()');
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    perform cron.schedule('orkestra-lgpd-exclusao', '40 6 * * *',
                          'select public.chamar_exclusao_contas()');
  else
    raise notice 'pg_net indisponível: exclusão de contas não agendada.';
  end if;
end;
$$;
