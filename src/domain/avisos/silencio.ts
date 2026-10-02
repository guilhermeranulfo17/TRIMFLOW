import { formatInTimeZone } from 'date-fns-tz';
import { FUSO_PADRAO, somarDias } from '../dates';
import { instanteLocal } from '../leads/adiar';

/*
 * Horário de silêncio: aviso criado no silêncio sai (push e WhatsApp) no fim dele; o painel
 * mostra na hora. ESPELHO de public._aviso_agendar (teste de equivalência). Início e fim em
 * "HH:mm" no fuso da empresa; início > fim atravessa a meia-noite (22:00 → 07:00).
 * Início = fim: sem silêncio.
 */
export const SILENCIO_PADRAO = { inicio: '22:00', fim: '07:00' } as const;

export function agendarAviso(
  agora: Date,
  inicio: string = SILENCIO_PADRAO.inicio,
  fim: string = SILENCIO_PADRAO.fim,
  fuso: string = FUSO_PADRAO,
): Date {
  if (inicio === fim) return agora;
  const hoje = formatInTimeZone(agora, fuso, 'yyyy-MM-dd');
  const t = formatInTimeZone(agora, fuso, 'HH:mm:ss');
  const ini = `${inicio}:00`;
  const fi = `${fim}:00`;
  if (ini < fi) {
    return t >= ini && t < fi ? instanteLocal(hoje, fim, fuso) : agora;
  }
  if (t >= ini) return instanteLocal(somarDias(hoje, 1), fim, fuso);
  if (t < fi) return instanteLocal(hoje, fim, fuso);
  return agora;
}

/** "HH:mm" válido. */
export function horaValida(h: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
}
