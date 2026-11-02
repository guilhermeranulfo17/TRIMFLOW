import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIAS_TESTE_GRATIS } from '@/domain/cobranca/precos';
import { diaDaSemanaNumero } from '@/domain/dates';
import { maxCriancas, montarExemploSimulador, proximoSabado, simular } from '@/domain/marketing';
import { contextoDoModelo, MODELOS } from '@/domain/modelos';
import { calcularOrcamento } from '@/domain/preco';

const HOJE = '2026-10-03';
const ex = montarExemploSimulador(contextoDoModelo(MODELOS.infantil), HOJE);

describe('simulador da landing', () => {
  it('monta o exemplo do modelo infantil: sábado à tarde, 3 tipos, 3 pacotes', () => {
    expect(diaDaSemanaNumero(ex.data)).toBe(6);
    expect(ex.data > HOJE).toBe(true);
    expect(ex.tipos).toHaveLength(3);
    expect(ex.pacotes.map((p) => p.nome)).toEqual(['Alegria', 'Super', 'Encanto']);
    expect(ex.convidados).toMatchObject({ min: 15, max: 120, inicial: 50 });
    // faixa cobrada em parte (6 a 10 anos, 50%) e o adicional de valor fixo do modelo
    expect(ex.criancas).toMatchObject({ rotulo: '6 a 10 anos', fatorBp: 5000 });
    expect(ex.adicionais.map((a) => a.nome)).toEqual(['Mesa temática']);
  });

  it('crianças e adicional: mesma saída do motor, e cada um muda o total', () => {
    const mesa = ex.adicionais[0]!;
    for (const pacote of ex.pacotes) {
      for (const n of [ex.convidados.min, 50, 65, ex.convidados.max]) {
        for (const criancas of [0, Math.min(10, maxCriancas(ex, n)), maxCriancas(ex, n)]) {
          for (const adicionais of [[], [mesa.id]]) {
            const r = simular(ex, {
              tipoEventoId: ex.tipos[0]!.id,
              pacoteId: pacote.id,
              convidados: n,
              criancas,
              adicionais,
            });
            const motor = calcularOrcamento(ex.contexto, {
              canal: 'publico',
              hoje: ex.hoje,
              tipoEventoId: ex.tipos[0]!.id,
              data: ex.data,
              turnoId: ex.turnoId,
              espacoId: ex.espacoId,
              adultos: n - criancas,
              criancas:
                criancas > 0 ? [{ faixaIdadeId: ex.criancas!.id, quantidade: criancas }] : [],
              pacoteId: pacote.id,
              opcionais: adicionais.map((opcionalId) => ({ opcionalId, quantidade: 1 })),
              horasExtras: 0,
            });
            expect(r).toEqual(motor);
            expect(r.ok).toBe(true);
          }
        }
      }
    }
    const base = { tipoEventoId: ex.tipos[0]!.id, pacoteId: ex.pacotes[0]!.id, convidados: 50 };
    const sem = simular(ex, base).totalCentavos;
    expect(simular(ex, { ...base, adicionais: [mesa.id] }).totalCentavos).toBe(
      sem + mesa.precoCentavos,
    );
    // Super por faixa: 55 adultos caem na faixa até 80; com 10 crianças a 50%, 50 equivalentes
    // caem na faixa até 50
    const super55 = { ...base, pacoteId: ex.pacotes[1]!.id, convidados: 55 };
    expect(simular(ex, { ...super55, criancas: 10 }).convidadosEquivalentes).toBe(50);
    expect(simular(ex, { ...super55, criancas: 10 }).totalCentavos).toBeLessThan(
      simular(ex, super55).totalCentavos,
    );
  });

  it('crianças e adicionais fora do exemplo são ignorados ou limitados', () => {
    const base = { tipoEventoId: ex.tipos[0]!.id, pacoteId: ex.pacotes[0]!.id, convidados: 40 };
    expect(simular(ex, { ...base, criancas: 999 })).toEqual(
      simular(ex, { ...base, criancas: maxCriancas(ex, 40) }),
    );
    expect(simular(ex, { ...base, criancas: -3 })).toEqual(simular(ex, base));
    expect(simular(ex, { ...base, adicionais: ['nao-existe'] })).toEqual(simular(ex, base));
  });

  it('mesma saída do motor do link público em todas as combinações do exemplo', () => {
    for (const tipo of ex.tipos) {
      for (const pacote of ex.pacotes) {
        for (let n = ex.convidados.min; n <= ex.convidados.max; n += ex.convidados.passo) {
          const r = simular(ex, { tipoEventoId: tipo.id, pacoteId: pacote.id, convidados: n });
          const motor = calcularOrcamento(ex.contexto, {
            canal: 'publico',
            hoje: ex.hoje,
            tipoEventoId: tipo.id,
            data: ex.data,
            turnoId: ex.turnoId,
            espacoId: ex.espacoId,
            adultos: n,
            criancas: [],
            pacoteId: pacote.id,
            opcionais: [],
            horasExtras: 0,
          });
          expect(r).toEqual(motor);
          expect(r.ok).toBe(true);
        }
      }
    }
  });

  it('convidados fora da faixa voltam para dentro dela', () => {
    const base = { tipoEventoId: ex.tipos[0]!.id, pacoteId: ex.pacotes[0]!.id };
    expect(simular(ex, { ...base, convidados: 3 }).totalCentavos).toBe(
      simular(ex, { ...base, convidados: ex.convidados.min }).totalCentavos,
    );
    expect(simular(ex, { ...base, convidados: 999 }).totalCentavos).toBe(
      simular(ex, { ...base, convidados: ex.convidados.max }).totalCentavos,
    );
  });

  it('próximo sábado a partir de hoje + 30 dias', () => {
    expect(proximoSabado('2026-10-03')).toBe('2026-11-07');
    expect(proximoSabado('2026-10-03', 0)).toBe('2026-10-03');
  });

  it('"14 dias grátis" do texto bate com o trial do cadastro no SQL', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const ultima = readdirSync(dir)
      .sort()
      .filter((f) => /_criar_conta_dono\s*\(/.test(readFileSync(join(dir, f), 'utf8')))
      .at(-1)!;
    const corpo = readFileSync(join(dir, ultima), 'utf8');
    expect(corpo).toMatch(new RegExp(`now\\(\\) \\+ interval '${DIAS_TESTE_GRATIS} days'`));
  });
});
