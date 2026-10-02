import type { OrigemLead } from './tipos';

const APELIDOS: Record<string, OrigemLead> = {
  instagram: 'instagram',
  insta: 'instagram',
  ig: 'instagram',
  google: 'google',
  whatsapp: 'whatsapp',
  wpp: 'whatsapp',
  zap: 'whatsapp',
  indicacao: 'indicacao',
  indicação: 'indicacao',
  outro: 'outro',
  qrcode: 'qrcode',
  qr: 'qrcode',
};

/** `?origem=` do link → origem do lead. Ausente ou desconhecida = link direto. */
export function origemDoParametro(valor: string | string[] | undefined | null): OrigemLead {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (!bruto) return 'link_direto';
  return APELIDOS[bruto.trim().toLowerCase()] ?? 'link_direto';
}

/** Origens que o dono pode divulgar em "Link e divulgação" (cada uma com o seu `?origem=`). */
export const ORIGENS_DIVULGACAO = [
  { origem: 'instagram', rotulo: 'Instagram (bio)' },
  { origem: 'whatsapp', rotulo: 'WhatsApp (resposta automática)' },
  { origem: 'google', rotulo: 'Google (perfil da empresa)' },
  { origem: 'indicacao', rotulo: 'Indicação' },
  { origem: 'qrcode', rotulo: 'QR code (impresso)' },
] as const satisfies readonly { origem: OrigemLead; rotulo: string }[];

/** Link do buffet com a origem (link direto não leva parâmetro). */
export function linkComOrigem(link: string, origem: OrigemLead): string {
  if (origem === 'link_direto' || origem === 'interno') return link;
  return `${link}${link.includes('?') ? '&' : '?'}origem=${origem}`;
}

export const ROTULO_ORIGEM: Record<OrigemLead, string> = {
  instagram: 'Instagram',
  google: 'Google',
  indicacao: 'Indicação',
  whatsapp: 'WhatsApp',
  link_direto: 'Link direto',
  interno: 'Cadastro interno',
  outro: 'Outro',
  qrcode: 'QR code',
};
