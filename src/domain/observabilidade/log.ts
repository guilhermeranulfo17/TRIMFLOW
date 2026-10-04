/*
 * Linha de log estruturado (Etapa 9B, B.3): JSON numa linha, com id da requisição e sem dado
 * pessoal. Só valores simples entram; chave com cara de dado pessoal é descartada e texto com
 * e-mail ou telefone é mascarado (defesa extra: quem chama já deve mandar só ids e códigos).
 */

export type NivelLog = 'info' | 'aviso' | 'erro';
export type DadosLog = Record<string, string | number | boolean | null | undefined>;

/** Chaves que nunca vão para log nem para o Sentry. */
export const CHAVE_PESSOAL =
  /(^|_|-)(nome|name|email|e_mail|telefone|phone|whatsapp|celular|cpf|cnpj|documento|ip|endereco|address|senha|password|token|cookie|authorization|cliente|lead_nome|texto|mensagem|observac)/i;

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
/** 10 ou mais dígitos, com ou sem +, espaços, parênteses e hífens (telefones, CPF, CNPJ). */
const NUMERO_LONGO = /\+?\(?\d[\d\s().-]{8,}\d/g;

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function mascararTexto(texto: string): string {
  // ids (uuid) ficam: são o que permite achar o registro sem expor a pessoa
  return texto
    .split(UUID)
    .map((parte, i) =>
      i % 2 === 1
        ? parte
        : parte
            .replace(EMAIL, '[email]')
            .replace(NUMERO_LONGO, (m) => (m.replace(/\D/g, '').length >= 10 ? '[numero]' : m)),
    )
    .join('');
}

export function linhaDeLog(
  nivel: NivelLog,
  evento: string,
  dados: DadosLog = {},
  requisicao: string | null = null,
  agora = new Date(),
): string {
  const limpos: Record<string, string | number | boolean | null> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor === undefined || CHAVE_PESSOAL.test(chave)) continue;
    limpos[chave] = typeof valor === 'string' ? mascararTexto(valor).slice(0, 300) : valor;
  }
  return JSON.stringify({
    t: agora.toISOString(),
    nivel,
    evento: mascararTexto(evento).slice(0, 100),
    ...(requisicao ? { req: requisicao } : {}),
    ...limpos,
  });
}
