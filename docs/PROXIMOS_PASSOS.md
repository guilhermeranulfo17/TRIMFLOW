# Próximos passos (anotados durante as Etapas 0 a 8)

Itens percebidos na fundação que pertencem a etapas futuras. Nada aqui foi implementado.

## Depois da Etapa 2 (pendências percebidas)

- **Arquivos soltos no Storage**: se a gravação falhar depois do upload, o arquivo fica no bucket.
  Criar uma limpeza periódica (arquivos de `midia` que nenhum registro referencia).
- Fotos de **opcionais** (a tabela não tem coluna de fotos).
- "Tabela própria" por dia (preços diferentes, não só %): hoje o ajuste de dia é só em bp.
- Rever a interpretação das faixas de idade quando o pacote tem política própria (hoje: faixa da
  empresa → faixa do pacote que contém a idade mínima).
- Marcar como incluso o **único** pacote compatível de um opcional faz o opcional voltar a valer
  para todos os outros pacotes (regra "nenhum compatível = todos"). A tela avisa a regra; avaliar
  um estado explícito "não disponível em nenhum".
- Trocar o e-mail de um vendedor pela tela (hoje só pelo próprio usuário; o trigger sincroniza).
- Reenviar/gerar nova senha temporária para um vendedor que perdeu a primeira.
- Plano: assinatura pelo painel (hoje a tela só mostra o status).
- Upload de imagem sem teste de ponta a ponta local (só no CI, com o storage-api).

## Depois da Etapa 3 (pendências percebidas)

- Editar uma reserva (trocar data, turno ou dados do cliente) sem cancelar e criar outra.
- Lista de espera para datas cheias.
- Sincronização com Google Agenda; avisos de vencimento por WhatsApp (Etapa 7).
- Bloqueio por horário (hoje é por data e turno): um evento da noite que invade o dia seguinte
  não é barrado por um bloqueio desse dia.
- Recalcular `reservas.fim` quando o intervalo entre eventos mudar (hoje vale só para as novas).
- Regra de capacidade > 1 é conservadora (conta ocupações que tocam o slot); avaliar o pico de
  simultaneidade real se algum buffet em domicílio precisar.
- Relatório/histórico de reservas canceladas, vencidas e realizadas na tela.

## Depois da Etapa 4 (pendências percebidas)

- **Deslocamento no link público:** hoje o espaço "no local do cliente" sai sem deslocamento
  (aviso na tela). Calcular por CEP/km quando houver geocodificação.
- **Verificar o WhatsApp** do cliente (código pelo WhatsApp, Etapa 7): hoje qualquer pessoa pode
  informar o número de outra; mitigado (nada do lead antigo é devolvido, limites por número).
- **Trial vencido** não bloqueia a página pública (só `plano = 'suspenso'`); entra com a cobrança.
  Quando a cobrança mudar o plano, nada a fazer no cache (a identidade do buffet não é cacheada).
- Agenda de visitas (confirmar, remarcar) e lembrete; hoje a visita é só um pedido no lead.
- Captcha se os limites e o honeypot não bastarem; QR code do link; domínio próprio do buffet.
- Exportar e apagar os dados de um lead a pedido (LGPD, Etapa 9). Revisão jurídica dos textos
  de privacidade e termos (hoje modelos).
- Painel de métricas do funil (`funil_eventos`) em Números.
- Fotos de pacote na página pública usam `<img>`/`next/image` sem otimizador (como na Etapa 2).

## Depois da Etapa 5 (pendências percebidas)

- ~~**Etapa 6:** caixa de leads com prioridade, perdido com motivo, notas e tarefas~~ (feito).
- ~~**Etapa 7:** avisos por WhatsApp (proposta aberta, pré-reserva vencendo) e follow-up
  automático da proposta não aberta~~ (feito).
- Assinatura eletrônica, contrato, cobrança e Pix do sinal; envio da proposta por e-mail.
- Remover "feito com Orkestra" no plano superior (`empresas.rodape_orkestra` já existe, fixo
  em true).
- Comparar versões lado a lado na tela do lead (hoje: lista do que mudou entre versões).
- Proposta com mais de um espaço/data (pacotes combinados) e itens avulsos com desconto por
  item.
- Cache do logo convertido para PNG (hoje o PDF baixa e converte a cada geração; ~100 ms).
- Fontes do PDF por buffet (hoje Manrope para todos).
- Bundles do painel que ainda carregam `libphonenumber-js/max` no navegador (Agenda, Minha
  empresa, Usuários; Leads e Tarefas não, desde a Etapa 6) pelo `formatPhoneBR` ou
  `CampoTelefone`: usar só a máscara no cliente, como no "+ Orçamento".
