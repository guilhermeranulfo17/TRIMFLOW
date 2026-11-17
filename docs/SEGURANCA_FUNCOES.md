# Segurança do banco: revisão das funções e tabelas (17/11/2026)

Item 3 da análise semanal de 16/11/2026. Decisões em `docs/ARQUITETURA.md` §99. Os testes que
mantêm isto verdadeiro: `tests/integration/seguranca-funcoes.test.ts` (lista e guards) e
`tests/integration/isolamento-empresas.test.ts` (isolamento entre empresas e do anon).

## 1. As 87 funções SECURITY DEFINER executáveis por `authenticated`

Resultado: **nenhuma sem verificação**. Todas leem `auth.uid()` direto ou por um guard
(`empresa_do_usuario`, `perfil_do_usuario`, `_leads_exigir_usuario`, `_agenda_exigir_usuario`,
`_avisos_usuario`, `_contrato_dono`, `_onboarding_dono`, `_pagina_dono`, `_lgpd_exigir_dono`,
`_financeiro_dono`, `_margem_dono`), e todas têm `search_path` fixo (`''`). Nenhuma SECURITY
DEFINER do `public` é executável por `anon`; as funções públicas por design (link público,
landing) ficam no schema `publico`, fora da API, só para `anon`.

Contagem por classe: 37 só do dono, 40 de usuário da empresa (dono ou vendedor), 7 do próprio
usuário, 2 helpers das policies de RLS, 1 do cadastro (sessão ainda sem empresa).

Classes:

- **dono**: recusa vendedor (guard de dono, `_agenda_exigir_usuario(true)` ou `perfil <> 'dono'`).
- **usuario**: dono ou vendedor ativo; tudo filtrado pela empresa do usuário. Ids de outra
  empresa falham (FKs compostas `(id, empresa_id)` e o `where empresa_id = v_empresa`).
- **proprio**: só o próprio usuário (avisos, push, preferências, aceite dos termos).
- **rls**: `empresa_do_usuario` e `perfil_do_usuario`, usados pelas policies (precisam ficar
  executáveis).
- **cadastro**: `completar_conta_dono` (entrada pelo Google, antes de existir a empresa).

Risco: **baixo** = leitura da própria empresa; **médio** = escrita da operação; **alto** = escrita
em contrato, financeiro, LGPD, suporte, link do buffet ou OrkMargem (todas só do dono).

