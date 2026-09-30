'use server';

import { and, eq, ne, notInArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  cardapioSchema,
  dadosPacoteSchema,
  ordemSchema,
  faixasIdadePacoteSchema,
  fotosPacoteSchema,
  idsSchema,
  precoPacoteSchema,
  type CardapioEntrada,
  type DadosPacoteEntrada,
  type FaixasIdadePacoteEntrada,
  type PrecoPacoteEntrada,
} from '@/domain/validacao/catalogo';
import { caminhoImagemValido } from '@/domain/validacao/empresa';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { gravarOrdem, proximaOrdem } from '@/server/catalogo/lista';
import { apagarArquivosMidia } from '@/server/catalogo/midia';
import {
  faixasIdade,
  faixasPreco,
  opcionalPacotes,
  pacotes,
  pacoteTiposEvento,
  secoesCardapio,
} from '@/server/db/schema';
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

type Pacote = typeof pacotes.$inferSelect;

function revalidar(id?: string) {
  revalidatePath('/app', 'layout');
  if (id) revalidatePath(`/app/empresa/catalogo/pacotes/${id}`);
}

/** Lê o pacote (o RLS limita à empresa); null se não existir. */
async function lerPacote(tx: Tx, id: string): Promise<Pacote | null> {
  const [p] = await tx.select().from(pacotes).where(eq(pacotes.id, id));
  return p ?? null;
}

/**
 * Executa uma alteração num pacote existente: valida o id, garante que o pacote é da empresa
 * e devolve "não encontrado" quando não for.
 */
async function comPacote(
  dono: UsuarioAtual,
  id: string,
  fn: (tx: Tx, pacote: Pacote) => Promise<void>,
): Promise<boolean> {
  if (!idValido(id)) return false;
  return comUsuario(dono.id, async (tx) => {
    const pacote = await lerPacote(tx, id);
    if (!pacote) return false;
    await fn(tx, pacote);
    return true;
  });
}

/** Fotos usadas por outros pacotes da empresa (duplicar compartilha os arquivos). */
async function fotosEmUso(tx: Tx, excetoPacoteId: string): Promise<Set<string>> {
  const linhas = await tx
    .select({ fotos: pacotes.fotos })
    .from(pacotes)
    .where(ne(pacotes.id, excetoPacoteId));
  return new Set(linhas.flatMap((l) => l.fotos));
}

// ---------------------------------------------------------------------------
// Criar, dados, ativar, duplicar, excluir
// ---------------------------------------------------------------------------

/**
 * Cria o pacote só com os dados básicos. Ele nasce "sem preço" (por faixa, sem faixas),
 * o que o motor e as pendências tratam como pacote ainda não vendável; o preço vem em seguida
 * no editor.
 */
export async function criarPacote(
  entrada: DadosPacoteEntrada,
): Promise<ResultadoAcao<{ id: string }>> {
  return acaoDoDono<{ id: string }>(async (dono) => {
    const v = validar(dadosPacoteSchema, entrada);
    if (!v.ok) return v.resultado;
    const d = v.dados;
    const id = await comUsuario(dono.id, async (tx) => {
      const [novo] = await tx
        .insert(pacotes)
        .values({
          empresaId: dono.empresa.id,
          nome: d.nome,
          subtitulo: d.subtitulo || null,
          descricao: d.descricao || null,
          destaque: d.destaque,
          ativo: d.ativo,
          modeloPreco: 'por_faixa',
          valorExcedenteCentavos: 0,
          ordem: await proximaOrdem(tx, pacotes),
        })
        .returning({ id: pacotes.id });
      await auditar(tx, dono, 'pacote.criado', 'pacote', novo!.id, { depois: d });
      return novo!.id;
    });
    revalidar();
    return { ok: true, mensagem: 'Pacote criado. Agora defina o preço.', dados: { id } };
  });
}

