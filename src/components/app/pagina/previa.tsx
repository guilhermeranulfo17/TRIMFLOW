'use client';

import { Eye, Monitor, RotateCw, Smartphone, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type Contexto = { versao: number; atualizar: () => void };

const PreviaContexto = createContext<Contexto>({ versao: 0, atualizar: () => {} });

/** Toda seção do editor chama `atualizar()` depois de salvar: a prévia recarrega. */
export function usePrevia() {
  return useContext(PreviaContexto);
}

export function ProvedorPrevia({ children }: { children: React.ReactNode }) {
  const [versao, setVersao] = useState(0);
  const atualizar = useCallback(() => setVersao((v) => v + 1), []);
  return <PreviaContexto value={{ versao, atualizar }}>{children}</PreviaContexto>;
}

function Moldura({ slug, largura }: { slug: string; largura: 'celular' | 'pc' }) {
  const { versao } = usePrevia();
  return (
    <iframe
      key={versao}
      src={`/b/${slug}?previa=1&v=${versao}`}
      title="Prévia da página pública"
      className={
        largura === 'celular'
          ? 'mx-auto h-full w-[390px] max-w-full bg-white'
          : 'h-full w-full bg-white'
      }
      data-testid="previa-pagina"
    />
  );
}

/**
 * Prévia ao vivo: iframe da própria página em modo teste (o dono está logado), recarregado a
 * cada salvamento. No PC fica fixa à direita; no celular abre por um botão.
 */
export function PreviaPagina({ slug }: { slug: string }) {
  const [largura, setLargura] = useState<'celular' | 'pc'>('celular');
  const { atualizar } = usePrevia();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState(false);
  // só um iframe carregado por vez: o fixo no PC ou o do botão no celular
  const [pc, setPc] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const ler = () => setPc(mq.matches);
    ler();
    mq.addEventListener('change', ler);
    return () => mq.removeEventListener('change', ler);
  }, []);

  const controles = (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon-sm"
        variant={largura === 'celular' ? 'secondary' : 'ghost'}
        aria-pressed={largura === 'celular'}
        aria-label="Prévia no celular"
        onClick={() => setLargura('celular')}
      >
        <Smartphone aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={largura === 'pc' ? 'secondary' : 'ghost'}
        aria-pressed={largura === 'pc'}
        aria-label="Prévia no computador"
        onClick={() => setLargura('pc')}
      >
        <Monitor aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Recarregar prévia"
        onClick={atualizar}
      >
        <RotateCw aria-hidden />
      </Button>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block" aria-label="Prévia">
        <div className="bg-card rounded-card sticky top-20 flex h-[calc(100dvh-7rem)] flex-col overflow-hidden border">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <p className="text-sm font-semibold">Prévia</p>
            {controles}
          </div>
          <div className="bg-muted min-h-0 flex-1 overflow-hidden">
            {pc && <Moldura slug={slug} largura={largura} />}
          </div>
        </div>
      </aside>

      <div className="fixed right-4 bottom-20 z-30 lg:hidden">
        <Button
          type="button"
          className="shadow-lg"
          onClick={() => {
            setAberto(true);
            dialogo.current?.showModal();
          }}
        >
          <Eye aria-hidden /> Ver prévia
        </Button>
      </div>
      <dialog
        ref={dialogo}
        className="bg-background m-0 h-dvh max-h-none w-full max-w-none p-0 lg:hidden"
        aria-label="Prévia da página"
        onClose={() => setAberto(false)}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-semibold">Prévia</p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Fechar prévia"
              onClick={() => dialogo.current?.close()}
            >
              <X aria-hidden />
            </Button>
          </div>
          <div className="min-h-0 flex-1">{aberto && <Moldura slug={slug} largura="pc" />}</div>
        </div>
      </dialog>
    </>
  );
}
