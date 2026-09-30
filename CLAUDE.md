# Orkestra

SaaS para buffets de festas no Brasil: um link público onde o cliente final monta sozinho o
orçamento da festa, vê o preço e pede pré-reserva ou visita. O dono só é acionado quando o
cliente quer reservar. Uso majoritário no celular.

Documento de referência do produto: "Orkestra: Estrutura Lógica do Sistema". Decisões técnicas:
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Itens adiados: [`docs/PROXIMOS_PASSOS.md`](docs/PROXIMOS_PASSOS.md).

## Stack

- Next.js 15 (App Router, Server Components, Server Actions) + TypeScript strict
- Supabase: Postgres, Auth (e-mail e senha), Storage. Local com Supabase CLI (Docker)
- Drizzle ORM (driver `postgres`) para queries tipadas; migrations SQL em `supabase/migrations`
- Tailwind CSS v4 + shadcn/ui + lucide-react
- Zod (schemas compartilhados cliente/servidor) + react-hook-form
- date-fns + date-fns-tz (fuso padrão America/Sao_Paulo), libphonenumber-js
- Vitest (unit + integração) e Playwright (E2E)
- pnpm, Node 22 (`.nvmrc`)
- Deploy: Vercel (app) + Supabase Cloud (banco). CI: GitHub Actions

Não adicione dependências fora dessa lista sem perguntar.

## Estrutura

```
src/
  app/
    (auth)/          login, cadastro, recuperar-senha, nova-senha
    (app)/app/       área logada: leads, agenda, numeros, empresa
      empresa/       Minha empresa: identidade (page), agenda-config, catalogo (+ pacotes/[id],
                     opcionais/[id]), regras, usuarios, plano, simulador
    auth/            rotas técnicas: confirm (link do e-mail), sair
    b/[slug]/        página pública do buffet
  components/
    ui/              shadcn (não misture regra de negócio aqui)
    app/             painel: sidebar, bottom-nav, header, empty states, toast
      campos/        campos reutilizáveis (dinheiro, %, duração, dias, telefone, upload…)
      form/          Secao (salvar por seção), Campo, FormInline, erros do servidor
      empresa/       peças de Minha empresa (listas, cards do catálogo, faixas de idade…)
    auth/            peças dos formulários de autenticação
  domain/            REGRAS DE NEGÓCIO PURAS: money, percent, phone, dates, slug, mascara, validacao/,
                     conversao (campos), senha, imagem, plano
    catalogo/        validações do catálogo, pendências do link público, resumos de preço
    preco/           motor de preço (calcularOrcamento, disponibilidade, aPartirDe, parcelas)
    modelos/         modelos de segmento (infantil, eventos, domicilio) validados com Zod
  server/
    db/              client, schema (espelho das migrations), tenant (comUsuario), admin (sem RLS)
    actions/         server actions (auth, simulador, empresa/* da configuração)
    catalogo/        carregar (ContextoPreco via RLS), gravar-modelo, aplicar-modelo
    auth/            cliente Supabase do servidor, sessão, guards, redirecionamento,
                     admin-supabase (Admin API com service role, só servidor)
    usuarios/        criar/desativar vendedor (dependências injetadas)
    env.ts, erros.ts
  lib/               utilitários de UI (cn)
  middleware.ts      sessão + proteção de /app/**
supabase/
  migrations/        SQL versionado (tabelas, RLS, funções, triggers): FONTE DA VERDADE do banco
  seed.sql           dados fictícios de desenvolvimento
  templates/         templates de e-mail do Auth
tests/
  unit/ integration/ e2e/ support/
docs/
```

## Regra de ouro

Lógica de negócio mora em `src/domain` como **funções puras testadas**: sem banco, sem React,
sem Next (o ESLint bloqueia esses imports). Componentes e server actions só orquestram:
validam entrada, chamam o domínio, leem e gravam no banco.

## Convenções

- **Dinheiro:** sempre inteiro em centavos (`formatBRL`, `parseBRL`, `pct`, `pctBp` em
  `domain/money`). Proibido float para dinheiro. Arredondamento meio para cima.
- **Percentuais e fatores:** inteiro em basis points (1% = 100 bp), aplicados com `pctBp` e
  exibidos com `formatBp`. **Durações:** minutos inteiros.
- **Telefone:** sempre E.164 no banco (`+5534991355450`). Exibição com `formatPhoneBR`.
- **Datas:** instantes em UTC (`timestamptz`), exibidos no fuso da empresa (`empresas.fuso`).
  Datas civis (dia do evento) como `yyyy-MM-dd`, sem conversão de fuso. Formato "14/11/2026".
- **Interface em pt-BR**, com mensagens simples ("E-mail ou senha incorretos."), nunca técnicas.
  Erros do Supabase passam por `server/erros.ts`.
- **Nomes:** português para domínio (`empresa`, `usuario`, `cadastrar`, `exigirPerfil`) e
  inglês para termos técnicos (`client`, `schema`, `middleware`, `props`).
- **Termos fixos do produto:** Lead, Orçamento, Proposta, Pré-reserva, Reserva, Pacote,
  Opcional, Turno, Espaço.
- **ids:** sempre uuid. Nunca expor ids sequenciais.

## Multiempresa e segurança

- Toda tabela de negócio tem `empresa_id` e RLS ligado. Policies usam
  `public.empresa_do_usuario()` e `public.perfil_do_usuario()`.
- No servidor, queries da área logada usam `comUsuario(usuario.id, tx => …)` (`server/db/tenant.ts`):
  a transação roda como `authenticated` com as claims do usuário, então o RLS vale também aqui.
- `server/db/admin.ts` ignora RLS: só para casos revisados (ex.: página pública por slug),
  expondo o mínimo, com `import 'server-only'`.
