import type {
  ContextoPreco,
  EntradaOrcamento,
  OpcionalCtx,
  PacoteCtx,
  RegrasPreco,
} from '@/domain/preco';

/** Hoje fixo nos testes: quarta-feira, 30/09/2026. 14/11/2026 é sábado. */
export const HOJE = '2026-09-30';
export const SABADO = '2026-11-14';

export const regrasPadrao: RegrasPreco = {
  validadeDias: 15,
  antecedenciaMinDias: 7,
  sinalBp: 3000,
  parcelasMax: 3,
  prazoUltimaParcelaDias: 7,
  modoExibicaoPreco: 'exato',
  ajusteIncide: 'pacote',
  deslocamentoModelo: 'nenhum',
  deslocamentoKmGratis: 0,
  deslocamentoValorKmCentavos: 0,
};

export function pacote(p: Partial<PacoteCtx> & Pick<PacoteCtx, 'id' | 'nome'>): PacoteCtx {
  return {
    subtitulo: null,
    destaque: false,
    modeloPreco: 'por_pessoa',
    precoPessoaCentavos: null,
    valorExcedenteCentavos: null,
    minConvidados: 1,
    maxConvidados: null,
    duracaoInclusaMin: 240,
    valorHoraExtraCentavos: 0,
    ordem: 0,
    ativo: true,
    faixasPreco: [],
    secoes: [],
    tiposEventoIds: [],
    ...p,
  };
}

export function opcional(
  o: Partial<OpcionalCtx> & Pick<OpcionalCtx, 'id' | 'nome' | 'cobranca' | 'precoCentavos'>,
): OpcionalCtx {
  return {
    descricao: null,
    qtdMin: 1,
    qtdMax: null,
    ordem: 0,
    ativo: true,
    pacotesCompativeisIds: [],
    pacotesInclusoIds: [],
    tiposEventoIds: [],
    ...o,
  };
}

