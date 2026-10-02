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

/**
 * Segredo da rota /api/avisos/processar (chamada pelo pg_cron via pg_net, com
 * "Authorization: Bearer <CRON_SECRET>"). Sem ele a rota recusa tudo; os avisos imediatos
 * continuam saindo pelo after() das ações.
 */
export function cronSecret(): string | null {
  return process.env.CRON_SECRET?.trim() || null;
}

export type ConfigVapid = { publica: string; privada: string; sujeito: string };

/** Chaves VAPID do push (pnpm vapid:gerar). Sem elas, o canal push fica desligado. */
export function configVapid(): ConfigVapid | null {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  const sujeito = process.env.VAPID_SUBJECT?.trim();
  if (!publica || !privada || !sujeito) return null;
  return { publica, privada, sujeito };
}

export type ConfigWhatsapp = { token: string; phoneNumberId: string };

/** API oficial do WhatsApp (Meta Cloud API). Vazias = canal desligado (nada quebra). */
export function configWhatsapp(): ConfigWhatsapp | null {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
}
