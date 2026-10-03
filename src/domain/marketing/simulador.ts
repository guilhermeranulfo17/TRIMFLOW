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
  return {
    contexto,
    hoje,
    data: proximoSabado(hoje),
    turnoId: turno.id,
    espacoId: espaco.id,
    tipos: contexto.tiposEvento.filter((t) => t.ativo).map((t) => ({ id: t.id, nome: t.nome })),
    pacotes: pacotes.map((p) => ({ id: p.id, nome: p.nome })),
    convidados: { min, max, inicial: Math.min(max, Math.max(min, 50)), passo: 5 },
  };
}

export type EscolhaSimulador = { tipoEventoId: string; pacoteId: string; convidados: number };

/** Orçamento do exemplo (convidados contam como adultos; canal público, sem desconto). */
export function simular(ex: ExemploSimulador, e: EscolhaSimulador): ResultadoOrcamento {
  const convidados = Math.min(
    ex.convidados.max,
    Math.max(ex.convidados.min, Math.round(e.convidados)),
  );
  return calcularOrcamento(ex.contexto, {
    canal: 'publico',
    hoje: ex.hoje,
    tipoEventoId: e.tipoEventoId,
    data: compararDatas(ex.data, ex.hoje) > 0 ? ex.data : proximoSabado(ex.hoje),
    turnoId: ex.turnoId,
    espacoId: ex.espacoId,
    adultos: convidados,
    criancas: [],
    pacoteId: e.pacoteId,
    opcionais: [],
    horasExtras: 0,
  });
}
