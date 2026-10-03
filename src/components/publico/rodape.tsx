import Link from 'next/link';

/** Rodapé da página pública: o Orkestra aparece só aqui (limão sobre grafite). */
export function RodapePublico({ comEspaco = false }: { comEspaco?: boolean }) {
  return (
    <footer
      className={`text-muted-foreground mt-12 flex flex-col items-center gap-3 px-4 text-xs ${comEspaco ? 'pb-32 md:pb-10' : 'pb-8'}`}
    >
      <nav className="flex gap-4" aria-label="Documentos">
        <Link
          href="/privacidade"
          className="hover:text-foreground inline-flex min-h-6 items-center underline-offset-4 hover:underline"
        >
          Privacidade
        </Link>
        <Link
          href="/termos"
          className="hover:text-foreground inline-flex min-h-6 items-center underline-offset-4 hover:underline"
        >
          Termos de uso
        </Link>
      </nav>
      <p className="flex items-center gap-1.5">
        Feito com
        <span className="rounded-full bg-[#161616] px-2 py-0.5 font-bold text-[#3EE42E]">
          Orkestra
        </span>
      </p>
    </footer>
  );
}
