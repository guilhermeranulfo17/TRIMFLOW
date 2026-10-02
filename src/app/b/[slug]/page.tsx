import { CalendarDays, Clock, MapPin, Sparkles, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cache } from 'react';
import { formatBRL } from '@/domain/money';
import {
  linkWhatsApp,
  mensagemDuvida,
  origemDoParametro,
  pendenciasDoContexto,
  resumoCardapio,
} from '@/domain/publico';
import { BannerTeste } from '@/components/publico/banner-teste';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/publico/marca';
import { RegistroFunil } from '@/components/publico/registro-funil';
import { RodapePublico } from '@/components/publico/rodape';
import { urlPublicaMidia } from '@/lib/midia';
import { carregarBuffet, carregarVitrine } from '@/server/publico/carregar';
import { ehModoTeste, marcarLinkTestado } from '@/server/publico/sessao';
import { exigirBuffet } from './buscar';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const vitrineDoSlug = cache(carregarVitrine);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const buffet = await carregarBuffet((await params).slug);
  if (!buffet) return { title: 'Buffet não encontrado' };
  const descricao =
    buffet.sobre?.slice(0, 160) ??
    `Monte o orçamento da sua festa no ${buffet.nome} em poucos minutos, pelo celular.`;
  return {
    title: { absolute: buffet.nome },
    description: descricao,
    openGraph: { title: buffet.nome, description: descricao, type: 'website', locale: 'pt_BR' },
  };
}

function duracao(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h} horas`;
}

/** Página pública do buffet: vitrine + "Montar meu orçamento". */
export default async function PaginaPublicaBuffet({ params, searchParams }: Props) {
  const { slug } = await params;
  const busca = await searchParams;
  const buffet = await exigirBuffet(slug);
  const [dados, modoTeste] = await Promise.all([
    buffet.suspenso ? null : vitrineDoSlug(slug),
    ehModoTeste(slug),
  ]);
  if (modoTeste) await marcarLinkTestado();
  const pendente = !dados || pendenciasDoContexto(dados.contexto.ctx).length > 0;
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

  return (
    <>
      {modoTeste && <BannerTeste />}
      <main className="mx-auto max-w-2xl">
        <header>
          <div className="bg-accent sm:rounded-b-card relative aspect-[16/7] w-full overflow-hidden">
            {buffet.capaUrl ? (
              <Image
                src={buffet.capaUrl}
                alt=""
                fill
                priority
                sizes="(min-width: 672px) 672px, 100vw"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--marca-destaque) 100%)',
                }}
              />
            )}
          </div>
          <div className="-mt-10 flex flex-col items-center px-4 text-center">
            <div className="relative size-20 overflow-hidden rounded-full border-4 border-white bg-white shadow-md">
              {buffet.logoUrl ? (
                <Image
                  src={buffet.logoUrl}
                  alt={`Logo de ${buffet.nome}`}
                  fill
                  sizes="80px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <span className="bg-primary text-primary-foreground grid size-full place-items-center text-2xl font-extrabold">
                  {buffet.nome.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {buffet.nome}
            </h1>
            {buffet.cidade && (
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
                <MapPin className="size-4" aria-hidden />
                {buffet.cidade}
                {buffet.uf ? ` - ${buffet.uf}` : ''}
              </p>
            )}
            {buffet.sobre && (
              <p className="text-muted-foreground mt-4 max-w-prose text-base leading-relaxed whitespace-pre-line">
                {buffet.sobre}
              </p>
            )}
          </div>
        </header>

        {buffet.suspenso || pendente ? (
          <section className="rounded-card mx-4 mt-8 border p-5 text-center" aria-live="polite">
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
        ) : (
          vitrine && (
            <>
              <RegistroFunil slug={slug} origem={origem} />
              {vitrine.aPartirDeCentavos !== null && (
                <p className="mx-4 mt-6 flex items-center justify-center gap-2 text-center text-base font-semibold">
                  <Sparkles className="size-5 text-[var(--marca-destaque)]" aria-hidden />
                  Festas a partir de {formatBRL(vitrine.aPartirDeCentavos)}
                </p>
              )}

              {vitrine.tiposEvento.length > 0 && (
                <section className="mt-8 px-4" aria-labelledby="titulo-tipos">
                  <h2 id="titulo-tipos" className="text-lg font-bold">
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
                            className="bg-accent text-accent-foreground hover:border-ring inline-flex min-h-12 items-center rounded-full border border-transparent px-4 font-semibold"
                          >
                            {t.nome}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {vitrine.pacotes.length > 0 && (
                <section className="mt-8 px-4" aria-labelledby="titulo-pacotes">
                  <h2 id="titulo-pacotes" className="text-lg font-bold">
                    Pacotes
                  </h2>
                  <div className="mt-3 flex flex-col gap-3">
                    {vitrine.pacotes.map((p) => {
                      const foto = urlPublicaMidia(p.fotos[0]);
                      const cardapio = resumoCardapio(p.secoes);
                      return (
                        <details
                          key={p.id}
                          className="group rounded-card border bg-white open:shadow-sm"
                          data-testid="pacote-publico"
                        >
                          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                            {foto && (
                              <span className="rounded-control relative size-14 shrink-0 overflow-hidden">
                                <Image
                                  src={foto}
                                  alt=""
                                  fill
                                  sizes="56px"
                                  unoptimized
                                  className="object-cover"
                                />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 font-bold">
                                {p.nome}
                                {p.destaque && (
                                  <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                                    Mais pedido
                                  </span>
                                )}
                              </span>
                              {p.subtitulo && (
                                <span className="text-muted-foreground block text-sm">
                                  {p.subtitulo}
                                </span>
                              )}
                              {p.aPartirDeCentavos !== null && (
                                <span className="block text-sm font-semibold text-[var(--marca-destaque)]">
                                  a partir de {formatBRL(p.aPartirDeCentavos)}
                                </span>
                              )}
                            </span>
                            <span
                              aria-hidden
                              className="text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                            >
                              ▾
                            </span>
                          </summary>
                          <div className="border-t px-4 pt-3 pb-4 text-sm">
                            <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                              <li className="flex items-center gap-1">
                                <Users className="size-4" aria-hidden />
                                {p.maxConvidados
                                  ? `${p.minConvidados} a ${p.maxConvidados} convidados`
                                  : `a partir de ${p.minConvidados} convidados`}
                              </li>
                              <li className="flex items-center gap-1">
                                <Clock className="size-4" aria-hidden />
                                {duracao(p.duracaoInclusaMin)} de festa
                              </li>
                            </ul>
                            {p.descricao && (
                              <p className="mt-3 whitespace-pre-line">{p.descricao}</p>
                            )}
                            {cardapio && <p className="mt-3 font-semibold">{cardapio}</p>}
                            {p.secoes.map((s) =>
                              s.itens.length > 0 ? (
                                <div key={s.nome} className="mt-2">
                                  <h3 className="font-semibold">{s.nome}</h3>
                                  <p className="text-muted-foreground">{s.itens.join(', ')}</p>
                                </div>
                              ) : null,
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </section>
              )}

              <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
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
            </>
          )
        )}
      </main>
      <RodapePublico comEspaco={!buffet.suspenso && !pendente} />
    </>
  );
}
