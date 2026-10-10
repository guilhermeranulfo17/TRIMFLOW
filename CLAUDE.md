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
- QR code do link: `uqr` (sem dependências, só no servidor); PNG pelo `sharp`, PDF pelo
  `@react-pdf/renderer`. Gráficos de Números em SVG próprio (sem biblioteca de gráficos)
- pnpm, Node 22 (`.nvmrc`)
- Deploy: Vercel (app) + Supabase Cloud (banco). CI: GitHub Actions

Não adicione dependências fora dessa lista sem perguntar.

## Estrutura

```
src/
  app/
    (auth)/          login (+ verificacao: código da MFA), cadastro (+ completar, para quem entrou
                     pelo Google), recuperar-senha, nova-senha; layout dividido no PC
    (aceite)/app/aceite/  aceite dos Termos e da Privacidade novos (Etapa 9B)
    (marketing)/     landing em `/` (Etapa 9.6): página de vendas estática, imagem de compartilhamento
    (onboarding)/app/comecar/  onboarding guiado em 5 passos (tela cheia, sem menu)
    (app)/app/       área logada: leads (caixa em Lista ou Funil) e leads/[id] (detalhe com ações), tarefas, agenda
                     (lista/calendário/painel do dia), numeros, empresa, orcamentos (novo,
                     [id]/editar, [id]/pdf), avisos (histórico), conta/avisos e conta/seguranca
                     (Minha conta: avisos e MFA), numeros (Números), leads/[id]/exportar (LGPD),
                     contratos (lista com filtros, [id] detalhe com ações e
                     histórico, [id]/pdf, novo: prévia e envio, modelos), financeiro (+ [reservaId]),
                     clientes (+ [id]: ficha com as festas)
      empresa/       Minha empresa: identidade (page), agenda-config, catalogo (+ pacotes/[id],
                     opcionais/[id]), regras, follow-up, usuarios, plano (assinar, faturas,
                     cancelar, acesso do suporte), simulador, privacidade (+ exportar: ZIP),
                     proposta-exemplo, link (divulgação + qr: PNG e PDF + editor da página
                     pública com prévia, Etapa 9.5)
    api/avisos/      processar (POST, Bearer CRON_SECRET) e contagem (GET, sino)
    api/demo/        recriar (POST, Bearer CRON_SECRET): conta de demonstração do dia
    demo/entrar      POST da landing: entra na demo sem senha (sessão de 2 h)
    api/lgpd/        processar (POST, Bearer CRON_SECRET): exclusão definitiva das contas
    api/saude/       GET público para o monitor de disponibilidade (200/503)
    api/landing/     contar (POST, visitas e cliques agregados da landing)
    robots.ts, sitemap.ts  indexação (landing, termos, privacidade e vitrines)
    api/cobranca/    asaas (webhook, token no header) e reconciliar (POST, Bearer CRON_SECRET)
    interno/         equipe Orkestra (ORKESTRA_ADMINS + MFA): entrar, mfa, visão geral,
                     empresas/[id] (ações auditadas, "Entrar como esta empresa")
    manifest.ts      PWA (ícones em public/icones; service worker em public/sw.js)
    auth/            rotas técnicas: confirm (link do e-mail), callback (Google), sair
    b/[slug]/        página pública do buffet (vitrine com estilo), orcamento (wizard),
                     proposta/[token] (+ /pdf), contrato/[token] (+ /pdf), opengraph-image
    (legal)/         privacidade, termos (com o acordo de operador) e subprocessadores (modelos)
  components/
    ui/              shadcn (não misture regra de negócio aqui)
    app/             painel: sidebar, bottom-nav, header, empty states, toast
      campos/        campos reutilizáveis (dinheiro, %, duração, dias, telefone, upload…)
      form/          Secao (salvar por seção), Campo, FormInline, erros do servidor
      empresa/       peças de Minha empresa (listas, cards do catálogo, faixas de idade…)
      orcamento/     "+ Orçamento" (formulário, calendário da agenda, saídas, orçamentos do lead)
      leads/         caixa (topo Hoje, filtros, cartões), ações do lead, tarefas, mensagem pronta
      avisos/        sino, preferências, push neste aparelho, WhatsApp, aviso de teste
      onboarding/    faixa, checklist, "Fiz" da bio e os passos de /app/comecar (comecar/)
      divulgacao/    link com Copiar, textos prontos, QR (prévia + downloads)
      pagina/        editor da página pública (textos e estilo, galeria, depoimentos,
                     perguntas) e prévia em iframe
      numeros/       cartões, funil, origem, perdas, atendimento, ocupação (SVG próprio)
      plano/         escolher plano, cancelar e suporte, faixa da conta, faixa do suporte
    interno/         formulários e ações do /interno
    orcamento/       peças compartilhadas do wizard e do orçamento interno (contador)
    proposta/        proposta na web (desenha o ModeloProposta)
    contrato/        texto do contrato (web e prévia) e o bloco "Assinar" do cliente
    publico/         vitrine (cabeçalho, carrossel, pacotes com gaveta, galeria com lightbox),
                     fontes dos estilos, cor da marca, rodapé
    auth/            peças dos formulários de autenticação
    marca/           logotipo (traçado da arte oficial) e símbolo (o "O" sobre o limão)
    marketing/       seções e ilhas da landing (cabeçalho, simulador, preços, abas, contagem/origem,
                     holofote e contador); landing toda escura, animações `ld-*` em globals.css
  domain/            REGRAS DE NEGÓCIO PURAS: money, percent, phone, dates, slug, mascara, validacao/,
                     conversao (campos), senha, forca-senha, tema, imagem, plano
    auth/            destino depois do login (destinoPosLogin, destinoSeguro)
    catalogo/        validações do catálogo, pendências do link público, resumos de preço
    agenda/          intervalo do slot, estado do slot, calendário, mensagens (= regra do SQL)
    preco/           motor de preço (calcularOrcamento, disponibilidade, aPartirDe, parcelas)
    publico/         link público: passos, prévia por modo de preço, vitrine, cor, WhatsApp,
                     status do lead (= regra do SQL), página (estilo, perguntas automáticas,
                     limites e diferenciais = regra do SQL, JSON-LD)
    leads/           caixa e ações: prioridade (grupo e motivo, = regra do SQL), filtros da URL,
                     funil (etapa = regra do SQL, movimentos),
                     mensagens prontas, motivos de perda, adiar, temperatura por inatividade,
                     linha do tempo
    contratos/       contrato digital: variáveis do modelo, valores por extenso, status, hash
                     (= SQL), CPF e nome, modelos padrão (infantil, domicílio, eventos)
    proposta/        modelo único da proposta (web e PDF), conteúdo congelado, abertura,
                     diferenças entre versões, validade, temperatura (= regra do SQL), arquivo,
                     festa de exemplo
    modelos/         modelos de segmento (infantil, eventos, domicilio) validados com Zod
    avisos/          textos (painel, push e variáveis do WhatsApp), silêncio, canais, destinatário,
                     agrupamento (= regras do SQL)
    follow-up/       as 8 regras de tarefa automática (avaliarRegra = _follow_up_avaliar), títulos
    onboarding/      passos, checklist (percentual), preços do passo 3 (faixas proporcionais)
    divulgacao/      textos prontos (bio, WhatsApp Business, post, status) com a origem certa
    numeros/         período, métricas, funil, ocupação e datas livres (= funções SQL de Números)
    financeiro/      plano de pagamento sugerido, situação da festa (parcelas pagas/atrasadas), resumo
    clientes/        quem é cliente (festas por lead ou WhatsApp), hora de chamar de novo, busca
    cobranca/        situação da conta (= _situacao_conta), limites (= _codigo_plano), CPF/CNPJ,
                     preços e cupom, eventos do Asaas (status monotônico = SQL), MRR, motivos
    marketing/       landing: preços da vitrine (desconto anual, itens), origem
                     do cadastro (UTM), JSON-LD, simulador (mesmo calcularOrcamento)
    legal/           versão vigente dos Termos e da Privacidade (VERSAO_DOCUMENTOS)
    email/           modelos dos e-mails da conta (HTML + texto, links absolutos)
    lgpd/            CSV das exportações
    seguranca/       CSP, nonce e cabeçalhos (middleware), 308 do domínio antigo
    observabilidade/ log estruturado (mascaramento), limpeza do Sentry, avaliação da saúde
  server/
    db/              client, schema (espelho das migrations), tenant (comUsuario, lerComo,
                     naTransacao), inline (parâmetros), anon (comAnon), admin (sem RLS)
    painel/          contexto do painel (painel_contexto: badges, sino, faixas, onboarding)
    tema/            leitura do cookie do tema
    actions/         server actions (auth, simulador, leads, agenda, orcamentos, empresa/*)
    catalogo/        carregar (ContextoPreco via RLS), gravar-modelo, aplicar-modelo
    auth/            cliente Supabase do servidor, sessão, guards, redirecionamento,
                     admin-supabase (Admin API com service role, só servidor)
    usuarios/        criar/desativar vendedor (dependências injetadas)
    agenda/          leituras da agenda (disponibilidade, reservas, bloqueios) e erros
    publico/         leituras do link público (cache por slug, página), hash de IP, modo teste
    pagina/          leitura do editor da página pública (RLS do dono)
    leads/           leituras da caixa (caixa_leads, resumo_hoje) e do detalhe do lead, erros
    tarefas/         leituras da tela de Tarefas
    clientes/        leituras da aba Clientes (lista e ficha)
    contratos/       contrato: carregar (link e painel), emitir, assinar, cifra do CPF e
                     token, e-mail do código, PDF com comprovante e Storage privado
    proposta/        carregador da proposta (público e painel), versão a gravar, PDF, fontes,
                     proposta de exemplo
    orcamentos/      leituras do orçamento interno (base de preço, lead por WhatsApp, edição)
    avisos/          processador da fila, canais (push, whatsapp) com dependências injetadas,
                     leituras (sino, histórico, preferências, regras de follow-up)
    onboarding/      estado do onboarding, resumo do modelo, preços, agenda rápida, checklist
    numeros/         public.numeros e numeros_ocupacao (cache por empresa e período)
    divulgacao/      QR code (SVG, PNG, PDF A4)
    cobranca/        cliente Asaas (fetch), fluxos (assinar, mudar, cancelar, implantação,
                     reconciliar) com dependências injetadas, webhook, leituras da tela de Plano
    interno/         guard (lista + aal2), leituras do /interno, sessão de suporte (cookie HMAC)
    marketing/       preços da landing (planos_vitrine em cache, tag planos-vitrine), exemplo do
                     simulador, contagem
    lgpd/            exportações (ZIP próprio), exclusão definitiva (deps injetadas), Privacidade
    seguranca/       limite de tentativas (publico.limite_acesso)
    saude/           dados do /api/saude (deps injetadas)
    demo/            conta de demonstração: recriar (deps injetadas) e entrada
    log.ts, cron.ts  log estruturado (logar, codigoDoErro) e autorização das rotas do pg_cron
    env.ts, erros.ts
  lib/               utilitários de UI (cn), opções do Sentry
  middleware.ts      cabeçalhos de segurança (CSP com nonce) em tudo + sessão e proteção de /app/**
  instrumentation*.ts  checagem do ambiente e Sentry (servidor só no ramo nodejs; navegador sob
                     demanda) e zod sem JIT no navegador (CSP sem eval)
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
- **Identidade e temas (Etapa 9.5, `docs/ARQUITETURA.md` §59 e §71):** grafite + limão
  `#B2F759` (o da logo); **nada de roxo** (teste `sem-roxo`). Painel com tema escolhido no menu da conta (cookie `orkestra_tema`:
  escuro padrão, claro, sistema) via `data-painel data-tema`; telas de acesso sempre no escuro
  (`data-acesso`); termos e privacidade no claro da marca (`data-orkestra-claro`); link público e
  proposta no claro neutro com a cor do buffet (padrão `#0F766E`). Use só tokens (`bg-card`,
  `bg-primary`, `bg-destaque`…); estados com `alerta`/`erro`/`sucesso`/`info`/`quente`
  (`bg-alerta/10 text-alerta border-alerta/30`), nunca `amber-300`/`rose-400` fixos; texto na cor
  primária com `text-primary-texto` (não `text-primary`). Nada de fundos claros fixos no painel.
  Token novo ou mudado passa pelo teste de contraste AA (`tests/unit/tema/contraste.test.ts`).

