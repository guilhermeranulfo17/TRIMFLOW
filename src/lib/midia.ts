/** URL pública de um arquivo do bucket "midia" (serve no servidor e no navegador). */
export function urlPublicaMidia(caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/midia/${caminho}`;
}
