-- Ajustes da análise de 17/11/2026 · Item 9: índices de chaves estrangeiras (§99, sem urgência).
--
-- O advisor lista 43 FKs sem índice "de cobertura exata". Revisadas uma a uma (lista completa e
-- decisão em docs/OPERACAO_2026-11-17.md, item 9):
--   * 14 já têm índice na PRIMEIRA coluna da FK (ex.: faixas_preco(pacote_id), cobrancas
--     (assinatura_id), push_inscricoes(usuario_id)). O advisor reclama porque a FK composta
--     (x, empresa_id) não está coberta exatamente, mas joins, filtros e o ON DELETE usam o índice
--     da primeira coluna. Nenhum índice novo.
--   * 15 de autor/usuário (criado_por, feita_por, confirmada_por, cancelada_por, autor_id,
--     concedido_por, usuario_id de atividades), cupom_id e plano_codigo: nenhuma tela filtra por
--     elas (só junta para mostrar o nome, pela PK do pai). Nenhum índice novo.
--   * 8 de empresa_id em tabelas pequenas e 2 de bloqueios (turno/espaço): só o ON DELETE usaria.
--     Nenhum índice novo.
--   * Ficam as FKs só de empresa_id de tabelas que crescem com o uso e que agora entram em filtro de
--     verdade: o diagnóstico do /interno filtra avisos_entregas e avisos por empresa (contas de teste
--     fora), e a exclusão definitiva da conta (LGPD) apaga por empresa_id em cascata. São estes 4.
-- Os 51 índices "nunca usados" NÃO são apagados agora (volume baixo, uso real começando): a lista
-- fica para reavaliar com tráfego (consulta em docs/operacao/2026-11-17/09_indices.sql).
-- Só expansão. Tabelas pequenas hoje: o create index comum é instantâneo (sem CONCURRENTLY, que
-- não roda dentro da transação da migration).

create index if not exists avisos_entregas_empresa_idx on public.avisos_entregas (empresa_id);
create index if not exists avisos_empresa_idx on public.avisos (empresa_id, criado_em desc);
create index if not exists notas_empresa_idx on public.notas (empresa_id);
create index if not exists orcamento_itens_empresa_idx on public.orcamento_itens (empresa_id);
