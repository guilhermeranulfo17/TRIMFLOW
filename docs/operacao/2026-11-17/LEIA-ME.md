# Consultas da análise de 16/11/2026

Arquivos para rodar no SQL Editor do Supabase (projeto `orkestra`). Contexto em
`docs/OPERACAO_2026-11-17.md` e `docs/ARQUITETURA.md` §99.

- **Verificação** (somente leitura, pode rodar quando quiser): `01`, `03`, `04`, `05`, `07`, `08`,
  `09`, `10`, `11`. Nenhuma devolve dado do cliente final (nome, telefone, e-mail do lead).
- **Correção** (NÃO executadas; terminam em `ROLLBACK`, troque por `COMMIT` depois de conferir):
  - `02_aceitos_sem_reserva_correcao.sql`: os orçamentos aceitos parados (rodar depois do merge).
  - `06_asaas_sandbox_correcao.sql`: só na virada do Asaas para produção (`docs/COBRANCA.md`).

Depois do merge, as verificações também existem como funções `public.interno_*` e na tela
`/interno/diagnostico` (contas de teste fora por padrão).
