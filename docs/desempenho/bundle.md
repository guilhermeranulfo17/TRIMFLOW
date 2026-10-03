# Bundle por rota (First Load JS)

Medido com `pnpm build` (Next 15). Antes = início da Etapa 9.5; depois = PR 1.

| Rota                                   | Antes  | Depois |
| -------------------------------------- | ------ | ------ |
| `/app/agenda`                          | 389 kB | 235 kB |
| `/app/comecar`                         | 207 kB | 137 kB |
| `/app/empresa`                         | 298 kB | 208 kB |
| `/app/empresa/agenda-config`           | 328 kB | 236 kB |
| `/app/empresa/catalogo`                | 378 kB | 242 kB |
| `/app/empresa/catalogo/opcionais/[id]` | 376 kB | 240 kB |
| `/app/empresa/catalogo/opcionais/novo` | 295 kB | 206 kB |
| `/app/empresa/catalogo/pacotes/[id]`   | 379 kB | 243 kB |
| `/app/empresa/link`                    | 115 kB | 116 kB |
| `/app/empresa/regras`                  | 377 kB | 210 kB |
| `/app/empresa/usuarios`                | 304 kB | 215 kB |
| `/app/leads/[id]`                      | 184 kB | 182 kB |
| `/app/tarefas`                         | 176 kB | 174 kB |
| `/cadastro`                            | 211 kB | 191 kB |

Rotas sem mudança ficaram de fora. Compartilhado por todas: 102 kB (igual).

O que mudou: metadados `min` da libphonenumber com a regra do Brasil explícita (antes `max`),
cliente do Supabase carregado só no envio de imagem e `optimizePackageImports` para `radix-ui`.
