import type { Metadata } from 'next';
import { Demonstracao } from '@/components/marketing/demonstracao';
import { CapturaProspeccao } from '@/components/marketing/prospeccao';
import { RastreioLanding } from '@/components/marketing/rastreio';
import {
  Cabecalho,
  ChamadaFinal,
  ComoFunciona,
  Duvidas,
  PainelPorDentro,
  ParaQuem,
  Preco,
  Recursos,
  Rodape,
  Rotina,
  Topo,
} from '@/components/marketing/secoes';
import { codigoPlanoVigente } from '@/domain/cobranca/limites';
import { DIAS_TESTE_GRATIS } from '@/domain/cobranca/precos';
import {
  duvidasDaLanding,
  itensDoPlanoNaLanding,
  jsonLdDuvidas,
  jsonLdOrganizacao,
  jsonLdSite,
  jsonLdSoftware,
  planoDaLanding,
  precoCurto,
} from '@/domain/marketing';
import { demoSlug, siteUrl } from '@/server/env';
import { carregarPrecosVitrine, exemploDaDemonstracao } from '@/server/marketing/carregar';

// Página estática, refeita a cada 5 min (preço em cache com a tag dos planos). Não toca no Auth.
export const revalidate = 300;

// Título e descrição com o que o dono de buffet procura no Google ("sistema para buffet") (§98).
const DESCRICAO = `Sistema para buffet: o cliente monta o orçamento sozinho no seu link e você cuida de agenda, proposta, contrato e pagamentos. Teste grátis por ${DIAS_TESTE_GRATIS} dias.`;

export const metadata: Metadata = {
  title: { absolute: 'Sistema para buffet de festas com orçamento online | Orkestra' },
  description: DESCRICAO,
  metadataBase: new URL(siteUrl()),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Orkestra',
    title: 'Seu cliente monta o orçamento sozinho.',
    description: DESCRICAO,
    url: '/',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

/** WhatsApp de vendas (só dígitos, com DDI) ou null quando não configurado. */
function whatsappVendas(): string | null {
  const n = process.env.NEXT_PUBLIC_WHATSAPP_VENDAS?.replace(/\D/g, '');
  return n && n.length >= 12 ? n : null;
}

/**
 * Landing completa (§95): cabeçalho fixo com "Testar grátis", topo com o link no celular, para
 * quem é, a rotina sem e com o Orkestra, demonstração (o "Buffet Exemplo" com os passos reais do
 * link público) e o resultado, como funciona, recursos, painel por dentro, um preço com o que
 * inclui, dúvidas, chamada final e rodapé completo.
 */
export default async function Landing() {
  const [precos, exemplo] = await Promise.all([carregarPrecosVitrine(), exemploDaDemonstracao()]);
  // um preço só: a mensalidade do plano que o teste grátis usa (mesma regra dos limites)
  const codigo = codigoPlanoVigente({ situacao: 'trial', isenta: false, planoAssinatura: null });
  const plano = planoDaLanding(precos?.planos ?? [], codigo);
  const duvidas = duvidasDaLanding(plano, DIAS_TESTE_GRATIS);
  const whatsapp = whatsappVendas();
  const jsonLd = [
    jsonLdSoftware({ url: siteUrl(), descricao: DESCRICAO, plano }),
    jsonLdDuvidas(duvidas),
    jsonLdOrganizacao({ url: siteUrl(), email: process.env.NEXT_PUBLIC_EMAIL_CONTATO || null }),
    jsonLdSite(siteUrl()),
  ];

  return (
    <>
      <Cabecalho />
      <main>
        <Topo diasTeste={DIAS_TESTE_GRATIS} />
        <ParaQuem />
        <Rotina />
        <Demonstracao exemplo={exemplo} />
        <ComoFunciona />
        <Recursos />
        <PainelPorDentro demoLigada={demoSlug() !== null} />
        <Preco
          preco={plano ? precoCurto(plano.precoMensalCentavos) : null}
          diasTeste={DIAS_TESTE_GRATIS}
          itens={itensDoPlanoNaLanding(plano)}
        />
        <Duvidas duvidas={duvidas} />
        <ChamadaFinal diasTeste={DIAS_TESTE_GRATIS} whatsappVendas={whatsapp} />
      </main>
      <Rodape whatsappVendas={whatsapp} />
      <RastreioLanding />
      {/* link da prospecção (?r=): guarda o r e avisa que a demonstração foi aberta */}
      <CapturaProspeccao demonstracao />
      {jsonLd.map((dados) => (
        <script
          key={String(dados['@type'])}
          type="application/ld+json"
          // JSON montado no servidor a partir do plano e de textos fixos (sem texto do usuário)
          dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, '\\u003c') }}
        />
      ))}
    </>
  );
}
