import { FAIXAS_IDADE_EXEMPLO, REGRAS_EXEMPLO, type Modelo } from './schema';

/**
 * Buffet de casamento e 15 anos (Fase 6). Valores de exemplo, para o dono trocar. Grava o
 * segmento "eventos" (o contrato de exemplo de eventos já cobre casamento); o que muda é o
 * catálogo: pacotes de recepção, cardápio de jantar e opcionais de casamento.
 */
export const modeloCasamento: Modelo = {
  segmento: 'eventos',
  nome: 'Casamento e 15 anos',
  tiposEvento: [
    { chave: 'casamento', nome: 'Casamento', icone: 'heart' },
    { chave: '15-anos', nome: '15 anos', icone: 'sparkles' },
    { chave: 'bodas', nome: 'Bodas', icone: 'gem' },
  ],
  espacos: [
    { chave: 'salao', nome: 'Salão de festas', capacidadeMax: 300, noLocalDoCliente: false },
  ],
  turnos: [
    {
      chave: 'noite',
      nome: 'Noite',
      horaInicio: '20:00',
      duracaoMin: 360,
      diasSemana: [5, 6],
    },
    {
      chave: 'tarde',
      nome: 'Tarde',
      horaInicio: '13:00',
      duracaoMin: 300,
      diasSemana: [6, 0],
    },
  ],
  // sexta-feira e domingo mais em conta que o sábado
  ajustesDia: [
    { diaSemana: 5, ajusteBp: -1000 },
    { diaSemana: 0, ajusteBp: -1500 },
  ],
  faixasIdade: FAIXAS_IDADE_EXEMPLO,
  pacotes: [
    {
      chave: 'classico',
      nome: 'Clássico',
      subtitulo: 'Recepção e jantar',
      descricao:
        'Coquetel de recepção, jantar com duas opções de prato, sobremesa, bebidas não alcoólicas e equipe de salão.',
      destaque: false,
      modeloPreco: 'por_pessoa',
      precoPessoaCentavos: 15000,
      valorExcedenteCentavos: null,
      faixasPreco: [],
      minConvidados: 80,
      maxConvidados: 300,
      duracaoInclusaMin: 300,
      valorHoraExtraCentavos: 150000,
      tiposEvento: [],
      secoes: [
        {
          nome: 'Coquetel de recepção',
          itens: ['Canapés variados', 'Bruschetta de tomate e manjericão', 'Bolinho de bacalhau'],
        },
        { nome: 'Entrada', itens: ['Salada verde com molho de mostarda e mel'] },
        {
          nome: 'Jantar',
          itens: ['Filé ao molho madeira', 'Frango ao limão siciliano', 'Arroz com amêndoas'],
        },
        { nome: 'Sobremesa', itens: ['Pudim de leite', 'Mousse de maracujá'] },
        { nome: 'Bebidas', itens: ['Refrigerantes', 'Sucos naturais', 'Água com e sem gás'] },
      ],
    },
    {
      chave: 'premium',
      nome: 'Premium',
      subtitulo: 'O mais escolhido pelos noivos',
      descricao:
        'Coquetel volante, jantar com três opções, mesa de frutas, bem-casados e ilha de café.',
      destaque: true,
      modeloPreco: 'por_pessoa',
      precoPessoaCentavos: 19500,
      valorExcedenteCentavos: null,
      faixasPreco: [],
      minConvidados: 80,
      maxConvidados: 300,
      duracaoInclusaMin: 360,
      valorHoraExtraCentavos: 180000,
      tiposEvento: [],
      secoes: [
        {
          nome: 'Coquetel volante',
          itens: ['Camarão empanado', 'Mini acarajé', 'Dadinho de tapioca', 'Tartelete de queijo'],
        },
        {
          nome: 'Jantar',
          itens: ['Medalhão ao funghi', 'Salmão grelhado', 'Risoto de limão siciliano'],
        },
        { nome: 'Sobremesa', itens: ['Petit gâteau', 'Mesa de frutas'] },
        { nome: 'Doces', itens: ['Bem-casados', 'Brigadeiro gourmet'] },
        { nome: 'Ilha de café', itens: ['Café espresso', 'Chás', 'Petit fours'] },
        { nome: 'Bebidas', itens: ['Refrigerantes', 'Sucos naturais', 'Água com e sem gás'] },
      ],
    },
    {
      chave: 'gala',
      nome: 'Gala',
      subtitulo: 'Experiência completa',
      descricao:
        'Coquetel volante, jantar empratado em três tempos, mesa de doces finos, bem-casados e ilha de café.',
      destaque: false,
      modeloPreco: 'por_pessoa',
      precoPessoaCentavos: 27000,
      valorExcedenteCentavos: null,
      faixasPreco: [],
      minConvidados: 80,
      maxConvidados: 300,
      duracaoInclusaMin: 360,
      valorHoraExtraCentavos: 250000,
      tiposEvento: [],
      secoes: [
        {
          nome: 'Coquetel volante',
          itens: ['Tartar de salmão', 'Mini burger de costela', 'Ceviche de peixe branco'],
        },
        {
          nome: 'Jantar empratado',
          itens: ['Entrada da estação', 'Filé mignon com purê trufado', 'Sobremesa do chef'],
        },
        { nome: 'Doces', itens: ['Mesa de doces finos', 'Bem-casados'] },
        { nome: 'Ilha de café', itens: ['Café espresso', 'Chás', 'Petit fours'] },
        { nome: 'Bebidas', itens: ['Refrigerantes', 'Sucos naturais', 'Água com e sem gás'] },
      ],
    },
  ],
  opcionais: [
    {
      chave: 'bar-drinks',
      nome: 'Bar de drinks',
      descricao: 'Bartender e drinks clássicos durante a festa.',
      cobranca: 'por_pessoa',
      precoCentavos: 4500,
      qtdMin: 1,
      qtdMax: 1,
      pacotesCompativeis: [],
      pacotesInclusos: [],
      tiposEvento: [],
    },
    {
      chave: 'doces-finos',
      nome: 'Mesa de doces finos',
      descricao: 'Mesa decorada com doces finos para a recepção.',
      cobranca: 'fixo',
      precoCentavos: 250000,
      qtdMin: 1,
      qtdMax: 1,
      pacotesCompativeis: [],
      pacotesInclusos: ['gala'],
      tiposEvento: [],
    },
    {
      chave: 'bem-casados',
      nome: 'Bem-casados extras',
      descricao: 'Bem-casados embalados para lembrança dos convidados.',
      cobranca: 'por_pessoa',
      precoCentavos: 800,
      qtdMin: 1,
      qtdMax: 1,
      pacotesCompativeis: [],
      pacotesInclusos: ['premium', 'gala'],
      tiposEvento: [],
    },
    {
      chave: 'mesa-queijos',
      nome: 'Mesa de queijos e frios',
      descricao: 'Mesa de queijos, frios, pães e geleias durante a recepção.',
      cobranca: 'por_pessoa',
      precoCentavos: 2800,
      qtdMin: 1,
      qtdMax: 1,
      pacotesCompativeis: [],
      pacotesInclusos: [],
      tiposEvento: [],
    },
    {
      chave: 'hora-extra-bar',
      nome: 'Hora extra de bar',
      descricao: 'Bar aberto por mais tempo depois do horário do pacote.',
      cobranca: 'por_hora',
      precoCentavos: 80000,
      qtdMin: 1,
      qtdMax: 3,
      pacotesCompativeis: [],
      pacotesInclusos: [],
      tiposEvento: [],
    },
  ],
  faixasDeslocamento: [],
  regras: {
    ...REGRAS_EXEMPLO,
    validadeDias: 15,
    antecedenciaMinDias: 60,
    parcelasMax: 10,
    prazoUltimaParcelaDias: 15,
    formasPagamento: ['Pix', 'Cartão de crédito', 'Boleto'],
    condicoesTexto:
      'Sinal de 30% para reservar a data. Saldo em até 10 parcelas, com a última até 15 dias antes do casamento.',
    naoInclusoTexto:
      'Bebidas alcoólicas, decoração floral, bolo, DJ ou banda, fotografia e cerimonialista.',
    cancelamentoTexto:
      'Cancelamento com mais de 90 dias de antecedência: devolução de 50% do valor pago. Com menos de 90 dias, o sinal não é devolvido.',
  },
};
