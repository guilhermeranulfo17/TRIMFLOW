import { describe, expect, it } from 'vitest';
import {
  camposDaConta,
  ETAPAS_CRM,
  etapaAoAbrirDemonstracao,
  etapaAoCriarConta,
  eventoDemonstracao,
  idDoLead,
  mesmoTelefone,
  PROXIMO_PASSO_CONTA,
  telefoneDoCrm,
  textoCriouConta,
  ultimos8,
} from '@/domain/prospeccao';

const ordem = (e: string) => ETAPAS_CRM.indexOf(e as (typeof ETAPAS_CRM)[number]);

describe('etapas do CRM: nunca rebaixar', () => {
  it('abriu a demonstração: só abordado e respondeu viram qualificado', () => {
    expect(etapaAoAbrirDemonstracao('abordado')).toBe('qualificado');
    expect(etapaAoAbrirDemonstracao('respondeu')).toBe('qualificado');
    for (const e of ['novo', 'qualificado', 'demo_marcada', 'demo_feita', 'proposta', 'fechado']) {
      expect(etapaAoAbrirDemonstracao(e)).toBeNull();
    }
    for (const e of ['perdido', 'frio', 'qualquer', '', null, undefined]) {
      expect(etapaAoAbrirDemonstracao(e)).toBeNull();
    }
  });

  it('criou conta: antes de demo_marcada, frio ou lead novo viram demo_marcada', () => {
    for (const e of ['novo', 'abordado', 'respondeu', 'qualificado', 'frio', '', null, undefined]) {
      expect(etapaAoCriarConta(e)).toBe('demo_marcada');
    }
    // de demo_marcada em diante, perdido e etapa desconhecida: não mexe
    for (const e of ['demo_marcada', 'demo_feita', 'proposta', 'fechado', 'perdido', 'outra']) {
      expect(etapaAoCriarConta(e)).toBeNull();
    }
  });

  it('em toda a ordem, a etapa nova nunca vem antes da atual', () => {
    for (const atual of ETAPAS_CRM) {
      for (const nova of [etapaAoAbrirDemonstracao(atual), etapaAoCriarConta(atual)]) {
        if (nova) expect(ordem(nova)).toBeGreaterThan(ordem(atual));
      }
    }
  });
});

describe('link com ?r=', () => {
  it('só aceita uuid (o valor vai para a URL do CRM)', () => {
    expect(idDoLead('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    );
    expect(idDoLead(' 3f2504e0-4f89-41d3-9a0c-0305e82c3301 ')).toBe(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    );
    for (const ruim of ['', '123', '../leads', '3f2504e0-4f89-41d3-9a0c-0305e82c3301/eventos', 7]) {
      expect(idDoLead(ruim)).toBeNull();
    }
    expect(idDoLead(null)).toBeNull();
    expect(idDoLead(undefined)).toBeNull();
  });

  it('eventos que o navegador pode mandar', () => {
    expect(eventoDemonstracao('abriu_demo')).toBe('abriu_demo');
    expect(eventoDemonstracao('montou_orcamento')).toBe('montou_orcamento');
    expect(eventoDemonstracao('criou_conta')).toBeNull();
    expect(eventoDemonstracao(undefined)).toBeNull();
  });
});

describe('telefone no formato do CRM', () => {
  it('55 + DDD + número, só dígitos', () => {
    expect(telefoneDoCrm('+5534991355450')).toBe('5534991355450');
    expect(telefoneDoCrm('55 (34) 3213-5450')).toBe('553432135450');
    expect(telefoneDoCrm('+14155550100')).toBeNull();
    expect(telefoneDoCrm('34991355450')).toBeNull();
    expect(telefoneDoCrm(null)).toBeNull();
    expect(ultimos8('5534991355450')).toBe('91355450');
  });

  it('mesmo número com ou sem o 9 na frente; DDD diferente não casa', () => {
    expect(mesmoTelefone('5534991355450', '+5534991355450')).toBe(true);
    expect(mesmoTelefone('553491355450', '+5534991355450')).toBe(true);
    expect(mesmoTelefone('5511991355450', '+5534991355450')).toBe(false);
    expect(mesmoTelefone('5534991355451', '+5534991355450')).toBe(false);
    expect(mesmoTelefone(null, '+5534991355450')).toBe(false);
  });
});

describe('textos e campos do cadastro', () => {
  it('"Criou conta em DD/MM às HH:MM, e-mail <e-mail>", na hora de Brasília', () => {
    // 10/11/2026 01:05 UTC = 09/11 22:05 em São Paulo
    expect(textoCriouConta(new Date('2026-11-10T01:05:00Z'), ' dona@buffet.com ')).toBe(
      'Criou conta em 09/11 às 22:05, e-mail dona@buffet.com',
    );
    expect(textoCriouConta(new Date('2026-03-07T12:00:00Z'), 'a@b.co')).toBe(
      'Criou conta em 07/03 às 09:00, e-mail a@b.co',
    );
    expect(textoCriouConta(new Date('2026-11-10T01:05:00Z'), 'a@b.co')).not.toMatch(/[—–]/);
  });

  it('buffet só entra em lead novo; o resto sempre', () => {
    const fixo = {
      contato: 'Ana',
      tem_whatsapp: 'sim',
      temperatura: 'quente',
      proximo_passo: PROXIMO_PASSO_CONTA,
    };
    expect(camposDaConta({ nome: ' Ana ', buffet: ' Buffet Sol ', leadNovo: true })).toEqual({
      ...fixo,
      buffet: 'Buffet Sol',
    });
    expect(camposDaConta({ nome: 'Ana', buffet: 'Buffet Sol', leadNovo: false })).toEqual(fixo);
    expect(PROXIMO_PASSO_CONTA).toBe('Gui chamar: criou conta no teste');
  });
});
