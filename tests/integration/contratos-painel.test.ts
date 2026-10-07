import { createHash, randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizarTexto } from '@/domain/contratos/integridade';
import { contratoDeExemplo } from '@/domain/contratos/exemplo';
import { metricasContratos } from '@/domain/numeros/contratos';
import { assumirUsuario, conectar, emTransacao, IDS } from '../support/db';
import { comoAnon } from '../support/publico';

/*
 * Etapa 10 (PR 2) no banco: avisos ao dono (abriu, assinou, pediu ajuste, vencendo), cópia do PDF
 * por e-mail (uma vez só), selo da Agenda (também para o vendedor), Números (equivalência com o
 * domínio) e o contrato de exemplo da demo.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;
const SLUG = 'buffet-demo';
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const novoToken = () => randomBytes(32).toString('base64url');
const TEXTO = normalizarTexto('# Contrato de teste\n\n## 1. Partes\nCONTRATANTE: Clara.');

async function como<T>(tx: Tx, usuarioId: string, fn: () => Promise<T>): Promise<T> {
  await assumirUsuario(tx, usuarioId);
  try {
    return await fn();
  } finally {
    await tx`reset role`.catch(() => {});
    await tx`select set_config('request.jwt.claims', '', true)`.catch(() => {});
  }
}

type Base = { lead: string; orcamento: string; reserva: string | null };

async function base(tx: Tx): Promise<Base> {
  const [o] = await tx`select o.id, o.lead_id from public.orcamentos o
    join public.leads l on l.id = o.lead_id
    where o.empresa_id = ${IDS.empresaA} and o.status = 'aceito' and not l.eh_teste
      and l.anonimizado_em is null
    order by o.criado_em limit 1`;
  await tx`update public.leads set nome = 'Clara Contratante', email = 'clara@exemplo.com'
    where id = ${o!.lead_id}`;
  const [r] = await tx`select id from public.reservas where orcamento_id = ${o!.id} limit 1`;
  return { lead: o!.lead_id as string, orcamento: o!.id as string, reserva: r?.id ?? null };
}

async function emitir(
  tx: Tx,
  b: Base,
  o: { copia?: boolean; validade?: number } = {},
): Promise<{ id: string; token: string }> {
  const token = novoToken();
  const p = {
    lead_id: b.lead,
    orcamento_id: b.orcamento,
    titulo: 'Contrato de teste',
    texto: TEXTO,
    valores: { data: '2026-12-12' },
    variaveis: {},
    exige_codigo: false,
    email_cliente: 'clara@exemplo.com',
    validade_dias: o.validade ?? 14,
    token_hash: sha(token),
    enviar_copia_email: o.copia ?? false,
  };
  const r = await como(tx, IDS.donoA, async () => {
    const [l] = await tx`select public.emitir_contrato(${tx.json(p)}) as r`;
    return l!.r as { id: string };
  });
  return { id: r.id, token };
}

const publico = <T>(tx: Tx, fn: () => Promise<T>) => comoAnon(tx, fn);

async function visualizar(tx: Tx, token: string, ip = 'ip-1') {
  await publico(
    tx,
    () => tx`select publico.contrato_visualizar(${SLUG}, ${token}, false, ${sha(ip)})`,
  );
}

async function assinar(tx: Tx, token: string) {
  const [c] = await publico(tx, () => tx`select publico.contrato(${SLUG}, ${token}) as c`);
  const p = {
    nome: 'Clara Contratante',
    documento_cifrado: `v1:${'A'.repeat(60)}`,
    documento_mascarado: '***.982.247-**',
    hash: (c!.c as { hash: string }).hash,
    ip_hash: sha('ip-cliente'),
    user_agent: 'Celular/1.0',
    eh_usuario_empresa: false,
  };
  const [l] = await publico(
    tx,
    () => tx`select publico.contrato_assinar(${SLUG}, ${token}, ${tx.json(p)}) as r`,
  );
  return l!.r as { ok: boolean };
}

async function avisos(tx: Tx, contratoId: string) {
  return tx`select a.tipo::text as tipo, a.usuario_id, a.dados,
      coalesce((select array_agg(e.canal::text order by e.canal) from public.avisos_entregas e
                where e.aviso_id = a.id), '{}') as canais
    from public.avisos a where a.dados ->> 'contrato_id' = ${contratoId}
    order by a.tipo::text`;
}

describe('avisos do contrato ao dono', () => {
  it('abriu (só a primeira vez), assinou (com e-mail) e pediu ajuste; o vendedor não recebe', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      await visualizar(tx, a.token);
      await tx`update public.auditoria set criado_em = now() - interval '1 hour'
        where entidade_id = ${a.id}`;
      await visualizar(tx, a.token, 'ip-2');
      expect((await assinar(tx, a.token)).ok).toBe(true);

      const l = await avisos(tx, a.id);
      expect(l.map((x) => x.tipo)).toEqual(['contrato_aberto', 'contrato_assinado']);
      expect(l.every((x) => x.usuario_id === IDS.donoA)).toBe(true);
      expect(l[1]!.dados).toMatchObject({ lead_nome: 'Clara Contratante', contrato_id: a.id });
      expect(l[1]!.dados.contrato).toMatch(/^\d{4}-\d{4}$/);
      expect(l[1]!.canais).toContain('email');
      expect(l[0]!.canais).not.toContain('email');

      const c = await emitir(tx, b);
      await publico(
        tx,
        () => tx`select publico.contrato_recusar(${SLUG}, ${c.token}, 'Mudar a data', 'ip', false)`,
      );
      expect((await avisos(tx, c.id)).map((x) => x.tipo)).toEqual(['contrato_ajuste']);
    });
  });

  it('contrato de teste e a demo não avisam', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      await tx`update public.leads set eh_teste = true where id = ${b.lead}`;
      const t = await emitir(tx, b);
      expect((await assinar(tx, t.token)).ok).toBe(true);
      expect(await avisos(tx, t.id)).toHaveLength(0);
    });
  });

  it('rotina: link vencendo em 2 dias avisa uma vez; o aviso some quando não vale mais', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b, { validade: 1 });
      const [r1] = await tx`select public.contratos_rotina() as r`;
      const [r2] = await tx`select public.contratos_rotina() as r`;
      expect((r1!.r as { vencendo: number }).vencendo).toBeGreaterThanOrEqual(1);
      expect((r2!.r as { vencendo: number }).vencendo).toBeGreaterThanOrEqual(1);
      const l = await avisos(tx, a.id);
      expect(l.map((x) => x.tipo)).toEqual(['contrato_vencendo']);
      const [aviso] = await tx`select id from public.avisos
        where tipo = 'contrato_vencendo' and dados ->> 'contrato_id' = ${a.id}`;
      const vale = async () =>
        (await tx`select public._aviso_ainda_vale(${aviso!.id}) as v`)[0]!.v as boolean;
      expect(await vale()).toBe(true);
      expect((await assinar(tx, a.token)).ok).toBe(true);
      expect(await vale()).toBe(false);
    });
  });
});

describe('assinatura imutável', () => {
  it('só aceita o usuário virar null (usuário apagado); o resto continua travado', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      await tx`update public.contrato_assinaturas set usuario_id = null
        where contrato_id = ${a.id} and parte = 'buffet'`;
      await expect(
        tx.savepoint(
          (sp) => sp`update public.contrato_assinaturas set nome = 'Outro'
            where contrato_id = ${a.id} and parte = 'buffet'`,
        ),
      ).rejects.toThrow('CONTRATO_IMUTAVEL');
      await expect(
        tx.savepoint(
          (sp) => sp`update public.contrato_assinaturas set usuario_id = null, nome = 'Outro'
            where contrato_id = ${a.id} and parte = 'buffet'`,
        ),
      ).rejects.toThrow('CONTRATO_IMUTAVEL');
    });
  });
});

describe('cópia do PDF por e-mail', () => {
  it('só se o dono marcou, só depois de assinado e uma vez só', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b, { copia: true });
      const copia = async (token: string) =>
        (
          await publico(tx, () => tx`select publico.contrato_copia_email(${SLUG}, ${token}) as c`)
        )[0]!.c;
      expect(await copia(a.token)).toBeNull();
      expect((await assinar(tx, a.token)).ok).toBe(true);
      expect(await copia(a.token)).toEqual({ id: a.id, email: 'clara@exemplo.com' });
      expect(await copia(a.token)).toBeNull();
      const [aud] = await tx`select count(*)::int as n from public.auditoria
        where entidade_id = ${a.id} and acao = 'contrato.copia_email'`;
      expect(aud!.n).toBe(1);

      const sem = await emitir(tx, b);
      expect((await assinar(tx, sem.token)).ok).toBe(true);
      expect(await copia(sem.token)).toBeNull();
    });
  });
});

describe('selo do contrato na Agenda', () => {
  it('dono e vendedor veem o status; outra empresa não', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      const status = (u: string) =>
        como(tx, u, async () => {
          const [l] =
            await tx`select public.status_contrato_da_reserva(${b.reserva}, ${b.orcamento}) as s`;
          return l!.s as string | null;
        });
      expect(await status(IDS.donoA)).toBe('enviado');
      expect(await status(IDS.vendedorA)).toBe('enviado');
      expect(await status(IDS.donoB)).toBeNull();
      expect((await assinar(tx, a.token)).ok).toBe(true);
      expect(await status(IDS.vendedorA)).toBe('concluido');
    });
  });
});

describe('Números: contratos (equivalência com o domínio)', () => {
  const CASOS: { enviado: string; concluido: string | null; teste?: boolean }[] = [
    // 30/09 21:30 em São Paulo: fora do período de outubro
    { enviado: '2026-10-01T00:30:00Z', concluido: null },
    { enviado: '2026-10-02T12:00:00Z', concluido: '2026-10-02T14:00:00Z' },
    { enviado: '2026-09-28T12:00:00Z', concluido: '2026-10-03T12:00:00Z' },
    { enviado: '2026-10-05T12:00:00Z', concluido: '2026-10-05T12:10:00Z', teste: true },
    { enviado: '2026-10-31T23:00:00Z', concluido: '2026-11-01T02:59:00Z' },
    { enviado: '2026-11-01T03:00:00Z', concluido: null },
  ];

  it('enviados, assinados e tempo médio iguais aos do domínio', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      await tx`delete from public.contratos where empresa_id = ${IDS.empresaA}`;
      for (const c of CASOS) {
        const a = await emitir(tx, b);
        // datas de teste: a trava do envio não deixa mudar enviado_em, então troca direto
        await tx`alter table public.contratos disable trigger contratos_imutavel`;
        await tx`update public.contratos set enviado_em = ${c.enviado}, concluido_em = ${c.concluido},
          status = ${c.concluido ? 'concluido' : 'enviado'}, eh_teste = ${c.teste ?? false}
          where id = ${a.id}`;
        await tx`alter table public.contratos enable trigger contratos_imutavel`;
      }
      const sqlDe = await como(tx, IDS.donoA, async () => {
        const [l] = await tx`select public.numeros_contratos('2026-10-01', '2026-10-31') as n`;
        return l!.n;
      });
      const dominio = metricasContratos(
        CASOS.map((c) => ({
          enviadoEm: new Date(c.enviado),
          concluidoEm: c.concluido ? new Date(c.concluido) : null,
          ehTeste: c.teste ?? false,
        })),
        { de: '2026-10-01', ate: '2026-10-31' },
        'America/Sao_Paulo',
      );
      expect(sqlDe).toEqual({
        enviados: dominio.enviados,
        assinados: dominio.assinados,
        tempo_medio_min: dominio.tempoMedioMin,
      });
      expect(dominio).toEqual({ enviados: 2, assinados: 3, tempoMedioMin: 2520 });
      // vendedor não vê
      const v = await como(tx, IDS.vendedorA, async () => {
        const [l] = await tx`select public.numeros_contratos('2026-10-01', '2026-10-31') as n`;
        return l!.n;
      });
      expect(v).toBeNull();
    });
  });
});

describe('contrato de exemplo da demo', () => {
  it('só em empresa de demonstração, concluído, hash certo e sem aviso', async () => {
    await emTransacao(sql, async (tx) => {
      const [r] = await tx`select r.id, r.cliente_nome from public.reservas r
        where r.empresa_id = ${IDS.empresaA} and r.lead_id is not null limit 1`;
      const c = contratoDeExemplo({
        buffet: 'Buffet Demo',
        cliente: r!.cliente_nome as string,
        whatsappE164: null,
        data: '2026-11-14',
        convidados: 60,
        totalCentavos: 490000,
        sinalCentavos: 147000,
        hoje: '2026-10-07',
      });
      const p = { reserva_id: r!.id, titulo: c.titulo, texto: c.texto, valores: c.valores };
      await tx`delete from public.contratos where empresa_id = ${IDS.empresaA}`;
      await expect(
        tx.savepoint(
          (sp) => sp`select public.demo_contrato_exemplo(${IDS.empresaA}, ${sp.json(p)})`,
        ),
      ).rejects.toThrow('DEMO_INVALIDA');
      await tx`update public.empresas set eh_demo = true where id = ${IDS.empresaA}`;
      const [l] =
        await tx`select public.demo_contrato_exemplo(${IDS.empresaA}, ${tx.json(p)}) as id`;
      const [k] = await tx`select status, hash, texto from public.contratos where id = ${l!.id}`;
      expect(k!.status).toBe('concluido');
      expect(k!.hash).toBe(sha(c.texto));
      const [n] = await tx`select count(*)::int as n from public.contrato_assinaturas
        where contrato_id = ${l!.id}`;
      expect(n!.n).toBe(2);
      expect(await avisos(tx, l!.id as string)).toHaveLength(0);
    });
  });
});
