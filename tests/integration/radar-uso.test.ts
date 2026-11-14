import { afterAll, describe, expect, it } from 'vitest';
import { AREAS_USO } from '@/domain/uso/areas';
import { comoUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';

/*
 * §92: radar de uso. registrar_uso soma 1 na área do dia da empresa de quem está logado; a
 * lista de áreas do SQL é a do domínio; ninguém do painel lê nem escreve a tabela direto.
 */

const sql = conectar();
afterAll(() => sql.end());

describe('radar de uso', () => {
  it('soma por área e dia, só na empresa de quem está logado; área fora da lista é ignorada', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: IDS.donoA, role: 'authenticated' })}, true), set_config('role', 'authenticated', true)`;
      await tx`select public.registrar_uso('agenda')`;
      await tx`select public.registrar_uso('agenda')`;
      await tx`select public.registrar_uso('nao_existe')`;
      await tx`reset role`;
      const linhas = await tx`select empresa_id, area, acessos from public.uso_painel
        where empresa_id in (${IDS.empresaA}, ${IDS.empresaB})`;
      expect(linhas.map((l) => [l.empresa_id, l.area, l.acessos])).toEqual([
        [IDS.empresaA, 'agenda', 2],
      ]);
    });
  });

  it('a lista de áreas do SQL é a mesma do domínio', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: IDS.donoA, role: 'authenticated' })}, true), set_config('role', 'authenticated', true)`;
      for (const a of AREAS_USO) await tx`select public.registrar_uso(${a})`;
      await tx`reset role`;
      const linhas = await tx`select area from public.uso_painel
        where empresa_id = ${IDS.empresaA} order by area`;
      expect(linhas.map((l) => l.area)).toEqual([...AREAS_USO].sort());
    });
  });

  it('o painel não lê nem grava a tabela direto', async () => {
    await esperarErroSql(
      comoUsuario(sql, IDS.donoA, (tx) => tx`select * from public.uso_painel`),
      '42501',
    );
    await esperarErroSql(
      comoUsuario(
        sql,
        IDS.donoA,
        (tx) => tx`insert into public.uso_painel (empresa_id, dia, area, acessos)
          values (${IDS.empresaA}, current_date, 'agenda', 99)`,
      ),
      '42501',
    );
  });

  it('demo e conta de apresentação não contam', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`update public.empresas set eh_apresentacao = true where id = ${IDS.empresaB}`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: IDS.donoB, role: 'authenticated' })}, true), set_config('role', 'authenticated', true)`;
      await tx`select public.registrar_uso('agenda')`;
      await tx`reset role`;
      const [n] =
        await tx`select count(*)::int as n from public.uso_painel where empresa_id = ${IDS.empresaB}`;
      expect(n!.n).toBe(0);
    });
  });
});
