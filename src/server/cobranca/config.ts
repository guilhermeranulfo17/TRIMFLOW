/*
 * Configuração da cobrança (Asaas). Sem as três variáveis, a cobrança fica desligada e a tela
 * de Plano mostra "Fale com a gente no WhatsApp" (nada quebra).
 *
 *   ASAAS_API_KEY        chave da API (secreta; nunca NEXT_PUBLIC_)
 *   ASAAS_AMBIENTE       sandbox | producao
 *   ASAAS_WEBHOOK_TOKEN  token que o Asaas manda no header asaas-access-token (secreto)
 *   ASAAS_API_URL        opcional e SÓ com sandbox: aponta para a API falsa dos testes
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

export const cobrancaDisponivel = (env?: Record<string, string | undefined>): boolean =>
  configAsaas(env) !== null;