## Multiempresa e segurança

- Toda tabela de negócio tem `empresa_id` e RLS ligado. Policies usam
  `public.empresa_do_usuario()` e `public.perfil_do_usuario()`.
- No servidor, queries da área logada usam `comUsuario(usuario.id, tx => …)` (`server/db/tenant.ts`):
  a transação roda como `authenticated` com as claims do usuário, então o RLS vale também aqui.
  **Desempenho (Etapa 9.5, §60):** conexão reservada, `BEGIN` + identidade na mesma ida e
  parâmetros inline (`server/db/inline.ts`): consultas disparadas juntas (`Promise.all`) vão em
  pipeline. Cada tela abre **uma** transação e passa `tx` aos loaders (`naTransacao`); badges,
  sino, faixas e onboarding vêm de `carregarContextoPainel` (`painel_contexto()`, uma ida,
  memoizado). Nunca passe `tx` para dentro de `unstable_cache` (o callback pode rodar depois, em
  outra conexão). Orçamento de idas no CI (`tests/integration/idas-banco.test.ts`): tela nova
  ou loader novo entra lá. No painel, **nenhum `loading.tsx` nem `<Suspense>` em `page.tsx`**: a
  tela às vezes não trocava depois de uma ação (§60, teste `sem-suspense-de-pagina`); Suspense só
  no layout e retorno imediato pelo `PendenteLink`/`useTransition`.
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
- **E-mail (Etapa 9B, §66):** canal `email` da mesma fila, só para o dono e só os avisos da
  conta (`_aviso_email` = `recebeEmail`, equivalência). Resend por `fetch` com
  `Idempotency-Key` = id da entrega; sem `RESEND_API_KEY`/`EMAIL_REMETENTE`, entrega ignorada.
  Nunca envie e-mail fora da fila.
