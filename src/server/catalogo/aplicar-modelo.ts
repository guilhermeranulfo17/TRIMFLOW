'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { modeloDoSegmento } from '@/domain/modelos';
import type { ResultadoAcao } from '@/server/actions/auth';
import { exigirPerfil } from '@/server/auth/guards';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { gravarModelo } from './gravar-modelo';

/**
 * Carrega o modelo de exemplo do segmento da empresa. Só dono. Recusa se a empresa já tiver
 * qualquer pacote cadastrado (nunca sobrescreve o catálogo).
 */
export async function aplicarModeloExemplo(): Promise<ResultadoAcao> {
  const dono = await exigirPerfil('dono');
  const [empresa] = await comUsuario(dono.id, (tx) =>
    tx
      .select({ segmento: empresas.segmento })
      .from(empresas)
      .where(eq(empresas.id, dono.empresa.id)),
  );
  if (!empresa) return { ok: false, erro: 'Não encontramos sua empresa. Entre novamente.' };

  const resultado = await gravarModelo(
    comUsuario,
    dono.id,
    dono.empresa.id,
    modeloDoSegmento(empresa.segmento),
  );
  if (!resultado.ok) {
    return {
      ok: false,
      erro: 'Sua empresa já tem pacotes cadastrados, então o modelo de exemplo não foi carregado.',
    };
  }
  revalidatePath('/app/empresa/simulador');
  return {
    ok: true,
    mensagem: 'Modelo de exemplo carregado. Os preços são exemplos para você ajustar.',
  };
}
