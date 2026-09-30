# Próximos passos (anotados durante as Etapas 0 e 1)

Itens percebidos na fundação que pertencem a etapas futuras. Nada aqui foi implementado.

## Etapa 2: Configuração da empresa

- Edição de `empresas` (os grants por coluna já existem) e troca de **slug com redirecionamento
  por 12 meses** (tabela `slugs_antigos`; hoje o slug não é editável).
- **Convites de usuários** (vendedor): criar usuário no Auth sem `nome_buffet` nos metadados
  (o trigger de cadastro ignora) e inserir em `usuarios` por uma função `security definer`
  restrita ao dono.
- Sincronizar `usuarios.email` quando o e-mail do Auth mudar.
- Validar `empresas.fuso` contra `pg_timezone_names` (hoje só no app).
- Upload de logo/capa (Storage, WEBP, 5 MB).
- **Telas de edição do catálogo e das regras** sobre as tabelas da Etapa 1 (os grants e as
  policies já estão prontos): tipos de evento, espaços, turnos, ajustes de dia, feriados, faixas
  de idade (empresa e por pacote), pacotes com faixas e cardápio, opcionais e vínculos, faixas
  de deslocamento e regras comerciais.
- Fotos de pacotes e opcionais (`pacotes.fotos` já existe como lista vazia).
- Validar no formulário o que o banco já garante (faixas de idade sem sobreposição, ajuste
  único por dia e turno, preço conforme o modelo), com mensagens em português antes de gravar.
- "Tabela própria" por dia (preços diferentes, não só %): hoje a tabela de dia é só ajuste em bp.
- Rever a interpretação das faixas de idade quando o pacote tem política própria (hoje: faixa da
  empresa → faixa do pacote que contém a idade mínima).

## Etapa 3: Agenda

- Capacidade de eventos por turno e espaço (o motor não checa disponibilidade de slot).

## Etapa 4: Link público

- Página pública só com wizard quando a empresa tiver ao menos um pacote com preço e um turno.
- Plano `suspenso`: página pública mostra só o WhatsApp do buffet, sem wizard.
- Leitura pública do catálogo por função `security definer` específica (hoje `anon` não lê nada),
  expondo só o necessário para o wizard.
- Usar `aPartirDe` no modo de exibição "faixa" e `turnosDoDia`/`pacotesDisponiveis` nos passos.

## Etapa 5: Proposta

- **Pacotes e opcionais usados em propostas passam a ser desativados, não excluídos** (hoje a
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
