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

**Trava (§99):** na produção da Vercel (`VERCEL_ENV=production`), com `ASAAS_AMBIENTE=sandbox`
(ou qualquer URL de sandbox) a cobrança **não cria nem altera nada**: a tela de Plano mostra o
WhatsApp de vendas, o log registra `cobranca.sandbox_em_producao`, o `/api/saude` acusa o item
`asaas` e o /interno → Diagnóstico mostra "Sandbox na produção". O webhook continua recebendo
(as cobranças de teste antigas terminam de forma consistente). Preview e local seguem usando o
sandbox normalmente.

### Checklist da virada para produção (não executar sem decisão)

Antes:

- [ ] Conta Asaas de produção aprovada; conta bancária de saque cadastrada e validada.
- [ ] Notas fiscais: decidir se o Asaas emite NFS-e automaticamente (Configurações → Notas
      fiscais) ou se a contabilidade emite fora.
- [ ] Rodar `docs/operacao/2026-11-17/05_asaas_sandbox_verificacao.sql` e anotar o que existe
      (hoje: 6 cobranças de sandbox, 2 vencidas, 4 pendentes de 16/11 a 16/12; 2 assinaturas
      pendentes).
- [ ] Avisar os donos que clicaram em "Assinar" no período de teste: a fatura antiga (sandbox)
      não vale; vão assinar de novo depois da virada. (Conversa com os donos: fora do código.)

Na virada (de preferência fora do horário comercial):

1. Asaas de produção → **Integrações → Chaves de API**: gerar a chave.
2. Vercel (Production): `ASAAS_API_KEY` = chave de produção; `ASAAS_AMBIENTE` = `producao`;
   `ASAAS_WEBHOOK_TOKEN` = **um token novo** (`openssl rand -hex 32`). Conferir que
   `ASAAS_API_URL` **não** existe em Production.
3. Asaas de produção → **Integrações → Webhooks**: criar o webhook (mesma URL
   `https://www.sistemaorkestra.com.br/api/cobranca/asaas`, o token novo, v3, fila ativada,
   envio sequencial, eventos de cobranças e de assinaturas como no item 1.4).
4. No sandbox: desativar o webhook antigo (o token antigo deixa de valer de qualquer jeito).
5. Redeploy da Production.
6. Rodar `docs/operacao/2026-11-17/06_asaas_sandbox_correcao.sql` (termina em ROLLBACK; conferir
   e trocar por COMMIT). Ele cancela no nosso banco as cobranças e assinaturas pendentes do
   sandbox e apaga os ids de cliente do sandbox (o próximo "Assinar" cria o cliente na
   produção). Cobrança paga ou assinatura ativa do sandbox aparecem na conferência para decisão
   caso a caso (ex.: cortesia no /interno).
7. Cupons: conferir em `public.cupons` quais estão ativos (`select codigo, ativo, valido_ate from
public.cupons`). Cupom vale igual nos dois ambientes (é nosso, não do Asaas).
8. `/api/saude` deve voltar com `asaas: ok`; /interno → Diagnóstico sem "Sandbox na produção".
9. Teste real com valor baixo: um plano com cupom de 100% não gera cobrança; para testar o
   caminho completo, assinar com um cartão próprio e estornar no Asaas (o estorno chega pelo
   webhook e a assinatura volta a pendente).

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

## 5. Cupons

Não há preço de fundador: o cupom `FUNDADOR` da Etapa 9A foi desativado
(`20261019000001_sem_fundador.sql`) e a landing não anuncia vagas. Cupons novos entram por migration (arquivo novo), até existir a tela de cupons no
/interno (anotada em `docs/PROXIMOS_PASSOS.md`).
