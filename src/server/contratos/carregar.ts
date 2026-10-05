import 'server-only';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  MODELOS_PADRAO,
  lerOpcoes,
  lerResumo,
  numeroContrato,
  origemModelo,
  type FonteContrato,
  type OpcoesContrato,
  type ResumoContrato,
} from '@/domain/contratos';
import { hojeNoFuso } from '@/domain/dates';
import type { ConteudoCongelado } from '@/domain/proposta';
import type { ResultadoOrcamento } from '@/domain/preco';
import type { Segmento } from '@/domain/segmento';
import { urlPublicaMidia } from '@/lib/midia';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { comAnon as comAnonPadrao } from '@/server/db/anon';
import {
  contratoModelos,
  empresas,
  espacos,
  leads,
  orcamentoItens,
  orcamentos,
  pacotes,
  regrasComerciais,
  reservas,
  tiposEvento,
  turnos,
} from '@/server/db/schema';
import { naTransacao, type Tx } from '@/server/db/tenant';
import type { ComAnon } from '@/server/publico/carregar';

/*
 * Leituras do contrato (Etapa 10). Link do cliente: só pelas funções publico.* (comAnon), que
 * devolvem a mesma resposta para token inexistente, vencido ou cancelado. Painel: RLS do dono.
 */

// ---------------------------------------------------------------------------------------------
// Link do cliente
// ---------------------------------------------------------------------------------------------

export type ContratoPublico =
  | { estado: 'indisponivel' }
  | { estado: 'recusado'; buffet: string }
  | {
      estado: 'concluido';
      buffet: string;
      codigo: string;
      versao: number;
      titulo: string;
      concluidoEm: string;
      clienteNome: string | null;
      ehTeste: boolean;
    }
  | {
      estado: 'aberto';
      buffet: string;
      codigo: string;
      versao: number;
      titulo: string;
      texto: string;
      hash: string;
      resumo: ResumoContrato;
      exigeCodigo: boolean;
      emailMascarado: string | null;
      enviadoEm: string;
      expiraEm: string;
      ehTeste: boolean;
      fuso: string;
      buffetAssinatura: { nome: string; representa: string | null; assinadoEm: string };
    };

type Bruto = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === 'string' ? v : null);

export async function carregarContratoPublico(
  slug: string,
  token: string,
  comAnon: ComAnon = comAnonPadrao,
): Promise<ContratoPublico> {
  const [linha] = await comAnon((tx) =>
    tx.execute<{ c: Bruto }>(sql`select publico.contrato(${slug}, ${token}) as c`),
  );
  const c = linha?.c ?? { estado: 'indisponivel' };
  const codigo = numeroContrato(Number(c.ano), Number(c.numero));
  switch (c.estado) {
    case 'recusado':
      return { estado: 'recusado', buffet: String(c.buffet) };
    case 'concluido':
      return {
        estado: 'concluido',
        buffet: String(c.buffet),
        codigo,
        versao: Number(c.versao),
        titulo: String(c.titulo),
        concluidoEm: String(c.concluido_em),
        clienteNome: txt(c.cliente_nome),
        ehTeste: c.eh_teste === true,
      };
    case 'aberto': {
      const b = (c.buffet_assinatura ?? {}) as Bruto;
      return {
        estado: 'aberto',
        buffet: String(c.buffet),
        codigo,
        versao: Number(c.versao),
        titulo: String(c.titulo),
        texto: String(c.texto),
        hash: String(c.hash),
        resumo: lerResumo(c.valores),
        exigeCodigo: c.exige_codigo === true,
        emailMascarado: txt(c.email_mascarado),
        enviadoEm: String(c.enviado_em),
        expiraEm: String(c.expira_em),
        ehTeste: c.eh_teste === true,
        fuso: txt(c.fuso) ?? 'America/Sao_Paulo',
        buffetAssinatura: {
          nome: String(b.nome ?? ''),
          representa: txt(b.representa),
          assinadoEm: String(b.assinado_em ?? ''),
        },
      };
    }
    default:
      return { estado: 'indisponivel' };
  }
}

