import { formatBp } from '../percent';

/** Mensagens em português simples, escritas para o cliente final. */
export const mensagens = {
  dataInvalida: () => 'Escolha uma data válida.',
  dataPassada: () => 'Essa data já passou. Escolha uma data a partir de hoje.',
  antecedencia: (dias: number) =>
    `Para essa data precisamos de pelo menos ${dias} ${dias === 1 ? 'dia' : 'dias'} de antecedência.`,
  turnoIndisponivel: (turno: string, dia: string) =>
    `O turno ${turno} não está disponível em ${dia}.`,
  tipoIncompativel: (pacote: string, tipo: string) =>
    `O pacote ${pacote} não está disponível para ${tipo}.`,
  abaixoMinimo: (pacote: string, minimo: number) =>
    `O pacote ${pacote} é a partir de ${minimo} convidados.`,
  acimaMaximo: (pacote: string, maximo: number) =>
    `O pacote ${pacote} atende até ${maximo} convidados.`,
  capacidade: (espaco: string, capacidade: number) =>
    `O espaço ${espaco} comporta até ${capacidade} pessoas.`,
  opcionalIncluso: (opcional: string, pacote: string) =>
    `${opcional} já vem incluso no pacote ${pacote}.`,
  opcionalIncompativel: (opcional: string) => `${opcional} não está disponível para essa festa.`,
  opcionalQuantidade: (opcional: string, min: number, max: number | null) =>
    max === null
      ? `Escolha pelo menos ${min} para ${opcional}.`
      : min === max
        ? `A quantidade de ${opcional} precisa ser ${min}.`
        : `Escolha de ${min} a ${max} para ${opcional}.`,
  foraArea: (maxKm: number) =>
    `Esse endereço fica fora da nossa área de atendimento (até ${maxKm} km).`,
  distanciaObrigatoria: () => 'Informe a distância até o local da festa.',
  descontoAcimaLimite: (limiteBp: number) =>
    `O desconto passa do seu limite de ${formatBp(limiteBp)}.`,
  descontoLimitado: () => 'O desconto foi limitado ao valor do subtotal.',
  canalNaoPermite: () => 'Itens avulsos e descontos só podem ser lançados pela equipe do buffet.',
  referenciaInvalida: (oque: string) => `${oque} não está disponível. Escolha outra opção.`,
  prazoCurto: () =>
    'Não há tempo para parcelar o saldo antes do evento: ele fica em uma parcela, com vencimento hoje.',
};
