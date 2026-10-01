import { formatData } from '../dates';
import { formatBRL } from '../money';

/** Link do WhatsApp com a mensagem pronta. Número E.164 (+55…). */
export function linkWhatsApp(e164: string, texto?: string): string {
  const numero = e164.replace(/\D/g, '');
  const base = `https://wa.me/${numero}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

export type ResumoMensagem = {
  numero?: number;
  tipoEvento?: string | null;
  data?: string | null;
  turno?: string | null;
  convidados?: number | null;
  totalCentavos?: number | null;
};

function detalhes(r: ResumoMensagem): string {
  const partes = [
    r.tipoEvento,
    r.data ? formatData(r.data) : null,
    r.turno,
    r.convidados ? `${r.convidados} convidados` : null,
  ].filter(Boolean);
  return partes.join(' · ');
}

/** "Tirar dúvidas": cita o orçamento quando existe. */
export function mensagemDuvida(buffet: string, r: ResumoMensagem = {}): string {
  if (!r.numero) return `Olá, ${buffet}! Vi a página de vocês e queria tirar uma dúvida.`;
  const total = r.totalCentavos ? ` (total ${formatBRL(r.totalCentavos)})` : '';
  return `Olá, ${buffet}! Montei o orçamento nº ${r.numero}${total} pelo link: ${detalhes(r)}. Queria tirar uma dúvida.`;
}

/** Depois da pré-reserva: o cliente avisa o buffet para combinar o sinal. */
export function mensagemPreReserva(buffet: string, r: ResumoMensagem): string {
  return `Olá, ${buffet}! Fiz a pré-reserva pelo link (orçamento nº ${r.numero ?? ''}): ${detalhes(r)}. Como faço para pagar o sinal?`;
}

/** Nenhum pacote serve: o cliente fala direto com o buffet. */
export function mensagemSemPacote(buffet: string, r: ResumoMensagem): string {
  return `Olá, ${buffet}! Quero um orçamento: ${detalhes(r)}. Não encontrei um pacote para essa quantidade.`;
}

/** Envio da proposta pelo vendedor: texto curto com o link. */
export function mensagemEnvioProposta(buffet: string, cliente: string, link: string): string {
  const primeiro = cliente.trim().split(/\s+/)[0] ?? cliente;
  return `Olá, ${primeiro}! Segue a proposta da sua festa no ${buffet}: ${link}`;
}
