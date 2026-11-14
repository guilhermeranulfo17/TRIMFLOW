import { describe, expect, it } from 'vitest';
import { CHAVES_MODELO, MODELOS_ONBOARDING } from '@/domain/modelos';
import { INFO_TIPO_BUFFET, segmentoDoTipo, TIPOS_BUFFET } from '@/domain/modelos/tipos-buffet';

/* §90: os tipos do cadastro são os modelos do onboarding (módulo leve para o navegador). */

describe('tipos de buffet do cadastro', () => {
  it('são os mesmos modelos do onboarding, com o mesmo rótulo e segmento', () => {
    expect([...TIPOS_BUFFET]).toEqual([...CHAVES_MODELO]);
    for (const t of TIPOS_BUFFET) {
      expect(INFO_TIPO_BUFFET[t].rotulo).toBe(MODELOS_ONBOARDING[t].rotulo);
      expect(segmentoDoTipo(t)).toBe(MODELOS_ONBOARDING[t].modelo.segmento);
    }
  });
});
