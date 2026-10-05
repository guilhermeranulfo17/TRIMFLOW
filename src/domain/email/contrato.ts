import { escaparHtml, type EmailMontado } from './modelos';

/*
 * E-mails ao cliente final do buffet (Etapa 10): só os do contrato, e só por ação de alguém (o
 * cliente pede o código; o dono manda o link ou a cópia). Nada de marketing. Visual neutro: o
 * remetente é o Orkestra em nome do buffet, que aparece no assunto e no texto.
 */

const GRAFITE = '#0c0c0c';
const GELO = '#f6f7f5';
const CINZA = '#55575a';

function moldura(titulo: string, conteudo: string, rodape: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(titulo)}</title></head>
<body style="margin:0;padding:0;background:${GELO};font-family:Manrope,'Segoe UI',Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GELO};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:${GRAFITE}">${escaparHtml(titulo)}</h1>
${conteudo}
</td></tr>
<tr><td style="padding:16px 24px 24px;border-top:1px solid #e6e7e3">
<p style="margin:0;font-size:12px;line-height:18px;color:${CINZA}">${rodape}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Código de 6 dígitos para assinar (vale 10 minutos). */
export function emailCodigoContrato(d: {
  buffet: string;
  codigo: string;
  contrato: string;
}): EmailMontado {
  const assunto = `${d.codigo} é o seu código para assinar o contrato do ${d.buffet}`;
  const titulo = 'Seu código para assinar o contrato';
  const p = (t: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${GRAFITE}">${t}</p>`;
  const html = moldura(
    titulo,
    [
      p(
        `Use este código para assinar o contrato ${escaparHtml(d.contrato)} do ${escaparHtml(d.buffet)}:`,
      ),
      `<p style="margin:0 0 16px;font-size:32px;line-height:40px;font-weight:800;letter-spacing:6px;color:${GRAFITE}">${escaparHtml(d.codigo)}</p>`,
      p('Ele vale por 10 minutos. Se você não pediu este código, pode ignorar este e-mail.'),
    ].join('\n'),
    `Enviado pelo Orkestra a pedido do ${escaparHtml(d.buffet)}. Nunca pedimos este código por telefone.`,
  );
  const texto = `${titulo}\n\nUse este código para assinar o contrato ${d.contrato} do ${d.buffet}: ${d.codigo}\n\nEle vale por 10 minutos. Se você não pediu este código, pode ignorar este e-mail.\n\n--\nEnviado pelo Orkestra a pedido do ${d.buffet}.\n`;
  return { assunto, html, texto };
}
