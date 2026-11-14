import { afterAll, describe, expect, it } from 'vitest';
import { comoUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';

/*
 * §93: mensagem programada. Vira tarefa com mensagem pronta; na hora, o job cria o aviso para o
 * responsável (uma vez por horário; adiar gera outro). Nada é enviado ao cliente.
 */

const sql = conectar();
afterAll(() => sql.end());

async function leadDaEmpresaA() {
  const [l] = await sql`select id from public.leads
    where empresa_id = ${IDS.empresaA} and not eh_teste and whatsapp_e164 is not null limit 1`;
  return l!.id as string;
}

describe('mensagem programada', () => {
  it('cria a tarefa com a mensagem; o job avisa na hora uma vez só', async () => {
    const lead = await leadDaEmpresaA();
    await emTransacao(sql, async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: IDS.donoA, role: 'authenticated' })}, true), set_config('role', 'authenticated', true)`;
      const [r] = await tx`select public.agendar_mensagem(${lead}, 'Enviar mensagem no WhatsApp',
        now() + interval '1 hour', 'Oi! Ficou alguma dúvida?', null) as id`;
      await tx`reset role`;
      const [t] = await tx`select titulo, mensagem_sugerida, origem::text as origem, responsavel_id
        from public.tarefas where id = ${r!.id}`;
      expect(t).toMatchObject({
        titulo: 'Enviar mensagem no WhatsApp',
        mensagem_sugerida: 'Oi! Ficou alguma dúvida?',
        origem: 'manual',
      });

      // antes da hora: nada
      expect((await tx`select public.gerar_avisos_mensagens() as n`)[0]!.n).toBe(0);
      // chegou a hora
      await tx`update public.tarefas set vence_em = now() - interval '1 minute' where id = ${r!.id}`;
      const [n1] = await tx`select public.gerar_avisos_mensagens() as n`;
      const [n2] = await tx`select public.gerar_avisos_mensagens() as n`;
      expect([n1!.n, n2!.n]).toEqual([1, 0]);
      const avisos =
        await tx`select tipo::text as tipo, usuario_id, lead_id, dados ->> 'lead_nome' as nome
        from public.avisos where chave like ${'mensagem:' + r!.id + ':%'}`;
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject({
        tipo: 'mensagem_programada',
        usuario_id: t!.responsavel_id,
        lead_id: lead,
      });

      // feita: não avisa de novo nem se o horário mudar
      await tx`update public.tarefas set feita_em = now(), vence_em = now() - interval '2 minutes' where id = ${r!.id}`;
      expect((await tx`select public.gerar_avisos_mensagens() as n`)[0]!.n).toBe(0);
    });
  });

  it('valida a mensagem e o lead de outra empresa', async () => {
    const lead = await leadDaEmpresaA();
    await esperarErroSql(
      comoUsuario(
        sql,
        IDS.donoA,
        (tx) =>
          tx`select public.agendar_mensagem(${lead}, 'X', now() + interval '1 hour', '   ', null)`,
      ),
      '22023',
    );
    await expect(
      comoUsuario(
        sql,
        IDS.donoB,
        (tx) =>
          tx`select public.agendar_mensagem(${lead}, 'X', now() + interval '1 hour', 'Oi', null)`,
      ),
    ).rejects.toThrow();
  });
});
