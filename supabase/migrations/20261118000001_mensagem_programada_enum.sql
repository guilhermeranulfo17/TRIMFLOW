-- Mensagem programada (§93): tipo de aviso novo. Sozinho na migration: o valor novo de um enum
-- só pode ser usado depois que a transação que o criou termina.
alter type public.tipo_aviso add value if not exists 'mensagem_programada';
