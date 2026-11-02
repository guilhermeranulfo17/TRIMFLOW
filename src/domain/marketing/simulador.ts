import { compararDatas, diaDaSemanaNumero, somarDias, type DataCivil } from '../dates';
import { calcularOrcamento } from '../preco/calcular';
import type { ContextoPreco, ResultadoOrcamento } from '../preco/tipos';

/*
 * Simulador da landing (Etapa 9.6): o visitante escolhe tipo de festa, convidados e pacote e vê o
 * valor na hora, calculado no navegador pelo MESMO motor do link público (calcularOrcamento),
 * sobre um catálogo de exemplo com preços fictícios. Nada vai ao servidor.
 *
 * Este módulo não importa domain/modelos (que traz o Zod): o servidor monta o exemplo com
 * contextoDoModelo e entrega o contexto pronto à ilha do cliente.
 */

export type OpcaoSimulador = { id: string; nome: string };

/** Faixa de idade cobrada em parte (ex.: 6 a 10 anos pagam 50%): a que o simulador mostra. */
export type FaixaCriancasSimulador = { id: string; rotulo: string; fatorBp: number };

/** Adicional de valor fixo, sem limite de tipo de festa (ex.: Mesa temática). */
export type AdicionalSimulador = { id: string; nome: string; precoCentavos: number };

export type ExemploSimulador = {
  contexto: ContextoPreco;
  hoje: DataCivil;
  /** sábado à tarde, ~1 mês à frente (mostra o ajuste de sábado do exemplo) */
  data: DataCivil;
  turnoId: string;
  espacoId: string;
  tipos: OpcaoSimulador[];
  pacotes: OpcaoSimulador[];
  convidados: { min: number; max: number; inicial: number; passo: number };
  /** null = o exemplo não tem faixa cobrada em parte */
  criancas: FaixaCriancasSimulador | null;
  /** adicionais de valor fixo, vendidos à parte em todos os pacotes do exemplo */
  adicionais: AdicionalSimulador[];
};

const SABADO = 6;

/** Primeiro sábado a partir de `hoje + dias`. */
export function proximoSabado(hoje: DataCivil, dias = 30): DataCivil {
  let d = somarDias(hoje, dias);
  while (diaDaSemanaNumero(d) !== SABADO) d = somarDias(d, 1);
  return d;
}

/** Monta o exemplo a partir de um contexto (o do modelo infantil, no servidor). */
export function montarExemploSimulador(contexto: ContextoPreco, hoje: DataCivil): ExemploSimulador {
  const espaco = contexto.espacos.find((e) => e.ativo) ?? contexto.espacos[0];
  const turno =
    contexto.turnos.find((t) => t.ativo && /tarde/i.test(t.nome)) ??
    contexto.turnos.find((t) => t.ativo) ??
    contexto.turnos[0];
  const pacotes = contexto.pacotes.filter((p) => p.ativo);
  if (!espaco || !turno || pacotes.length === 0) {
    throw new Error('Catálogo de exemplo incompleto para o simulador.');
  }
  const min = Math.max(...pacotes.map((p) => p.minConvidados ?? 1));
  const maxPacotes = Math.min(...pacotes.map((p) => p.maxConvidados ?? 500));
  const max = Math.min(maxPacotes, espaco.capacidadeMax ?? maxPacotes, 120);
  const faixa = contexto.faixasIdade
    .filter((f) => f.pacoteId === null && f.fatorBp > 0 && f.fatorBp < 10_000)
    .sort((a, b) => a.ordem - b.ordem)[0];
  const adicionais = contexto.opcionais
    .filter(
      (o) =>
        o.ativo &&
        o.cobranca === 'fixo' &&
        o.tiposEventoIds.length === 0 &&
        o.pacotesCompativeisIds.length === 0 &&
        o.pacotesInclusoIds.length === 0,
    )
    .sort((a, b) => a.ordem - b.ordem)
    .slice(0, 2)
    .map((o) => ({ id: o.id, nome: o.nome, precoCentavos: o.precoCentavos }));
  return {
    contexto,
    hoje,
    data: proximoSabado(hoje),
    turnoId: turno.id,
    espacoId: espaco.id,
    tipos: contexto.tiposEvento.filter((t) => t.ativo).map((t) => ({ id: t.id, nome: t.nome })),
    pacotes: pacotes.map((p) => ({ id: p.id, nome: p.nome })),
    convidados: { min, max, inicial: Math.min(max, Math.max(min, 50)), passo: 5 },
    criancas: faixa ? { id: faixa.id, rotulo: faixa.rotulo, fatorBp: faixa.fatorBp } : null,
    adicionais,
  };
}

export type EscolhaSimulador = {
  tipoEventoId: string;
  pacoteId: string;
  /** total de convidados (adultos + crianças da faixa) */
  convidados: number;
  /** quantos dos convidados são crianças da faixa do exemplo (0 se não houver faixa) */
  criancas?: number;
  /** ids dos adicionais marcados */
  adicionais?: string[];
};

/**
 * Maior número de crianças da faixa: até metade dos convidados, sem os convidados equivalentes
 * (adultos + crianças × fator) ficarem abaixo do mínimo dos pacotes.
 */
export function maxCriancas(ex: ExemploSimulador, convidados: number): number {
  if (!ex.criancas) return 0;
  const folga = Math.max(0, convidados - ex.convidados.min);
  const peloMinimo = Math.floor((folga * 10_000) / (10_000 - ex.criancas.fatorBp));
  return Math.max(0, Math.min(Math.floor(convidados / 2), peloMinimo));
}

/**
 * Orçamento do exemplo (canal público, sem desconto): convidados = adultos + crianças da faixa
 * cobrada em parte; adicionais só os do exemplo.
 */
export function simular(ex: ExemploSimulador, e: EscolhaSimulador): ResultadoOrcamento {
  const convidados = Math.min(
    ex.convidados.max,
    Math.max(ex.convidados.min, Math.round(e.convidados)),
  );
  const criancas = Math.min(maxCriancas(ex, convidados), Math.max(0, Math.round(e.criancas ?? 0)));
  const validos = new Set(ex.adicionais.map((a) => a.id));
  const adicionais = [...new Set(e.adicionais ?? [])].filter((id) => validos.has(id));
  return calcularOrcamento(ex.contexto, {
    canal: 'publico',
    hoje: ex.hoje,
    tipoEventoId: e.tipoEventoId,
    data: compararDatas(ex.data, ex.hoje) > 0 ? ex.data : proximoSabado(ex.hoje),
    turnoId: ex.turnoId,
    espacoId: ex.espacoId,
    adultos: convidados - criancas,
    criancas:
      ex.criancas && criancas > 0 ? [{ faixaIdadeId: ex.criancas.id, quantidade: criancas }] : [],
    pacoteId: e.pacoteId,
    opcionais: adicionais.map((opcionalId) => ({ opcionalId, quantidade: 1 })),
    horasExtras: 0,
  });
}
