/**
 * Tipos do motor de preço. Tudo serializável em JSON: dinheiro em centavos (inteiro),
 * percentuais em basis points (inteiro), datas civis "yyyy-MM-dd".
 */

export const VERSAO_MOTOR = 1 as const;

export type Id = string;
export type DataCivil = string;

export type ModeloPreco = 'por_pessoa' | 'por_faixa';
export type Cobranca = 'por_pessoa' | 'fixo' | 'por_unidade' | 'por_hora';
export type Canal = 'publico' | 'interno';

// ---------------------------------------------------------------------------
// Contexto (montado pelo servidor a partir do banco)
// ---------------------------------------------------------------------------

export type RegrasPreco = {
  validadeDias: number;
  antecedenciaMinDias: number;
  sinalBp: number;
  parcelasMax: number;
  prazoUltimaParcelaDias: number;
  modoExibicaoPreco: 'exato' | 'faixa' | 'apos_contato';
  ajusteIncide: 'pacote' | 'pacote_opcionais';
  deslocamentoModelo: 'nenhum' | 'por_km' | 'por_faixa';
  deslocamentoKmGratis: number;
  deslocamentoValorKmCentavos: number;
};

export type TipoEventoCtx = { id: Id; nome: string; ativo: boolean };

export type EspacoCtx = {
  id: Id;
  nome: string;
  capacidadeMax: number;
  noLocalDoCliente: boolean;
  ativo: boolean;
};

export type TurnoCtx = {
  id: Id;
  nome: string;
  /** "HH:MM" */
  horaInicio: string;
  duracaoMin: number;
  /** 0 = domingo … 6 = sábado */
  diasSemana: number[];
  ordem: number;
  ativo: boolean;
};

export type AjusteDiaCtx = {
  id: Id;
  tipo: 'dia_semana' | 'feriado';
  diaSemana: number | null;
  turnoId: Id | null;
  ajusteBp: number;
};

export type FeriadoCtx = { data: DataCivil; nome: string };

export type FaixaIdadeCtx = {
  id: Id;
  rotulo: string;
  idadeMin: number;
  idadeMax: number | null;
  fatorBp: number;
  /** null = política da empresa; preenchido = sobrescreve a política para esse pacote */
  pacoteId: Id | null;
  ordem: number;
};

export type FaixaPrecoCtx = { ateConvidados: number; valorCentavos: number };

export type SecaoCardapioCtx = { nome: string; itens: string[]; ordem: number };

export type PacoteCtx = {
  id: Id;
  nome: string;
  subtitulo: string | null;
  destaque: boolean;
  modeloPreco: ModeloPreco;
  precoPessoaCentavos: number | null;
  valorExcedenteCentavos: number | null;
  minConvidados: number;
  maxConvidados: number | null;
  duracaoInclusaMin: number;
  valorHoraExtraCentavos: number;
  ordem: number;
  ativo: boolean;
  faixasPreco: FaixaPrecoCtx[];
  secoes: SecaoCardapioCtx[];
  /** vazio = vale para todos os tipos de evento */
  tiposEventoIds: Id[];
};

export type OpcionalCtx = {
  id: Id;
  nome: string;
  descricao: string | null;
  cobranca: Cobranca;
  precoCentavos: number;
  qtdMin: number;
  qtdMax: number | null;
  ordem: number;
  ativo: boolean;
  /** vazio = compatível com todos os pacotes */
  pacotesCompativeisIds: Id[];
  /** pacotes em que o opcional já vem incluso (não pode ser vendido como extra) */
  pacotesInclusoIds: Id[];
  /** vazio = vale para todos os tipos de evento */
  tiposEventoIds: Id[];
};

export type FaixaDeslocamentoCtx = { ateKm: number; valorCentavos: number };

export type ContextoPreco = {
  regras: RegrasPreco;
  tiposEvento: TipoEventoCtx[];
  espacos: EspacoCtx[];
  turnos: TurnoCtx[];
  ajustesDia: AjusteDiaCtx[];
  feriados: FeriadoCtx[];
  faixasIdade: FaixaIdadeCtx[];
  pacotes: PacoteCtx[];
  opcionais: OpcionalCtx[];
  faixasDeslocamento: FaixaDeslocamentoCtx[];
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export type Desconto = { tipo: 'percentual'; bp: number } | { tipo: 'valor'; centavos: number };

export type ItemAvulso = { descricao: string; quantidade: number; valorUnitarioCentavos: number };

export type EntradaOrcamento = {
  canal: Canal;
  /** hoje no fuso da empresa (nunca Date.now() dentro do motor) */
  hoje: DataCivil;
  tipoEventoId: Id;
  data: DataCivil;
  turnoId: Id;
  espacoId: Id;
  adultos: number;
  criancas: { faixaIdadeId: Id; quantidade: number }[];
  pacoteId: Id;
  opcionais: { opcionalId: Id; quantidade: number }[];
  horasExtras: number;
  distanciaKm?: number;
  itensAvulsos?: ItemAvulso[];
  desconto?: Desconto;
  limiteDescontoBp?: number;
};

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export type CodigoErro =
  | 'DATA_INVALIDA'
  | 'DATA_PASSADA'
  | 'ANTECEDENCIA_MINIMA'
  | 'TURNO_INDISPONIVEL_NO_DIA'
  | 'TIPO_EVENTO_INCOMPATIVEL'
  | 'CONVIDADOS_ABAIXO_MINIMO'
  | 'CONVIDADOS_ACIMA_MAXIMO'
  | 'CAPACIDADE_ESPACO'
  | 'OPCIONAL_JA_INCLUSO'
  | 'OPCIONAL_INCOMPATIVEL'
  | 'OPCIONAL_QUANTIDADE'
  | 'FORA_AREA_ATENDIMENTO'
  | 'DISTANCIA_OBRIGATORIA'
  | 'DESCONTO_ACIMA_LIMITE'
  | 'CANAL_NAO_PERMITE'
  | 'REFERENCIA_INVALIDA';

export type CodigoAviso =
  | 'ANTECEDENCIA_MINIMA'
  | 'FORA_AREA_ATENDIMENTO'
  | 'DESCONTO_LIMITADO_AO_SUBTOTAL'
  | 'PRAZO_PARCELAS_CURTO';

export type ErroOrcamento = { codigo: CodigoErro; mensagem: string; campo?: string };
export type AvisoOrcamento = { codigo: CodigoAviso; mensagem: string };

export type TipoLinha =
  'pacote' | 'ajuste_dia' | 'opcional' | 'hora_extra' | 'deslocamento' | 'avulso' | 'desconto';

export type LinhaOrcamento = {
  tipo: TipoLinha;
  referenciaId?: Id;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  subtotalCentavos: number;
  /** explicação do cálculo em português, pronta para a proposta */
  detalhe: string;
};

export type Parcela = { numero: number; valorCentavos: number; vencimento: DataCivil };

export type ResultadoOrcamento = {
  versaoMotor: typeof VERSAO_MOTOR;
  ok: boolean;
  erros: ErroOrcamento[];
  avisos: AvisoOrcamento[];
  convidadosEquivalentes: number;
  pessoasFisicas: number;
  linhas: LinhaOrcamento[];
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  porConvidadoCentavos: number;
  sinalCentavos: number;
  saldoCentavos: number;
  parcelas: Parcela[];
};
