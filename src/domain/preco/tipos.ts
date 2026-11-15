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
  /**
   * Orçamento por itens (§96). `pacotes` (padrão): todo orçamento tem pacote. `itens`: o cliente
   * monta a festa escolhendo os itens, sem pacote. `ambos`: o cliente escolhe um dos jeitos.
   */
  modoVenda?: ModoVenda;
  /** sem pacote: mínimo de convidados equivalentes (0 = sem mínimo) */
  minConvidadosItens?: number;
  /** sem pacote: valor mínimo do pedido antes do desconto (0 = sem mínimo) */
  pedidoMinimoCentavos?: number;
  /**
   * Sem pacote: preço da festa por pessoa conforme o número de convidados (ex.: até 90, R$ 45;
   * até 120, R$ 40). Vazio = a festa não tem preço base, só a soma dos itens.
   */
  faixasFestaPorPessoa?: FaixaPrecoCtx[];
};

export type ModoVenda = 'pacotes' | 'itens' | 'ambos';

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

/**
 * Feriado ou data especial. `ajusteBp` preenchido = data especial com preço próprio (ex.:
 * "Véspera do Dia das Mães", +15%), que vence os outros ajustes; sem ele, vale o ajuste de
 * feriado de Ajustes por dia.
 */
export type FeriadoCtx = { data: DataCivil; nome: string; id?: Id; ajusteBp?: number | null };

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
  /**
   * Pacotes (entre os inclusos) em que o cliente pode retirar o opcional, com o desconto ao
   * retirar (nulo = sai sem mudar o preço). Fase 6.5.
   */
  retiravelEm?: { pacoteId: Id; descontoCentavos: number | null }[];
  /** vazio = vale para todos os tipos de evento */
  tiposEventoIds: Id[];
  /** agrupa os itens no orçamento por itens ("Salgados", "Bolos e tortas"); null = "Outros" */
  categoria?: string | null;
  /**
   * Por unidade: quantidade calculada pelos convidados, em centésimos por convidado equivalente
   * (1200 = 12 por convidado), arredondada para cima. O cliente vê só o valor; o buffet vê a
   * quantidade. null = o cliente informa a quantidade.
   */
  qtdPorConvidadoCent?: number | null;
  /**
   * Por pessoa: preço por pessoa conforme o número de convidados (`valorCentavos` = valor por
   * pessoa até `ateConvidados`). Acima da maior faixa (ou sem faixas), vale `precoCentavos`.
   */
  faixasPorPessoa?: FaixaPrecoCtx[];
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
  /** null = orçamento por itens, sem pacote (só quando `regras.modoVenda` permite) */
  pacoteId: Id | null;
  opcionais: { opcionalId: Id; quantidade: number }[];
  /** opcionais inclusos que o cliente retirou do pacote (Fase 6.5) */
  retirados?: Id[];
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
  | 'ITEM_NAO_RETIRAVEL'
  | 'FORA_AREA_ATENDIMENTO'
  | 'DISTANCIA_OBRIGATORIA'
  | 'DESCONTO_ACIMA_LIMITE'
  | 'CANAL_NAO_PERMITE'
  | 'PACOTE_OBRIGATORIO'
  | 'ITENS_OBRIGATORIOS'
  | 'PEDIDO_MINIMO'
  | 'REFERENCIA_INVALIDA';

export type CodigoAviso =
  | 'ANTECEDENCIA_MINIMA'
  | 'FORA_AREA_ATENDIMENTO'
  | 'DESCONTO_LIMITADO_AO_SUBTOTAL'
  | 'PRAZO_PARCELAS_CURTO'
  | 'PEDIDO_MINIMO';

export type ErroOrcamento = { codigo: CodigoErro; mensagem: string; campo?: string };
export type AvisoOrcamento = { codigo: CodigoAviso; mensagem: string };

export type TipoLinha =
  | 'pacote'
  | 'festa'
  | 'ajuste_dia'
  | 'opcional'
  | 'retirado'
  | 'hora_extra'
  | 'deslocamento'
  | 'avulso'
  | 'desconto';

export type LinhaOrcamento = {
  tipo: TipoLinha;
  referenciaId?: Id;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  subtotalCentavos: number;
  /** explicação do cálculo em português, pronta para a proposta */
  detalhe: string;
  /**
   * A conta (quantidade e valor unitário) é do buffet: o cliente vê só a descrição e o valor
   * (item com quantidade por convidado, §96).
   */
  ocultarConta?: boolean;
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
