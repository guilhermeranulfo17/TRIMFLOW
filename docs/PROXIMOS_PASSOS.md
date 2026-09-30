# Próximos passos (anotados durante a Etapa 0)

Itens percebidos na fundação que pertencem a etapas futuras. Nada aqui foi implementado.

## Etapa 1: Domínio e motor de preço

- Motor de preço puro em `src/domain/preco` reaproveitando `money.pct` (arredondamento por
  linha antes da soma) e os exemplos do documento como testes de aceitação.
- Tabelas de catálogo com `empresa_id`, RLS e o mesmo padrão de grants mínimos + testes de
  isolamento (copiar `tests/integration/rls-isolamento.test.ts`).
- Definir tipo para percentuais persistidos (`numeric(5,2)` chega como string no Drizzle):
  converter para basis points inteiros no domínio.

## Etapa 2: Configuração da empresa

- Edição de `empresas` (os grants por coluna já existem) e troca de **slug com redirecionamento
  por 12 meses** (tabela `slugs_antigos`; hoje o slug não é editável).
- **Convites de usuários** (vendedor): criar usuário no Auth sem `nome_buffet` nos metadados
  (o trigger de cadastro ignora) e inserir em `usuarios` por uma função `security definer`
  restrita ao dono.
- Sincronizar `usuarios.email` quando o e-mail do Auth mudar.
- Validar `empresas.fuso` contra `pg_timezone_names` (hoje só no app).
- Upload de logo/capa (Storage, WEBP, 5 MB).

## Etapa 4: Link público

- Página pública só com wizard quando a empresa tiver ao menos um pacote com preço e um turno.
- Plano `suspenso`: página pública mostra só o WhatsApp do buffet, sem wizard.

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
