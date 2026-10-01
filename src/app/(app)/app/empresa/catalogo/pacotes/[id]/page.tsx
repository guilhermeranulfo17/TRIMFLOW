import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AcoesItemCatalogo } from '@/components/app/empresa/acoes-item-catalogo';
import { CabecalhoEditor } from '@/components/app/empresa/cabecalho-editor';
import { LinkTestarPrecos } from '@/components/app/empresa/link-testar-precos';
import { SecaoSelecao } from '@/components/app/empresa/secao-selecao';
import { resumirPrecoOpcional } from '@/domain/catalogo/resumo';
import { idSchema } from '@/domain/validacao/comum';
import {
  duplicarPacote,
  excluirPacote,
  salvarInclusosPacote,
  salvarTiposEventoPacote,
} from '@/server/actions/empresa/pacotes';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarEmUso } from '@/server/catalogo/em-uso';
import {
  faixasIdade,
  faixasPreco,
  opcionais,
  opcionalPacotes,
  pacotes,
  pacoteTiposEvento,
  secoesCardapio,
  tiposEvento,
} from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { FormDadosPacote } from '../form-dados-pacote';
import { FormCardapio } from './form-cardapio';
import { FormCriancas } from './form-criancas';
import { FormPrecoPacote } from './form-preco-pacote';
import { SecaoFotos } from './secao-fotos';

export const metadata: Metadata = { title: 'Editar pacote' };

type Props = { params: Promise<{ id: string }> };

const faixaIdadeParaForm = (f: typeof faixasIdade.$inferSelect) => ({
  rotulo: f.rotulo,
  idadeMin: f.idadeMin,
  idadeMax: f.idadeMax,
  fatorBp: f.fatorBp,
});