/** Abertura pelo cliente (o próprio usuário da empresa não conta). Nunca atrapalha a página. */
export async function registrarVisualizacao(
  slug: string,
  token: string,
  ehUsuarioEmpresa: boolean,
  ipHash: string,
  comAnon: ComAnon = comAnonPadrao,
): Promise<void> {
  try {
    await comAnon((tx) =>
      tx.execute(
        sql`select publico.contrato_visualizar(${slug}, ${token}, ${ehUsuarioEmpresa}, ${ipHash})`,
      ),
    );
  } catch {
    // rastreio nunca atrapalha o contrato
  }
}

// ---------------------------------------------------------------------------------------------
// Comprovante (PDF final): link do cliente e painel
// ---------------------------------------------------------------------------------------------

export type AssinaturaComprovante = {
  parte: 'buffet' | 'cliente';
  nome: string;
  representa: string | null;
  documento: string | null;
  assinadoEm: string;
  ip: string | null;
  metodo: 'aceite' | 'aceite_com_codigo';
  codigoVerificado: boolean;
  hashDocumento: string;
};

export type Comprovante = {
  id: string;
  empresaId: string;
  codigo: string;
  versao: number;
  titulo: string;
  texto: string;
  hash: string;
  enviadoEm: string;
  concluidoEm: string;
  ehTeste: boolean;
  pdfGeradoEm: string | null;
  fuso: string;
  assinaturas: AssinaturaComprovante[];
};

export function lerComprovante(c: Bruto): Comprovante {
  const assinaturas = ((c.assinaturas as Bruto[]) ?? []).map((a) => ({
    parte: a.parte as 'buffet' | 'cliente',
    nome: String(a.nome),
    representa: txt(a.representa),
    documento: txt(a.documento),
    assinadoEm: String(a.assinado_em),
    ip: txt(a.ip),
    metodo: a.metodo as 'aceite' | 'aceite_com_codigo',
    codigoVerificado: a.codigo_verificado === true,
    hashDocumento: String(a.hash_documento),
  }));
  return {
    id: String(c.id),
    empresaId: String(c.empresa_id),
    codigo: numeroContrato(Number(c.ano), Number(c.numero)),
    versao: Number(c.versao),
    titulo: String(c.titulo),
    texto: String(c.texto),
    hash: String(c.hash),
    enviadoEm: String(c.enviado_em),
    concluidoEm: String(c.concluido_em),
    ehTeste: c.eh_teste === true,
    pdfGeradoEm: txt(c.pdf_gerado_em),
    fuso: txt(c.fuso) ?? 'America/Sao_Paulo',
    assinaturas,
  };
}

/** null = não existe/não concluído; 'limite' = muitas tentativas por IP ou contrato. */
export async function carregarComprovantePublico(
  slug: string,
  token: string,
  ipHash: string,
  comAnon: ComAnon = comAnonPadrao,
): Promise<Comprovante | 'limite' | null> {
  const [linha] = await comAnon((tx) =>
    tx.execute<{ c: Bruto | null }>(
      sql`select publico.contrato_comprovante(${slug}, ${token}, ${ipHash}) as c`,
    ),
  );
  const c = linha?.c;
  if (!c) return null;
  if (c.limite === true) return 'limite';
  return lerComprovante(c);
}

// ---------------------------------------------------------------------------------------------
// Painel: de onde o contrato sai (orçamento aceito ou reserva) e o modelo a usar
// ---------------------------------------------------------------------------------------------

export type ModeloEscolhido = {
  id: string | null;
  origem: string;
  titulo: string;
  texto: string;
  opcoes: OpcoesContrato;
  segmento: Segmento;
};

