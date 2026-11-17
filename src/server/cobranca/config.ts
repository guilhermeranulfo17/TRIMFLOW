/*
 * Configuração da cobrança (Asaas). Sem as três variáveis, a cobrança fica desligada e a tela
 * de Plano mostra "Fale com a gente no WhatsApp" (nada quebra).
 *
 *   ASAAS_API_KEY        chave da API (secreta; nunca NEXT_PUBLIC_)
 *   ASAAS_AMBIENTE       sandbox | producao
 *   ASAAS_WEBHOOK_TOKEN  token que o Asaas manda no header asaas-access-token (secreto)
 *   ASAAS_API_URL        opcional e SÓ com sandbox: aponta para a API falsa dos testes
 *
 * Trava (análise de 17/11/2026, §99): na produção da Vercel (VERCEL_ENV=production) o sandbox não
 * cria nem altera cobrança nenhuma (depsCobranca devolve null e registra o aviso no log). O webhook
 * continua recebendo, para as cobranças de teste antigas terminarem de forma consistente.
 */

export type AmbienteAsaas = 'sandbox' | 'producao';

export type ConfigAsaas = {
  apiKey: string;
  ambiente: AmbienteAsaas;
  webhookToken: string;
  urlBase: string;
};

export const URL_ASAAS: Record<AmbienteAsaas, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
};

export function configAsaas(
  env: Record<string, string | undefined> = process.env,
): ConfigAsaas | null {
  const apiKey = env.ASAAS_API_KEY?.trim();
  const ambiente = env.ASAAS_AMBIENTE?.trim();
  const webhookToken = env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!apiKey || !webhookToken || (ambiente !== 'sandbox' && ambiente !== 'producao')) return null;
  const outra = env.ASAAS_API_URL?.trim().replace(/\/+$/, '');
  return {
    apiKey,
    ambiente,
    webhookToken,
    urlBase: ambiente === 'sandbox' && outra ? outra : URL_ASAAS[ambiente],
  };
}

/** A tela de Plano oferece assinar só quando dá para cobrar de verdade (sandbox na produção: não). */
export const cobrancaDisponivel = (env?: Record<string, string | undefined>): boolean =>
  configAsaasParaCobrar(env).config !== null;

/** Produção da Vercel (o ambiente que atende os buffets de verdade). */
export const ehProducaoVercel = (env: Record<string, string | undefined> = process.env): boolean =>
  env.VERCEL_ENV?.trim() === 'production';

/** Asaas de teste (sandbox ou qualquer URL de sandbox) rodando na produção. */
export function asaasSandboxEmProducao(
  config: ConfigAsaas | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!config || !ehProducaoVercel(env)) return false;
  return config.ambiente === 'sandbox' || /sandbox/i.test(config.urlBase);
}

/**
 * Configuração para CRIAR ou ALTERAR cobranças: null se a cobrança está desligada ou se é o
 * sandbox na produção (motivo devolvido para o log e o /interno).
 */
export function configAsaasParaCobrar(env: Record<string, string | undefined> = process.env): {
  config: ConfigAsaas | null;
  motivo: 'DESLIGADA' | 'SANDBOX_EM_PRODUCAO' | null;
} {
  const config = configAsaas(env);
  if (!config) return { config: null, motivo: 'DESLIGADA' };
  if (asaasSandboxEmProducao(config, env)) return { config: null, motivo: 'SANDBOX_EM_PRODUCAO' };
  return { config, motivo: null };
}
