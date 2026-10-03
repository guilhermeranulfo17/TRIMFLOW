# Desempenho (Etapa 9.5)

Medidas do PR 1 (`etapa-9-5a-base`). Como medir de novo está em cada item.

## Idas ao banco por tela

`tests/integration/idas-banco.test.ts` (proxy TCP que conta round trips reais; roda no CI e falha
acima do limite).

| Tela             | Antes | Depois | Limite no CI |
| ---------------- | ----- | ------ | ------------ |
| Layout do painel | 39    | 2      | 2            |
| Leads            | 23    | 2      | 3            |
| Agenda           | 30    | 3      | 3            |
| Números          | 20    | 2      | 3            |
| Detalhe do lead  | 26    | 3      | 4            |
| Minha empresa    | 16    | 2      | 3            |

## Tela antes dos dados

Navegação pelo menu no PC (1440), do clique até o primeiro quadro com o esqueleto ou a tela
nova (Playwright, `requestAnimationFrame`, 3 voltas): Agenda 52–64 ms, Números 52–72 ms, Minha
empresa 42–93 ms, Leads 41–119 ms. Mediana ~60 ms (meta: 100 ms).

## Servidor

- TTFB do `/app/leads` local (banco na mesma máquina): ~95 ms. Em produção, cada ida a mais
  custava ~130 ms com a função fora de São Paulo; agora são 2 idas no layout e 2 na página, com
  a função em `gru1` ao lado do banco. Conferir o tempo real em Vercel → Observability.
- Planos com 5.000 leads (`pnpm db:seed:volume`): `explain-volume.txt`. `caixa_leads` 38 ms
  (primeira página), `numeros` 30 ms, disponibilidade do mês 3 ms, `painel_contexto` 12 ms.

## Página pública

Lighthouse 12 mobile (4G simulado) em `/b/buffet-demo`, build de produção local: desempenho 97,
acessibilidade 100, boas práticas 96, SEO 100; LCP 2,3 s (meta 2,5 s), CLS 0, TBT 110 ms.
`npx -y lighthouse@12 <url> --only-categories=performance,accessibility,best-practices,seo`.

## Bundle

`bundle.md` (First Load JS por rota, antes e depois).