- Seed: os orçamentos fictícios usam totais aproximados (não recalculados pelo motor).

## Depois da Etapa 6 (pendências percebidas)

- ~~**Etapa 7 (regras automáticas):**~~ (feito) criar tarefas com `origem = 'regra'` e `regra` preenchida
  (proposta não aberta em 24h, pré-reserva vencendo, visita amanhã, lead quente sem contato). O
  índice `tarefas_regra_aberta_idx` já impede duplicar: basta um insert com
  `on conflict do nothing` numa função `security definer` chamada por um job.
- ~~**Etapa 7 (avisos):**~~ (feito) notificação para o responsável (push/WhatsApp) com link direto para
  `/app/leads/[id]`; hoje o vendedor só vê pela caixa e pelo badge.
- **Permissão por carteira:** hoje todo vendedor vê e age em todos os leads da empresa. Avaliar
  "vendedor só vê os seus e os sem responsável" (mudança de RLS e de `caixa_leads`).
- Tarefas sem lead (lembretes gerais) e tarefas atribuídas a outra pessoa pela tela (a função
  aceita `responsavel`, a tela cria sempre para quem está logado).
- Desfazer "marcar perdido" com a pré-reserva de volta (hoje reabrir não recria a pré-reserva:
  a data pode já estar ocupada).
- Mensagens prontas editáveis por empresa (hoje os textos são fixos em `domain/leads/mensagens`)
  e mais situações (pós-festa, aniversário do ano seguinte).
- Busca por nome sem acento ("patricia" acha "Patrícia"): exige `unaccent` ou coluna
  normalizada; `pg_trgm` não está em todas as instâncias.
- Caixa com mais de ~20 mil leads por empresa: se o `explain` passar de 150 ms, materializar a
  chave de ordem em colunas do lead mantidas pelas funções.
- Relatório de motivos de perda em Números.

## Depois da Etapa 7 (pendências percebidas)

- ~~**Números:** funil, conversão, motivos de perda e origem dos leads~~ (feito na Etapa 8).
- Verificar o WhatsApp do **cliente** por código (o canal oficial já existe; precisa de um
  modelo de autenticação aprovado na Meta).
- Mensagem automática ao cliente final (lembrete de visita, pré-reserva vencendo): hoje
  proibido por decisão de produto; exigiria opt-in explícito do cliente e modelos próprios.
- Webhook de status da Meta (entregue/lida) para mostrar "lido no WhatsApp" e desligar números
  inválidos; hoje só o erro do envio é gravado.
- Avisos por e-mail (resumo semanal) quando houver SMTP próprio (Etapa 9).
- Limpeza periódica: avisos com mais de 90 dias e entregas `enviado`/`ignorado` antigas
  (hoje a tela mostra 30 dias e nada é apagado).
- Regras de follow-up personalizadas (texto e prazo livres) e mensagens prontas editáveis.
- Push no desktop com mais de um navegador por usuário funciona, mas a tela não permite dar
  nome ao aparelho.
- Silêncio por dia da semana (fim de semana inteiro, por exemplo).
- Desfazer "cancelada" de uma tarefa automática pela tela (hoje ela renasce sozinha só se a
  situação voltar a pedir, com outra base).

## Depois da Etapa 8 (pendências percebidas)

- Agregados diários de Números (`numeros_diarios` + job) quando alguma empresa passar de ~20 mil
  leads ou o `explain` passar de 300 ms (hoje 59 ms com 5.000).
- "Em aberto" com histórico (foto diária) para comparar com o período anterior.
- Exportar Números em Excel/CSV; metas de vendas; comparação entre buffets (fora do escopo).
- Importar leads e reservas por planilha (o item "festas já fechadas" do checklist hoje é manual
  na Agenda).
- Onboarding: foto dos pacotes e upload da capa no próprio fluxo; vídeo curto de ajuda.
- QR code com o logo no centro (exige correção H e teste de leitura); cartaz em outros tamanhos.
- Visitas por campanha (`utm_*`) além da origem; deduplicar visitas da mesma pessoa em abas
  diferentes (hoje cada aba é uma sessão).
- Ocupação considerando a sobreposição de horário entre turnos (hoje por dia × turno × espaço).

## Etapa 9: Produção

- **Sessão de 30 dias** (Supabase → Auth → Sessions; "time-box" exige plano pago) e
  expiração/rotação de refresh token.
- ~~Painel somente leitura quando o plano estiver suspenso~~ (Etapa 9A: trigger no banco +
  `acaoDoDono`).
