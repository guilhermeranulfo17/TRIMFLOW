import { describe, expect, it } from 'vitest';
import {
  CHAVES_MODELO,
  chaveModeloValida,
  contextoDoModelo,
  idDoModelo,
  MODELOS_ONBOARDING,
  modeloDaChave,
} from '@/domain/modelos';
import { calcularOrcamento } from '@/domain/preco';

/* Fase 6: modelo de casamento e 15 anos no onboarding. */

describe('modelos do onboarding', () => {
  it('quatro escolhas: infantil, casamento e 15 anos, espaço de eventos e domicílio', () => {
    expect(CHAVES_MODELO).toEqual(['infantil', 'casamento', 'eventos', 'domicilio']);
    expect(MODELOS_ONBOARDING.casamento.rotulo).toBe('Casamento e 15 anos');
    expect(MODELOS_ONBOARDING.eventos.rotulo).toBe('Espaço de eventos');
    for (const c of CHAVES_MODELO) {
      expect(() => modeloDaChave(c)).not.toThrow();
      const m = MODELOS_ONBOARDING[c];
      expect(m.rotulo + m.descricao).not.toMatch(/[—–]/);
    }
    expect(chaveModeloValida('casamento')).toBe(true);
    expect(chaveModeloValida('festa')).toBe(false);
  });

  it('casamento grava o segmento eventos (contrato de exemplo de eventos cobre casamento)', () => {
    expect(modeloDaChave('casamento').segmento).toBe('eventos');
  });

  it('casamento: tipos de festa, cardápio de jantar e opcionais coerentes', () => {
    const m = modeloDaChave('casamento');
    expect(m.tiposEvento.map((t) => t.nome)).toEqual(['Casamento', '15 anos', 'Bodas']);
    expect(m.pacotes.map((p) => p.nome)).toEqual(['Clássico', 'Premium', 'Gala']);
    for (const p of m.pacotes) {
      expect(p.modeloPreco).toBe('por_pessoa');
      expect(p.secoes.some((s) => /jantar/i.test(s.nome))).toBe(true);
    }
    expect(m.opcionais.map((o) => o.nome)).toContain('Bar de drinks');
    expect(m.opcionais.map((o) => o.nome)).toContain('Bem-casados extras');
  });

  it('todo pacote dá preço válido no motor para um casamento de sábado à noite', () => {
    const m = modeloDaChave('casamento');
    const ctx = contextoDoModelo(m);
    for (const p of m.pacotes) {
      const r = calcularOrcamento(ctx, {
        canal: 'publico',
        hoje: '2026-11-12',
        tipoEventoId: idDoModelo.tipoEvento('casamento'),
        data: '2027-05-15',
        turnoId: idDoModelo.turno('noite'),
        espacoId: idDoModelo.espaco('salao'),
        adultos: 150,
        criancas: [{ faixaIdadeId: idDoModelo.faixaIdade(1), quantidade: 10 }],
        pacoteId: idDoModelo.pacote(p.chave),
        opcionais: [],
        horasExtras: 0,
      });
      expect(r.erros).toEqual([]);
      expect(r.totalCentavos).toBeGreaterThan(0);
    }
  });
});
