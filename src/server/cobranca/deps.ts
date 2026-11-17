import 'server-only';
import { obterDb } from '@/server/db/client';
import { logar } from '@/server/log';
import { criarClienteAsaas } from './asaas';
import { configAsaasParaCobrar } from './config';
import type { DepsCobranca } from './fluxos';

/**
 * Dependências reais da cobrança (null = cobrança desligada). Na produção com o Asaas ainda no
 * sandbox também devolve null: nenhuma cobrança de teste nasce para um buffet de verdade (§99).
 */
export function depsCobranca(): DepsCobranca | null {
  const { config, motivo } = configAsaasParaCobrar();
  if (motivo === 'SANDBOX_EM_PRODUCAO') {
    logar('erro', 'cobranca.sandbox_em_producao', { motivo });
  }
  if (!config) return null;
  return { db: obterDb(), asaas: criarClienteAsaas(config) };
}
