-- Etapa 10 · PR 1 · Contrato digital: tipos novos (em arquivo próprio: valores de enum novos não
-- podem ser usados na mesma transação em que foram criados).

create type public.status_contrato as enum (
  'rascunho', 'enviado', 'assinado_cliente', 'concluido', 'recusado', 'expirado', 'cancelado');
create type public.parte_contrato as enum ('buffet', 'cliente');
create type public.metodo_assinatura as enum ('aceite', 'aceite_com_codigo');
