# Modelos do WhatsApp (Meta Cloud API)

Os avisos por WhatsApp vão **só para a equipe do buffet** (dono e vendedores que ligaram o
canal em Minha conta → Avisos, com o número e o aceite). Nenhuma mensagem automática vai para
o cliente final. A API é a oficial da Meta (Cloud API), chamada com `fetch` em
`src/server/avisos/canais/whatsapp.ts`. Nada de API não oficial.

Fora da janela de 24 h, a Meta só aceita **mensagens de modelo aprovado**. Cadastre os cinco
modelos abaixo no WhatsApp Manager (Gerenciador do WhatsApp → Modelos de mensagem →
Criar modelo) **exatamente** com estes nomes, idioma e variáveis. A ordem das variáveis está em
`variaveisWhatsApp` (`src/domain/avisos/textos.ts`).

Para todos:

- **Categoria:** Utilidade.
- **Idioma:** Português (BR), código `pt_BR`.
- **Cabeçalho:** nenhum. **Rodapé:** `Orkestra`.
- **Botão:** "Visitar site", tipo **URL dinâmica**, texto `Abrir no Orkestra`, URL
  `https://trimflow-tau.vercel.app/app/{{1}}`. Exemplo da variável do botão: `leads`. O
  servidor envia como sufixo o caminho sem o `/app/` (por exemplo
  `leads/8c1f…`, `avisos`). Se o domínio mudar, edite o botão dos cinco modelos.
- Valores já chegam formatados (R$ 4.800,00, "sáb 14/11 tarde", "48h").

Sem modelo aprovado, a Meta devolve erro (código gravado em `avisos_entregas.erro_codigo`,
como `META_132001`); o aviso continua no painel e no push.

## 1. `orkestra_pre_reserva` (pré-reserva pedida pelo link)

```
Nova pré-reserva pelo link: {{1}}, {{2}}, {{3}}, {{4}} pessoas, {{5}}. A pré-reserva vence em {{6}}. Fale com o cliente para combinar o sinal.
```

| Variável | O que é              | Exemplo              |
| -------- | -------------------- | -------------------- |
| `{{1}}`  | nome do cliente      | Ana Souza            |
| `{{2}}`  | tipo de festa        | Aniversário infantil |
| `{{3}}`  | dia e turno          | sáb 14/11 tarde      |
| `{{4}}`  | convidados           | 80                   |
| `{{5}}`  | valor da proposta    | R$ 4.800,00          |
| `{{6}}`  | prazo da pré-reserva | 48h                  |

## 2. `orkestra_visita_pedida` (cliente pediu visita)

```
Pedido de visita ao espaço: {{1}} prefere {{2}}. Orçamento de {{3}}. Confirme o dia e a hora com o cliente.
```

| Variável | O que é                             | Exemplo         |
| -------- | ----------------------------------- | --------------- |
| `{{1}}`  | nome do cliente                     | Ana Souza       |
| `{{2}}`  | dia e período preferidos            | qui 12/11 tarde |
| `{{3}}`  | valor do orçamento (ou "a definir") | R$ 4.800,00     |

## 3. `orkestra_pre_reserva_vencendo` (12 h antes de vencer)

```
A pré-reserva de {{1}} vence {{2}}. Se o sinal não for pago, a data fica livre de novo.
```

| Variável | O que é         | Exemplo     |
| -------- | --------------- | ----------- |
| `{{1}}`  | nome do cliente | Ana Souza   |
| `{{2}}`  | quando vence    | hoje às 18h |

## 4. `orkestra_resumo_diario` (8 h, no fuso da empresa; não sai zerado)

```
Bom dia! Seu dia no Orkestra: {{1}} pré-reservas vencendo, {{2}} visitas, {{3}} tarefas para hoje e {{4}} atrasadas. Ontem chegaram {{5}} leads novos.
```

| Variável | O que é                      | Exemplo |
| -------- | ---------------------------- | ------- |
| `{{1}}`  | pré-reservas que vencem hoje | 1       |
| `{{2}}`  | visitas de hoje              | 2       |
| `{{3}}`  | tarefas de hoje              | 4       |
| `{{4}}`  | tarefas atrasadas            | 0       |
| `{{5}}`  | leads novos ontem            | 3       |

## 5. `orkestra_teste` (botão "Enviar aviso de teste")

```
Este é um aviso de teste do Orkestra. Se você recebeu esta mensagem, os avisos pelo WhatsApp estão funcionando.
```

Sem variáveis no corpo (só a do botão).

## Os outros tipos

"Orçamentos sem ação", "cliente parou no meio" e "cliente esquentou" ficam só no painel e no
push (são frequentes demais para WhatsApp). Para mandar algum deles por WhatsApp, crie o modelo,
inclua o tipo em `TIPOS_COM_WHATSAPP` e `MODELOS_WHATSAPP` e no SQL (`_aviso_canais`), com o
teste de equivalência.

## Passo a passo na Meta

1. Em [business.facebook.com](https://business.facebook.com), crie (ou use) o portfólio
   empresarial e verifique a empresa (Configurações → Central de segurança).
2. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo
   **Empresa** e adicione o produto **WhatsApp**.
3. Em WhatsApp → Configuração da API, adicione e verifique o **número de envio** (um número que
   não esteja em uso no app WhatsApp). Anote o **Phone number ID**.
4. Crie um **usuário do sistema** (Configurações do negócio → Usuários do sistema), dê a ele o
   app e a conta do WhatsApp com a permissão `whatsapp_business_messaging`, e gere um **token
   permanente**.
5. Cadastre os cinco modelos acima e espere a aprovação (minutos a algumas horas).
6. Na Vercel: `WHATSAPP_TOKEN` (o token permanente, secreto) e `WHATSAPP_PHONE_NUMBER_ID`.
   Faça um novo deploy.
7. No Orkestra, em Minha conta → Avisos, informe o seu WhatsApp, aceite e toque em
   "Enviar aviso de teste".
