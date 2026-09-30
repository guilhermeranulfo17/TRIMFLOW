'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase do navegador (sessão pelos cookies). Usado só para enviar imagens ao
 * Storage: as policies do bucket garantem que só o dono grava na pasta da própria empresa.
 */
export function criarClienteSupabaseNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
