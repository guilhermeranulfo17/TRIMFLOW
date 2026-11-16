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
      {/* leva ao site do Orkestra (§98): o ref marca a origem de quem se cadastra pela vitrine */}
      <Link
        href="/?ref=vitrine"
        // nova aba: na prévia do editor (iframe) o site do Orkestra não abre dentro do quadro
        target="_blank"
        className="hover:text-foreground flex min-h-6 items-center gap-1.5"
        data-testid="feito-com-orkestra"
      >
        Feito com
        <span className="rounded-full bg-[#161616] px-2 py-0.5 font-bold text-[#B2F759]">
          Orkestra
        </span>
      </Link>
    </footer>
  );
}
