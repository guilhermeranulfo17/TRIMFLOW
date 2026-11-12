# Página pública elegante (ARQUITETURA §84)

Capturas do Buffet Demo no modelo **elegante**, geradas com o build de produção local (fotos e
logo são ilustrações geradas, servidas por um servidor local de imagens):

- `celular-375.png`: celular, 375 px de largura (sem rolagem lateral).
- `computador-1440.png`: computador, 1440 px.

## Lighthouse no celular (12/11/2026)

Mesma máquina, mesmo banco e mesmas imagens; 3 rodadas de cada (perfil móvel padrão do
Lighthouse 12).

| Página                    | Desempenho   | Acessibilidade | Boas práticas | SEO | LCP         | CLS   |
| ------------------------- | ------------ | -------------- | ------------- | --- | ----------- | ----- |
| Antes (alegre, a de hoje) | 94 · 98 · 96 | 100            | 100           | 100 | 2,3 a 2,8 s | 0     |
| Depois (modelo elegante)  | 96 · 96 · 96 | 100            | 100           | 100 | 2,8 s       | 0,001 |

A meta era desempenho 90 ou mais e não ficar mais lenta: a mediana é 96 nas duas.
