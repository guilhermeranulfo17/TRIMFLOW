'use client';

import { useEffect } from 'react';
import {
  COOKIE_PROSPECCAO,
  DIAS_COOKIE_PROSPECCAO,
  idDoLead,
  PARAMETRO_PROSPECCAO,
  type EventoDemonstracao,
} from '@/domain/prospeccao';

/*
 * Rastreio para o CRM de prospecção (ARQUITETURA §81), lado do navegador. O link que a equipe
 * manda pelo WhatsApp leva ?r=<id do lead no CRM>. Aqui o r é guardado (cookie de 90 dias e
 * armazenamento local) para ligar a visita ao cadastro, e a landing avisa o servidor quando a
 * demonstração é aberta e quando a pessoa chega ao resultado. O navegador só conhece o r: o token
 * do CRM fica no servidor. Sem r, nada é enviado.
 */

function lerCookie(nome: string): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${nome}=([^;]*)`));
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

/** O r guardado neste aparelho (cookie ou armazenamento local); null se a pessoa veio sem link. */
export function lerR(): string | null {
  const doCookie = idDoLead(lerCookie(COOKIE_PROSPECCAO));
  if (doCookie) return doCookie;
  try {
    return idDoLead(localStorage.getItem(COOKIE_PROSPECCAO));
  } catch {
    return null;
  }
}

function guardarR(r: string) {
  try {
    const seguro = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_PROSPECCAO}=${r}; Max-Age=${DIAS_COOKIE_PROSPECCAO * 86_400}; Path=/; SameSite=Lax${seguro}`;
  } catch {
    // sem cookie: tenta só o armazenamento local
  }
  try {
    localStorage.setItem(COOKIE_PROSPECCAO, r);
  } catch {
    // modo privado: segue só com o cookie
  }
}

/** Uma vez por aba para cada evento e r (recarregar a página não repete o aviso). */
function jaAvisou(evento: EventoDemonstracao, r: string): boolean {
  const chave = `orkestra_r:${evento}:${r}`;
  try {
    if (sessionStorage.getItem(chave) === '1') return true;
    sessionStorage.setItem(chave, '1');
  } catch {
    // sem sessionStorage: avisa mesmo assim
  }
  return false;
}

/** Avisa o servidor (que avisa o CRM em segundo plano). Nunca atrapalha a página. */
export function avisarProspeccao(evento: EventoDemonstracao): void {
  try {
    const r = lerR();
    if (!r || jaAvisou(evento, r)) return;
    const corpo = new Blob([JSON.stringify({ evento, r })], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/prospeccao/evento', corpo)) {
      void fetch('/api/prospeccao/evento', { method: 'POST', body: corpo, keepalive: true });
    }
  } catch {
    // o rastreio é um extra: falhar aqui não muda nada para quem está na página
  }
}

/**
 * Guarda o r da URL (na landing e em /cadastro). Na landing (`demonstracao`), abrir a página com
 * o r também conta como "abriu a demonstração".
 */
export function CapturaProspeccao({ demonstracao = false }: { demonstracao?: boolean }) {
  useEffect(() => {
    let daUrl: string | null = null;
    try {
      daUrl = idDoLead(new URLSearchParams(window.location.search).get(PARAMETRO_PROSPECCAO));
    } catch {
      // URL estranha: segue sem r
    }
    if (!daUrl) return;
    guardarR(daUrl);
    if (demonstracao) avisarProspeccao('abriu_demo');
  }, [demonstracao]);
  return null;
}
