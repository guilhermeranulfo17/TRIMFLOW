import 'server-only';
import type { CanalExterno, TipoAviso } from '@/domain/avisos/canais';
import { concluirEntregaAviso, reservarEntregasAvisos } from '@/server/db/admin';
import { configVapid, configWhatsapp } from '@/server/env';
import { criarCanalPush } from './canais/push';
import type { Canal, EntregaParaEnviar, ResultadoEnvio } from './canais/tipos';
import { criarCanalWhatsapp } from './canais/whatsapp';
import { logar } from '@/server/log';

/*
 * Processador da fila de avisos. Roda sem usuário logado (pg_cron → /api/avisos/processar,
 * ou after() logo depois da ação), pelas duas funções da fila em server/db/admin.ts.
 * O envio acontece FORA de transação: falha de envio nunca desfaz a ação de ninguém.
 * Logs só com contagens e códigos, nada pessoal.
 */

type LinhaFila = {
  entrega_id: string;
  canal: CanalExterno;
  tentativas: number;
  aviso_id: string;
  tipo: TipoAviso;
  dados: Record<string, unknown>;
  lead_id: string | null;
  agrupados: number;
  usuario_id: string;
  fuso: string;
  whatsapp_numero: string | null;
  inscricoes: { endpoint: string; p256dh: string; auth: string }[] | null;
};

export type Resumo = { processadas: number; enviadas: number; erros: number; ignoradas: number };

export function canaisPadrao(): Canal[] {
  return [criarCanalPush(configVapid()), criarCanalWhatsapp(configWhatsapp())];
}

async function enviarUma(canais: Canal[], e: EntregaParaEnviar): Promise<ResultadoEnvio> {
  const canal = canais.find((c) => c.nome === e.canal);
  if (!canal || !canal.configurado()) return { resultado: 'ignorado', erro: 'CANAL_DESLIGADO' };
  try {
    return await canal.enviar(e);
  } catch {
    return { resultado: 'erro', erro: 'EXCECAO' };
  }
}

/** Processa até `lotes` lotes de entregas vencidas. Seguro para rodar em paralelo. */
export async function processarAvisos(
  o: { limite?: number; lotes?: number; canais?: Canal[] } = {},
): Promise<Resumo> {
  const canais = o.canais ?? canaisPadrao();
  const resumo: Resumo = { processadas: 0, enviadas: 0, erros: 0, ignoradas: 0 };
  for (let lote = 0; lote < (o.lotes ?? 3); lote++) {
    const linhas = await reservarEntregasAvisos<LinhaFila>(o.limite ?? 50);
    if (linhas.length === 0) break;
    await Promise.all(
      linhas.map(async (l) => {
        const r = await enviarUma(canais, {
          entregaId: l.entrega_id,
          canal: l.canal,
          tentativas: l.tentativas,
          aviso: {
            id: l.aviso_id,
            tipo: l.tipo,
            dados: l.dados ?? {},
            leadId: l.lead_id,
            agrupados: l.agrupados,
          },
          fuso: l.fuso,
          whatsappNumero: l.whatsapp_numero,
          inscricoes: l.inscricoes ?? [],
        });
        await concluirEntregaAviso(
          l.entrega_id,
          r.resultado,
          r.resultado === 'enviado' ? null : r.erro,
          r.endpointsInvalidos ?? [],
        );
        resumo.processadas += 1;
        if (r.resultado === 'enviado') resumo.enviadas += 1;
        else if (r.resultado === 'erro') resumo.erros += 1;
        else resumo.ignoradas += 1;
      }),
    );
  }
  if (resumo.processadas > 0) logar('info', 'avisos.fila_processada', { ...resumo });
  return resumo;
}

/** Para o after(): nunca lança (a resposta ao usuário já foi). */
export async function processarAvisosSemFalhar(): Promise<void> {
  try {
    await processarAvisos({ lotes: 1 });
  } catch {
    logar('erro', 'avisos.fila_falhou');
  }
}
