import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

/** Topo dos editores de pacote/opcional: voltar ao catálogo, título e ações. */
export function CabecalhoEditor({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: string;
  subtitulo?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Link
        href="/app/empresa/catalogo"
        className="text-muted-foreground inline-flex min-h-11 items-center gap-1 text-sm hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Catálogo
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold break-words">{titulo}</h2>
          {subtitulo && <p className="text-muted-foreground text-sm">{subtitulo}</p>}
        </div>
        <div className="flex items-center gap-2">{acoes}</div>
      </div>
    </div>
  );
}