- **Conta demo (Etapa 9B, §67):** empresa `eh_demo` recriada às 03:00; o banco recusa toda
  escrita com sessão de usuário nela (`DEMO_SOMENTE_LEITURA`, antes de `permitir_escrita`).
  **Tabela nova com `empresa_id`** recebe `_exigir_escrita` (o teste da demo confere que toda
  tabela tem a trava). Link público da demo = modo teste; fora do /interno e das métricas.
- **Links absolutos (Etapa 9B, §68):** só `siteUrl()` (`NEXT_PUBLIC_SITE_URL`); nunca o Host da
  requisição nem domínio fixo (teste procura). O domínio antigo redireciona 308 no middleware.
- **Preço confirmado (Etapa 8):** pacote e opcional só vão ao link com
  `preco_confirmado_em` preenchido (`publico.contexto_preco` e `pendenciasDoLinkPublico`). Um
  trigger confirma sempre que um preço é gravado, menos na gravação do modelo (`gravarModelo`
  liga `orkestra.modelo = 1` na transação). Preço de exemplo nunca é público sem o dono digitar.
- **Onboarding e checklist:** o cadastro já aplica o modelo do segmento e leva a `/app/comecar`;
  passo salvo em `empresas.onboarding_passo` (`avancar_onboarding`, passar do 3 exige preço
  confirmado). Checklist calculado do estado real (`domain/onboarding/checklist`), dispensável
  por usuário.