export async function salvarDadosPacote(
  id: string,
  entrada: DadosPacoteEntrada,
): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(dadosPacoteSchema, entrada);
    if (!v.ok) return v.resultado;
    const d = v.dados;
    const novos = {
      nome: d.nome,
      subtitulo: d.subtitulo || null,
      descricao: d.descricao || null,
      destaque: d.destaque,
      ativo: d.ativo,
    };
    const ok = await comPacote(dono, id, async (tx, antes) => {
      await tx.update(pacotes).set(novos).where(eq(pacotes.id, id));
      await auditar(tx, dono, 'pacote.alterado', 'pacote', id, diferencas(antes, novos));
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return { ok: true, mensagem: 'Dados do pacote salvos.' };
  });
}

export async function alternarAtivoPacote(id: string, ativo: boolean): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const ok = await comPacote(dono, id, async (tx, antes) => {
      await tx.update(pacotes).set({ ativo: !!ativo }).where(eq(pacotes.id, id));
      await auditar(tx, dono, ativo ? 'pacote.ativado' : 'pacote.desativado', 'pacote', id, {
        antes: { ativo: antes.ativo },
        depois: { ativo: !!ativo },
      });
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return { ok: true, mensagem: ativo ? 'Pacote ativado.' : 'Pacote desativado.' };
  });
}

const SUFIXO_COPIA = ' (cópia)';

export async function duplicarPacote(id: string): Promise<ResultadoAcao<{ id: string }>> {
  return acaoDoDono<{ id: string }>(async (dono) => {
    if (!idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    const novoId = await comUsuario(dono.id, async (tx) => {
      const origem = await lerPacote(tx, id);
      if (!origem) return null;
      const { id: _id, criadoEm: _c, atualizadoEm: _a, nome, ...resto } = origem;
      const [novo] = await tx
        .insert(pacotes)
        .values({
          ...resto,
          nome: `${nome.slice(0, 80 - SUFIXO_COPIA.length)}${SUFIXO_COPIA}`,
          ativo: false,
          destaque: false,
          ordem: await proximaOrdem(tx, pacotes),
        })
        .returning({ id: pacotes.id });
      const pid = novo!.id;
      const base = { empresaId: dono.empresa.id, pacoteId: pid };

      const faixas = await tx.select().from(faixasPreco).where(eq(faixasPreco.pacoteId, id));
      if (faixas.length)
        await tx.insert(faixasPreco).values(
          faixas.map((f) => ({
            ...base,
            ateConvidados: f.ateConvidados,
            valorCentavos: f.valorCentavos,
          })),
        );
      const secoes = await tx.select().from(secoesCardapio).where(eq(secoesCardapio.pacoteId, id));
      if (secoes.length)
        await tx
          .insert(secoesCardapio)
          .values(secoes.map((s) => ({ ...base, nome: s.nome, itens: s.itens, ordem: s.ordem })));
      const idades = await tx.select().from(faixasIdade).where(eq(faixasIdade.pacoteId, id));
      if (idades.length)
        await tx.insert(faixasIdade).values(
          idades.map((f) => ({
            ...base,
            rotulo: f.rotulo,
            idadeMin: f.idadeMin,
            idadeMax: f.idadeMax,
            fatorBp: f.fatorBp,
            ordem: f.ordem,
          })),
        );
      const tipos = await tx
        .select()
        .from(pacoteTiposEvento)
        .where(eq(pacoteTiposEvento.pacoteId, id));
      if (tipos.length)
        await tx
          .insert(pacoteTiposEvento)
          .values(tipos.map((t) => ({ ...base, tipoEventoId: t.tipoEventoId })));
      const vinculos = await tx
        .select()
        .from(opcionalPacotes)
        .where(eq(opcionalPacotes.pacoteId, id));
      if (vinculos.length)
        await tx
          .insert(opcionalPacotes)
          .values(vinculos.map((o) => ({ ...base, opcionalId: o.opcionalId, relacao: o.relacao })));

      await auditar(tx, dono, 'pacote.duplicado', 'pacote', pid, { origem: id });
      return pid;
    });
    if (!novoId) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar();
    return { ok: true, mensagem: 'Pacote duplicado. A cópia está inativa.', dados: { id: novoId } };
  });
}

export async function excluirPacote(id: string): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    if (!idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    const orfas = await comUsuario(dono.id, async (tx) => {
      const [linha] = await tx
        .delete(pacotes)
        .where(and(eq(pacotes.id, id), eq(pacotes.empresaId, dono.empresa.id)))
        .returning();
      if (!linha) return null;
      await auditar(tx, dono, 'pacote.excluido', 'pacote', id, { antes: linha });
      const emUso = await fotosEmUso(tx, id);
      return linha.fotos.filter((f) => !emUso.has(f));
    });
    if (!orfas) return { ok: false, erro: NAO_ENCONTRADO };
    await apagarArquivosMidia(orfas);
    revalidar();
    return { ok: true, mensagem: 'Pacote excluído.' };
  });
}

