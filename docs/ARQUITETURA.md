# Arquitetura: decisões da Etapa 0 (Fundação)

Cada decisão traz o porquê. Quando algo era ambíguo, escolhemos a opção mais simples que não
bloqueia as próximas etapas.

## 1. Stack e versões

- **Next.js 15.5 + React 19 + TypeScript 5.9 strict** (com `noUncheckedIndexedAccess`).
  TypeScript 7 (versão em Go) já existe, mas o Next 15 ainda depende da API do compilador em JS.
- **Node 22.** O Vitest 5 exige Node ≥ 22.12, e o Node 20 saiu de suporte em abril de 2026.
  Continua atendendo o requisito "Node 20+".
- **Tailwind v4 + shadcn/ui (estilo new-york).** É o padrão atual para Next 15 / React 19.
  Os componentes shadcn ficam versionados em `src/components/ui` e são nossos para ajustar
  (raios de 10px, altura de toque de 44px).
- **ESLint 9** (flat config). O `eslint-config-next@15` não suporta ESLint 10.

## 2. Banco: SQL é a fonte da verdade, Drizzle é o espelho tipado

- As migrations em `supabase/migrations/*.sql` definem tabelas, **RLS, policies, grants,
  funções e triggers**. São aplicadas pela Supabase CLI (`db reset`, `migration up`) e, no
  cloud, por `supabase db push`.
- `src/server/db/schema.ts` espelha as tabelas à mão, só para ter queries tipadas.
  **Não usamos `drizzle-kit generate`** porque ele não versiona policies, funções nem triggers,
  e ter duas fontes de migration acaba divergindo. O teste `tenant-drizzle.test.ts` detecta
  quando o espelho sai de sincronia.
- Driver `postgres` (postgres.js) com `prepare: false`, exigido pelo pooler do Supabase em
  modo transação (Vercel/serverless).

## 3. Multiempresa com RLS, inclusive no servidor

- Tabelas: `empresas`, `usuarios` (1:1 com `auth.users`) e `auditoria`. Todo id é `uuid`.
- `public.empresa_do_usuario()` e `public.perfil_do_usuario()` são `security definer` com
  `search_path` vazio. Isso evita recursão nas policies de `usuarios` e impede sequestro de
  `search_path`. Usuário **inativo** recebe `null`, então perde o acesso na hora.
- **Privilégios mínimos.** O Supabase concede tudo a `anon`/`authenticated` por padrão, então a
  migration faz `revoke all` e libera só o necessário, **por coluna**:
  - `empresas`: select da própria empresa; update só do **dono** e só em
    `nome, segmento, whatsapp_e164, email, cidade, uf, fuso`. `slug`, `plano` e `trial_ate`
    ficam fora: troca de slug com redirecionamento e cobrança vêm em etapas próprias.
  - `usuarios`: select da mesma empresa; update só do dono (`nome, whatsapp_e164, perfil,
limite_desconto_pct, ativo`). `empresa_id` não é editável.
  - `auditoria`: select e insert na própria empresa, com `usuario_id = auth.uid()`.
    **Append-only**: sem update nem delete.
  - `anon`: nenhum acesso a tabela.
  - Ninguém do painel cria ou apaga empresa ou usuário por enquanto. O cadastro é feito pelo
    trigger; convites entram na Etapa 2.
- **Vendedor** lê a empresa e os colegas, mas não altera `empresas` nem `usuarios`, nem o
  próprio cadastro (senão poderia aumentar o próprio limite de desconto).
- Trigger `garantir_dono_ativo`: a empresa nunca fica sem um dono ativo.
- **RLS também no servidor.** O Drizzle conecta como `postgres`, que ignora RLS. Por isso toda
  query da área logada passa por `comUsuario(usuarioId, tx => …)`, que abre uma transação com
  `set_config('role','authenticated')` e as claims do JWT. As mesmas policies que protegem o
  navegador protegem o servidor. Um bug de "esqueci o `where empresa_id`" vira zero linhas, não
  vazamento.
- **Acesso administrativo** (ignora RLS) fica isolado em `src/server/db/admin.ts`, com
  `import 'server-only'`. Desde a Etapa 4 a página pública não o usa mais (ver seção 26).
- A **service role key não é usada** na Etapa 0. Nada sensível tem prefixo `NEXT_PUBLIC_`.
  Uma regra do ESLint impede componentes de importarem `@/server/db/*`.

## 4. Cadastro atômico via trigger em `auth.users`

Requisito: criar usuário do Auth, empresa, usuário dono e auditoria "em uma transação".

- A server action valida com Zod, normaliza o WhatsApp para E.164, gera o `slug_base` com
  `gerarSlug` do domínio e chama `supabase.auth.signUp()` com esses dados nos metadados.
- O trigger `on_auth_user_created` (`public.criar_conta_dono`, security definer) roda **na mesma
  transação do insert do GoTrue**. Ele resolve o slug (sufixo `-2`, `-3`… com
  `pg_advisory_xact_lock`), cria a empresa em trial de 14 dias, o usuário `dono` e a auditoria
  `conta.criada`. Se qualquer parte falhar, o Postgres desfaz tudo, **inclusive o usuário do
  Auth**, sem código de compensação.
- Por que não `admin.createUser` + inserts: seriam duas transações (Auth e app) e exigiria
  service role e rollback manual, com risco de usuário órfão.
- O trigger só age quando os metadados trazem `nome_buffet`. Assim o convite de usuários
  (Etapa 2) pode criar usuários do Auth por outro caminho.
- O banco revalida tudo (enum de segmento, regex de E.164, regex/tamanho do slug, nome não
  vazio), porque qualquer pessoa com a anon key pode chamar `signUp` direto.
- Se o banco recusar o cadastro, o GoTrue devolve "Database error saving new user", que
  traduzimos para uma mensagem simples.

## 5. Autenticação

