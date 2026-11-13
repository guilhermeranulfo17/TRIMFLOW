import 'server-only';
import { criarAuthApresentacao } from '@/server/auth/admin-supabase';
import { obterDb } from '@/server/db/client';
import type { DepsApresentacao } from './criar';

/** Dependências reais das contas de apresentação (Admin API do Auth + conexão administrativa). */
export function depsApresentacao(): DepsApresentacao {
  return { db: obterDb(), auth: criarAuthApresentacao() };
}
