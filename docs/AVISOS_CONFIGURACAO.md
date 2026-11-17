# Avisos: configuração em produção (Etapa 7)

A fila de avisos funciona assim: o banco cria o aviso (painel) e as entregas (push, WhatsApp)
na mesma transação do evento; quem **envia** é a rota `POST /api/avisos/processar` do app,
protegida pelo `CRON_SECRET`. Ela é chamada de dois jeitos:

- logo depois de uma pré-reserva ou de um pedido de visita (`after()` do Next.js), para o aviso
  chegar em segundos;
- a cada minuto pelo `pg_cron` do Supabase, que faz um `POST` com `pg_net` (só quando há
  entrega pendente). É o que garante as novas tentativas, o fim do horário de silêncio e os
  avisos por tempo.

A migration `20261007000003_avisos_jobs.sql` agenda os jobs sozinha no merge. Faltam três
passos manuais, nesta ordem.

## 1. Variáveis na Vercel

Gere as chaves do push na sua máquina:

```bash
pnpm vapid:gerar
```

Em Vercel → Project → Settings → Environment Variables (Production):

| Variável                       | Valor                                                     | Secreta? |
| ------------------------------ | --------------------------------------------------------- | -------- |
| `CRON_SECRET`                  | uma senha longa e aleatória (ex.: `openssl rand -hex 32`) | sim      |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | a chave pública do `pnpm vapid:gerar`                     | não      |
| `VAPID_PRIVATE_KEY`            | a chave privada do `pnpm vapid:gerar`                     | sim      |
| `VAPID_SUBJECT`                | `mailto:` + seu e-mail de contato                         | não      |
| `WHATSAPP_TOKEN`               | token permanente da Meta (ver `docs/WHATSAPP_MODELOS.md`) | sim      |
| `WHATSAPP_PHONE_NUMBER_ID`     | Phone number ID da Meta                                   | não      |

Depois, **Redeploy** (as variáveis `NEXT_PUBLIC_` entram no build).

Faltar uma variável não derruba o site: o canal correspondente fica desligado e o log da Vercel
mostra um aviso na subida (linhas que começam com `[avisos]`). Sem `CRON_SECRET`, a rota
responde 401 para todo mundo: as entregas só saem pelo `after()` (sem novas tentativas, sem o
fim do silêncio e sem os avisos por tempo fora do painel). Trocar as chaves VAPID desfaz as inscrições de push (cada
aparelho precisa ativar de novo).

## 2. Segredos no Supabase Vault

A URL do site e o mesmo `CRON_SECRET` ficam no Vault (nunca numa migration). No painel do
Supabase → SQL Editor, rode **uma vez** (troque o segredo pelo valor que você pôs na Vercel):

```sql
select vault.create_secret('https://www.sistemaorkestra.com.br', 'orkestra_site_url');
select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'orkestra_cron_secret');
```

Para trocar depois (por exemplo, um domínio novo ou outro segredo):

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'orkestra_site_url'),
  'https://novo-dominio.com.br'
);
select vault.update_secret(
  (select id from vault.secrets where name = 'orkestra_cron_secret'),
  'NOVO_CRON_SECRET'
);
```

Enquanto os dois segredos não existirem, o job das entregas roda e não faz nada (o painel
funciona normalmente). Cadastrou, a fila começa a andar no minuto seguinte.

## 3. Extensões

O merge cria `pg_cron` e `pg_net` pela migration. Se o projeto não permitir, ligue em
Database → Extensions (`pg_cron` e `pg_net`) e rode de novo o bloco final da migration 3
(o `cron.schedule` é idempotente pelo nome do job).

## Como conferir depois do merge

No SQL Editor (só leitura):

```sql
-- os três jobs agendados
select jobname, schedule, active from cron.job where jobname like 'orkestra-%';

-- últimas execuções (status 'succeeded'; 'failed' traz a mensagem)
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname like 'orkestra-%'
order by d.start_time desc limit 20;

-- respostas da rota (200 = processou; 401 = segredo do Vault diferente do da Vercel)
select id, status_code, left(content::text, 200) as corpo, created
from net._http_response order by created desc limit 10;

