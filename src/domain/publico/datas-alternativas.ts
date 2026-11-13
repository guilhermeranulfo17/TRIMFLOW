import { formatData } from '../dates';

/*
 * Até 3 datas de preferência no orçamento do cliente (Fase 6): a primeira (escolhas.data) é
 * obrigatória e define o preço; a segunda e a terceira são opcionais e só aparecem para o buffet
 * no lead. Ficam no rascunho do orçamento (as escolhas do cliente), sem coluna nova.
 */

export const MAX_DATAS_ALTERNATIVAS = 2;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** yyyy-MM-dd que existe no calendário (30/02 não passa). */
function dataDeVerdade(d: unknown): d is string {
  if (typeof d !== 'string' || !DATA.test(d)) return false;
  const t = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** Só datas válidas, sem repetir, diferentes da principal, a partir de `minimo`, no máximo 2. */
export function limparDatasAlternativas(
  principal: string | null | undefined,
  alternativas: readonly unknown[] | null | undefined,
  minimo?: string,
): string[] {
  const vistas = new Set<string>(principal ? [principal] : []);
  const r: string[] = [];
  for (const d of alternativas ?? []) {
    if (!dataDeVerdade(d)) continue;
    if (minimo && d < minimo) continue;
    if (vistas.has(d)) continue;
    vistas.add(d);
    r.push(d);
    if (r.length === MAX_DATAS_ALTERNATIVAS) break;
  }
  return r;
}

/** Datas alternativas guardadas no rascunho de um orçamento (qualquer formato vira lista limpa). */
export function datasAlternativasDoRascunho(rascunho: unknown): string[] {
  if (!rascunho || typeof rascunho !== 'object') return [];
  const r = rascunho as { data?: unknown; datasAlternativas?: unknown };
  return Array.isArray(r.datasAlternativas)
    ? limparDatasAlternativas(typeof r.data === 'string' ? r.data : null, r.datasAlternativas)
    : [];
}

/** "Outras datas possíveis: 22/05/2027 e 29/05/2027" (ou null sem datas). */
export function textoDatasAlternativas(datas: string[]): string | null {
  if (datas.length === 0) return null;
  const f = datas.map((d) => formatData(d));
  return `Outras datas possíveis: ${f.length === 1 ? f[0] : `${f.slice(0, -1).join(', ')} e ${f.at(-1)}`}`;
}
