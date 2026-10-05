import { textoAviso, type DadosAviso } from '../avisos/textos';
import { recebeEmail, type TipoAviso } from '../avisos/canais';

/*
 * E-mails do produto (Etapa 9B, B.4). O texto é o mesmo do aviso (painel e push); aqui só vira um
 * e-mail simples com a marca do Orkestra (grafite, limão, Manrope com fallback). HTML em tabelas
 * e estilo inline (os clientes de e-mail ignoram <style>), uma versão em texto puro e todo link
 * absoluto a partir da URL do site.
 */

export type EmailMontado = { assunto: string; html: string; texto: string };

const GRAFITE = '#0c0c0c';
const LIMAO = '#3ee42e';
const GELO = '#f6f7f5';
const CINZA = '#55575a';

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ROTULO_BOTAO: Partial<Record<TipoAviso, string>> = {
  boas_vindas: 'Configurar meu link',
  teste_acabando: 'Ver os planos',
  fatura_criada: 'Ver a fatura',
  pagamento_confirmado: 'Abrir o painel',
  pagamento_falhou: 'Pagar agora',
  conta_suspensa: 'Assinar e voltar',
  exportacao_pronta: 'Abrir Privacidade e dados',
  exclusao_agendada: 'Baixar dados ou desistir',
};

/** Monta o e-mail de um aviso de conta. null se o tipo não vai por e-mail. */
export function montarEmail(
  tipo: TipoAviso,
  dados: DadosAviso,
  o: { site: string; fuso?: string; agora?: Date },
): EmailMontado | null {
  if (!recebeEmail(tipo)) return null;
  const site = o.site.replace(/\/+$/, '');
  const t = textoAviso(tipo, dados, { fuso: o.fuso, agora: o.agora });
  const destino = `${site}${t.caminho}`;
  const linkFatura =
    (tipo === 'fatura_criada' || tipo === 'pagamento_falhou') &&
    typeof dados.link_fatura === 'string' &&
    /^https:\/\//.test(dados.link_fatura)
      ? dados.link_fatura
      : null;
  const linkBuffet =
    tipo === 'boas_vindas' && typeof dados.slug === 'string' && /^[a-z0-9-]+$/.test(dados.slug)
      ? `${site}/b/${dados.slug}`
      : null;
  const botao = ROTULO_BOTAO[tipo] ?? 'Abrir o Orkestra';
  const urlBotao = linkFatura ?? destino;

  const linhas = [
    t.corpo,
    linkBuffet ? `O link do seu buffet: ${linkBuffet}` : null,
    `${botao}: ${urlBotao}`,
  ].filter(Boolean) as string[];
  const texto = `${t.titulo}\n\n${linhas.join('\n\n')}\n\n--\nOrkestra · ${site}\nVocê recebe este e-mail porque é o dono de uma conta no Orkestra.\n`;

  const paragrafo = (conteudo: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${GRAFITE}">${conteudo}</p>`;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(t.titulo)}</title></head>
<body style="margin:0;padding:0;background:${GELO};font-family:Manrope,'Segoe UI',Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GELO};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${GRAFITE};padding:20px 24px">
<span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:${LIMAO};vertical-align:middle"></span>
<span style="color:#f4f4f2;font-size:20px;font-weight:800;vertical-align:middle;margin-left:8px">Orkestra</span>
</td></tr>
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:${GRAFITE}">${escaparHtml(t.titulo)}</h1>
${paragrafo(escaparHtml(t.corpo))}
${linkBuffet ? paragrafo(`O link do seu buffet: <a href="${escaparHtml(linkBuffet)}" style="color:#0f766e;font-weight:700">${escaparHtml(linkBuffet.replace(/^https?:\/\//, ''))}</a>`) : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:${LIMAO};border-radius:999px">
<a href="${escaparHtml(urlBotao)}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:700;color:${GRAFITE};text-decoration:none">${escaparHtml(botao)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:16px 24px 24px;border-top:1px solid #e6e7e3">
<p style="margin:0;font-size:12px;line-height:18px;color:${CINZA}">Você recebe este e-mail porque é o dono de uma conta no Orkestra. <a href="${escaparHtml(site)}/app/conta/avisos" style="color:${CINZA}">Minha conta</a> · <a href="${escaparHtml(site)}/privacidade" style="color:${CINZA}">Privacidade</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { assunto: t.titulo, html, texto };
}