export type OrigemContrato = {
  leadId: string;
  orcamentoId: string | null;
  reservaId: string | null;
  orcamentoNumero: number | null;
  clienteNome: string;
  clienteEmail: string | null;
  ehTeste: boolean;
  segmento: Segmento;
  fonte: FonteContrato;
};

/** Modelo ativo mais recente da empresa no segmento; sem cópia, o do sistema. */
export async function modeloParaContrato(
  tx: Tx,
  empresaId: string,
  segmento: Segmento,
  modeloId?: string | null,
): Promise<ModeloEscolhido> {
  const [m] = await tx
    .select()
    .from(contratoModelos)
    .where(
      and(
        eq(contratoModelos.empresaId, empresaId),
        eq(contratoModelos.ativo, true),
        modeloId ? eq(contratoModelos.id, modeloId) : eq(contratoModelos.segmento, segmento),
      ),
    )
    .orderBy(desc(contratoModelos.atualizadoEm))
    .limit(1);
  if (m) {
    return {
      id: m.id,
      origem: m.origem ?? `empresa@${m.versao}`,
      titulo: m.titulo,
      texto: m.texto,
      opcoes: lerOpcoes(m.opcoes),
      segmento: m.segmento,
    };
  }
  const p = MODELOS_PADRAO[segmento];
  return {
    id: null,
    origem: origemModelo(p),
    titulo: p.titulo,
    texto: p.texto,
    opcoes: p.opcoes,
    segmento,
  };
}

const TIPOS_INCLUSOS = ['pacote', 'opcional', 'hora_extra', 'avulso', 'deslocamento'] as const;

/**
 * Tudo o que o contrato precisa a partir de um orçamento (sempre a versão vigente do número):
 * lead, buffet, festa, valores e regras. RLS do dono. null se não existir ou não estiver
 * fechado (em montagem, sem resultado).
 */