- **Cobrança (Etapa 9A):** situação da conta em `empresas.plano` (`trial`, `ativo`,
  `inadimplente`, `cancelado`, `suspenso`), por `_atualizar_situacao`; regra em
  `domain/cobranca/situacao` e `_situacao_conta`, limites em `domain/cobranca/limites` e
  `_codigo_plano`, status de cobrança em `proximoStatus` e `_cobranca_proximo_status`, com
  teste de equivalência: mudou uma, mude a outra. Asaas só por `fetch` (sem SDK); webhook e
  reconciliação só gravam por `cobranca_registrar_evento` (idempotente, monotônico, uma
  transação). Assinaturas, cobranças e dados de cobrança: o dono lê; escrita só pela conexão
  administrativa (`server/cobranca/fluxos`, com auditoria) e funções. Limites valem no servidor
  e no banco (triggers); downgrade nunca apaga.
- **Conta suspensa = somente leitura:** o trigger `_exigir_escrita` está em toda tabela com
  `empresa_id`. **Tabela nova com `empresa_id` liga o trigger na própria migration** (ou entra
  na lista de exceções do teste, com justificativa). Função nova de escrita para
  `authenticated` entra na lista do teste `cobranca.test.ts`.
- **/interno e suporte:** só `ORKESTRA_ADMINS` com MFA (aal2); ações em `auditoria_interna`.
  Suporte só com consentimento vigente do dono (7 dias), sessão de 2 h, faixa vermelha e
  `dados.suporte` na auditoria (GUC `orkestra.suporte_admin` ligada por `comUsuario`).