// ---------------------------------------------------------------------------
// Preço
// ---------------------------------------------------------------------------

export async function salvarPrecoPacote(
  id: string,
  entrada: PrecoPacoteEntrada,
): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(precoPacoteSchema, entrada);
    if (!v.ok) return v.resultado;
    const p = v.dados;
    const porFaixa = p.modeloPreco === 'por_faixa';
    const novos = {
      modeloPreco: p.modeloPreco,
      precoPessoaCentavos: porFaixa ? null : p.precoPessoaCentavos,
      valorExcedenteCentavos: porFaixa ? p.valorExcedenteCentavos : null,
      minConvidados: p.minConvidados,
      maxConvidados: p.maxConvidados,
      duracaoInclusaMin: p.duracaoInclusaMin,
      valorHoraExtraCentavos: p.valorHoraExtraCentavos,
    };
    const faixas = porFaixa ? [...p.faixas].sort((a, b) => a.ateConvidados - b.ateConvidados) : [];
    const ok = await comPacote(dono, id, async (tx, antes) => {
      const faixasAntes = await tx
        .select({
          ateConvidados: faixasPreco.ateConvidados,
          valorCentavos: faixasPreco.valorCentavos,
        })
        .from(faixasPreco)
        .where(eq(faixasPreco.pacoteId, id))
        .orderBy(faixasPreco.ateConvidados);
      await tx.update(pacotes).set(novos).where(eq(pacotes.id, id));
      await tx.delete(faixasPreco).where(eq(faixasPreco.pacoteId, id));
      if (faixas.length)
        await tx
          .insert(faixasPreco)
          .values(faixas.map((f) => ({ ...f, empresaId: dono.empresa.id, pacoteId: id })));
      await auditar(
        tx,
        dono,
        'pacote.preco_alterado',
        'pacote',
        id,
        diferencas({ ...antes, faixas: faixasAntes }, { ...novos, faixas }),
      );
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return { ok: true, mensagem: 'Preço do pacote salvo.' };
  });
}

// ---------------------------------------------------------------------------
// Tipos de festa, fotos, cardápio, crianças, opcionais inclusos
// ---------------------------------------------------------------------------

