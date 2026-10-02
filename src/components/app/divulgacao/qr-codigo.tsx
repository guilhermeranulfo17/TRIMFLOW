import { Download, FileText } from 'lucide-react';
import { qrSvg } from '@/server/divulgacao/qr';

/** Prévia do QR (SVG gerado no servidor) e os downloads em PNG e PDF de impressão. */
export function QrCodigo({ link }: { link: string }) {
  return (
    <div
      className="flex flex-col items-center gap-4 sm:flex-row sm:items-start"
      data-testid="qr-codigo"
    >
      <div
        className="w-44 shrink-0 overflow-hidden rounded-xl bg-white p-1 [&>svg]:h-auto [&>svg]:w-full"
        role="img"
        aria-label={`QR code que abre ${link}`}
        // SVG gerado por nós a partir do link (sem entrada do usuário além do slug validado)
        dangerouslySetInnerHTML={{ __html: qrSvg(link, 4) }}
      />
      <div className="flex w-full flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          Para cartaz, mesa da recepção e material impresso. Quem escaneia chega com a origem
          &ldquo;QR code&rdquo; em Números.
        </p>
        <a
          href="/app/empresa/link/qr?formato=png"
          download
          className="rounded-control hover:bg-accent inline-flex min-h-11 items-center gap-2 border px-3 text-sm font-semibold"
          data-testid="baixar-qr-png"
        >
          <Download className="size-4" aria-hidden /> Baixar PNG
        </a>
        <a
          href="/app/empresa/link/qr?formato=pdf"
          download
          className="rounded-control hover:bg-accent inline-flex min-h-11 items-center gap-2 border px-3 text-sm font-semibold"
          data-testid="baixar-qr-pdf"
        >
          <FileText className="size-4" aria-hidden /> Baixar PDF para imprimir (A4)
        </a>
      </div>
    </div>
  );
}