- **Números:** métricas em `public.numeros`/`numeros_ocupacao` e em `domain/numeros`, com teste
  de equivalência numa tabela de casos: mudou uma, mude a outra. Leads únicos, nunca lead de
  teste, datas civis no fuso da empresa. Vendedor vê só os próprios leads.
- **Notas, tarefas e visitas** só são escritas pelas funções da Etapa 6 (`adicionar_nota`,
  `criar_tarefa`, `adiar_tarefa`, `confirmar_visita`…), que travam o lead e gravam auditoria.
  Tarefa automática (Etapa 7) usa `origem = 'regra'` e `regra`: o índice
  `tarefas_regra_aberta_idx` permite só uma aberta por regra em cada lead. Quando lead e agenda
  são travados juntos, a ordem é sempre agenda → lead.
- **Caixa de leads:** grupo e ordem existem no SQL (`_lead_grupo`, `_lead_ordem`) e em
  `domain/leads/prioridade`; temperatura por inatividade em `_temperatura_inatividade` e
  `domain/leads/temperatura`; etapa do funil (Etapa 13, §74) em `_funil_etapa` e
  `domain/leads/funil` (mover o card chama a ação de verdade, nunca grava status). Testes de
  equivalência: mudou uma, mude a outra. Componente
  cliente de Leads importa módulos específicos de `domain/leads` (nunca o índice) e nunca
  `domain/phone`: o telefone chega formatado do servidor.
- **Sessão (Etapa 9.5):** `getClaims()` (JWT validado localmente) no middleware e em
  `usuarioAtual`; `getUser()` (rede) só onde precisa de revalidação forte (`/interno`, suporte,
  troca de senha, callback do Google, Admin API). Depois de mudar `app_metadata` (ex.: limpar
  `trocar_senha`), chame `refreshSession()`: os claims vêm do token. Login com Google:
  `/auth/callback` → `decidirVoltaExterna` (`server/auth/volta-externa.ts`, regra em
  `domain/auth/destino`); conta nova completa em `/cadastro/completar` (`completar_conta_dono`).
- **Landing (Etapa 9.6, §62):** `/` estática (ISR 5 min) e fora do middleware (não toca no
  Auth). Preços, limites e desconto anual só de `publico.planos_vitrine`
  (nunca valor fixo no código; sem preço de fundador); quem mudar plano invalida a tag
  `planos-vitrine`. Nada de
  depoimento, logo de cliente, nota ou número inventado. Simulador usa o `calcularOrcamento` do
  domínio com preços fictícios. Origem do anúncio (utm_, ref) só por `registrar_origem_cadastro`;
  contagem agregada só por `publico.landing_contar` (sem nada pessoal).
- **LGPD (Etapa 9B, §63):** o buffet é controlador dos leads, o Orkestra operador. Lead só é
  anonimizado/exportado por `lgpd_apagar_lead`/`lgpd_exportar_lead` (dono) e pelo job
  `lgpd_retencao`; empresa exportada pela rota do ZIP (RLS do dono) e excluída 30 dias depois do
  pedido pela rota `/api/lgpd/processar`. Coluna nova com dado pessoal de lead entra em
  `_lgpd_anonimizar_lead` (e no teste que procura o nome no banco inteiro). Lead pode ter
  `whatsapp_e164` nulo (anonimizado): telas e loaders tratam. Funções LGPD e `registrar_aceite`
  valem com a conta suspensa. Mudou Termos ou Privacidade: suba `VERSAO_DOCUMENTOS` (e o seed).
  Leitura de `auditoria` só do dono.
- **Segurança (Etapa 9B, §64):** CSP com nonce vem do middleware; não use `next/dynamic` (preload
  sem nonce: use `React.lazy` + `Suspense`), nem script inline sem nonce, nem `eval`; página nova
  estática entra em `PAGINAS_ESTATICAS`. Login, cadastro, recuperar senha, webhook e rotas do cron
  passam por `dentroDoLimite`/`autorizadoPorCron`. MFA do dono: marca `app_metadata.mfa` (só a
  Admin API grava) + `aal2`. Nunca `<Link>` para rota que muda estado (`/auth/sair`): o prefetch
  executa. Toda tabela nova cai no `rls-revisao.test.ts` (escrita direta só com motivo).
