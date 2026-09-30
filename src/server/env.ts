/**
 * Leitura centralizada de variáveis de ambiente.
 * Só as com prefixo NEXT_PUBLIC_ chegam ao navegador. DATABASE_URL e chaves secretas nunca.
 */

function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) throw new Error(`Variável de ambiente ausente: ${nome}. Veja .env.example.`);
  return valor;
}

export function supabasePublico() {
  return {
    url: obrigatoria('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: obrigatoria(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

/** URL pública do app (links em e-mails). Sem barra no final. */
export function urlDoSite(): string | undefined {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || undefined;
}