- ~~Modo "acessar conta do cliente" com auditoria~~ (Etapa 9A: consentimento de 7 dias,
  sessão de suporte de 2 h, faixa vermelha, `dados.suporte` na auditoria).
- SMTP próprio no Supabase Cloud (o SMTP padrão tem limite baixo de envios por hora).
- ~~Reduzir o bundle do cadastro~~ (Etapa 9.5: metadados `min` com a regra do Brasil explícita,
  equivalência com `max` testada).
- CSP e headers de segurança; rate limit próprio no cadastro/login além do do Supabase.
- Conta demo somente leitura.
- Restringir leitura de `auditoria` ao dono, se necessário (hoje qualquer usuário ativo da
  empresa lê a auditoria da própria empresa).

## Depois da Etapa 9A (pendências percebidas)

- Tela de cupons e de planos no /interno (hoje cupom novo e mudança de preço entram por
  migration).
- Pró-rata na mudança de plano (hoje o valor novo vale a partir da próxima fatura).
- Pagamento com cartão salvo (`billingType: CREDIT_CARD` com tokenização) para cobrança
  automática; hoje o pagador escolhe a forma a cada fatura.
- Lista de contas a cobrar no /interno (inadimplentes com dias de atraso) e exportação para a
  contabilidade.
- Painel do suspenso "mais visual": desabilitar botões e campos (hoje o servidor e o banco
  recusam com a mensagem e o link para o Plano).
- Nota fiscal de serviço (NFS-e) das mensalidades (fora do escopo da Etapa 9).

## Depois da Etapa 9.5 PR 1 (pendências percebidas)

- **`search_path` em `_lead_grupo`/`_lead_ordem`:** ficou de fora de propósito (o SET impede o
  inlining e a caixa com 5.000 leads vai de 38 para 65 ms). Se um dia o advisor bloquear,
  reescrever as duas como expressão dentro de `caixa_leads` (com teste de equivalência).
- **"Desfazer" ao registrar contato:** pede uma função SQL que apague a atividade e a auditoria
  do contato (hoje o registro é otimista, sem desfazer). Concluir tarefa já tem "Desfazer".
- **Medir TTFB e tempo de servidor em produção** (Vercel → Observability) depois do merge, com a
  função em `gru1`; meta 400 ms no `/app/leads`.
- **Chaves assimétricas do JWT** no Supabase (ver `docs/LANCAMENTO.md`): sem elas, `getClaims`
  cai na rede e o ganho da sessão some.
- **Advisors restantes (só leitura, conferidos em 03/10/2026):** FKs para `usuarios`
  (`criado_por`, `feita_por`…) e do catálogo sem índice (de propósito); índices nunca usados
  (base ainda pequena: reavaliar com uso real); `pg_net` no schema `public` (extensão instalada
  pelo Supabase); `slug_atual_por_antigo` executável por `anon` (é o redirecionamento de link
  antigo, de propósito); "Leaked Password Protection" desligado (ligar em Auth → Settings quando
  o plano permitir).
- Hidratação: campos com `register` do react-hook-form vêm vazios no HTML e são preenchidos no
  cliente; o do link já vem preenchido. Avaliar o mesmo nos formulários grandes de Minha empresa.
- **Esqueleto do detalhe no mestre-detalhe (PR 3):** como o painel não pode ter Suspense de
  página (ARQUITETURA §60), o painel de detalhe precisa de um esqueleto do lado do cliente (estado
  da transição) e não de `loading.tsx`. Se o Next corrigir o Suspense de página depois de ação,
  reavaliar a regra (o teste `sem-suspense-de-pagina` diz onde).

## Depois da Etapa 9.5 PR 2 (pendências percebidas)

- **Editor em Configurações → Personalizar página** no PR 3 (hoje em Minha empresa → Link).
- Reordenar fotos arrastando (hoje subir/descer, que funciona no celular) e recorte da foto.
- Fotos dos pacotes também em duas larguras (hoje uma só, de até 1600 px) e miniatura desfocada
  na capa.
- Galeria por pacote ou por espaço (hoje uma galeria do buffet).
- Vídeo curto no hero, domínio próprio e avaliações automáticas continuam fora do escopo.
- Tema escuro na página pública (fora do escopo).
- Limpeza de arquivos soltos da pasta `galeria` (upload que não chegou a ser gravado).
- Pré-visualizar antes de salvar (hoje a prévia mostra o que já foi salvo).
- **Capa em duas larguras** (como a galeria): hoje uma só, de até 1920 px; com foto real pesada,
  o LCP no celular piora. Gerar 960 e 1920 no envio e usar `srcset` no hero.
