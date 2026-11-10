import { ArrowDown, BellRing, Check, Filter, Zap } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/app/logo';
import { BOTAO_LANDING, BotaoTeste } from './ctas';
import { LinkEntrar } from './entrar';

/*
 * Seções da landing (nov/2026), todas do servidor: topo, benefícios, preço, chamada final e
 * rodapé. Pouco texto: cada seção cabe numa tela de celular. A demonstração e o resultado são a
 * ilha do cliente (demonstracao.tsx).
 */

/** 1. Topo: uma frase, uma linha de apoio e um botão que leva à demonstração. */
export function Topo() {
  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="titulo-topo">
      <div
        aria-hidden
        className="ld-brilho pointer-events-none absolute -top-40 -right-40 -z-10 size-[34rem] rounded-full"
      />
      <div className="mx-auto flex min-h-[calc(100svh-1.75rem)] max-w-5xl flex-col px-5 pt-4 pb-12 md:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Orkestra, início" className="rounded-md">
            <Logo />
          </Link>
          <LinkEntrar />
        </div>
        <div className="flex flex-1 flex-col justify-center pt-10">
          <h1 id="titulo-topo" className="ld-titulo max-w-3xl text-[clamp(3rem,13.5vw,6.75rem)]">
            Seu cliente monta o orçamento{' '}
            <span className="ld-serif text-[1.1em] text-[var(--ld-limao)]">sozinho</span>.
          </h1>
          <p className="ld-subir mt-6 max-w-md text-lg text-white/70 md:text-xl">
            E o pedido chega pronto no seu WhatsApp.
          </p>
          <a
            href="#demonstracao"
            className={`${BOTAO_LANDING} ld-subir mt-9 w-full max-w-md [--i:1]`}
            data-testid="ir-para-demonstracao"
          >
            <span>Monte um orçamento como se fosse seu cliente</span>
            <ArrowDown className="size-5 shrink-0" aria-hidden />
          </a>
          <p className="ld-subir mt-4 text-sm text-white/50 [--i:2]">
            Leva 1 minuto. Sem cadastro.
          </p>
        </div>
      </div>
    </section>
  );
}

const BENEFICIOS = [
  { icone: Zap, texto: 'Seu cliente não espera.' },
  { icone: Filter, texto: 'Você não gasta tempo com curioso.' },
  { icone: BellRing, texto: 'Nenhum pedido fica sem retorno.' },
] as const;

/** 4. Três benefícios, uma linha cada. */
export function Beneficios() {
  return (
    <section
      className="ld-gelo rounded-t-[2rem] px-5 pt-20 pb-10 md:rounded-t-[3rem] md:pt-28"
      aria-labelledby="titulo-beneficios"
    >
      <h2 id="titulo-beneficios" className="sr-only">
        O que muda no seu buffet
      </h2>
      <ul className="mx-auto grid max-w-md gap-9 lg:max-w-5xl lg:grid-cols-3 lg:gap-10">
        {BENEFICIOS.map(({ icone: Icone, texto }) => (
          <li key={texto} className="flex items-center gap-5 lg:flex-col lg:items-start">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--ld-limao)] text-[#0a0a0a]">
              <Icone className="size-6" aria-hidden />
            </span>
            <p className="ld-titulo text-[1.7rem] leading-[1.05] md:text-4xl">{texto}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 5. Preço: um só. `preco` já formatado ("R$ 247"); null se a leitura do banco falhou. */
export function Preco({ preco, diasTeste }: { preco: string | null; diasTeste: number }) {
  return (
    <section
      id="preco"
      className="ld-gelo px-5 pt-10 pb-20 md:pb-28"
      aria-labelledby="titulo-preco"
    >
      <div className="mx-auto grid max-w-md gap-8 rounded-[2rem] bg-[var(--ld-limao)] p-8 text-[#0a0a0a] md:p-12 lg:max-w-5xl lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
        <div>
          <h2 id="titulo-preco" className="text-sm font-bold tracking-[0.14em] uppercase">
            Um preço só
          </h2>
          {preco ? (
            <p className="mt-4 flex flex-wrap items-baseline gap-x-3" data-testid="preco">
              <span className="ld-titulo text-[4.5rem] md:text-8xl">{preco}</span>
              <span className="ld-serif text-[2.5rem] md:text-6xl">por mês</span>
            </p>
          ) : (
            <p className="ld-titulo mt-4 text-5xl md:text-7xl" data-testid="preco-indisponivel">
              Comece grátis
            </p>
          )}
        </div>
        <ul className="space-y-3 text-lg font-semibold lg:pb-3 lg:text-xl">
          <li className="flex items-center gap-3">
            <Check className="size-5 shrink-0" aria-hidden />
            {diasTeste} dias grátis, sem cartão
          </li>
          <li className="flex items-center gap-3">
            <Check className="size-5 shrink-0" aria-hidden />
            Implantação assistida grátis
          </li>
        </ul>
      </div>
    </section>
  );
}

/** 6. Botão final: leva ao cadastro. */
export function ChamadaFinal({ diasTeste }: { diasTeste: number }) {
  return (
    <section className="px-5 py-24 md:py-32" aria-labelledby="titulo-final">
      <div className="mx-auto flex max-w-md flex-col items-start lg:max-w-5xl lg:items-center lg:text-center">
        <h2 id="titulo-final" className="ld-titulo text-[2.6rem] md:text-6xl">
          Agora com a <span className="ld-serif text-[1.1em] text-[var(--ld-limao)]">sua</span>{' '}
          marca.
        </h2>
        <BotaoTeste className="mt-9 w-full max-w-md">
          Quero isso com o nome do meu buffet
        </BotaoTeste>
        <p className="mt-4 text-sm text-white/50">{diasTeste} dias grátis, sem cartão.</p>
      </div>
    </section>
  );
}

export function Rodape() {
  const email = process.env.NEXT_PUBLIC_EMAIL_CONTATO || null;
  const razao = process.env.NEXT_PUBLIC_RAZAO_SOCIAL || null;
  const link = 'rounded-sm transition-colors hover:text-white';
  return (
    <footer className="border-t border-white/10 px-5 py-8 text-sm text-white/55">
      <div className="mx-auto flex max-w-md flex-col gap-4 lg:max-w-5xl lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/login" className={link}>
            Entrar
          </Link>
          <Link href="/termos" className={link}>
            Termos de uso
          </Link>
          <Link href="/privacidade" className={link}>
            Privacidade
          </Link>
          <Link href="/subprocessadores" className={link}>
            Subprocessadores
          </Link>
          {email && (
            <a href={`mailto:${email}`} className={link}>
              {email}
            </a>
          )}
        </nav>
        <p className="text-xs">
          © {new Date().getFullYear()} Orkestra{razao ? ` · ${razao}` : ''}
        </p>
      </div>
    </footer>
  );
}
