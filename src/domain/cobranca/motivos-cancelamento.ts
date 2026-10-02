/** Motivos do cancelamento (lista fechada; "outro" pede texto). Mesmos valores do check SQL. */
export const MOTIVOS_CANCELAMENTO = [
  { valor: 'preco', rotulo: 'Ficou caro para mim' },
  { valor: 'poucos_leads', rotulo: 'Recebi poucos pedidos pelo link' },
  { valor: 'nao_usei', rotulo: 'Não consegui usar no dia a dia' },
  { valor: 'faltou_recurso', rotulo: 'Faltou algo de que eu preciso' },
  { valor: 'outro_sistema', rotulo: 'Vou usar outro sistema' },
  { valor: 'fechou', rotulo: 'Fechei ou vou pausar o buffet' },
  { valor: 'outro', rotulo: 'Outro motivo' },
] as const;

export type MotivoCancelamento = (typeof MOTIVOS_CANCELAMENTO)[number]['valor'];

export const VALORES_MOTIVO = MOTIVOS_CANCELAMENTO.map((m) => m.valor) as [
  MotivoCancelamento,
  ...MotivoCancelamento[],
];

export function rotuloMotivo(valor: string): string {
  return MOTIVOS_CANCELAMENTO.find((m) => m.valor === valor)?.rotulo ?? valor;
}
