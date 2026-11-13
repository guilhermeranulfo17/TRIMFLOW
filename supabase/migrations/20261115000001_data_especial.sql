-- Data especial com nome e preço próprio (nov/2026, ARQUITETURA §87): além dos feriados, o
-- dono cadastra datas como "Véspera do Dia das Mães, +15%". Reaproveita a tabela de feriados:
-- ajuste_bp nulo = feriado comum (vale o ajuste de feriado de Ajustes por dia); preenchido =
-- a data tem o próprio ajuste, que vence os outros (regra em domain/preco/ajuste-dia).
--
-- Aditivo: coluna nullable, mesmo intervalo do ajuste por dia. A tabela já tem RLS, escrita só
-- do dono e o trigger _exigir_escrita. publico._contexto_da_empresa usa to_jsonb(linha): a
-- coluna chega ao servidor sem mudar a função (o contexto nunca vai ao navegador).

alter table public.feriados add column if not exists ajuste_bp integer;

alter table public.feriados drop constraint if exists feriados_ajuste_bp_valido;
alter table public.feriados add constraint feriados_ajuste_bp_valido
  check (ajuste_bp is null or ajuste_bp between -9000 and 20000);

comment on column public.feriados.ajuste_bp is
  'Data especial: ajuste próprio em basis points (vence os outros). Nulo = feriado comum.';
