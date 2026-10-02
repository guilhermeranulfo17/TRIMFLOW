import 'server-only';
import webpush from 'web-push';
import { textoAviso } from '@/domain/avisos/textos';
import type { ConfigVapid } from '@/server/env';
import type { Canal, EntregaParaEnviar, ResultadoEnvio } from './tipos';

type EnviarPush = (
  inscricao: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  opcoes: { vapidDetails: { subject: string; publicKey: string; privateKey: string }; TTL: number },
) => Promise<unknown>;

/**
 * Web Push (VAPID). Um aviso vai para todos os aparelhos do usuário; basta um receber para
 * contar como enviado. 404/410 = inscrição morta: o banco apaga o endpoint.
 */
export function criarCanalPush(
  vapid: ConfigVapid | null,
  enviar: EnviarPush = webpush.sendNotification as unknown as EnviarPush,
): Canal {
  return {
    nome: 'push',
    configurado: () => vapid !== null,
    async enviar(e: EntregaParaEnviar): Promise<ResultadoEnvio> {
      if (!vapid) return { resultado: 'ignorado', erro: 'CANAL_DESLIGADO' };
      if (e.inscricoes.length === 0) return { resultado: 'ignorado', erro: 'SEM_INSCRICAO' };
      const t = textoAviso(e.aviso.tipo, e.aviso.dados, {
        leadId: e.aviso.leadId,
        fuso: e.fuso,
        agrupados: e.aviso.agrupados,
      });
      const payload = JSON.stringify({
        titulo: t.titulo,
        corpo: t.corpo,
        url: t.caminho,
        tag: e.aviso.id,
      });
      const invalidos: string[] = [];
      const erros: string[] = [];
      let algum = false;
      await Promise.all(
        e.inscricoes.map(async (i) => {
          try {
            await enviar(
              { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
              payload,
              {
                vapidDetails: {
                  subject: vapid.sujeito,
                  publicKey: vapid.publica,
                  privateKey: vapid.privada,
                },
                TTL: 60 * 60 * 24,
              },
            );
            algum = true;
          } catch (erro) {
            const status = (erro as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) invalidos.push(i.endpoint);
            else erros.push(`PUSH_${status ?? 'REDE'}`);
          }
        }),
      );
      if (algum) return { resultado: 'enviado', endpointsInvalidos: invalidos };
      // todos os aparelhos estavam mortos (404/410): nada a tentar de novo
      if (erros.length === 0) {
        return { resultado: 'ignorado', erro: 'SEM_INSCRICAO', endpointsInvalidos: invalidos };
      }
      return { resultado: 'erro', erro: erros[0]!, endpointsInvalidos: invalidos };
    },
  };
}