/** Catálogo do teste de aceitação (festa infantil) + itens extras para os demais casos. */
export function contextoBase(): ContextoPreco {
  return {
    regras: { ...regrasPadrao },
    tiposEvento: [
      { id: 'te-infantil', nome: 'Aniversário infantil', ativo: true },
      { id: 'te-casamento', nome: 'Casamento', ativo: true },
      { id: 'te-inativo', nome: 'Antigo', ativo: false },
    ],
    espacos: [
      {
        id: 'esp-salao',
        nome: 'Salão principal',
        capacidadeMax: 120,
        noLocalDoCliente: false,
        ativo: true,
      },
      {
        id: 'esp-cliente',
        nome: 'No local do cliente',
        capacidadeMax: 500,
        noLocalDoCliente: true,
        ativo: true,
      },
    ],
    turnos: [
      {
        id: 'tu-tarde',
        nome: 'Tarde',
        horaInicio: '15:00',
        duracaoMin: 240,
        diasSemana: [0, 1, 2, 3, 4, 5, 6],
        ordem: 2,
        ativo: true,
      },
      {
        id: 'tu-almoco',
        nome: 'Almoço',
        horaInicio: '11:00',
        duracaoMin: 240,
        diasSemana: [0, 1, 2, 3, 4, 5, 6],
        ordem: 1,
        ativo: true,
      },
      {
        id: 'tu-noite',
        nome: 'Noite',
        horaInicio: '20:00',
        duracaoMin: 300,
        diasSemana: [4, 5, 6, 0],
        ordem: 3,
        ativo: true,
      },
      {
        id: 'tu-inativo',
        nome: 'Madrugada',
        horaInicio: '01:00',
        duracaoMin: 60,
        diasSemana: [6],
        ordem: 4,
        ativo: false,
      },
    ],
    ajustesDia: [{ id: 'aj-sab', tipo: 'dia_semana', diaSemana: 6, turnoId: null, ajusteBp: 1000 }],
    feriados: [],
    faixasIdade: [
      {
        id: 'fi-0-5',
        rotulo: '0 a 5 anos',
        idadeMin: 0,
        idadeMax: 5,
        fatorBp: 0,
        pacoteId: null,
        ordem: 1,
      },
      {
        id: 'fi-6-10',
        rotulo: '6 a 10 anos',
        idadeMin: 6,
        idadeMax: 10,
        fatorBp: 5000,
        pacoteId: null,
        ordem: 2,
      },
      {
        id: 'fi-11',
        rotulo: '11 anos ou mais',
        idadeMin: 11,
        idadeMax: null,
        fatorBp: 10000,
        pacoteId: null,
        ordem: 3,
      },
    ],
    pacotes: [
      pacote({
        id: 'pac-super',
        nome: 'Super',
        modeloPreco: 'por_faixa',
        valorExcedenteCentavos: 8500,
        faixasPreco: [{ ateConvidados: 50, valorCentavos: 450000 }],
        minConvidados: 20,
        maxConvidados: 120,
        valorHoraExtraCentavos: 45000,
        tiposEventoIds: ['te-infantil'],
      }),
      pacote({
        id: 'pac-faixas',
        nome: 'Faixas',
        modeloPreco: 'por_faixa',
        valorExcedenteCentavos: 7000,
        faixasPreco: [
          { ateConvidados: 80, valorCentavos: 600000 },
          { ateConvidados: 30, valorCentavos: 300000 },
          { ateConvidados: 50, valorCentavos: 420000 },
        ],
      }),
      pacote({
        id: 'pac-pessoa',
        nome: 'Clássico',
        modeloPreco: 'por_pessoa',
        precoPessoaCentavos: 12000,
        minConvidados: 30,
        maxConvidados: 200,
        valorHoraExtraCentavos: 60000,
        ordem: 2,
      }),
      pacote({ id: 'pac-inativo', nome: 'Antigo', precoPessoaCentavos: 100, ativo: false }),
      pacote({
        id: 'pac-sem-preco',
        nome: 'Sem preço',
        modeloPreco: 'por_faixa',
        valorExcedenteCentavos: 100,
      }),
    ],
    opcionais: [
      opcional({ id: 'op-mesa', nome: 'Mesa temática', cobranca: 'fixo', precoCentavos: 60000 }),
      opcional({
        id: 'op-personagem',
        nome: 'Personagem',
        cobranca: 'por_unidade',
        precoCentavos: 35000,
        qtdMax: 3,
      }),
      opcional({
        id: 'op-recreacao',
        nome: 'Recreação extra',
        cobranca: 'por_hora',
        precoCentavos: 18000,
        qtdMax: 3,
      }),
      opcional({ id: 'op-bebidas', nome: 'Bebidas', cobranca: 'por_pessoa', precoCentavos: 1200 }),
      opcional({
        id: 'op-bolo',
        nome: 'Bolo cenográfico',
        cobranca: 'fixo',
        precoCentavos: 25000,
        pacotesInclusoIds: ['pac-super'],
      }),
      opcional({
        id: 'op-so-pessoa',
        nome: 'Só no Clássico',
        cobranca: 'fixo',
        precoCentavos: 1000,
        pacotesCompativeisIds: ['pac-pessoa'],
      }),
      opcional({
        id: 'op-so-casamento',
        nome: 'Só casamento',
        cobranca: 'fixo',
        precoCentavos: 1000,
        tiposEventoIds: ['te-casamento'],
      }),
      opcional({
        id: 'op-inativo',
        nome: 'Inativo',
        cobranca: 'fixo',
        precoCentavos: 1,
        ativo: false,
      }),
    ],
    faixasDeslocamento: [
      { ateKm: 30, valorCentavos: 15000 },
      { ateKm: 10, valorCentavos: 5000 },
    ],
  };
}

/** Entrada do teste de aceitação (canal interno, desconto 5%, limite 10%). */
export function entradaAceitacao(): EntradaOrcamento {
  return {
    canal: 'interno',
    hoje: HOJE,
    tipoEventoId: 'te-infantil',
    data: SABADO,
    turnoId: 'tu-tarde',
    espacoId: 'esp-salao',
    adultos: 60,
    criancas: [
      { faixaIdadeId: 'fi-0-5', quantidade: 10 },
      { faixaIdadeId: 'fi-6-10', quantidade: 10 },
    ],
    pacoteId: 'pac-super',
    opcionais: [{ opcionalId: 'op-mesa', quantidade: 1 }],
    horasExtras: 1,
    desconto: { tipo: 'percentual', bp: 500 },
    limiteDescontoBp: 1000,
  };
}

/** Entrada simples e válida no canal público (sem ajuste, sem extras). */
export function entradaSimples(extra: Partial<EntradaOrcamento> = {}): EntradaOrcamento {
  return {
    canal: 'publico',
    hoje: HOJE,
    tipoEventoId: 'te-infantil',
    data: '2026-11-11', // quarta
    turnoId: 'tu-tarde',
    espacoId: 'esp-salao',
    adultos: 40,
    criancas: [],
    pacoteId: 'pac-pessoa',
    opcionais: [],
    horasExtras: 0,
    ...extra,
  };
}
