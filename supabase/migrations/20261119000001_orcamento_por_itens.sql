-- Orçamento por itens, sem pacote (ARQUITETURA §96). Tudo aditivo (colunas com default ou
-- nullable): o código da versão anterior continua funcionando.
--
--  * regras_comerciais.modo_venda: 'pacotes' (padrão, como hoje), 'itens' ou 'ambos'.
--  * Sem pacote: mínimo de convidados, pedido mínimo (valor) e, opcional, o preço da festa por
--    pessoa em faixas de convidados ([{ateConvidados, valorCentavos}], valor por pessoa).
--  * opcionais: categoria (agrupa os itens no link), quantidade por convidado (por unidade, em
--    centésimos: 1200 = 12 por convidado; o cliente vê só o valor) e faixas de preço por pessoa.
--  * As colunas entram sozinhas no JSON de publico._contexto_da_empresa (to_jsonb da linha).

-- ---------------------------------------------------------------------------
-- Regras comerciais
-- ---------------------------------------------------------------------------
alter table public.regras_comerciais
  add column modo_venda text not null default 'pacotes'
    check (modo_venda in ('pacotes', 'itens', 'ambos')),
  add column min_convidados_itens integer not null default 0
    check (min_convidados_itens between 0 and 100000),
  add column pedido_minimo_centavos integer not null default 0
    check (pedido_minimo_centavos between 0 and 1000000000),
  add column faixas_festa_por_pessoa jsonb not null default '[]'::jsonb
    check (jsonb_typeof(faixas_festa_por_pessoa) = 'array'
           and jsonb_array_length(faixas_festa_por_pessoa) <= 20);

comment on column public.regras_comerciais.modo_venda is
  'Como o link vende: pacotes (padrão), itens (o cliente monta a festa sem pacote) ou ambos.';
comment on column public.regras_comerciais.faixas_festa_por_pessoa is
  'Sem pacote: preço da festa por pessoa por faixa de convidados [{ateConvidados, valorCentavos}].';

-- o dono altera (a política de update já é só do dono)
grant update (modo_venda, min_convidados_itens, pedido_minimo_centavos, faixas_festa_por_pessoa)
  on public.regras_comerciais to authenticated;

-- ---------------------------------------------------------------------------
-- Opcionais (itens)
-- ---------------------------------------------------------------------------
alter table public.opcionais
  add column categoria text
    check (categoria is null or char_length(btrim(categoria)) between 1 and 40),
  add column qtd_por_convidado_cent integer
    check (qtd_por_convidado_cent is null or qtd_por_convidado_cent between 1 and 100000),
  add column faixas_por_pessoa jsonb not null default '[]'::jsonb
    check (jsonb_typeof(faixas_por_pessoa) = 'array' and jsonb_array_length(faixas_por_pessoa) <= 20);

comment on column public.opcionais.qtd_por_convidado_cent is
  'Por unidade: quantidade por convidado em centésimos (1200 = 12). O cliente vê só o valor.';
comment on column public.opcionais.faixas_por_pessoa is
  'Por pessoa: preço por pessoa por faixa de convidados [{ateConvidados, valorCentavos}].';

-- ---------------------------------------------------------------------------
-- Preço confirmado: mudar a quantidade por convidado ou as faixas também é mudar o preço
-- ---------------------------------------------------------------------------
create or replace function public._confirmar_preco()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public._gravando_modelo() then
    return new;
  end if;
  if tg_table_name = 'pacotes' then
    if tg_op = 'INSERT' then
      new.preco_confirmado_em := coalesce(new.preco_confirmado_em, now());
    elsif new.preco_pessoa_centavos is distinct from old.preco_pessoa_centavos
       or new.valor_excedente_centavos is distinct from old.valor_excedente_centavos
       or new.modelo_preco is distinct from old.modelo_preco then
      new.preco_confirmado_em := now();
    end if;
  else
    if tg_op = 'INSERT' then
      new.preco_confirmado_em := coalesce(new.preco_confirmado_em, now());
    elsif new.preco_centavos is distinct from old.preco_centavos
       or new.cobranca is distinct from old.cobranca
       or new.qtd_por_convidado_cent is distinct from old.qtd_por_convidado_cent
       or new.faixas_por_pessoa is distinct from old.faixas_por_pessoa then
      new.preco_confirmado_em := now();
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- painel_contexto: as pendências do link sabem o jeito de vender (chaves novas; o código
-- anterior as ignora). Mesmo corpo de 20261010000001_desempenho.sql, mais três chaves.
-- ---------------------------------------------------------------------------
create or replace function public.painel_contexto()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'resumo', (select to_jsonb(r) from public.resumo_hoje() r),
    'nao_lidos', (select count(*)::int from public.avisos a
                  where a.usuario_id = (select auth.uid()) and a.lido_em is null),
    'empresa', (select jsonb_build_object(
                  'plano', e.plano,
                  'trial_ate', e.trial_ate,
                  'fuso', e.fuso,
                  'onboarding_passo', e.onboarding_passo,
                  'onboarding_iniciado_em', e.onboarding_iniciado_em,
                  'onboarding_concluido_em', e.onboarding_concluido_em)
                from public.empresas e where e.id = (select public.empresa_do_usuario())),
    'catalogo', jsonb_build_object(
      'pacotes', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', p.id,
                    'ativo', p.ativo,
                    'modelo_preco', p.modelo_preco,
                    'preco_pessoa_centavos', p.preco_pessoa_centavos,
                    'valor_excedente_centavos', p.valor_excedente_centavos,
                    'preco_confirmado', p.preco_confirmado_em is not null,
                    'faixas', (select count(*)::int from public.faixas_preco f
                               where f.pacote_id = p.id)))
                  from public.pacotes p), '[]'::jsonb),
      'tipo_evento_ativo', exists (select 1 from public.tipos_evento t where t.ativo),
      'turno_ativo', exists (select 1 from public.turnos t where t.ativo),
      'espaco_ativo', exists (select 1 from public.espacos s where s.ativo),
      -- §96: jeito de vender e se o orçamento por itens tem o que vender
      'modo_venda', (select r.modo_venda from public.regras_comerciais r),
      'festa_com_preco', coalesce((select jsonb_array_length(r.faixas_festa_por_pessoa) > 0
                                   from public.regras_comerciais r), false),
      'itens_com_preco', exists (
        select 1 from public.opcionais o
        where o.ativo and o.preco_confirmado_em is not null
          and not exists (select 1 from public.opcional_pacotes v
                          where v.opcional_id = o.id and v.relacao = 'compativel'))),
    -- só o dono lê assinaturas (RLS); para o vendedor a lista vem vazia
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
                      'status', a.status,
                      'pago_ate', a.pago_ate,
                      'atrasada_desde', a.atrasada_desde,
                      'criada_em', a.criada_em))
                    from public.assinaturas a), '[]'::jsonb),
    'plano', public.plano_vigente_da_empresa()
  );
$$;
