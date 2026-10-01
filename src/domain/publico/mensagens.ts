import { traduzirErroAgenda } from '../agenda/mensagens';

/** Códigos das funções do schema publico → mensagens simples para o cliente final. */
export const MENSAGENS_PUBLICO: Record<string, string> = {
  PUBLICO_NAO_ENCONTRADO: 'Não encontramos este buffet.',
  PUBLICO_SUSPENSO:
    'Este buffet não está recebendo orçamentos pelo link agora. Fale com ele pelo WhatsApp.',
  PUBLICO_DADOS_INVALIDOS: 'Confira os dados e tente de novo.',
  PUBLICO_PERIODO_INVALIDO: 'Escolha um período menor.',
  PUBLICO_ORCAMENTO_NAO_ENCONTRADO: 'Não encontramos este orçamento. Monte um novo.',
  PUBLICO_ORCAMENTO_FECHADO:
    'Este orçamento já foi fechado. Para mudar algo, fale com o buffet pelo WhatsApp.',
  ORCAMENTO_EXPIRADO: 'Esta proposta expirou. Refaça com os preços atuais.',
  LIMITE_EXCEDIDO: 'Muitas tentativas. Tente de novo em alguns minutos.',
};

export const MENSAGEM_PUBLICO_PADRAO =
  'Não foi possível continuar agora. Tente de novo em instantes.';

export function traduzirErroPublico(codigo: string | undefined): string {
  if (!codigo) return MENSAGEM_PUBLICO_PADRAO;
  return MENSAGENS_PUBLICO[codigo] ?? traduzirErroAgenda(codigo) ?? MENSAGEM_PUBLICO_PADRAO;
}
