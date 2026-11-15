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
