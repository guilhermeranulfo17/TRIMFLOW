import 'server-only';
import type { EmailMontado } from '@/domain/email/modelos';
import { configEmail, urlResend, type ConfigEmail } from '@/server/env';

/*
 * Envio direto pelo Resend (fetch, sem SDK) dos e-mails do contrato ao cliente final. Exceção
 * aprovada na Etapa 10 à regra "e-mail só pela fila": o código precisa chegar na hora, com a
 * pessoa esperando na página. Idempotency-Key = id do código (ou do envio): repetir a chamada
 * nunca vira um segundo e-mail. Nada pessoal no log: só códigos de erro.
 */

export type ResultadoEmail = { ok: true } | { ok: false; erro: string };

export async function enviarEmailContrato(
  para: string,
  email: EmailMontado,
  chaveIdempotencia: string,
  o: { config?: ConfigEmail | null; fetch?: typeof fetch; tag?: string } = {},
): Promise<ResultadoEmail> {
  const config = o.config === undefined ? configEmail() : o.config;
  if (!config) return { ok: false, erro: 'CANAL_DESLIGADO' };
  let r: Response;
  try {
    r = await (o.fetch ?? fetch)(urlResend(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.chave}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': chaveIdempotencia,
      },
      body: JSON.stringify({
        from: config.remetente,
        to: [para],
        subject: email.assunto,
        html: email.html,
        text: email.texto,
        tags: [{ name: 'tipo', value: o.tag ?? 'contrato' }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, erro: 'EMAIL_REDE' };
  }
  return r.ok ? { ok: true } : { ok: false, erro: `EMAIL_${r.status}` };
}
