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

const SAL_DESENVOLVIMENTO = 'orkestra-dev-nao-use-em-producao';

/**
 * Sal do hash de IP do link público (`sha256(ip + IP_HASH_SALT)`; o IP nunca é salvo).
 * Obrigatória em produção: sem ela o servidor falha ao subir (src/instrumentation.ts).
 */
export function ipHashSalt(): string {
  const valor = process.env.IP_HASH_SALT;
  if (valor) return valor;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Variável de ambiente ausente: IP_HASH_SALT. Veja .env.example.');
  }
  return SAL_DESENVOLVIMENTO;
}
