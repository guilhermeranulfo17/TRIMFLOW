# Arquitetura: decisões da Etapa 0 (Fundação)

Cada decisão traz o porquê. Quando algo era ambíguo, escolhemos a opção mais simples que não
bloqueia as próximas etapas.

## 1. Stack e versões

- **Next.js 15.5 + React 19 + TypeScript 5.9 strict** (com `noUncheckedIndexedAccess`).
  TypeScript 7 (versão em Go) já existe, mas o Next 15 ainda depende da API do compilador em JS.
- **Node 22.** O Vitest 5 exige Node ≥ 22.12, e o Node 20 saiu de suporte em abril de 2026.
  Continua atendendo o requisito "Node 20+".
- **Tailwind v4 + shadcn/ui (estilo new-york).** É o padrão atual para Next 15 / React 19.
  Os componentes shadcn ficam versionados em `src/components/ui` e são nossos para ajustar
  (raios de 10px, altura de toque de 44px).
- **ESLint 9** (flat config). O `eslint-config-next@15` não suporta ESLint 10.

## 2. Banco: SQL é a fonte da verdade, Drizzle é o espelho tipado

- As migrations em `supabase/migrations/*.sql` definem tabelas, **RLS, policies, grants,
  funções e triggers**. São aplicadas pela Supabase CLI (`db reset`, `migration up`) e, no
  cloud, por `supabase db push`.
- `src/server/db/schema.ts` espelha as tabelas à mão, só para ter queries tipadas.
  **Não usamos `drizzle-kit generate`** porque ele não versiona policies, funções nem triggers,
  e ter duas fontes de migration acaba divergindo. O teste `tenant-drizzle.test.ts` detecta
  quando o espelho sai de sincronia.
- Driver `postgres` (postgres.js) com `prepare: false`, exigido pelo pooler do Supabase em
  modo transação (Vercel/serverless).

## 3. Multiempresa com RLS, inclusive no servidor

- Tabelas: `empresas`, `usuarios` (1:1 com `auth.users`) e `auditoria`. Todo id é `uuid`.
- `public.empresa_do_usuario()` e `public.perfil_do_usuario()` são `security definer` com
  `search_path` vazio. Isso evita recursão nas policies de `usuarios` e impede sequestro de
  `search_path`. Usuário **inativo** recebe `null`, então perde o acesso na hora.
- **Privilégios mínimos.** O Supabase concede tudo a `anon`/`authenticated` por padrão, então a
  migration faz `revoke all` e libera só o necessário, **por coluna**:
  - `empresas`: select da própria empresa; update só do **dono** e só em
    `nome, segmento, whatsapp_e164, email, cidade, uf, fuso`. `slug`, `plano` e `trial_ate`
    ficam fora: troca de slug com redirecionamento e cobrança vêm em etapas próprias.
  - `usuarios`: select da mesma empresa; update só do dono (`nome, whatsapp_e164, perfil,
limite_desconto_pct, ativo`). `empresa_id` não é editável.
  - `auditoria`: select e insert na própria empresa, com `usuario_id = auth.uid()`.
    **Append-only**: sem update nem delete.
  - `anon`: nenhum acesso a tabela.
  - Ninguém do painel cria ou apaga empresa ou usuário por enquanto. O cadastro é feito pelo
    trigger; convites entram na Etapa 2.
- **Vendedor** lê a empresa e os colegas, mas não altera `empresas` nem `usuarios`, nem o
  próprio cadastro (senão poderia aumentar o próprio limite de desconto).
- Trigger `garantir_dono_ativo`: a empresa nunca fica sem um dono ativo.
- **RLS também no servidor.** O Drizzle conecta como `postgres`, que ignora RLS. Por isso toda
  query da área logada passa por `comUsuario(usuarioId, tx => …)`, que abre uma transação com
  `set_config('role','authenticated')` e as claims do JWT. As mesmas policies que protegem o
  navegador protegem o servidor. Um bug de "esqueci o `where empresa_id`" vira zero linhas, não
  vazamento.
- **Acesso administrativo** (ignora RLS) fica isolado em `src/server/db/admin.ts`, com
  `import 'server-only'`. Hoje há um único uso: `buscarEmpresaPublicaPorSlug`, que seleciona
  **só** `nome` e `slug` para a página pública.
- A **service role key não é usada** na Etapa 0. Nada sensível tem prefixo `NEXT_PUBLIC_`.
  Uma regra do ESLint impede componentes de importarem `@/server/db/*`.

## 4. Cadastro atômico via trigger em `auth.users`

Requisito: criar usuário do Auth, empresa, usuário dono e auditoria "em uma transação".

- A server action valida com Zod, normaliza o WhatsApp para E.164, gera o `slug_base` com
  `gerarSlug` do domínio e chama `supabase.auth.signUp()` com esses dados nos metadados.
- O trigger `on_auth_user_created` (`public.criar_conta_dono`, security definer) roda **na mesma
  transação do insert do GoTrue**. Ele resolve o slug (sufixo `-2`, `-3`… com
  `pg_advisory_xact_lock`), cria a empresa em trial de 14 dias, o usuário `dono` e a auditoria
  `conta.criada`. Se qualquer parte falhar, o Postgres desfaz tudo, **inclusive o usuário do
  Auth**, sem código de compensação.
- Por que não `admin.createUser` + inserts: seriam duas transações (Auth e app) e exigiria
  service role e rollback manual, com risco de usuário órfão.
- O trigger só age quando os metadados trazem `nome_buffet`. Assim o convite de usuários
  (Etapa 2) pode criar usuários do Auth por outro caminho.
