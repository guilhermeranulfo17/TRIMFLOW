import Link from 'next/link';
import { Logo } from '@/components/app/logo';
import { PainelMarca } from '@/components/auth/painel-marca';

/**
 * Telas de acesso no escuro da marca ([data-acesso]). No PC (≥ 1024 px), metade com a promessa do
 * produto e metade com o formulário; no celular, só o formulário.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-dvh lg:grid lg:grid-cols-2" data-acesso>
      <PainelMarca />
      <main className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center">
        <Link href="/login" className="mb-6 lg:hidden" aria-label="Orkestra">
          <Logo />
        </Link>
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 w-full max-w-md motion-safe:duration-200">
          {children}
        </div>
        <p className="text-muted-foreground mt-8 text-sm">
          <Link href="/termos" className="hover:text-foreground underline-offset-4 hover:underline">
            Termos de uso
          </Link>
          {' · '}
          <Link
            href="/privacidade"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Privacidade
          </Link>
        </p>
      </main>
    </div>
  );
}
