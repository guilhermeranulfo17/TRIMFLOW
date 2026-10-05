import {
  CalendarCheck,
  CalendarDays,
  Check,
  ExternalLink,
  ListChecks,
  MapPin,
  Quote,
  Sparkles,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cache } from 'react';
import { formatBRL } from '@/domain/money';
import {
  altPadrao,
  jsonLdNegocio,
  linkMapa,
  linkWhatsApp,
  localDaPagina,
  mensagemDuvida,
  origemDoParametro,
  pendenciasDoContexto,
  perguntasAutomaticas,
  serializarJsonLd,
} from '@/domain/publico';
import { BannerTeste } from '@/components/publico/banner-teste';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { BOTAO_CLARO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/publico/marca';
import { CabecalhoPublico } from '@/components/publico/pagina/cabecalho';
import { GaleriaPublica } from '@/components/publico/pagina/galeria';
import { PacotesPublicos } from '@/components/publico/pagina/pacotes';
import { RegistroFunil } from '@/components/publico/registro-funil';
import { RodapePublico } from '@/components/publico/rodape';
import { urlPublicaMidia } from '@/lib/midia';
import { siteUrl } from '@/server/env';
import { carregarBuffet, carregarPagina, carregarVitrine } from '@/server/publico/carregar';
import { ehModoTeste, marcarLinkTestado } from '@/server/publico/sessao';
import { exigirBuffet } from './buscar';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const vitrineDoSlug = cache((slug: string, suspensa: boolean) =>
  carregarVitrine(slug, { suspensa }),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [buffet, pagina] = await Promise.all([carregarBuffet(slug), carregarPagina(slug)]);
  if (!buffet) return { title: 'Buffet não encontrado' };
  const titulo = pagina?.slogan ? `${buffet.nome} · ${pagina.slogan}` : buffet.nome;
  const descricao =
    buffet.sobre?.slice(0, 160) ??
    `Monte o orçamento da sua festa no ${buffet.nome} em poucos minutos, pelo celular.`;
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: `${siteUrl()}/b/${slug}` },
    openGraph: { title: buffet.nome, description: descricao, type: 'website', locale: 'pt_BR' },
  };
}

