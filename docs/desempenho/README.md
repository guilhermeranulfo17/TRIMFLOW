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

Do clique até o primeiro quadro com resposta (esqueleto, indicador no link ou a tela nova),
Playwright no PC (1440), `requestAnimationFrame`, 3 voltas: menu → Agenda 52–85 ms, Números
37–66 ms, Minha empresa 61–72 ms, Leads 41–53 ms; período de Números 60–74 ms; atalho do topo de
Leads 71–81 ms (meta: 100 ms). Leads e Números usam Suspense com chave dos filtros em vez de
`loading.tsx` (ARQUITETURA §60).

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

## Página pública nova (PR 2, `/b/buffet-demo`)

Lighthouse 12 mobile (4G simulado), build de produção local, Buffet Demo bem preenchido (capa,
6 fotos na galeria, fotos nos pacotes, 3 depoimentos, perguntas; `pnpm db:seed:midia`), 3 voltas:

| Medida         | PR 1 (sem capa nem galeria) | PR 2          | Meta  |
| -------------- | --------------------------- | ------------- | ----- |
| Desempenho     | 97                          | 90 a 96       | ≥ 90  |
| Acessibilidade | 100                         | 100           | ≥ 95  |
| Boas práticas  | 96                          | 100           | ≥ 95  |
| SEO            | 100                         | 100           | 100   |
| LCP            | 2,3 s                       | 2,7 a 3,4 s   | 2,5 s |
| CLS / TBT      | 0 / 110 ms                  | 0 / 73–122 ms |       |

- O LCP agora é a foto de capa (antes era texto). Na medição real, sem simulação, o primeiro
  conteúdo pinta em ~280 ms; a diferença vem do modelo simulado, que soma ao LCP as fontes e o
  JavaScript pedidos antes dele.
- Fonte do estilo festivo só no peso 700: 30 KB → 16 KB (desempenho de 88 para 91–93 na
  mesma página). Sem a fonte do estilo ("limpo"), 96–97.
- Boas práticas 96 → 100: ícone do app (`app/icon.png`), sem o 404 do `/favicon.ico`.
- First Load JS: `/b/[slug]` 158 kB, `/b/[slug]/orcamento` 152 kB, proposta 148 kB.

## Landing (Etapa 9.6)

`/` estática (ISR de 5 min), 144 kB de JS na primeira carga (o motor de preço vai junto, para o
simulador). Lighthouse local (`npx lighthouse`, build de produção):

|                       | Desempenho | Acessibilidade | Boas práticas | SEO | LCP   | TBT   | CLS |
| --------------------- | ---------- | -------------- | ------------- | --- | ----- | ----- | --- |
| Celular (4G simulado) | 98         | 100            | 100           | 100 | 2,3 s | 70 ms | 0   |
| PC                    | 100        | 100            | 100           | 100 | 0,5 s | 0 ms  | 0   |
