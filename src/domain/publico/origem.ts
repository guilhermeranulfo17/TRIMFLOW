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
};

/** `?origem=` do link → origem do lead. Ausente ou desconhecida = link direto. */
export function origemDoParametro(valor: string | string[] | undefined | null): OrigemLead {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (!bruto) return 'link_direto';
  return APELIDOS[bruto.trim().toLowerCase()] ?? 'link_direto';
}

/** Origens que o dono pode divulgar em "Link e divulgação". */
export const ORIGENS_DIVULGACAO = [
  { origem: 'instagram', rotulo: 'Instagram' },
  { origem: 'google', rotulo: 'Google' },
  { origem: 'whatsapp', rotulo: 'WhatsApp' },
] as const satisfies readonly { origem: OrigemLead; rotulo: string }[];

export const ROTULO_ORIGEM: Record<OrigemLead, string> = {
  instagram: 'Instagram',
  google: 'Google',
  indicacao: 'Indicação',
  whatsapp: 'WhatsApp',
  link_direto: 'Link direto',
  interno: 'Cadastro interno',
  outro: 'Outro',
};
