# SEO e pixels: o que configurar (ARQUITETURA §98)

O código já está no ar. Estes passos são feitos por você nas ferramentas do Google, da Meta e da
Vercel. Depois de mudar qualquer variável na Vercel, faça um novo deploy (Deployments → Redeploy),
porque os ids são lidos no build.

## 1. Google Search Console (aparecer no Google)

1. Entre em https://search.google.com/search-console e adicione a propriedade.
   - O melhor tipo é **Domínio**, verificado por um registro TXT no DNS de
     `sistemaorkestra.com.br`.
   - Se preferir **Prefixo de URL** (`https://www.sistemaorkestra.com.br`), escolha a verificação
     por **Tag HTML** e copie só o código de dentro de `content="..."`.
2. Com a tag HTML: na Vercel, crie `GOOGLE_SITE_VERIFICATION` com esse código (Production),
   faça o redeploy e clique em **Verificar** no Search Console.
3. Em **Sitemaps**, envie `https://www.sistemaorkestra.com.br/sitemap.xml`.
4. Em **Inspeção de URL**, peça a indexação destas páginas, uma por uma:
   - `/`
   - `/sistema-para-buffet-infantil`
   - `/sistema-para-buffet-de-casamento`
   - `/sistema-para-buffet-de-eventos`
   - `/sistema-para-buffet-em-domicilio`

Leva de alguns dias a algumas semanas para as páginas aparecerem nas buscas.

## 2. Google Analytics 4

1. Em https://analytics.google.com, crie a propriedade e um **fluxo de dados da Web** para
   `https://www.sistemaorkestra.com.br`.
2. Copie o **ID da métrica** (começa com `G-`).
3. Na Vercel, crie `NEXT_PUBLIC_GA4_ID` com esse id (Production) e faça o redeploy.
4. No GA4, em **Administrador → Eventos**, marque `sign_up` como **evento principal**
   (conversão). Ele dispara quando alguém cria a conta.

## 3. Pixel da Meta (anúncios do Instagram e Facebook)

1. No Gerenciador de Eventos (https://business.facebook.com/events_manager), crie um conjunto de
   dados (pixel) da Web e copie o **ID** (só números).
2. Na Vercel, crie `NEXT_PUBLIC_META_PIXEL_ID` com esse id (Production) e faça o redeploy.
3. A conversão do cadastro chega como **CompleteRegistration**. Use-a como evento de otimização
   das campanhas.
4. Verificação do domínio, opcional e recomendada para os anúncios:
   1. No Gerenciador de Negócios, vá em **Segurança da marca → Domínios** e escolha a metatag.
   2. Copie o código de `content="..."` para `META_DOMAIN_VERIFICATION` na Vercel.
   3. Faça o redeploy e clique em **Verificar**.

## 4. Antes de ligar os pixels: aviso de cookies e Privacidade (LGPD)

- Com `NEXT_PUBLIC_GA4_ID` ou `NEXT_PUBLIC_META_PIXEL_ID` configurado, a landing, as páginas por
  tipo de buffet e o cadastro mostram o aviso de cookies.
  - Nada do Google nem da Meta carrega antes do **Aceitar**.
  - Quem recusa não é medido.
  - No rodapé, "Preferências de cookies" muda a escolha.
- **Peça ao advogado** para incluir na Política de Privacidade uma seção sobre cookies da landing:
  - quais são (Google Analytics e Pixel da Meta);
  - para que servem (medir visitas e anúncios);
  - por quanto tempo ficam;
  - como recusar ou mudar a escolha.

  Ao publicar o texto novo, suba `VERSAO_DOCUMENTOS` (ver CLAUDE.md, LGPD).

- Os pixels nunca entram no painel nem na página dos buffets: os dados dos clientes dos buffets
  não vão para o Google nem para a Meta.

## O que o código já faz

| Item                                         | Onde                                                     |
| -------------------------------------------- | -------------------------------------------------------- |
| Título e descrição com "sistema para buffet" | landing e páginas por tipo                               |
| 4 páginas por tipo de buffet                 | `/sistema-para-buffet-*`, no sitemap e no rodapé         |
| Dados estruturados                           | Organization, WebSite, SoftwareApplication, FAQ e trilha |
| Vitrine com a cidade no título               | `/b/slug` sem frase do buffet                            |
| Demonstração fora do Google                  | `noindex` na demo e nas contas de apresentação           |
| "Feito com Orkestra" com link                | rodapé de toda vitrine                                   |
| robots.txt e sitemap.xml                     | painel, APIs e propostas fora do Google                  |
