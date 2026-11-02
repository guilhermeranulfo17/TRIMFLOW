'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/app/logo';
import { cn } from '@/lib/utils';
import { BotaoTeste } from './ctas';

export const ANCORAS = [
  { href: '#como-funciona', rotulo: 'Como funciona' },
  { href: '#recursos', rotulo: 'Recursos' },
  { href: '#planos', rotulo: 'Planos' },
  { href: '#duvidas', rotulo: 'Dúvidas' },
] as const;

/** Sessão do Supabase no navegador (só a presença do cookie, sem rede e sem ler o conteúdo). */
function temSessao(): boolean {
  try {
    return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie);
  } catch {
    return false;
  }
}

/**
 * Cabeçalho flutuante em pílula (transparente sobre o hero, vidro escuro depois de rolar) e, no celular, a barra
 * "Testar grátis" depois do hero. Dois marcadores no HTML e IntersectionObserver: nada de
 * listener de scroll.
 */
export function CascaLanding({ diasTeste }: { diasTeste: number }) {
  const [rolou, setRolou] = useState(false);
  const [passouHero, setPassouHero] = useState(false);
  const [logado, setLogado] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  // no celular, o menu fecha ao escolher uma seção (senão fica aberto por cima do conteúdo)
  const fecharMenu = () => menu.current?.removeAttribute('open');

  useEffect(() => {
    setLogado(temSessao());
    const topo = document.getElementById('marcador-topo');
    const fim = document.getElementById('marcador-fim-hero');
    // a "raiz" é tudo o que está acima do topo da tela: o marcador "cruza" ao sair por cima,
    // mesmo numa rolagem rápida que pula a área visível
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.target === topo) setRolou(e.isIntersecting);
          if (e.target === fim) setPassouHero(e.isIntersecting);
        }
      },
      { rootMargin: '100000px 0px -100% 0px' },
    );
    if (topo) obs.observe(topo);
    if (fim) obs.observe(fim);
    // fecha o menu com Esc ou com um toque fora dele
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !menu.current?.open) return;
      menu.current.removeAttribute('open');
      menu.current.querySelector('summary')?.focus();
    };
    const aoTocar = (e: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) {
        menu.current.removeAttribute('open');
      }
    };
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('pointerdown', aoTocar);
    return () => {
      obs.disconnect();
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('pointerdown', aoTocar);
    };
  }, []);

  return (
    <>
      <header
        className="text-foreground fixed inset-x-0 top-0 z-40 px-3 pt-3 md:pt-4"
        data-testid="cabecalho-landing"
        data-rolou={rolou}
      >
        <div
          className={cn(
            'mx-auto flex h-14 max-w-5xl items-center gap-3 rounded-full pr-2 pl-5 transition-[background-color,box-shadow,border-color] duration-300',
            rolou
              ? 'border border-white/10 bg-[#0c0c0c]/90 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl'
              : 'border border-transparent bg-transparent',
          )}
        >
          <Link href="/" aria-label="Orkestra, início" className="rounded-md">
            <Logo />
          </Link>
          <nav aria-label="Seções" className="ml-4 hidden items-center gap-0.5 lg:flex">
            {ANCORAS.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="text-muted-foreground hover:text-foreground rounded-full px-3.5 py-2 text-sm font-medium transition-colors hover:bg-white/5"
              >
                {a.rotulo}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {logado ? (
              <Link
                href="/app/leads"
                className="bg-primary text-primary-foreground inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold"
                data-testid="ir-para-painel"
              >
                Ir para o painel
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold hover:bg-white/5"
                >
                  Entrar
                </Link>
                <BotaoTeste tamanho="pequeno" className="hidden sm:inline-flex">
                  Testar grátis
                </BotaoTeste>
              </>
            )}
            <details ref={menu} className="relative lg:hidden" data-testid="menu-celular">
              <summary
                className="focus-visible:ring-ring/60 grid size-10 cursor-pointer list-none place-items-center rounded-full hover:bg-white/5 focus-visible:ring-[3px] focus-visible:outline-none [&::-webkit-details-marker]:hidden"
                aria-label="Menu de seções"
              >
                <Menu className="size-5" aria-hidden />
              </summary>
              <nav
                aria-label="Seções"
                className="bg-card rounded-card absolute top-12 right-0 flex w-60 flex-col border p-2 shadow-2xl"
              >
                {ANCORAS.map((a) => (
                  <a
                    key={a.href}
                    href={a.href}
                    onClick={fecharMenu}
                    className="hover:bg-accent rounded-control px-3 py-3 text-sm font-semibold"
                  >
                    {a.rotulo}
                  </a>
                ))}
                {!logado && (
                  <BotaoTeste tamanho="medio" className="mt-2 w-full sm:hidden">
                    Testar grátis
                  </BotaoTeste>
                )}
              </nav>
            </details>
          </div>
        </div>
      </header>

      {/* celular: depois do hero, o botão fica sempre à mão */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t p-3 transition-transform duration-200 sm:hidden',
          'bg-background/90 backdrop-blur-xl',
          passouHero && !logado ? 'translate-y-0' : 'pointer-events-none translate-y-full',
        )}
        // escondida: fora do foco e do leitor de tela (inert), não só invisível
        inert={!passouHero || logado}
        data-visivel={passouHero && !logado}
        data-testid="barra-teste-celular"
      >
        <BotaoTeste tamanho="medio" className="w-full">
          Testar {diasTeste} dias grátis
        </BotaoTeste>
      </div>
    </>
  );
}
