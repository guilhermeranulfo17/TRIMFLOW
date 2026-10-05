import 'server-only';
import { montarEmail } from '@/domain/email/modelos';
import { urlResend, type ConfigEmail } from '@/server/env';
import type { Canal, EntregaParaEnviar, ResultadoEnvio } from './tipos';

export const URL_RESEND = 'https://api.resend.com/emails';

/**
 * E-mail transacional pelo Resend, com fetch (sem SDK). Só avisos da conta (domain/email/modelos).
 * O cabeçalho Idempotency-Key é o id da entrega: uma nova tentativa depois de um tempo esgotado
 * nunca vira um segundo e-mail. 4xx (exceto 429) = não adianta repetir; 429 e 5xx = tentar de novo.
 */
export function criarCanalEmail(
  config: ConfigEmail | null,
  o: { site?: string; fetch?: typeof fetch } = {},
): Canal {
  const fazerFetch = o.fetch ?? fetch;
  return {
    nome: 'email',
    configurado: () => config !== null && Boolean(o.site),
    async enviar(e: EntregaParaEnviar): Promise<ResultadoEnvio> {
      if (!config || !o.site) return { resultado: 'ignorado', erro: 'CANAL_DESLIGADO' };
      if (!e.email) return { resultado: 'ignorado', erro: 'SEM_EMAIL' };
      const email = montarEmail(e.aviso.tipo, e.aviso.dados, { site: o.site, fuso: e.fuso });
      if (!email) return { resultado: 'ignorado', erro: 'SEM_MODELO' };
      let r: Response;
      try {
        r = await fazerFetch(urlResend(), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.chave}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': e.entregaId,
          },
          body: JSON.stringify({
            from: config.remetente,
            to: [e.email],
            subject: email.assunto,
            html: email.html,
            text: email.texto,
            tags: [{ name: 'tipo', value: e.aviso.tipo }],
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        return { resultado: 'erro', erro: 'EMAIL_REDE' };
      }
      if (r.ok) return { resultado: 'enviado' };
      if (r.status === 429 || r.status >= 500)
        return { resultado: 'erro', erro: `EMAIL_${r.status}` };
      return { resultado: 'ignorado', erro: `EMAIL_${r.status}` };
    },
  };
}
