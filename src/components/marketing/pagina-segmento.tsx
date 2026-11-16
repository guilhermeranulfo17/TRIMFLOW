import { ArrowRight, Check, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { codigoPlanoVigente } from '@/domain/cobranca/limites';
import { DIAS_TESTE_GRATIS } from '@/domain/cobranca/precos';
import {
  duvidasDaLanding,
  itensDoPlanoNaLanding,
  jsonLdDuvidas,
  jsonLdSoftware,
  jsonLdTrilha,
  paginaDoSegmento,
  planoDaLanding,
  precoCurto,
  serializarJsonLdLanding,
  type ChaveSegmento,
  type PaginaSegmento,
} from '@/domain/marketing';
import { siteUrl } from '@/server/env';
import { carregarPrecosVitrine } from '@/server/marketing/carregar';
import { BotaoTeste } from './ctas';
import { RastreioLanding } from './rastreio';
import {
  Cabecalho,
  ChamadaFinal,
  ComoFunciona,
  Duvidas,
  Preco,
  Recursos,
  Rodape,
  Rotina,
} from './secoes';

/*
 * Página por tipo de buffet (§98, SEO): topo e recursos próprios do segmento e, depois, as mesmas
 * seções da landing (rotina, como funciona, recursos, preço, dúvidas e chamada final). Estática
 * como a landing (ISR), sem foto nova e sem número inventado.
 */

export function metadataDoSegmento(chave: ChaveSegmento): Metadata {
  const p = paginaDoSegmento(chave);
  return {
    title: { absolute: p.titulo },
    description: p.descricao,
    metadataBase: new URL(siteUrl()),
    alternates: { canonical: p.caminho },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'Orkestra',
      title: p.h1,
      description: p.descricao,
      url: p.caminho,
      // a imagem de compartilhamento vem do opengraph-image da landing (herdada pelo segmento)
    },
    twitter: { card: 'summary_large_image' },
    robots: { index: true, follow: true },
  };
}

function whatsappVendas(): string | null {
  const n = process.env.NEXT_PUBLIC_WHATSAPP_VENDAS?.replace(/\D/g, '');
  return n && n.length >= 12 ? n : null;
}

function TopoSegmento({ p }: { p: PaginaSegmento }) {
  return (
    <section className="px-5 pt-8 pb-16 md:pt-12 md:pb-24" aria-labelledby="titulo-topo">
      <div className="mx-auto max-w-6xl">
        <nav aria-label="Você está em" className="text-sm text-white/60">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-white">
                Início
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-4" />
            </li>
            <li aria-current="page" className="text-white/80">
              {p.rotulo}
            </li>
          </ol>
        </nav>
        <h1
          id="titulo-topo"
          className="ld-titulo mt-6 max-w-4xl text-[clamp(2.6rem,9vw,5rem)]"
          data-testid="titulo-segmento"
        >
          {p.h1}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/80 md:text-xl">{p.abertura}</p>
        <div className="mt-8 flex max-w-md flex-col gap-3 lg:max-w-none lg:flex-row">
          <BotaoTeste className="w-full lg:w-auto">
            Testar grátis por {DIAS_TESTE_GRATIS} dias
          </BotaoTeste>
          <Link
            href="/#demonstracao"
            className="inline-flex min-h-14 items-center justify-between gap-4 rounded-[1.75rem] border border-white/25 px-6 py-4 text-base font-bold text-white transition-colors hover:bg-white/10 lg:w-auto"
          >
            <span>Montar um orçamento de exemplo</span>
            <ArrowRight className="size-5 shrink-0" aria-hidden />
          </Link>
        </div>
        <div className="mt-8">
          <p className="text-sm font-semibold text-white/60">Já vem com modelo pronto para</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {p.festas.map((f) => (
              <li
                key={f}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FeitoParaSegmento({ p }: { p: PaginaSegmento }) {
  return (
    <section
      className="border-y border-white/10 px-5 py-16 md:py-24"
      aria-labelledby="titulo-feito-para"
      data-testid="recursos-segmento"
    >
      <div className="mx-auto max-w-6xl">
        <h2 id="titulo-feito-para" className="ld-titulo max-w-3xl text-[2.2rem] md:text-5xl">
          Feito para quem trabalha com {p.rotulo.toLowerCase()}
        </h2>
        <ul className="mt-10 grid gap-4 md:grid-cols-2">
          {p.recursos.map((r) => (
            <li key={r.titulo} className="rounded-[1.75rem] border border-white/10 p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Check className="size-5 shrink-0 text-[var(--ld-limao)]" aria-hidden />
                {r.titulo}
              </h3>
              <p className="mt-2 text-white/70">{r.texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A página inteira de um tipo de buffet. */
export async function PaginaDeSegmento({ chave }: { chave: ChaveSegmento }) {
  const p = paginaDoSegmento(chave);
  const precos = await carregarPrecosVitrine();
  const codigo = codigoPlanoVigente({ situacao: 'trial', isenta: false, planoAssinatura: null });
  const plano = planoDaLanding(precos?.planos ?? [], codigo);
  const duvidas = [...p.duvidas, ...duvidasDaLanding(plano, DIAS_TESTE_GRATIS)];
  const whatsapp = whatsappVendas();
  const url = siteUrl();
  const jsonLd = [
    jsonLdSoftware({ url: `${url}${p.caminho}`, descricao: p.descricao, plano }),
    jsonLdDuvidas(duvidas),
    jsonLdTrilha(url, [
      { nome: 'Início', caminho: '/' },
      { nome: p.rotulo, caminho: p.caminho },
    ]),
  ];

  return (
    <>
      <Cabecalho />
      <main>
        <TopoSegmento p={p} />
        <FeitoParaSegmento p={p} />
        <Rotina />
        <ComoFunciona />
        <Recursos />
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
      {jsonLd.map((dados) => (
        <script
          key={String(dados['@type'])}
          type="application/ld+json"
          // JSON montado no servidor a partir do plano e de textos fixos (sem texto do usuário)
          dangerouslySetInnerHTML={{ __html: serializarJsonLdLanding(dados) }}
        />
      ))}
    </>
  );
}