- **Confirmação de e-mail desligada no MVP** (`enable_confirmations = false`) para o dono cair
  direto no painel. Isso atende a meta de ver o link funcionando em até 10 minutos. Para ligar:
  basta ativar no Supabase, o código já trata signup sem sessão ("enviamos um link de
  confirmação").
- Sessão por cookies com `@supabase/ssr`. O middleware renova a sessão e aplica: `/app/**` exige
  sessão (`/login?next=…`); logado em `/login` ou `/cadastro` vai para `/app/leads`. O `next` é
  sanitizado contra open redirect.
- `usuarioAtual()` lê usuário e empresa **via RLS**. Se há sessão no Auth mas não há acesso ao
  painel (inativo, sem cadastro), `exigirSessao()` manda para `/auth/sair?motivo=sem-acesso`,
  que encerra a sessão. Sem isso haveria loop login ↔ painel.
- `exigirPerfil('dono', …)` é o guard de servidor para páginas e actions. O RLS continua sendo
  a barreira final.
- **Recuperação de senha:** `resetPasswordForEmail` → e-mail → `/auth/confirm` → `/nova-senha`.
  O template do repositório (`supabase/templates/recovery.html`) usa `token_hash`, que funciona
  mesmo abrindo o e-mail em outro navegador. `/auth/confirm` também aceita `code` (PKCE, template
  padrão do Supabase), caso o template do projeto cloud não tenha sido trocado. A resposta
  é sempre a mesma, exista ou não a conta (não revela e-mails cadastrados).
- A troca de senha grava auditoria `usuario.senha_redefinida`.
- Senha mínima de 8 caracteres (no Zod e em `config.toml`).

## 6. Domínio puro e testado

- `money`: centavos inteiros; `pct` usa `BigInt` e arredonda **meio para cima, afastando do
  zero** (simétrico para negativos). Os exemplos do documento de produto viram testes
  (5% de 7.402,50 = 370,13; 30% de 7.032,37 = 2.109,71).
- `formatBRL` monta a string manualmente, com espaço comum (o `Intl` usa espaço não separável,
  o que atrapalha comparações e testes).
- `dates`: distingue **instante** (convertido para o fuso) de **data civil** `yyyy-MM-dd`
  (nunca convertida). Isso evita o erro clássico de "a festa mudou de dia" perto da meia-noite.
- `phone`: `libphonenumber-js/max`, para distinguir celular de fixo e validar DDD.
  O schema de cadastro fica em arquivo separado para o login não carregar essa lib
  (bundle do login: 208 kB → 159 kB).
- Schemas Zod em `src/domain/validacao` são os mesmos no formulário e na server action.

## 7. Layout e identidade

- Tokens em CSS variables no `:root` com `.dark` preparado (sem toggle). Cores do guia: primária
  `#7C5CD6`, fundo `#FAFAFC`, texto `#16141F`, superfície escura `#1A1625`. Manrope via
  `next/font`. Raios: `rounded-card` 12px, `rounded-control` 10px.
- Mobile primeiro: barra inferior com 4 itens no celular e sidebar no desktop (`md`). Alvos de
  toque de 44px e inputs com `text-base` (evita zoom no iOS).
- **"+ Orçamento"**: um único botão fixo, no canto inferior direito, acima da barra no celular.
  Desabilitado, com tooltip "Disponível em breve"; um wrapper focável permite o tooltip mesmo
  com o botão desabilitado.
- Segmento no cadastro como cartões de rádio em vez de select (melhor no celular).

## 8. Página pública `/b/[slug]`

- Valida o formato do slug antes de consultar. Busca só `nome` e `slug`. Slug inexistente
  responde 404 com página amigável.

## 9. Testes

- **Unitários** (`tests/unit`): domínio, mapeamento de erros, redirecionamento seguro, guards.
- **Integração** (`tests/integration`): rodam SQL real contra o banco local assumindo a
  identidade de cada usuário (`role authenticated` + claims), como o Supabase faz. Cobrem
  isolamento A×B em `empresas`, `usuarios` e `auditoria`; permissões do vendedor e do dono;
  `anon`; cadastro atômico (incluindo falha no meio, depois de criar a empresa) e sufixo de
  slug. Cada teste roda numa transação desfeita no final.
  - Sem Docker: `TEST_DB_SHIM=1` recria um Postgres puro `*_test` com um shim mínimo do schema
    `auth` (roles, `auth.users`, `auth.uid()`) que reproduz os privilégios padrão do Supabase.
    Assim os `REVOKE`s também são testados.
  - Os testes foram validados por mutação: afrouxando policies ou o trigger, 16 testes falham.
- **E2E** (`tests/e2e`, Playwright): celular 375×812 e desktop 1280×800. Cobrem cadastro
  completo, logout, login (com `next`), acesso negado, erros amigáveis, máscara de WhatsApp,
  recuperação de senha lendo o e-mail no Mailpit, navegação pelas 4 áreas sem rolagem
  horizontal e a página pública.

## 10. CI

GitHub Actions em todo PR e em push para `main` e `claude/**`:

- `qualidade`: lint, prettier, typecheck e unitários com cobertura (mínimo de 95% no motor).
- `integracao-e2e`: `supabase start` (sem serviços desnecessários), integração, build e E2E.
  Em caso de falha, anexa o relatório do Playwright.

---

# Etapa 1: catálogo, regras e motor de preço

## 11. Banco do catálogo

- **16 tabelas novas** em 3 migrations: `20261001000001_catalogo_config`,
  `20261001000002_catalogo_pacotes_opcionais` e `20261001000003_catalogo_rls`.
- **Unidades inteiras, sempre:** dinheiro em centavos (`integer`; nenhuma festa passa de
  R$ 21 milhões), percentuais e fatores em **basis points** (1% = 100 bp) e durações em minutos.
  Nada de `numeric`, que chega como string no Drizzle e convida a usar float.
- **FK composta entre empresas.** Todo pai tem `unique (id, empresa_id)` e toda filha referencia
  `(pai_id, empresa_id)`. Assim, o próprio banco recusa ligar uma faixa, seção ou opcional a um
  pacote de outra empresa, mesmo que o código erre. Os campos opcionais (`ajustes_dia.turno_id`,
  `faixas_idade.pacote_id`) usam MATCH SIMPLE: quando o campo é nulo, não há checagem.
- **Faixas de idade sem sobreposição** com uma exclusion constraint (`btree_gist`): a regra vale
  para cada política (a da empresa e a de cada pacote).
- **Ajuste de dia único por (tipo, dia, turno)** com `unique nulls not distinct`, para que
  "sábado sem turno" também não se repita.
- **Regras comerciais**: uma linha por empresa, criada por um trigger em `empresas`. As empresas
  que já existiam recebem a linha pelo backfill `criar_regras_comerciais_faltantes()`, uma função
  idempotente que também é testada. O painel lê as regras, e só o dono altera, por coluna. Ninguém
  insere nem apaga pelo painel.
- **RLS**: leitura por qualquer usuário ativo da empresa; inserir, alterar e excluir só pelo dono;
  `anon` sem acesso. As policies saem de um bloco `DO` com a lista de tabelas, para ficarem
  idênticas em todas. Além disso, o `with check` impede mover uma linha para outra empresa.
- **Exclusão física permitida nesta etapa**, porque ainda não há orçamentos apontando para o
  catálogo. A partir da Etapa 5, pacotes e opcionais usados em propostas passam a ser
  desativados, não excluídos.

## 12. Motor de preço (`src/domain/preco`)

- **Função pura e determinística**: sem banco e sem `Date.now()`, porque "hoje" entra como
  parâmetro. O resultado é JSON puro com `versaoMotor: 1`, pronto para ser congelado na proposta
  (Etapa 5).
- A ordem de cálculo é a do documento. Cada linha é arredondada meio para cima antes da soma,
  via `pctBp` (BigInt). O teste de aceitação do documento bate até o centavo, e a cobertura
  exigida no CI é de ≥ 95% (hoje 100% de linhas).
- Com erro, `ok = false`, mas as linhas que puderam ser calculadas continuam no resultado. Um
  opcional inválido não entra no total.
- O schema Zod valida o formato na fronteira do servidor. As regras de negócio ficam no motor,
  que devolve códigos e mensagens em português.

**Interpretações (o documento não fixa):**

1. **Criança informada na faixa da empresa, com o pacote tendo faixas próprias:** o cliente
   informa as crianças antes de escolher o pacote. Por isso, a faixa da empresa é mapeada para a
   faixa do pacote que contém a sua idade mínima. O id de uma faixa do próprio pacote também é
   aceito.
2. **Ajuste de 0 bp** não gera linha, mas "vence" a precedência. Assim, um feriado cadastrado
   com 0% anula o +10% de sábado.
3. **Espaço no local do cliente sem km informado**, com deslocamento configurado: erro
   `DISTANCIA_OBRIGATORIA`. Um km informado para um espaço comum é ignorado.
4. **Desconto**: o limite do usuário é conferido contra o valor pedido
   (`DESCONTO_ACIMA_LIMITE`). O desconto aplicado nunca passa do subtotal (aviso
   `DESCONTO_LIMITADO_AO_SUBTOTAL`).
5. **Parcelas**: N começa em `parcelas_max` e diminui até a primeira parcela vencer hoje ou
   depois. Se nem a última parcela cabe (o vencimento já passou), fica 1 parcela vencendo hoje,
   com o aviso `PRAZO_PARCELAS_CURTO`. Saldo zero não gera parcelas.
6. **Opcional repetido** na mesma entrada: `REFERENCIA_INVALIDA`.

## 13. Modelos de segmento (`src/domain/modelos`)

- São dados TypeScript validados com Zod, incluindo a integridade (chaves únicas, referências
  existentes, faixas sem sobreposição, deslocamento só com espaço no local do cliente).
- As referências internas são por **chave**, não por id. `contextoDoModelo` converte um modelo
  em `ContextoPreco` com ids sintéticos, e os testes rodam o motor em cada modelo.
- O seed do Buffet Demo é o modelo infantil em SQL. Um teste de integração compara o que está
  no banco com o modelo, para os dois não divergirem.

## 14. Servidor do catálogo

- `carregarContexto` lê tudo via `comUsuario`, ou seja, sob o RLS. Recebe `comUsuario` injetável
  para os testes.
- `gravarModelo` grava tudo numa única transação, com o RLS valendo (só o dono consegue
  inserir), e nunca sobrescreve: se existir qualquer pacote, não grava nada. Um
  `pg_advisory_xact_lock` por empresa evita que dois cliques simultâneos dupliquem o catálogo,
  o que é coberto por teste. A gravação fica registrada na auditoria.
- No simulador, "hoje" (fuso da empresa) e o limite de desconto do usuário vêm do servidor.
  O navegador só envia a escolha da festa.

## 15. Simulador

- `/app/empresa/simulador`, só para o dono (`exigirPerfil('dono')`). O vendedor vê uma tela
  "Acesso restrito", sem o erro genérico.
- É uma ferramenta de conferência, sem pretensão visual. Funciona em 375px e no desktop.

# Etapa 2: Minha empresa (configuração pelo celular)

## 16. Banco da Etapa 2

- **`empresas`** ganhou `logo_path`, `capa_path`, `cor_marca` (hex, padrão `#7C5CD6`) e `sobre`
  (≤ 600). O dono altera só essas colunas e as da Etapa 0 (grant por coluna). `slug`, `plano` e
  `trial_ate` continuam fora do grant. Um trigger recusa `fuso` fora de `pg_timezone_names`.
- **Slug**: muda só por `alterar_slug(novo)` (`security definer`, só dono, advisory lock). O slug
  anterior vai para `slugs_antigos` por 12 meses; ninguém mais pode usá-lo nesse período
  (`resolver_slug_disponivel` também pula slugs antigos válidos). Voltar a um slug antigo da
  própria empresa é permitido. `/b/[slug]` consulta `slug_atual_por_antigo` e responde **308**.
- **Storage**: bucket público `midia` (5 MB; jpeg, png, webp). Caminho
  `{empresa_id}/{logo|capa|pacotes}/{uuid}.webp`. Leitura pública; gravar, trocar e apagar só o
  dono, na pasta da própria empresa (policies em `storage.objects`).
- **E-mail**: trigger em `auth.users` copia a troca de e-mail para `usuarios.email`.

## 17. Server actions de configuração

- Todas em `src/server/actions/empresa/` e com o mesmo formato: `acaoDoDono` (exige dono e
  traduz erros), validação com o **mesmo schema Zod do formulário**, gravação via `comUsuario`
  (RLS), auditoria com `antes`/`depois` na mesma transação, `revalidatePath` e retorno
  `{ ok, mensagem } | { ok: false, erro, campos? }`. Os `campos` voltam para o campo certo do
  formulário (`aplicarErrosServidor`).
- **Salvar por seção**: cada card tem o próprio botão; listas (faixas, cardápio, ajustes,
  feriados, vínculos) são gravadas por "substituir tudo" numa transação.
- **Pacote novo nasce sem preço**: a tabela exige preço conforme o modelo, então o pacote é
  criado como "por faixa, sem faixas" (excedente 0). O motor e as pendências tratam isso como
  "sem preço" e o editor abre na seção Preço. Evita um formulário gigante de criação.
- **Duplicar** copia faixas, cardápio, crianças, tipos e vínculos; a cópia nasce **inativa** com
  " (cópia)". As fotos são compartilhadas: um arquivo só é apagado do Storage quando nenhum
  outro pacote o usa.
- **Opcional x pacote**: um select por pacote (pode comprar / só neste / já vem incluso) garante
  que nunca é compatível e incluso ao mesmo tempo. Marcar como incluso pelo editor do pacote
  troca um "compatível" que existisse.
- **Ajustes por dia**: uma lista única (dia da semana ou feriado, todos os turnos ou um turno,
  %), gravada de uma vez. Feriados são só as datas.
- **Pendências** (badge do menu): pacote ativo com preço, **tipo de festa ativo** (o motor exige
  um tipo; incluído porque uma empresa nova não conseguia simular), turno ativo e espaço ativo.

## 18. Imagens

- O navegador redimensiona (canvas) e exporta WEBP 0,82 (logo 512 px, capa 1920 px, foto de
  pacote 1600 px) e envia direto ao Storage com a sessão do dono; as policies valem ali. Depois
  uma server action valida o caminho (`{empresa}/{tipo}/{uuid}.webp`), grava e apaga o arquivo
  anterior. Se a gravação falhar depois do upload, sobra um arquivo solto (ver próximos passos).
- `next/image` com `unoptimized` (sem otimizador da Vercel): os arquivos já chegam no tamanho certo.

## 19. Usuários e service role

- **Primeira chave administrativa**: `SUPABASE_SERVICE_ROLE_KEY`, lida **só** em
  `src/server/auth/admin-supabase.ts` (`server-only`). O ESLint proíbe importar esse módulo em
  componentes, `src/lib`, páginas e no middleware; quem usa são as server actions de Usuários e
  a troca de senha. Sem a variável, criar vendedor mostra uma mensagem simples e o resto funciona.
- A regra fica em `src/server/usuarios/gerenciar.ts` com dependências injetadas (`AuthAdmin`,
  banco), para os testes de integração usarem uma Admin API falsa.
- **Criar vendedor**: Auth primeiro (`email_confirm`, `app_metadata.trocar_senha = true`, sem
  `nome_buffet` → o trigger de cadastro ignora), depois `usuarios` + auditoria numa transação
  com o cliente administrativo (o painel não tem grant de insert em `usuarios`). Falhou o banco,
  o usuário do Auth é apagado. A senha temporária (12 caracteres legíveis, `node:crypto`) é
  mostrada uma vez e nunca gravada.
- **Troca obrigatória**: `app_metadata` (o usuário não consegue alterar). Checada no middleware,
  no login (redirect de server action não passa pelo middleware) e em `exigirSessao`. Ao salvar
  a nova senha, a Admin API limpa a marca.
- **Desativar** = `usuarios.ativo = false` + ban no Auth, na mesma transação (se o Auth falhar,
  nada muda). Reativar desfaz. O dono não desativa a si mesmo.
- Limite de desconto: tela em %, banco em `numeric(5,2)` (Etapa 0), conversão por bp.

## 20. Interface

- Componentes próprios em `src/components/app/campos` (dinheiro, percentual, duração, dias,
  telefone, lista ordenável, itens de cardápio, upload) e `form/` (seção, campo, formulário
  inline). Toast próprio (sem dependência nova), aviso de alterações não salvas
  (`beforeunload` + clique em link interno).
- Vendedor vê as telas de configuração com `fieldset disabled` e sem botões; Usuários, Plano e
  Simulador ficam fora do menu dele e mostram "Acesso restrito" pela URL.
- Reordenar com botões subir/descer (funciona no celular, sem arrastar).

# Etapa 3: agenda, disponibilidade e deploy automático do banco

## 21. Deploy automático das migrations

- `.github/workflows/migrations-producao.yml` roda em push na `main` que muda
  `supabase/migrations/**` (e manualmente). Passos: `supabase link` → `db push --dry-run`
  (vai para o resumo do job) → `db push`. `concurrency` fixa, sem cancelar execução em
  andamento. CLI fixada em 2.118.0 (a mesma do `package.json`).
- No PR, o job "Migrations que serão aplicadas no merge" faz o dry-run contra produção e
  publica a lista no resumo. Sem os segredos (PR de fork), é pulado sem falhar o CI. Ele também
  prova, antes do merge, que o runner conecta no banco.
- Segredos do repositório: `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`. O ref do projeto
  fica no próprio workflow.
- **Expandir → contrair:** a Vercel publica o código junto com o workflow; toda migration
  precisa funcionar com o código anterior (regra no `CLAUDE.md`). As 4 migrations desta etapa
  são só adições.

## 22. Modelo da agenda

- **Slot** = espaço + data + turno. Intervalo = `[data + hora_inicio no fuso da empresa,
início + duração + intervalo entre eventos)`. `regras_comerciais.intervalo_entre_eventos_min`
  (padrão 60) é o tempo de limpeza/montagem.
- **Ocupam:** reserva confirmada ativa e pré-reserva ativa **não vencida**. Pré-reserva com
  `expira_em <= now()` conta como livre em toda leitura e checagem, mesmo antes do job.
- **Conflito por horário, não por turno:** turnos diferentes do mesmo espaço conflitam se os
  intervalos se sobrepõem (encostar não conflita). Turno que passa da meia-noite alcança o dia
  seguinte.
- **Capacidade:** `espacos.eventos_simultaneos` (padrão 1). Com capacidade > 1, contamos as
  ocupações que tocam o intervalo do slot (regra conservadora, simples de explicar).
- **Bloqueio** vale para o slot quando a data é a mesma, o turno é nulo (dia inteiro) ou igual,
  e o espaço é nulo (todos) ou igual. Um evento da noite de D que invade D+1 **não** é barrado
  por bloqueio de D+1 (o bloqueio é por data e turno, não por horário).
- `reservas.fim` guarda o intervalo da época: mudar o intervalo depois não recalcula reservas
  antigas (vale para as novas).
- **Turnos com folga:** para o padrão de 60 min não fazer os turnos colados do modelo infantil
  conflitarem entre si, o modelo e o seed passaram para Almoço 10h–14h, Tarde 15h–19h e Noite
  20h–00h. Empresas em produção mantêm os seus turnos e podem ajustar o intervalo.

## 23. Escrita só por funções, com trava

- `reservas` e `bloqueios`: leitura por RLS na mesma empresa; **nenhum** grant de escrita. Toda
  escrita passa por funções `security definer` (`criar_reserva`, `confirmar_reserva`,
  `cancelar_reserva`, `estender_pre_reserva`, `criar_bloqueio`, `remover_bloqueio`), que
  validam empresa e perfil, gravam auditoria e travam antes de checar conflito.
- **Trava por empresa** (`pg_advisory_xact_lock`), não por (empresa, espaço, data): turnos que
  passam da meia-noite alcançam outras datas e bloqueios podem valer para todos os espaços.
  Travar por empresa é correto em todos esses casos, e a contenção num buffet é desprezível. O
  teste de concorrência (duas conexões reais) prova que só uma transação vence.
- `criar_bloqueio` aceita um período (até 1 ano) numa única transação e recusa se houver
  reserva ativa em qualquer slot atingido (o dono cancela antes).
- Erros com código estável (`AGENDA_SLOT_OCUPADO`…); o app traduz em `domain/agenda/mensagens`.
- Espaço ou turno com reserva não pode ser excluído (FK); a tela avisa para desativar.

## 24. Disponibilidade e jobs

- `_disponibilidade(empresa, de, ate, espaco)` monta cada data × turno do dia × espaço ativo e
  devolve `estado` (`livre`, `pre_reservado`, `reservado`, `bloqueado`, `lotado`), `vagas`,
  `capacidade` e o `expira_em` mais próximo. **Nunca** devolve nome de cliente. Máximo de 400
  dias por chamada.
- `disponibilidade(...)` é a versão do painel (exige a empresa do usuário). `anon` não executa
  nada nesta etapa; a Etapa 4 cria um wrapper por slug sobre `_disponibilidade`.
- **Domínio × SQL:** `src/domain/agenda` repete a regra (`intervaloDoSlot`, `estadoDoSlot`) e
  um teste de integração compara os dois numa tabela de casos.
- **Jobs (`pg_cron`)**: `vencer_pre_reservas` a cada 5 min e `marcar_realizadas` às 07:00 UTC
  (04:00 de Brasília). A migration só agenda se `pg_cron` existir (o Postgres puro dos testes
  não tem). Os jobs só persistem o estado.

## 25. Tela da agenda

- **Celular:** lista dos próximos 60 dias (ou do mês escolhido) agrupada por data. **Desktop:**
  calendário mensal com bolinhas por estado e filtro por espaço. Tocar num dia abre o painel
  (sheet no celular, feito sobre o Dialog que já existia) com os turnos de cada espaço e as
  ações de cada estado.
- Aviso no topo das pré-reservas que vencem em 12h. Vendedor reserva, confirma e cancela, mas
  não bloqueia.
- O simulador mostra o estado do slot escolhido, com a mesma função `disponibilidade`.

# Etapa 4: link público, wizard de orçamento e leads

## 26. Acesso público: schema `publico` + `comAnon`

- Toda leitura e escrita do link público passa por funções do schema **`publico`**
  (`security definer`, `search_path` vazio, `execute` só para `anon`). O schema **não** é
  exposto na API do Supabase (fica fora de `[api] schemas`), então ninguém chama essas funções
  com a anon key: só o nosso servidor, por conexão direta, numa transação com `role anon`
  (`comAnon` em `src/server/db/anon.ts`). `anon` continua sem privilégio em nenhuma tabela
  (teste de integração percorre todas).
- Mesmo só sendo alcançáveis pelo servidor, as funções revalidam tudo: empresa existe, plano
  não suspenso, estado e validade do orçamento, limites. Toda função com token exige também o
  slug: o token de um buffet não abre nada na página de outro.
- **Modelo de confiança do preço:** `concluir_orcamento` congela o resultado que o servidor
  calculou com `calcularOrcamento`. O navegador manda só escolhas (o schema Zod descarta preço,
  desconto, total e "hoje"); desconto é sempre zero e o limite de desconto, zero.
- `server/db/admin.ts` deixou de ser usado pela página pública (`publico.buffet` e
  `publico.slug_atual` substituem as leituras de nome/slug).
- `catalogo_publico` do plano virou desnecessário: `contexto_preco` devolve o catálogo ativo
  ao servidor, que monta o `ContextoPreco` com o **mesmo mapper do painel**
  (`server/catalogo/montar-contexto.ts`) e, a partir dele, a vitrine sem preço
  (`domain/publico/vitrine.ts`). Teste: contexto público = contexto do painel (só ativos).

## 27. Leads, orçamentos e status

- Tabelas novas (`leads`, `orcamentos`, `orcamento_itens`, `atividades`, `visitas`,
  `funil_eventos`) com FK composta por empresa, RLS só de leitura para usuários ativos e
  nenhuma escrita direta. `reservas.lead_id/orcamento_id` ganharam FK.
- Lead único por `(empresa, eh_teste, whatsapp)`: o dono testando com o próprio número não
  colide com um cliente real. Lead existente: o nome **não** é sobrescrito (o digitado vai para
  a atividade "voltou") e a resposta é sempre um token novo, igual para lead novo ou antigo.
- Número do orçamento sequencial por empresa, sob `pg_advisory_xact_lock` próprio. Token: 2 ×
  `gen_random_uuid()` em base64url (~244 bits, sem depender de `pgcrypto`).
- Concluir de novo um orçamento já enviado (o cliente voltou e mudou algo) marca o anterior como
  `substituido`: a URL de uma proposta nunca muda de conteúdo. Desde a Etapa 5 isso cria uma
  **versão** do mesmo número (seção 32), não um número novo.
- **Status do lead:** regra única em `public._lead_transicao` com espelho em
  `domain/publico/status-lead.ts` e teste de equivalência em todas as combinações. As funções da
  agenda (`confirmar`, `cancelar`, `vencer_pre_reservas`, `marcar_realizadas`) mantêm assinatura
  e comportamento e só sincronizam o lead quando a reserva tem `lead_id`. `abandonar_leads`
  (pg_cron, 15 min) marca "abandonou" o lead `novo` sem atividade há 24h.
- `criar_reserva` virou um wrapper de `_criar_reserva_core` (mesma assinatura), usado também
  por `publico.pre_reservar`.

## 28. Pré-reserva pelo link

- Trava da agenda por empresa, revalidação de plano, validade, antecedência e slot. Conflito →
  `SLOT_INDISPONIVEL` com até 3 sugestões (mesmo turno e espaço, nos 60 dias seguintes). Tocar
  numa sugestão refaz o orçamento com a nova data (o preço pode mudar com o dia).
- Uma pré-reserva ativa por lead: a anterior **vinda do link** é cancelada ("cliente escolheu
  outra data"); reservas manuais do dono nunca são tocadas (o WhatsApp não é verificado).
- Duplo clique devolve a mesma pré-reserva. Modo teste valida tudo e não grava (`simulada`).

## 29. Antiabuso e privacidade

- Limites por janela de 1h em `publico.tentativas` (só hashes): iniciar 10/IP, 5/WhatsApp,
  300/empresa; pré-reserva e visita 5/IP, 3/WhatsApp, 60/empresa; funil 400/IP (excesso é
  ignorado em silêncio). `LIMITE_EXCEDIDO` → "Muitas tentativas. Tente de novo em alguns minutos."
- IP nunca salvo: `sha256(ip + IP_HASH_SALT)`; WhatsApp nos limites também só como hash.
  `IP_HASH_SALT` obrigatória em produção (`src/instrumentation.ts` falha ao subir).
- No passo do WhatsApp: honeypot invisível e tempo mínimo de 2,5 s medido por um instante
  assinado (HMAC) pelo servidor. Robô não cria lead.
- Logs só com códigos; nunca nome, WhatsApp ou IP.
- **Modo teste** = usuário logado da própria empresa abrindo o link (sessão no servidor, nunca
  parâmetro). Lead e orçamento `eh_teste`, funil não conta, pré-reserva simulada.

## 30. Modo de exibição de preço

- Antes do WhatsApp o navegador recebe só a vitrine (nunca faixas, preço por pessoa, fatores
  ou ajustes): `exato` → "a partir de" geral e por pacote; `faixa` → só o "a partir de" geral;
  `apos_contato` → nenhum valor. Depois do WhatsApp, a prévia traz o total de cada pacote, os
  extras e o resultado completo. Testado no domínio e na integração.

## 31. Telas públicas e desempenho

- `/b/[slug]` é Server Component quase sem JS (acordeão com `<details>`), identidade do buffet
  com contraste AA garantido (`domain/publico/cor.ts`), estados de suspenso e pendências, OG
  image com `next/og`, headers de segurança em `/b/**` e `noindex` no wizard e na proposta.
  `preferredRegion = 'gru1'` (banco em sa-east-1).
- Wizard: um componente por passo carregado sob demanda, `?passo=` no histórico (voltar
  funciona), progresso em `localStorage` (só escolhas) e no servidor depois do WhatsApp; o
  cookie `httpOnly` com o token permite retomar após recarregar. Calendário próprio sobre
  `domain/agenda/calendario`.
- Cache: só o catálogo (contexto + vitrine) fica em `unstable_cache` com a tag `buffet:{slug}`,
  invalidada por toda action de configuração (`acaoDoDono`) e pela troca de slug. A identidade
  do buffet não fica em cache (a suspensão vale na hora); disponibilidade e preço nunca.
- `loading.tsx` só no wizard e na proposta: na página do buffet o streaming transformaria o 404
  e o 308 em 200.
- First Load JS: `/b/[slug]` 113 kB (102 kB são o JS compartilhado do Next/React, então a meta
  de 100 kB não é alcançável sem trocar de framework); wizard 150 kB; proposta 149 kB.
- Espaço "no local do cliente": o preço público sai **sem deslocamento**, com aviso; CEP/km
  ficam para depois.

## 32. Versões do orçamento (Etapa 5)

- Um orçamento = um **número**; cada alteração = uma **linha nova** de `orcamentos` com o mesmo
  `(empresa_id, numero)` e `versao` 1, 2, 3… Constraints: `unique (empresa_id, numero, versao)`
  e o índice parcial `orcamentos_vigente_idx (empresa_id, numero) where status <> 'substituido'`
  (no máximo uma vigente por número, também sob concorrência: teste com duas versões ao mesmo
  tempo).
- Núcleo único `_orcamento_concluir`: trava o número (advisory lock) e a agenda, marca a base
  como `substituido` **antes** de inserir a versão nova, congela resultado, itens (com
  `referencia_id` do catálogo) e conteúdo, e aplica o evento no lead (`versao_criada`,
  `orcamento_criado` ou `orcamento_concluido`). Usado pelo wizard (`publico.concluir_versao`),
  pela atualização de preços (`publico.atualizar_precos`) e pelo orçamento interno
  (`salvar_orcamento_interno`). Uma versão concluída nunca muda.
- Cada versão tem o seu token. `publico._orcamento(slug, token)` resolve sempre a **vigente** do
  mesmo número: o token antigo leva à versão atual (a página redireciona com
  `?atualizada=1` e mostra "Esta proposta foi atualizada em 12/11"); o PDF do token antigo
  responde 307 para o PDF vigente. `publico.pre_reservar` exige o token vigente
  (`PROPOSTA_ATUALIZADA` caso contrário). O painel abre qualquer versão pelo id (RLS).
- **Dados existentes:** cada orçamento da Etapa 4 virou a versão 1 do próprio número (já tinham
  `versao = 1`); `pacote_id` e `orcamento_itens.referencia_id` foram preenchidos a partir do
  resultado congelado. Os `substituido` da Etapa 4 têm números diferentes e ficaram como estão.
- **Compatibilidade no deploy:** todas as assinaturas `publico.*` usadas pela Etapa 4 continuam;
  `publico.concluir_orcamento` (12 argumentos) virou um wrapper de `concluir_versao`.

## 33. Versão nova de orçamento pré-reservado (decisão)

A regra fica no núcleo, na mesma transação e com a trava da agenda:

| O que mudou                                          | O que acontece                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Só convidados, pacote, extras ou preço               | A reserva continua e passa a apontar para a versão nova (`orcamento_id`, convidados, valor), atualizada só pela função SQL                                                                                                                        |
| Data, horário ou espaço, numa **pré-reserva**        | Se o slot novo estiver livre, troca atômica: cancela a antiga ("orçamento alterado") e cria a pré-reserva nova com o prazo cheio. Se não estiver livre, **recusa a versão inteira** (`AGENDA_SLOT_OCUPADO`) e a pré-reserva antiga continua de pé |
| Data, horário ou espaço, numa **reserva confirmada** | Recusa com `ORCAMENTO_RESERVA_CONFIRMADA` ("cancele a reserva na Agenda antes"): o sinal já foi pago                                                                                                                                              |

Por que recusar em vez de "liberar a antiga e só pré-reservar se o slot novo estiver livre": o
vendedor nunca perde a data do cliente por acidente; quando o slot está livre o resultado é o
mesmo da regra do documento.

## 34. Conteúdo congelado e identidade ao vivo

- Na conclusão de cada versão o servidor monta `orcamentos.conteudo` (`ConteudoCongelado`,
  `formato: 1`, em `domain/proposta/conteudo.ts`): pacote com cardápio e duração, convidados por
  faixa (com rótulo), espaço, abertura **já preenchida**, textos comerciais (condições, formas
  de pagamento, não incluso, cancelamento, alteração de convidados) e o % do sinal. Mudar o
  catálogo ou as regras depois **nunca** altera uma versão enviada (teste de integração na web e
  no conteúdo do PDF).
- **Não congelados (lidos ao vivo):** logo, cor, razão social, CNPJ, endereço e WhatsApp do
  buffet. São identidade, não condição comercial; corrigir o CNPJ deve valer para todas.
- **Versões da Etapa 4** (`conteudo` nulo) mostram só o que foi congelado na época: resultado,
  itens e o sinal do resultado. Cardápio e políticas não aparecem nelas.
- A abertura usa `{nome}` (primeiro nome), `{data}`, `{convidados}`, `{tipo}` e `{buffet}`;
  variável desconhecida fica como está; texto vazio = sem abertura.

## 35. Proposta e PDF

- **Um modelo só:** `montarConteudo(versao, buffet)` gera o `ModeloProposta` com as 11 seções;
  a página (`components/proposta/proposta-web.tsx`) e o PDF (`server/proposta/pdf.tsx`) só
  desenham esse modelo. Um carregador para a web e o PDF público
  (`server/proposta/carregar.ts`, via `publico.proposta` + `comAnon`) e uma variante com RLS
  para o painel. `publico.proposta` nunca devolve observações internas, motivo do desconto nem
  autor (teste procura as strings no JSON e no texto do PDF).
- **PDF:** `@react-pdf/renderer` no servidor (sem navegador headless), runtime Node, `gru1`,
  A4, Manrope TTF 400/600/800 no repositório (OFL, `src/server/proposta/fontes/`), sem
  hifenização, título de seção com `minPresenceAhead` (nunca órfão), linha de item sem quebra
  e cabeçalho da tabela repetido (`fixed`), rodapé com página. O logo é WEBP no Storage e o
  react-pdf não lê WEBP: o servidor baixa (timeout 2,5 s) e converte para PNG 240 px com
  **`sharp`** (autorizado nesta etapa); falhou, o PDF sai sem logo.
- Rotas: `GET /b/[slug]/proposta/[token]/pdf` (limite 30/h por IP em `publico.tentativas`,
  token antigo → 307, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`), `GET
/app/orcamentos/[id]/pdf` (qualquer versão, RLS) e `GET /app/empresa/proposta-exemplo/pdf`.
  Nome `Proposta 0042 - Buffet X - Ana Souza.pdf`, com `filename*` UTF-8 e versão ASCII.
- `next.config`: `serverExternalPackages` com `@react-pdf/renderer` e `sharp`;
  `outputFileTracingIncludes` leva a pasta das fontes para as três rotas de PDF. O JS do
  navegador não muda.
- Medido no build local: PDF do Buffet Demo ~120 ms (430 ms na primeira chamada), ~23 kB sem
  logo. First Load JS: proposta 146 kB, `/app/orcamentos/novo` 169 kB.

## 36. Orçamento interno ("+ Orçamento")

- `/app/orcamentos/novo` (com `?lead=` preenche o cliente) e `/app/orcamentos/[id]/editar`
  (nova versão a partir da vigente). Tela única, mobile-first, com resumo fixo recalculado no
  servidor a cada mudança (`previaInterna`, mesmo motor, canal `interno`).
- Desconto (% ou R$), itens avulsos e observações. O limite de desconto vem do banco
  (`usuarios.limite_desconto_pct`; dono sem limite) e é conferido duas vezes: no motor
  (`DESCONTO_ACIMA_LIMITE`) e em `salvar_orcamento_interno` (`ORCAMENTO_DESCONTO_ACIMA_LIMITE`).
  O preço nunca vem do navegador: a action recalcula e grava.
- Mesmo WhatsApp reaproveita o lead (aviso na tela ao digitar). Lead criado pelo painel nasce
  com consentimento nulo e a origem informada.
- Data dentro da antecedência: alerta e "Ciente da antecedência" (grava `fora_antecedencia`;
  só então `pre_reservar_orcamento` aceita a data).
- Saídas: Enviar pelo WhatsApp (`wa.me` para o cliente com o link), Copiar link, Baixar PDF e
  Pré-reservar (origem `orcamento`, vai para a Agenda). Cada envio grava `proposta_enviada` na
  linha do tempo (`marcar_orcamento_enviado`). Rascunho do formulário no `localStorage`.
- No navegador só a máscara do telefone (sem `libphonenumber-js/max`): o servidor converte.

## 37. Rastreio de aberturas e validade

- `publico.proposta` só lê; a página chama `publico.registrar_abertura(slug, token,
eh_usuario_empresa, ip_hash)`. Usuário logado da própria empresa (sessão, como o modo teste)
  não conta. Soma `aberturas`, marca `visualizado` na primeira, grava a atividade
  `proposta_aberta` no máximo 1 vez a cada 30 min e aplica a temperatura. Limite 120/h por IP.
- **Quente** = 2 ou mais atividades `proposta_aberta` em 3 dias (`_temperatura_aberturas`,
  espelho em `domain/proposta/temperatura.ts`, teste de equivalência). Como a atividade é
  deduplicada a cada 30 min, aberturas seguidas contam como uma.
- **Validade:** vale até `validade_ate` inclusive, no fuso do buffet. Vencida conta como
  expirada já na leitura (`_orcamento_expirar` em `proposta`, `pre_reservar` e
  `atualizar_precos`), antes do job `expirar_orcamentos` (pg_cron 04:10 de Brasília). Evento
  `orcamento_expirado`: lead `em_andamento` → `frio`.
- "Atualizar com os preços de hoje" (`publico.atualizar_precos`, só para vencida): o servidor
  recalcula e cria a versão nova; data que não é mais possível devolve o código e o wizard abre
  com as escolhas preenchidas.

## 38. Exclusão vira desativação no catálogo

- Trigger `before delete` em pacotes, opcionais, turnos, espaços e tipos de festa recusa com
  `CATALOGO_ITEM_EM_USO` (errcode `restrict_violation`) quando algum orçamento usa o item;
  liberado quando a empresa inteira está sendo apagada (cascata). `catalogo_em_uso()` lista os
  usados e as telas trocam "Excluir" por "Desativar" (`server/catalogo/em-uso.ts`).
- Dados da proposta em Minha empresa: razão social, CNPJ (dígitos verificadores no domínio,
  só formato no banco) e endereço; abertura por tipo de festa com botões de variáveis e prévia;
  política de alteração de convidados nas Regras; "Ver minha proposta" monta a proposta e o PDF
  em memória com uma festa de exemplo (`domain/proposta/exemplo.ts`), sem gravar nada.

# Etapa 6: caixa de leads, ações do vendedor e tarefas

## 39. Caixa priorizada

- `/app/leads` é a tela inicial: topo **Hoje** (pré-reservas, visitas, tarefas de hoje,
  atrasadas e novos sem contato; tocar filtra a lista, tocar de novo tira o filtro) e a lista
  ordenada por prioridade, com "Carregar mais" por cursor.
- **Grupos** (`public._lead_grupo`, espelho em `domain/leads/prioridade.ts`, teste de
  equivalência com mais de mil combinações e um teste que compara a ordem da consulta com
  `ordenarCaixa`):
  1. pré-reserva ativa (a que vence primeiro no topo);
  2. visita pedida e ainda não confirmada, ou confirmada para hoje ou amanhã;
  3. tarefa do usuário atrasada ou de hoje;
  4. quente (mais recente primeiro);
  5. novo sem nenhum contato (quem espera há mais tempo primeiro);
  6. em andamento com próximo contato vencido;
  7. demais abertos, por última atividade;
  8. reservado, realizado, perdido e cancelado (fora da caixa padrão; aparecem filtrando).
- "Hoje" e "amanhã" são do fuso da empresa. O **motivo** legível do cartão ("Pré-reserva vence
  em 5h", "Pediu visita", "Tarefa atrasada", "Abriu a proposta 3x", "Esperando há 2 dias",
  "Próximo contato vencido") sai de `motivoPrioridade`, no servidor.
- **Decisão:** o grupo é calculado no SQL porque a ordenação e a paginação acontecem no banco
  (keyset `(grupo, ordem, id)`, sem `offset`). A ordem é `bigint` em microssegundos e viaja
  como texto no cursor: com float, o arredondamento na volta (`extra_float_digits`) pulava ou
  repetia leads entre páginas. `public.caixa_leads(filtros, cursor, limite)` é
  `security invoker` (o RLS vale) e devolve tudo de uma vez por página: grupo, ordem, total da
  versão vigente, resumo da festa, pré-reserva, próxima tarefa do usuário, próxima visita e
  responsável. `public.resumo_hoje()` dá os contadores; o badge de **Leads** na navegação é o
  número de leads nos grupos 1 e 2.
- **Filtros na URL** (`domain/leads/filtros.ts`): `ver` (atalho do topo), `q` (nome ou
  telefone, com ou sem máscara: 4 ou mais dígitos buscam no E.164), `status`, `temp`, `origem`,
  `resp` (`meus`, `sem` ou o id), `de`/`ate` (data da festa), `atrasadas`, `teste`. Celular:
  sheet com "Aplicar"; desktop: painel que aplica na hora. Voltar do navegador volta o filtro.
- O detalhe é uma página (`/app/leads/[id]`), para os avisos da Etapa 7 abrirem direto; o
  formato antigo `?lead=` redireciona.

## 40. Ações do lead

- Todas por funções `security definer` com auditoria e códigos estáveis (`server/leads/erros.ts`
  traduz): `registrar_contato`, `atualizar_dados_lead` (o WhatsApp não muda),
  `atribuir_responsavel`, notas, tarefas, visitas, `marcar_perdido`, `reabrir_lead` e
  `registrar_mensagem`. O vendedor pode tudo nos leads da empresa (sem carteira por enquanto).
- **Responsável automático:** a primeira ação de um usuário (contato, nota, tarefa, visita,
  mensagem) num lead sem responsável o torna responsável. Abrir o lead não conta. O dono atribui
  a qualquer usuário ativo; o vendedor só assume para si (`LEAD_SO_ASSUMIR`).
- Qualquer ação do vendedor preenche `primeiro_contato_em` e `ultima_acao_vendedor_em`; o
  status muda de **novo** para **em andamento** só com `registrar_contato` (ou visita
  confirmada).
- **Perdido** (motivo obrigatório: preço, data indisponível, fechou com outro buffet, desistiu
  da festa, parou de responder, fora da área ou outro com texto): aceito a partir de novo, em andamento, abandonou, frio e
  pré-reservado; reservado devolve `LEAD_RESERVADO_NAO_PERDE`.
  - **Decisão (perdido com pré-reserva):** a pré-reserva é cancelada na mesma transação
    ("Lead marcado como perdido") e a data fica livre na Agenda. A trava é a mesma da Agenda,
    sempre na ordem agenda → lead; se um vendedor marca perdido enquanto outro confirma o sinal,
    um vence e o outro recebe erro claro (teste de concorrência).
  - Ao perder, reservar ou realizar, as tarefas abertas do lead são canceladas
    (`_lead_aplicar_evento`, então vale também para a Agenda).
- **Decisão (reabrir):** volta ao status de antes (`status_antes_de_perder`), exceto
  pré-reservado, que volta como **em andamento**: a pré-reserva foi cancelada e a data pode já
  estar ocupada. Regra em `_lead_status_reaberto` e `statusAoReabrir`, com equivalência.
- **Notas:** só a equipe vê; o autor edita ou apaga em até 24h, o dono apaga qualquer uma. A
  atividade `nota` guarda o `nota_id` e sai junto quando a nota é apagada.
- **Visitas:** o pedido do link é confirmado com dia e hora (`confirmar_visita`), ou o vendedor
  agenda direto (`agendar_visita`); remarcar, cancelar com motivo e marcar realizada. Visita
  confirmada deixa o lead quente.
- **Temperatura por inatividade:** lead aberto sem atividade há 7 dias vira frio
  (`_temperatura_inatividade`, espelho em `domain/leads/temperatura.ts`), pelo job
  `esfriar_leads` (pg_cron, 04:20 de Brasília).
- Detalhe no celular: barra fixa embaixo (WhatsApp, Registrar contato, + Tarefa e ⋯); cada
  formulário abre num sheet de um nível só. Concluir tarefa e registrar contato são otimistas.

## 41. Tarefas

- Tabela `tarefas` (só leitura para `authenticated`; escrita por `criar_tarefa`,
  `concluir_tarefa`, `adiar_tarefa`, `reabrir_tarefa`, `cancelar_tarefa` e
  `definir_proximo_contato`). `vence_efetivo = coalesce(adiada_para, vence_em)` (coluna gerada).
- `origem` (`manual` ou `regra`) e `regra` preparam a Etapa 7: o índice único parcial
  `tarefas_regra_aberta_idx (lead_id, regra) where regra is not null and aberta` garante no
  máximo uma tarefa aberta por regra em cada lead. "Próximo contato" usa a regra
  `proximo_contato`, então marcar de novo atualiza a mesma tarefa em vez de duplicar.
- Datas: atalhos ("amanhã 9h", "em 3 dias", "próxima semana") e data com hora interpretados no
  servidor, no fuso da empresa (`domain/leads/adiar.ts`, 9h como padrão); o SQL só confere que
  é futuro.
- `/app/tarefas`: atrasadas, hoje, próximos 7 dias e feitas recentemente; concluir, adiar e
  abrir o lead. Tarefa com mensagem sugerida tem "Enviar no WhatsApp".

## 42. Mensagens prontas

- `domain/leads/mensagens.ts`: cinco situações (primeiro contato, proposta aberta sem resposta,
  pré-reserva vencendo, confirmar visita, reativar lead frio) e `situacaoDoMomento`, que escolhe
  a do momento. Variável que falta sai do texto (nunca "undefined"). A data da festa só entra
  na reativação se ainda estiver livre (o servidor confere a disponibilidade).
- O botão WhatsApp abre um sheet com o texto editável; nada é enviado sozinho. "Abrir WhatsApp"
  leva para `wa.me/<E.164 sem +>?text=` e grava `mensagem_copiada` na linha do tempo.

## 43. Desempenho da caixa

- Medido com `pnpm db:seed:volume` (5.000 leads numa empresa, com orçamentos, tarefas,
  visitas e reservas proporcionais), `explain analyze` no Postgres local:
  - `caixa_leads` padrão: ~35–42 ms; com filtros (busca, status, atalho): 19–25 ms;
  - `resumo_hoje`: ~12 ms.
- O que fez a diferença (a primeira versão passava de 130 ms): parâmetros num CTE
  `materialized`, agregados por lead com `empresa_id` escalar, nomes (responsável, tipo de festa,
  turno) só depois do `limit`, e `_lead_grupo`/`_lead_ordem` sem `set search_path` para o
  planner poder fazer inline.
- Bundle: nenhum componente cliente de Leads ou Tarefas importa `domain/phone`
  (`libphonenumber-js/max`) nem o índice `domain/leads`; o telefone chega formatado do
  servidor. First Load JS: `/app/leads` 152 kB (era 198 kB), `/app/leads/[id]` 183 kB,
  `/app/tarefas` 175 kB.

# Visual do painel

## 44. Tema escuro do painel

- Só a área logada é escura: preto, cartões grafite bem arredondados (22px), verde-limão
  (`--primary: #3ee42e`, texto preto por cima) como destaque, botões em pílula
  (`--radius-botao`) e números grandes e finos. Link público, proposta, login e cadastro
  continuam claros (o link público usa a cor do buffet).
- **Como liga:** o layout do painel marca `data-painel`, e `globals.css` redefine os tokens em
  `:root:has([data-painel])`. Por estar no `:root`, diálogos, sheets, menus e toasts (portais
  no `body`) também ficam escuros, sem piscar (vem pronto do servidor). A variante `dark:` do
  Tailwind vale no painel inteiro.
- `.tema-claro` volta aos tokens claros num trecho (prévia da proposta em Minha empresa: a
  proposta é um documento do cliente e aparece como ele vai ver).
- Cores de estado no escuro: fundo translúcido do tom (`bg-amber-400/10`, `/15`) com texto
  claro do mesmo tom (`text-amber-300`), nunca os fundos claros (`bg-*-50`/`100`).
- Destaques da referência: topo "Hoje" com um bloco verde-limão (pré-reservas), um claro
  (visitas, `bg-destaque`) e os demais grafite; item ativo da navegação em pílula clara.

# Avisos e follow-up (Etapa 7)

## 45. Fila de avisos (outbox no banco)

- **Tabelas:** `avisos` (o que aparece no painel: um por usuário e evento, `chave` única para
  idempotência, `agrupados`, `agendado_para`, `lido_em`) e `avisos_entregas` (uma por canal
  externo: `push` ou `whatsapp`; `status` `pendente` → `enviando` → `enviado`/`falhou`/
  `ignorado`, `tentativas`, `proximo_envio_em`, `bloqueado_ate`, `erro_codigo`). Mais
  `push_inscricoes`, `preferencias_avisos` (uma linha por usuário, criada sob demanda) e
  `regras_follow_up`. Leitura por RLS só do próprio usuário (regras: a empresa); nenhuma escrita
  direta: tudo por funções `security definer`.
- **Nascimento na mesma transação do evento.** Decisão: em vez de redefinir
  `_lead_aplicar_evento` (risco de regressão nas Etapas 4 a 6), dois triggers novos:
  `atividades_avisos` (after insert em `atividades`: `pre_reserva_pedida` e `visita_pedida`
  com `autor = 'cliente'`, e a reavaliação das tarefas automáticas do lead) e `leads_esquentou`
  (lead que vira quente por reabrir a proposta). Pré-reserva feita pelo vendedor não avisa.
  Transação desfeita = aviso desfeito.
- `_aviso_criar(empresa, usuário, tipo, lead, dados, chave, silencio)`: ignora lead de teste;
  `chave` repetida não cria nada; **agrupa** (mesmo tipo, lead e usuário em 10 min soma
  `agrupados` e atualiza os dados); calcula o silêncio; cria a entrega `push` só se o usuário
  tem aparelho inscrito e a `whatsapp` só com `whatsapp_ativo`.
- **Destinatários** (`_aviso_destinatarios`, espelho em `domain/avisos/destinatario`): o
  responsável do lead; sem responsável, os donos ativos; e os donos que ligaram "receber também
  os avisos dos leads com vendedor".
- **Silêncio** (padrão 22:00–07:00, por usuário, no fuso da empresa, com virada de dia;
  `_aviso_agendar` = `domain/avisos/silencio`): o painel mostra na hora; push e WhatsApp ficam
  com `proximo_envio_em` no fim do silêncio. Resumo diário e aviso de teste não esperam.
- **Avisos por tempo** (`gerar_avisos_tempo`, a cada 5 min): pré-reserva vencendo (12 h antes),
  orçamentos sem ação (blocos de 2 h, 9h–18h, segunda a sábado, chave por bloco), cliente parou
  (passo ≥ 3, parado há 30 min) e resumo diário às 8h (não sai zerado). Idempotentes pela
  `chave`.
- **Envio fora de transação.** `reservar_entregas(limite)` (só `service_role`): solta as
  `enviando` com aluguel vencido, marca `ignorado`/`RESOLVIDO` o que deixou de valer
  (`_aviso_ainda_vale`: a pré-reserva não está mais ativa, a visita já foi tratada), e pega as
  vencidas com `for update skip locked`, marcando `enviando` com `bloqueado_ate = now() + 2 min`.
  O servidor envia e chama `concluir_entrega`: sucesso = `enviado`; erro = nova tentativa em 1,
  5, 15 e 60 min e `falhou` na 5ª; canal sem configuração = `ignorado` (`CANAL_DESLIGADO`);
  endpoint de push 404/410 apaga a inscrição. Dois processadores ao mesmo tempo nunca pegam a
  mesma entrega.
- **Quem processa:** `POST /api/avisos/processar` com `Authorization: Bearer CRON_SECRET`
  (comparação em tempo constante; 401 sem ele), chamada pelo `after()` das ações do link público
  (pré-reserva e visita) e a cada minuto pelo `pg_cron` + `pg_net`
  (`chamar_processador_avisos`, que lê a URL e o segredo do **Vault** e só chama se houver
  entrega vencida). Decisão: o job é sempre agendado e não faz nada sem os segredos; cadastrar
  no Vault depois do merge já liga a fila (`docs/AVISOS_CONFIGURACAO.md`). Sem `pg_cron`/`pg_net`
  (CI, Postgres puro), a migration só avisa.
- Logs da fila só com ids, canais e códigos de erro; nunca nome, telefone ou texto do aviso.

## 46. Canais

- `src/server/avisos/canais/`: interface `Canal { nome, configurado(), enviar() }`, com as
  dependências injetadas (testes com HTTP falso).
  - **Painel:** sempre ligado; é a fonte da verdade. Sino no cabeçalho (contador por
    `GET /api/avisos/contagem` a cada 20 s e ao voltar para a aba), `/app/avisos` (30 dias).
  - **Push (PWA):** `web-push` com VAPID; `public/sw.js` mostra a notificação e abre/foca o
    lead; `app/manifest.ts` e ícones em `public/icones`. No iPhone só funciona com o app
    instalado na tela de início (iOS 16.4+): a tela explica o passo a passo.
  - **WhatsApp (Meta Cloud API):** `fetch` para `graph.facebook.com/v21.0/{phone_id}/messages`
    com modelo aprovado (`pt_BR`, utilidade) e botão de URL; só para a equipe, com número E.164
    e aceite gravados. Erro vira `META_<código>`/`HTTP_<status>`. Textos em
    `docs/WHATSAPP_MODELOS.md`. Desligado sem `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.
- Canais por tipo: padrão em `domain/avisos/canais` (= `_aviso_canais`): pré-reserva, visita,
  pré-reserva vencendo, resumo e teste no push e no WhatsApp; orçamentos sem ação só no push;
  cliente parou e esquentou só no painel (o usuário liga o push em Minha conta). Os mesmos
  textos e variáveis no painel, no push e no WhatsApp (`domain/avisos/textos`).
- Variável de ambiente que falta desliga o canal com um aviso no log (`instrumentation.ts`);
  o site nunca cai por isso. `pnpm vapid:gerar` gera as chaves.

## 47. Follow-up automático

- Oito regras (`domain/follow-up/regras` = `_follow_up_avaliar`, teste de equivalência com
  2.400 casos sorteados): proposta sem resposta em 24 h, segundo toque, proposta vencendo,
  proposta vencida (nasce desligada), pré-reserva vencendo, visita amanhã, pós-visita e lead
  quente sem contato. Cada regra tem `aplica` (a situação ainda pede a tarefa), `base` (o fato
  que abre a regra) e `quando` (a partir de quando nasce). Resultado: `criar`, `cancelar` ou
  `nada`; cria no máximo uma vez por base.
- `regras_follow_up` (uma linha por empresa e regra, criada por trigger na empresa e por
  backfill): liga/desliga e prazo dentro de limites (`salvar_regra_follow_up`, só o dono).
- `gerar_tarefas_automaticas` (a cada 15 min): monta os fatos do lead (`_follow_up_fatos`) e
  insere com `origem = 'regra'` e `on conflict … do nothing` no índice
  `tarefas_regra_aberta_idx` (uma aberta por regra em cada lead), mais a atividade
  `tarefa_criada {automatica: true}`. **Cancelamento automático:** a cada atividade do lead
  (trigger) e no job, a tarefa aberta cuja regra deu `cancelar` ganha `cancelada_em`.
- A tarefa guarda a situação da mensagem pronta e as variáveis em `tarefas.mensagem_dados`
  (coluna nova, nullable); o texto é montado pelo domínio na leitura (sem duplicar texto no
  SQL). Na tela: selo "Automática" com o motivo e "Enviar no WhatsApp" com a mensagem pronta.
- Lead de teste nunca gera aviso nem tarefa.
- Desempenho (seed de volume, 5.000 leads, Postgres local): `gerar_tarefas_automaticas` ~1 s
  por rodada (5,5 s na primeira, que cria 1.449 tarefas); `gerar_avisos_tempo` ~0,3 s. Rodam
  no `pg_cron`, fora de qualquer requisição. Se crescer muito, avaliar só os leads com fatos
  mudados desde a última rodada.

## 48. Telas da Etapa 7

- Sino no cabeçalho (celular e desktop), `/app/avisos`, **Minha conta → Avisos**
  (`/app/conta/avisos`: canais por tipo, silêncio, ativar push neste aparelho, passos do
  iPhone, WhatsApp com número e aceite, "Enviar aviso de teste" com o resultado por canal) e
  **Minha empresa → Follow-up** (só o dono edita). Tema escuro, 375 px primeiro, alvos ≥ 44 px.

# Onboarding guiado e Números (Etapa 8)

## 49. Onboarding

- **Cadastro com o modelo:** depois do `signUp` (com sessão), `cadastrar` chama `gravarModelo`
  com o modelo do segmento. Ele já era idempotente (trava por empresa e "já tem catálogo"), então
  dois cliques ou um retry não duplicam. Se falhar, o cadastro segue e o passo 1 oferece
  "Carregar meu catálogo de exemplo" (cobre também a confirmação de e-mail ligada e contas antigas
  vazias). O botão do simulador continua existindo.
- **`/app/comecar`** (grupo `(onboarding)`, tela cheia sem menu, tema escuro):
  1. resumo do modelo;
  2. identidade (pode pular; reusa `salvarIdentidade` e o upload do logo);
  3. preços;
  4. espaços e turnos (reusa `salvarEspaco`/`salvarTurno`);
  5. pronto (link, Copiar, Testar como cliente, QR e textos).
- **Progresso no servidor:** `empresas.onboarding_passo` (1–5), `onboarding_iniciado_em` (primeira
  visita) e `onboarding_concluido_em` (passo 5). Escrita só por `avancar_onboarding`, que
  recusa passar do passo 3 sem pacote com preço confirmado (`ONBOARDING_SEM_PRECO`; o domínio
  espelha em `podeIrPara`). Voltar não "desconclui". Conclusão auditada com início e fim.
- **Faixa** "Termine de configurar seu link (passo X de 5)" no layout do painel, só para o dono,
  enquanto `onboarding_concluido_em` for nulo.
- **Migração:** empresas com pacote já ficaram concluídas; as demais veem a faixa.
- **Tempo medido no E2E:** cadastro até o passo 5 em 6–9 s digitando só os preços.

## 50. Preço confirmado

- `pacotes.preco_confirmado_em` e `opcionais.preco_confirmado_em` (nullable). Nulo = preço de
  exemplo do modelo: fica fora do link (`publico.contexto_preco` filtra pacotes, faixas, seções,
  faixas de idade de pacote e opcionais) e não resolve a pendência `SEM_PACOTE_COM_PRECO`
  (`pacoteTemPreco` exige `precoConfirmado`).
- **Decisão: confirmação por trigger.** `_confirmar_preco` (pacotes e opcionais) preenche a data
  em todo insert e em todo update que muda um campo de preço (`preco_pessoa_centavos`,
  `valor_excedente_centavos`, `modelo_preco`, `preco_centavos`, `cobranca`); mudar o nome não
  confirma. `_faixa_confirma_pacote` confirma o pacote quando uma faixa muda. Assim "preço salvo
  pelo dono em qualquer tela" vale sem mexer nas telas, inclusive no código da Etapa 7 durante o
  deploy. A gravação do modelo desliga isso na própria transação
  (`set_config('orkestra.modelo', '1', true)`).
- **Passo 3:** o dono digita UM valor por pacote (1ª faixa ou valor por pessoa). As outras faixas
  e o excedente saem na proporção do modelo (faixas arredondadas a R$ 10, excedente a R$ 1;
  `domain/onboarding/precos`) e ficam visíveis para conferir e ajustar. Os campos nascem vazios,
  com "Exemplo: R$ …". `confirmar_precos` grava em lote, valida (faixas crescentes, valor > 0) e
  audita antes/depois. Opcionais são opcionais nesse passo.
- **Migração:** o que existia ganhou `now()`, para nenhum link no ar parar.

## 51. Checklist

- `domain/onboarding/checklist` calcula itens e percentual a partir de um `EstadoChecklist`
  montado no servidor (`server/onboarding/carregar.ts`) com o estado real:
  - **obrigatórios (peso 3):** pacote confirmado, tipo de festa, espaço e turno;
  - **vender melhor (peso 1):** logo, capa, sobre, foto em pacote, cardápio em todos os ativos,
    sinal/parcelas/formas, cancelamento e "não incluso", razão social e CNPJ, reserva manual na
    agenda, link testado, link na bio, push ativo, e WhatsApp de avisos (só com o canal
    configurado).
- Percentual arredondado para baixo (100% só com tudo feito).
- "Link testado" = primeira abertura do link em modo teste (`marcar_link_testado`, chamado pela
  página pública). "Link na bio" é o único manual (`marcar_link_na_bio`, botão "Fiz").
- Aparece no topo de Leads (recolhível) e em Minha empresa. Some com 100% ou quando o usuário
  dispensa (`usuarios.checklist_dispensado_em`); reativa em Minha conta.

## 52. Link e divulgação

- Links por origem (`linkComOrigem`): Instagram, WhatsApp, Google, Indicação e **QR code** (valor
  novo do enum `origem_lead`, em migration própria antes das funções que o usam).
- `domain/divulgacao/textos`: bio, resposta automática e ausência do WhatsApp Business, post de
  lançamento e status, cada um com o link na origem certa.
- **QR:**
  - `uqr` (sem dependências, só no servidor) gera a matriz (correção M, borda 2);
  - SVG próprio para a prévia;
  - PNG pelo `sharp`;
  - cartaz A4 pelo `@react-pdf/renderer` (logo, nome, "Monte o orçamento da sua festa", QR de
    12 cm e o link escrito).
  - Rota `GET /app/empresa/link/qr?formato=png|pdf`, só logado, `attachment`.
- **Visitas** (`pagina_vista`, valor novo do enum `evento_funil`):
  - registradas pelo navegador depois de carregar `/b/[slug]`, com a sessão anônima que o wizard
    já usava (sessionStorage, sem cookie de terceiros) e a origem normalizada;
  - a action ignora user-agent de robô (`domain/publico/robo`), e o SQL ignora o modo teste
    (usuário logado da empresa) e o excesso (limite `funil` de `publico.tentativas`);
  - substitui o antigo `passo_visto` do passo 0.

## 53. Números: definições exatas

Regras gerais:

- Tudo em `public.numeros(de, ate)` (período + anterior) e `public.numeros_ocupacao()`, espelhos
  de `domain/numeros`. Teste de equivalência com 3 sementes × 4 períodos × dono/vendedor e 2
  sementes de ocupação.
- **Leads únicos**, nunca versões. **Lead de teste nunca entra.**
- **Datas civis no fuso da empresa**, período inclusivo. O anterior tem o mesmo número de dias e
  termina na véspera.
- Até 366 dias.
- **Vendedor:** só leads com `responsavel_id` dele (e as reservas desses leads), sem funil de
  visitas.

| Métrica                | Definição (e bordas)                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visitas                | sessões distintas com `pagina_vista` no período                                                                                                                                                                                                                                                                                                                                                 |
| Início                 | sessões que concluíram um passo ≥ 1 ou viram um passo ≥ 2                                                                                                                                                                                                                                                                                                                                       |
| Leads                  | leads criados no período (todas as origens; o funil usa só os do link, origem ≠ interno)                                                                                                                                                                                                                                                                                                        |
| Completos              | leads do funil com passo 6 alcançado ou orçamento fora de `em_montagem` (inclui interno concluído)                                                                                                                                                                                                                                                                                              |
| Pré-reservas e visitas | leads do funil com pelo menos uma atividade `pre_reserva_pedida`/`visita_pedida` (qualquer autor)                                                                                                                                                                                                                                                                                               |
| Reservas               | **evento:** leads distintos com reserva `confirmada` ativa ou realizada cuja confirmação (`confirmada_em`, ou `criado_em` se já nasceu confirmada) cai no período. Reserva cancelada depois não conta. Lead perdido, reaberto e depois reservado conta.                                                                                                                                         |
| Valor reservado        | soma dessas reservas: `valor_total_centavos`, senão o total da versão vigente, senão 0                                                                                                                                                                                                                                                                                                          |
| Conversão              | **coorte:** entre os leads criados no período, reservados (status reservado/realizado) ÷ decididos (reservado, perdido, cancelado ou proposta vigente expirada). Sem decididos = "—". Em aberto não distorce.                                                                                                                                                                                   |
| Em aberto              | foto de agora (não depende do período, sem comparação): soma do total da versão vigente dos leads em andamento, pré-reservados ou quentes ainda abertos                                                                                                                                                                                                                                         |
| Tempo até a 1ª ação    | leads com a primeira pré-reserva/visita pedida **pelo cliente** no período: mediana de minutos até a primeira ação do vendedor depois dela (autor usuário, exceto troca de responsável: a mesma regra de `primeiro_contato_em`). Também do aviso (`avisos.agendado_para`, já depois do silêncio) até essa ação. Sem contato = conta em "sem contato", fora da mediana. Por responsável do lead. |
| Motivos de perda       | leads hoje perdidos com `perdido_em` no período, por `motivo_perda_codigo`; reaberto sai                                                                                                                                                                                                                                                                                                        |
| Por origem             | por origem do lead: leads e conversão (coorte), reservas e valor (evento); ordena por valor, leads e nome                                                                                                                                                                                                                                                                                       |
| Ocupação               | hoje até a véspera de hoje + 3 meses. Slot = data × espaço ativo × turno ativo do dia da semana, com a capacidade (eventos simultâneos). Bloqueado sai. Ocupado = reservas ativas (confirmadas ou pré-reservas não vencidas) no mesmo dia, espaço e turno, até a capacidade. Aproximação: não olha sobreposição de horário entre turnos.                                                        |
| Datas livres           | sábados e domingos de hoje + antecedência mínima até hoje + 60 dias com algum turno com vaga                                                                                                                                                                                                                                                                                                    |

- **Mediana:** o valor do meio; com quantidade par, média dos dois do meio arredondada meio para
  cima. Razões em bp, meio para cima. Variação em bp; anterior zero = "sem comparação".
- **Desempenho:** consultas diretas, sem agregados.
  - Seed de volume (5.000 leads), `explain analyze`: 90 dias 59 ms, 30 dias 37 ms, vendedor
    16 ms, ocupação 5 ms.
  - Teste de integração com 5.000 leads e 20.000 eventos de funil: 81 ms.
  - Abaixo da meta de 300 ms, então `numeros_diarios` não foi criado. Fica anotado para quando
    passar.
- **Cache:** `unstable_cache` por empresa, usuário e período (tag `numeros:{empresa}`, 5 min).
  Sem job de agregados, não há o que invalidar além do tempo.
- **Tela:**
  - 4 cartões (dono) ou 3 (vendedor), funil com a maior queda em texto, origem, perdas,
    atendimento, ocupação (mapa dia × turno) e datas livres com "Copiar texto de promoção";
  - SVG próprio, cada gráfico com `aria-label` e tabela.

## 54. Cobrança: planos, cupons e Asaas (Etapa 9A)

- **Planos** em `planos` (editáveis só pelo /interno): Essencial 14700/147000 (2 usuários,
  1 espaço, sem WhatsApp nem follow-up, Números só cartões e funil) e Profissional 24700/247000
  (5 usuários, espaços ilimitados, tudo). Anual = 10 mensalidades ("2 meses grátis"). O teste
  usa o Profissional. Conta de cortesia (`empresas.isenta`) fica ativa sem assinatura; o
  backfill marcou como cortesia quem já estava `ativo`.
- **Cupom** = desconto fixo em centavos sobre o preço do ciclo, por `duracao_meses` a partir
  do 1º vencimento (`cupom_ate`). Fundador: 15000 de desconto (R$ 97/mês), 12 meses, 10 vagas.
  O uso é reservado na transação que grava a assinatura (`cobranca_reservar_cupom`, com trava);
  pendente trocada devolve o uso. A reconciliação volta ao preço cheio quando o cupom acaba.
- **Asaas** só por `fetch` (`server/cobranca/asaas.ts`), header `access_token`. Assinatura com
  `billingType: UNDEFINED`: o pagador escolhe Pix, boleto ou cartão na fatura hospedada.
  `externalReference` = id da empresa. Sem `ASAAS_*`, a cobrança fica desligada (tela mostra o
  WhatsApp de vendas).
- **1º vencimento** = hoje ou o fim do teste, o que vier depois (não perde dias de teste); se
  uma assinatura cancelada ainda cobre o período, começa no dia seguinte a ela.
- **Mudar de plano**: limites mudam na hora; o valor novo vale a partir da próxima fatura
  (`PUT /subscriptions` com `updatePendingPayments`), sem pró-rata. O cupom só continua se
  valer para o plano/ciclo novo.
- **Cancelar**: motivo obrigatório (lista + texto), sem oferta de pausa. Apaga a assinatura no
  Asaas; o acesso segue até `pago_ate` (situação `cancelado`).
- **Escrita**: `assinaturas`, `cobrancas`, `empresas_cobranca`, `cupons_usos` só pela conexão
  administrativa (`server/cobranca/fluxos`, com auditoria) e pelas funções SQL. O dono lê pelo
  RLS; vendedor não lê nada de cobrança. `cupons`, `cobranca_eventos` e `auditoria_interna` não
  têm policy (o painel não lê).

## 55. Situação da conta (ciclo de vida)

`empresas.plano` guarda a situação, mantida por `_atualizar_situacao` (webhook, reconciliação,
/interno e o job `orkestra-situacoes` de hora em hora). Regra pura `situacaoConta`
(`domain/cobranca/situacao`) = `public._situacao_conta`, com teste de equivalência (2.000
casos, viradas de dia em vários fusos). Precedência:

1. suspensão manual (/interno) → `suspenso`;
2. cortesia → `ativo`;
3. período pago cobre hoje (data civil no fuso) → `ativo` (ou `cancelado` se cancelada);
4. assinatura ativa vencida: dia do vencimento ainda `ativo`; 1 a 7 dias de atraso →
   `inadimplente`; 8º dia → `suspenso` (atraso conta do vencimento mais antigo em aberto, ou do
   dia seguinte ao período pago);
5. teste em andamento → `trial`; senão `suspenso`.

- A assinatura que decide (`_assinatura_referencia`): ativa > cancelada ainda coberta >
  pendente > cancelada mais recente.
- `pago_ate` = maior (vencimento + 1 ciclo - 1 dia) entre as cobranças pagas;
  `atrasada_desde` = menor vencimento entre as vencidas. Sempre recalculados das cobranças.
- Avisos (só para o dono, push sempre, não configuráveis): teste acabando (3 dias e 1 dia),
  fatura criada, pagamento confirmado, pagamento não identificado, carência e conta suspensa.
- **Backfill da migration**: todo teste em andamento ou vencido ganhou 14 dias a partir da
  data da migration, para o primeiro job não suspender contas reais.

## 56. Eventos do Asaas: webhook e reconciliação

- `POST /api/cobranca/asaas`: token no header `asaas-access-token` (tempo constante), corpo até
  64 KB, JSON válido. O domínio normaliza o evento (`normalizarEvento`) e limpa o payload
  (`limparPayload`: só ids, valores, datas e status; nada de nome, CPF ou e-mail).
- `cobranca_registrar_evento` faz tudo numa transação: grava o evento (único pelo id do Asaas:
  repetido = `duplicado`), trava a empresa (advisory lock), aplica o status com a regra
  monotônica, recalcula a assinatura, cria o aviso e atualiza a situação. Falhou no meio =
  nada gravado, a rota responde 500 e o Asaas reenvia. Evento desconhecido fica gravado como
  `ignorado`.
- **Status monotônico** (`proximoStatus` = `_cobranca_proximo_status`, equivalência na tabela
  toda): pendente < vencida < confirmada < recebida < estornada; `cancelada` só sai de pendente
  ou vencida e é final. Evento fora de ordem não regride.
- **Reconciliação diária** (`orkestra-cobranca-reconciliar`, 04:10 em São Paulo, pg_net com o
  `CRON_SECRET` do Vault → `/api/cobranca/reconciliar` com `after()`): lista as cobranças de
  cada assinatura (não cancelada ou cancelada há menos de 40 dias) e as implantações em aberto
  e grava como eventos sintéticos `reconc:{cobrança}:{status}` (idempotentes).
- API falsa (`tests/support/asaas-fake.ts`) com os mesmos endpoints, página de fatura e envio
  do webhook: usada como `fetch` injetado na integração e como servidor (:4010) no E2E.

## 57. Limites do plano e conta somente leitura

- **Limites** no servidor (mensagem com "Mudar de plano" e o link "Ver planos" no toast) e no
  banco por trigger, que vale para qualquer caminho, inclusive o admin: usuários ativos,
  espaços ativos, `whatsapp_ativo` e ligar regra de follow-up. Plano vigente:
  `codigoPlanoVigente` = `_codigo_plano` (equivalência). Downgrade só bloqueia o novo; nada é
  apagado. Tarefa automática de empresa sem follow-up (ou suspensa) é ignorada em silêncio
  (trigger em `tarefas`); WhatsApp de avisos só sai com o recurso no plano.
- **Somente leitura**: trigger `_exigir_escrita` em toda tabela de `public` com `empresa_id` (e
  em `empresas`) recusa `CONTA_SOMENTE_LEITURA` quando há `auth.uid()` e a empresa está
  suspensa. Jobs, webhook, servidor via admin e link público (anon) não são afetados. A GUC
  `orkestra.permitir_escrita = '1'` libera casos revisados. Ficam livres: avisos (marcar lido),
  preferências e push, consentimento do suporte, auditoria e tabelas de cobrança.
  - Tabela nova com `empresa_id` precisa ligar o trigger na própria migration: o teste de
    integração confere pelo catálogo, e outro teste exige que toda função de escrita concedida
    a `authenticated` esteja classificada (bloqueada ou livre).
  - `acaoDoDono` recusa antes (cobre o que grava pela conexão administrativa, como criar
    vendedor). As ações da tela de Plano funcionam com a conta suspensa.
- **Link público de conta suspensa**: só a vitrine (pacotes) + WhatsApp, por
  `publico.contexto_vitrine`; wizard, proposta nova e escrita continuam recusados.
- Empresa suspensa não recebe avisos de operação (só os de cobrança). Reservas existentes
  continuam valendo.

## 58. /interno e acesso de suporte

- **/interno**: sessão do Supabase + e-mail em `ORKESTRA_ADMINS` + `aal2` (TOTP nativo do
  Supabase Auth, cadastrado no primeiro acesso, pedido a cada login). Fora da lista: 404. Os
  usuários da equipe são do Auth, sem empresa (criados no painel do Supabase). Leituras e ações
  pela conexão administrativa, sem dados do cliente final (documento do pagador mascarado).
  Toda ação grava em `auditoria_interna`.
- **Suporte**: o dono permite por 7 dias (`permitir_suporte`, revogável). Sem consentimento
  vigente, o botão "Entrar como esta empresa" não existe e o servidor recusa.
  - Entrar grava o cookie `orkestra_suporte` (HMAC-SHA256 com chave derivada da service role,
    `httpOnly`): empresa, dono, admin e validade (até 2 h, nunca além do consentimento).
  - A cada request, `usuarioAtual` só aceita o cookie com a mesma sessão de admin (id, lista,
    `aal2`) e o consentimento ainda vigente no banco. Aí age como o dono (RLS igual).
  - `comUsuario` liga a GUC `orkestra.suporte_admin` e o trigger da auditoria acrescenta
    `dados.suporte` em tudo o que for gravado. Faixa vermelha fixa no painel, com "Sair do
    modo suporte".
