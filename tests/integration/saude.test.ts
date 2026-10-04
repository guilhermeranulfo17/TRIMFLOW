import { afterAll, describe, expect, it } from 'vitest';
import { conectar, emTransacao, IDS } from '../support/db';

/* Etapa 9B · B.3: dados do GET /api/saude (public.saude_sistema). */

const sql = conectar();
afterAll(() => sql.end());

describe('public.saude_sistema', () => {
  it('mede o atraso da fila de avisos em minutos', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`update public.avisos_entregas set status = 'enviado'`;
      const [ok] = await tx`select public.saude_sistema() as j`;
      expect(ok!.j.fila_atraso_min).toBe(0);
      const [aviso] = await tx`insert into public.avisos (empresa_id, usuario_id, tipo, chave)
        values (${IDS.empresaA}, ${IDS.donoA}, 'teste', 'saude-teste') returning id`;
      await tx`insert into public.avisos_entregas (empresa_id, aviso_id, canal, status, proximo_envio_em)
        values (${IDS.empresaA}, ${aviso!.id}, 'push', 'pendente', now() - interval '25 minutes')`;
      const [atrasada] = await tx`select public.saude_sistema() as j`;
      expect(atrasada!.j.fila_atraso_min).toBe(25);
    });
  });

  it('só o servidor executa (nem anon nem authenticated)', async () => {
    const [p] = await sql`select
      has_function_privilege('anon', 'public.saude_sistema(timestamptz)', 'execute') as anon,
      has_function_privilege('authenticated', 'public.saude_sistema(timestamptz)', 'execute') as auth`;
    expect(p).toEqual({ anon: false, auth: false });
  });
});
