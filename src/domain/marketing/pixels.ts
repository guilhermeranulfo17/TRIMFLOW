/*
 * Pixels de anúncio e medição da landing (§98): Google Analytics 4 e Pixel da Meta. Ficam
 * desligados sem o id no ambiente e, ligados, só carregam depois que o visitante aceita os
 * cookies (LGPD). Nunca no painel: só na landing, nas páginas por tipo de buffet e no cadastro, e
 * a conversão do cadastro é um evento sem dado pessoal (nem e-mail, nem nome).
 */

export type IdsPixels = { ga4: string | null; metaPixel: string | null };

/** "G-XXXXXXX" do GA4 (fluxo da web). */
export function idGa4(v: string | null | undefined): string | null {
  const s = v?.trim().toUpperCase();
  return s && /^G-[A-Z0-9]{4,15}$/.test(s) ? s : null;
}

/** Id numérico do Pixel (conjunto de dados) da Meta. */
export function idPixelMeta(v: string | null | undefined): string | null {
  const s = v?.trim();
  return s && /^\d{8,20}$/.test(s) ? s : null;
}

export function idsDosPixels(env: Record<string, string | undefined>): IdsPixels {
  return {
    ga4: idGa4(env.NEXT_PUBLIC_GA4_ID),
    metaPixel: idPixelMeta(env.NEXT_PUBLIC_META_PIXEL_ID),
  };
}

export function algumPixel(ids: IdsPixels): boolean {
  return ids.ga4 !== null || ids.metaPixel !== null;
}

/** Origens que a CSP precisa liberar para os pixels ligados (guia de CSP do Google e da Meta). */
export function origensDosPixels(ids: IdsPixels): {
  script: string[];
  connect: string[];
  img: string[];
} {
  const script: string[] = [];
  const connect: string[] = [];
  const img: string[] = [];
  if (ids.ga4) {
    script.push('https://*.googletagmanager.com');
    connect.push(
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://*.googletagmanager.com',
    );
    img.push('https://*.google-analytics.com', 'https://*.googletagmanager.com');
  }
  if (ids.metaPixel) {
    script.push('https://connect.facebook.net');
    connect.push('https://www.facebook.com', 'https://connect.facebook.net');
    img.push('https://www.facebook.com');
  }
  return { script, connect, img };
}

/* Consentimento: cookie lido no navegador (a landing é estática). */

export const COOKIE_CONSENTIMENTO = 'orkestra_cookies';
export const DIAS_CONSENTIMENTO = 365;
export type Consentimento = 'aceito' | 'recusado';

export function lerConsentimento(valor: string | null | undefined): Consentimento | null {
  return valor === 'aceito' || valor === 'recusado' ? valor : null;
}

/*
 * Conversão do cadastro: a server action grava um cookie curto e a primeira tela depois do
 * cadastro dispara o evento uma vez (se o visitante aceitou os cookies) e apaga o cookie.
 */

export const COOKIE_CONVERSAO = 'orkestra_conversao';
export const SEGUNDOS_COOKIE_CONVERSAO = 600;
export type Conversao = 'cadastro';

export function lerConversao(valor: string | null | undefined): Conversao | null {
  return valor === 'cadastro' ? valor : null;
}

/** Nome do evento em cada ferramenta (eventos padrão: entram como conversão sem configurar nome). */
export const EVENTOS_CONVERSAO: Record<Conversao, { ga4: string; meta: string }> = {
  cadastro: { ga4: 'sign_up', meta: 'CompleteRegistration' },
};

/** Rotas onde os pixels podem carregar: a landing, as páginas por tipo de buffet e o cadastro. */
export function rotaComPixels(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/sistema-para-') ||
    pathname === '/cadastro' ||
    // só o evento da conversão do cadastro (sem PageView), na primeira tela depois dele
    pathname === '/app/comecar'
  );
}
