'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  COOKIE_CONSENTIMENTO,
  COOKIE_CONVERSAO,
  DIAS_CONSENTIMENTO,
  EVENTOS_CONVERSAO,
  algumPixel,
  lerConsentimento,
  lerConversao,
  type Consentimento,
  type IdsPixels,
} from '@/domain/marketing/pixels';

/*
 * Pixels da landing (§98): Google Analytics 4 e Pixel da Meta, só depois do "Aceitar" do aviso de
 * cookies. Os scripts entram pela própria página (o 'strict-dynamic' da CSP deixa passar o que um
 * script do site cria; nas estáticas, a CSP libera as origens dos pixels).
 */

type Fila = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: Fila;
    _fbq?: Fila;
  }
}

function lerCookie(nome: string): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${nome}=([^;]*)`));
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

function gravarCookie(nome: string, valor: string, segundos: number) {
  try {
    const seguro = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${nome}=${valor}; Max-Age=${segundos}; Path=/; SameSite=Lax${seguro}`;
  } catch {
    // sem cookie: o aviso volta na próxima visita
  }
}

function adicionarScript(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/** Carrega os pixels uma vez por página. pageView=false: só eventos (tela depois do cadastro). */
function carregarPixels(ids: IdsPixels, { pageView }: { pageView: boolean }) {
  if (ids.ga4 && !window.gtag) {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() {
      // o gtag.js lê o objeto arguments da fila, não um array
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', ids.ga4, { send_page_view: pageView });
    adicionarScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ga4)}`);
  }
  if (ids.metaPixel && !window.fbq) {
    const fila: Fila = function (...args: unknown[]) {
      if (fila.callMethod) fila.callMethod(...args);
      else fila.queue!.push(args);
    };
    fila.push = fila;
    fila.loaded = true;
    fila.version = '2.0';
    fila.queue = [];
    window.fbq = fila;
    window._fbq = window._fbq ?? fila;
    adicionarScript('https://connect.facebook.net/en_US/fbevents.js');
    // sem eventos automáticos (cliques e campos de formulário): só o que o site manda
    fila('set', 'autoConfig', false, ids.metaPixel);
    fila('init', ids.metaPixel);
    if (pageView) fila('track', 'PageView');
  }
}

/** PageView nas trocas de página feitas no navegador (a primeira já vai no carregamento). */
function registrarPageView(ids: IdsPixels) {
  if (ids.ga4) window.gtag?.('event', 'page_view', { page_location: window.location.href });
  if (ids.metaPixel) window.fbq?.('track', 'PageView');
}

/**
 * Aviso de cookies + pixels da landing, das páginas por tipo de buffet e do cadastro. Sem nenhum
 * id configurado, não desenha nada.
 */
export function Pixels({ ids }: { ids: IdsPixels }) {
  const ligado = algumPixel(ids);
  const pathname = usePathname();
  const [consentimento, setConsentimento] = useState<Consentimento | null | 'lendo'>('lendo');
  const carregado = useRef<string | null>(null);

  useEffect(() => {
    if (ligado) setConsentimento(lerConsentimento(lerCookie(COOKIE_CONSENTIMENTO)));
  }, [ligado]);

  useEffect(() => {
    if (consentimento !== 'aceito') return;
    if (carregado.current === null) {
      carregarPixels(ids, { pageView: true });
      carregado.current = pathname;
    } else if (carregado.current !== pathname) {
      carregado.current = pathname;
      registrarPageView(ids);
    }
  }, [consentimento, ids, pathname]);

  if (!ligado || consentimento !== null) return null;

  function escolher(c: Consentimento) {
    gravarCookie(COOKIE_CONSENTIMENTO, c, DIAS_CONSENTIMENTO * 86_400);
    setConsentimento(c);
  }

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="bg-card text-card-foreground fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border p-4 shadow-lg md:inset-x-auto md:right-4 md:left-4"
      data-testid="aviso-cookies"
    >
      <p className="text-sm">
        Usamos cookies do Google e da Meta para medir as visitas e os nossos anúncios. Você escolhe.{' '}
        <Link href="/privacidade" className="underline underline-offset-4">
          Privacidade
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => escolher('recusado')}
          className="hover:bg-accent min-h-11 flex-1 rounded-full border px-4 text-sm font-semibold"
        >
          Recusar
        </button>
        <button
          type="button"
          onClick={() => escolher('aceito')}
          className="bg-primary text-primary-foreground min-h-11 flex-1 rounded-full px-4 text-sm font-bold"
        >
          Aceitar
        </button>
      </div>
    </div>
  );
}

/** Rodapé: apaga a escolha e mostra o aviso de novo (revogar o consentimento a qualquer hora). */
export function PreferenciasCookies({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        gravarCookie(COOKIE_CONSENTIMENTO, '', 0);
        window.location.reload();
      }}
    >
      Preferências de cookies
    </button>
  );
}

/**
 * Primeira tela depois do cadastro: dispara a conversão uma vez (o cookie curto vem da server
 * action) e só se o visitante aceitou os cookies na landing. Sem PageView e sem dado pessoal.
 */
export function ConversaoCadastro({ ids }: { ids: IdsPixels }) {
  useEffect(() => {
    const conversao = lerConversao(lerCookie(COOKIE_CONVERSAO));
    if (!conversao) return;
    gravarCookie(COOKIE_CONVERSAO, '', 0);
    if (!algumPixel(ids) || lerConsentimento(lerCookie(COOKIE_CONSENTIMENTO)) !== 'aceito') return;
    carregarPixels(ids, { pageView: false });
    const evento = EVENTOS_CONVERSAO[conversao];
    if (ids.ga4) window.gtag?.('event', evento.ga4, { method: 'orkestra' });
    if (ids.metaPixel) window.fbq?.('track', evento.meta);
  }, [ids]);
  return null;
}
