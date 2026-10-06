-- Etapa 10 · PR 2 · Avisos do contrato para o dono (valores de enum em arquivo próprio).
alter type public.tipo_aviso add value if not exists 'contrato_aberto';
alter type public.tipo_aviso add value if not exists 'contrato_assinado';
alter type public.tipo_aviso add value if not exists 'contrato_ajuste';
alter type public.tipo_aviso add value if not exists 'contrato_vencendo';
