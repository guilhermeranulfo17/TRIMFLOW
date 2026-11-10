import { describe, expect, it } from 'vitest';
import { criarClienteCrm, ErroCrm } from '@/server/prospeccao/cliente';
import {
  abriuDemonstracao,
  criouConta,
  marcoDaConta,
  montouOrcamento,
} from '@/server/prospeccao/rastreio';
import { crmFalso } from '../../support/crm-falso';

/*
 * Os cinco eventos contra um CRM falso com o contrato da API de verdade. O que importa: o texto
 * de cada evento, os campos do upsert, nunca rebaixar a etapa e não enviar nada sem lead
 * conhecido (menos no cadastro, que cria o lead).
 */

function montar() {
  const falso = crmFalso();
  const crm = criarClienteCrm({
    token: falso.token,
    url: 'https://crm.test/api',
    fetch: falso.fetch,
  });
  return { falso, crm };
}

const CONTA = {
  r: null,
  whatsappE164: '+5534991355450',
  nome: 'Ana Souza',
  buffet: 'Buffet Alegria',
  email: 'ana@alegria.com',
  criadaEm: new Date('2026-11-10T17:32:00Z'),
};
const TEXTO_CONTA = 'Criou conta em 10/11 às 14:32, e-mail ana@alegria.com';
const R_QUE_NAO_EXISTE = '11111111-1111-4111-8111-111111111111';

describe('1. abriu a demonstração', () => {
  it('grava o evento e passa abordado e respondeu para qualificado', async () => {
    for (const etapa of ['abordado', 'respondeu']) {
      const { falso, crm } = montar();
      const lead = falso.semear({ telefone: '5534991355450', etapa, buffet: 'Buffet Sol' });
      expect(await abriuDemonstracao(crm, lead.id)).toBe(true);
      expect(falso.textosDe(lead.id)).toEqual(['Abriu a demonstração']);
      expect(falso.leads.get(lead.id)).toMatchObject({
        etapa: 'qualificado',
        buffet: 'Buffet Sol',
      });
      // o upsert leva só o telefone (a chave) e a etapa: não mexe em mais nada do lead
      expect(falso.escritas().find((c) => c.caminho === '/leads/upsert')?.corpo).toEqual({
        telefone: '5534991355450',
        etapa: 'qualificado',
      });
    }
  });

  it('nunca rebaixa nem mexe em outras etapas: só o evento', async () => {
    for (const etapa of [
      'novo',
      'qualificado',
      'demo_marcada',
      'proposta',
      'fechado',
      'perdido',
      'frio',
    ]) {
      const { falso, crm } = montar();
      const lead = falso.semear({ telefone: '5534991355450', etapa });
      await abriuDemonstracao(crm, lead.id);
      expect(falso.leads.get(lead.id)!.etapa).toBe(etapa);
      expect(falso.escritas().map((c) => c.caminho)).toEqual([`/leads/${lead.id}/eventos`]);
    }
  });

  it('r de lead que não existe: não envia nada', async () => {
    const { falso, crm } = montar();
    expect(await abriuDemonstracao(crm, R_QUE_NAO_EXISTE)).toBe(false);
    expect(await montouOrcamento(crm, R_QUE_NAO_EXISTE)).toBe(false);
    expect(falso.escritas()).toEqual([]);
    expect(falso.leads.size).toBe(0);
  });
});

describe('2. montou um orçamento na demonstração', () => {
  it('só o evento, sem mexer no lead', async () => {
    const { falso, crm } = montar();
    const lead = falso.semear({ telefone: '5534991355450', etapa: 'abordado' });
    expect(await montouOrcamento(crm, lead.id)).toBe(true);
    expect(falso.textosDe(lead.id)).toEqual(['Montou um orçamento na demonstração']);
    expect(falso.leads.get(lead.id)!.etapa).toBe('abordado');
  });
});

