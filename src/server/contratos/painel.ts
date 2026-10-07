import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  MODELOS_PADRAO,
  lerOpcoes,
  lerResumo,
  numeroContrato,
  origemModelo,
  type OpcoesContrato,
  type ResumoContrato,
  type StatusContrato,
} from '@/domain/contratos';
import {
  STATUS_DO_FILTRO,
  contagemPorFiltro,
  linhaDoTempoContrato,
  type FiltroContrato,
  type ItemLinhaDoTempo,
} from '@/domain/contratos/painel';
import { SEGMENTOS, type Segmento } from '@/domain/segmento';
import type { UsuarioAtual } from '@/server/auth/sessao';
import {
  auditoria,
  contratoAssinaturas,
  contratoModelos,
  contratos,
  leads,
  usuarios,
} from '@/server/db/schema';
import { naTransacao, type Tx } from '@/server/db/tenant';

/*
 * Leituras do painel de contratos (Etapa 10, PR 2): só o dono (RLS de contratos e da
 * auditoria). Status efetivo: enviado com o link vencido conta como "expirado" (como na página
 * do cliente), mesmo antes do job das 03:30.
 */

const statusEfetivoSql = sql<StatusContrato>`(case when ${contratos.status} = 'enviado'
  and ${contratos.expiraEm} <= now() then 'expirado' else ${contratos.status}::text end)`;

export type LinhaContrato = {
  id: string;
  codigo: string;
  versao: number;
  titulo: string;
  status: StatusContrato;
  leadId: string;
  clienteNome: string | null;
  resumo: ResumoContrato;
  enviadoEm: string | null;
  expiraEm: string | null;
  concluidoEm: string | null;
  visualizadoEm: string | null;
  ehTeste: boolean;
};

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

type Bruta = {
  id: string;
  ano: number;
  numero: number;
  versao: number;
  titulo: string;
  status: StatusContrato;
  leadId: string;
  clienteNome: string | null;
  anonimizado: Date | null;
  valores: unknown;
  enviadoEm: Date | null;
  expiraEm: Date | null;
  concluidoEm: Date | null;
  visualizadoEm: Date | null;
  ehTeste: boolean;
};

const colunasLinha = {
  id: contratos.id,
  ano: contratos.ano,
  numero: contratos.numero,
  versao: contratos.versao,
  titulo: contratos.titulo,
  status: statusEfetivoSql,
  leadId: contratos.leadId,
  clienteNome: leads.nome,
  anonimizado: leads.anonimizadoEm,
  valores: contratos.valores,
  enviadoEm: contratos.enviadoEm,
  expiraEm: contratos.expiraEm,
  concluidoEm: contratos.concluidoEm,
  visualizadoEm: contratos.visualizadoEm,
  ehTeste: contratos.ehTeste,
};

function linha(b: Bruta): LinhaContrato {
  return {
    id: b.id,
    codigo: numeroContrato(b.ano, b.numero),
    versao: b.versao,
    titulo: b.titulo,
    status: b.status,
    leadId: b.leadId,
    clienteNome: b.anonimizado ? null : b.clienteNome,
    resumo: lerResumo(b.valores),
    enviadoEm: iso(b.enviadoEm),
    expiraEm: iso(b.expiraEm),
    concluidoEm: iso(b.concluidoEm),
    visualizadoEm: iso(b.visualizadoEm),
    ehTeste: b.ehTeste,
  };
}

export type ListaContratos = {
  filtro: FiltroContrato;
  contratos: LinhaContrato[];
  contagem: Record<FiltroContrato, number>;
};

/** Os 200 mais recentes do filtro e a contagem de cada filtro (duas consultas em pipeline). */
export async function carregarListaContratos(
  usuario: UsuarioAtual,
  filtro: FiltroContrato,
  tx?: Tx,
): Promise<ListaContratos> {
  return naTransacao(usuario.id, tx, async (t) => {
    const status = STATUS_DO_FILTRO[filtro];
    const [lista, contagem] = await Promise.all([
      t
        .select(colunasLinha)
        .from(contratos)
        .innerJoin(leads, eq(leads.id, contratos.leadId))
        .where(
          and(
            eq(contratos.empresaId, usuario.empresa.id),
            status ? inArray(statusEfetivoSql, status) : undefined,
          ),
        )
        .orderBy(sql`${contratos.enviadoEm} desc nulls last`, desc(contratos.criadoEm))
        .limit(200),
      t
        .select({ status: statusEfetivoSql, n: sql<number>`count(*)::int` })
        .from(contratos)
        .where(eq(contratos.empresaId, usuario.empresa.id))
        .groupBy(statusEfetivoSql),
    ]);
    return {
      filtro,
      contratos: lista.map(linha),
      contagem: contagemPorFiltro(contagem.flatMap((c) => Array(c.n).fill(c.status))),
    };
  });
}

