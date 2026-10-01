import { describe, expect, it } from 'vitest';
import { diaDaSemanaNumero } from '@/domain/dates';
import { calcularOrcamento } from '@/domain/preco';
import { escolhasDeExemplo } from '@/domain/proposta';
import { entradaDoMotor } from '@/domain/publico/previa';
import { contextoBase } from '../preco/fixture';

describe('proposta de exemplo (Ver como fica minha proposta)', () => {
  const hoje = '2026-10-01';

  it('escolhe uma festa válida num sábado depois da antecedência', () => {
    const ctx = contextoBase();
    const e = escolhasDeExemplo(ctx, hoje)!;
    expect(e).not.toBeNull();
    expect(e.data! >= '2026-10-31').toBe(true);
    expect(diaDaSemanaNumero(e.data!)).toBe(6);
    expect(calcularOrcamento(ctx, entradaDoMotor(ctx, e, hoje)!).ok).toBe(true);
  });

  it('sem pacote, turno ou espaço ativo: null', () => {
    const ctx = contextoBase();
    expect(escolhasDeExemplo({ ...ctx, pacotes: [] }, hoje)).toBeNull();
    expect(escolhasDeExemplo({ ...ctx, turnos: [] }, hoje)).toBeNull();
    expect(
      escolhasDeExemplo(
        { ...ctx, espacos: ctx.espacos.map((x) => ({ ...x, ativo: false })) },
        hoje,
      ),
    ).toBeNull();
  });
});
