import { ArrowLeft, FileX2, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EditorModelo } from '@/components/app/contratos/editor-modelo';
import { EmptyState } from '@/components/app/empty-state';
import { PendenteLink } from '@/components/app/pendente-link';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { AVISO_MODELO } from '@/domain/contratos/modelos';
import { BLOCOS, VARIAVEIS } from '@/domain/contratos/variaveis';
import { SEGMENTOS, type Segmento } from '@/domain/segmento';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarModeloParaEditar } from '@/server/contratos/painel';

export const metadata: Metadata = { title: 'Modelo de contrato' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Editar um modelo do buffet, ou criar uma cópia do modelo do Orkestra (id "novo"). */
export default async function ModeloContratoPage({ params, searchParams }: Props) {
  const [{ id }, busca, dono] = await Promise.all([params, searchParams, exigirPerfil('dono')]);
  const segmento = (SEGMENTOS as readonly string[]).includes(String(busca.segmento))
    ? (busca.segmento as Segmento)
    : 'infantil';
  const modelo = await carregarModeloParaEditar(dono, id === 'novo' ? { segmento } : { id });

  const voltar = (
    <Link
      href="/app/contratos/modelos"
      className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Modelos
      <PendenteLink />
    </Link>
  );

  if (!modelo) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {voltar}
        <EmptyState icone={FileX2} titulo="Modelo não encontrado">
          Ele pode ter sido apagado. Volte para a lista de modelos.
        </EmptyState>
      </div>
    );
  }

  const variaveis = Object.entries(VARIAVEIS).map(([nome, d]) => ({
    nome,
    rotulo: (d as { rotulo: string }).rotulo,
  }));
  const blocos = Object.entries(BLOCOS).map(([nome, rotulo]) => ({ nome, rotulo }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {voltar}
      <TituloPagina>{modelo.id ? 'Editar modelo' : 'Novo modelo (cópia)'}</TituloPagina>
      <p
        role="note"
        className="rounded-card bg-alerta/10 text-alerta border-alerta/30 flex items-start gap-2 border p-3 text-sm font-semibold"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {AVISO_MODELO}
      </p>
      <EditorModelo modelo={modelo} variaveis={variaveis} blocos={blocos} />
    </div>
  );
}
