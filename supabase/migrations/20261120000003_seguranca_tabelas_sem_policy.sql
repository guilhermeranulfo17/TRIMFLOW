-- Ajustes da análise de 17/11/2026 · Item 3: tabelas com RLS ligado e sem policy (§99).
--
-- O advisor do Supabase lista 8 tabelas com RLS e nenhuma policy. Revisadas uma a uma: em todas,
-- quem lê e escreve é só o servidor (conexão administrativa) ou funções SECURITY DEFINER; anon e
-- authenticated não têm GRANT nenhum. RLS sem policy = "nega tudo" para quem não é dono da
-- tabela, que é exatamente o desejado. Nenhuma tela do painel lê essas tabelas direto, então
-- NÃO criamos policy: só documentamos aqui e no comentário de cada tabela (o teste
-- tests/integration/seguranca-funcoes.test.ts confere comentário e ausência de GRANT).
--
-- publico.tentativas: o schema "publico" (sem o "c") é de propósito. É o schema das funções do
-- link público, FORA da API do Supabase (não pode entrar em Exposed schemas), e a tabela guarda
-- só hashes para o limite de tentativas. Não muda de lugar.
--
-- Só comentários: nada muda no comportamento.

comment on table public.auditoria_interna is
  'Auditoria das ações da equipe Orkestra no /interno. RLS sem policy de propósito: só a conexão administrativa (server/interno) lê e grava; anon e authenticated sem GRANT.';
comment on table public.cobranca_eventos is
  'Eventos do Asaas (webhook e reconciliação), idempotentes. RLS sem policy de propósito: só cobranca_registrar_evento e a conexão administrativa gravam/leem; anon e authenticated sem GRANT.';
comment on table public.contrato_codigos is
  'Códigos de 6 dígitos por e-mail (só o hash). Ninguém do navegador lê; só as funções do link. RLS sem policy de propósito; anon e authenticated sem GRANT.';
comment on table public.cupons is
  'Desconto em centavos sobre o preço do plano/ciclo por duracao_meses a partir da assinatura. RLS sem policy de propósito: só a conexão administrativa (server/cobranca) lê e grava; anon e authenticated sem GRANT.';
comment on table public.cupons_usos is
  'Uso de cupom por empresa. RLS sem policy de propósito: só a conexão administrativa (server/cobranca) lê e grava; anon e authenticated sem GRANT.';
comment on table public.landing_contagem is
  'Visitas e cliques em "Testar grátis" da landing, por dia. Sem IP, cookie ou qualquer dado pessoal. RLS sem policy de propósito: grava só publico.landing_contar, lê só o /interno; anon e authenticated sem GRANT.';
comment on table public.uso_painel is
  'Radar de uso: aberturas de cada área do painel por empresa e dia (fuso da empresa). Sem dado pessoal. RLS sem policy de propósito: grava só registrar_uso, lê só o /interno; anon e authenticated sem GRANT.';
comment on table publico.tentativas is
  'Limite de tentativas do link público (só hashes). Schema publico (fora da API) de propósito. RLS sem policy de propósito: só as funções publico.*; anon e authenticated sem GRANT.';
