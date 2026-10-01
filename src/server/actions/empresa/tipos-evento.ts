'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { ordemSchema, tipoEventoSchema, type TipoEventoEntrada } from '@/domain/validacao/catalogo';
import { gravarOrdem, proximaOrdem } from '@/server/catalogo/lista';
import { tiposEvento } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import {
  acaoDoDono,
  auditar,
  diferencas,
  idValido,
  NAO_ENCONTRADO,
  validar,
  type ResultadoAcao,
} from './comum';

function revalidar() {
  revalidatePath('/app/empresa', 'layout');
}

export async function salvarTipoEvento(
  id: string | null,
  entrada: TipoEventoEntrada,
): Promise<ResultadoAcao<{ id: string }>> {
  return acaoDoDono<{ id: string }>(async (dono) => {
    const v = validar(tipoEventoSchema, entrada);
    if (!v.ok) return v.resultado;
    if (id !== null && !idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    const dados = {
      ...v.dados,
      icone: v.dados.icone || null,
      // undefined = não mexe (ativar/desativar pela lista); vazio = sem abertura
      textoAbertura:
        v.dados.textoAbertura === undefined ? undefined : v.dados.textoAbertura || null,
    };
    const salvoId = await comUsuario(dono.id, async (tx) => {
      if (id === null) {
        const [novo] = await tx
          .insert(tiposEvento)
          .values({
            ...dados,
            empresaId: dono.empresa.id,
            ordem: await proximaOrdem(tx, tiposEvento),
          })
          .returning({ id: tiposEvento.id });
        await auditar(tx, dono, 'tipo_evento.criado', 'tipo_evento', novo!.id, { depois: dados });
        return novo!.id;
      }
      const [antes] = await tx.select().from(tiposEvento).where(eq(tiposEvento.id, id));
      if (!antes) return null;
      await tx.update(tiposEvento).set(dados).where(eq(tiposEvento.id, id));
      await auditar(tx, dono, 'tipo_evento.alterado', 'tipo_evento', id, diferencas(antes, dados));
      return id;
    });
    if (!salvoId) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar();
    return {
      ok: true,
      mensagem: id ? 'Tipo de festa salvo.' : 'Tipo de festa criado.',
      dados: { id: salvoId },
    };
  });
}

export async function excluirTipoEvento(id: string): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    if (!idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    const apagado = await comUsuario(dono.id, async (tx) => {
      const [linha] = await tx
        .delete(tiposEvento)
        .where(and(eq(tiposEvento.id, id), eq(tiposEvento.empresaId, dono.empresa.id)))
        .returning();
      if (linha)
        await auditar(tx, dono, 'tipo_evento.excluido', 'tipo_evento', id, { antes: linha });
      return !!linha;
    });
    if (!apagado) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar();
    return { ok: true, mensagem: 'Tipo de festa excluído.' };
  });
}

export async function reordenarTiposEvento(ids: string[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(ordemSchema, { ids });
    if (!v.ok) return v.resultado;
    await comUsuario(dono.id, (tx) => gravarOrdem(tx, tiposEvento, dono, v.dados.ids));
    revalidar();
    return { ok: true, mensagem: 'Ordem salva.' };
  });
}
