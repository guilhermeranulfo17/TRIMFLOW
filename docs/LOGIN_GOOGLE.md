# Login e cadastro com o Google

"Continuar com o Google" em `/login` e `/cadastro` (Etapa 9.5). O botão só aparece com
`NEXT_PUBLIC_LOGIN_GOOGLE=1`; sem isso, nada muda para ninguém. Ligue **depois** de seguir os
passos abaixo.

## Como funciona

1. O botão chama `signInWithOAuth({ provider: 'google' })` do Supabase (PKCE), com
   `redirectTo = {site}/auth/callback?next=…` e `prompt=select_account` (sempre deixa escolher a
   conta).
2. O Google volta para o Supabase, que volta para `/auth/callback`. O callback troca o code pela
   sessão, confere o usuário (`getUser`) e decide por `destinoPosLogin`
   (`src/domain/auth/destino.ts`):
   - já tem conta no Orkestra e está ativo → painel (ou o `next`, se for caminho interno);
   - não tem conta → `/cadastro/completar` (nome do buffet, WhatsApp, tipo de buffet e aceite dos
     termos), que cria empresa, dono e teste de 14 dias por `completar_conta_dono` e leva ao
     onboarding;
   - vendedor desativado → a sessão é encerrada e ele volta ao login com o aviso de sem acesso.
3. **Senha temporária:** um vendedor criado pelo dono que entra pelo Google não precisa criar a
   senha pessoal (o Google conta como credencial pessoal); o flag `trocar_senha` é limpo.

**Contas com o mesmo e-mail:** o Supabase liga a identidade do Google à conta que já existe com o
mesmo e-mail verificado (vale para os vendedores, criados com e-mail confirmado). Então quem já
usa e-mail e senha pode passar a entrar pelo Google e cai na mesma conta e empresa.

## 1. Google Cloud (uma vez)

No [Google Cloud Console](https://console.cloud.google.com/), com um projeto do Orkestra:

1. **APIs e serviços → Tela de consentimento OAuth**
   - Tipo de usuário: **Externo**.
   - Nome do app: `Orkestra`; e-mail de suporte; logo (o ícone limão de `public/icones`).
   - Domínios autorizados: o domínio do site (ex.: `vercel.app` enquanto estiver em
     `trimflow-tau.vercel.app`, e o domínio próprio quando houver) e `supabase.co`.
   - Escopos: só os padrão (`email`, `profile`, `openid`).
   - Publique o app (sai do modo "Teste"; senão só os e-mails de teste conseguem entrar).
2. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**
   - Tipo: **Aplicativo da Web**.
   - Origens JavaScript autorizadas: `https://trimflow-tau.vercel.app` (e o domínio próprio).
   - URIs de redirecionamento autorizados:
     `https://nsqoenggvshzkhbpurfi.supabase.co/auth/v1/callback` (é o Supabase que recebe a volta
     do Google, não o nosso site).
   - Guarde o **ID do cliente** e a **chave secreta do cliente**.

## 2. Supabase (projeto `orkestra`)

1. **Authentication → Sign In / Providers → Google**: ligue, cole o ID e a chave secreta do
   cliente e salve.
   ([abrir](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/auth/providers))
2. **Authentication → URL Configuration**
   ([abrir](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/auth/url-configuration)):
   - Site URL: `https://trimflow-tau.vercel.app` (ou o domínio próprio).
   - Redirect URLs: `https://trimflow-tau.vercel.app/**`, o domínio próprio com `/**` quando
     houver, e `http://localhost:3000/**` para desenvolvimento.

## 3. Vercel

Em **Settings → Environment Variables**, adicione `NEXT_PUBLIC_LOGIN_GOOGLE` = `1` (Production
e Preview) e faça um novo deploy (a variável entra no build). Não é segredo.

## Como testar em produção

1. Numa janela anônima, abra `/cadastro` → "Continuar com o Google" → escolha uma conta Google
   que **não** tenha conta no Orkestra → deve abrir "Falta pouco" com seu nome preenchido →
   complete → cai no onboarding (passo 1).
2. Saia e entre de novo pelo Google → vai direto para Leads.
3. Com um e-mail que já tem conta por senha (ex.: o seu de dono), entre pelo Google → cai na mesma
   empresa.
4. Desative um vendedor em Minha empresa → Usuários e tente entrar com ele pelo Google → volta ao
   login com "Sua conta não tem acesso ao painel".

## Erros comuns

- **`redirect_uri_mismatch` (tela do Google):** a URI de redirecionamento no Google Cloud não é
  exatamente `https://nsqoenggvshzkhbpurfi.supabase.co/auth/v1/callback`.
- **Volta para `/login?erro=google`:** o domínio do site não está em Redirect URLs do Supabase,
  ou o code expirou (tente de novo). Os logs da Vercel mostram
  `[auth] falha na volta do login externo` sem dados pessoais.
- **"Acesso bloqueado: o app não foi verificado":** a tela de consentimento ainda está em modo
  Teste; publique ou adicione o e-mail como usuário de teste.
- **O botão não aparece:** `NEXT_PUBLIC_LOGIN_GOOGLE` não estava definida no build; refaça o
  deploy depois de criar a variável.
