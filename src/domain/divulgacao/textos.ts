import { linkComOrigem } from '../publico/origem';

/*
 * Textos prontos de "Link e divulgação" (e do passo 5 do onboarding). Cada texto já leva o link
 * com a origem certa, para o dono ver em Números de onde vêm os leads.
 */

export type DadosDivulgacao = {
  /** nome do buffet */
  nome: string;
  /** link principal, sem parâmetros (ex.: https://orkestra.app/b/buffet-alegria) */
  link: string;
  cidade?: string | null;
};

const limpar = (s: string) => s.replace(/\s+/g, ' ').trim();
const emCidade = (cidade?: string | null) => (cidade?.trim() ? ` em ${limpar(cidade)}` : '');

/** Bio do Instagram (curta: cabe nos 150 caracteres com um link curto). */
export function bioInstagram(d: DadosDivulgacao): string {
  return `🎉 Monte o orçamento da sua festa em 2 minutos e veja as datas livres 👇\n${linkComOrigem(d.link, 'instagram')}`;
}

/** Resposta automática (saudação) do WhatsApp Business. */
export function respostaAutomaticaWhatsApp(d: DadosDivulgacao): string {
  return `Oi! Monte seu orçamento em 2 minutos e veja as datas livres: ${linkComOrigem(d.link, 'whatsapp')}`;
}

/** Mensagem de ausência do WhatsApp Business. */
export function mensagemAusenciaWhatsApp(d: DadosDivulgacao): string {
  return (
    `Oi! Agora estamos fora do horário de atendimento do ${limpar(d.nome)}. ` +
    `Enquanto isso, você já pode montar seu orçamento e ver as datas livres: ` +
    `${linkComOrigem(d.link, 'whatsapp')}. Respondemos assim que voltarmos!`
  );
}

/** Post de lançamento para o Instagram. */
export function postLancamento(d: DadosDivulgacao): string {
  return (
    `Novidade no ${limpar(d.nome)}! 🎈\n\n` +
    `Agora você monta o orçamento da sua festa sozinho, na hora, pelo celular: escolhe a data, ` +
    `o pacote e vê o preço e as datas livres${emCidade(d.cidade)}.\n\n` +
    `É só tocar no link da bio ou acessar: ${linkComOrigem(d.link, 'instagram')}`
  );
}

/** Status do WhatsApp. */
export function statusWhatsApp(d: DadosDivulgacao): string {
  return `Agora você monta o orçamento da sua festa sozinho e vê as datas livres na hora 🎉 ${linkComOrigem(d.link, 'whatsapp')}`;
}

export type TextoPronto = { chave: string; titulo: string; texto: string };

export function textosProntos(d: DadosDivulgacao): TextoPronto[] {
  return [
    { chave: 'bio', titulo: 'Bio do Instagram', texto: bioInstagram(d) },
    {
      chave: 'resposta',
      titulo: 'Resposta automática do WhatsApp Business',
      texto: respostaAutomaticaWhatsApp(d),
    },
    {
      chave: 'ausencia',
      titulo: 'Mensagem de ausência do WhatsApp Business',
      texto: mensagemAusenciaWhatsApp(d),
    },
    { chave: 'post', titulo: 'Post de lançamento no Instagram', texto: postLancamento(d) },
    { chave: 'status', titulo: 'Status do WhatsApp', texto: statusWhatsApp(d) },
  ];
}
