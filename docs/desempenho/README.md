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

Do clique até o primeiro quadro com resposta (indicador no link ou nos filtros, ou a tela nova),
Playwright no PC (1440), `requestAnimationFrame`, 3 voltas, com 400 ms a mais em cada pedido da
navegação (rede lenta simulada): menu → Agenda 74–77 ms, menu → Números 64–81 ms, período de
Números 64–88 ms, busca de Leads 60–80 ms (meta: 100 ms). O painel não tem `loading.tsx` nem
Suspense de página (ARQUITETURA §60): o retorno imediato é o `PendenteLink` no link clicado e o
indicador da transição nos filtros de Leads. Navegação com 0, 150 e 400 ms de atraso: 5/5.

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
