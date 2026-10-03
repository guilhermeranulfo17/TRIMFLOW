import { Download, Eye } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PropostaWeb, RodapeProposta } from '@/components/proposta/proposta-web';
import { estiloDaMarca } from '@/components/publico/marca';
import { exigirSessao } from '@/server/auth/sessao';
import { montarPropostaExemplo } from '@/server/proposta/exemplo';

export const metadata: Metadata = { title: 'Ver minha proposta' };

/** A proposta como o cliente vê, para uma festa de exemplo. Nada é gravado. */
export default async function PropostaExemploPage() {
  const usuario = await exigirSessao();
  const exemplo = await montarPropostaExemplo(usuario);

  if (!exemplo) {
    return (
      <p className="rounded-card text-muted-foreground border border-dashed px-4 py-6 text-center text-sm">
        Ainda não dá para montar uma proposta: cadastre ao menos um tipo de festa, um turno, um
        espaço e um pacote com preço em{' '}
        <Link
          href="/app/empresa/catalogo"
          className="text-primary-texto font-semibold hover:underline"
        >
          Catálogo
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Eye className="size-4 shrink-0" aria-hidden />
          Exemplo com o seu catálogo de hoje. Nenhum lead ou orçamento é criado.
        </p>
        <a
          href="/app/empresa/proposta-exemplo/pdf"
          className="rounded-control hover:bg-accent inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-semibold"
          data-testid="pdf-exemplo"
        >
          <Download className="size-4" aria-hidden />
          Baixar PDF de exemplo
        </a>
      </div>
      <div
        className="tema-claro bg-background rounded-card mx-auto max-w-2xl overflow-hidden border p-4 shadow-sm"
        style={estiloDaMarca(exemplo.buffet.corMarca)}
        data-tema="claro"
        data-testid="proposta-exemplo"
      >
        <PropostaWeb modelo={exemplo.modelo} />
        <RodapeProposta modelo={exemplo.modelo} />
      </div>
    </div>
  );
}
