import { afterAll, describe, expect, it } from 'vitest';
import { criarDb } from '@/server/db/client';
import { criarClienteCrm } from '@/server/prospeccao/cliente';
import { avisarCadastro, avisarMarco, type DepsProspeccao } from '@/server/prospeccao/conta';
import { lerConta } from '@/server/prospeccao/vinculo';
import { crmFalso } from '../support/crm-falso';
import { assumirUsuario, conectar, emTransacao, IDS, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';
import { comoAnon } from '../support/publico';

/*
 * Rastreio para o CRM de prospecção (migration 20261110000001_prospeccao, ARQUITETURA §81) contra
 * o banco real e um CRM falso: o vínculo da empresa com o lead (empresas.prospeccao), os marcos
 * avisados uma única vez, o CRM fora do ar e quem pode gravar a coluna.
 */

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 4 });
afterAll(async () => {
  await sql.end();
  await sqlDrizzle.end();
});

function preparar() {
  const falso = crmFalso();
  const crm = criarClienteCrm({
    token: falso.token,
    url: 'https://crm.test/api',
    fetch: falso.fetch,
  });
  const deps: DepsProspeccao = { db, crm };
  return { falso, deps };
}

async function comEmpresa(fn: (e: EmpresaTemporaria, whatsapp: string) => Promise<void>) {
  const e = await criarEmpresaTemporaria(sql, 'infantil');
  // cada empresa com o próprio WhatsApp (o CRM acha o lead pelo telefone)
  const whatsapp = `+55349${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  await sql`update public.empresas set whatsapp_e164 = ${whatsapp} where id = ${e.empresaId}`;
  try {
    await fn(e, whatsapp);
  } finally {
    await removerEmpresa(sql, e);
  }
}

const prospeccao = async (empresaId: string) =>
  (
    await sql<{ p: Record<string, string> | null }[]>`
      select prospeccao as p from public.empresas where id = ${empresaId}`
  )[0]!.p;

describe('criou conta', () => {
  it('com o r do link: avisa o lead certo e a empresa passa a apontar para ele', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      const lead = falso.semear({ telefone: '5511988887777', etapa: 'respondeu' });
      expect(await avisarCadastro(deps, e.donoId, lead.id)).toBe(lead.id);
      expect(await prospeccao(e.empresaId)).toMatchObject({ r: lead.id, crm_lead_id: lead.id });
      expect((await prospeccao(e.empresaId))!.conta_em).toBeTruthy();
      expect(falso.leads.get(lead.id)).toMatchObject({
        etapa: 'demo_marcada',
        temperatura: 'quente',
        tem_whatsapp: 'sim',
      });
      expect(falso.textosDe(lead.id)).toHaveLength(1);
      expect(falso.textosDe(lead.id)[0]).toMatch(
        /^Criou conta em \d{2}\/\d{2} às \d{2}:\d{2}, e-mail \S+@\S+, WhatsApp informado /,
      );

      // repetir (dois cliques, nova tentativa): nada sai de novo
      const antes = falso.escritas().length;
      expect(await avisarCadastro(deps, e.donoId, lead.id)).toBe(lead.id);
      expect(falso.escritas()).toHaveLength(antes);
    });
  });

  it('sem r: cria o lead com o WhatsApp, o nome do dono e o nome do buffet', async () => {
    await comEmpresa(async (e, whatsapp) => {
      const { falso, deps } = preparar();
      const id = await avisarCadastro(deps, e.donoId, null);
      expect(id).not.toBeNull();
      const conta = await lerConta(db, { empresaId: e.empresaId });
      expect(conta).toMatchObject({ leadId: id, r: null, whatsappE164: whatsapp });
      expect(falso.leads.get(id!)).toMatchObject({
        telefone: whatsapp.replace('+', ''),
        contato: conta!.nome,
        buffet: conta!.buffet,
        etapa: 'demo_marcada',
        proximo_passo: 'Gui chamar: criou conta no teste',
      });
      expect(falso.textosDe(id!)[0]).toContain(`e-mail ${conta!.email}`);
    });
  });

  it('CRM fora do ar: o cadastro não é marcado e o próximo marco tenta de novo', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      falso.estado.fora = true;
      await expect(avisarCadastro(deps, e.donoId, null)).rejects.toMatchObject({
        codigo: 'CRM_500',
      });
      expect((await prospeccao(e.empresaId))?.crm_lead_id).toBeUndefined();

      // o CRM voltou: o primeiro pacote avisa a conta (com a data de criação) e depois o pacote
      falso.estado.fora = false;
      expect(await avisarMarco(deps, e.empresaId, 'pacote')).toBe(true);
      const id = (await prospeccao(e.empresaId))!.crm_lead_id!;
      expect(falso.textosDe(id)).toEqual([
        expect.stringMatching(/^Criou conta em /),
        'Cadastrou pacote',
      ]);
    });
  });
});

describe('marcos da conta', () => {
  it('cada um sai uma única vez, mesmo com ações ao mesmo tempo', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      const id = (await avisarCadastro(deps, e.donoId, null))!;
      const resultados = await Promise.all(
        Array.from({ length: 5 }, () => avisarMarco(deps, e.empresaId, 'pacote')),
      );
      expect(resultados.filter(Boolean)).toHaveLength(1);
      expect(await avisarMarco(deps, e.empresaId, 'pacote')).toBe(false);
      expect(await avisarMarco(deps, e.empresaId, 'pagina')).toBe(true);
      expect(await avisarMarco(deps, e.empresaId, 'pagina')).toBe(false);
      expect(falso.textosDe(id).slice(1)).toEqual(['Cadastrou pacote', 'Publicou a página']);
      expect(await prospeccao(e.empresaId)).toMatchObject({
        pacote_em: expect.any(String),
        pagina_em: expect.any(String),
      });
    });
  });

  it('CRM falhou no marco: a marca é desfeita e a próxima vez avisa', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      const id = (await avisarCadastro(deps, e.donoId, null))!;
      falso.estado.fora = true;
      await expect(avisarMarco(deps, e.empresaId, 'pagina')).rejects.toMatchObject({
        codigo: 'CRM_500',
      });
      expect((await prospeccao(e.empresaId))?.pagina_em).toBeUndefined();
      falso.estado.fora = false;
      expect(await avisarMarco(deps, e.empresaId, 'pagina')).toBe(true);
      expect(falso.textosDe(id).slice(1)).toEqual(['Publicou a página']);
    });
  });

  it('a conta de demonstração nunca vai para o CRM', async () => {
    await comEmpresa(async (e) => {
      const { falso, deps } = preparar();
      // sem outra demo no banco de teste, esta vira a demo (índice único de uma demo só)
      const [demos] = await sql<{ n: number }[]>`
        select count(*)::int as n from public.empresas where eh_demo`;
      if ((demos?.n ?? 0) > 0) return;
      await sql`update public.empresas set eh_demo = true where id = ${e.empresaId}`;
      try {
        expect(await avisarCadastro(deps, e.donoId, null)).toBeNull();
        expect(await avisarMarco(deps, e.empresaId, 'pacote')).toBe(false);
        expect(falso.chamadas).toEqual([]);
      } finally {
        await sql`update public.empresas set eh_demo = false where id = ${e.empresaId}`;
      }
    });
  });
});

describe('banco', () => {
  it('ninguém grava empresas.prospeccao pela API: nem o dono', async () => {
    const [r] = await sql`select
      has_column_privilege('authenticated', 'public.empresas', 'prospeccao', 'update') as dono,
      has_column_privilege('anon', 'public.empresas', 'prospeccao', 'select') as anon`;
    expect(r).toEqual({ dono: false, anon: false });
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await expect(
        tx`update public.empresas set prospeccao = '{"crm_lead_id":"x"}'::jsonb`,
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('a coluna só aceita objeto', async () => {
    await emTransacao(sql, async (tx) => {
      await expect(
        tx`update public.empresas set prospeccao = '[]'::jsonb where id = ${IDS.empresaA}`,
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('limite da rota pública: 30 por IP na hora', async () => {
    await emTransacao(sql, async (tx) => {
      await comoAnon(tx, async () => {
        const tentar = async (ip: string) =>
          (await tx`select publico.limite_acesso('prospeccao', ${ip}) as ok`)[0]!.ok;
        for (let i = 0; i < 30; i++) expect(await tentar('ip-prospeccao')).toBe(true);
        expect(await tentar('ip-prospeccao')).toBe(false);
        expect(await tentar('ip-outro')).toBe(true);
      });
    });
  });
});