/** Contratos de um lead (detalhe do lead), mais recentes primeiro. */
export async function carregarContratosDoLead(
  usuario: UsuarioAtual,
  leadId: string,
  tx?: Tx,
): Promise<LinhaContrato[]> {
  if (usuario.perfil !== 'dono') return [];
  return naTransacao(usuario.id, tx, async (t) => {
    const r = await t
      .select(colunasLinha)
      .from(contratos)
      .innerJoin(leads, eq(leads.id, contratos.leadId))
      .where(and(eq(contratos.leadId, leadId), eq(contratos.empresaId, usuario.empresa.id)))
      .orderBy(desc(contratos.criadoEm))
      .limit(20);
    return r.map(linha);
  });
}

export type AssinaturaPainel = {
  parte: 'buffet' | 'cliente';
  nome: string;
  representa: string | null;
  documento: string | null;
  temCpf: boolean;
  assinadoEm: string;
  metodo: 'aceite' | 'aceite_com_codigo';
  codigoVerificado: boolean;
  confere: boolean;
};

export type DetalheContrato = LinhaContrato & {
  texto: string;
  hash: string;
  orcamentoId: string | null;
  reservaId: string | null;
  exigeCodigo: boolean;
  emailCliente: string | null;
  enviarCopiaEmail: boolean;
  copiaEmailEnviadaEm: string | null;
  recusaMotivo: string | null;
  recusadoEm: string | null;
  canceladoEm: string | null;
  cancelamentoMotivo: string | null;
  anonimizado: boolean;
  clienteWhatsapp: string | null;
  substitui: { id: string; codigo: string } | null;
  substituidoPor: { id: string; codigo: string } | null;
  assinaturas: AssinaturaPainel[];
  linhaDoTempo: ItemLinhaDoTempo[];
};