-- situação da fila
select canal, status, erro_codigo, count(*)
from public.avisos_entregas group by 1, 2, 3 order by 1, 2;
```

A chamada HTTP só acontece quando existe entrega pendente; sem nenhuma, `net._http_response`
fica vazia e está tudo certo. Para forçar um teste, use "Enviar aviso de teste" em Minha conta
→ Avisos (ele processa a fila na hora, sem depender do cron).

## Teste manual da rota

```bash
curl -i -X POST https://www.sistemaorkestra.com.br/api/avisos/processar \
  -H "Authorization: Bearer $CRON_SECRET"
# 200 {"ok":true,...}; sem o cabeçalho ou com outro segredo: 401
```

## Quando cada canal sai (análise de 17/11/2026, §99)

A decisão de cada entrega fica em `src/server/avisos/processar.ts` (`enviarUma`): canal sem as
variáveis abaixo = entrega "ignorado" com `CANAL_DESLIGADO`. O motivo fica em
`avisos_entregas.erro_codigo`, o log registra `avisos.canal_desligado` e o /interno →
Diagnóstico mostra a contagem por canal, status e motivo.

| Canal    | Liga com (Vercel, Production)                                        | E só gera entrega quando                                                                                    |
| -------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Painel   | sempre                                                               | sempre (é a fonte da verdade)                                                                               |
| Push     | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | o tipo tem push na preferência (ou no padrão) **e** o usuário ativou o push em algum aparelho               |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`                         | o tipo tem modelo aprovado, está na preferência, o usuário ligou o WhatsApp em Minha conta e o plano inclui |
| E-mail   | `RESEND_API_KEY`, `EMAIL_REMETENTE`                                  | avisos da conta (só o dono) ou, como reserva, os avisos críticos abaixo                                     |

**E-mail de reserva:** `pagamento_falhou`, `conta_suspensa` e `pre_reserva_vencendo` vão por
e-mail (para o próprio destinatário) quando nenhum canal externo foi enfileirado ou quando o push
e o WhatsApp terminam "ignorado" ou "falhou". O e-mail de `pre_reserva_vencendo` não leva nada do
cliente (nem nome, nem data): só o aviso e o link do lead.

**Push de ponta a ponta:** inscrição (`inscrever_push`, Minha conta → Avisos), fila
(`_aviso_criar` cria a entrega só se houver inscrição), envio (`web-push`, `criarCanalPush`),
erro (5 tentativas: 1, 5, 15 e 60 min, depois "falhou") e inscrição morta (404/410: o banco apaga
o endpoint). Desde o §99 o aparelho reenvia a inscrição ao abrir Minha conta → Avisos. Falta (anotado
em `docs/PROXIMOS_PASSOS.md`): tratar `pushsubscriptionchange` no service worker e lembrar o
usuário de ativar o push quando ele não tem nenhum aparelho inscrito. No iPhone, push só funciona
com o app instalado na tela inicial (iOS 16.4+).

### WhatsApp: o que você precisa decidir (o código está pronto, o canal está desligado)

O canal fala só com a **API oficial da Meta (Cloud API)**, por `fetch`, sem SDK. Não usamos API não
oficial (Z-API, Evolution, Baileys). Para ligar:

1. **Provedor:** Cloud API direto da Meta (sem intermediário, cobrança por conversa da Meta) ou um
   BSP oficial (Twilio, Gupshup, 360dialog, Zenvia...). O código atual chama
   `graph.facebook.com` direto; um BSP exige adaptar `server/avisos/canais/whatsapp.ts`.
2. **Número:** um número dedicado do Orkestra (não pode estar em uso no app WhatsApp comum),
   verificado no Meta Business Manager, com nome de exibição aprovado.
3. **Modelos:** cadastrar e aprovar os 5 modelos de utilidade de `docs/WHATSAPP_MODELOS.md`
   (pré-reserva pedida, visita pedida, pré-reserva vencendo, resumo do dia, teste), em pt_BR, com
   o botão de URL `https://www.sistemaorkestra.com.br/app/{{1}}`.
4. **Token permanente:** usuário de sistema no Business Manager com permissão
   `whatsapp_business_messaging`; o token vai em `WHATSAPP_TOKEN` (secreto) e o id do número em
   `WHATSAPP_PHONE_NUMBER_ID`. Redeploy.
5. **Custo:** conversas de utilidade são cobradas pela Meta por conversa; o resumo diário é o que
   mais gera volume (um por usuário por dia).

Depois de ligar: Minha conta → Avisos → "Enviar aviso de teste" e conferir no /interno →
Diagnóstico que as entregas de WhatsApp saem como "enviado".
