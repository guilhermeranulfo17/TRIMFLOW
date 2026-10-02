import 'server-only';
import { count, sql } from 'drizzle-orm';
import type { Modelo } from '@/domain/modelos';
import {
  ajustesDia,
  auditoria,
  espacos,
  faixasDeslocamento,
  faixasIdade,
  faixasPreco,
  opcionais,
  opcionalPacotes,
  opcionalTiposEvento,
  pacotes,
  pacoteTiposEvento,
  regrasComerciais,
  secoesCardapio,
  tiposEvento,
  turnos,
} from '@/server/db/schema';
import type { ComUsuario } from './carregar';

export type ResultadoGravacaoModelo =
  { ok: true; pacotes: number; opcionais: number } | { ok: false; motivo: 'ja_tem_catalogo' };

function exigirId(mapa: Map<string, string>, chave: string): string {
  const id = mapa.get(chave);
  if (!id) throw new Error(`Chave do modelo sem id: ${chave}`);
  return id;
}

/**
 * Grava um modelo de segmento na empresa do usuário, em UMA transação, com o RLS valendo
 * (só dono consegue inserir). Nunca sobrescreve: se já existir qualquer pacote, não grava nada.
 * Um advisory lock por empresa impede dois cliques simultâneos de duplicarem o catálogo.
 * Pacotes e opcionais nascem com preço NÃO confirmado (fora do link até o dono confirmar).
 */
export async function gravarModelo(
  comUsuario: ComUsuario,
  usuarioId: string,
  empresaId: string,
  modelo: Modelo,
): Promise<ResultadoGravacaoModelo> {
  return comUsuario(usuarioId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`catalogo:${empresaId}`}))`);
    // Preço do modelo é exemplo: não confirma (o trigger _confirmar_preco respeita esta flag,
    // que vale só nesta transação). O dono confirma no onboarding ou ao salvar o preço.
    await tx.execute(sql`select set_config('orkestra.modelo', '1', true)`);
    const [existentes] = await tx.select({ n: count() }).from(pacotes);
    if ((existentes?.n ?? 0) > 0) return { ok: false, motivo: 'ja_tem_catalogo' } as const;

    const idTipo = new Map<string, string>();
    for (const [ordem, t] of modelo.tiposEvento.entries()) {
      const [r] = await tx
        .insert(tiposEvento)
        .values({ empresaId, nome: t.nome, icone: t.icone, ordem })
        .returning({ id: tiposEvento.id });
      idTipo.set(t.chave, r!.id);
    }

    for (const [ordem, e] of modelo.espacos.entries()) {
      await tx.insert(espacos).values({
        empresaId,
        nome: e.nome,
        capacidadeMax: e.capacidadeMax,
        noLocalDoCliente: e.noLocalDoCliente,
        ordem,
      });
    }

    const idTurno = new Map<string, string>();
    for (const [ordem, t] of modelo.turnos.entries()) {
      const [r] = await tx
        .insert(turnos)
        .values({
          empresaId,
          nome: t.nome,
          horaInicio: t.horaInicio,
          duracaoMin: t.duracaoMin,
          diasSemana: t.diasSemana,
          ordem,
        })
        .returning({ id: turnos.id });
      idTurno.set(t.chave, r!.id);
    }

    if (modelo.ajustesDia.length > 0) {
      await tx.insert(ajustesDia).values(
        modelo.ajustesDia.map((a) => ({
          empresaId,
          tipo: 'dia_semana' as const,
          diaSemana: a.diaSemana,
          turnoId: a.turno ? exigirId(idTurno, a.turno) : null,
          ajusteBp: a.ajusteBp,
        })),
      );
    }

    if (modelo.faixasIdade.length > 0) {
      await tx
        .insert(faixasIdade)
        .values(modelo.faixasIdade.map((f, ordem) => ({ empresaId, ...f, ordem })));
    }

    const idPacote = new Map<string, string>();
    for (const [ordem, p] of modelo.pacotes.entries()) {
      const [r] = await tx
        .insert(pacotes)
        .values({
          empresaId,
          nome: p.nome,
          subtitulo: p.subtitulo,
          descricao: p.descricao,
          destaque: p.destaque,
          modeloPreco: p.modeloPreco,
          precoPessoaCentavos: p.precoPessoaCentavos,
          valorExcedenteCentavos: p.valorExcedenteCentavos,
          minConvidados: p.minConvidados,
          maxConvidados: p.maxConvidados,
          duracaoInclusaMin: p.duracaoInclusaMin,
          valorHoraExtraCentavos: p.valorHoraExtraCentavos,
          ordem,
        })
        .returning({ id: pacotes.id });
      const pacoteId = r!.id;
      idPacote.set(p.chave, pacoteId);
      if (p.faixasPreco.length > 0) {
        await tx
          .insert(faixasPreco)
          .values(p.faixasPreco.map((f) => ({ empresaId, pacoteId, ...f })));
      }
      if (p.secoes.length > 0) {
        await tx
          .insert(secoesCardapio)
          .values(
            p.secoes.map((s, ordemSecao) => ({ empresaId, pacoteId, ...s, ordem: ordemSecao })),
          );
      }
      if (p.tiposEvento.length > 0) {
        await tx
          .insert(pacoteTiposEvento)
          .values(
            p.tiposEvento.map((t) => ({ empresaId, pacoteId, tipoEventoId: exigirId(idTipo, t) })),
          );
      }
    }

    for (const [ordem, o] of modelo.opcionais.entries()) {
      const [r] = await tx
        .insert(opcionais)
        .values({
          empresaId,
          nome: o.nome,
          descricao: o.descricao,
          cobranca: o.cobranca,
          precoCentavos: o.precoCentavos,
          qtdMin: o.qtdMin,
          qtdMax: o.qtdMax,
          ordem,
        })
        .returning({ id: opcionais.id });
      const opcionalId = r!.id;
      const vinculos = [
        ...o.pacotesCompativeis.map((c) => ({ chave: c, relacao: 'compativel' as const })),
        ...o.pacotesInclusos.map((c) => ({ chave: c, relacao: 'incluso' as const })),
      ];
      if (vinculos.length > 0) {
        await tx.insert(opcionalPacotes).values(
          vinculos.map((v) => ({
            empresaId,
            opcionalId,
            pacoteId: exigirId(idPacote, v.chave),
            relacao: v.relacao,
          })),
        );
      }
      if (o.tiposEvento.length > 0) {
        await tx.insert(opcionalTiposEvento).values(
          o.tiposEvento.map((t) => ({
            empresaId,
            opcionalId,
            tipoEventoId: exigirId(idTipo, t),
          })),
        );
      }
    }

    if (modelo.faixasDeslocamento.length > 0) {
      await tx
        .insert(faixasDeslocamento)
        .values(modelo.faixasDeslocamento.map((f) => ({ empresaId, ...f })));
    }

    await tx
      .update(regrasComerciais)
      .set({ ...modelo.regras })
      .where(sql`${regrasComerciais.empresaId} = ${empresaId}`);

    await tx.insert(auditoria).values({
      empresaId,
      usuarioId,
      acao: 'catalogo.modelo_aplicado',
      entidade: 'empresa',
      entidadeId: empresaId,
      dados: {
        segmento: modelo.segmento,
        pacotes: modelo.pacotes.length,
        opcionais: modelo.opcionais.length,
      },
    });

    return {
      ok: true,
      pacotes: modelo.pacotes.length,
      opcionais: modelo.opcionais.length,
    } as const;
  });
}