- **Logs (Etapa 9B, §65):** no servidor só `logar(nivel, evento, { ids e códigos })` (ESLint
  proíbe `console`); erro entra por `codigoDoErro`, nunca a mensagem nem o objeto.
- Nada de service role nem `DATABASE_URL` no navegador (nunca prefixo `NEXT_PUBLIC_`).
  `SUPABASE_SERVICE_ROLE_KEY` só é lida em `server/auth/admin-supabase.ts` (`server-only`); o
  ESLint impede importá-lo em componentes, `lib`, páginas e middleware.
- Imagens: bucket público `midia`, caminho `{empresa_id}/{logo|capa|pacotes}/{uuid}.webp` e,
  na galeria, `{empresa_id}/galeria/{uuid}-{640|1280}.webp`; o navegador converte para WEBP e
  envia; a server action valida o caminho e grava.
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
- **Página pública (Etapa 9.5, §61):** frase, estilo, diferenciais, galeria, depoimentos e
  perguntas só são escritos por `salvar_pagina_publica`, `salvar_galeria`, `salvar_depoimentos`
  e `salvar_perguntas` (dono, limites, auditoria); o público lê só por `publico.pagina`.
  Depoimento, nota ou avaliação **nunca** são gerados pelo sistema. Fontes dos estilos sem
  preload (só a do estilo é baixada). Só `/b/[slug]` aceita iframe, e só do próprio site.
- **Catálogo usado em orçamento não é excluído, só desativado** (trigger
  `CATALOGO_ITEM_EM_USO`; telas usam `carregarEmUso`).
- Temperatura por aberturas existe no SQL (`_temperatura_aberturas`) e em
  `domain/proposta/temperatura`, com teste de equivalência: mudou uma, mude a outra.
- **Contratos (Etapa 10, §70):** painel só do dono (menu "Contratos"; vendedor vê só o selo na
  Agenda por `status_contrato_da_reserva`). Avisos do contrato nascem da auditoria (trigger
  `_contrato_avisar`, nunca na demo nem em teste); `numeros_contratos` = `metricasContratos`
  (equivalência). Escrita só por funções (`emitir_contrato`, `cancelar_contrato`,
  `novo_link_contrato`, `salvar_contrato_modelo`, `publico.contrato_*`). Texto e hash congelados
  no envio (trigger); para mudar, cancelar e emitir outro. O texto é montado no servidor
  (`server/contratos/emitir`); o navegador só manda o que faltava. Token do link só como hash;
  resposta igual para token inexistente, vencido ou cancelado. CPF só cifrado
  (`CONTRATOS_CHAVE`, `server/contratos/segredos`) e mascarado; nunca em log nem no Sentry.
  E-mail ao cliente final só o do contrato (código), direto pelo Resend. Hash do banco =
  `hashTexto` do domínio (equivalência).
- **Financeiro (Etapa 11, §72):** só o dono; `reserva_parcelas` e `recebimentos` só por
  `salvar_plano_pagamento`, `registrar_recebimento` e `estornar_recebimento`. Recebimento nunca é
  apagado (estorno). A situação (pago, atrasado) é calculada em `domain/financeiro`.
