import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormOrcamento } from '@/components/app/orcamento/form-orcamento';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { formatPhoneBR } from '@/domain/phone';
import { numeroProposta } from '@/domain/proposta';
import { montarVitrine } from '@/domain/publico';
import { estadoDaVersao } from '@/domain/validacao/orcamento-interno';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarBaseInterna, carregarOrcamentoParaEditar } from '@/server/orcamentos/carregar';

export const metadata: Metadata = { title: 'Nova versão do orçamento' };

type Props = { params: Promise<{ id: string }> };

/** Nova versão: parte da versão vigente; a anterior vira "substituída" ao salvar. */
export default async function EditarOrcamentoPage({ params }: Props) {
  const { id } = await params;
  const usuario = await exigirSessao();
  const [base, o] = await Promise.all([
    carregarBaseInterna(usuario),
    carregarOrcamentoParaEditar(usuario, id),
  ]);
  if (!base || !o) notFound();
  const estado = estadoDaVersao(o.rascunho, o);

  return (
    <>
      <TituloPagina>Orçamento nº {numeroProposta(o.numero)} · nova versão</TituloPagina>
      <p className="text-muted-foreground -mt-4 mb-6 max-w-2xl text-sm">
        A versão {o.versao} continua guardada no lead. Ao salvar, o link antigo passa a mostrar esta
        nova versão.{' '}
        <Link
          href={`/app/leads/${o.cliente.leadId}`}
          className="text-primary-texto font-semibold underline-offset-2 hover:underline"
        >
          Voltar ao lead
        </Link>
      </p>
      <FormOrcamento
        vitrine={montarVitrine(base.ctx, {}, base.hoje)}
        fuso={usuario.empresa.fuso}
        limiteDescontoBp={base.limiteDescontoBp}
        ehDono={usuario.perfil === 'dono'}
        orcamento={{
          id: o.id,
          numero: o.numero,
          versao: o.versao,
          slot: {
            data: estado.escolhas.data,
            turnoId: estado.escolhas.turnoId,
            espacoId: estado.escolhas.espacoId,
          },
        }}
        clienteInicial={{
          whatsapp: formatPhoneBR(o.cliente.whatsapp),
          nome: o.cliente.nome,
          origem: o.cliente.origem,
        }}
        estadoInicial={estado}
        chaveRascunho={o.id}
      />
    </>
  );
}