| Função | Assinatura | Classe | Verificação (guard) | auth.uid() direto | Escreve em | Tipo | Risco |
|---|---|---|---|---|---|---|---|
| `adiar_tarefa` | `(p_tarefa uuid, p_para timestamp with time zone)` | usuario | _leads_exigir_usuario | via guard | leads, tarefas | escrita | médio |
| `adicionar_nota` | `(p_lead uuid, p_texto text)` | usuario | _leads_exigir_usuario | sim | notas | escrita | médio |
| `agendar_mensagem` | `(p_lead uuid, p_titulo text, p_vence_em timestamp with time zone, p_mensagem text, p_responsavel uuid)` | usuario | _leads_exigir_usuario | sim | tarefas | escrita | médio |
| `agendar_visita` | `(p_lead uuid, p_data_hora timestamp with time zone, p_observacoes text)` | usuario | _leads_exigir_usuario | sim | visitas | escrita | médio |
| `alterar_slug` | `(novo text)` | dono | empresa_do_usuario, perfil_do_usuario | sim | auditoria, empresas, slugs_antigos | escrita | alto |
| `apagar_nota` | `(p_nota uuid)` | usuario | _leads_exigir_usuario | via guard | atividades, notas | escrita | médio |
| `ativar_whatsapp` | `(p_numero text, p_aceite boolean)` | proprio | _avisos_usuario | via guard | preferencias_avisos | escrita | médio |
| `atribuir_responsavel` | `(p_lead uuid, p_usuario uuid)` | usuario | _leads_exigir_usuario, perfil_do_usuario | sim | leads | escrita | médio |
| `atualizar_dados_lead` | `(p_lead uuid, p_nome text, p_email text)` | usuario | _leads_exigir_usuario | via guard | leads | escrita | médio |
| `avancar_onboarding` | `(p_passo smallint)` | dono | _onboarding_dono | via guard | auditoria, empresas | escrita | médio |
| `avisar_boas_vindas` | `()` | dono | auth.uid() | sim | — | escrita | médio |
| `cancelar_contrato` | `(p_id uuid, p_motivo text)` | dono | _contrato_dono | via guard | auditoria, contratos | escrita | alto |
| `cancelar_reserva` | `(p_id uuid, p_motivo text)` | usuario | _agenda_exigir_usuario | sim | auditoria, reservas | escrita | médio |
| `cancelar_tarefa` | `(p_tarefa uuid)` | usuario | _leads_exigir_usuario | via guard | leads, tarefas | escrita | médio |
| `cancelar_visita` | `(p_visita uuid, p_motivo text)` | usuario | _leads_exigir_usuario | sim | visitas | escrita | médio |
| `catalogo_em_uso` | `()` | usuario | empresa_do_usuario | via guard | — | leitura | baixo |
| `completar_conta_dono` | `(p_nome text, p_buffet text, p_whatsapp_e164 text, p_segmento segmento_empresa, p_slug_base text)` | cadastro | auth.uid() | sim | — | escrita | médio |
| `concluir_tarefa` | `(p_tarefa uuid)` | usuario | _leads_exigir_usuario | sim | leads, tarefas | escrita | médio |
| `confirmar_precos` | `(p_precos jsonb)` | dono | _onboarding_dono | via guard | auditoria, faixas_preco, opcionais, pacotes | escrita | médio |
| `confirmar_reserva` | `(p_id uuid, p_sinal_centavos integer, p_sinal_pago_em date)` | usuario | _agenda_exigir_usuario | sim | auditoria, reservas | escrita | médio |
| `confirmar_visita` | `(p_visita uuid, p_data_hora timestamp with time zone)` | usuario | _leads_exigir_usuario | sim | visitas | escrita | médio |
| `contrato_comprovante` | `(p_id uuid)` | dono | _contrato_dono | via guard | — | leitura | baixo |
| `contrato_marcar_pdf` | `(p_id uuid)` | dono | _contrato_dono | via guard | contratos | escrita | alto |
| `criar_aviso_teste` | `()` | proprio | _avisos_usuario | via guard | — | escrita | médio |
| `criar_bloqueio` | `(p_de date, p_ate date, p_turno_id uuid, p_espaco_id uuid, p_motivo text)` | dono | _agenda_exigir_usuario | sim | auditoria, bloqueios | escrita | médio |
| `criar_reserva` | `(p_espaco_id uuid, p_turno_id uuid, p_data date, p_tipo tipo_reserva, p_cliente_nome text, p_cliente_whatsapp_e164 text, p_tipo_evento_id uuid, p_convidados integer, p_valor_total_centavos integer, p_sinal_centavos integer, p_sinal_pago_em date, p_observacoes text, p_origem origem_reserva)` | usuario | _agenda_exigir_usuario | sim | — | escrita | médio |
| `criar_tarefa` | `(p_lead uuid, p_titulo text, p_vence_em timestamp with time zone, p_descricao text, p_responsavel uuid, p_orcamento uuid)` | usuario | _leads_exigir_usuario | sim | tarefas | escrita | médio |
| `definir_proximo_contato` | `(p_lead uuid, p_quando timestamp with time zone)` | usuario | _leads_exigir_usuario | sim | leads, tarefas | escrita | médio |
| `desativar_whatsapp` | `()` | proprio | _avisos_usuario | via guard | preferencias_avisos | escrita | médio |
| `desistir_exclusao_conta` | `()` | dono | _lgpd_exigir_dono | sim | auditoria, empresas | escrita | alto |
| `dispensar_checklist` | `(p_dispensar boolean)` | usuario | auth.uid() | sim | auditoria, usuarios | escrita | médio |
| `disponibilidade` | `(p_empresa_id uuid, p_de date, p_ate date, p_espaco_id uuid)` | usuario | _agenda_exigir_usuario | via guard | — | leitura | baixo |
| `editar_nota` | `(p_nota uuid, p_texto text)` | usuario | _leads_exigir_usuario | via guard | atividades, notas | escrita | médio |
| `emitir_contrato` | `(p jsonb)` | dono | _contrato_dono | via guard | auditoria, contrato_assinaturas, contratos | escrita | alto |
| `empresa_do_usuario` | `()` | rls | empresa_do_usuario | sim | — | leitura | baixo |
| `estender_pre_reserva` | `(p_id uuid, p_horas integer)` | usuario | _agenda_exigir_usuario | sim | auditoria, reservas | escrita | médio |
| `estornar_recebimento` | `(p_id uuid, p_motivo text)` | dono | _financeiro_dono | via guard | auditoria, recebimentos | escrita | alto |
| `inscrever_push` | `(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text)` | proprio | _avisos_usuario | via guard | push_inscricoes | escrita | médio |
| `ler_cpf_contrato` | `(p_id uuid)` | dono | _contrato_dono | via guard | auditoria | escrita | alto |
| `lgpd_apagar_lead` | `(p_lead uuid)` | dono | _lgpd_exigir_dono | sim | — | escrita | alto |
| `lgpd_exportar_lead` | `(p_lead uuid)` | dono | _lgpd_exigir_dono | sim | auditoria | escrita | alto |
| `lgpd_registrar_exportacao` | `()` | dono | _lgpd_exigir_dono | sim | auditoria | escrita | alto |
| `marcar_avisos_lidos` | `(p_ids uuid[])` | proprio | _avisos_usuario | via guard | avisos | escrita | médio |
| `marcar_link_na_bio` | `(p_feito boolean)` | dono | _onboarding_dono | via guard | auditoria, empresas | escrita | médio |
| `marcar_link_testado` | `()` | usuario | auth.uid() | sim | empresas | escrita | médio |
| `marcar_orcamento_enviado` | `(p_orcamento_id uuid, p_canal text)` | usuario | _agenda_exigir_usuario | sim | orcamentos | escrita | médio |
| `marcar_perdido` | `(p_lead uuid, p_codigo motivo_perda, p_detalhe text)` | usuario | _leads_exigir_usuario | sim | leads, reservas | escrita | médio |
| `marcar_visita_realizada` | `(p_visita uuid)` | usuario | _leads_exigir_usuario | sim | visitas | escrita | médio |
| `margem_fechar_festa` | `(p_reserva uuid)` | dono | _margem_dono | via guard | auditoria, margem_festas | escrita | alto |
| `margem_preparar_festa` | `(p_reserva uuid, p_pacote uuid, p_substituir boolean)` | dono | _margem_dono | via guard | auditoria, margem_custos_festa, margem_festas | escrita | alto |
| `margem_reabrir_festa` | `(p_reserva uuid, p_motivo text)` | dono | _margem_dono | via guard | auditoria, margem_festas | escrita | alto |
| `margem_salvar_custos_festa` | `(p_reserva uuid, p jsonb)` | dono | _margem_dono | via guard | auditoria, margem_custos_festa | escrita | alto |
| `margem_salvar_custos_pacote` | `(p_pacote uuid, p jsonb)` | dono | _margem_dono | via guard | auditoria, margem_custos_pacote | escrita | alto |
| `modulo_acesso` | `(p_empresa uuid, p_modulo text, p_reserva uuid)` | usuario | empresa_do_usuario | sim | — | leitura | baixo |
| `modulos_da_empresa` | `()` | usuario | empresa_do_usuario, perfil_do_usuario | via guard | — | leitura | baixo |
| `novo_link_contrato` | `(p_id uuid, p_token_hash text, p_validade_dias integer)` | dono | _contrato_dono | via guard | auditoria, contrato_codigos, contratos | escrita | alto |
| `numeros` | `(p_de date, p_ate date)` | usuario | auth.uid() | sim | — | leitura | baixo |
| `numeros_contratos` | `(p_de date, p_ate date)` | dono | auth.uid() | sim | — | leitura | baixo |
| `numeros_ocupacao` | `()` | usuario | auth.uid() | sim | — | leitura | baixo |
| `perfil_do_usuario` | `()` | rls | perfil_do_usuario | sim | — | leitura | baixo |
| `permitir_suporte` | `()` | dono | empresa_do_usuario, perfil_do_usuario | sim | acessos_suporte, auditoria | escrita | alto |
| `plano_vigente_da_empresa` | `()` | usuario | empresa_do_usuario | via guard | — | leitura | baixo |
| `pre_reservar_orcamento` | `(p_orcamento_id uuid)` | usuario | _agenda_exigir_usuario | sim | — | escrita | médio |
| `reabrir_lead` | `(p_lead uuid)` | usuario | _leads_exigir_usuario | sim | leads | escrita | médio |
| `reabrir_tarefa` | `(p_tarefa uuid)` | usuario | _leads_exigir_usuario | via guard | tarefas | escrita | médio |
| `registrar_aceite` | `(p_versao text)` | usuario | empresa_do_usuario | sim | aceites_termos, auditoria, usuarios | escrita | médio |
| `registrar_contato` | `(p_lead uuid, p_canal canal_contato, p_resumo text)` | usuario | _leads_exigir_usuario | sim | — | escrita | médio |
| `registrar_mensagem` | `(p_lead uuid, p_situacao text, p_tarefa uuid)` | usuario | _leads_exigir_usuario | sim | — | escrita | médio |
| `registrar_origem_cadastro` | `(p_origem jsonb)` | dono | auth.uid() | sim | auditoria, empresas | escrita | médio |
| `registrar_recebimento` | `(p_reserva uuid, p_valor_centavos integer, p_recebido_em date, p_forma text, p_observacao text)` | dono | _financeiro_dono | via guard | auditoria, recebimentos | escrita | alto |
| `registrar_uso` | `(p_area text)` | usuario | empresa_do_usuario | via guard | uso_painel | escrita | médio |
| `remarcar_visita` | `(p_visita uuid, p_data_hora timestamp with time zone)` | usuario | _leads_exigir_usuario | sim | visitas | escrita | médio |
| `remover_bloqueio` | `(p_id uuid)` | dono | _agenda_exigir_usuario | sim | auditoria, bloqueios | escrita | médio |
| `remover_push` | `(p_endpoint text)` | proprio | _avisos_usuario | via guard | push_inscricoes | escrita | médio |
| `revogar_suporte` | `()` | dono | empresa_do_usuario, perfil_do_usuario | sim | acessos_suporte, auditoria | escrita | alto |
| `salvar_contrato_modelo` | `(p jsonb)` | dono | _contrato_dono | via guard | auditoria, contrato_modelos | escrita | alto |
| `salvar_depoimentos` | `(p jsonb)` | dono | _pagina_dono | via guard | auditoria, depoimentos, empresas | escrita | médio |
| `salvar_galeria` | `(p jsonb)` | dono | _pagina_dono | via guard | auditoria, empresas, galeria_fotos | escrita | médio |
| `salvar_orcamento_interno` | `(p_orcamento_id uuid, p_whatsapp_e164 text, p_nome text, p_origem origem_lead, p_resultado jsonb, p_itens jsonb, p_total_centavos integer, p_validade_ate date, p_rascunho jsonb, p_tipo_evento_id uuid, p_data date, p_turno_id uuid, p_espaco_id uuid, p_convidados integer, p_pacote_id uuid, p_conteudo jsonb, p_observacoes text, p_observacoes_internas text, p_desconto_motivo text, p_fora_antecedencia boolean)` | usuario | _agenda_exigir_usuario, perfil_do_usuario | sim | auditoria, leads, orcamentos | escrita | médio |
| `salvar_pagina_publica` | `(p jsonb)` | dono | _pagina_dono | via guard | auditoria, empresas | escrita | médio |
| `salvar_perguntas` | `(p jsonb)` | dono | _pagina_dono | via guard | auditoria, empresas, perguntas_frequentes | escrita | médio |
| `salvar_plano_pagamento` | `(p_reserva uuid, p jsonb)` | dono | _financeiro_dono | via guard | auditoria, recebimentos, reserva_parcelas, reservas | escrita | alto |
| `salvar_preferencias_avisos` | `(p_canais jsonb, p_silencio_inicio time without time zone, p_silencio_fim time without time zone, p_receber_de_vendedores boolean)` | proprio | _avisos_usuario | via guard | preferencias_avisos | escrita | médio |
| `salvar_regra_follow_up` | `(p_regra text, p_ligada boolean, p_prazo integer)` | dono | _avisos_usuario | via guard | regras_follow_up | escrita | médio |
| `salvar_retencao_leads` | `(p_meses integer)` | dono | _lgpd_exigir_dono | sim | auditoria, empresas | escrita | alto |
| `solicitar_exclusao_conta` | `()` | dono | _lgpd_exigir_dono | sim | auditoria, empresas | escrita | alto |
| `status_contrato_da_reserva` | `(p_reserva uuid, p_orcamento uuid)` | usuario | empresa_do_usuario | via guard | — | leitura | baixo |

