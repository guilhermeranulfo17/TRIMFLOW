'use client';

import { useEffect } from 'react';
import {
  COOKIE_ORIGEM,
  DIAS_COOKIE_ORIGEM,
  lerOrigemDoCookie,
  mesclarOrigem,
  origemDaUrl,
  serializarOrigem,
} from '@/domain/marketing/origem';

function lerCookie(nome: string): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${nome}=([^;]*)`));
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

/**
 * Guarda os utm_ e o ref da URL num cookie de 30 dias (último toque com origem; nada pessoal). O
 * cadastro lê o cookie e grava em empresas.origem_cadastro. Vale na landing e em /cadastro.
 */
export function CapturaOrigem() {
  useEffect(() => {
    try {
      const nova = origemDaUrl(new URLSearchParams(window.location.search));
      const final = mesclarOrigem(lerOrigemDoCookie(lerCookie(COOKIE_ORIGEM)), nova);
      if (!nova || !final) return;
      const seguro = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${COOKIE_ORIGEM}=${serializarOrigem(final)}; Max-Age=${DIAS_COOKIE_ORIGEM * 86_400}; Path=/; SameSite=Lax${seguro}`;
    } catch {
      // sem cookie: o cadastro segue sem origem
    }
  }, []);
  return null;
}

function contar(evento: 'visita' | 'clicou_teste') {
  try {
    const corpo = new Blob([JSON.stringify({ evento })], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/landing/contar', corpo)) {
      void fetch('/api/landing/contar', { method: 'POST', body: corpo, keepalive: true });
    }
  } catch {
    // contagem é aproximada: falhar aqui não atrapalha a página
  }
}

/**
 * Contagem agregada da landing: uma visita por aba (sessionStorage) e cada clique em
 * "Testar grátis" ([data-cta-teste]). Sem cookie, IP ou identificação.
 */
export function RastreioLanding() {
  useEffect(() => {
    let jaContou = false;
    try {
      jaContou = sessionStorage.getItem('orkestra_landing_visita') === '1';
      sessionStorage.setItem('orkestra_landing_visita', '1');
    } catch {
      // sem sessionStorage: conta a visita mesmo assim
    }
    if (!jaContou) contar('visita');
    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target instanceof Element ? e.target.closest('[data-cta-teste]') : null;
      if (alvo) contar('clicou_teste');
    };
    document.addEventListener('click', aoClicar, { capture: true });
    return () => document.removeEventListener('click', aoClicar, { capture: true });
  }, []);
  return <CapturaOrigem />;
}
