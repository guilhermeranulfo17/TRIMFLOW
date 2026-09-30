import { asc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AcoesItemCatalogo } from '@/components/app/empresa/acoes-item-catalogo';
import { CabecalhoEditor } from '@/components/app/empresa/cabecalho-editor';
import { LinkTestarPrecos } from '@/components/app/empresa/link-testar-precos';
import { idSchema } from '@/domain/validacao/comum';
import { duplicarOpcional, excluirOpcional } from '@/server/actions/empresa/opcionais';
import { exigirSessao } from '@/server/auth/sessao';
import {
  opcionais,
  opcionalPacotes,
  opcionalTiposEvento,
  pacotes,
  tiposEvento,
} from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { FormDadosOpcional } from '../form-dados-opcional';
import { FormVinculos } from './form-vinculos';

export const metadata: Metadata = { title: 'Editar opcional' };

type Props = { params: Promise<{ id: string }> };

export default async function EditarOpcionalPage({ params }: Props) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const usuario = await exigirSessao();
  const somenteLeitura = usuario.perfil !== 'dono';

  const dados = await comUsuario(usuario.id, async (tx) => {
    const [opcional] = await tx.select().from(opcionais).where(eq(opcionais.id, id));
    if (!opcional) return null;
    return {
      opcional,
      pacotes: await tx
        .select({ id: pacotes.id, nome: pacotes.nome })
        .from(pacotes)
        .orderBy(asc(pacotes.ordem), asc(pacotes.nome)),
      tipos: await tx
        .select({ id: tiposEvento.id, nome: tiposEvento.nome })
        .from(tiposEvento)
        .orderBy(asc(tiposEvento.ordem), asc(tiposEvento.nome)),
      vinculos: await tx
        .select({ pacoteId: opcionalPacotes.pacoteId, relacao: opcionalPacotes.relacao })
        .from(opcionalPacotes)
        .where(eq(opcionalPacotes.opcionalId, id)),
      tiposDoOpcional: await tx
        .select({ id: opcionalTiposEvento.tipoEventoId })
        .from(opcionalTiposEvento)
        .where(eq(opcionalTiposEvento.opcionalId, id)),
    };
  });
  if (!dados) notFound();
  const { opcional } = dados;

  return (
    <div className="space-y-6">
      <CabecalhoEditor
        titulo={opcional.nome}
        subtitulo={opcional.ativo ? 'Opcional ativo' : 'Opcional inativo (o cliente não vê)'}
        acoes={
          <>
            <LinkTestarPrecos />
            {!somenteLeitura && (
              <AcoesItemCatalogo
                id={opcional.id}
                nome={opcional.nome}
                nomeItem="opcional"
                onDuplicar={duplicarOpcional}
                onExcluir={excluirOpcional}
                hrefBase="/app/empresa/catalogo/opcionais"
              />
            )}
          </>
        }
      />
      <FormDadosOpcional
        opcionalId={opcional.id}
        somenteLeitura={somenteLeitura}
        inicial={{
          nome: opcional.nome,
          descricao: opcional.descricao ?? '',
          cobranca: opcional.cobranca,
          precoCentavos: opcional.precoCentavos,
          qtdMin: opcional.qtdMin,
          qtdMax: opcional.qtdMax,
          ativo: opcional.ativo,
        }}
      />
      <FormVinculos
        opcionalId={opcional.id}
        pacotes={dados.pacotes}
        tipos={dados.tipos}
        inicial={{
          pacotes: dados.vinculos,
          tipoEventoIds: dados.tiposDoOpcional.map((t) => t.id),
        }}
        somenteLeitura={somenteLeitura}
      />
    </div>
  );
}
