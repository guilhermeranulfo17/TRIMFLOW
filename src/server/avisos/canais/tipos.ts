import type { CanalExterno, TipoAviso } from '@/domain/avisos/canais';

/** Uma entrega reservada na fila, pronta para sair por um canal. */
export type EntregaParaEnviar = {
  entregaId: string;
  canal: CanalExterno;
  tentativas: number;
  aviso: {
    id: string;
    tipo: TipoAviso;
    dados: Record<string, unknown>;
    leadId: string | null;
    agrupados: number;
  };
  fuso: string;
  whatsappNumero: string | null;
  inscricoes: { endpoint: string; p256dh: string; auth: string }[];
};

/**
 * enviado: saiu. ignorado: não há como enviar (canal desligado, sem destino, sem modelo).
 * erro: tentar de novo depois (espera crescente; "falhou" na 5ª). O código vai para o banco
 * (nunca dados pessoais).
 */
export type ResultadoEnvio =
  | { resultado: 'enviado'; endpointsInvalidos?: string[] }
  | { resultado: 'ignorado'; erro: string; endpointsInvalidos?: string[] }
  | { resultado: 'erro'; erro: string; endpointsInvalidos?: string[] };

export interface Canal {
  nome: CanalExterno;
  configurado(): boolean;
  enviar(e: EntregaParaEnviar): Promise<ResultadoEnvio>;
}
