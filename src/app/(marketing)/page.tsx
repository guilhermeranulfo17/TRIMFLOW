import type { Metadata } from 'next';
import { Demonstracao } from '@/components/marketing/demonstracao';
import { CapturaProspeccao } from '@/components/marketing/prospeccao';
import { RastreioLanding } from '@/components/marketing/rastreio';
import { Beneficios, ChamadaFinal, Preco, Rodape, Topo } from '@/components/marketing/secoes';
import { codigoPlanoVigente } from '@/domain/cobranca/limites';
import { DIAS_TESTE_GRATIS } from '@/domain/cobranca/precos';
import { jsonLdSoftware, planoDaLanding, precoCurto } from '@/domain/marketing';
import { siteUrl } from '@/server/env';
import { carregarPrecosVitrine, exemploDaDemonstracao } from '@/server/marketing/carregar';

// Página estática, refeita a cada 5 min (preço em cache com a tag dos planos). Não toca no Auth.
export const revalidate = 300;

const DESCRICAO =
  'Seu cliente monta o orçamento da festa sozinho, no link do seu buffet, e o pedido chega organizado no seu WhatsApp. Teste grátis por 14 dias, sem cartão.';

export const metadata: Metadata = {
  title: { absolute: 'Orkestra: seu cliente monta o orçamento sozinho' },
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

/**
 * Landing (nov/2026): seis blocos e nada mais. Topo, demonstração (o "Buffet Exemplo" com os
 * passos reais do link público), resultado (como o pedido chega), três benefícios, um preço e o
 * botão final para o cadastro.
 */
export default async function Landing() {
  const [precos, exemplo] = await Promise.all([carregarPrecosVitrine(), exemploDaDemonstracao()]);
  // um preço só: a mensalidade do plano que o teste grátis usa (mesma regra dos limites)
  const codigo = codigoPlanoVigente({ situacao: 'trial', isenta: false, planoAssinatura: null });
  const plano = planoDaLanding(precos?.planos ?? [], codigo);
  const jsonLd = jsonLdSoftware({ url: siteUrl(), descricao: DESCRICAO, plano });

  return (
    <>
      <main>
        <Topo />
        <Demonstracao exemplo={exemplo} />
        <Beneficios />
        <Preco
          preco={plano ? precoCurto(plano.precoMensalCentavos) : null}
          diasTeste={DIAS_TESTE_GRATIS}
        />
        <ChamadaFinal diasTeste={DIAS_TESTE_GRATIS} />
      </main>
      <Rodape />
      <RastreioLanding />
      {/* link da prospecção (?r=): guarda o r e avisa que a demonstração foi aberta */}
      <CapturaProspeccao demonstracao />
      <script
        type="application/ld+json"
        // JSON montado no servidor a partir do plano (sem texto do usuário)
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
