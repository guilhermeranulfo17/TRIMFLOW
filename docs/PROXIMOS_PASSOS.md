# Próximos passos (anotados durante as Etapas 0 a 4)

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
- Bundle do painel de Leads (194 kB) carrega `libphonenumber-js/max` pelo `formatPhoneBR`.
- Fotos de pacote na página pública usam `<img>`/`next/image` sem otimizador (como na Etapa 2).

## Etapa 5: Proposta

- Proposta completa: PDF, versões (`orcamentos.versao`), rastreio de visualização detalhado,
  "+ Orçamento" pelo painel (canal interno) e edição pelo vendedor.
- Ações sobre o lead (status manual, anotações, tarefas, motivo de perda): Etapa 6.

- **Pacotes, opcionais, turnos, espaços e tipos de festa usados em propostas passam a ser
  desativados, não excluídos** (hoje a
  exclusão física é permitida porque nada aponta para o catálogo).
- Congelar o `ResultadoOrcamento` (com `versaoMotor`) dentro da proposta.

## Etapa 9: Produção

- **Sessão de 30 dias** (Supabase → Auth → Sessions; "time-box" exige plano pago) e
  expiração/rotação de refresh token.
- Painel somente leitura quando o plano estiver suspenso (checar em `exigirSessao`).
- Modo "acessar conta do cliente" (implantação assistida) com auditoria.
- SMTP próprio no Supabase Cloud (o SMTP padrão tem limite baixo de envios por hora).
- Reduzir o bundle do cadastro: `libphonenumber-js/max` pesa ~50 kB; avaliar metadata `mobile`
  no cliente e `max` só no servidor.
- CSP e headers de segurança; rate limit próprio no cadastro/login além do do Supabase.
- Conta demo somente leitura.
- Restringir leitura de `auditoria` ao dono, se necessário (hoje qualquer usuário ativo da
  empresa lê a auditoria da própria empresa).