### Por que elas continuam executáveis por `authenticated`

O servidor chama todas elas pelo `comUsuario` (papel `authenticated` com as claims do usuário), e é
isso que faz o RLS valer também no servidor. Revogar o EXECUTE quebraria o painel.

O alerta do advisor existe porque o schema `public` está exposto na API de dados do Supabase
(PostgREST/GraphQL): um usuário logado poderia chamar `/rest/v1/rpc/<função>` direto do navegador.
O próprio banco já barra outra empresa e o vendedor nas funções de dono (provado nos testes); o
que sobraria seria pular validações que só existem no TypeScript (por exemplo, limites do Zod).
**O app não usa a API de dados** (o navegador só usa Auth e Storage; o banco é acessado só pelo
servidor, via Drizzle), então a correção definitiva é tirar o `public` da API. Isso é
configuração do painel do Supabase (passo 3.2 abaixo), sem impacto no código.

## 2. Tabelas com RLS ligado e sem policy (8)

| Tabela | Quem acessa | Decisão |
|---|---|---|
| `public.auditoria_interna` | conexão administrativa do /interno | sem policy (nega tudo), comentado |
| `public.cobranca_eventos` | `cobranca_registrar_evento` e conexão administrativa | sem policy, comentado |
| `public.contrato_codigos` | funções do link do contrato | sem policy, comentado |
| `public.cupons` | conexão administrativa (`server/cobranca`) | sem policy, comentado |
| `public.cupons_usos` | conexão administrativa (`server/cobranca`) | sem policy, comentado |
| `public.landing_contagem` | `publico.landing_contar` (grava) e /interno (lê) | sem policy, comentado |
| `public.uso_painel` | `registrar_uso` (grava) e /interno (lê) | sem policy, comentado |
| `publico.tentativas` | funções `publico.*` | sem policy, comentado |

