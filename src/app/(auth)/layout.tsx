import Link from 'next/link';
import { Logo } from '@/components/app/logo';
import { FundoAcesso } from '@/components/auth/fundo-acesso';

/**
 * Telas de acesso no escuro da marca ([data-acesso]): fundo animado e o formulário num cartão de
 * vidro no centro (o cartão ganha o vidro pelo CSS de [data-acesso] em globals.css).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground relative min-h-dvh" data-acesso>
      <FundoAcesso />
      <main className="relative flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
        <Link href="/" className="mb-8 rounded-md" aria-label="Orkestra, início">
          <Logo className="[&_svg]:h-5" />
        </Link>
        <div className="fa-entrar w-full max-w-md">{children}</div>
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
