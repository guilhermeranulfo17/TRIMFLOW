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
import { comUsuario } from '@/server/db/tenant';

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
          Object.entries(o).map(([k, v]) => [k.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()), camel(v)]),
        )
      : o;

export const tagNumeros = (empresaId: string) => `numeros:${empresaId}`;

export function carregarNumeros(usuario: UsuarioAtual, de: string, ate: string): Promise<NumerosPeriodo> {
  return unstable_cache(
    async () => {
      const [linha] = await comUsuario(usuario.id, (tx) =>
        tx.execute<{ n: unknown }>(sql`select public.numeros(${de}::date, ${ate}::date) as n`),
      );
      return camel(linha!.n) as NumerosPeriodo;
    },
    ['numeros', usuario.empresa.id, usuario.id, de, ate],
    { tags: [tagNumeros(usuario.empresa.id)], revalidate: 300 },
  )();
}

export function carregarOcupacao(usuario: UsuarioAtual): Promise<OcupacaoTela> {
  return unstable_cache(
    async () =>
      comUsuario(usuario.id, async (tx) => {
        const [linha] = await tx.execute<{ o: unknown }>(sql`select public.numeros_ocupacao() as o`);
        const turnos = (await tx.execute(
          sql`select id, nome from public.turnos where ativo order by ordem, hora_inicio`,
        )) as unknown as { id: string; nome: string }[];
        return { ...(camel(linha!.o) as Omit<OcupacaoTela, 'turnos'>), turnos: [...turnos] };
      }),
    ['numeros-ocupacao', usuario.empresa.id],
    { tags: [tagNumeros(usuario.empresa.id)], revalidate: 300 },
  )();
}
