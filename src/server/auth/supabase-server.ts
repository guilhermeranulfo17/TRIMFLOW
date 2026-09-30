import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabasePublico } from '@/server/env';

/**
 * Cliente Supabase do servidor (Server Components, Server Actions e Route Handlers),
 * autenticado pelos cookies da requisição. Crie um por requisição.
 * Usa a chave pública (anon): nada de service role aqui.
 */
export async function criarClienteSupabase() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabasePublico();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesParaGravar) {
        try {
          for (const { name, value, options } of cookiesParaGravar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components não podem gravar cookies; o middleware renova a sessão.
        }
      },
    },
  });
}
