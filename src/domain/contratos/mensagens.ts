/*
 * Mensagens prontas do contrato para o WhatsApp (o dono envia; nada é automático para o
 * cliente).
 */

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/** Envio do contrato com o link. */
export function mensagemEnvioContrato(buffet: string, cliente: string, link: string): string {
  return `Olá, ${primeiroNome(cliente)}! Segue o contrato da sua festa no ${buffet}. Dá para ler e assinar pelo celular em 2 minutos: ${link}`;
}

/** Lembrete de quem ainda não assinou. */
export function mensagemLembreteContrato(buffet: string, cliente: string, link: string): string {
  return `Oi, ${primeiroNome(cliente)}! Passando para lembrar do contrato da sua festa no ${buffet}. É só abrir o link, conferir e assinar: ${link}`;
}
