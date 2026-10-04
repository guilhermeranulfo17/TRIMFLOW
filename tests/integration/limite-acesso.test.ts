import { afterAll, describe, expect, it } from 'vitest';
import { conectar, emTransacao } from '../support/db';
import { comoAnon } from '../support/publico';

/* Etapa 9B · B.2: limite próprio de tentativas (publico.limite_acesso), por IP e por e-mail. */

const sql = conectar();
afterAll(() => sql.end());

describe('publico.limite_acesso', () => {
  it('login: 10 por e-mail na hora; outro e-mail do mesmo IP segue', async () => {
    await emTransacao(sql, async (tx) => {
      await comoAnon(tx, async () => {
        const tentar = async (email: string) =>
          (await tx`select publico.limite_acesso('login', 'ip-a', ${email}) as ok`)[0]!.ok;
        for (let i = 0; i < 10; i++) expect(await tentar('email-1')).toBe(true);
        expect(await tentar('email-1')).toBe(false);
        expect(await tentar('email-2')).toBe(true);
      });
    });
  });

  it('login: 30 por IP, qualquer e-mail', async () => {
    await emTransacao(sql, async (tx) => {
      await comoAnon(tx, async () => {
        for (let i = 0; i < 30; i++) {
          const [r] = await tx`select publico.limite_acesso('login', 'ip-b', ${`e-${i}`}) as ok`;
          expect(r!.ok).toBe(true);
        }
        const [r] = await tx`select publico.limite_acesso('login', 'ip-b', 'outro') as ok`;
        expect(r!.ok).toBe(false);
      });
    });
  });

  it('webhook e cron: só conferir não conta; 20 erros bloqueiam o IP', async () => {
    await emTransacao(sql, async (tx) => {
      await comoAnon(tx, async () => {
        for (let i = 0; i < 50; i++) {
          await tx`select publico.limite_acesso('webhook', 'ip-c', null, false)`;
        }
        for (let i = 0; i < 20; i++) await tx`select publico.limite_acesso('webhook', 'ip-c')`;
        const [r] = await tx`select publico.limite_acesso('webhook', 'ip-c', null, false) as ok`;
        expect(r!.ok).toBe(false);
        const [cron] = await tx`select publico.limite_acesso('cron', 'ip-c', null, false) as ok`;
        expect(cron!.ok).toBe(true);
      });
      // só hashes ficam guardados
      const [n] = await tx`select count(*)::int as n from publico.tentativas
        where acao = 'webhook' and chave_hash = 'ip-c'`;
      expect(n!.n).toBe(20);
    });
  });

  it('ação desconhecida é recusada; authenticated não executa', async () => {
    await emTransacao(sql, async (tx) => {
      await comoAnon(tx, async () => {
        await expect(
          tx.savepoint((sp) => sp`select publico.limite_acesso('outra', 'ip')`),
        ).rejects.toThrow('ACAO_INVALIDA');
      });
      const [p] = await tx`select has_function_privilege('authenticated',
        'publico.limite_acesso(text, text, text, boolean)', 'execute') as pode`;
      expect(p!.pode).toBe(false);
    });
  });
});
