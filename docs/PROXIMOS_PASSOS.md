# Próximos passos (anotados durante as Etapas 0, 1 e 2)

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

## Etapa 3: Agenda

- Capacidade de eventos por turno e espaço (o motor não checa disponibilidade de slot).

## Etapa 4: Link público

- Página pública só com wizard quando não houver pendências (`pendenciasDoLinkPublico`: pacote
  com preço, tipo de festa, turno e espaço ativos).
- Mostrar logo, capa, cor da marca e "sobre" (colunas da Etapa 2).
- Plano `suspenso`: página pública mostra só o WhatsApp do buffet, sem wizard.
- Leitura pública do catálogo por função `security definer` específica (hoje `anon` não lê nada),
  expondo só o necessário para o wizard.
- Usar `aPartirDe` no modo de exibição "faixa" e `turnosDoDia`/`pacotesDisponiveis` nos passos.

## Etapa 5: Proposta

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
