import type { Metadata } from 'next';
import { CascaLanding } from '@/components/marketing/casca';
import { BotaoWhatsappVendas } from '@/components/marketing/ctas';
import { FaixaRecursos, Hero } from '@/components/marketing/hero';
import { Holofote } from '@/components/marketing/holofote';
import { Precos } from '@/components/marketing/precos';
import { RastreioLanding } from '@/components/marketing/rastreio';
import {
  ChamadaFinal,
  ComoFunciona,
  Funcionalidades,
  Perguntas,
  Problema,
  Rodape,
  SuaPagina,
  TituloSecao,
} from '@/components/marketing/secoes';
import { AbasSegmento, type Segmento } from '@/components/marketing/segmentos';
import { SimuladorDemo } from '@/components/marketing/simulador';
import { DIAS_TESTE_GRATIS, VALOR_IMPLANTACAO_CENTAVOS } from '@/domain/cobranca/precos';
import { faixaFundador, jsonLdSoftware, seloAnual } from '@/domain/marketing';
import { slugValido } from '@/domain/slug';
import { siteUrl } from '@/server/env';
import { carregarPrecosVitrine, exemploDoSimulador } from '@/server/marketing/carregar';

// Página estática, refeita a cada 5 min (preços em cache com a tag dos planos). Não toca no Auth.
export const revalidate = 300;

const DESCRICAO =
  'Link de orçamento para buffets de festas: o cliente monta o orçamento sozinho, vê o preço na hora e pede a pré-reserva. Teste grátis por 14 dias, sem cartão.';

export const metadata: Metadata = {
  title: { absolute: 'Orkestra: orçamento de festa que responde sozinho' },
  description: DESCRICAO,
  metadataBase: new URL(siteUrl()),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Orkestra',
    title: 'O cliente monta o orçamento sozinho. Você só entra quando ele quer reservar.',
    description: DESCRICAO,
    url: '/',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

const SEGMENTOS: Segmento[] = [
  {
    chave: 'infantil',
    rotulo: 'Infantil',
    titulo: 'Buffet infantil com espaço próprio',
    frases: [
      'Os pais pedem orçamento à noite e no fim de semana: o seu link responde na hora, com o pacote e o número de convidados.',
      'Sábado é disputado: a pré-reserva segura a data por um prazo, e a agenda não deixa marcar duas festas no mesmo espaço e horário.',
      'Você vê primeiro quem está pronto para fechar, e o Orkestra lembra de quem precisa de retorno.',
    ],
  },
  {
    chave: 'domicilio',
    rotulo: 'A domicílio',
    titulo: 'Buffet a domicílio',
    frases: [
      'O cliente informa a distância da festa e o orçamento já soma o deslocamento do jeito que você definiu.',
      'Pacotes por convidado calculados na hora, sem planilha e sem conta de cabeça no WhatsApp.',
      'A agenda mostra os turnos livres de cada dia, para você não aceitar duas festas no mesmo horário.',
    ],
  },
  {
    chave: 'eventos',
    rotulo: 'Eventos',
    titulo: 'Casamentos e eventos',
    frases: [
      'Pacotes por pessoa ou por faixa de convidados, com opcionais e horas extras somados na hora.',
      'Proposta em PDF com a sua marca, validade e condições, pronta para enviar aos noivos.',
      'Visitas ao espaço agendadas e acompanhadas no mesmo lugar dos orçamentos.',
    ],
  },
];

export default async function Landing() {
  const [precos, exemplo] = await Promise.all([carregarPrecosVitrine(), exemploDoSimulador()]);
  const planos = precos?.planos ?? [];
  const fundador = precos ? faixaFundador(precos.fundador, planos, new Date()) : null;
  const demo = process.env.NEXT_PUBLIC_DEMO_SLUG?.trim().toLowerCase() || null;
  const demoSlug = demo && slugValido(demo) ? demo : null;
  const url = siteUrl();
  const jsonLd = jsonLdSoftware({ url, descricao: DESCRICAO, planos });

  return (
    <>
      <div id="marcador-topo" aria-hidden className="absolute top-6 h-px w-px" />
      <CascaLanding />
      <main>
        <Hero demoSlug={demoSlug} diasTeste={DIAS_TESTE_GRATIS} />
        <FaixaRecursos />
        <Problema />
        <ComoFunciona />

        <section className="relative py-24 md:py-32" aria-labelledby="titulo-demo">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <TituloSecao
              id="titulo-demo"
              sobre="Experimente agora"
              titulo="É isso que o seu"
              destaque="cliente vê."
              texto="Mexa nas opções: o valor muda na hora, do mesmo jeito que no link do seu buffet."
            />
            <div className="ld-revelar mt-14">
              <SimuladorDemo exemplo={exemplo} />
            </div>
          </div>
        </section>

        <Funcionalidades planos={planos} />

        <section
          id="para-quem"
          className="relative scroll-mt-24 py-24 md:py-32"
          aria-labelledby="titulo-para-quem"
        >
          <div className="mx-auto max-w-4xl px-4 md:px-6">
            <TituloSecao
              id="titulo-para-quem"
              sobre="Para quem é"
              titulo="Feito para quem"
              destaque="vive de festa."
            />
            <AbasSegmento segmentos={SEGMENTOS} />
          </div>
        </section>

        <SuaPagina />

        <section
          id="precos"
          className="relative scroll-mt-20 overflow-hidden py-24 md:py-32"
          aria-labelledby="titulo-precos"
        >
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <p className="text-primary-texto text-center text-xs font-bold tracking-[0.18em] uppercase">
              Comece grátis. Assine só se fizer sentido.
            </p>
            <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-center">
              {DIAS_TESTE_GRATIS} dias com todos os recursos, sem cartão. Depois, escolha o plano.
            </p>
            {/* a palavra gigante fica atrás dos cartões de vidro (o desfoque aparece nela) */}
            <h2
              id="titulo-precos"
              className="ld-paralaxe pointer-events-none relative mt-2 pb-[0.14em] text-center text-[25vw] leading-[0.86] font-extrabold tracking-[-0.07em] select-none lg:text-[15.5rem]"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, #ffffff 35%, rgb(255 255 255 / 0.32) 92%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Preços
            </h2>
            <div className="relative -mt-[3vw] lg:-mt-10">
              <Precos
                planos={planos}
                selo={seloAnual(planos)}
                fundador={fundador}
                implantacaoCentavos={VALOR_IMPLANTACAO_CENTAVOS}
                diasTeste={DIAS_TESTE_GRATIS}
                semDados={!precos || planos.length === 0}
              />
            </div>
            {(!precos || planos.length === 0) && (
              <div className="mt-6 flex justify-center">
                <BotaoWhatsappVendas>Ver preços no WhatsApp</BotaoWhatsappVendas>
              </div>
            )}
          </div>
        </section>

        <Perguntas planos={planos} diasTeste={DIAS_TESTE_GRATIS} />
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