export async function salvarTiposEventoPacote(id: string, ids: string[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(idsSchema, { ids });
    if (!v.ok) return v.resultado;
    const unicos = [...new Set(v.dados.ids)];
    const ok = await comPacote(dono, id, async (tx) => {
      await tx.delete(pacoteTiposEvento).where(eq(pacoteTiposEvento.pacoteId, id));
      if (unicos.length)
        await tx.insert(pacoteTiposEvento).values(
          unicos.map((tipoEventoId) => ({
            empresaId: dono.empresa.id,
            pacoteId: id,
            tipoEventoId,
          })),
        );
      await auditar(tx, dono, 'pacote.tipos_alterados', 'pacote', id, { depois: unicos });
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return { ok: true, mensagem: 'Tipos de festa salvos.' };
  });
}

/**
 * Grava a lista de fotos (a primeira é a capa). Arquivos que saíram da lista e não são usados
 * por outro pacote são apagados do Storage.
 */
export async function salvarFotosPacote(id: string, caminhos: string[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(fotosPacoteSchema, { caminhos });
    if (!v.ok) {
      const r = v.resultado;
      return { ok: false, erro: (!r.ok && Object.values(r.campos ?? {})[0]) || 'Fotos inválidas.' };
    }
    const lista = v.dados.caminhos;
    if (lista.some((c) => !caminhoImagemValido(c, dono.empresa.id, 'pacotes')))
      return { ok: false, erro: 'Foto inválida.' };
    let removidas: string[] = [];
    const ok = await comPacote(dono, id, async (tx, antes) => {
      await tx.update(pacotes).set({ fotos: lista }).where(eq(pacotes.id, id));
      await auditar(tx, dono, 'pacote.fotos_alteradas', 'pacote', id, {
        antes: antes.fotos,
        depois: lista,
      });
      const emUso = await fotosEmUso(tx, id);
      removidas = antes.fotos.filter((f) => !lista.includes(f) && !emUso.has(f));
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    await apagarArquivosMidia(removidas);
    revalidar(id);
    return { ok: true, mensagem: 'Fotos salvas.' };
  });
}

export async function salvarCardapio(id: string, entrada: CardapioEntrada): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(cardapioSchema, entrada);
    if (!v.ok) return v.resultado;
    const secoes = v.dados.secoes;
    const ok = await comPacote(dono, id, async (tx) => {
      await tx.delete(secoesCardapio).where(eq(secoesCardapio.pacoteId, id));
      if (secoes.length)
        await tx.insert(secoesCardapio).values(
          secoes.map((s, ordem) => ({
            empresaId: dono.empresa.id,
            pacoteId: id,
            nome: s.nome,
            itens: s.itens,
            ordem,
          })),
        );
      await auditar(tx, dono, 'pacote.cardapio_alterado', 'pacote', id, { depois: secoes });
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return { ok: true, mensagem: 'Cardápio salvo.' };
  });
}

export async function salvarFaixasIdadePacote(
  id: string,
  entrada: FaixasIdadePacoteEntrada,
): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(faixasIdadePacoteSchema, entrada);
    if (!v.ok) return v.resultado;
    const faixas = v.dados.propria
      ? [...v.dados.faixas].sort((a, b) => a.idadeMin - b.idadeMin)
      : [];
    const ok = await comPacote(dono, id, async (tx) => {
      await tx.delete(faixasIdade).where(eq(faixasIdade.pacoteId, id));
      if (faixas.length)
        await tx
          .insert(faixasIdade)
          .values(
            faixas.map((f, ordem) => ({ ...f, empresaId: dono.empresa.id, pacoteId: id, ordem })),
          );
      await auditar(tx, dono, 'pacote.criancas_alteradas', 'pacote', id, {
        propria: v.dados.propria,
        depois: faixas,
      });
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return {
      ok: true,
      mensagem: v.dados.propria
        ? 'Política de crianças do pacote salva.'
        : 'O pacote agora usa a política de crianças da empresa.',
    };
  });
}

/**
 * Opcionais que já vêm no pacote. Marcar como incluso troca uma relação "compatível" que
 * existisse (um opcional não pode ser as duas coisas no mesmo pacote).
 */
export async function salvarInclusosPacote(id: string, ids: string[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(idsSchema, { ids });
    if (!v.ok) return v.resultado;
    const unicos = [...new Set(v.dados.ids)];
    const ok = await comPacote(dono, id, async (tx) => {
      const filtroInclusos = and(
        eq(opcionalPacotes.pacoteId, id),
        eq(opcionalPacotes.relacao, 'incluso'),
      );
      await tx
        .delete(opcionalPacotes)
        .where(
          unicos.length
            ? and(filtroInclusos, notInArray(opcionalPacotes.opcionalId, unicos))
            : filtroInclusos,
        );
      if (unicos.length)
        await tx
          .insert(opcionalPacotes)
          .values(
            unicos.map((opcionalId) => ({
              empresaId: dono.empresa.id,
              pacoteId: id,
              opcionalId,
              relacao: 'incluso' as const,
            })),
          )
          .onConflictDoUpdate({
            target: [opcionalPacotes.opcionalId, opcionalPacotes.pacoteId],
            set: { relacao: sql`excluded.relacao` },
          });
      await auditar(tx, dono, 'pacote.inclusos_alterados', 'pacote', id, { depois: unicos });
    });
    if (!ok) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar(id);
    return { ok: true, mensagem: 'Opcionais inclusos salvos.' };
  });
}

export async function reordenarPacotes(ids: string[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(ordemSchema, { ids });
    if (!v.ok) return v.resultado;
    await comUsuario(dono.id, (tx) => gravarOrdem(tx, pacotes, dono, v.dados.ids));
    revalidar();
    return { ok: true, mensagem: 'Ordem salva.' };
  });
}
