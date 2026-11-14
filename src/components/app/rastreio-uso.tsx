'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { areaDaRota } from '@/domain/uso/areas';

/**
 * Radar de uso (§92): a cada tela do painel aberta, conta 1 na área (sem nada pessoal). Envio em
 * segundo plano (keepalive), sem esperar nem mostrar erro.
 */
export function RastreioUso() {
  const caminho = usePathname();
  useEffect(() => {
    const area = areaDaRota(caminho);
    if (!area) return;
    fetch('/api/uso', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ area }),
      keepalive: true,
    }).catch(() => {});
  }, [caminho]);
  return null;
}
