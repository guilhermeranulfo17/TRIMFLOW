import { aPartirDe, type ContextoPreco, type DataCivil, type Id } from '../preco';
import { valorDoPacote } from '../preco/pacote';
import type { ModoPreco } from './tipos';

export type ExtrasPacote = { descricao: string | null; fotos: string[] };

/**
 * O que o navegador recebe ANTES do WhatsApp. Nunca tabelas de preço (faixas, preço por
 * pessoa, fatores, ajustes). Preço só como "a partir de", conforme o modo:
 * - exato: "a partir de" geral e por pacote;
 * - faixa: só o "a partir de" geral;
 * - após contato: nenhum valor.
 */
export type VitrinePublica = {
  modoPreco: ModoPreco;
  aPartirDeCentavos: number | null;
  hoje: DataCivil;
  antecedenciaMinDias: number;
  tiposEvento: { id: Id; nome: string }[];
  espacos: { id: Id; nome: string; capacidadeMax: number; noLocalDoCliente: boolean }[];
  turnos: { id: Id; nome: string; horaInicio: string; duracaoMin: number; diasSemana: number[] }[];
  faixasIdade: { id: Id; rotulo: string; idadeMin: number; idadeMax: number | null }[];
  pacotes: {
    id: Id;
    nome: string;
    subtitulo: string | null;
    descricao: string | null;
    destaque: boolean;
    fotos: string[];
    minConvidados: number;
    maxConvidados: number | null;
    duracaoInclusaMin: number;
    secoes: { nome: string; itens: string[] }[];
    tiposEventoIds: Id[];
    aPartirDeCentavos: number | null;
  }[];
  opcionais: {
    id: Id;
    nome: string;
    descricao: string | null;
    cobranca: string;
    qtdMin: number;
    qtdMax: number | null;
  }[];
};

export function montarVitrine(
  ctx: ContextoPreco,
  extras: Record<Id, ExtrasPacote>,
  hoje: DataCivil,
): VitrinePublica {
  const modo = ctx.regras.modoExibicaoPreco;
  const tipos = ctx.tiposEvento.filter((t) => t.ativo);
  let minimo: number | null = null;
  if (modo !== 'apos_contato') {
    for (const t of tipos) {
      const v = aPartirDe(ctx, { tipoEventoId: t.id });
      if (v && (minimo === null || v.totalCentavos < minimo)) minimo = v.totalCentavos;
    }
  }
  return {
    modoPreco: modo,
    aPartirDeCentavos: minimo,
    hoje,
    antecedenciaMinDias: ctx.regras.antecedenciaMinDias,
    tiposEvento: tipos.map((t) => ({ id: t.id, nome: t.nome })),
    espacos: ctx.espacos
      .filter((e) => e.ativo)
      .map((e) => ({
        id: e.id,
        nome: e.nome,
        capacidadeMax: e.capacidadeMax,
        noLocalDoCliente: e.noLocalDoCliente,
      })),
    turnos: ctx.turnos
      .filter((t) => t.ativo)
      .map((t) => ({
        id: t.id,
        nome: t.nome,
        horaInicio: t.horaInicio,
        duracaoMin: t.duracaoMin,
        diasSemana: t.diasSemana,
      })),
    faixasIdade: ctx.faixasIdade
      .filter((f) => f.pacoteId === null)
      .sort((a, b) => a.ordem - b.ordem || a.idadeMin - b.idadeMin)
      .map((f) => ({ id: f.id, rotulo: f.rotulo, idadeMin: f.idadeMin, idadeMax: f.idadeMax })),
    pacotes: ctx.pacotes
      .filter((p) => p.ativo)
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        subtitulo: p.subtitulo,
        descricao: extras[p.id]?.descricao ?? null,
        destaque: p.destaque,
        fotos: extras[p.id]?.fotos ?? [],
        minConvidados: p.minConvidados,
        maxConvidados: p.maxConvidados,
        duracaoInclusaMin: p.duracaoInclusaMin,
        secoes: [...p.secoes]
          .sort((a, b) => a.ordem - b.ordem)
          .map((s) => ({ nome: s.nome, itens: s.itens })),
        tiposEventoIds: p.tiposEventoIds,
        aPartirDeCentavos:
          modo === 'exato' ? (valorDoPacote(p, p.minConvidados)?.subtotalCentavos ?? null) : null,
      })),
    opcionais: ctx.opcionais
      .filter((o) => o.ativo)
      .map((o) => ({
        id: o.id,
        nome: o.nome,
        descricao: o.descricao,
        cobranca: o.cobranca,
        qtdMin: o.qtdMin,
        qtdMax: o.qtdMax,
      })),
  };
}
