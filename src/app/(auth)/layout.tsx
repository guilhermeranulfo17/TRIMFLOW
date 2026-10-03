import Link from 'next/link';
import { Logo } from '@/components/app/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="bg-background text-foreground flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center"
      data-acesso
    >
      <Link href="/login" className="mb-6" aria-label="Orkestra">
        <Logo />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
