import { describe, expect, it } from 'vitest';
import { planoDaLanding, precoCurto, type PlanoVitrine } from '@/domain/marketing';

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

describe('preço único da landing', () => {
  it('é o do plano que o teste grátis usa, venha em que ordem vier', () => {
    expect(planoDaLanding([essencial, profissional], 'profissional')).toBe(profissional);
    expect(planoDaLanding([profissional, essencial], 'profissional')).toBe(profissional);
  });

  it('sem o plano na vitrine (leitura falhou ou plano desativado), sem preço', () => {
    expect(planoDaLanding([], 'profissional')).toBeNull();
    expect(planoDaLanding([essencial], 'profissional')).toBeNull();
  });

  it('valor redondo sai sem centavos; com centavos, aparecem', () => {
    expect(precoCurto(24700)).toBe('R$ 247');
    expect(precoCurto(24750)).toBe('R$ 247,50');
    expect(precoCurto(124700)).toBe('R$ 1.247');
  });
});
