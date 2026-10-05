import { FileX2, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { NovoContrato } from '@/components/app/contratos/novo-contrato';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { AVISO_MODELO, VARIAVEIS } from '@/domain/contratos';
import { exigirPerfil } from '@/server/auth/guards';
import { preparoSchema, prepararContrato } from '@/server/contratos/emitir';
import { comUsuario } from '@/server/db/tenant';

export const metadata: Metadata = { title: 'Gerar contrato' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Prévia do contrato a partir do orçamento aceito: texto preenchido, o que falta em destaque,
 * "exigir código por e-mail", validade e Enviar (o dono assina ao enviar).
 */
export default async function NovoContratoPage({ searchParams }: Props) {
  const busca = await searchParams;
  const dono = await exigirPerfil('dono');
  const entrada = preparoSchema.safeParse({ orcamentoId: busca.orcamento });
  const prep = entrada.success
    ? await comUsuario(dono.id, (tx) => prepararContrato(dono, entrada.data, tx))
    : null;

  if (!prep) {
    return (
      <>
        <TituloPagina>Gerar contrato</TituloPagina>
        <EmptyState icone={FileX2} titulo="Orçamento não encontrado">
          Abra o lead e use &quot;Gerar contrato&quot; em um orçamento pré-reservado.
        </EmptyState>
      </>
    );
  }

  const rotulos = Object.fromEntries(
    Object.entries(VARIAVEIS).map(([n, d]) => [n, (d as { rotulo: string }).rotulo]),
  );
  return (
    <>
      <TituloPagina>Gerar contrato</TituloPagina>
      <p
        role="note"
        className="rounded-card bg-alerta/10 text-alerta border-alerta/30 mb-4 flex items-start gap-2 border p-3 text-sm font-semibold"
        data-testid="aviso-modelo"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {AVISO_MODELO}
      </p>
      <NovoContrato
        orcamentoId={prep.origem.orcamentoId!}
        cliente={prep.origem.clienteNome}
        clienteTemEmail={Boolean(prep.origem.clienteEmail)}
        modeloTitulo={prep.modelo.titulo}
        texto={prep.preenchido.texto}
        completaveis={prep.completaveis}
        rotulos={rotulos}
        usoImagem={prep.modelo.opcoes.usoImagem}
      />
    </>
  );
}
