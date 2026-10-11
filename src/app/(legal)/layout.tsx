import Link from 'next/link';

/** Documentos públicos (Termos, Privacidade e Subprocessadores; revisados pelo advogado). */
export default function LayoutLegal({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-dvh" data-orkestra-claro>
      <main className="mx-auto max-w-2xl px-4 py-10 text-base leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
        <p className="text-muted-foreground mt-10 text-sm">
          <Link href="/privacidade" className="underline">
            Privacidade
          </Link>{' '}
          ·{' '}
          <Link href="/termos" className="underline">
            Termos de uso
          </Link>{' '}
          ·{' '}
          <Link href="/subprocessadores" className="underline">
            Subprocessadores
          </Link>
        </p>
      </main>
    </div>
  );
}
