import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { slugValido } from '@/domain/slug';
import { buscarEmpresaPublicaPorSlug, buscarSlugAtualPorAntigo } from '@/server/db/admin';

type Props = { params: Promise<{ slug: string }> };

const buscar = cache(async (slug: string) =>
  slugValido(slug) ? buscarEmpresaPublicaPorSlug(slug) : null,
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const empresa = await buscar((await params).slug);
  return { title: empresa ? empresa.nome : 'Buffet não encontrado' };
}

/** Página pública do buffet. Placeholder: só o nome (nenhum outro dado é exposto). */
export default async function PaginaPublicaBuffet({ params }: Props) {
  const { slug } = await params;
  const empresa = await buscar(slug);
  if (!empresa) {
    // Link antigo ainda válido (troca de slug há menos de 12 meses): 308 para o atual.
    const atual = slugValido(slug) ? await buscarSlugAtualPorAntigo(slug) : null;
    if (atual) permanentRedirect(`/b/${atual}`);
    notFound();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight">{empresa.nome}</h1>
      <p className="text-muted-foreground mt-3 max-w-sm">
        Em breve você poderá montar o orçamento da sua festa aqui, em poucos minutos.
      </p>
      <footer className="text-muted-foreground mt-16 text-xs">
        feito com <span className="text-foreground font-bold">Orkestra</span>
      </footer>
    </main>
  );
}
