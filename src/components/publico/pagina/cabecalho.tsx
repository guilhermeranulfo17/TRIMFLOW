'use client';

import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BOTAO_PRINCIPAL } from '../marca';

type Props = {
  nome: string;
  logoUrl: string | null;
  linkOrcamento: string | null;
  /** deslocamento do topo (faixa do modo teste) */
  topo?: number;
};

/**
 * Cabeçalho fixo: transparente sobre o hero e com fundo depois que o topo sai da tela. Um
 * IntersectionObserver olha um marcador no topo (nada de listener de rolagem).
 */
export function CabecalhoPublico({ nome, logoUrl, linkOrcamento, topo = 0 }: Props) {
  const marcador = useRef<HTMLDivElement>(null);
  const [solido, setSolido] = useState(false);

  useEffect(() => {
    const alvo = marcador.current;
    if (!alvo || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([e]) => setSolido(!e!.isIntersecting));
    obs.observe(alvo);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <div ref={marcador} aria-hidden className="absolute inset-x-0 top-0 h-24" />
      <header
        style={{ top: topo }}
        data-solido={solido || undefined}
        className={`fixed inset-x-0 z-30 transition-colors duration-200 motion-reduce:transition-none ${
          solido ? 'border-b bg-white/95 backdrop-blur' : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-8">
          <span
            className={`flex min-w-0 items-center gap-2 transition-opacity motion-reduce:transition-none ${
              solido ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            aria-hidden={!solido}
          >
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- logo pequeno já em WEBP
              <img
                src={logoUrl}
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-full object-cover"
              />
            )}
            <span className="font-titulo truncate text-lg font-bold">{nome}</span>
          </span>
          {linkOrcamento && (
            <Link
              href={linkOrcamento}
              className={`${BOTAO_PRINCIPAL} ml-auto hidden min-h-11 px-4 text-sm transition-opacity md:inline-flex ${solido ? '' : 'pointer-events-none opacity-0'}`}
              tabIndex={solido ? 0 : -1}
              aria-hidden={!solido}
            >
              <CalendarDays className="size-4" aria-hidden />
              Montar meu orçamento
            </Link>
          )}
        </div>
      </header>
    </>
  );
}