/** Cabeçalho de seção (título com a decoração do estilo). */
function Secao({
  id,
  titulo,
  subtitulo,
  centro = false,
  className = '',
  children,
}: {
  id: string;
  titulo: string;
  subtitulo?: string;
  centro?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`titulo-${id}`}
      className={`entrada mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16 ${className}`}
      data-secao={id}
    >
      <div className={centro ? 'centro text-center' : ''}>
        <h2 id={`titulo-${id}`} className="titulo-secao font-titulo text-2xl font-bold md:text-3xl">
          {titulo}
        </h2>
        {subtitulo && <p className="text-muted-foreground mt-3 max-w-prose">{subtitulo}</p>}
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** Página pública do buffet: a vitrine que o cliente final vê (Etapa 9.5, Parte E). */
export default async function PaginaPublicaBuffet({ params, searchParams }: Props) {
  const { slug } = await params;
  const busca = await searchParams;
  const buffet = await exigirBuffet(slug);
  const modoTeste = await ehModoTeste(slug);
  const [dados, pagina] = await Promise.all([
    vitrineDoSlug(slug, buffet.suspenso),
    // modo teste e prévia do editor: sem cache, o dono vê na hora o que salvou
    carregarPagina(slug, modoTeste),
    modoTeste ? marcarLinkTestado() : null,
  ]);
  const pendente = !dados || pendenciasDoContexto(dados.contexto.ctx).length > 0;
  const orcamentoDisponivel = !buffet.suspenso && !pendente;
  const vitrine = dados?.vitrine;

  const origem = origemDoParametro(busca.origem);
  const tipoParam = typeof busca.tipo === 'string' ? busca.tipo : undefined;
  const parametros = new URLSearchParams();
  if (origem !== 'link_direto') parametros.set('origem', origem);
  if (tipoParam && vitrine?.tiposEvento.some((t) => t.id === tipoParam))
    parametros.set('tipo', tipoParam);
  const linkOrcamento = `/b/${slug}/orcamento${parametros.size ? `?${parametros}` : ''}`;
  const whatsapp = buffet.whatsappE164
    ? linkWhatsApp(buffet.whatsappE164, mensagemDuvida(buffet.nome))
    : null;

  const local = localDaPagina({
    endereco: pagina?.endereco ?? null,
    bairro: pagina?.bairro ?? null,
    cidade: buffet.cidade,
    uf: buffet.uf,
  });
  const cidade = buffet.cidade ? `${buffet.cidade}${buffet.uf ? ` - ${buffet.uf}` : ''}` : null;
  const perguntas = [
    ...(vitrine && orcamentoDisponivel
      ? perguntasAutomaticas(vitrine, {
          prazoPreReservaHoras: dados?.contexto.prazoPreReservaHoras,
        })
      : []),
    ...(pagina?.perguntas ?? []),
  ];
  const galeria = (pagina?.galeria ?? []).map((f, i) => ({
    ...f,
    alt: f.alt ?? altPadrao(buffet.nome, i + 1),
  }));
  // pendente: os pacotes ainda não estão prontos (como antes); suspenso: vitrine sem orçamento
  const pacotes = (orcamentoDisponivel || buffet.suspenso ? (vitrine?.pacotes ?? []) : []).map(
    (p) => ({
      ...p,
      fotosUrl: p.fotos.map((f) => urlPublicaMidia(f)).filter((u): u is string => !!u),
    }),
  );
  const jsonLd = jsonLdNegocio({
    nome: buffet.nome,
    url: `${siteUrl()}/b/${slug}`,
    descricao: pagina?.slogan ?? buffet.sobre,
    imagem: buffet.capaUrl ?? buffet.logoUrl,
    telefoneE164: buffet.whatsappE164,
    cidade: buffet.cidade,
    uf: buffet.uf,
    bairro: pagina?.bairro ?? null,
    endereco: pagina?.endereco ?? null,
  });

  return (
    <>
      <script
        type="application/ld+json"
        // dados do próprio buffet, serializados com "<" escapado
        dangerouslySetInnerHTML={{ __html: serializarJsonLd(jsonLd) }}
      />
      {modoTeste && <BannerTeste />}
      <CabecalhoPublico
        nome={buffet.nome}
        logoUrl={buffet.logoUrl}
        linkOrcamento={orcamentoDisponivel ? linkOrcamento : null}
        topo={modoTeste ? 36 : 0}
      />
      <main className="relative">
        {/* 1. Hero */}
        <section
          className="relative isolate overflow-hidden md:min-h-[min(640px,80vh)]"
          aria-labelledby="nome-buffet"
        >
          <div className="relative aspect-[4/3] w-full sm:aspect-[16/7] md:absolute md:inset-0 md:aspect-auto">
            {buffet.capaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- capa em 960/1920 px (srcset)
              <img
                src={buffet.capaUrl960 ?? buffet.capaUrl}
                srcSet={
                  buffet.capaUrl960
                    ? `${buffet.capaUrl960} 960w, ${buffet.capaUrl} 1920w`
                    : undefined
                }
                sizes="100vw"
                alt=""
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(135deg, var(--marca-destaque) 0%, var(--primary) 100%)',
                }}
              />
            )}
            <div
              aria-hidden
              className="absolute inset-0 md:hidden"
              style={{
                background:
                  'linear-gradient(to bottom, rgb(0 0 0 / 0.35), transparent 35%, transparent 70%, rgb(255 255 255 / 0.15))',
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0 hidden md:block"
              style={{
                background:
                  'linear-gradient(90deg, var(--marca-destaque) 0%, color-mix(in srgb, var(--marca-destaque) 88%, transparent) 38%, color-mix(in srgb, var(--marca-destaque) 25%, transparent) 70%, transparent 100%)',
              }}
            />
            <svg
              aria-hidden
              className="formas-festivas absolute -right-10 -bottom-10 hidden size-72 opacity-30 md:block"
              viewBox="0 0 200 200"
            >
              <circle cx="60" cy="60" r="50" fill="var(--primary)" />
              <circle cx="150" cy="120" r="36" fill="white" />
              <circle cx="90" cy="160" r="22" fill="var(--accent)" />
            </svg>
          </div>
          <div className="relative mx-auto flex max-w-6xl px-4 md:min-h-[min(640px,80vh)] md:items-center md:px-8 md:py-24">
            <div className="flex w-full max-w-[640px] flex-col items-center text-center md:items-start md:text-left md:text-white">
              <div className="relative -mt-10 size-20 shrink-0 overflow-hidden rounded-full border-4 border-white bg-white shadow-md md:mt-0 md:size-24">
                {buffet.logoUrl ? (
                  <Image
                    src={buffet.logoUrl}
                    alt={`Logo de ${buffet.nome}`}
                    fill
                    sizes="96px"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <span className="bg-primary text-primary-foreground font-titulo grid size-full place-items-center text-3xl font-bold">
                    {buffet.nome.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <h1
                id="nome-buffet"
                className="font-titulo mt-4 text-3xl leading-tight font-bold tracking-tight sm:text-4xl md:text-5xl"
              >
                {buffet.nome}
              </h1>
              {cidade && (
                <p className="text-muted-foreground mt-2 flex items-center gap-1 text-sm md:text-base md:text-white/90">
                  <MapPin className="size-4" aria-hidden />
                  {pagina?.bairro ? `${pagina.bairro}, ${cidade}` : cidade}
                </p>
              )}
              {pagina?.slogan && (
                <p className="mt-4 text-lg font-semibold md:text-2xl" data-testid="slogan">
                  {pagina.slogan}
                </p>
              )}
              {buffet.sobre && (
                <p className="text-muted-foreground mt-3 max-w-prose text-base leading-relaxed whitespace-pre-line md:text-white/90">
                  {buffet.sobre}
                </p>
              )}
              {orcamentoDisponivel && vitrine?.aPartirDeCentavos != null && (
                <p className="text-primary-texto mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-base font-bold shadow-sm">
                  <Sparkles className="size-5" aria-hidden />
                  Festas a partir de {formatBRL(vitrine.aPartirDeCentavos)}
                </p>
              )}
              {orcamentoDisponivel && (
                <div className="mt-6 hidden gap-3 md:flex">
                  <Link href={linkOrcamento} className={`${BOTAO_CLARO} min-h-14 px-7 text-lg`}>
                    <CalendarDays className="size-5" aria-hidden />
                    Montar meu orçamento
                  </Link>
                  {whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-control inline-flex min-h-14 items-center gap-2 border-2 border-white/80 px-6 font-semibold text-white transition-colors hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none"
                    >
                      <IconeWhatsApp />
                      WhatsApp
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {orcamentoDisponivel && vitrine && vitrine.tiposEvento.length > 0 && (
          <nav aria-labelledby="titulo-tipos" className="mx-auto max-w-6xl px-4 pt-8 md:px-8">
            <h2 id="titulo-tipos" className="text-muted-foreground text-sm font-semibold">
              Que festa você vai fazer?
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {vitrine.tiposEvento.map((t) => {
                const p = new URLSearchParams(parametros);
                p.set('tipo', t.id);
                return (
                  <li key={t.id}>
                    <Link
                      href={`/b/${slug}/orcamento?${p}`}
                      className="bg-accent text-accent-foreground hover:border-ring inline-flex min-h-12 items-center rounded-full border border-transparent px-5 font-semibold"
                    >
                      {t.nome}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {!orcamentoDisponivel && (
          <section
            className="rounded-card mx-4 mt-8 border p-5 text-center md:mx-auto md:max-w-2xl"
            aria-live="polite"
          >
            <h2 className="text-lg font-bold">
              {buffet.suspenso
                ? 'O orçamento online está indisponível no momento'
                : 'Este buffet está finalizando o orçamento online'}
            </h2>
            <p className="text-muted-foreground mt-2">
              Fale direto com a equipe pelo WhatsApp para saber valores e datas livres.
            </p>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={`${BOTAO_PRINCIPAL} mt-4 w-full`}
              >
                <IconeWhatsApp />
                Falar no WhatsApp
              </a>
            )}
          </section>
        )}

        {orcamentoDisponivel && <RegistroFunil slug={slug} origem={origem} />}

        {/* 2. Como funciona */}
        {orcamentoDisponivel && (
          <Secao id="como-funciona" titulo="Como funciona" centro>
            <ol className="grid gap-4 md:grid-cols-3 md:gap-6">
              {[
                {
                  icone: ListChecks,
                  titulo: 'Escolha o pacote e a data',
                  texto: 'Veja as datas livres e monte a festa do seu jeito.',
                },
                {
                  icone: Wallet,
                  titulo: 'Veja o valor na hora',
                  texto: 'O preço aparece na tela, sem esperar resposta.',
                },
                {
                  icone: CalendarCheck,
                  titulo: 'Reserve a data',
                  texto: 'Peça a pré-reserva e a equipe confirma com você.',
                },
              ].map((p, i) => (
                <li
                  key={p.titulo}
                  className="rounded-card bg-accent/60 flex items-start gap-4 p-5 md:flex-col md:items-center md:text-center"
                >
                  <span className="bg-primary text-primary-foreground grid size-12 shrink-0 place-items-center rounded-full">
                    <p.icone className="size-6" aria-hidden />
                  </span>
                  <span>
                    <span className="text-primary-texto block text-xs font-bold tracking-wide uppercase">
                      Passo {i + 1}
                    </span>
                    <span className="font-titulo block text-lg font-bold">{p.titulo}</span>
                    <span className="text-muted-foreground block text-sm">{p.texto}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Secao>
        )}

        {/* 3. Pacotes */}
        {pacotes.length > 0 && (
          <Secao
            id="pacotes"
            titulo="Pacotes"
            subtitulo={
              orcamentoDisponivel ? 'Abra os detalhes e monte o orçamento do seu jeito.' : undefined
            }
          >
            <PacotesPublicos
              pacotes={pacotes}
              linkOrcamento={orcamentoDisponivel ? linkOrcamento : null}
            />
          </Secao>
        )}

        {/* 4. Galeria */}
        {galeria.length > 0 && (
          <Secao id="galeria" titulo="Conheça o espaço">
            <GaleriaPublica fotos={galeria} />
          </Secao>
        )}

        {/* 5. Diferenciais */}
        {(pagina?.diferenciais.length ?? 0) > 0 && (
          <Secao id="diferenciais" titulo="Por que escolher a gente" centro>
            <ul className="flex flex-wrap justify-center gap-2 md:gap-3">
              {pagina!.diferenciais.map((d) => (
                <li
                  key={d}
                  className="bg-accent text-accent-foreground inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold"
                >
                  <Check className="size-4" aria-hidden />
                  {d}
                </li>
              ))}
            </ul>
          </Secao>
        )}

        {/* 6. Depoimentos: só os cadastrados pelo dono, sem nota nem estrelas */}
        {(pagina?.depoimentos.length ?? 0) > 0 && (
          <Secao id="depoimentos" titulo="Quem fez a festa aqui">
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pagina!.depoimentos.map((d) => (
                <li key={d.id} className="rounded-card border bg-white p-6 shadow-sm">
                  <figure>
                    <Quote className="text-primary-texto size-6" aria-hidden />
                    <blockquote className="mt-3 text-base leading-relaxed">{d.texto}</blockquote>
                    <figcaption className="mt-4 text-sm">
                      <span className="font-bold">{d.nome}</span>
                      {d.tipoFesta && (
                        <span className="text-muted-foreground"> · {d.tipoFesta}</span>
                      )}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </Secao>
        )}

        {/* 7. Perguntas frequentes */}
        {perguntas.length > 0 && (
          <Secao id="perguntas" titulo="Perguntas frequentes">
            <div className="rounded-card max-w-3xl divide-y border bg-white">
              {perguntas.map((p) => (
                <details key={p.pergunta} className="group px-5">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                    {p.pergunta}
                    <span
                      aria-hidden
                      className="text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    >
                      ▾
                    </span>
                  </summary>
                  <p className="text-muted-foreground pb-4 whitespace-pre-line">{p.resposta}</p>
                </details>
              ))}
            </div>
          </Secao>
        )}

        {/* 8. Onde fica */}
        {local && (
          <Secao id="onde-fica" titulo="Onde fica">
            <div className="rounded-card flex flex-col gap-4 border bg-white p-5 md:flex-row md:items-center md:justify-between">
              <p className="flex items-start gap-2 text-base">
                <MapPin className="text-primary-texto mt-0.5 size-5 shrink-0" aria-hidden />
                {local}
              </p>
              <a
                href={linkMapa(buffet.nome, local)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${BOTAO_SECUNDARIO} shrink-0`}
              >
                Abrir no mapa
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </div>
          </Secao>
        )}

        {/* 9. Chamada final */}
        {orcamentoDisponivel && (
          <section
            className="entrada mx-auto max-w-6xl px-4 pt-4 md:px-8"
            aria-labelledby="titulo-chamada"
          >
            <div
              className="rounded-card relative overflow-hidden p-8 text-center text-white md:p-12"
              style={{ background: 'var(--marca-destaque)' }}
            >
              <h2 id="titulo-chamada" className="font-titulo text-2xl font-bold md:text-3xl">
                Pronto para montar a sua festa?
              </h2>
              <p className="mt-2 text-white/90">
                Em poucos minutos você vê o valor e as datas livres.
              </p>
              <Link href={linkOrcamento} className={`${BOTAO_CLARO} mt-6 px-7`}>
                <CalendarDays className="size-5" aria-hidden />
                Montar meu orçamento
              </Link>
            </div>
          </section>
        )}

        {/* Barra fixa no celular */}
        {orcamentoDisponivel && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 md:hidden">
            <div className="mx-auto flex max-w-2xl gap-2">
              <Link href={linkOrcamento} className={`${BOTAO_PRINCIPAL} flex-1`}>
                <CalendarDays className="size-5" aria-hidden />
                Montar meu orçamento
              </Link>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${BOTAO_SECUNDARIO} px-4`}
                  aria-label="Falar no WhatsApp"
                >
                  <IconeWhatsApp />
                </a>
              )}
            </div>
          </div>
        )}
      </main>
      <RodapePublico comEspaco={orcamentoDisponivel} />
    </>
  );
}
