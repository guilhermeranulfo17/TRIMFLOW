import type { Segmento } from '../segmento';
import type { ContextoPreco } from '../preco';
import { modeloDomicilio } from './domicilio';
import { modeloEventos } from './eventos';
import { modeloInfantil } from './infantil';
import { modeloSchema, type Modelo } from './schema';

export { modeloSchema, REGRAS_EXEMPLO, type Modelo, type RegrasModelo } from './schema';

export const MODELOS: Record<Segmento, Modelo> = {
  infantil: modeloInfantil,
  eventos: modeloEventos,
  domicilio: modeloDomicilio,
};

/** Modelo do segmento, validado (lança erro se o modelo estiver inconsistente). */
export function modeloDoSegmento(segmento: Segmento): Modelo {
  return modeloSchema.parse(MODELOS[segmento]);
}

/** Ids sintéticos e estáveis para usar um modelo direto no motor (testes e pré-visualização). */
export const idDoModelo = {
  tipoEvento: (chave: string) => `tipo:${chave}`,
  espaco: (chave: string) => `espaco:${chave}`,
  turno: (chave: string) => `turno:${chave}`,
  pacote: (chave: string) => `pacote:${chave}`,
  opcional: (chave: string) => `opcional:${chave}`,
  faixaIdade: (indice: number) => `faixa-idade:${indice}`,
};

/** Converte um modelo em ContextoPreco, sem banco. */
export function contextoDoModelo(modelo: Modelo): ContextoPreco {
  const r = modelo.regras;
  return {
    regras: {
      validadeDias: r.validadeDias,
      antecedenciaMinDias: r.antecedenciaMinDias,
      sinalBp: r.sinalBp,
      parcelasMax: r.parcelasMax,
      prazoUltimaParcelaDias: r.prazoUltimaParcelaDias,
      modoExibicaoPreco: r.modoExibicaoPreco,
      ajusteIncide: r.ajusteIncide,
      deslocamentoModelo: r.deslocamentoModelo,
      deslocamentoKmGratis: r.deslocamentoKmGratis,
      deslocamentoValorKmCentavos: r.deslocamentoValorKmCentavos,
    },
    tiposEvento: modelo.tiposEvento.map((t) => ({
      id: idDoModelo.tipoEvento(t.chave),
      nome: t.nome,
      ativo: true,
    })),
    espacos: modelo.espacos.map((e) => ({
      id: idDoModelo.espaco(e.chave),
      nome: e.nome,
      capacidadeMax: e.capacidadeMax,
      noLocalDoCliente: e.noLocalDoCliente,
      ativo: true,
    })),
    turnos: modelo.turnos.map((t, i) => ({
      id: idDoModelo.turno(t.chave),
      nome: t.nome,
      horaInicio: t.horaInicio,
      duracaoMin: t.duracaoMin,
      diasSemana: t.diasSemana,
      ordem: i,
      ativo: true,
    })),
    ajustesDia: modelo.ajustesDia.map((a, i) => ({
      id: `ajuste:${i}`,
      tipo: 'dia_semana' as const,
      diaSemana: a.diaSemana,
      turnoId: a.turno ? idDoModelo.turno(a.turno) : null,
      ajusteBp: a.ajusteBp,
    })),
    feriados: [],
    faixasIdade: modelo.faixasIdade.map((f, i) => ({
      id: idDoModelo.faixaIdade(i),
      rotulo: f.rotulo,
      idadeMin: f.idadeMin,
      idadeMax: f.idadeMax,
      fatorBp: f.fatorBp,
      pacoteId: null,
      ordem: i,
    })),
    pacotes: modelo.pacotes.map((p, i) => ({
      id: idDoModelo.pacote(p.chave),
      nome: p.nome,
      subtitulo: p.subtitulo,
      destaque: p.destaque,
      modeloPreco: p.modeloPreco,
      precoPessoaCentavos: p.precoPessoaCentavos,
      valorExcedenteCentavos: p.valorExcedenteCentavos,
      minConvidados: p.minConvidados,
      maxConvidados: p.maxConvidados,
      duracaoInclusaMin: p.duracaoInclusaMin,
      valorHoraExtraCentavos: p.valorHoraExtraCentavos,
      ordem: i,
      ativo: true,
      faixasPreco: p.faixasPreco,
      secoes: p.secoes.map((s, j) => ({ ...s, ordem: j })),
      tiposEventoIds: p.tiposEvento.map(idDoModelo.tipoEvento),
    })),
    opcionais: modelo.opcionais.map((o, i) => ({
      id: idDoModelo.opcional(o.chave),
      nome: o.nome,
      descricao: o.descricao,
      cobranca: o.cobranca,
      precoCentavos: o.precoCentavos,
      qtdMin: o.qtdMin,
      qtdMax: o.qtdMax,
      ordem: i,
      ativo: true,
      pacotesCompativeisIds: o.pacotesCompativeis.map(idDoModelo.pacote),
      pacotesInclusoIds: o.pacotesInclusos.map(idDoModelo.pacote),
      tiposEventoIds: o.tiposEvento.map(idDoModelo.tipoEvento),
    })),
    faixasDeslocamento: modelo.faixasDeslocamento,
  };
}
