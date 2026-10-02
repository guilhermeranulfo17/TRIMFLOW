-- Etapa 9A · Cobrança: valores novos de enums.
--
-- Em arquivo próprio: um valor novo de enum não pode ser usado na mesma transação em que foi
-- criado. O código da Etapa 8 nunca lê estes valores (só aparecem quando houver assinatura ou
-- aviso de cobrança).

-- Situação da conta: inadimplente (atraso dentro da carência de 7 dias) e cancelado (até o fim
-- do período pago). Os dois mantêm o acesso; só "suspenso" vira somente leitura.
alter type public.plano_empresa add value if not exists 'inadimplente';
alter type public.plano_empresa add value if not exists 'cancelado';

-- Avisos de cobrança (sempre só para o dono).
alter type public.tipo_aviso add value if not exists 'teste_acabando';
alter type public.tipo_aviso add value if not exists 'fatura_criada';
alter type public.tipo_aviso add value if not exists 'pagamento_confirmado';
alter type public.tipo_aviso add value if not exists 'pagamento_falhou';
alter type public.tipo_aviso add value if not exists 'carencia';
alter type public.tipo_aviso add value if not exists 'conta_suspensa';
