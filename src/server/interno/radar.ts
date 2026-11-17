import 'server-only';
import { sql } from 'drizzle-orm';
import { montarRadar, type LinhaUso, type Radar } from '@/domain/uso/radar';
import { obterDb } from '@/server/db/client';

/*
 * Radar de uso (§92) para o /interno (conexão administrativa: a tabela não tem leitura para
 * authenticated). Demo e apresentação nem gravam; a cortesia (isenta) grava, mas fica fora por
 * padrão como as outras contas de teste (§99). `incluirTeste` traz todas.
 */

export type EmpresaUso = {
  id: string;
  nome: string;
  acessos: number;
  areas: number;
  ultimoDia: string | null;
};

export async function carregarRadar(
  semanas = 8,
  incluirTeste = false,
): Promise<{ radar: Radar; empresas: EmpresaUso[] }> {
  const filtroTeste = incluirTeste
    ? sql`true`
    : sql`not public._empresa_fora_das_metricas(u.empresa_id)`;
  const db = obterDb();
  const [hoje] = (await db.execute(
    sql`select (now() at time zone 'America/Sao_Paulo')::date::text as d`,
  )) as unknown as { d: string }[];
  const linhas = (await db.execute(sql`
    select u.area, u.dia::text as dia, u.empresa_id as "empresaId", u.acessos
    from public.uso_painel u
    where u.dia > ${hoje!.d}::date - ${semanas * 7} and ${filtroTeste}`)) as unknown as LinhaUso[];
  const empresas = (await db.execute(sql`
    select e.id, e.nome, sum(u.acessos)::int as acessos, count(distinct u.area)::int as areas,
      max(u.dia)::text as "ultimoDia"
    from public.uso_painel u join public.empresas e on e.id = u.empresa_id
    where u.dia > ${hoje!.d}::date - 30 and ${filtroTeste}
    group by e.id, e.nome order by acessos desc limit 200`)) as unknown as EmpresaUso[];
  return {
    radar: montarRadar(
      [...linhas].map((l) => ({ ...l, acessos: Number(l.acessos) })),
      hoje!.d,
      semanas,
    ),
    empresas: [...empresas],
  };
}
