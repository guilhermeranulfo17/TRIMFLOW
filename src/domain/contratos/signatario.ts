import { cpfValido, limparDocumento } from '../cobranca/documento';

/*
 * Dados de quem assina pelo link: nome completo e CPF. O CPF é conferido pelos dígitos
 * verificadores, guardado cifrado e mostrado sempre mascarado.
 */

export { cpfValido };

/** Espaços simples, sem espaço nas pontas. */
export function normalizarNome(nome: string): string {
  return nome.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Pelo menos duas palavras com 2+ letras ("Ana Souza"); só letras, espaço, hífen e apóstrofo. */
export function nomeCompletoValido(nome: string): boolean {
  const n = normalizarNome(nome);
  if (n.length < 5 || n.length > 120) return false;
  if (!/^[\p{L}][\p{L}' .-]*[\p{L}.]$/u.test(n)) return false;
  return n.split(' ').filter((p) => p.replace(/[^\p{L}]/gu, '').length >= 2).length >= 2;
}

/** Só os 11 dígitos, ou null se não for um CPF válido. */
export function cpfLimpo(valor: string): string | null {
  const d = limparDocumento(valor);
  return cpfValido(d) ? d : null;
}

/** "***.456.789-**": só os 6 dígitos do meio aparecem (padrão de mascaramento da LGPD). */
export function mascararCpf(valor: string): string {
  const d = limparDocumento(valor);
  if (d.length !== 11) return '***.***.***-**';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export const REGEX_CPF_MASCARADO = /^\*\*\*\.\d{3}\.\d{3}-\*\*$/;

/** "j***@gmail.com": para a pessoa saber para qual e-mail foi o código, sem expor o endereço. */
export function mascararEmail(email: string): string {
  const [usuario = '', dominio = ''] = email.trim().split('@');
  if (!usuario || !dominio) return '***';
  return `${usuario[0]}***@${dominio}`;
}
