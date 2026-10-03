import 'server-only';
import { obterDb } from '@/server/db/client';
import { criarClienteAsaas } from './asaas';
import { configAsaas } from './config';
import type { DepsCobranca } from './fluxos';

/** Dependências reais da cobrança (null = Asaas não configurado: cobrança desligada). */
export function depsCobranca(): DepsCobranca | null {
  const config = configAsaas();
  if (!config) return null;
  return { db: obterDb(), asaas: criarClienteAsaas(config) };
}
