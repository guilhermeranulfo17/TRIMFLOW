-- Etapa 9B · B.4 E-mail: valores novos de enums.
--
-- Em arquivo próprio: um valor novo de enum não pode ser usado na mesma transação em que foi
-- criado. O código anterior nunca lê estes valores (só aparecem quando a fila tiver e-mail).

-- Avisos da conta (só para o dono; também por e-mail).
alter type public.tipo_aviso add value if not exists 'boas_vindas';
alter type public.tipo_aviso add value if not exists 'exportacao_pronta';
alter type public.tipo_aviso add value if not exists 'exclusao_agendada';

-- Canal novo da fila: e-mail (Resend, por fetch).
alter type public.canal_aviso add value if not exists 'email';
