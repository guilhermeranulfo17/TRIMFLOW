'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  dadosOpcionalSchema,
  fotosOpcionalSchema,
  ordemSchema,
  vinculosOpcionalSchema,
  type DadosOpcionalEntrada,
  type VinculosOpcionalEntrada,
} from '@/domain/validacao/catalogo';
import { caminhoImagemValido } from '@/domain/validacao/empresa';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { fotosAindaEmUso } from '@/server/catalogo/fotos-em-uso';
import { gravarOrdem, proximaOrdem } from '@/server/catalogo/lista';
import { apagarArquivosMidia } from '@/server/catalogo/midia';
import { opcionais, opcionalPacotes, opcionalTiposEvento } from '@/server/db/schema';
import { comUsuario, type Tx } from '@/server/db/tenant';
import {
  acaoDoDono,
  auditar,
  diferencas,
  idValido,
  NAO_ENCONTRADO,
  validar,
  type ResultadoAcao,
} from './comum';

type Opcional = typeof opcionais.$inferSelect;

function revalidar(id?: string) {
  revalidatePath('/app/empresa', 'layout');
  if (id) revalidatePath(`/app/empresa/catalogo/opcionais/${id}`);
}

async function comOpcional(
  dono: UsuarioAtual,
  id: string,
  fn: (tx: Tx, opcional: Opcional) => Promise<void>,
): Promise<boolean> {
  if (!idValido(id)) return false;
  return comUsuario(dono.id, async (tx) => {
    const [opcional] = await tx.select().from(opcionais).where(eq(opcionais.id, id));
    if (!opcional) return false;
    await fn(tx, opcional);
    return true;
  });
}

function normalizar(d: ReturnType<typeof dadosOpcionalSchema.parse>) {
  return {
    nome: d.nome,
    descricao: d.descricao || null,
    cobranca: d.cobranca,
    precoCentavos: d.precoCentavos,
    qtdMin: d.qtdMin,
    qtdMax: d.qtdMax,
    ativo: d.ativo,
  };
}

export async function criarOpcional(
  entrada: DadosOpcionalEntrada,
): Promise<ResultadoAcao<{ id: string }>> {
  return acaoDoDono<{ id: string }>(async (dono) => {
    const v = validar(dadosOpcionalSchema, entrada);
    if (!v.ok) return v.resultado;
    const dados = normalizar(v.dados);
    const id = await comUsuario(dono.id, async (tx) => {
      const [novo] = await tx
        .insert(opcionais)
        .values({ ...dados, empresaId: dono.empresa.id, ordem: await proximaOrdem(tx, opcionais) })
        .returning({ id: opcionais.id });
      await auditar(tx, dono, 'opcional.criado', 'opcional', novo!.id, { depois: dados });
      return novo!.id;
    });
    revalidar();
    return { ok: true, mensagem: 'Opcional criado.', dados: { id } };
  });
}

export async function salvarDadosOpcional(
  id: string,
  entrada: DadosOpcionalEntrada,
): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(dadosOpcionalSchema, entrada);
    if (!v.ok) return v.resultado;
    const novos = normalizar(v.dados);
    const ok = await comOpcional(dono, id, async (tx, antes) => {
      await tx.update(opcionais).set(novos).where(eq(opcionais.id, id));
      await auditar(tx, dono, 'opcional.alterado', 'opcional', id, diferencas(antes, novos));
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return { ok: true, mensagem: 'Opcional salvo.' };
  });
}

/** Substitui a relação com os pacotes (compatível/incluso) e os tipos de festa. */
export async function salvarVinculosOpcional(
  id: string,
  entrada: VinculosOpcionalEntrada,
): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(vinculosOpcionalSchema, entrada);
    if (!v.ok) return v.resultado;
    const { pacotes: relacoes, tipoEventoIds } = v.dados;
    const tipos = [...new Set(tipoEventoIds)];
    const ok = await comOpcional(dono, id, async (tx) => {
      const antes = await tx
        .select({
          pacoteId: opcionalPacotes.pacoteId,
          relacao: opcionalPacotes.relacao,
          removivel: opcionalPacotes.removivel,
          descontoRetiradaCentavos: opcionalPacotes.descontoRetiradaCentavos,
        })
        .from(opcionalPacotes)
        .where(eq(opcionalPacotes.opcionalId, id));
      // quem continua incluso no mesmo pacote mantém o "pode retirar" e o desconto (Fase 6.5)
      const retirada = new Map(
        antes.filter((a) => a.relacao === 'incluso').map((a) => [a.pacoteId, a] as const),
      );
      await tx.delete(opcionalPacotes).where(eq(opcionalPacotes.opcionalId, id));
      if (relacoes.length)
        await tx.insert(opcionalPacotes).values(
          relacoes.map((r) => {
            const a = r.relacao === 'incluso' ? retirada.get(r.pacoteId) : undefined;
            return {
              ...r,
              empresaId: dono.empresa.id,
              opcionalId: id,
              removivel: a?.removivel ?? false,
              descontoRetiradaCentavos: a?.descontoRetiradaCentavos ?? null,
            };
          }),
        );
      await tx.delete(opcionalTiposEvento).where(eq(opcionalTiposEvento.opcionalId, id));
      if (tipos.length)
        await tx.insert(opcionalTiposEvento).values(
          tipos.map((tipoEventoId) => ({
            empresaId: dono.empresa.id,
            opcionalId: id,
            tipoEventoId,
          })),
        );
      await auditar(tx, dono, 'opcional.vinculos_alterados', 'opcional', id, {
        antes,
        depois: relacoes,
        tipos,
      });
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return { ok: true, mensagem: 'Pacotes e tipos de festa salvos.' };
  });
}

