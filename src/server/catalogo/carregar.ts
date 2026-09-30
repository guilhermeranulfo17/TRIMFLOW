import 'server-only';
import { asc } from 'drizzle-orm';
import type { ContextoPreco } from '@/domain/preco';
import {
  ajustesDia,
  espacos,
  faixasDeslocamento,
  faixasIdade,
  faixasPreco,
  feriados,
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
import { comUsuario as comUsuarioPadrao, type Tx } from '@/server/db/tenant';

export type ComUsuario = <T>(usuarioId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;

function agrupar<T, K extends string>(linhas: T[], chave: (l: T) => K): Map<K, T[]> {
  const mapa = new Map<K, T[]>();
  for (const l of linhas) {
    const k = chave(l);
    mapa.set(k, [...(mapa.get(k) ?? []), l]);
  }
  return mapa;
}

/**
 * Monta o ContextoPreco da empresa do usuário. Todas as leituras passam pelo RLS
 * (comUsuario), então só vêm dados da própria empresa. Null se a empresa não tiver regras.
 */
export async function carregarContexto(
  usuarioId: string,
  comUsuario: ComUsuario = comUsuarioPadrao,
): Promise<ContextoPreco | null> {
  return comUsuario(usuarioId, async (tx) => {
    const [
      [regras],
      tipos,
      listaEspacos,
      listaTurnos,
      ajustes,
      listaFeriados,
      faixasIdadeDb,
      listaPacotes,
      faixas,
      secoes,
      pacoteTipos,
      listaOpcionais,
      opcPacotes,
      opcTipos,
      deslocamento,
    ] = await Promise.all([
      tx.select().from(regrasComerciais).limit(1),
      tx.select().from(tiposEvento).orderBy(asc(tiposEvento.ordem), asc(tiposEvento.nome)),
      tx.select().from(espacos).orderBy(asc(espacos.ordem), asc(espacos.nome)),
      tx.select().from(turnos).orderBy(asc(turnos.ordem), asc(turnos.horaInicio)),
      tx.select().from(ajustesDia),
      tx.select().from(feriados).orderBy(asc(feriados.data)),
      tx.select().from(faixasIdade).orderBy(asc(faixasIdade.idadeMin)),
      tx.select().from(pacotes).orderBy(asc(pacotes.ordem), asc(pacotes.nome)),
      tx.select().from(faixasPreco).orderBy(asc(faixasPreco.ateConvidados)),
      tx.select().from(secoesCardapio).orderBy(asc(secoesCardapio.ordem)),
      tx.select().from(pacoteTiposEvento),
      tx.select().from(opcionais).orderBy(asc(opcionais.ordem), asc(opcionais.nome)),
      tx.select().from(opcionalPacotes),
      tx.select().from(opcionalTiposEvento),
      tx.select().from(faixasDeslocamento).orderBy(asc(faixasDeslocamento.ateKm)),
    ]);
    if (!regras) return null;

    const faixasPorPacote = agrupar(faixas, (f) => f.pacoteId);
    const secoesPorPacote = agrupar(secoes, (s) => s.pacoteId);
    const tiposPorPacote = agrupar(pacoteTipos, (v) => v.pacoteId);
    const pacotesPorOpcional = agrupar(opcPacotes, (v) => v.opcionalId);
    const tiposPorOpcional = agrupar(opcTipos, (v) => v.opcionalId);

    return {
      regras: {
        validadeDias: regras.validadeDias,
        antecedenciaMinDias: regras.antecedenciaMinDias,
        sinalBp: regras.sinalBp,
        parcelasMax: regras.parcelasMax,
        prazoUltimaParcelaDias: regras.prazoUltimaParcelaDias,
        modoExibicaoPreco: regras.modoExibicaoPreco,
        ajusteIncide: regras.ajusteIncide,
        deslocamentoModelo: regras.deslocamentoModelo,
        deslocamentoKmGratis: regras.deslocamentoKmGratis,
        deslocamentoValorKmCentavos: regras.deslocamentoValorKmCentavos,
      },
      tiposEvento: tipos.map((t) => ({ id: t.id, nome: t.nome, ativo: t.ativo })),
      espacos: listaEspacos.map((e) => ({
        id: e.id,
        nome: e.nome,
        capacidadeMax: e.capacidadeMax,
        noLocalDoCliente: e.noLocalDoCliente,
        ativo: e.ativo,
      })),
      turnos: listaTurnos.map((t) => ({
        id: t.id,
        nome: t.nome,
        horaInicio: t.horaInicio.slice(0, 5),
        duracaoMin: t.duracaoMin,
        diasSemana: [...t.diasSemana].sort((a, b) => a - b),
        ordem: t.ordem,
        ativo: t.ativo,
      })),
      ajustesDia: ajustes.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        diaSemana: a.diaSemana,
        turnoId: a.turnoId,
        ajusteBp: a.ajusteBp,
      })),
      feriados: listaFeriados.map((f) => ({ data: f.data, nome: f.nome })),
      faixasIdade: faixasIdadeDb.map((f) => ({
        id: f.id,
        rotulo: f.rotulo,
        idadeMin: f.idadeMin,
        idadeMax: f.idadeMax,
        fatorBp: f.fatorBp,
        pacoteId: f.pacoteId,
        ordem: f.ordem,
      })),
      pacotes: listaPacotes.map((p) => ({
        id: p.id,
        nome: p.nome,
        subtitulo: p.subtitulo,
        destaque: p.destaque,
        modeloPreco: p.modeloPreco,
        precoPessoaCentavos: p.precoPessoaCentavos,
        valorExcedenteCentavos: p.valorExcedenteCentavos,
        minConvidados: p.minConvidados,
        maxConvidados: p.maxConvidados,
        duracaoInclusaMin: p.duracaoInclusaMin,
        valorHoraExtraCentavos: p.valorHoraExtraCentavos,
        ordem: p.ordem,
        ativo: p.ativo,
        faixasPreco: (faixasPorPacote.get(p.id) ?? []).map((f) => ({
          ateConvidados: f.ateConvidados,
          valorCentavos: f.valorCentavos,
        })),
        secoes: (secoesPorPacote.get(p.id) ?? []).map((s) => ({
          nome: s.nome,
          itens: s.itens,
          ordem: s.ordem,
        })),
        tiposEventoIds: (tiposPorPacote.get(p.id) ?? []).map((v) => v.tipoEventoId),
      })),
      opcionais: listaOpcionais.map((o) => {
        const vinculos = pacotesPorOpcional.get(o.id) ?? [];
        return {
          id: o.id,
          nome: o.nome,
          descricao: o.descricao,
          cobranca: o.cobranca,
          precoCentavos: o.precoCentavos,
          qtdMin: o.qtdMin,
          qtdMax: o.qtdMax,
          ordem: o.ordem,
          ativo: o.ativo,
          pacotesCompativeisIds: vinculos
            .filter((v) => v.relacao === 'compativel')
            .map((v) => v.pacoteId),
          pacotesInclusoIds: vinculos.filter((v) => v.relacao === 'incluso').map((v) => v.pacoteId),
          tiposEventoIds: (tiposPorOpcional.get(o.id) ?? []).map((v) => v.tipoEventoId),
        };
      }),
      faixasDeslocamento: deslocamento.map((d) => ({
        ateKm: d.ateKm,
        valorCentavos: d.valorCentavos,
      })),
    };
  });
}
