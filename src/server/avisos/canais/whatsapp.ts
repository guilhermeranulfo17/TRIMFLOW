import 'server-only';
import { MODELOS_WHATSAPP, textoAviso, variaveisWhatsApp } from '@/domain/avisos/textos';
import type { ConfigWhatsapp } from '@/server/env';
import type { Canal, EntregaParaEnviar, ResultadoEnvio } from './tipos';

/** Versão da Graph API da Meta (Cloud API do WhatsApp). */
export const VERSAO_GRAPH = 'v21.0';

/**
 * WhatsApp oficial (Meta Cloud API) com mensagens de modelo (utilidade, pt_BR). Só a API
 * oficial: nada de Z-API, Evolution, Baileys e similares. Sem configuração, o canal fica
 * desligado (entrega "ignorado"). Erro da Meta vira código (ex.: META_132001 = modelo não
 * aprovado; META_131026 = número sem WhatsApp) e nunca trava a fila.
 */
export function criarCanalWhatsapp(
  config: ConfigWhatsapp | null,
  o: { fetch?: typeof fetch } = {},
): Canal {
  const fazerFetch = o.fetch ?? fetch;
  return {
    nome: 'whatsapp',
    configurado: () => config !== null,
    async enviar(e: EntregaParaEnviar): Promise<ResultadoEnvio> {
      if (!config) return { resultado: 'ignorado', erro: 'CANAL_DESLIGADO' };
      const modelo = MODELOS_WHATSAPP[e.aviso.tipo];
      if (!modelo) return { resultado: 'ignorado', erro: 'SEM_MODELO' };
      if (!e.whatsappNumero) return { resultado: 'ignorado', erro: 'SEM_NUMERO' };
      const variaveis = variaveisWhatsApp(e.aviso.tipo, e.aviso.dados, { fuso: e.fuso });
      const { caminho } = textoAviso(e.aviso.tipo, e.aviso.dados, {
        leadId: e.aviso.leadId,
        fuso: e.fuso,
      });
      const componentes: unknown[] = [];
      if (variaveis.length > 0) {
        componentes.push({
          type: 'body',
          parameters: variaveis.map((text) => ({ type: 'text', text })),
        });
      }
      // botão de URL dos modelos: https://SITE/app/{{1}}
      componentes.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: caminho.replace(/^\/app\//, '') }],
      });
      try {
        const r = await fazerFetch(
          `https://graph.facebook.com/${VERSAO_GRAPH}/${config.phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: e.whatsappNumero.replace(/^\+/, ''),
              type: 'template',
              template: { name: modelo, language: { code: 'pt_BR' }, components: componentes },
            }),
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (r.ok) return { resultado: 'enviado' };
        const corpo = (await r.json().catch(() => null)) as { error?: { code?: number } } | null;
        const codigo = corpo?.error?.code ? `META_${corpo.error.code}` : `HTTP_${r.status}`;
        return { resultado: 'erro', erro: codigo };
      } catch {
        return { resultado: 'erro', erro: 'WHATSAPP_REDE' };
      }
    },
  };
}