- Nada de service role nem `DATABASE_URL` no navegador (nunca prefixo `NEXT_PUBLIC_`).
  `SUPABASE_SERVICE_ROLE_KEY` só é lida em `server/auth/admin-supabase.ts` (`server-only`); o
  ESLint impede importá-lo em componentes, `lib`, páginas e middleware.
- Imagens: bucket público `midia`, caminho `{empresa_id}/{logo|capa|pacotes}/{uuid}.webp`; o
  navegador converte para WEBP e envia; a server action valida o caminho e grava.
- Server action de configuração: `acaoDoDono` + schema Zod compartilhado + `comUsuario` +
  auditoria (`antes`/`depois`) + `revalidatePath` (`server/actions/empresa/comum.ts`).
- Guard de perfil: `await exigirPerfil('dono')` em páginas e actions restritas.
- Nova tabela = migration com RLS, policies, grants mínimos, teste de integração de isolamento
  e espelho em `server/db/schema.ts` (catálogo em `server/db/schema-catalogo.ts`).
- Tabela filha usa FK composta `(pai_id, empresa_id)` → `(id, empresa_id)` do pai.
- O preço é calculado **sempre no servidor** com `calcularOrcamento`; "hoje" e o limite de
  desconto vêm do servidor, nunca do navegador.

## Comandos

| Comando                                        | O que faz                                               |
| ---------------------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                                     | App em http://localhost:3000                            |
| `pnpm build` / `pnpm start`                    | Build e servidor de produção                            |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Qualidade                                               |
| `pnpm test`                                    | Vitest: unitários + integração (precisa do banco local) |
| `pnpm test:unit`                               | Só unitários (não precisa de banco)                     |
| `pnpm test:coverage`                           | Unitários com cobertura (mínimo de 95% no motor)        |
| `pnpm test:integration`                        | Integração: RLS, cadastro, slug (banco local)           |
| `pnpm test:e2e`                                | Playwright (sobe o app; precisa do Supabase local)      |
| `pnpm db:start` / `pnpm db:stop`               | Sobe/para o Supabase local (Docker)                     |
| `pnpm db:reset`                                | Recria o banco local do zero: migrations + seed         |
| `pnpm db:migrate`                              | Aplica migrations pendentes no banco local              |
| `pnpm db:seed`                                 | Roda `supabase/seed.sql` (idempotente)                  |

## Como rodar localmente

1. Node 22, pnpm 10 e Docker rodando.
2. `pnpm install`
3. `pnpm db:start` (primeira vez baixa as imagens). Anote a API URL, a anon key e a DB URL
   (ou rode `pnpm exec supabase status`).
4. `cp .env.example .env.local` e preencha com esses valores.
5. `pnpm db:reset` para recriar o banco com o seed.
6. `pnpm dev` e abra http://localhost:3000.

Contas do seed (senha `demo12345`): `dono@demo.local` (dono) e `vendedor@demo.local` (vendedor)
do **Buffet Demo** (com o catálogo do modelo infantil), e `dono@testeb.local` do **Buffet Teste B**
(catálogo vazio). Página pública:
http://localhost:3000/b/buffet-demo. E-mails locais (recuperação de senha): http://127.0.0.1:54324.

Sem Docker, a integração roda num Postgres puro com shim do schema `auth`:
`TEST_DB_SHIM=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/orkestra_test pnpm test:integration`.

## Ambiente

- **Repositório:** `guilhermeranulfo17/TRIMFLOW`. Etapas 0 (PR #1) e 1 (PR #2) na `main`.
- **App (produção):** a Vercel está ligada ao repositório e publica a `main` automaticamente em
  https://trimflow-tau.vercel.app.
- **Banco (produção):** Supabase, projeto `orkestra`, ref `nsqoenggvshzkhbpurfi`, região
  `sa-east-1`.
  - As migrations da Etapa 0 (`20260930000001_fundacao`, `20260930000002_rls`,
    `20260930000003_cadastro`) já foram aplicadas manualmente. **Não reaplique.**
  - Etapa 1 (já aplicadas): `20261001000001_catalogo_config`,
    `20261001000002_catalogo_pacotes_opcionais`, `20261001000003_catalogo_rls`.
  - Etapa 2 (a aplicar pelo dono antes do merge, nesta ordem): `20261002000001_empresa_identidade`,
    `20261002000002_slugs_antigos`, `20261002000003_storage_midia`,
    `20261002000004_sincronizar_email`.
- **Variáveis na Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL` e, desde a Etapa 2, `SUPABASE_SERVICE_ROLE_KEY`
  (secreta; sem ela, criar vendedor não funciona).
  - Quem aplica migrations em produção é o dono do projeto, manualmente. Nunca aplique
    migration nem rode o seed no banco de produção.
- **Auth:** confirmação de e-mail desligada no Supabase por enquanto.
- **Fluxo de trabalho:**
  - Cada etapa em uma **branch nova**, com **PR para a `main`**.
  - Toda migration nova vai em **arquivo novo** em `supabase/migrations`. Nunca edite uma
    migration já aplicada.
  - O relatório final de cada etapa **lista as migrations novas**, na ordem de aplicação, para o
    dono aplicar no banco de produção.

## Forma de trabalho

- Etapas pequenas e verificáveis. Não antecipe funcionalidades de etapas futuras; anote em
  `docs/PROXIMOS_PASSOS.md`.
- Commits pequenos no formato `tipo(escopo): descrição` em português.
- Rode lint, typecheck e testes a cada bloco; não avance com teste quebrado.
- Ambiguidade: escolha a opção mais simples que não bloqueie as próximas etapas e registre em
  `docs/ARQUITETURA.md`.
