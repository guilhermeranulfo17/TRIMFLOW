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
import { montarContexto } from './montar-contexto';

export type ComUsuario = <T>(usuarioId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;

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
    return montarContexto({
      regras,
      tiposEvento: tipos,
      espacos: listaEspacos,
      turnos: listaTurnos,
      ajustesDia: ajustes,
      feriados: listaFeriados,
      faixasIdade: faixasIdadeDb,
      pacotes: listaPacotes,
      faixasPreco: faixas,
      secoesCardapio: secoes,
      pacoteTiposEvento: pacoteTipos,
      opcionais: listaOpcionais,
      opcionalPacotes: opcPacotes,
      opcionalTiposEvento: opcTipos,
      faixasDeslocamento: deslocamento,
    });
  });
}
