-- Fase 6.5: remover item incluso. Só expansão: duas colunas com default/nulas no vínculo
-- opcional × pacote e um valor novo no tipo da linha do orçamento. O código anterior continua
-- funcionando (ignora as colunas e nunca grava linha "retirado").

-- O dono marca, no pacote, quais opcionais inclusos o cliente pode tirar e, se quiser, quanto
-- desconta ao tirar. Sem valor de desconto, o item sai sem mudar o preço.
alter table public.opcional_pacotes
  add column if not exists removivel boolean not null default false,
  add column if not exists desconto_retirada_centavos integer;

alter table public.opcional_pacotes drop constraint if exists opcional_pacotes_removivel_incluso;
alter table public.opcional_pacotes add constraint opcional_pacotes_removivel_incluso
  check (not removivel or relacao = 'incluso');

alter table public.opcional_pacotes drop constraint if exists opcional_pacotes_desconto_retirada;
alter table public.opcional_pacotes add constraint opcional_pacotes_desconto_retirada
  check (
    desconto_retirada_centavos is null
    or (removivel and desconto_retirada_centavos between 0 and 100000000)
  );

comment on column public.opcional_pacotes.removivel is
  'O cliente pode retirar este opcional incluso no orçamento (só relacao = incluso).';
comment on column public.opcional_pacotes.desconto_retirada_centavos is
  'Desconto, em centavos, quando o cliente retira o item. Nulo = retira sem desconto.';

-- Linha do orçamento para o item retirado (valor zero ou negativo, nunca é "desconto" do
-- vendedor: não entra no limite de desconto).
alter type public.tipo_item_orcamento add value if not exists 'retirado';
