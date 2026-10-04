import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { cn } from '@/lib/utils';

/** Número de vendas (só dígitos) ou null se a variável não estiver configurada. */
export function numeroVendas(): string | null {
  return process.env.NEXT_PUBLIC_WHATSAPP_VENDAS?.replace(/\D/g, '') || null;
}

export function linkWhatsappVendas(texto = 'Olá! Quero conhecer o Orkestra para o meu buffet.') {
  const n = numeroVendas();
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}

/** "Testar grátis": vai ao cadastro e conta o clique (data-cta-teste, ver RastreioLanding). */
export function BotaoTeste({
  children = 'Testar 14 dias grátis',
  className,
  tamanho = 'grande',
}: {
  children?: React.ReactNode;
  className?: string;
  tamanho?: 'grande' | 'medio' | 'pequeno';
}) {
  return (
    <Link
      href="/cadastro"
      data-cta-teste
      className={cn(
        'bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring/60 inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
        tamanho === 'grande' && 'min-h-13 px-7 text-base',
        tamanho === 'medio' && 'min-h-11 px-5 text-sm',
        tamanho === 'pequeno' && 'min-h-10 px-4 text-sm',
        className,
      )}
    >
      {children}
      {tamanho === 'grande' && <ArrowRight className="size-5" aria-hidden />}
    </Link>
  );
}

export function BotaoWhatsappVendas({
  className,
  children = 'Falar no WhatsApp',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const href = linkWhatsappVendas();
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'focus-visible:ring-ring/60 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors hover:bg-white/5 focus-visible:ring-[3px] focus-visible:outline-none',
        className,
      )}
    >
      <IconeWhatsApp className="size-5" />
      {children}
    </a>
  );
}
