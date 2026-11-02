import type { Metadata } from 'next';
import { CascaLanding } from '@/components/marketing/casca';
import { BotaoWhatsappVendas } from '@/components/marketing/ctas';
import { Hero, Jornada } from '@/components/marketing/hero';
import { Holofote } from '@/components/marketing/holofote';
import { Precos } from '@/components/marketing/precos';
import { ProdutoPorDentro } from '@/components/marketing/produto';
import { RastreioLanding } from '@/components/marketing/rastreio';
import {
  ChamadaFinal,
  ComoFunciona,
  Implantacao,
  Indicadores,
  Perguntas,
  Problema,
  Recursos,
  Rodape,
  SuaPagina,
  TituloSecao,
} from '@/components/marketing/secoes';
import { SimuladorDemo } from '@/components/marketing/simulador';
import { codigoPlanoVigente } from '@/domain/cobranca/limites';
import { DIAS_TESTE_GRATIS, VALOR_IMPLANTACAO_CENTAVOS } from '@/domain/cobranca/precos';
import { jsonLdSoftware, seloAnual } from '@/domain/marketing';
import { slugValido } from '@/domain/slug';
import { siteUrl } from '@/server/env';
import { carregarPrecosVitrine, exemploDoSimulador } from '@/server/marketing/carregar';

// Página estática, refeita a cada 5 min (preços em cache com a tag dos planos). Não toca no Auth.
export const revalidate = 300;

const DESCRICAO =
  'Sistema para buffets de festas: o cliente monta o orçamento no seu link e você acompanha proposta, pré-reserva, contrato e recebimentos em um só lugar. Teste grátis por 14 dias, sem cartão.';

export const metadata: Metadata = {
  title: { absolute: 'Orkestra: o cliente monta o orçamento, você acompanha até a festa' },
  description: DESCRICAO,
  metadataBase: new URL(siteUrl()),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Orkestra',
    title: 'Seu cliente monta o orçamento. Você acompanha até a festa fechada.',
    description: DESCRICAO,
    url: '/',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export default async function Landing() {
  const [precos, exemplo] = await Promise.all([carregarPrecosVitrine(), exemploDoSimulador()]);
  const planos = precos?.planos ?? [];
  const semDados = !precos || planos.length === 0;
  // o teste usa os recursos deste plano (mesma regra dos limites no servidor e no banco)
  const codigoTeste = codigoPlanoVigente({
    situacao: 'trial',
    isenta: false,
    planoAssinatura: null,
  });
  const planoTeste = planos.find((p) => p.codigo === codigoTeste)?.nome ?? null;
  const demo = process.env.NEXT_PUBLIC_DEMO_SLUG?.trim().toLowerCase() || null;
  const demoSlug = demo && slugValido(demo) ? demo : null;
  const url = siteUrl();
  const jsonLd = jsonLdSoftware({ url, descricao: DESCRICAO, planos });

  return (
    <>
      <div id="marcador-topo" aria-hidden className="absolute top-6 h-px w-px" />
      <CascaLanding diasTeste={DIAS_TESTE_GRATIS} />
      <main>
        <Hero demoSlug={demoSlug} diasTeste={DIAS_TESTE_GRATIS} />
        <Jornada />
        <Problema />

        <section
          id="demonstracao"
          className="relative scroll-mt-24 py-20 md:py-28"
          aria-labelledby="titulo-demo"
        >
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <TituloSecao
              id="titulo-demo"
              sobre="Experimente agora"
              titulo="Veja como seu cliente"
              destaque="monta a festa."
              texto="Mexa nas opções: o valor muda na hora, com o mesmo cálculo do link do buffet. Os valores são fictícios; cada buffet usa os próprios pacotes e regras. Nada do que você escolher aqui é enviado."
            />
            <div className="mt-12">
              <SimuladorDemo exemplo={exemplo} />
            </div>
          </div>
        </section>

        <ProdutoPorDentro />
        <ComoFunciona />
        <SuaPagina />
        <Recursos planos={planos} />
        <Indicadores planos={planos} />
        <Implantacao implantacaoCentavos={VALOR_IMPLANTACAO_CENTAVOS} />

        <section
          id="planos"
          className="relative scroll-mt-20 overflow-hidden py-20 md:py-28"
          aria-labelledby="titulo-planos"
        >
          {/* âncora antiga (links já divulgados para /#precos) */}
          <span id="precos" aria-hidden className="absolute top-0" />
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <p className="text-primary-texto text-center text-xs font-bold tracking-[0.18em] uppercase">
              Comece grátis. Assine só se fizer sentido.
            </p>
            {/* a palavra gigante fica atrás dos cartões de vidro (o desfoque aparece nela) */}
            <h2
              id="titulo-planos"
              className="ld-paralaxe pointer-events-none relative mt-2 pb-[0.14em] text-center text-[25vw] leading-[0.86] font-extrabold tracking-[-0.07em] select-none lg:text-[15.5rem]"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, #ffffff 35%, rgb(255 255 255 / 0.32) 92%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Planos
            </h2>
            <div className="relative -mt-[3vw] lg:-mt-10">
              <Precos
                planos={planos}
                selo={seloAnual(planos)}
                implantacaoCentavos={VALOR_IMPLANTACAO_CENTAVOS}
                diasTeste={DIAS_TESTE_GRATIS}
                planoTeste={planoTeste}
                semDados={semDados}
              />
            </div>
            {semDados && (
              <div className="mt-6 flex justify-center">
                <BotaoWhatsappVendas>Ver preços no WhatsApp</BotaoWhatsappVendas>
              </div>
            )}
          </div>
        </section>

        <Perguntas
          planos={planos}
          planoTeste={planoTeste}
          diasTeste={DIAS_TESTE_GRATIS}
          implantacaoCentavos={VALOR_IMPLANTACAO_CENTAVOS}
        />
        <ChamadaFinal diasTeste={DIAS_TESTE_GRATIS} />
      </main>
      <Rodape />
      <RastreioLanding />
      <Holofote />
      <script
        type="application/ld+json"
        // JSON montado no servidor a partir dos planos (sem texto do usuário)
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
