# Lançamento e operação

Passos manuais de produção. Cada seção diz onde clicar e como conferir.

## Região das funções (Etapa 9.5)

O banco (Supabase) fica em São Paulo (`sa-east-1`). As funções do app precisam rodar perto
dele: cada ida ao banco a partir dos EUA custa de 120 a 200 ms.

- O arquivo `vercel.json` pede `"regions": ["gru1"]` (São Paulo) para todas as funções.
- **Confira na Vercel**: projeto `trimflow` → **Settings → Functions → Function Region** deve
  mostrar **São Paulo, Brazil (gru1)**. Se mostrar outra região, escolha `gru1` ali e faça um
  redeploy: a configuração do projeto pode sobrepor o arquivo.
- Como conferir depois do deploy: em **Deployments → (último) → Functions**, a coluna de
  região mostra `gru1`.

## Chave de assinatura do JWT (Etapa 9.5)

O painel valida a sessão pelo JWT localmente (`getClaims()`), sem ir ao servidor do Auth a cada
página. Isso só funciona com **chaves de assinatura assimétricas** no Supabase.

- Teste de 10 segundos: abra
  `https://nsqoenggvshzkhbpurfi.supabase.co/auth/v1/.well-known/jwks.json` no navegador.
  - Aparece uma lista com `"kty": "EC"` (ou `RSA`): já está certo.
  - Aparece `{"keys":[]}`: o projeto ainda usa a chave antiga (HS256). Tudo funciona, mas cada
    página faz uma ida extra ao Auth. Para migrar:
    1. Supabase → projeto `orkestra` → **Project Settings → JWT Keys**.
    2. Em **JWT Signing Keys**, clique em **Migrate JWT secret** (cria uma chave nova
       assimétrica, ECC P-256, e mantém a antiga para validar os tokens já emitidos).
    3. Clique em **Rotate keys** para a chave nova passar a assinar os tokens. Sessões abertas
       continuam valendo até expirar (1 hora).
    4. Não revogue a chave antiga antes de 1 dia: sessões antigas ainda são validadas por ela.
    5. Abra o link do JWKS de novo: agora aparece a chave nova.
  - Nada muda no código nem nas variáveis da Vercel.
