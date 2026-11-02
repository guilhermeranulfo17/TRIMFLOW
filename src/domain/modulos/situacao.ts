import { compararDatas, somarDias, type DataCivil } from '../dates';

/*
 * Situação de um módulo adicional para a empresa. ESPELHO de public._modulo_situacao e
 * public._modulo_na_carencia, com teste de equivalência: mudou uma, mude a outra.
 *
 * O direito nasce só de cobrança confirmada pelo provedor (pago_ate); voltar do checkout não
 * libera nada. Estorno sem outra cobertura tira o acesso.
 */

export const SITUACOES_MODULO = [
  'nao_contratado',
  'pagamento_pendente',
  'ativo',
  'falha_pagamento',
  'cancelamento_agendado',
  'expirado',
  'estornado',
] as const;
export type SituacaoModulo = (typeof SITUACOES_MODULO)[number];

export type StatusAssinaturaModulo = 'pendente' | 'ativa' | 'cancelada';

export type EntradaSituacaoModulo = {
  status: StatusAssinaturaModulo;
  /** último dia coberto por pagamento confirmado */
  pagoAte: DataCivil | null;
  /** alguma cobrança da assinatura foi estornada */
  estornada: boolean;
  hoje: DataCivil;
};

export function situacaoModulo(e: EntradaSituacaoModulo): SituacaoModulo {
  if (e.pagoAte && compararDatas(e.hoje, e.pagoAte) <= 0) {
    return e.status === 'cancelada' ? 'cancelamento_agendado' : 'ativo';
  }
  if (e.estornada) return 'estornado';
  if (e.status === 'cancelada') return e.pagoAte === null ? 'nao_contratado' : 'expirado';
  if (e.status === 'pendente') return 'pagamento_pendente';
  return 'falha_pagamento';
}

/** Falha de pagamento ainda dentro da carência configurada no módulo (acesso mantido). */
export function naCarencia(o: {
  situacao: SituacaoModulo;
  pagoAte: DataCivil | null;
  atrasadaDesde: DataCivil | null;
  carenciaDias: number;
  hoje: DataCivil;
}): boolean {
  if (o.situacao !== 'falha_pagamento' || o.carenciaDias <= 0) return false;
  const inicio = o.atrasadaDesde ?? (o.pagoAte ? somarDias(o.pagoAte, 1) : o.hoje);
  return compararDatas(o.hoje, somarDias(inicio, o.carenciaDias)) <= 0;
}

/** O módulo libera as operações? */
export const temAcesso = (s: SituacaoModulo, carencia = false): boolean =>
  s === 'ativo' || s === 'cancelamento_agendado' || carencia;

export const ROTULO_SITUACAO: Record<SituacaoModulo, string> = {
  nao_contratado: 'Não contratado',
  pagamento_pendente: 'Pagamento pendente',
  ativo: 'Ativo',
  falha_pagamento: 'Pagamento em atraso',
  cancelamento_agendado: 'Cancelamento agendado',
  expirado: 'Encerrado',
  estornado: 'Pagamento estornado',
};

/** Tom visual da etiqueta (tokens de estado do tema). */
export const TOM_SITUACAO: Record<
  SituacaoModulo,
  'neutro' | 'alerta' | 'sucesso' | 'erro' | 'info'
> = {
  nao_contratado: 'neutro',
  pagamento_pendente: 'alerta',
  ativo: 'sucesso',
  falha_pagamento: 'erro',
  cancelamento_agendado: 'info',
  expirado: 'neutro',
  estornado: 'erro',
};

export type AcaoModulo =
  | { tipo: 'conhecer'; rotulo: string }
  | { tipo: 'contratar'; rotulo: string }
  | { tipo: 'pagar'; rotulo: string }
  | { tipo: 'acessar'; rotulo: string }
  | { tipo: 'configurar'; rotulo: string }
  | { tipo: 'gerenciar'; rotulo: string };

/**
 * Botão principal do cartão. Contratar só aparece com venda liberada E para quem pode contratar
 * (dono); o servidor confere de novo. Sem venda liberada, o módulo é só "Conhecer".
 */
export function acaoPrincipal(o: {
  situacao: SituacaoModulo;
  acesso: boolean;
  vendaLiberada: boolean;
  podeContratar: boolean;
  /** o módulo tem primeiro uso pendente (ex.: margem sem custos de pacote) */
  configuracaoPendente?: boolean;
  /** o perfil usa as telas do módulo (módulos só do dono: false para o vendedor) */
  podeUsar?: boolean;
}): AcaoModulo {
  if (o.acesso && o.podeUsar === false) return { tipo: 'conhecer', rotulo: 'Conhecer solução' };
  if (o.acesso) {
    return o.configuracaoPendente
      ? { tipo: 'configurar', rotulo: 'Configurar' }
      : { tipo: 'acessar', rotulo: 'Acessar' };
  }
  if (o.situacao === 'pagamento_pendente' || o.situacao === 'falha_pagamento') {
    return o.podeContratar
      ? { tipo: 'pagar', rotulo: 'Continuar pagamento' }
      : { tipo: 'conhecer', rotulo: 'Conhecer solução' };
  }
  if (o.vendaLiberada && o.podeContratar) return { tipo: 'contratar', rotulo: 'Contratar' };
  return { tipo: 'conhecer', rotulo: 'Conhecer solução' };
}

/** Etiqueta do cartão: a situação, ou "Indisponível para contratação" quando não há venda. */
export function etiquetaDoCartao(o: { situacao: SituacaoModulo; vendaLiberada: boolean }): {
  texto: string;
  tom: (typeof TOM_SITUACAO)[SituacaoModulo];
} {
  if (o.situacao === 'nao_contratado' || o.situacao === 'expirado') {
    return o.vendaLiberada
      ? { texto: 'Disponível', tom: 'info' }
      : { texto: 'Indisponível para contratação', tom: 'neutro' };
  }
  return { texto: ROTULO_SITUACAO[o.situacao], tom: TOM_SITUACAO[o.situacao] };
}

/** Módulo aparece em "Minhas soluções": tem ou teve contrato (o encerrado guarda o histórico). */
export const ehMinha = (s: SituacaoModulo): boolean => s !== 'nao_contratado';
