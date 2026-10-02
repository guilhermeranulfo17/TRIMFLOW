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
- PDF da proposta: `@react-pdf/renderer` (servidor, sem navegador headless) e `sharp` (logo WEBP
  → PNG), fonte Manrope TTF no repositório (OFL)
- Avisos: `web-push` (VAPID) para o push do PWA; WhatsApp pela Cloud API oficial da Meta com
  `fetch` (sem SDK; proibido API não oficial)
- pnpm, Node 22 (`.nvmrc`)
- Deploy: Vercel (app) + Supabase Cloud (banco). CI: GitHub Actions

Não adicione dependências fora dessa lista sem perguntar.

## Estrutura

```
src/
  app/
    (auth)/          login, cadastro, recuperar-senha, nova-senha
    (app)/app/       área logada: leads (caixa) e leads/[id] (detalhe com ações), tarefas, agenda
                     (lista/calendário/painel do dia), numeros, empresa, orcamentos (novo,
                     [id]/editar, [id]/pdf), avisos (histórico), conta/avisos (Minha conta)
      empresa/       Minha empresa: identidade (page), agenda-config, catalogo (+ pacotes/[id],
                     opcionais/[id]), regras, follow-up, usuarios, plano, simulador,
                     proposta-exemplo
    api/avisos/      processar (POST, Bearer CRON_SECRET) e contagem (GET, sino)
    manifest.ts      PWA (ícones em public/icones; service worker em public/sw.js)
    auth/            rotas técnicas: confirm (link do e-mail), sair
    b/[slug]/        página pública do buffet, orcamento (wizard), proposta/[token] (+ /pdf)
    (legal)/         privacidade e termos
  components/
    ui/              shadcn (não misture regra de negócio aqui)
    app/             painel: sidebar, bottom-nav, header, empty states, toast
      campos/        campos reutilizáveis (dinheiro, %, duração, dias, telefone, upload…)
      form/          Secao (salvar por seção), Campo, FormInline, erros do servidor
      empresa/       peças de Minha empresa (listas, cards do catálogo, faixas de idade…)
      orcamento/     "+ Orçamento" (formulário, calendário da agenda, saídas, orçamentos do lead)
      leads/         caixa (topo Hoje, filtros, cartões), ações do lead, tarefas, mensagem pronta
      avisos/        sino, preferências, push neste aparelho, WhatsApp, aviso de teste
    orcamento/       peças compartilhadas do wizard e do orçamento interno (contador)
    proposta/        proposta na web (desenha o ModeloProposta)
    auth/            peças dos formulários de autenticação
  domain/            REGRAS DE NEGÓCIO PURAS: money, percent, phone, dates, slug, mascara, validacao/,
                     conversao (campos), senha, imagem, plano
    catalogo/        validações do catálogo, pendências do link público, resumos de preço
    agenda/          intervalo do slot, estado do slot, calendário, mensagens (= regra do SQL)
    preco/           motor de preço (calcularOrcamento, disponibilidade, aPartirDe, parcelas)
    publico/         link público: passos, prévia por modo de preço, vitrine, cor, WhatsApp,
                     status do lead (= regra do SQL)
    leads/           caixa e ações: prioridade (grupo e motivo, = regra do SQL), filtros da URL,
                     mensagens prontas, motivos de perda, adiar, temperatura por inatividade,
                     linha do tempo
    proposta/        modelo único da proposta (web e PDF), conteúdo congelado, abertura,
                     diferenças entre versões, validade, temperatura (= regra do SQL), arquivo,
                     festa de exemplo
    modelos/         modelos de segmento (infantil, eventos, domicilio) validados com Zod
    avisos/          textos (painel, push e variáveis do WhatsApp), silêncio, canais, destinatário,
                     agrupamento (= regras do SQL)
    follow-up/       as 8 regras de tarefa automática (avaliarRegra = _follow_up_avaliar), títulos
  server/
    db/              client, schema (espelho das migrations), tenant (comUsuario), anon (comAnon),
                     admin (sem RLS)
    actions/         server actions (auth, simulador, leads, agenda, orcamentos, empresa/*)
    catalogo/        carregar (ContextoPreco via RLS), gravar-modelo, aplicar-modelo
    auth/            cliente Supabase do servidor, sessão, guards, redirecionamento,
                     admin-supabase (Admin API com service role, só servidor)
    usuarios/        criar/desativar vendedor (dependências injetadas)
    agenda/          leituras da agenda (disponibilidade, reservas, bloqueios) e erros
    publico/         leituras do link público (cache por slug), hash de IP, modo teste
    leads/           leituras da caixa (caixa_leads, resumo_hoje) e do detalhe do lead, erros
    tarefas/         leituras da tela de Tarefas
    proposta/        carregador da proposta (público e painel), versão a gravar, PDF, fontes,
                     proposta de exemplo
    orcamentos/      leituras do orçamento interno (base de preço, lead por WhatsApp, edição)
    avisos/          processador da fila, canais (push, whatsapp) com dependências injetadas,
                     leituras (sino, histórico, preferências, regras de follow-up)
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
- **Visual do painel:** só escuro (tokens em `globals.css`, ligados por `data-painel`; ver
  `docs/ARQUITETURA.md` §44). Use os tokens (`bg-card`, `bg-primary`, `bg-destaque`…) e, para
  estados, tons translúcidos (`bg-amber-400/10 text-amber-300`); nada de fundos claros fixos
  (`bg-white`, `bg-*-50`). Link público, proposta e login continuam claros.

## Multiempresa e segurança

- Toda tabela de negócio tem `empresa_id` e RLS ligado. Policies usam
  `public.empresa_do_usuario()` e `public.perfil_do_usuario()`.
- No servidor, queries da área logada usam `comUsuario(usuario.id, tx => …)` (`server/db/tenant.ts`):
  a transação roda como `authenticated` com as claims do usuário, então o RLS vale também aqui.
- `server/db/admin.ts` ignora RLS: só para casos revisados, expondo o mínimo, com
  `import 'server-only'`.
- **Link público:** só pelas funções do schema `publico` (fora da API do Supabase, `execute` só
  para `anon`), chamadas pelo servidor com `comAnon(tx => …)`. `anon` não lê tabela nenhuma.
  Funções com token também exigem o slug. O navegador manda só escolhas; preço, "hoje",
  desconto (zero) e modo teste (sessão) são do servidor. Antes do WhatsApp o navegador nunca
  recebe tabela de preço. IP só como `sha256(ip + IP_HASH_SALT)`; nada pessoal em logs.
- **Leads e orçamentos** só são escritos pelas funções `publico.*`, da agenda, do orçamento
  interno (`salvar_orcamento_interno`, `pre_reservar_orcamento`, `marcar_orcamento_enviado`) e
  das ações do lead (`registrar_contato`, `marcar_perdido`, `reabrir_lead`…). A regra de
  status do lead existe no SQL (`_lead_transicao`, `_lead_status_reaberto`) e em
  `domain/publico/status-lead`, com teste de equivalência: mudou uma, mude a outra.
- **Avisos (Etapa 7):** nascem no banco, na transação do evento (triggers `atividades_avisos` e
  `leads_esquentou`, jobs `gerar_avisos_tempo`), sempre por `_aviso_criar` (chave única,
  agrupamento de 10 min, silêncio, lead de teste ignorado). Envio **fora** de transação:
  `reservar_entregas` (skip locked, aluguel de 2 min) → canal → `concluir_entrega` (1/5/15/60
  min, `falhou` na 5ª), só pelo `server/avisos/processar` (rota com `CRON_SECRET` e `after()`).
  Silêncio, canais, destinatários e follow-up existem no SQL e em `domain/avisos` e
  `domain/follow-up`, com teste de equivalência: mudou uma, mude a outra. Nenhuma mensagem
  automática ao cliente final. Logs da fila só com ids e códigos.
- **Notas, tarefas e visitas** só são escritas pelas funções da Etapa 6 (`adicionar_nota`,
  `criar_tarefa`, `adiar_tarefa`, `confirmar_visita`…), que travam o lead e gravam auditoria.
  Tarefa automática (Etapa 7) usa `origem = 'regra'` e `regra`: o índice
  `tarefas_regra_aberta_idx` permite só uma aberta por regra em cada lead. Quando lead e agenda
  são travados juntos, a ordem é sempre agenda → lead.
- **Caixa de leads:** grupo e ordem existem no SQL (`_lead_grupo`, `_lead_ordem`) e em
  `domain/leads/prioridade`; temperatura por inatividade em `_temperatura_inatividade` e
  `domain/leads/temperatura`. Testes de equivalência: mudou uma, mude a outra. Componente
  cliente de Leads importa módulos específicos de `domain/leads` (nunca o índice) e nunca
  `domain/phone`: o telefone chega formatado do servidor.
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
  desconto vêm do servidor, nunca do navegador. O banco confere de novo o limite do vendedor.
- **Versões:** alterar um orçamento cria uma versão nova (mesmo número, outra linha, outro
  token); a anterior vira `substituido` e nunca muda. Token antigo abre a vigente. Tudo passa
  por `_orcamento_concluir` (ver `docs/ARQUITETURA.md` §32–33).
- **Proposta:** web e PDF desenham o mesmo `ModeloProposta` (`montarConteudo`). Condições,
  cardápio e textos ficam congelados em `orcamentos.conteudo`; identidade do buffet é ao vivo.
  `publico.proposta` e o PDF nunca levam observações internas, motivo do desconto nem autor.
- **Catálogo usado em orçamento não é excluído, só desativado** (trigger
  `CATALOGO_ITEM_EM_USO`; telas usam `carregarEmUso`).
- Temperatura por aberturas existe no SQL (`_temperatura_aberturas`) e em
  `domain/proposta/temperatura`, com teste de equivalência: mudou uma, mude a outra.
- **Agenda:** `reservas` e `bloqueios` só são escritos pelas funções SQL (`criar_reserva`,
  `criar_bloqueio`…), que travam a empresa e checam conflito. Nunca escreva nessas tabelas pelo
  Drizzle. A regra de ocupação existe no SQL e em `domain/agenda`, com teste de equivalência:
  mudou uma, mude a outra.

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
| `pnpm db:seed:volume`                          | Empresa com 5.000 leads para medir a caixa (só local)   |
| `pnpm vapid:gerar`                             | Gera o par de chaves VAPID do push (para a Vercel)      |

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
(catálogo vazio). O Buffet Demo tem 25 leads em estados diferentes (seed), entre eles um
orçamento com 3 versões, um interno com desconto e avulso, uma proposta vencida, um lead
quente por aberturas, perdidos com motivos, visita confirmada para hoje, pedido de visita,
tarefas atrasadas, de hoje e futuras, e notas; desde a Etapa 7, avisos lidos e não lidos de
todos os tipos, preferências (o vendedor com silêncio 23:00–08:00), a regra "segundo toque"
desligada e tarefas automáticas abertas e uma cancelada. `pnpm db:seed:volume` cria o **Buffet Volume**
(`dono@volume.local`, 5.000 leads) para o `explain analyze` da caixa. Página pública:
http://localhost:3000/b/buffet-demo (logado como dono, abre em modo teste). E-mails locais (recuperação de senha): http://127.0.0.1:54324.

Sem Docker, a integração roda num Postgres puro com shim do schema `auth`:
`TEST_DB_SHIM=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/orkestra_test pnpm test:integration`.

## Ambiente

- **Repositório:** `guilhermeranulfo17/TRIMFLOW`. Etapas 0 a 6 e o visual escuro (PRs #1 a #8)
  na `main`.
- **App (produção):** a Vercel está ligada ao repositório e publica a `main` automaticamente em
  https://trimflow-tau.vercel.app.
- **Banco (produção):** Supabase, projeto `orkestra`, ref `nsqoenggvshzkhbpurfi`, região
  `sa-east-1`.
  - **Migrations são aplicadas automaticamente** pelo workflow
    `.github/workflows/migrations-producao.yml` no merge para a `main` (`supabase db push`).
    Nada de aplicar à mão, nada de `migration repair`, `--include-all` ou reset. Todo PR mostra
    no job "Migrations que serão aplicadas no merge" o dry-run contra produção.
  - Segredos do GitHub usados pelo workflow: `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`.
- **Variáveis na Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, desde a Etapa 2 `SUPABASE_SERVICE_ROLE_KEY`
  (secreta; sem ela, criar vendedor não funciona) e, desde a Etapa 4, `IP_HASH_SALT`
  (secreta; obrigatória: sem ela o servidor não sobe). Desde a Etapa 7: `CRON_SECRET`
  (secreta), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secreta), `VAPID_SUBJECT`,
  `WHATSAPP_TOKEN` (secreta) e `WHATSAPP_PHONE_NUMBER_ID`; faltar alguma só desliga o canal,
  com aviso no log. URL do site e o mesmo `CRON_SECRET` também no **Supabase Vault**
  (`orkestra_site_url`, `orkestra_cron_secret`) para o `pg_cron` chamar a fila: ver
  `docs/AVISOS_CONFIGURACAO.md`. Modelos do WhatsApp: `docs/WHATSAPP_MODELOS.md`.
  - O schema `publico` **não** pode entrar em Settings → API → Exposed schemas do Supabase.
  - Nunca rode o seed nem comandos manuais no banco de produção.
- **Auth:** confirmação de e-mail desligada no Supabase por enquanto.
- **Fluxo de trabalho:**
  - Cada etapa em uma **branch nova**, com **PR para a `main`**.
  - Toda migration nova vai em **arquivo novo** em `supabase/migrations`. Nunca edite uma
    migration já aplicada.
  - **Expandir → contrair.** A Vercel publica o código ao mesmo tempo que o workflow aplica as
    migrations, então toda migration precisa funcionar com o código da versão anterior:
    - Pode: criar tabela, coluna nullable ou com default, função, policy, índice.
    - Não pode na mesma entrega: renomear ou apagar coluna/tabela usada pelo código em
      produção, nem tornar coluna obrigatória sem default. Isso se faz em duas entregas:
      primeiro o código deixa de usar, depois a migration remove.
  - O relatório final de cada etapa lista as migrations novas (só para registro: o workflow
    aplica no merge).

## Forma de trabalho

- Etapas pequenas e verificáveis. Não antecipe funcionalidades de etapas futuras; anote em
  `docs/PROXIMOS_PASSOS.md`.
- Commits pequenos no formato `tipo(escopo): descrição` em português.
- Rode lint, typecheck e testes a cada bloco; não avance com teste quebrado.
- Ambiguidade: escolha a opção mais simples que não bloqueie as próximas etapas e registre em
  `docs/ARQUITETURA.md`.