- **Clientes (Etapa 12, §73):** só leitura (sem tabela nova); agrupamento e "hora de chamar"
  em `domain/clientes`. Lead de teste e anonimizado fora. Valores, contrato e pagamentos só o
  dono.
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
| `pnpm db:seed:midia`                           | Imagens do seed (capa, galeria) no Storage local        |
| `pnpm db:seed:volume`                          | Empresa com 5.000 leads para medir a caixa (só local)   |
| `pnpm vapid:gerar`                             | Gera o par de chaves VAPID do push (para a Vercel)      |
| `node scripts/conferir-bundle.mjs`             | Depois do build: navegador sem libphonenumber `max`     |

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
desligada e tarefas automáticas abertas e uma cancelada; desde a Etapa 8, onboarding concluído,
90 dias de visitas ao link (várias origens, inclusive QR code) e ~70 leads extras com perdas,
reservas e tempos de atendimento (Números cheia); o **Buffet Teste B** fica com o onboarding
parado no passo 3. Desde a Etapa 9A, o Buffet Demo tem o Profissional mensal ativo (duas
faturas pagas e uma em aberto), o Buffet Teste B tem o teste acabando em 2 dias, e
`equipe@orkestra.local` (mesma senha) é a equipe do /interno (`ORKESTRA_ADMINS`; o código TOTP
é cadastrado no primeiro acesso). Cobrança local com a API falsa do Asaas:
`node tests/support/asaas-fake-servidor.mjs` e `ASAAS_API_URL=http://localhost:4010/v3`.
`pnpm db:seed:volume` cria o **Buffet Volume**
(`dono@volume.local`, 5.000 leads) para o `explain analyze` da caixa. Desde a Etapa 9.5, o
Buffet Demo tem a página pública preenchida (frase, diferenciais, 6 fotos, 3 depoimentos
marcados "(seed)" e 3 perguntas); `pnpm db:seed:midia` envia as imagens (geradas, sem fotos de
terceiros) ao Storage local. Página pública:
http://localhost:3000/b/buffet-demo (logado como dono, abre em modo teste). Conta de demonstração
(Etapa 9B): com `NEXT_PUBLIC_DEMO_SLUG=demonstracao` no `.env.local`, o botão "Ver o painel de
demonstração" da landing monta a demo na primeira entrada (precisa de `SUPABASE_SERVICE_ROLE_KEY`). E-mails locais (recuperação de senha): http://127.0.0.1:54324.

Sem Docker, a integração roda num Postgres puro com shim do schema `auth`:
`TEST_DB_SHIM=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/orkestra_test pnpm test:integration`.

## Ambiente

- **Repositório:** `guilhermeranulfo17/TRIMFLOW`. Etapas 0 a 9B na `main`; Etapa 10 PR 1
  (contrato digital: base) na branch `etapa-10a-contrato-base`. Região das funções na Vercel: `gru1` (`vercel.json`).
- **App (produção):** a Vercel está ligada ao repositório e publica a `main` automaticamente em
  https://www.sistemaorkestra.com.br (`NEXT_PUBLIC_SITE_URL`). `trimflow-tau.vercel.app` e
  `sistemaorkestra.com.br` (sem www) redirecionam 308 para ele (`DOMINIOS_ANTIGOS`), menos `/api/`.
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
  `docs/AVISOS_CONFIGURACAO.md`. Modelos do WhatsApp: `docs/WHATSAPP_MODELOS.md`. Desde a
  Etapa 9A: `ASAAS_API_KEY` (secreta), `ASAAS_AMBIENTE` (`sandbox`|`producao`),
  `ASAAS_WEBHOOK_TOKEN` (secreta), `ORKESTRA_ADMINS` e `NEXT_PUBLIC_WHATSAPP_VENDAS`; sem as do
  Asaas, a cobrança fica desligada. Passo a passo: `docs/COBRANCA.md`. Desde a Etapa 9.5:
  `NEXT_PUBLIC_LOGIN_GOOGLE=1` liga "Continuar com o Google" (só depois de configurar o provedor:
  `docs/LOGIN_GOOGLE.md`). Região e chave do JWT: `docs/LANCAMENTO.md`. Desde a Etapa 9.6
  (opcionais): `NEXT_PUBLIC_DEMO_SLUG` (botão "Ver um buffet de exemplo" da landing),
  `NEXT_PUBLIC_EMAIL_CONTATO` e `NEXT_PUBLIC_RAZAO_SOCIAL` (rodapé). Desde a Etapa 9B (todas
  opcionais, só Production): `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
  `SENTRY_ORG`, `SENTRY_PROJECT`; previews, sessão, MFA, monitor e LGPD em `docs/LANCAMENTO.md`.
  Desde a Etapa 9B PR 2: `RESEND_API_KEY` (secreta) e `EMAIL_REMETENTE` (sem elas, e-mail
  desligado) e `NEXT_PUBLIC_DEMO_SLUG` passa a ligar a conta de demonstração. Secreto novo no
  GitHub: `BACKUP_SENHA` (workflow de backup, `docs/BACKUP.md`). Desde a Etapa 10:
  `CONTRATOS_CHAVE` (secreta, obrigatória para o cliente assinar; mesma em Production e Preview;
  guardar cópia fora da Vercel). **Roteiro do lançamento, na
  ordem:** `docs/LANCAMENTO.md`.
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