export async function alternarAtivoOpcional(id: string, ativo: boolean): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const ok = await comOpcional(dono, id, async (tx, antes) => {
      await tx.update(opcionais).set({ ativo: !!ativo }).where(eq(opcionais.id, id));
      await auditar(tx, dono, ativo ? 'opcional.ativado' : 'opcional.desativado', 'opcional', id, {
        antes: { ativo: antes.ativo },
        depois: { ativo: !!ativo },
      });
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return { ok: true, mensagem: ativo ? 'Opcional ativado.' : 'Opcional desativado.' };
  });
}

const SUFIXO_COPIA = ' (cópia)';

export async function duplicarOpcional(id: string): Promise<ResultadoAcao<{ id: string }>> {
  return acaoDoDono<{ id: string }>(async (dono) => {
    if (!idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    const novoId = await comUsuario(dono.id, async (tx) => {
      const [origem] = await tx.select().from(opcionais).where(eq(opcionais.id, id));
      if (!origem) return null;
      const { id: _id, criadoEm: _c, atualizadoEm: _a, nome, ...resto } = origem;
      const [novo] = await tx
        .insert(opcionais)
        .values({
          ...resto,
          nome: `${nome.slice(0, 80 - SUFIXO_COPIA.length)}${SUFIXO_COPIA}`,
          ativo: false,
          ordem: await proximaOrdem(tx, opcionais),
        })
        .returning({ id: opcionais.id });
      const oid = novo!.id;
      const base = { empresaId: dono.empresa.id, opcionalId: oid };
      const vinculos = await tx
        .select()
        .from(opcionalPacotes)
        .where(eq(opcionalPacotes.opcionalId, id));
      if (vinculos.length)
        await tx.insert(opcionalPacotes).values(
          vinculos.map((o) => ({
            ...base,
            pacoteId: o.pacoteId,
            relacao: o.relacao,
            removivel: o.removivel,
            descontoRetiradaCentavos: o.descontoRetiradaCentavos,
          })),
        );
      const tipos = await tx
        .select()
        .from(opcionalTiposEvento)
        .where(eq(opcionalTiposEvento.opcionalId, id));
      if (tipos.length)
        await tx
          .insert(opcionalTiposEvento)
          .values(tipos.map((t) => ({ ...base, tipoEventoId: t.tipoEventoId })));
      await auditar(tx, dono, 'opcional.duplicado', 'opcional', oid, { origem: id });
      return oid;
    });
    if (!novoId) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar();
    return {
      ok: true,
      mensagem: 'Opcional duplicado. A cópia está inativa.',
      dados: { id: novoId },
    };
  });
}

export async function excluirOpcional(id: string): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    if (!idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    const orfas = await comUsuario(dono.id, async (tx) => {
      const [linha] = await tx
        .delete(opcionais)
        .where(and(eq(opcionais.id, id), eq(opcionais.empresaId, dono.empresa.id)))
        .returning();
      if (!linha) return null;
      await auditar(tx, dono, 'opcional.excluido', 'opcional', id, { antes: linha });
      const emUso = await fotosAindaEmUso(tx, linha.fotos);
      return linha.fotos.filter((f) => !emUso.has(f));
    });
    if (!orfas) return { ok: false, erro: NAO_ENCONTRADO };
    await apagarArquivosMidia(orfas);
    revalidar();
    return { ok: true, mensagem: 'Opcional excluído.' };
  });
}

/**
 * Grava a foto do opcional (a que vai na proposta, ao lado do item). A que saiu e não é usada
 * em outro lugar nem congelada numa proposta é apagada do Storage.
 */
export async function salvarFotosOpcional(id: string, caminhos: string[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(fotosOpcionalSchema, { caminhos });
    if (!v.ok) {
      const r = v.resultado;
      return { ok: false, erro: (!r.ok && Object.values(r.campos ?? {})[0]) || 'Foto inválida.' };
    }
    const lista = v.dados.caminhos;
    if (lista.some((c) => !caminhoImagemValido(c, dono.empresa.id, 'pacotes')))
      return { ok: false, erro: 'Foto inválida.' };
    let removidas: string[] = [];
    const ok = await comOpcional(dono, id, async (tx, antes) => {
      await tx.update(opcionais).set({ fotos: lista }).where(eq(opcionais.id, id));
      await auditar(tx, dono, 'opcional.fotos_alteradas', 'opcional', id, {
        antes: antes.fotos,
        depois: lista,
      });
      const saindo = antes.fotos.filter((f) => !lista.includes(f));
      const emUso = await fotosAindaEmUso(tx, saindo);
      removidas = saindo.filter((f) => !emUso.has(f));
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    await apagarArquivosMidia(removidas);
    revalidar(id);
    return { ok: true, mensagem: 'Foto salva.' };
  });
}

export async function reordenarOpcionais(ids: string[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(ordemSchema, { ids });
    if (!v.ok) return v.resultado;
    await comUsuario(dono.id, (tx) => gravarOrdem(tx, opcionais, dono, v.dados.ids));
    revalidar();
    return { ok: true, mensagem: 'Ordem salva.' };
  });
}
