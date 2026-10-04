# Lançamento e operação

Passos manuais de produção. Cada seção diz onde clicar e como conferir.

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
