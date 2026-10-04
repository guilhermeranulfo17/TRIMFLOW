import 'server-only';
import { criarAuthAdmin, criarStorageAdmin } from '@/server/auth/admin-supabase';
import { obterDb } from '@/server/db/client';
import type { DepsExclusao } from './exclusao';

/** Dependências reais da exclusão definitiva (a rota não importa a service role direto). */
export function depsExclusao(): DepsExclusao {
  return { db: obterDb(), storage: criarStorageAdmin(), auth: criarAuthAdmin() };
}
