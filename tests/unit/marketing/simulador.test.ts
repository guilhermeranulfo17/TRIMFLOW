import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIAS_TESTE_GRATIS } from '@/domain/cobranca/precos';
import { diaDaSemanaNumero } from '@/domain/dates';
import { montarExemploSimulador, proximoSabado, simular } from '@/domain/marketing';
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