- O banco revalida tudo (enum de segmento, regex de E.164, regex/tamanho do slug, nome não
  vazio), porque qualquer pessoa com a anon key pode chamar `signUp` direto.
- Se o banco recusar o cadastro, o GoTrue devolve "Database error saving new user", que
  traduzimos para uma mensagem simples.

## 5. Autenticação

- **Confirmação de e-mail desligada no MVP** (`enable_confirmations = false`) para o dono cair
  direto no painel. Isso atende a meta de ver o link funcionando em até 10 minutos. Para ligar:
  basta ativar no Supabase, o código já trata signup sem sessão ("enviamos um link de
  confirmação").
- Sessão por cookies com `@supabase/ssr`. O middleware renova a sessão e aplica: `/app/**` exige
  sessão (`/login?next=…`); logado em `/login` ou `/cadastro` vai para `/app/leads`. O `next` é
  sanitizado contra open redirect.
- `usuarioAtual()` lê usuário e empresa **via RLS**. Se há sessão no Auth mas não há acesso ao
  painel (inativo, sem cadastro), `exigirSessao()` manda para `/auth/sair?motivo=sem-acesso`,
  que encerra a sessão. Sem isso haveria loop login ↔ painel.
- `exigirPerfil('dono', …)` é o guard de servidor para páginas e actions. O RLS continua sendo
  a barreira final.
- **Recuperação de senha:** `resetPasswordForEmail` → e-mail → `/auth/confirm` → `/nova-senha`.
  O template do repositório (`supabase/templates/recovery.html`) usa `token_hash`, que funciona
  mesmo abrindo o e-mail em outro navegador. `/auth/confirm` também aceita `code` (PKCE, template
  padrão do Supabase), caso o template do projeto cloud não tenha sido trocado. A resposta
  é sempre a mesma, exista ou não a conta (não revela e-mails cadastrados).
- A troca de senha grava auditoria `usuario.senha_redefinida`.
- Senha mínima de 8 caracteres (no Zod e em `config.toml`).

## 6. Domínio puro e testado

- `money`: centavos inteiros; `pct` usa `BigInt` e arredonda **meio para cima, afastando do
  zero** (simétrico para negativos). Os exemplos do documento de produto viram testes
  (5% de 7.402,50 = 370,13; 30% de 7.032,37 = 2.109,71).
- `formatBRL` monta a string manualmente, com espaço comum (o `Intl` usa espaço não separável,
  o que atrapalha comparações e testes).
- `dates`: distingue **instante** (convertido para o fuso) de **data civil** `yyyy-MM-dd`
  (nunca convertida). Isso evita o erro clássico de "a festa mudou de dia" perto da meia-noite.
- `phone`: `libphonenumber-js/max`, para distinguir celular de fixo e validar DDD.
  O schema de cadastro fica em arquivo separado para o login não carregar essa lib
  (bundle do login: 208 kB → 159 kB).
- Schemas Zod em `src/domain/validacao` são os mesmos no formulário e na server action.

## 7. Layout e identidade

- Tokens em CSS variables no `:root` com `.dark` preparado (sem toggle). Cores do guia: primária
  `#7C5CD6`, fundo `#FAFAFC`, texto `#16141F`, superfície escura `#1A1625`. Manrope via
  `next/font`. Raios: `rounded-card` 12px, `rounded-control` 10px.
- Mobile primeiro: barra inferior com 4 itens no celular e sidebar no desktop (`md`). Alvos de
  toque de 44px e inputs com `text-base` (evita zoom no iOS).
- **"+ Orçamento"**: um único botão fixo, no canto inferior direito, acima da barra no celular.
  Desabilitado, com tooltip "Disponível em breve"; um wrapper focável permite o tooltip mesmo
  com o botão desabilitado.
- Segmento no cadastro como cartões de rádio em vez de select (melhor no celular).

## 8. Página pública `/b/[slug]`

- Valida o formato do slug antes de consultar. Busca só `nome` e `slug`. Slug inexistente
  responde 404 com página amigável.

## 9. Testes

- **Unitários** (`tests/unit`): domínio, mapeamento de erros, redirecionamento seguro, guards.
- **Integração** (`tests/integration`): rodam SQL real contra o banco local assumindo a
  identidade de cada usuário (`role authenticated` + claims), como o Supabase faz. Cobrem
  isolamento A×B em `empresas`, `usuarios` e `auditoria`; permissões do vendedor e do dono;
  `anon`; cadastro atômico (incluindo falha no meio, depois de criar a empresa) e sufixo de
  slug. Cada teste roda numa transação desfeita no final.
  - Sem Docker: `TEST_DB_SHIM=1` recria um Postgres puro `*_test` com um shim mínimo do schema
    `auth` (roles, `auth.users`, `auth.uid()`) que reproduz os privilégios padrão do Supabase.
    Assim os `REVOKE`s também são testados.
  - Os testes foram validados por mutação: afrouxando policies ou o trigger, 16 testes falham.
- **E2E** (`tests/e2e`, Playwright): celular 375×812 e desktop 1280×800. Cobrem cadastro
  completo, logout, login (com `next`), acesso negado, erros amigáveis, máscara de WhatsApp,
  recuperação de senha lendo o e-mail no Mailpit, navegação pelas 4 áreas sem rolagem
  horizontal e a página pública.

## 10. CI

GitHub Actions em todo PR e em push para `main` e `claude/**`:

- `qualidade`: lint, prettier, typecheck e unitários.
- `integracao-e2e`: `supabase start` (sem serviços desnecessários), integração, build e E2E.
  Em caso de falha, anexa o relatório do Playwright.
