import { formatData } from '../dates';
import { formatBRL } from '../money';

export type ResumoVersao = {
  data: string | null;
  turno: string | null;
  espaco: string | null;
  convidados: number | null;
  pacote: string | null;
  extras: string[];
  totalCentavos: number | null;
};

/** O que mudou de uma versão para a seguinte, em frases curtas para a tela do lead. */
export function diferencasEntreVersoes(antes: ResumoVersao, depois: ResumoVersao): string[] {
  const mudancas: string[] = [];
  const troca = (rotulo: string, a: string | null, b: string | null) => {
    if ((a ?? '') !== (b ?? '')) mudancas.push(`${rotulo}: ${a ?? '—'} → ${b ?? '—'}`);
  };
  troca(
    'Data',
    antes.data ? formatData(antes.data) : null,
    depois.data ? formatData(depois.data) : null,
  );
  troca('Horário', antes.turno, depois.turno);
  troca('Espaço', antes.espaco, depois.espaco);
  troca(
    'Convidados',
    antes.convidados != null ? String(antes.convidados) : null,
    depois.convidados != null ? String(depois.convidados) : null,
  );
  troca('Pacote', antes.pacote, depois.pacote);
  const entraram = depois.extras.filter((e) => !antes.extras.includes(e));
  const sairam = antes.extras.filter((e) => !depois.extras.includes(e));
  if (entraram.length) mudancas.push(`Extras incluídos: ${entraram.join(', ')}`);
  if (sairam.length) mudancas.push(`Extras retirados: ${sairam.join(', ')}`);
  if (antes.totalCentavos != null && depois.totalCentavos != null) {
    const delta = depois.totalCentavos - antes.totalCentavos;
    if (delta !== 0) mudancas.push(`Total: ${delta > 0 ? '+' : '-'}${formatBRL(Math.abs(delta))}`);
  }
  return mudancas;
}
