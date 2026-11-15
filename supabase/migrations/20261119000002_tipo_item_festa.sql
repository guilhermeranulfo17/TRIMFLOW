-- Orçamento por itens (§96): linha "Festa" (preço da festa por pessoa pela faixa de convidados).
-- Sozinho na migration: o valor novo de um enum só pode ser usado depois que a transação que o
-- criou termina.
alter type public.tipo_item_orcamento add value if not exists 'festa';
