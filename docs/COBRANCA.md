# Cobrança (Asaas): configuração

Passo a passo para ligar a cobrança. Regras e decisões: `docs/ARQUITETURA.md` §54–58.

## 1. Sandbox (testar antes de vender)

1. Crie a conta em https://sandbox.asaas.com.
2. Em **Integrações → Chaves de API**, gere a chave.
3. Na Vercel (**Settings → Environment Variables**, ambiente Production), cadastre:
   - `ASAAS_API_KEY` = a chave do sandbox (secreta);
   - `ASAAS_AMBIENTE` = `sandbox`;
   - `ASAAS_WEBHOOK_TOKEN` = um texto aleatório (`openssl rand -hex 32`, secreto).
4. No Asaas, em **Integrações → Webhooks**, crie um webhook:
   - URL: `https://SEU-DOMINIO/api/cobranca/asaas`;
   - token de autenticação: o mesmo `ASAAS_WEBHOOK_TOKEN`;
   - versão da API: v3; fila ativada; envio sequencial;
   - eventos de **cobranças** (criada, atualizada, confirmada, recebida, vencida, estornada,
     removida, chargeback) e de **assinaturas** (removida, inativada).
5. Faça um redeploy na Vercel (as variáveis só valem num deploy novo).
6. Teste: Minha empresa → Plano → Assinar. Na fatura do sandbox, use "Confirmar pagamento"
   (Pix) e confira que a conta fica "Assinatura ativa".

## 2. Produção

1. Conta Asaas de produção aprovada (documentos da empresa).
2. Troque `ASAAS_API_KEY` pela chave de produção e `ASAAS_AMBIENTE` para `producao`.
3. Recrie o webhook no Asaas de produção (mesma URL e token).
4. Redeploy.
5. `ASAAS_API_URL` **nunca** em produção: só os testes usam (e só vale com `sandbox`).

## 3. Reconciliação diária

O job `orkestra-cobranca-reconciliar` (04:10 em São Paulo) usa os mesmos segredos do Vault dos
avisos (`orkestra_site_url` e `orkestra_cron_secret`, ver `docs/AVISOS_CONFIGURACAO.md`). Sem
eles, nada é chamado (o webhook continua funcionando).

## 4. /interno (equipe)

1. Supabase → **Authentication → Users → Add user** com o e-mail da equipe (senha forte,
   "Auto Confirm User").
2. Supabase → **Authentication → Multi-Factor** com TOTP ligado (padrão nos projetos novos).
3. Na Vercel: `ORKESTRA_ADMINS=email1@dominio,email2@dominio`. Redeploy.
4. Acesse `https://SEU-DOMINIO/interno`, entre e cadastre o código no aplicativo autenticador.

## 5. Cupom de fundador

Já criado pela migration (`FUNDADOR`: R$ 97/mês por 12 meses no Profissional mensal, 10
vagas). Cupons novos entram por migration (arquivo novo), até existir a tela de cupons no
/interno (anotada em `docs/PROXIMOS_PASSOS.md`).
