import { compararDatas, formatData } from '../dates';

export type EstadoValidade = { expirada: boolean; dias: number; texto: string };

function diasEntre(de: string, ate: string): number {
  const [a, b] = [de, ate].map((d) =>
    Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)),
  );
  return Math.round((b! - a!) / 86_400_000);
}

/** Validade da proposta: vigente até o dia `validadeAte` inclusive (datas civis no fuso do buffet). */
export function estadoValidade(validadeAte: string, hoje: string): EstadoValidade {
  const dias = diasEntre(hoje, validadeAte);
  if (compararDatas(validadeAte, hoje) < 0) {
    return { expirada: true, dias, texto: `Venceu em ${formatData(validadeAte)}` };
  }
  if (dias === 0) return { expirada: false, dias, texto: 'Vence hoje' };
  if (dias === 1) return { expirada: false, dias, texto: 'Vence amanhã' };
  return { expirada: false, dias, texto: `Vence em ${dias} dias` };
}