Nenhuma tela do painel lê essas tabelas direto e nenhuma tem GRANT para `anon` ou
`authenticated`, então "RLS sem policy" (nega tudo) é o comportamento certo. Migration
`20261120000003_seguranca_tabelas_sem_policy.sql` (só comentários).

**`publico.tentativas` no schema "publico" (sem o c):** é de propósito. `publico` é o schema das
funções do link público, fora da API do Supabase (não pode entrar em Exposed schemas). Não muda.

## 3. Passos manuais no painel do Supabase (não dá para fazer por migration)

### 3.1 Proteção contra senha vazada (Auth)

1. Abra o projeto `orkestra` no painel do Supabase.
2. **Authentication → Providers → Email** (em versões novas: **Authentication → Sign In /
   Providers → Email**, ou **Authentication → Policies/Settings → Password security**).
3. Ligue **"Prevent use of leaked passwords"** (checa a senha na base do HaveIBeenPwned por
   k-anonimato; a senha não sai do Supabase).
4. Opcional, no mesmo lugar: tamanho mínimo 8 (o app já exige) e exigir letras e números.
5. Salve. Vale para cadastro e troca de senha a partir daí (senhas antigas não são revalidadas).
6. Teste: em `/cadastro`, uma senha conhecida como vazada (ex.: `senha123456`) deve ser recusada.
   O app mostra a mensagem genérica de senha fraca (`server/erros.ts` traduz `weak_password`).

Observação: o recurso depende do plano do Supabase (Pro ou superior).

### 3.2 Tirar o `public` da API de dados (zera os 87 alertas de função)

1. **Project Settings → Data API** (ou **API → Exposed schemas**).
2. Em **Exposed schemas**, remova `public` (deixe só `graphql_public`, ou nenhum). O `publico`
   nunca pode estar na lista.
3. Opcional: se ninguém usa GraphQL, **Database → Extensions → pg_graphql → desligar**.
4. Salve e confira: login, painel, upload de foto (Storage) e link público continuam funcionando
   (nenhum deles usa a API de dados). Rode o advisor de novo: o alerta das funções some.
5. Para desfazer, basta adicionar o `public` de volta.

### 3.3 pg_net no schema public

A migration `20261120000004_pg_net_extensions.sql` recria o pg_net no schema `extensions`. Se o
papel da migration não tiver permissão, ela só avisa (não quebra o deploy). Nesse caso, rode no
SQL Editor (fora do horário dos jobs de minuto em minuto, leva menos de 1 segundo):

```sql
drop extension if exists pg_net;
create extension pg_net with schema extensions;
```

Os jobs chamam `net.http_post` (schema `net`, que continua igual), então nada mais muda.
