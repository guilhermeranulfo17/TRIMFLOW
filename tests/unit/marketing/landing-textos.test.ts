import { describe, expect, it } from 'vitest';
import {
  duvidasDaLanding,
  itensDoPlanoNaLanding,
  jsonLdDuvidas,
  type PlanoVitrine,
} from '@/domain/marketing';

const PRO: PlanoVitrine = {
  codigo: 'profissional',
  nome: 'Profissional',
  precoMensalCentavos: 24700,
  precoAnualCentavos: 247000,
  maxUsuarios: 5,
  maxEspacos: null,
  whatsappAvisos: true,
  followUp: true,
  numerosCompleto: true,
  contratosMes: null,
};

describe('itensDoPlanoNaLanding', () => {
  it('lista o que o plano inclui a partir dos limites', () => {
    const itens = itensDoPlanoNaLanding(PRO);
    expect(itens).toContain('Até 5 usuários da equipe');
    expect(itens).toContain('Espaços ilimitados');
    expect(itens).toContain('Contratos digitais sem limite');
    expect(itens).toContain('Avisos no celular e no WhatsApp');
    expect(itens).toContain('Tarefas automáticas de retorno');
  });

  it('respeita limites menores e não inventa o que o plano não tem', () => {
    const itens = itensDoPlanoNaLanding({
      ...PRO,
      maxUsuarios: 1,
      maxEspacos: 1,
      contratosMes: 10,
      whatsappAvisos: false,
      followUp: false,
    });
    expect(itens).toContain('Até 1 usuário da equipe');
    expect(itens).toContain('1 espaço');
    expect(itens).toContain('10 contratos digitais por mês');
    expect(itens).toContain('Avisos no celular');
    expect(itens.join(' ')).not.toMatch(/WhatsApp|Tarefas automáticas/);
  });

  it('sem plano (leitura falhou), só o que vale para todos', () => {
    expect(itensDoPlanoNaLanding(null)).toEqual([
      'Link de orçamento e página do buffet',
      'Propostas em PDF com a sua marca',
      'Agenda com pré-reserva',
      'Pagamentos da festa e Números',
    ]);
  });
});

describe('duvidasDaLanding', () => {
  it('usa os dias do teste e os usuários do plano, sem travessão nem promessa de envio automático', () => {
    const d = duvidasDaLanding(PRO, 14);
    const texto = d.map((x) => `${x.pergunta} ${x.resposta}`).join(' ');
    expect(texto).toContain('14 dias grátis');
    expect(texto).toContain('Até 5 usuários');
    expect(texto).not.toMatch(/[—–]/);
    expect(d.find((x) => x.pergunta.includes('sozinho'))!.resposta).toMatch(/^Não\./);
  });

  it('vira um FAQPage com as mesmas perguntas', () => {
    const d = duvidasDaLanding(null, 14);
    const ld = jsonLdDuvidas(d) as { '@type': string; mainEntity: { name: string }[] };
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity.map((q) => q.name)).toEqual(d.map((x) => x.pergunta));
  });
});
