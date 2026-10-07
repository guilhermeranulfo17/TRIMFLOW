# Lançamento e operação

A primeira parte é o **roteiro do dia do lançamento**: siga na ordem, pelo navegador. A segunda
parte (**Referência**) explica cada configuração em detalhe.

Links que você vai usar o tempo todo:

- Supabase (projeto `orkestra`): https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi
- Vercel (projeto `trimflow`): https://vercel.com/dashboard → projeto `trimflow`
- Segredos do GitHub: https://github.com/guilhermeranulfo17/TRIMFLOW/settings/secrets/actions

Sempre que mudar uma variável na Vercel: **Deployments → (o último) → ⋯ → Redeploy**. Variável só
vale num deploy novo (as `NEXT_PUBLIC_` entram no build).

---

# Roteiro do dia do lançamento (Etapa 9B)

## 1. Segurança primeiro (senha do banco, token e repositório privado)

A senha do banco e o token do Supabase ficaram expostos. Troque os dois antes de tudo.

1. **Nova senha do banco:** Supabase →
   [Project Settings → Database](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/settings/database)
   → **Reset database password** → **Generate a password** → copie e guarde no seu gerenciador
   de senhas → **Reset password**.
2. **GitHub:** [Secrets → Actions](https://github.com/guilhermeranulfo17/TRIMFLOW/settings/secrets/actions)
   → `SUPABASE_DB_PASSWORD` → **Update** → cole a senha nova.
3. **Vercel `DATABASE_URL`:** no Supabase, botão **Connect** (topo da página) → aba
   **Transaction pooler** (porta `6543`) → copie a URL e troque `[YOUR-PASSWORD]` pela senha
   nova. Vercel → **Settings → Environment Variables** → `DATABASE_URL` → **⋯ → Edit** → cole →
   marque **Production** e **Preview** → **Save** → **Redeploy**.
4. **Novo token do Supabase:** [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
   → apague (**Revoke**) o token antigo → **Generate new token** (nome `github-actions`) → copie.
   No GitHub, atualize o segredo `SUPABASE_ACCESS_TOKEN` com ele.
5. **Repositório privado:** [Settings do repositório](https://github.com/guilhermeranulfo17/TRIMFLOW/settings)
   → fim da página (**Danger Zone**) → **Change visibility → Make private** → confirme. A Vercel
   continua publicando normalmente. (Repositório privado no plano gratuito do GitHub tem 2.000
   minutos de Actions por mês: cada PR gasta uns 20.)
6. **Confira:** GitHub → **Actions → Migrations em produção → Run workflow**. Ficou verde = senha
   e token novos funcionando. Abra `https://trimflow-tau.vercel.app/api/saude`: `"ok": true` (desde a Etapa 10 o item
   `contratos_chave` só fica verde com a `CONTRATOS_CHAVE` cadastrada).

## 2. Variáveis da Vercel

Vercel → projeto `trimflow` → **Settings → Environment Variables**. Para cada linha: **Add New**
(ou **⋯ → Edit**), nome exato, valor, e marque os ambientes indicados. Segredo = marque
**Sensitive**.

| Variável                                                                                    | Onde pegar o valor                                                                                                             | Obrigatória     | Production | Preview |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                                                  | Supabase → [API](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/settings/api) → Project URL                       | sim             | ✅         | ✅      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                                             | Supabase → [API Keys](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/settings/api-keys) → `anon` / publishable    | sim             | ✅         | ✅      |
| `NEXT_PUBLIC_SITE_URL`                                                                      | o endereço do site, com `https://` e sem barra no fim (hoje `https://trimflow-tau.vercel.app`; no passo 7 vira o domínio novo) | sim             | ✅         | ✅      |
| `DATABASE_URL`                                                                              | passo 1.3 (Transaction pooler, porta 6543)                                                                                     | sim, secreta    | ✅         | ✅      |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                 | Supabase → API Keys → `service_role` (secret)                                                                                  | sim, secreta    | ✅         | ✅      |
| `IP_HASH_SALT`                                                                              | gere no seu gerenciador de senhas (64 caracteres, letras e números). Já existe: não troque                                     | sim, secreta    | ✅         | ✅      |
| `CRON_SECRET`                                                                               | gere (64 caracteres). O mesmo valor vai no Vault (Referência → Avisos)                                                         | sim, secreta    | ✅         | ❌      |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                        | já cadastradas na Etapa 7 (push no celular). Só confira que existem                                                            | recomendadas    | ✅         | ❌      |
| `RESEND_API_KEY`, `EMAIL_REMETENTE`                                                         | passo 5                                                                                                                        | recomendadas    | ✅         | ❌      |
| `CONTRATOS_CHAVE`                                                                           | gere com `openssl rand -base64 32` e guarde uma cópia no gerenciador de senhas (sem ela os CPFs dos contratos não voltam)      | sim, secreta    | ✅         | ✅      |
| `ASAAS_API_KEY`, `ASAAS_AMBIENTE`, `ASAAS_WEBHOOK_TOKEN`                                    | passo 4                                                                                                                        | para cobrar     | ✅         | ❌      |
| `ORKESTRA_ADMINS`                                                                           | seus e-mails da equipe, separados por vírgula                                                                                  | para o /interno | ✅         | ✅      |
| `NEXT_PUBLIC_LOGIN_GOOGLE`                                                                  | `1` (só depois do passo 3)                                                                                                     | não             | ✅         | ✅      |
| `NEXT_PUBLIC_WHATSAPP_VENDAS`                                                               | seu WhatsApp de vendas, só dígitos com 55 (ex.: `5534999999999`)                                                               | recomendada     | ✅         | ✅      |
| `NEXT_PUBLIC_DEMO_SLUG`                                                                     | passo 8 (`demonstracao`)                                                                                                       | não             | ✅         | ❌      |
| `NEXT_PUBLIC_EMAIL_CONTATO`, `NEXT_PUBLIC_RAZAO_SOCIAL`                                     | passo 8                                                                                                                        | não             | ✅         | ✅      |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`                                                | [WHATSAPP_MODELOS.md](WHATSAPP_MODELOS.md)                                                                                     | não             | ✅         | ❌      |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | passo 6                                                                                                                        | não             | ✅         | ❌      |

Nunca cadastre `ASAAS_API_URL` nem `RESEND_API_URL` em produção (só os testes usam). `CONTRATOS_CHAVE` é a mesma em Production e Preview (mesmo banco). Preview usa o **mesmo banco**:
deixe as prévias protegidas (Referência → Previews da Vercel). **Redeploy** no fim.

## 3. Login com o Google

1. Siga [LOGIN_GOOGLE.md](LOGIN_GOOGLE.md) (Google Cloud → Supabase), partes 1 e 2.
2. Vercel: `NEXT_PUBLIC_LOGIN_GOOGLE` = `1` (Production e Preview) → **Redeploy**.
3. Teste numa janela anônima: `/cadastro` → **Continuar com o Google** → completa os dados do
   buffet → cai no onboarding.

## 4. Asaas (cobrança)

1. **Sandbox:** siga [COBRANCA.md](COBRANCA.md) parte 1 (conta no sandbox, chave, as três
   variáveis com `ASAAS_AMBIENTE` = `sandbox`, webhook em `https://SEU-SITE/api/cobranca/asaas`
   com o token, **Redeploy**).
2. **Teste de ponta a ponta no sandbox:** crie uma conta de buffet de teste no site → Minha
   empresa → **Plano** → Profissional → CPF de teste `52998224725` → **Assinar** → na fatura do
   sandbox, **Confirmar pagamento** → volte ao site: "Assinatura ativa". No Asaas sandbox,
   **Integrações → Webhooks → Logs**: os eventos com status 200. Com o Resend ligado (passo 5),
   chega o e-mail "Pagamento confirmado".
3. **Produção** (quando a conta Asaas de produção estiver aprovada): COBRANCA.md parte 2 (chave
   de produção, `ASAAS_AMBIENTE` = `producao`, webhook recriado no Asaas de produção, **Redeploy**).
4. Apague o buffet de teste: entre com ele → Minha empresa → Privacidade e dados → Excluir conta.

## 5. Resend (e-mails do produto e do login)

Precisa do domínio comprado (passo 7.1). Se ainda não tem, faça o 7.1 e 7.2 e volte aqui.

1. Crie a conta em https://resend.com/signup.
2. **Domains → Add Domain** → digite `seudominio.com.br` → **Region: São Paulo (sa-east-1)** →
   **Add**. O Resend mostra os registros DNS.
3. Vercel → **Domains** (menu do time, não do projeto) → `seudominio.com.br` → **DNS Records** →
   **Add** cada registro exatamente como o Resend mostra:
   - **SPF:** tipo `MX`, nome `send`, valor `feedback-smtp.sa-east-1.amazonses.com`, prioridade
     `10`; e tipo `TXT`, nome `send`, valor `v=spf1 include:amazonses.com ~all`.
   - **DKIM:** tipo `TXT`, nome `resend._domainkey`, valor `p=MIGf...` (o texto longo do Resend).
   - **DMARC:** tipo `TXT`, nome `_dmarc`, valor
     `v=DMARC1; p=none; rua=mailto:dmarc@seudominio.com.br`. (Depois de 1 mês sem problemas,
     troque `p=none` por `p=quarantine`.)
4. No Resend, **Verify DNS Records**. Em alguns minutos (até 24 h) fica **Verified**.
5. **API Keys → Create API Key** → nome `orkestra-producao`, permissão **Sending access**,
   domínio `seudominio.com.br` → copie.
6. Vercel (só Production): `RESEND_API_KEY` = a chave; `EMAIL_REMETENTE` =
   `Orkestra <avisos@seudominio.com.br>` → **Redeploy**.
7. **E-mails do login (Supabase Auth) pelo Resend:** crie outra chave no Resend
   (`supabase-smtp`, Sending access). Supabase →
   [Authentication → Emails → SMTP Settings](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/auth/smtp)
   → **Enable Custom SMTP**, com estes valores exatos:

   | Campo                           | Valor                             |
   | ------------------------------- | --------------------------------- |
   | Sender email                    | `avisos@seudominio.com.br`        |
   | Sender name                     | `Orkestra`                        |
   | Host                            | `smtp.resend.com`                 |
   | Port number                     | `465`                             |
   | Minimum interval between emails | `60` segundos                     |
   | Username                        | `resend`                          |
   | Password                        | a chave `supabase-smtp` do Resend |

   **Save**. Depois, em [Authentication → Rate Limits](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/auth/rate-limits),
   **Rate limit for sending emails**: `100` por hora.

8. **Teste:** em `/recuperar-senha`, peça o link para o seu e-mail: chega do
   `avisos@seudominio.com.br`. Crie um buffet de teste: chega o "Boas-vindas ao Orkestra" com o
   link do buffet. No Resend, **Emails** mostra os envios como "Delivered".

## 6. Sentry e monitor de disponibilidade

1. Sentry: Referência → **Sentry** (conta, DSN, token, cinco variáveis só em Production, Redeploy).
2. Monitor: Referência → **Monitor de disponibilidade** (UptimeRobot com o `/api/saude` e a
   landing, alerta no e-mail e no celular).

## 7. Domínio próprio

1. **Comprar:** https://registro.br → pesquise o nome (ex.: `orkestra.com.br`) → **Registrar**
   (CPF ou CNPJ, uns R$ 40 por ano). Confira antes no passo 9.4.
2. **Ligar na Vercel:** projeto `trimflow` → **Settings → Domains** → **Add** →
   `seudominio.com.br` (escolha a opção que redireciona `www` para ele). A Vercel mostra os
   **nameservers** (`ns1.vercel-dns.com` e `ns2.vercel-dns.com`). No Registro.br → seu domínio →
   **DNS → Alterar servidores DNS** → cole os dois → **Salvar**. Em minutos a algumas horas, a
   Vercel mostra **Valid Configuration** (com o cadeado HTTPS).
3. **`NEXT_PUBLIC_SITE_URL`** = `https://seudominio.com.br` (Production e Preview) →
   **Redeploy**. A partir daí, todo link de e-mail, WhatsApp, PDF, QR, compartilhamento,
   sitemap e Google usa o domínio novo, e `trimflow-tau.vercel.app` **redireciona sozinho**
   (308, mesmo caminho e query) para ele. As rotas `/api/` seguem respondendo no endereço antigo
   para nada quebrar enquanto você faz os passos abaixo.
4. **Supabase Auth:** [Authentication → URL Configuration](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/auth/url-configuration)
   → **Site URL** = `https://seudominio.com.br` → em **Redirect URLs**, **Add URL**
   `https://seudominio.com.br/**` (deixe o antigo por um mês) → **Save**.
5. **Google:** [Google Cloud → Credentials](https://console.cloud.google.com/apis/credentials) →
   o cliente OAuth do Orkestra → **Authorized JavaScript origins** → **Add URI**
   `https://seudominio.com.br` → **Save**. Em **OAuth consent screen → Authorized domains**,
   adicione `seudominio.com.br`. (O "Authorized redirect URI" é o do Supabase e não muda.)
6. **Asaas:** **Integrações → Webhooks** → edite o webhook → URL
   `https://seudominio.com.br/api/cobranca/asaas` → **Salvar** (no sandbox e na produção).
7. **Vault (fila de avisos, demo, LGPD, cobrança):** Supabase →
   [SQL Editor](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/sql/new) → cole e
   rode (troque o domínio):
   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'orkestra_site_url'),
     'https://seudominio.com.br'
   );
   ```
8. **Monitor:** troque a URL dos monitores do UptimeRobot para o domínio novo.
9. **WhatsApp (se ligado):** os modelos aprovados na Meta têm o endereço do site no botão. Crie
   versões novas com o domínio novo ([WHATSAPP_MODELOS.md](WHATSAPP_MODELOS.md)).
10. **Confira:** abra `https://trimflow-tau.vercel.app/b/SEU-SLUG?utm_source=teste`: a barra de
    endereço vira `https://seudominio.com.br/b/SEU-SLUG?utm_source=teste`. Baixe o QR em Minha
    empresa → Link e divulgação e leia com a câmera: abre o domínio novo.

## 8. Landing

1. **Conta de demonstração:** confira que `https://seudominio.com.br/b/demonstracao` dá
   "Buffet não encontrado" (ninguém usa esse endereço). Vercel (só Production):
   `NEXT_PUBLIC_DEMO_SLUG` = `demonstracao`.
2. `NEXT_PUBLIC_WHATSAPP_VENDAS` = seu WhatsApp de vendas (só dígitos, com 55).
3. `NEXT_PUBLIC_EMAIL_CONTATO` = `contato@seudominio.com.br` (crie a caixa no seu provedor de
   e-mail ou um redirecionamento no Registro.br/ImprovMX).
4. `NEXT_PUBLIC_RAZAO_SOCIAL` = a razão social e o CNPJ, como devem aparecer no rodapé.
5. **Redeploy.** Abra a landing → **Ver o painel de demonstração**: na primeira vez leva uns
   5 segundos (a demo é montada) e entra direto no painel com a faixa "Você está numa
   demonstração". Tente salvar algo: aparece "Esta é uma demonstração. Crie sua conta grátis…".
   A demo é recriada todo dia às 03:00 e a sessão dura 2 horas.

## 9. Jurídico

1. **Advogado:** peça revisão de `/termos` (inclui o acordo de operador de dados com o buffet),
   `/privacidade` e `/subprocessadores`. São modelos. Mudou o texto? Peça para subir a versão
   (Referência → LGPD no dia a dia): os donos aceitam de novo no próximo acesso.
2. **Razão social e CNPJ** nos Termos, na Privacidade e no rodapé (passo 8.4).
3. **Marca no INPI:** [busca de marcas](https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_classe_basica.jsp)
   → pesquise "Orkestra" nas classes **42** (software como serviço) e **35** (gestão de
   negócios). Livre? Peça o registro pelo [e-INPI](https://www.gov.br/inpi/pt-br/servicos/marcas)
   (guia GRU; com CNPJ de ME/EPP o valor cai pela metade).
4. **Domínio e Instagram:** confira que `orkestra.com.br` (ou o escolhido) e o `@orkestra` (ou
   variação) estão livres e registre os dois no mesmo dia.

## 10. Pronto para vender: checklist final

Faça no **celular** (4G, não no Wi-Fi de casa) e no **PC**, numa janela anônima:

- [ ] Landing abre rápido, com preços certos, "Testar grátis" e "Ver o painel de demonstração".
- [ ] Cadastro com e-mail **e** com o Google; o e-mail de boas-vindas chega (caixa de entrada,
      não spam).
- [ ] Onboarding até o fim; **Testar como cliente** abre o link em modo teste.
- [ ] Do celular de outra pessoa: monta o orçamento no link, pede pré-reserva; o aviso chega no
      sino (e no push, se ligado) em segundos.
- [ ] Proposta abre na web e o PDF baixa com a logo.
- [ ] Confirma o sinal na Agenda: vira **Reservado**; aparece em Números.
- [ ] QR code (PNG e PDF) lido pela câmera abre o domínio novo.
- [ ] Assinar o plano no Asaas de **produção** com um cartão/Pix seu (valor real; estorne
      depois no Asaas); chegam os e-mails "fatura" e "pagamento confirmado".
- [ ] "Esqueci minha senha" chega pelo `avisos@seudominio.com.br`.
- [ ] `https://seudominio.com.br/api/saude` com `"ok": true`; UptimeRobot verde.
- [ ] Sentry recebendo (Issues vazia ou só erros conhecidos).
- [ ] [Backup manual do banco](https://github.com/guilhermeranulfo17/TRIMFLOW/actions/workflows/backup.yml)
      rodado uma vez e o simulado de restauração feito ([BACKUP.md](BACKUP.md)); decidir quando
      contratar o plano Pro do Supabase (backup diário automático).
- [ ] Endereço antigo `trimflow-tau.vercel.app` redirecionando para o novo.
- [ ] Termos, Privacidade e Subprocessadores revisados pelo advogado.

---

# Referência

## Região das funções (Etapa 9.5)

O banco (Supabase) fica em São Paulo (`sa-east-1`). As funções do app precisam rodar perto
dele: cada ida ao banco a partir dos EUA custa de 120 a 200 ms.

- O arquivo `vercel.json` pede `"regions": ["gru1"]` (São Paulo) para todas as funções.
- **Confira na Vercel**: projeto `trimflow` → **Settings → Functions → Function Region** deve
  mostrar **São Paulo, Brazil (gru1)**. Se mostrar outra região, escolha `gru1` ali e faça um
  redeploy: a configuração do projeto pode sobrepor o arquivo.
- Como conferir depois do deploy: em **Deployments → (último) → Functions**, a coluna de
  região mostra `gru1`.

## Chave de assinatura do JWT (Etapa 9.5)

O painel valida a sessão pelo JWT localmente (`getClaims()`), sem ir ao servidor do Auth a cada
página. Isso só funciona com **chaves de assinatura assimétricas** no Supabase.

- Teste de 10 segundos: abra
  `https://nsqoenggvshzkhbpurfi.supabase.co/auth/v1/.well-known/jwks.json` no navegador.
  - Aparece uma lista com `"kty": "EC"` (ou `RSA`): já está certo.
  - Aparece `{"keys":[]}`: o projeto ainda usa a chave antiga (HS256). Tudo funciona, mas cada
    página faz uma ida extra ao Auth. Para migrar:
    1. Supabase → projeto `orkestra` → **Project Settings → JWT Keys**.
    2. Em **JWT Signing Keys**, clique em **Migrate JWT secret** (cria uma chave nova
       assimétrica, ECC P-256, e mantém a antiga para validar os tokens já emitidos).
    3. Clique em **Rotate keys** para a chave nova passar a assinar os tokens. Sessões abertas
       continuam valendo até expirar (1 hora).
    4. Não revogue a chave antiga antes de 1 dia: sessões antigas ainda são validadas por ela.
    5. Abra o link do JWKS de novo: agora aparece a chave nova.
  - Nada muda no código nem nas variáveis da Vercel.

## Previews da Vercel (Etapa 9B)

Cada PR ganha um endereço de prévia na Vercel. Hoje as prévias respondem **500** porque as
variáveis de ambiente estão marcadas só para **Production**.

- Vercel → projeto `trimflow` → **Settings → Environment Variables**. Para cada variável, clique
  em **⋯ → Edit** e marque também **Preview** (no mínimo `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `IP_HASH_SALT`, `SUPABASE_SERVICE_ROLE_KEY`).
- **Risco:** com as mesmas variáveis, a prévia usa o **banco de produção**. Quem abrir a prévia
  mexe nos dados reais (o código da prévia ainda não foi revisado). Por isso:
  - deixe as prévias **protegidas** (Settings → Deployment Protection → Vercel Authentication
    ligado para Preview);
  - não marque para Preview as chaves que disparam coisas para fora: `ASAAS_API_KEY` de
    produção, `WHATSAPP_TOKEN`, `RESEND_API_KEY`, `SENTRY_DSN` (sem elas, cada canal fica desligado
    e nada quebra);
  - quando o volume justificar, crie um projeto Supabase separado para prévias (ou use os
    _branches_ do Supabase, plano pago) e aponte as variáveis de Preview para ele.

## Sessão de 30 dias e senhas vazadas (Etapa 9B)

O que o código faz: o painel valida a sessão pelo JWT (`getClaims`); o `@supabase/ssr` renova o
token de acesso com o _refresh token_ guardado em cookie e grava o novo a cada renovação. Nada a
mudar no código para a sessão durar 30 dias.

No Supabase → projeto `orkestra` → **Authentication**:

1. **Sessions** (página "Sessions" ou "Auth Settings → Sessions"):
   - **Time-box user sessions:** `30 days` (720 horas). Depois disso a pessoa entra de novo.
     _Depende do plano Pro_; no plano gratuito o campo fica bloqueado e a sessão dura enquanto o
     refresh token for usado.
   - **Inactivity timeout:** `7 days` (opcional, também Pro): sem usar por 7 dias, sai.
   - **Single session per user:** desligado (o dono usa celular e PC).
2. **Refresh tokens** (em "Auth Settings" → "Refresh Tokens" ou "Advanced"):
   - **Detect and revoke potentially compromised refresh tokens:** ligado (rotação: cada
     renovação troca o refresh token e invalida o anterior).
   - **Refresh token reuse interval:** `10` segundos (padrão; cobre abas abertas ao mesmo tempo).
3. **JWT expiry** (Project Settings → JWT Keys → "Access token expiry time"): `3600` segundos.
4. **Proteção contra senhas vazadas:** Authentication → **Providers → Email** (ou "Password
   Security") → **Prevent use of leaked passwords** ligado. Confere a senha no HaveIBeenPwned.
   _Disponível só no plano Pro_; o advisor de segurança do Supabase mostra o aviso
   "Leaked Password Protection Disabled" até ligar. Ainda em "Password Security", deixe
   **Minimum password length** em `8` (o cadastro já exige isso).

Como conferir: entre no painel, feche o navegador, volte no dia seguinte: continua logado. Em
Authentication → Users, a coluna "Last sign in" só muda no login com senha.

## Verificação em duas etapas (Etapa 9B)

- **Donos (opcional):** menu da conta → **Minha conta: segurança** → "Ligar a verificação em
  duas etapas". Lê o QR no Google Authenticator (ou similar) e confirma o código.
- **/interno (obrigatória):** cada pessoa da equipe cadastra o TOTP no primeiro acesso.
- No Supabase → Authentication → **Multi-Factor** (ou "Auth Settings → MFA"): **TOTP** deve
  estar **Enabled** (é o padrão). Nada mais a configurar.
- Se alguém perder o celular: Supabase → Authentication → Users → a pessoa → **Factors** →
  apague o fator. No próximo acesso ao painel o Orkestra percebe que não há fator e libera.

## Sentry (Etapa 9B)

Sem as variáveis, nada quebra: erros ficam só no log da Vercel.

1. Crie a conta em https://sentry.io (plano Developer, gratuito) → **Create project** →
   plataforma **Next.js** → nome `orkestra`. Em "Data Scrubbing" deixe ligado o padrão.
2. Copie o **DSN** (Settings → Projects → orkestra → Client Keys).
3. Crie um token em **Settings → Auth Tokens → Create New Token** (escopo "project:releases" e
   "org:read").
4. Na Vercel (só **Production**):
   | Variável                 | Valor                                              | Obrigatória                                  |
   | ------------------------ | -------------------------------------------------- | -------------------------------------------- |
   | `SENTRY_DSN`             | o DSN                                              | não (sem ela, Sentry desligado no servidor)  |
   | `NEXT_PUBLIC_SENTRY_DSN` | o mesmo DSN                                        | não (sem ela, desligado no navegador)        |
   | `SENTRY_AUTH_TOKEN`      | o token                                            | não (só para enviar os source maps no build) |
   | `SENTRY_ORG`             | o "slug" da organização (aparece na URL do Sentry) | junto com o token                            |
   | `SENTRY_PROJECT`         | `orkestra`                                         | junto com o token                            |
5. Redeploy. Para testar: abra `https://SEU-SITE/api/saude` (não gera erro) e, no Sentry, veja
   em **Issues** os erros reais que aparecerem. Nenhum evento leva nome, telefone, e-mail, IP ou
   dado de lead (`domain/observabilidade/sentry.ts`, testado).

## Monitor de disponibilidade (Etapa 9B)

`GET /api/saude` responde **200** com tudo certo e **503** com o item que falhou (banco, fila de
avisos atrasada mais de 10 min, job do pg_cron atrasado ou com falha, Asaas não configurado,
preços da landing). Abra no navegador para ver o JSON.

**UptimeRobot (gratuito, a cada 5 min):**

1. Crie a conta em https://uptimerobot.com → **+ New monitor**.
2. **Monitor type:** HTTP(s). **Friendly name:** Orkestra. **URL:**
   `https://trimflow-tau.vercel.app/api/saude` (troque pelo domínio novo quando existir).
3. **Monitoring interval:** 5 minutes. Em **Advanced**: "Alert when status code is not 2xx"
   (padrão).
4. **Alert contacts:** seu e-mail e o app do UptimeRobot no celular. Salve.
5. Crie mais um monitor igual para `https://SEU-SITE/` (a landing), para saber se o site caiu.

**Better Stack (alternativa, gratuito com 10 monitores):** https://betterstack.com/uptime →
**Create monitor** → "Alert us when URL becomes unavailable" → URL do `/api/saude` → "Check
frequency" 3 minutes → e-mail e push.

Quando o alerta chegar, abra o `/api/saude`: o item com `"ok": false` diz o que olhar
(`fila_avisos` → Vault/`CRON_SECRET`; `job:orkestra-…` → Supabase → Integrations → Cron;
`planos_vitrine` → migrations; `banco` → status do Supabase).

## LGPD no dia a dia (Etapa 9B)

- **Pedido de um cliente final (titular):** o dono abre o lead → "Privacidade (LGPD)" →
  exporta (JSON ou CSV) ou apaga. Se o pedido chegar ao Orkestra, encaminhe ao buffet.
- **Retenção:** job diário 03:20 (São Paulo) anonimiza leads parados além do prazo do buffet
  (padrão 24 meses) e apaga leads de teste com mais de 30 dias.
- **Exclusão de conta:** o dono pede em Minha empresa → Privacidade e dados; 30 dias depois o
  job das 03:40 chama `/api/lgpd/processar` (mesmo `CRON_SECRET` e Vault dos avisos) e apaga
  fotos, acessos e dados. Nada a configurar além do que os avisos já usam.
- **Textos:** Termos, Privacidade e `/subprocessadores` são **modelos** e precisam de revisão de
  advogado antes de vender. Mudou um texto? Suba `VERSAO_DOCUMENTOS` em
  `src/domain/legal/versao.ts` (e a versão no `supabase/seed.sql`): os donos aceitam de novo.

## E-mails do produto (Etapa 9B)

- Saem pela fila de avisos (canal `email`), só para o dono: boas-vindas (com o link do buffet),
  teste acabando (3 e 1 dia), fatura gerada, pagamento confirmado, pagamento não identificado,
  conta suspensa, exportação dos dados e exclusão agendada. Avisos de lead nunca viram e-mail.
- Sem `RESEND_API_KEY` ou `EMAIL_REMETENTE`, a entrega fica "ignorada" (nada quebra) e o log da
  Vercel avisa no início. Cada envio usa o id da entrega como `Idempotency-Key`: uma nova
  tentativa nunca duplica o e-mail.
- Onde ver: Resend → **Emails** (entregues, devolvidos, spam). No banco, `avisos_entregas` com
  `canal = 'email'` guarda o status e o código do erro (`EMAIL_422`, `EMAIL_REDE`…).

## Conta de demonstração (Etapa 9B)

- Empresa "Buffet Alegria (demonstração)" com o slug de `NEXT_PUBLIC_DEMO_SLUG`, o modelo
  infantil e 60 dias de dados fictícios. Recriada todo dia às 03:00 (job
  `orkestra-demo-recriar` → `/api/demo/recriar`, mesmo Vault e `CRON_SECRET` dos avisos) e,
  se faltar, na primeira entrada.
- Entrada sem senha (`/demo/entrar`, botão da landing), sessão de 2 horas, um usuário só
  (`demonstracao@orkestra.invalid`). O banco recusa qualquer escrita dele; o link público da
  demo é sempre modo teste; a demo não aparece no /interno nem nas métricas da landing.
- Desligar: apague `NEXT_PUBLIC_DEMO_SLUG` na Vercel e faça Redeploy. Os botões somem e o job
  para de recriar; a empresa de demonstração que já existe fica parada e não atrapalha nada.

## Backup (Etapa 9B)

Política, cópia manual criptografada e simulado de restauração: [BACKUP.md](BACKUP.md).