export async function carregarOrigemDoOrcamento(
  usuario: UsuarioAtual,
  orcamentoId: string,
  tx?: Tx,
): Promise<OrigemContrato | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orcamentoId)) return null;
  return naTransacao(usuario.id, tx, async (t) => {
    const [pedido] = await t
      .select({ numero: orcamentos.numero, empresaId: orcamentos.empresaId })
      .from(orcamentos)
      .where(eq(orcamentos.id, orcamentoId))
      .limit(1);
    if (!pedido) return null;
    const [linha] = await t
      .select({
        o: orcamentos,
        lead: leads,
        empresa: empresas,
        regras: regrasComerciais,
        tipoEvento: tiposEvento.nome,
        turnoHora: turnos.horaInicio,
        espaco: espacos.nome,
        horaExtra: pacotes.valorHoraExtraCentavos,
      })
      .from(orcamentos)
      .innerJoin(leads, eq(leads.id, orcamentos.leadId))
      .innerJoin(empresas, eq(empresas.id, orcamentos.empresaId))
      .leftJoin(regrasComerciais, eq(regrasComerciais.empresaId, orcamentos.empresaId))
      .leftJoin(tiposEvento, eq(tiposEvento.id, orcamentos.tipoEventoId))
      .leftJoin(turnos, eq(turnos.id, orcamentos.turnoId))
      .leftJoin(espacos, eq(espacos.id, orcamentos.espacoId))
      .leftJoin(pacotes, eq(pacotes.id, orcamentos.pacoteId))
      .where(
        and(
          eq(orcamentos.empresaId, pedido.empresaId),
          eq(orcamentos.numero, pedido.numero),
          ne(orcamentos.status, 'substituido'),
          ne(orcamentos.status, 'em_montagem'),
        ),
      )
      .orderBy(desc(orcamentos.versao))
      .limit(1);
    if (!linha || !linha.o.resultado) return null;
    const { o, lead, empresa, regras } = linha;
    const [itens, reserva] = await Promise.all([
      t
        .select({
          tipo: orcamentoItens.tipo,
          descricao: orcamentoItens.descricao,
          quantidade: orcamentoItens.quantidade,
        })
        .from(orcamentoItens)
        .where(
          and(
            eq(orcamentoItens.orcamentoId, o.id),
            inArray(orcamentoItens.tipo, [...TIPOS_INCLUSOS]),
          ),
        )
        .orderBy(orcamentoItens.ordem),
      t
        .select({ id: reservas.id })
        .from(reservas)
        .where(and(eq(reservas.orcamentoId, o.id), eq(reservas.status, 'ativa')))
        .orderBy(desc(reservas.criadoEm))
        .limit(1),
    ]);
    const resultado = o.resultado as ResultadoOrcamento;
    const conteudo = (o.conteudo as ConteudoCongelado | null) ?? null;
    const horasExtras = itens
      .filter((i) => i.tipo === 'hora_extra')
      .reduce((n, i) => n + i.quantidade, 0);
    const duracao = conteudo?.pacote ? conteudo.pacote.duracaoInclusaMin + horasExtras * 60 : null;
    const listaItens = [
      ...itens.map((i) =>
        i.quantidade > 1 && i.tipo !== 'pacote' ? `${i.descricao} (${i.quantidade}x)` : i.descricao,
      ),
      ...(conteudo?.pacote?.secoes ?? []).map((s) => `${s.nome}: ${s.itens.join(', ')}`),
    ];
    const fonte: FonteContrato = {
      hoje: hojeNoFuso(empresa.fuso),
      cliente: {
        nome: lead.anonimizadoEm ? null : lead.nome,
        whatsappE164: lead.whatsappE164,
        email: lead.email,
      },
      buffet: {
        nome: empresa.nome,
        razaoSocial: empresa.razaoSocial,
        cnpj: empresa.cnpj,
        endereco: empresa.endereco,
        cidade: empresa.cidade,
        uf: empresa.uf,
        whatsappE164: empresa.whatsappE164,
      },
      festa: {
        tipoEvento: linha.tipoEvento,
        data: o.data,
        horaInicio: linha.turnoHora ? linha.turnoHora.slice(0, 5) : null,
        duracaoMin: duracao,
        espaco: conteudo?.espaco?.noLocalDoCliente
          ? (conteudo.espaco.localCliente ?? conteudo.espaco.nome)
          : (conteudo?.espaco?.nome ?? linha.espaco),
        convidados: o.convidados,
        pacote: conteudo?.pacote?.nome ?? null,
        itens: listaItens,
        naoIncluso: conteudo?.textos.naoIncluso ?? regras?.naoInclusoTexto ?? null,
      },
      valores: {
        totalCentavos: resultado.totalCentavos,
        sinalCentavos: resultado.sinalCentavos,
        saldoCentavos: resultado.saldoCentavos,
      },
      formasPagamento: conteudo?.textos.formasPagamento ?? regras?.formasPagamento ?? [],
      prazoSaldoDias: regras?.prazoUltimaParcelaDias ?? null,
      horaExtraCentavos: linha.horaExtra ?? null,
      alteracaoConvidados: conteudo?.textos.alteracaoConvidados ?? null,
      opcoes: MODELOS_PADRAO[empresa.segmento].opcoes,
    };
    return {
      leadId: lead.id,
      orcamentoId: o.id,
      reservaId: reserva[0]?.id ?? null,
      orcamentoNumero: o.numero,
      clienteNome: lead.nome,
      clienteEmail: lead.email,
      ehTeste: lead.ehTeste,
      segmento: empresa.segmento,
      fonte,
    };
  });
}

/** Identidade ao vivo do buffet para o PDF do painel (logo e cor). */
export async function identidadeDoBuffet(tx: Tx, empresaId: string) {
  const [e] = await tx
    .select({
      nome: empresas.nome,
      logoPath: empresas.logoPath,
      corMarca: empresas.corMarca,
      slug: empresas.slug,
    })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  return e ? { nome: e.nome, logoUrl: urlPublicaMidia(e.logoPath), corMarca: e.corMarca } : null;
}
