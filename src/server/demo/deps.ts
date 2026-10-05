import 'server-only';
import { criarAuthDemo } from '@/server/auth/admin-supabase';
import { obterDb } from '@/server/db/client';
import { demoSlug } from '@/server/env';
import type { DepsDemo } from './recriar';

/** Dependências reais da demo; null quando NEXT_PUBLIC_DEMO_SLUG não está configurado. */
export function depsDemo(): DepsDemo | null {
  const slug = demoSlug();
  if (!slug) return null;
  return { db: obterDb(), auth: criarAuthDemo(), slug };
}
