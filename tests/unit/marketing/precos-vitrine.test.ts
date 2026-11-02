import { describe, expect, it } from 'vitest';
import {
  descontoAnual,
  itensDoPlano,
  planoDoRecurso,
  precoNoCiclo,
  seloAnual,
  type PlanoVitrine,
} from '@/domain/marketing';

const essencial: PlanoVitrine = {
  codigo: 'essencial',
  nome: 'Essencial',
  precoMensalCentavos: 14700,
  precoAnualCentavos: 147000,
  maxUsuarios: 2,
  maxEspacos: 1,
  whatsappAvisos: false,
  followUp: false,
  numerosCompleto: false,
  contratosMes: 10,
};
const profissional: PlanoVitrine = {
  ...essencial,
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

describe('descontoAnual', () => {
  it('calcula a economia, os meses grátis e o mensal equivalente a partir dos dados', () => {
    expect(descontoAnual(essencial)).toEqual({
      economiaCentavos: 29400,
      economiaBp: 1667,
      mesesGratis: 2,
      mensalEquivalenteCentavos: 12250,
    });
    expect(descontoAnual(profissional).mensalEquivalenteCentavos).toBe(20583);
  });

  it('sem desconto quando o anual não é mais barato', () => {
    const caro = { ...essencial, precoAnualCentavos: 14700 * 12 + 100 };
    expect(descontoAnual(caro)).toMatchObject({
      economiaCentavos: 0,
      economiaBp: 0,
      mesesGratis: 0,
    });
  });

  it('selo do anual usa o menor desconto entre os planos', () => {
    expect(seloAnual([essencial, profissional])).toBe('2 meses grátis');
    expect(seloAnual([{ ...essencial, precoAnualCentavos: 14700 * 11 }])).toBe('1 mês grátis');
    expect(seloAnual([{ ...essencial, precoAnualCentavos: 14700 * 12 }])).toBeNull();
    expect(seloAnual([])).toBeNull();
  });
});

describe('itensDoPlano e planoDoRecurso', () => {
  it('limites e recursos vêm dos dados', () => {
    const e = itensDoPlano(essencial);
    expect(e).toContainEqual({ texto: 'Até 2 usuários', incluso: true });
    expect(e).toContainEqual({ texto: '1 espaço', incluso: true });
    expect(e).toContainEqual({ texto: 'Avisos no WhatsApp para a equipe', incluso: false });
    expect(e).toContainEqual({ texto: 'Tarefas automáticas de follow-up', incluso: false });
    expect(e).toContainEqual({ texto: 'Números: resumo e etapas até a reserva', incluso: true });
    const p = itensDoPlano(profissional);
    expect(p).toContainEqual({ texto: 'Espaços ilimitados', incluso: true });
    expect(p).toContainEqual({ texto: 'Tarefas automáticas de follow-up', incluso: true });
    expect(p).toContainEqual({ texto: 'Avisos no WhatsApp para a equipe', incluso: true });
    expect(itensDoPlano({ ...essencial, maxUsuarios: 1, maxEspacos: 3 })).toEqual(
      expect.arrayContaining([
        { texto: '1 usuário', incluso: true },
        { texto: 'Até 3 espaços', incluso: true },
      ]),
    );
  });

  it('contratos: limite por mês do plano, sem limite (null) ou sem número (chave ausente)', () => {
    const contratos = (p: PlanoVitrine) =>
      itensDoPlano(p).find((i) => i.texto.startsWith('Contratos'));
    expect(contratos(essencial)).toEqual({
      texto: 'Contratos com aceite eletrônico: até 10 por mês',
      incluso: true,
    });
    expect(contratos(profissional)).toEqual({
      texto: 'Contratos com aceite eletrônico, sem limite',
      incluso: true,
    });
    const { contratosMes: _, ...semChave } = essencial;
    expect(contratos(semChave)).toEqual({
      texto: 'Contratos com aceite eletrônico',
      incluso: true,
    });
    expect(contratos({ ...essencial, contratosMes: 0 })?.incluso).toBe(false);
  });

  it('itens que valem para todos os planos aparecem nos dois', () => {
    const comuns = (p: PlanoVitrine) =>
      itensDoPlano(p)
        .filter((i) => i.incluso)
        .map((i) => i.texto);
    for (const t of ['Controle de recebimentos por festa', 'Propostas na web e em PDF']) {
      expect(comuns(essencial)).toContain(t);
      expect(comuns(profissional)).toContain(t);
    }
  });

  it('etiqueta só quando o plano mais barato não tem o recurso', () => {
    expect(planoDoRecurso([profissional, essencial], 'followUp')).toBe('Profissional');
    expect(
      planoDoRecurso([essencial, { ...profissional, followUp: false }], 'followUp'),
    ).toBeNull();
    expect(
      planoDoRecurso([{ ...essencial, whatsappAvisos: true }, profissional], 'whatsappAvisos'),
    ).toBeNull();
    expect(planoDoRecurso([], 'numerosCompleto')).toBeNull();
  });
});

describe('precoNoCiclo', () => {
  it('mensal mostra a mensalidade, sem total anual', () => {
    expect(precoNoCiclo(essencial, 'mensal')).toEqual({
      porMesCentavos: 14700,
      totalAnualCentavos: null,
      economiaCentavos: 0,
    });
  });

  it('anual mostra o equivalente por mês e o total cobrado no ano', () => {
    expect(precoNoCiclo(profissional, 'anual')).toEqual({
      porMesCentavos: 20583,
      totalAnualCentavos: 247000,
      economiaCentavos: 49400,
    });
  });
});
