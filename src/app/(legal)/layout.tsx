import Link from 'next/link';

/** Documentos públicos (textos-modelo: precisam de revisão jurídica antes do uso comercial). */
export default function LayoutLegal({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <main className="mx-auto max-w-2xl px-4 py-10 text-base leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <p className="rounded-control border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          Texto-modelo. Precisa ser revisado por um advogado antes do uso comercial.
        </p>
        {children}
        <p className="text-muted-foreground mt-10 text-sm">
          <Link href="/privacidade" className="underline">
            Privacidade
          </Link>{' '}
          ·{' '}
          <Link href="/termos" className="underline">
            Termos de uso
          </Link>
        </p>
      </main>
    </div>
  );
}