describe('3. criou conta', () => {
  it('lead achado pelo r: atualiza sem trocar o nome do buffet e sobe para demo_marcada', async () => {
    const { falso, crm } = montar();
    const lead = falso.semear({
      telefone: '5534991355450',
      etapa: 'qualificado',
      buffet: 'Buffet Alegria (prospecção)',
      temperatura: 'morno',
    });
    expect(await criouConta(crm, { ...CONTA, r: lead.id })).toBe(lead.id);
    expect(falso.leads.size).toBe(1);
    expect(falso.leads.get(lead.id)).toMatchObject({
      contato: 'Ana Souza',
      buffet: 'Buffet Alegria (prospecção)',
      tem_whatsapp: 'sim',
      temperatura: 'quente',
      proximo_passo: 'Gui chamar: criou conta no teste',
      etapa: 'demo_marcada',
    });
    expect(falso.textosDe(lead.id)).toEqual([TEXTO_CONTA]);
  });

  it('sem r: acha pelo WhatsApp informado (mesmo cadastrado sem o 9)', async () => {
    const { falso, crm } = montar();
    const lead = falso.semear({ telefone: '553491355450', etapa: 'frio' });
    expect(await criouConta(crm, CONTA)).toBe(lead.id);
    expect(falso.leads.size).toBe(1);
    // o upsert usa o telefone do lead que já existe (senão nasceria um lead duplicado)
    expect(falso.leads.get(lead.id)).toMatchObject({
      telefone: '553491355450',
      etapa: 'demo_marcada',
    });
    expect(falso.textosDe(lead.id)).toEqual([TEXTO_CONTA]);
  });

  it('sem r e sem lead: cria o lead, com buffet, quente e demo_marcada', async () => {
    const { falso, crm } = montar();
    const id = await criouConta(crm, CONTA);
    expect(id).not.toBeNull();
    expect(falso.leads.size).toBe(1);
    expect(falso.leads.get(id!)).toMatchObject({
      telefone: '5534991355450',
      contato: 'Ana Souza',
      buffet: 'Buffet Alegria',
      tem_whatsapp: 'sim',
      temperatura: 'quente',
      proximo_passo: 'Gui chamar: criou conta no teste',
      etapa: 'demo_marcada',
    });
    expect(falso.textosDe(id!)).toEqual([TEXTO_CONTA]);
  });

  it('nunca rebaixa: de demo_marcada em diante e perdido ficam onde estão', async () => {
    for (const etapa of ['demo_marcada', 'demo_feita', 'proposta', 'fechado', 'perdido']) {
      const { falso, crm } = montar();
      const lead = falso.semear({ telefone: '5534991355450', etapa });
      await criouConta(crm, { ...CONTA, r: lead.id });
      expect(falso.leads.get(lead.id)!.etapa).toBe(etapa);
      const upsert = falso.escritas().find((c) => c.caminho === '/leads/upsert')!.corpo;
      expect(upsert).not.toHaveProperty('etapa');
      expect(falso.textosDe(lead.id)).toEqual([TEXTO_CONTA]);
    }
  });

  it('r de um lead e WhatsApp de outro número: atualiza o lead do r e anota o número informado', async () => {
    const { falso, crm } = montar();
    const lead = falso.semear({ telefone: '5534988887777', etapa: 'respondeu' });
    expect(await criouConta(crm, { ...CONTA, r: lead.id })).toBe(lead.id);
    expect(falso.leads.size).toBe(1);
    expect(falso.leads.get(lead.id)).toMatchObject({
      telefone: '5534988887777',
      etapa: 'demo_marcada',
    });
    expect(falso.textosDe(lead.id)).toEqual([`${TEXTO_CONTA}, WhatsApp informado (34) 99135-5450`]);
  });

  it('r que não existe mais: segue pelo WhatsApp', async () => {
    const { falso, crm } = montar();
    const lead = falso.semear({ telefone: '5534991355450', etapa: 'abordado' });
    expect(await criouConta(crm, { ...CONTA, r: R_QUE_NAO_EXISTE })).toBe(lead.id);
    expect(falso.leads.size).toBe(1);
  });

  it('WhatsApp que não é do Brasil: não envia nada', async () => {
    const { falso, crm } = montar();
    expect(await criouConta(crm, { ...CONTA, whatsappE164: '+14155550100' })).toBeNull();
    expect(falso.chamadas).toEqual([]);
  });
});

describe('4 e 5. marcos da conta', () => {
  it('uma linha na linha do tempo, sem mexer no lead', async () => {
    const { falso, crm } = montar();
    const lead = falso.semear({ telefone: '5534991355450', etapa: 'demo_marcada' });
    await marcoDaConta(crm, lead.id, 'pacote');
    await marcoDaConta(crm, lead.id, 'pagina');
    expect(falso.textosDe(lead.id)).toEqual(['Cadastrou pacote', 'Publicou a página']);
    expect(falso.leads.get(lead.id)!.etapa).toBe('demo_marcada');
  });
});

describe('cliente do CRM', () => {
  it('manda o token no cabeçalho e só o código do erro sobe', async () => {
    const falso = crmFalso('certo');
    const errado = criarClienteCrm({
      token: 'errado',
      url: 'https://crm.test/api',
      fetch: falso.fetch,
    });
    await expect(errado.porTelefone('5534991355450')).rejects.toMatchObject({ codigo: 'CRM_401' });
    falso.estado.fora = true;
    const certo = criarClienteCrm({
      token: 'certo',
      url: 'https://crm.test/api',
      fetch: falso.fetch,
    });
    const erro = await certo.evento('x', 'y').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroCrm);
    expect((erro as ErroCrm).codigo).toBe('CRM_500');
    expect((erro as ErroCrm).message).not.toMatch(/erro interno/);
  });

  it('CRM que demora: desiste no prazo, sem segurar quem chamou', async () => {
    const falso = crmFalso();
    falso.estado.fora = 'demora';
    const crm = criarClienteCrm({
      token: falso.token,
      url: 'https://crm.test/api',
      fetch: falso.fetch,
      prazoMs: 30,
    });
    const inicio = Date.now();
    await expect(crm.porId(R_QUE_NAO_EXISTE)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it('sem CRM_PROSPECCAO_TOKEN o rastreio fica desligado', async () => {
    const { clienteCrmDoAmbiente } = await import('@/server/prospeccao/cliente');
    const antes = process.env.CRM_PROSPECCAO_TOKEN;
    delete process.env.CRM_PROSPECCAO_TOKEN;
    expect(clienteCrmDoAmbiente()).toBeNull();
    process.env.CRM_PROSPECCAO_TOKEN = 'x';
    expect(clienteCrmDoAmbiente()).not.toBeNull();
    if (antes === undefined) delete process.env.CRM_PROSPECCAO_TOKEN;
    else process.env.CRM_PROSPECCAO_TOKEN = antes;
  });
});
