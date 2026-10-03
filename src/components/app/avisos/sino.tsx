'use client';

import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { listarAvisosSino, marcarAvisosLidos } from '@/server/actions/avisos';
import type { AvisoVista } from '@/server/avisos/carregar';

const INTERVALO_MS = 20_000;

/**
 * Sino da central de avisos: contador (consulta a cada 20 s e ao voltar para a aba), lista
 * com os não lidos primeiro, "marcar todos como lidos"; cada item abre o lead.
 */
export function SinoAvisos({ inicial }: { inicial: number }) {
  const router = useRouter();
  const [naoLidos, setNaoLidos] = useState(inicial);
  const [itens, setItens] = useState<AvisoVista[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [carregando, iniciar] = useTransition();

  const atualizar = useCallback(async () => {
    try {
      const r = await fetch('/api/avisos/contagem', { cache: 'no-store' });
      if (r.ok) setNaoLidos(((await r.json()) as { naoLidos: number }).naoLidos);
    } catch {
      // sem rede: tenta de novo no próximo ciclo
    }
  }, []);

  useEffect(() => setNaoLidos(inicial), [inicial]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void atualizar();
    }, INTERVALO_MS);
    const aoVoltar = () => document.visibilityState === 'visible' && void atualizar();
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [atualizar]);

  function abrir(v: boolean) {
    setAberto(v);
    if (v) {
      iniciar(async () => {
        const r = await listarAvisosSino();
        if (r.ok) setItens(r.dados ?? []);
      });
    }
  }

  function marcarTodos() {
    // otimista: zera na hora; se o servidor falhar, volta como estava
    const antes = { naoLidos, itens };
    setNaoLidos(0);
    setItens((xs) => xs?.map((x) => ({ ...x, lido: true })) ?? null);
    iniciar(async () => {
      const r = await marcarAvisosLidos(null);
      if (!r.ok) {
        setNaoLidos(antes.naoLidos);
        setItens(antes.itens);
        return;
      }
      router.refresh();
    });
  }

  function abrirAviso(a: AvisoVista) {
    setAberto(false);
    if (!a.lido) {
      setNaoLidos((n) => Math.max(0, n - 1));
      void marcarAvisosLidos([a.id]);
    }
  }

  return (
    <DropdownMenu open={aberto} onOpenChange={abrir}>
      <DropdownMenuTrigger
        className="hover:bg-accent focus-visible:ring-ring/50 relative grid size-11 place-items-center rounded-full outline-none focus-visible:ring-[3px]"
        aria-label={naoLidos > 0 ? `Avisos: ${naoLidos} não lidos` : 'Avisos'}
        data-testid="sino"
      >
        <Bell className="size-5" aria-hidden />
        {naoLidos > 0 && (
          <span
            className="bg-primary text-primary-foreground absolute top-1 right-1 grid min-w-5 place-items-center rounded-full px-1 text-[11px] leading-5 font-bold"
            data-testid="contador-avisos"
          >
            {naoLidos > 99 ? '99+' : naoLidos}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="font-semibold">Avisos</p>
          <button
            type="button"
            onClick={marcarTodos}
            disabled={naoLidos === 0 || carregando}
            className="text-primary inline-flex min-h-11 items-center gap-1 text-sm font-semibold disabled:opacity-40"
          >
            <CheckCheck className="size-4" aria-hidden />
            Marcar todos como lidos
          </button>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto" data-testid="lista-avisos">
          {itens === null ? (
            <p className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando…
            </p>
          ) : itens.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">
              Nenhum aviso por enquanto. Você é avisado quando houver algo a fazer.
            </p>
          ) : (
            <ul className="divide-y">
              {itens.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.caminho}
                    onClick={() => abrirAviso(a)}
                    className={cn('hover:bg-accent block px-3 py-2.5', !a.lido && 'bg-primary/5')}
                    data-testid="item-aviso"
                  >
                    <span className="flex items-start gap-2">
                      {!a.lido && (
                        <span
                          className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                          aria-label="Não lido"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{a.titulo}</span>
                        <span className="text-muted-foreground block text-sm">{a.corpo}</span>
                        <span className="text-muted-foreground block text-xs">{a.quando}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          href="/app/avisos"
          onClick={() => setAberto(false)}
          className="text-primary block border-t px-3 py-3 text-center text-sm font-semibold"
        >
          Ver todos os avisos
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