export default async function EditarPacotePage({ params }: Props) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const usuario = await exigirSessao();
  const somenteLeitura = usuario.perfil !== 'dono';
  const emUso = await carregarEmUso(usuario);

  const dados = await comUsuario(usuario.id, async (tx) => {
    const [pacote] = await tx.select().from(pacotes).where(eq(pacotes.id, id));
    if (!pacote) return null;
    return {
      pacote,
      faixas: await tx
        .select()
        .from(faixasPreco)
        .where(eq(faixasPreco.pacoteId, id))
        .orderBy(asc(faixasPreco.ateConvidados)),
      secoes: await tx
        .select()
        .from(secoesCardapio)
        .where(eq(secoesCardapio.pacoteId, id))
        .orderBy(asc(secoesCardapio.ordem)),
      idadesPacote: await tx
        .select()
        .from(faixasIdade)
        .where(eq(faixasIdade.pacoteId, id))
        .orderBy(asc(faixasIdade.idadeMin)),
      idadesEmpresa: await tx
        .select()
        .from(faixasIdade)
        .where(isNull(faixasIdade.pacoteId))
        .orderBy(asc(faixasIdade.idadeMin)),
      tipos: await tx
        .select()
        .from(tiposEvento)
        .orderBy(asc(tiposEvento.ordem), asc(tiposEvento.nome)),
      tiposDoPacote: await tx
        .select({ id: pacoteTiposEvento.tipoEventoId })
        .from(pacoteTiposEvento)
        .where(eq(pacoteTiposEvento.pacoteId, id)),
      opcionais: await tx
        .select()
        .from(opcionais)
        .orderBy(asc(opcionais.ordem), asc(opcionais.nome)),
      inclusos: await tx
        .select({ id: opcionalPacotes.opcionalId })
        .from(opcionalPacotes)
        .where(and(eq(opcionalPacotes.pacoteId, id), eq(opcionalPacotes.relacao, 'incluso'))),
    };
  });
  if (!dados) notFound();
  const { pacote } = dados;
  const semPreco = pacote.modeloPreco === 'por_faixa' && dados.faixas.length === 0;

  return (
    <div className="space-y-6">
      <CabecalhoEditor
        titulo={pacote.nome}
        subtitulo={pacote.ativo ? 'Pacote ativo' : 'Pacote inativo (o cliente não vê)'}
        acoes={
          <>
            {!somenteLeitura && <LinkTestarPrecos />}
            {!somenteLeitura && (
              <AcoesItemCatalogo
                id={pacote.id}
                nome={pacote.nome}
                nomeItem="pacote"
                onDuplicar={duplicarPacote}
                onExcluir={excluirPacote}
                hrefBase="/app/empresa/catalogo/pacotes"
                emUso={emUso.pacotes.includes(id)}
              />
            )}
          </>
        }
      />
      {semPreco && (
        <p
          role="status"
          className="rounded-card border-destructive/40 bg-destructive/5 text-destructive border px-4 py-3 text-sm"
        >
          Este pacote ainda não tem preço. Defina o preço abaixo para ele poder ser vendido.
        </p>
      )}
      <FormDadosPacote
        pacoteId={pacote.id}
        somenteLeitura={somenteLeitura}
        inicial={{
          nome: pacote.nome,
          subtitulo: pacote.subtitulo ?? '',
          descricao: pacote.descricao ?? '',
          destaque: pacote.destaque,
          ativo: pacote.ativo,
        }}
      />
      <FormPrecoPacote
        pacoteId={pacote.id}
        somenteLeitura={somenteLeitura}
        inicial={{
          modeloPreco: semPreco ? 'por_pessoa' : pacote.modeloPreco,
          precoPessoaCentavos: pacote.precoPessoaCentavos,
          valorExcedenteCentavos: semPreco ? null : pacote.valorExcedenteCentavos,
          faixas: dados.faixas.map((f) => ({
            ateConvidados: f.ateConvidados,
            valorCentavos: f.valorCentavos,
          })),
          minConvidados: pacote.minConvidados,
          maxConvidados: pacote.maxConvidados,
          duracaoInclusaMin: pacote.duracaoInclusaMin,
          valorHoraExtraCentavos: pacote.valorHoraExtraCentavos,
        }}
      />
      <SecaoSelecao
        id="tipos"
        titulo="Tipos de festa"
        descricao="Nenhum marcado = o pacote vale para todos os tipos de festa."
        opcoes={dados.tipos.map((t) => ({
          id: t.id,
          rotulo: t.ativo ? t.nome : `${t.nome} (inativo)`,
        }))}
        selecionados={dados.tiposDoPacote.map((t) => t.id)}
        vazio="Cadastre tipos de festa no Catálogo para limitar este pacote."
        somenteLeitura={somenteLeitura}
        onSalvar={salvarTiposEventoPacote.bind(null, pacote.id)}
      />
      <SecaoFotos
        pacoteId={pacote.id}
        empresaId={usuario.empresa.id}
        fotos={pacote.fotos}
        somenteLeitura={somenteLeitura}
      />
      <FormCardapio
        pacoteId={pacote.id}
        somenteLeitura={somenteLeitura}
        inicial={{ secoes: dados.secoes.map((s) => ({ nome: s.nome, itens: s.itens })) }}
      />
      <FormCriancas
        pacoteId={pacote.id}
        somenteLeitura={somenteLeitura}
        inicial={{
          propria: dados.idadesPacote.length > 0,
          faixas: dados.idadesPacote.map(faixaIdadeParaForm),
        }}
        faixasEmpresa={dados.idadesEmpresa.map(faixaIdadeParaForm)}
      />
      <SecaoSelecao
        id="inclusos"
        titulo="Opcionais inclusos"
        descricao="Já vêm no pacote, sem custo extra. O cliente não pode comprá-los de novo."
        opcoes={dados.opcionais.map((o) => ({
          id: o.id,
          rotulo: o.ativo ? o.nome : `${o.nome} (inativo)`,
          dica: resumirPrecoOpcional(o),
        }))}
        selecionados={dados.inclusos.map((o) => o.id)}
        vazio="Nenhum opcional cadastrado ainda."
        somenteLeitura={somenteLeitura}
        onSalvar={salvarInclusosPacote.bind(null, pacote.id)}
      />
    </div>
  );
}
