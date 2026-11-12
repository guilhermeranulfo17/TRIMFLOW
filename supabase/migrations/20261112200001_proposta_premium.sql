-- Proposta premium (nov/2026): modelo visual da proposta (web e PDF) escolhido pelo dono.
--
-- Tudo aditivo (funciona com o código da versão anterior):
-- - empresas.modelo_proposta: 'elegante' | 'alegre'; nulo = padrão do tipo de buffet
--   (infantil = alegre; eventos e domicílio = elegante), decidido em domain/proposta/visual.
-- - publico.proposta passa a devolver, dentro de "empresa", o modelo escolhido e o segmento.
--   O código anterior ignora as chaves novas.
-- A foto do pacote entra no conteúdo congelado (orcamentos.conteudo, jsonb) pelo servidor:
-- nenhuma coluna nova para isso.

alter table public.empresas add column if not exists modelo_proposta text;

alter table public.empresas drop constraint if exists empresas_modelo_proposta_valido;
alter table public.empresas add constraint empresas_modelo_proposta_valido
  check (modelo_proposta is null or modelo_proposta in ('elegante', 'alegre'));

comment on column public.empresas.modelo_proposta is
  'Modelo visual da proposta (web e PDF): elegante ou alegre. Nulo = padrão do segmento.';

-- Só o dono altera (policy empresas_update_dono), coluna a coluna como as outras.
grant update (modelo_proposta) on public.empresas to authenticated;

-- ---------------------------------------------------------------------------
-- publico.proposta: igual à de 20261005000003, com modelo_proposta e segmento em "empresa"
-- ---------------------------------------------------------------------------
create or replace function publico.proposta(p_slug text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido  public.orcamentos;
  v_o       public.orcamentos;
  v_e       public.empresas;
  v_hoje    date;
  v_reserva jsonb;
begin
  v_e := publico._empresa(p_slug);
  if v_e.id is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,}$' then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  select * into v_pedido from public.orcamentos o where o.token = p_token and o.empresa_id = v_e.id;
  if v_pedido.id is null then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  v_o := coalesce(public._orcamento_vigente(v_e.id, v_pedido.numero), v_pedido);
  if v_o.status = 'em_montagem' then
    raise exception 'PUBLICO_ORCAMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  v_hoje := publico._hoje(v_e.id);
  if v_o.status in ('enviado', 'visualizado') and v_o.validade_ate < v_hoje then
    perform public._orcamento_expirar(v_o.id);
    select * into v_o from public.orcamentos o where o.id = v_o.id;
  end if;

  select jsonb_build_object('tipo', r.tipo, 'status', r.status, 'expira_em', r.expira_em)
    into v_reserva
  from public.reservas r
  where r.orcamento_id = v_o.id and r.status = 'ativa'
    and (r.tipo = 'confirmada' or r.expira_em > now())
  order by r.criado_em desc limit 1;

  return jsonb_build_object(
    'numero', v_o.numero,
    'versao', v_o.versao,
    'token', v_o.token,
    'token_antigo', v_o.token <> p_token,
    'atualizada_em', v_o.enviado_em,
    'status', v_o.status,
    'eh_teste', v_o.eh_teste,
    'enviado_em', v_o.enviado_em,
    'validade_ate', v_o.validade_ate,
    'hoje', v_hoje,
    'resultado', v_o.resultado,
    'conteudo', v_o.conteudo,
    'observacoes', v_o.observacoes,
    'total_centavos', v_o.total_centavos,
    'data', v_o.data,
    'convidados', v_o.convidados,
    'tipo_evento', (select t.nome from public.tipos_evento t where t.id = v_o.tipo_evento_id),
    'turno', (select jsonb_build_object('nome', t.nome, 'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'))
              from public.turnos t where t.id = v_o.turno_id),
    'espaco', (select x.nome from public.espacos x where x.id = v_o.espaco_id),
    'cliente_primeiro_nome', (select split_part(btrim(l.nome), ' ', 1) from public.leads l where l.id = v_o.lead_id),
    'cliente_nome', (select btrim(l.nome) from public.leads l where l.id = v_o.lead_id),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'tipo', i.tipo, 'descricao', i.descricao, 'quantidade', i.quantidade,
        'valor_unitario_centavos', i.valor_unitario_centavos,
        'subtotal_centavos', i.subtotal_centavos, 'detalhe', i.detalhe) order by i.ordem)
      from public.orcamento_itens i where i.orcamento_id = v_o.id), '[]'),
    'reserva', v_reserva,
    'suspenso', v_e.plano = 'suspenso',
    'empresa', jsonb_build_object(
      'nome', v_e.nome, 'razao_social', v_e.razao_social, 'cnpj', v_e.cnpj,
      'endereco', v_e.endereco, 'whatsapp_e164', v_e.whatsapp_e164,
      'rodape_orkestra', v_e.rodape_orkestra,
      'modelo_proposta', v_e.modelo_proposta, 'segmento', v_e.segmento),
    'regras', (select jsonb_build_object(
        'prazo_pre_reserva_horas', r.prazo_pre_reserva_horas, 'sinal_bp', r.sinal_bp,
        'cancelamento_texto', r.cancelamento_texto)
      from public.regras_comerciais r where r.empresa_id = v_e.id)
  );
end;
$$;
