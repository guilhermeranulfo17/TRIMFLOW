import 'server-only';
import {
  criarStorageAdmin,
  storageAdminConfigurado,
  type StorageAdmin,
} from '@/server/auth/admin-supabase';
import { codigoDoErro, logar } from '@/server/log';
import type { Comprovante } from './carregar';
import { gerarPdfContrato, type IdentidadePdf } from './pdf';

/*
 * PDF final no bucket privado "contratos" ({empresa_id}/{contrato_id}.pdf), só com a service
 * role. É gerado na primeira vez que alguém pede depois da assinatura (o cliente logo depois de
 * assinar), guardado e marcado no banco. Se o Storage falhar, o PDF é gerado de novo a partir do
 * texto congelado: o conteúdo é o mesmo (mesmo texto, hash e registros).
 */

export const BUCKET_CONTRATOS = 'contratos';
export const caminhoPdfContrato = (empresaId: string, contratoId: string) =>
  `${empresaId}/${contratoId}.pdf`;

export type DepsArquivo = {
  storage?: StorageAdmin | null;
  /** grava pdf_gerado_em (publico.contrato_marcar_pdf ou public.contrato_marcar_pdf) */
  marcar: () => Promise<void>;
  gerar?: typeof gerarPdfContrato;
};

export function storagePadrao(): StorageAdmin | null {
  return storageAdminConfigurado() ? criarStorageAdmin() : null;
}

export async function obterPdfContrato(
  c: Comprovante,
  buffet: IdentidadePdf,
  d: DepsArquivo,
): Promise<Uint8Array> {
  const storage = d.storage === undefined ? storagePadrao() : d.storage;
  const caminho = caminhoPdfContrato(c.empresaId, c.id);
  if (c.pdfGeradoEm && storage) {
    try {
      const guardado = await storage.baixar(BUCKET_CONTRATOS, caminho);
      if (guardado) return guardado;
    } catch (erro) {
      logar('aviso', 'contrato.pdf_baixar_falhou', {
        contratoId: c.id,
        codigo: codigoDoErro(erro),
      });
    }
  }
  const pdf = new Uint8Array(await (d.gerar ?? gerarPdfContrato)(c, buffet));
  if (storage && !c.pdfGeradoEm) {
    try {
      await storage.enviar(BUCKET_CONTRATOS, caminho, pdf, 'application/pdf');
      await d.marcar();
    } catch (erro) {
      logar('aviso', 'contrato.pdf_guardar_falhou', {
        contratoId: c.id,
        codigo: codigoDoErro(erro),
      });
    }
  }
  return pdf;
}
