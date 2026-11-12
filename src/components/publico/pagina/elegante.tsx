import { CalendarDays, MapPin } from 'lucide-react';
import Link from 'next/link';
import { formatBRL } from '@/domain/money';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/publico/marca';
import { GaleriaPublica, type FotoGaleria } from '@/components/publico/pagina/galeria';
import { PacotesPublicos } from '@/components/publico/pagina/pacotes';

/*
 * Página pública no modelo ELEGANTE (§84), para casamento e 15 anos: capa em tela cheia com a
 * foto, título serifado, muito espaço, galeria em grade limpa, depoimentos em destaque,
 * perguntas em acordeão discreto e o botão de orçamento fixo e sóbrio. Mesmo conteúdo, mesmos
 * dados e mesmo fluxo do modelo alegre: só muda o desenho. Componente do servidor (sem JS a
 * mais além das ilhas que o alegre também usa: pacotes e galeria).
 */

type Pacotes = Parameters<typeof PacotesPublicos>[0]['pacotes'];

export type DadosPaginaElegante = {
  nome: string;
  logoUrl: string | null;
  capaUrl: string | null;
  capaUrl960: string | null;
  cidade: string | null;
  bairro: string | null;
  slogan: string | null;
  sobre: string | null;
  aPartirDeCentavos: number | null;
  orcamentoDisponivel: boolean;
  suspenso: boolean;
  linkOrcamento: string;
  whatsapp: string | null;
  pacotes: Pacotes;
  galeria: FotoGaleria[];
  diferenciais: string[];
  depoimentos: { id: string; nome: string; tipoFesta: string | null; texto: string }[];
  perguntas: { pergunta: string; resposta: string }[];
  local: string | null;
  linkMapa: string | null;
};

function Secao({
  id,
  titulo,
  sobretitulo,
  children,
  className = '',
}: {
  id: string;
  titulo: string;
  sobretitulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`titulo-${id}`}
      className={`entrada mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24 ${className}`}
      data-secao={id}
    >
      <div className="centro text-center">
        {sobretitulo && (
          <p className="text-muted-foreground text-xs tracking-[0.25em] uppercase">{sobretitulo}</p>
        )}
        <h2
          id={`titulo-${id}`}
          className="titulo-secao font-titulo mt-2 text-3xl font-bold md:text-4xl"
        >
          {titulo}
        </h2>
      </div>
      <div className="mt-10 md:mt-14">{children}</div>
    </section>
  );
}

