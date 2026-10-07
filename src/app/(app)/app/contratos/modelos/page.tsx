import { ArrowLeft, Copy, FileText, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AlternarModelo } from '@/components/app/contratos/editor-modelo';
import { PendenteLink } from '@/components/app/pendente-link';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { AVISO_MODELO } from '@/domain/contratos/modelos';
import { formatData } from '@/domain/dates';
import { ROTULO_SEGMENTO } from '@/domain/segmento';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarModelos } from '@/server/contratos/painel';

export const metadata: Metadata = { title: 'Modelos de contrato' };

/**
 * Modelos de contrato: os do Orkestra (sugestões, não mudam) e as cópias do buffet (editáveis).
 * O contrato novo usa a cópia ligada mais recente do segmento; sem cópia, o do Orkestra.
 */
export default async function ModelosContratoPage() {
  const dono = await exigirPerfil('dono');
  const { daEmpresa, doSistema } = await carregarModelos(dono);
  const fuso = dono.empresa.fuso;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        href="/app/contratos"
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Contratos
        <PendenteLink />
      </Link>
      <TituloPagina>Modelos de contrato</TituloPagina>
      <p
        role="note"
        className="rounded-card bg-alerta/10 text-alerta border-alerta/30 flex items-start gap-2 border p-3 text-sm font-semibold"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {AVISO_MODELO}
      </p>

      <section className="bg-card rounded-card border p-4" aria-labelledby="titulo-meus">
        <h2 id="titulo-meus" className="font-bold">
          Do seu buffet
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          O contrato novo usa o modelo ligado mais recente do tipo de festa do seu buffet.
        </p>
        {daEmpresa.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm" data-testid="sem-modelos">
            Nenhuma cópia ainda: os contratos usam o modelo do Orkestra. Faça uma cópia abaixo para
            mudar o texto ou as multas.
          </p>
        ) : (
          <ul className="mt-3 divide-y" data-testid="modelos-empresa">
            {daEmpresa.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link
                  href={`/app/contratos/modelos/${m.id}`}
                  className="min-w-0 flex-1 hover:underline"
                >
                  <span className="block font-semibold break-words">{m.titulo}</span>
                  <span className="text-muted-foreground block text-sm">
                    {ROTULO_SEGMENTO[m.segmento]} · versão {m.versao} · alterado em{' '}
                    {formatData(m.atualizadoEm, fuso)}
                  </span>
                </Link>
                <AlternarModelo id={m.id} ativo={m.ativo} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card rounded-card border p-4" aria-labelledby="titulo-orkestra">
        <h2 id="titulo-orkestra" className="font-bold">
          Do Orkestra
        </h2>
        <ul className="mt-3 divide-y">
          {doSistema.map((m) => (
            <li key={m.segmento} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold">{m.titulo}</span>
                  <span className="text-muted-foreground block text-sm">
                    {ROTULO_SEGMENTO[m.segmento]}
                  </span>
                </span>
              </span>
              <Link
                href={`/app/contratos/modelos/novo?segmento=${m.segmento}`}
                className="rounded-control hover:bg-accent inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-semibold"
                data-testid={`copiar-modelo-${m.segmento}`}
              >
                <Copy className="size-4" aria-hidden />
                Fazer uma cópia
                <PendenteLink />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
