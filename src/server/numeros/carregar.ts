import 'server-only';
import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import type {
  Contagem,
  LinhaAtendimento,
  LinhaMotivo,
  LinhaOrigem,
  Resumo,
} from '@/domain/numeros';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { comUsuario, type Tx } from '@/server/db/tenant';

/*
 * Leituras da tela de Números: public.numeros (período + anterior) e public.numeros_ocupacao,
 * sempre como o usuário logado (dono: tudo; vendedor: só os leads dele). Cache curto por
 * empresa, usuário e período, com a tag numeros:{empresa} (nunca mistura empresas).
 */

export type NumerosPeriodo = {
  de: string;
  ate: string;
  resumo: Resumo;
  anterior: Resumo;
  porOrigem: LinhaOrigem[];
  motivos: LinhaMotivo[];
  atendimento: { total: LinhaAtendimento; porVendedor: LinhaAtendimento[] };
};

export type OcupacaoTela = {
  de: string;
  ate: string;
  total: Contagem;
  porMes: ({ mes: string } & Contagem)[];
  porDiaTurno: ({ dia: number; turnoId: string } & Contagem)[];
  datasLivres: { data: string; turnoIds: string[] }[];
  turnos: { id: string; nome: string }[];
};

const camel = (o: unknown): unknown =>
  Array.isArray(o)
    ? o.map(camel)
    : o && typeof o === 'object' && !(o instanceof Date)
      ? Object.fromEntries(
          Object.entries(o).map(([k, v]) => [
            k.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()),
            camel(v),
          ]),
        )
      : o;

export const tagNumeros = (empresaId: string) => `numeros:${empresaId}`;

async function numerosTx(tx: Tx, de: string, ate: string): Promise<NumerosPeriodo> {
  const [linha] = await tx.execute<{ n: unknown }>(
    sql`select public.numeros(${de}::date, ${ate}::date) as n`,
  );
  return camel(linha!.n) as NumerosPeriodo;
}

async function ocupacaoTx(tx: Tx): Promise<OcupacaoTela> {
  const [[linha], turnos] = await Promise.all([
    tx.execute<{ o: unknown }>(sql`select public.numeros_ocupacao() as o`),
    tx.execute<{ id: string; nome: string }>(
      sql`select id, nome from public.turnos where ativo order by ordem, hora_inicio`,
    ),
  ]);
  return { ...(camel(linha!.o) as Omit<OcupacaoTela, 'turnos'>), turnos: [...turnos] };
}

export type TelaNumeros = {
  numeros: NumerosPeriodo;
  ocupacao: OcupacaoTela | null;
  usuarios: { id: string; nome: string }[];
};

/**
 * Tudo da tela numa transação (uma leva em pipeline), em cache curto por empresa, usuário,
 * período e se mostra a ocupação. A transação é aberta DENTRO do cache: o callback pode rodar
 * depois (revalidação em segundo plano) e nunca reaproveita conexão de outra requisição.
 */
export function carregarTelaNumeros(
  usuario: UsuarioAtual,
  de: string,
  ate: string,
  comOcupacao: boolean,
): Promise<TelaNumeros> {
  return unstable_cache(
    async () =>
      comUsuario(usuario.id, async (tx) => {
        const [numeros, ocupacao, usuarios] = await Promise.all([
          numerosTx(tx, de, ate),
          comOcupacao ? ocupacaoTx(tx) : null,
          tx.execute<{ id: string; nome: string }>(
            sql`select id, nome from public.usuarios where ativo order by nome`,
          ),
        ]);
        return { numeros, ocupacao, usuarios: [...usuarios] };
      }),
    ['tela-numeros', usuario.empresa.id, usuario.id, de, ate, String(comOcupacao)],
    { tags: [tagNumeros(usuario.empresa.id)], revalidate: 300 },
  )();
}