/** Tudo do detalhe numa ida (consultas em pipeline). null se não existir ou não for da empresa. */
export async function carregarDetalheContrato(
  usuario: UsuarioAtual,
  id: string,
  tx?: Tx,
): Promise<DetalheContrato | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return naTransacao(usuario.id, tx, async (t) => {
    const [base, assinaturas, eventos, ligados] = await Promise.all([
      t
        .select({
          ...colunasLinha,
          texto: contratos.texto,
          hash: contratos.hash,
          orcamentoId: contratos.orcamentoId,
          reservaId: contratos.reservaId,
          exigeCodigo: contratos.exigeCodigo,
          emailCliente: contratos.emailCliente,
          enviarCopiaEmail: contratos.enviarCopiaEmail,
          copiaEmailEnviadaEm: contratos.copiaEmailEnviadaEm,
          recusaMotivo: contratos.recusaMotivo,
          recusadoEm: contratos.recusadoEm,
          canceladoEm: contratos.canceladoEm,
          cancelamentoMotivo: contratos.cancelamentoMotivo,
          anonimizadoEm: contratos.anonimizadoEm,
          substituiId: contratos.substituiContratoId,
          clienteWhatsapp: leads.whatsappE164,
        })
        .from(contratos)
        .innerJoin(leads, eq(leads.id, contratos.leadId))
        .where(and(eq(contratos.id, id), eq(contratos.empresaId, usuario.empresa.id)))
        .limit(1),
      t
        .select()
        .from(contratoAssinaturas)
        .where(eq(contratoAssinaturas.contratoId, id))
        .orderBy(asc(contratoAssinaturas.assinadoEm)),
      t
        .select({
          acao: auditoria.acao,
          criadoEm: auditoria.criadoEm,
          dados: auditoria.dados,
          usuarioNome: usuarios.nome,
        })
        .from(auditoria)
        .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
        .where(and(eq(auditoria.entidadeId, id), eq(auditoria.entidade, 'contrato')))
        .orderBy(asc(auditoria.criadoEm))
        .limit(300),
      // o anterior (que este substitui) e o que substituiu este
      t
        .select({
          id: contratos.id,
          ano: contratos.ano,
          numero: contratos.numero,
          substitui: contratos.substituiContratoId,
        })
        .from(contratos)
        .where(
          and(
            eq(contratos.empresaId, usuario.empresa.id),
            sql`(${contratos.substituiContratoId} = ${id}::uuid or ${contratos.id} = (select c2.substitui_contrato_id from public.contratos c2 where c2.id = ${id}::uuid))`,
          ),
        ),
    ]);
    const b = base[0];
    if (!b) return null;
    const anterior = ligados.find((l) => l.id === b.substituiId);
    const seguinte = ligados.find((l) => l.substitui === id);
    return {
      ...linha(b),
      texto: b.texto,
      hash: b.hash,
      orcamentoId: b.orcamentoId,
      reservaId: b.reservaId,
      exigeCodigo: b.exigeCodigo,
      emailCliente: b.anonimizado ? null : b.emailCliente,
      enviarCopiaEmail: b.enviarCopiaEmail,
      copiaEmailEnviadaEm: iso(b.copiaEmailEnviadaEm),
      recusaMotivo: b.recusaMotivo,
      recusadoEm: iso(b.recusadoEm),
      canceladoEm: iso(b.canceladoEm),
      cancelamentoMotivo: b.cancelamentoMotivo,
      anonimizado: Boolean(b.anonimizadoEm),
      clienteWhatsapp: b.anonimizado ? null : b.clienteWhatsapp,
      substitui: anterior
        ? { id: anterior.id, codigo: numeroContrato(anterior.ano, anterior.numero) }
        : null,
      substituidoPor: seguinte
        ? { id: seguinte.id, codigo: numeroContrato(seguinte.ano, seguinte.numero) }
        : null,
      assinaturas: assinaturas.map((a) => ({
        parte: a.parte,
        nome: a.nome,
        representa: a.representa,
        documento: a.documentoMascarado,
        temCpf: a.parte === 'cliente' && Boolean(a.documentoCifrado),
        assinadoEm: new Date(a.assinadoEm).toISOString(),
        metodo: a.metodo,
        codigoVerificado: a.codigoVerificado,
        confere: a.hashDocumento === b.hash,
      })),
      linhaDoTempo: linhaDoTempoContrato(
        eventos.map((e) => ({
          acao: e.acao,
          criadoEm: new Date(e.criadoEm).toISOString(),
          usuarioNome: e.usuarioNome,
          // o motivo do cancelamento fica no contrato (a auditoria do PR 1 não o guarda)
          dados:
            e.acao === 'contrato.cancelado' && !e.dados.motivo && b.cancelamentoMotivo
              ? { ...e.dados, motivo: b.cancelamentoMotivo }
              : e.dados,
        })),
      ),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------------------------

export type ModeloLista = {
  id: string;
  titulo: string;
  segmento: Segmento;
  versao: number;
  ativo: boolean;
  origem: string | null;
  atualizadoEm: string;
};

export type ModeloDoSistema = { segmento: Segmento; titulo: string; origem: string };

export async function carregarModelos(
  usuario: UsuarioAtual,
  tx?: Tx,
): Promise<{ daEmpresa: ModeloLista[]; doSistema: ModeloDoSistema[] }> {
  return naTransacao(usuario.id, tx, async (t) => {
    const r = await t
      .select()
      .from(contratoModelos)
      .where(eq(contratoModelos.empresaId, usuario.empresa.id))
      .orderBy(desc(contratoModelos.ativo), desc(contratoModelos.atualizadoEm));
    return {
      daEmpresa: r.map((m) => ({
        id: m.id,
        titulo: m.titulo,
        segmento: m.segmento,
        versao: m.versao,
        ativo: m.ativo,
        origem: m.origem,
        atualizadoEm: new Date(m.atualizadoEm).toISOString(),
      })),
      doSistema: SEGMENTOS.map((s) => ({
        segmento: s,
        titulo: MODELOS_PADRAO[s].titulo,
        origem: origemModelo(MODELOS_PADRAO[s]),
      })),
    };
  });
}

export type ModeloEdicao = {
  id: string | null;
  titulo: string;
  segmento: Segmento;
  texto: string;
  origem: string | null;
  versao: number;
  ativo: boolean;
  opcoes: OpcoesContrato;
};

/** Um modelo da empresa para editar, ou uma cópia nova do modelo do sistema (id null). */
export async function carregarModeloParaEditar(
  usuario: UsuarioAtual,
  ref: { id: string } | { segmento: Segmento },
  tx?: Tx,
): Promise<ModeloEdicao | null> {
  if ('segmento' in ref) {
    const p = MODELOS_PADRAO[ref.segmento];
    return {
      id: null,
      titulo: p.titulo.replace(' (modelo Orkestra)', ''),
      segmento: ref.segmento,
      texto: p.texto,
      origem: origemModelo(p),
      versao: 1,
      ativo: true,
      opcoes: p.opcoes,
    };
  }
  if (!/^[0-9a-f-]{36}$/i.test(ref.id)) return null;
  return naTransacao(usuario.id, tx, async (t) => {
    const [m] = await t
      .select()
      .from(contratoModelos)
      .where(and(eq(contratoModelos.id, ref.id), eq(contratoModelos.empresaId, usuario.empresa.id)))
      .limit(1);
    return m
      ? {
          id: m.id,
          titulo: m.titulo,
          segmento: m.segmento,
          texto: m.texto,
          origem: m.origem,
          versao: m.versao,
          ativo: m.ativo,
          opcoes: lerOpcoes(m.opcoes),
        }
      : null;
  });
}