export function PaginaElegante({ d }: { d: DadosPaginaElegante }) {
  return (
    <main className="relative" data-modelo="elegante">
      {/* Capa em tela cheia: a foto do buffet, véu escuro neutro e o nome em serifa */}
      <section
        className="relative isolate flex min-h-[100svh] items-end overflow-hidden text-white md:items-center"
        aria-labelledby="nome-buffet"
      >
        {d.capaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- capa em 960/1920 px (srcset)
          <img
            src={d.capaUrl960 ?? d.capaUrl}
            srcSet={d.capaUrl960 ? `${d.capaUrl960} 960w, ${d.capaUrl} 1920w` : undefined}
            sizes="100vw"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: 'linear-gradient(160deg, #2a2a2a 0%, var(--marca-destaque) 120%)',
            }}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'linear-gradient(to bottom, rgb(0 0 0 / 0.45) 0%, rgb(0 0 0 / 0.4) 45%, rgb(0 0 0 / 0.72) 100%)',
          }}
        />
        <div className="mx-auto w-full max-w-4xl px-6 pt-28 pb-28 text-center md:pb-20">
          {d.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- logo pequeno já em WEBP
            <img
              src={d.logoUrl}
              alt={`Logo de ${d.nome}`}
              width={80}
              height={80}
              className="mx-auto mb-6 size-16 rounded-full bg-white/90 object-contain p-1 md:size-20"
            />
          )}
          {d.cidade && (
            <p className="text-xs tracking-[0.3em] text-white/85 uppercase">
              {d.bairro ? `${d.bairro} · ${d.cidade}` : d.cidade}
            </p>
          )}
          <h1
            id="nome-buffet"
            className="font-titulo mt-3 text-5xl leading-[1.05] font-bold text-balance md:text-7xl"
          >
            {d.nome}
          </h1>
          <div aria-hidden className="mx-auto my-6 h-px w-16 bg-white/70" />
          {d.slogan && (
            <p
              className="font-titulo text-xl text-balance text-white/95 md:text-2xl"
              data-testid="slogan"
            >
              {d.slogan}
            </p>
          )}
          {d.orcamentoDisponivel && d.aPartirDeCentavos != null && (
            <p className="mt-5 text-sm tracking-wide text-white/90">
              Eventos a partir de {formatBRL(d.aPartirDeCentavos)}
            </p>
          )}
          {d.orcamentoDisponivel && (
            <div className="mt-8 hidden justify-center gap-3 md:flex">
              <Link
                href={d.linkOrcamento}
                className="rounded-control inline-flex min-h-12 items-center gap-2 bg-white px-7 font-semibold text-[var(--marca-destaque)] transition-colors hover:bg-white/90 focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none"
              >
                <CalendarDays className="size-5" aria-hidden />
                Montar meu orçamento
              </Link>
              {d.whatsapp && (
                <a
                  href={d.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-control inline-flex min-h-12 items-center gap-2 border border-white/70 px-6 font-semibold text-white transition-colors hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none"
                >
                  <IconeWhatsApp />
                  WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {!d.orcamentoDisponivel && (
        <section
          className="mx-5 mt-12 border-y py-8 text-center md:mx-auto md:max-w-2xl"
          aria-live="polite"
        >
          <h2 className="font-titulo text-2xl font-bold">
            {d.suspenso
              ? 'O orçamento online está indisponível no momento'
              : 'Este buffet está finalizando o orçamento online'}
          </h2>
          <p className="text-muted-foreground mt-2">
            Fale direto com a equipe pelo WhatsApp para saber valores e datas livres.
          </p>
          {d.whatsapp && (
            <a
              href={d.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BOTAO_PRINCIPAL} mt-5`}
            >
              <IconeWhatsApp />
              Falar no WhatsApp
            </a>
          )}
        </section>
      )}

      {d.sobre && (
        <section className="entrada mx-auto max-w-2xl px-6 pt-16 text-center md:pt-24">
          <p className="font-titulo text-2xl leading-relaxed whitespace-pre-line md:text-3xl">
            {d.sobre}
          </p>
        </section>
      )}

      {d.pacotes.length > 0 && (
        <Secao id="pacotes" titulo="Pacotes" sobretitulo="Para o seu evento">
          <PacotesPublicos
            pacotes={d.pacotes}
            linkOrcamento={d.orcamentoDisponivel ? d.linkOrcamento : null}
          />
        </Secao>
      )}

      {d.galeria.length > 0 && (
        <Secao id="galeria" titulo="O espaço" sobretitulo="Galeria">
          <GaleriaPublica fotos={d.galeria} variante="grade" />
        </Secao>
      )}

      {d.diferenciais.length > 0 && (
        <Secao id="diferenciais" titulo="O que nos diferencia">
          <ul className="mx-auto grid max-w-3xl gap-x-10 sm:grid-cols-2">
            {d.diferenciais.map((x) => (
              <li key={x} className="border-b py-4 text-center text-lg sm:text-left">
                {x}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {/* Depoimentos em destaque: só os cadastrados pelo dono, sem nota nem estrelas */}
      {d.depoimentos.length > 0 && (
        <Secao id="depoimentos" titulo="Quem celebrou aqui" className="max-w-3xl">
          <ul className="space-y-14">
            {d.depoimentos.map((x) => (
              <li key={x.id}>
                <figure className="text-center">
                  <span
                    aria-hidden
                    className="font-titulo block text-6xl leading-none text-[var(--marca-destaque)]"
                  >
                    “
                  </span>
                  <blockquote className="font-titulo -mt-2 text-2xl leading-relaxed text-balance md:text-3xl">
                    {x.texto}
                  </blockquote>
                  <figcaption className="text-muted-foreground mt-5 text-xs tracking-[0.2em] uppercase">
                    {x.nome}
                    {x.tipoFesta && <span> · {x.tipoFesta}</span>}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {d.perguntas.length > 0 && (
        <Secao id="perguntas" titulo="Perguntas frequentes" className="max-w-3xl">
          <div className="border-t">
            {d.perguntas.map((p) => (
              <details key={p.pergunta} className="group border-b">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base [&::-webkit-details-marker]:hidden">
                  {p.pergunta}
                  <span
                    aria-hidden
                    className="text-muted-foreground text-xl leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none"
                  >
                    +
                  </span>
                </summary>
                <p className="text-muted-foreground pb-5 leading-relaxed whitespace-pre-line">
                  {p.resposta}
                </p>
              </details>
            ))}
          </div>
        </Secao>
      )}

      {d.local && d.linkMapa && (
        <Secao id="onde-fica" titulo="Onde fica" className="max-w-3xl">
          <div className="flex flex-col items-center gap-5 text-center">
            <p className="flex items-start gap-2 text-lg">
              <MapPin className="text-primary-texto mt-1 size-5 shrink-0" aria-hidden />
              {d.local}
            </p>
            <a
              href={d.linkMapa}
              target="_blank"
              rel="noopener noreferrer"
              className={BOTAO_SECUNDARIO}
            >
              Abrir no mapa
            </a>
          </div>
        </Secao>
      )}

      {d.orcamentoDisponivel && (
        <section
          className="entrada mx-auto max-w-3xl px-5 pt-8 pb-12 text-center md:pb-20"
          aria-labelledby="titulo-chamada"
        >
          <h2 id="titulo-chamada" className="font-titulo text-3xl font-bold md:text-4xl">
            Vamos planejar o seu evento?
          </h2>
          <p className="text-muted-foreground mt-3">
            Em poucos minutos você vê o valor e as datas livres.
          </p>
          <Link href={d.linkOrcamento} className={`${BOTAO_PRINCIPAL} mt-7 px-8`}>
            <CalendarDays className="size-5" aria-hidden />
            Montar meu orçamento
          </Link>
        </section>
      )}

      {/* Botão fixo e sóbrio no celular */}
      {d.orcamentoDisponivel && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/85 md:hidden">
          <div className="mx-auto flex max-w-2xl gap-2">
            <Link href={d.linkOrcamento} className={`${BOTAO_PRINCIPAL} flex-1`}>
              Montar meu orçamento
            </Link>
            {d.whatsapp && (
              <a
                href={d.whatsapp}
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
  );
}
