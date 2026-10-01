import Link from 'next/link';

/** Rodapé da página pública: o Orkestra aparece só aqui. */
export function RodapePublico({ comEspaco = false }: { comEspaco?: boolean }) {
  return (
    <footer
      className={`text-muted-foreground mt-12 flex flex-col items-center gap-2 px-4 text-xs ${comEspaco ? 'pb-32' : 'pb-8'}`}
    >
      <nav className="flex gap-4" aria-label="Documentos">
        <Link
          href="/privacidade"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          Privacidade
        </Link>
        <Link href="/termos" className="hover:text-foreground underline-offset-4 hover:underline">
          Termos de uso
        </Link>
      </nav>
      <p>
        feito com <span className="text-foreground font-bold">Orkestra</span>
      </p>
    </footer>
  );
}
