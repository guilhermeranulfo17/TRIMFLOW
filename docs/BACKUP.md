# Backup e restauração (Etapa 9B, B.7)

## Política

| O quê                          | Como                                                                                                                                                           | Quem decide                                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backup diário automático**   | Plano pago do Supabase (Pro): backup diário guardado 7 dias; com o add-on PITR, volta a qualquer minuto.                                                       | Você contrata quando quiser: [Billing do projeto](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/settings/billing). **Recomendado antes do primeiro cliente pagante.** |
| **Cópia manual criptografada** | Workflow [Backup manual do banco](../.github/workflows/backup.yml): schema, dados e papéis num arquivo `.tar.gz.gpg` (AES-256), guardado 7 dias como artefato. | Você roda quando quiser (antes de uma mudança grande, todo mês…).                                                                                                                   |
| **Arquivos (logos, fotos)**    | Ficam no Storage (bucket `midia`). O backup do Supabase **não** copia o Storage; a perda de uma foto se resolve com o dono enviando de novo.                   | Revisar quando houver muitos clientes.                                                                                                                                              |

Regras:

- Nunca existe dump sem criptografia fora do banco: o workflow para se não houver a senha, apaga
  o texto puro antes do upload e confere que o arquivo enviado está criptografado.
- A senha (`BACKUP_SENHA`) fica só no segredo do GitHub e num cofre seu (gerenciador de senhas).
  Sem ela o arquivo não abre: **guarde-a fora do GitHub também**.
- O artefato some sozinho em 7 dias. Para guardar mais tempo, baixe o `.gpg` e guarde num lugar
  seu (continua criptografado).

## Configurar (uma vez)

1. Gere uma senha longa (30+ caracteres) no seu gerenciador de senhas.
2. GitHub → [Settings → Secrets and variables → Actions](https://github.com/guilhermeranulfo17/TRIMFLOW/settings/secrets/actions)
   → **New repository secret** → nome `BACKUP_SENHA`, valor a senha.
3. Os segredos `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` já existem (os mesmos das
   migrations). Se você trocou a senha do banco, atualize `SUPABASE_DB_PASSWORD` antes.

## Fazer uma cópia

1. GitHub → [Actions → Backup manual do banco](https://github.com/guilhermeranulfo17/TRIMFLOW/actions/workflows/backup.yml)
   → **Run workflow** → **Run workflow**.
2. Espere ficar verde (2 a 5 minutos). Na página da execução, em **Artifacts**, baixe
   `backup-criptografado` (um `.zip` com o `.tar.gz.gpg` dentro).

## Simulado de restauração (faça uma vez agora e depois a cada 3 meses)

O simulado restaura num projeto **novo e vazio** do Supabase, nunca no de produção.

1. Baixe o artefato e descompacte o `.zip`. No terminal (Mac/Linux, ou WSL no Windows):

   ```bash
   gpg -d orkestra-AAAAMMDD-HHMMSS.tar.gz.gpg | tar -xz
   # pede a BACKUP_SENHA; saem schema.sql, papeis.sql e dados.sql
   ```

2. Crie um projeto novo em [supabase.com/dashboard/new](https://supabase.com/dashboard/new)
   (nome `orkestra-simulado`, região São Paulo). Anote a senha do banco.
3. Em **Connect → Session pooler** copie a URL de conexão (`postgresql://postgres.xxxx:SENHA@...:5432/postgres`).
4. Restaure (precisa do `psql`; no Mac: `brew install libpq`):

   ```bash
   export URL='postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'
   psql "$URL" -v ON_ERROR_STOP=0 -f papeis.sql
   psql "$URL" -v ON_ERROR_STOP=1 -f schema.sql
   psql "$URL" -v ON_ERROR_STOP=1 -c 'set session_replication_role = replica' -f dados.sql
   ```

   (Os avisos de "role already exists" no `papeis.sql` são normais.)

5. Confira: no **Table Editor** do projeto simulado, `empresas`, `leads` e `orcamentos` com a
   mesma quantidade de linhas da produção (no SQL Editor:
   `select count(*) from public.leads;` nos dois).
6. Anote a data do simulado e o tempo que levou. Apague o projeto simulado
   (**Settings → General → Delete project**).

## Restaurar a produção de verdade (se um dia precisar)

1. **Com o plano pago:** Supabase → [Database → Backups](https://supabase.com/dashboard/project/nsqoenggvshzkhbpurfi/database/backups/scheduled)
   → escolha o dia (ou o minuto, com PITR) → **Restore**. O site fica fora alguns minutos.
2. **Só com a cópia manual:** crie um projeto novo, restaure como no simulado, aponte
   `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY` da Vercel para ele e faça um Redeploy. Usuários do login (Auth)
   ficam no schema `auth` e vêm no dump; as fotos do Storage não vêm.
3. Depois: refaça os segredos do Vault (`orkestra_site_url`, `orkestra_cron_secret`) no projeto
   restaurado (ver [AVISOS_CONFIGURACAO.md](AVISOS_CONFIGURACAO.md)).
