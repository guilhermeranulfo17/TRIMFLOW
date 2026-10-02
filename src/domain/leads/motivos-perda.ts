/** Motivos de perda do lead (enum public.motivo_perda). "Outro" exige o detalhe. */
export const MOTIVOS_PERDA = [
  { codigo: 'preco', rotulo: 'Preço' },
  { codigo: 'data_indisponivel', rotulo: 'Data indisponível' },
  { codigo: 'concorrente', rotulo: 'Fechou com outro buffet' },
  { codigo: 'desistiu', rotulo: 'Desistiu da festa' },
  { codigo: 'sem_resposta', rotulo: 'Parou de responder' },
  { codigo: 'fora_da_area', rotulo: 'Fora da área' },
  { codigo: 'outro', rotulo: 'Outro' },
] as const;

export type MotivoPerda = (typeof MOTIVOS_PERDA)[number]['codigo'];

export const CODIGOS_MOTIVO_PERDA = MOTIVOS_PERDA.map((m) => m.codigo) as MotivoPerda[];

export function rotuloMotivoPerda(codigo: string | null | undefined): string | null {
  return MOTIVOS_PERDA.find((m) => m.codigo === codigo)?.rotulo ?? null;
}

/** O detalhe é obrigatório só em "outro" (até 300 caracteres). */
export function validarPerda(codigo: MotivoPerda, detalhe: string): string | null {
  const d = detalhe.trim();
  if (codigo === 'outro' && !d) return 'Conte o motivo em poucas palavras.';
  if (d.length > 300) return 'Use no máximo 300 caracteres.';
  return null;
}
