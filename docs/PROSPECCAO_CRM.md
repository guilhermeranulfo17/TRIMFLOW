# Rastreio para o CRM de prospecção

O Orkestra avisa o CRM de prospecção (sistema separado, onde a equipe prospecta buffets pelo
WhatsApp) quando um buffet prospectado abre a demonstração, monta um orçamento nela, cria conta,
cadastra pacote e publica a página. Decisões técnicas: `docs/ARQUITETURA.md` §81.

## Link para mandar ao buffet

```
https://www.sistemaorkestra.com.br/?r=<id do lead no CRM>
```

- `<id do lead no CRM>` é o campo `id` do lead (um uuid, como
  `3f2504e0-4f89-41d3-9a0c-0305e82c3301`). É o mesmo id de `GET /leads?q=...` e de `/leads/{id}`.
- Pode combinar com a origem do anúncio: `/?r=<id>&utm_source=whatsapp&utm_campaign=followup`.
- O link direto para o cadastro também guarda o r: `/cadastro?r=<id>` (não conta como "abriu a
  demonstração", só liga o cadastro ao lead).
- O r fica guardado no aparelho por 90 dias (cookie `orkestra_r` e armazenamento local). Se a
  pessoa voltar depois sem o parâmetro, o cadastro continua ligado ao lead.
- Valor que não é uuid é ignorado (a página abre normalmente e nada é enviado).

## Configuração

| Variável               | Onde                          | Para quê                                                     |
| ---------------------- | ----------------------------- | ------------------------------------------------------------ |
| `CRM_PROSPECCAO_TOKEN` | Vercel (Production e Preview) | Token do CRM (`Authorization: Bearer`). **Secreta.**         |
| `CRM_PROSPECCAO_URL`   | opcional                      | Base da API. Padrão: `https://crm-buffets.emergent.host/api` |

Sem o token, o rastreio fica desligado: nada é chamado e nada quebra. O token nunca vai para o
navegador (não use o prefixo `NEXT_PUBLIC_`).

## O que é enviado

| #   | Quando                                                              | O que o CRM recebe                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A página inicial é aberta com `?r=`                                 | Evento "Abriu a demonstração". Se a etapa era `abordado` ou `respondeu`, vira `qualificado`.                                                                                                                                                                                           |
| 2   | A pessoa chega ao resultado da demonstração (com r guardado)        | Evento "Montou um orçamento na demonstração".                                                                                                                                                                                                                                          |
| 3   | Cadastro (e "completar" de quem entra pelo Google)                  | Lead achado pelo r ou pelo WhatsApp informado (se não existir, é criado). Upsert: `telefone`, `contato`, `buffet` (só em lead novo), `tem_whatsapp: sim`, `temperatura: quente`, `proximo_passo`, e `etapa: demo_marcada` se couber. Evento "Criou conta em DD/MM às HH:MM, e-mail …". |
| 4   | O dono cria um pacote ou salva o preço de um pacote, a primeira vez | Evento "Cadastrou pacote".                                                                                                                                                                                                                                                             |
| 5   | O dono conclui o onboarding ("Seu link está no ar"), a primeira vez | Evento "Publicou a página".                                                                                                                                                                                                                                                            |

Regras:

- **Nunca rebaixa a etapa.** No cadastro, só sobe para `demo_marcada` quem está antes dela (ou em
  `frio`, ou é lead novo). `perdido` e de `demo_marcada` em diante ficam como estão.
- **Sem r e sem telefone conhecido, nada é enviado**, exceto no cadastro, que cria o lead.
- **Tudo em segundo plano**, depois da resposta ao usuário, com prazo de 8 segundos por chamada.
  Se o CRM falhar ou demorar, a página e o cadastro funcionam normalmente; o erro vai para o log
  como `prospeccao.falhou` (só a ação e o código, por exemplo `CRM_500` ou `TimeoutError`).
- Se o CRM estava fora do ar na hora do cadastro, o "Criou conta" é reenviado no próximo marco da
  conta (pacote ou página), com a data verdadeira da criação.
- Os eventos 4 e 5 saem **uma vez por empresa** e só quando foi o próprio dono (a equipe do
  Orkestra em modo suporte e a conta de demonstração não contam).
- Se o lead do link tem um telefone e a pessoa informa outro no cadastro, o lead do link é o
  atualizado (não nasce um duplicado) e o evento leva ", WhatsApp informado (DD) 9XXXX-XXXX".

## Como testar cada evento

Use um lead de teste no CRM (crie um com o seu próprio número). Em produção ou num preview da
Vercel com o token configurado:

1. **Abriu a demonstração:** ponha o lead na etapa `abordado`, abra
   `https://www.sistemaorkestra.com.br/?r=<id>` numa janela anônima. Em alguns segundos a linha do
   tempo ganha "Abriu a demonstração" e a etapa vira `qualificado`. Recarregar a página na mesma
   aba não repete o evento; abrir em outra aba ou outro dia, sim.
2. **Montou um orçamento:** na mesma janela, toque em "Monte um orçamento como se fosse seu
   cliente", avance até "Ver como o buffet recebe". A linha do tempo ganha "Montou um orçamento na
   demonstração" (uma vez por aba).
3. **Criou conta:** ainda na mesma janela, vá ao botão final e crie a conta. O lead recebe
   contato, `temperatura: quente`, `proximo_passo: "Gui chamar: criou conta no teste"`, etapa
   `demo_marcada` e o evento "Criou conta em DD/MM às HH:MM, e-mail …". Para testar sem r, abra
   `/cadastro` numa janela anônima limpa e cadastre com um WhatsApp que já existe (ou não) no CRM.
4. **Cadastrou pacote:** no onboarding, passo 3 (Preços), confirme o preço de um pacote; ou em
   Minha empresa → Catálogo, crie um pacote. Sai "Cadastrou pacote" (só na primeira vez).
5. **Publicou a página:** conclua o onboarding até o passo 5 ("Seu link está no ar"). Sai
   "Publicou a página" (só na primeira vez). Quem pulou o onboarding dispara o mesmo evento ao
   salvar os textos da página em Minha empresa → Link.

**CRM fora do ar:** com o token errado (ou `CRM_PROSPECCAO_URL` apontando para um endereço que não
responde) num preview, o cadastro e a página funcionam igual e o log da Vercel mostra
`prospeccao.falhou`.

Sem tocar no CRM de verdade: `pnpm test:unit tests/unit/prospeccao` (regras e os cinco eventos
contra um CRM falso), `pnpm test:integration tests/integration/prospeccao.test.ts` (vínculo no
banco, uma vez só, CRM fora do ar) e os testes "link com ?r=" de `tests/e2e/landing.spec.ts`.

## Onde está no código

- `src/domain/prospeccao`: ordem das etapas, textos, telefone e o r (regras puras).
- `src/server/prospeccao`: `cliente` (fetch), `rastreio` (os cinco eventos), `vinculo`
  (`empresas.prospeccao`), `conta` (cadastro e marcos) e `index` (segundo plano, nunca lança).
- `src/app/api/prospeccao/evento`: rota pública dos eventos 1 e 2 (só o nome do evento e o r).
- `src/components/marketing/prospeccao.tsx`: guarda o r e avisa a rota.
- Ganchos: `server/actions/auth.ts` (cadastro), `server/actions/empresa/pacotes.ts` e
  `server/actions/onboarding.ts` (pacote e página), `server/actions/empresa/pagina.ts`.
