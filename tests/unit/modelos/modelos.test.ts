import { describe, expect, it } from 'vitest';
import {
  contextoDoModelo,
  idDoModelo,
  MODELOS,
  modeloDoSegmento,
  modeloSchema,
} from '@/domain/modelos';
import { calcularOrcamento, type EntradaOrcamento } from '@/domain/preco';
import { SEGMENTOS } from '@/domain/segmento';

const HOJE = '2026-09-30';
const SABADO = '2026-11-14';

describe.each(SEGMENTOS)('modelo %s', (segmento) => {
  const modelo = MODELOS[segmento];

  it('é válido no schema (inclusive integridade das chaves)', () => {
    expect(() => modeloDoSegmento(segmento)).not.toThrow();
    expect(modelo.segmento).toBe(segmento);
  });

  it('tem 3 pacotes com cardápio, faixas de idade padrão e regras de exemplo', () => {
    expect(modelo.pacotes).toHaveLength(3);
    for (const p of modelo.pacotes) expect(p.secoes.length).toBeGreaterThan(0);
    expect(modelo.faixasIdade.map((f) => f.fatorBp)).toEqual([0, 5000, 10000]);
    expect(modelo.regras.sinalBp).toBe(3000);
  });

  it('todo pacote dá preço válido no motor para uma festa típica de sábado', () => {
    const contexto = contextoDoModelo(modelo);
    const espaco = modelo.espacos[0]!;
    for (const p of modelo.pacotes) {
      const entrada: EntradaOrcamento = {
        canal: 'publico',
        hoje: HOJE,
        tipoEventoId: idDoModelo.tipoEvento(modelo.tiposEvento[0]!.chave),
        data: SABADO,
        turnoId: idDoModelo.turno(modelo.turnos[0]!.chave),
        espacoId: idDoModelo.espaco(espaco.chave),
        adultos: Math.max(p.minConvidados, 60),
        criancas: [{ faixaIdadeId: idDoModelo.faixaIdade(1), quantidade: 10 }],
        pacoteId: idDoModelo.pacote(p.chave),
        opcionais: [],
        horasExtras: 0,
        distanciaKm: espaco.noLocalDoCliente ? 35 : undefined,
      };
      const r = calcularOrcamento(contexto, entrada);
      expect(r.erros).toEqual([]);
      expect(r.totalCentavos).toBeGreaterThan(0);
    }
  });
});

describe('valores dos modelos no motor', () => {
  it('infantil: Super com 65 equivalentes no sábado = faixa até 80 + 10%', () => {
    const r = calcularOrcamento(contextoDoModelo(MODELOS.infantil), {
      canal: 'publico',
      hoje: HOJE,
      tipoEventoId: idDoModelo.tipoEvento('aniversario-infantil'),
      data: SABADO,
      turnoId: idDoModelo.turno('tarde'),
      espacoId: idDoModelo.espaco('salao-principal'),
      adultos: 60,
      criancas: [
        { faixaIdadeId: idDoModelo.faixaIdade(0), quantidade: 10 },
        { faixaIdadeId: idDoModelo.faixaIdade(1), quantidade: 10 },
      ],
      pacoteId: idDoModelo.pacote('super'),
      opcionais: [{ opcionalId: idDoModelo.opcional('mesa-tematica'), quantidade: 1 }],
      horasExtras: 1,
    });
    expect(r.ok).toBe(true);
    expect(r.linhas.map((l) => l.subtotalCentavos)).toEqual([650000, 65000, 60000, 45000]);
    expect(r.totalCentavos).toBe(820000);
  });

  it('infantil: bolo cenográfico já vem no Encanto', () => {
    const r = calcularOrcamento(contextoDoModelo(MODELOS.infantil), {
      canal: 'publico',
      hoje: HOJE,
      tipoEventoId: idDoModelo.tipoEvento('batizado'),
      data: '2026-11-11',
      turnoId: idDoModelo.turno('almoco'),
      espacoId: idDoModelo.espaco('salao-principal'),
      adultos: 40,
      criancas: [],
      pacoteId: idDoModelo.pacote('encanto'),
      opcionais: [{ opcionalId: idDoModelo.opcional('bolo-cenografico'), quantidade: 1 }],
      horasExtras: 0,
    });
    expect(r.erros.map((e) => e.codigo)).toEqual(['OPCIONAL_JA_INCLUSO']);
    // quarta-feira: −15% sobre a faixa até 50 (5.600,00)
    expect(r.linhas.map((l) => l.subtotalCentavos)).toEqual([560000, -84000]);
  });

  it('domicílio: deslocamento por km com 20 km grátis a R$ 3,00', () => {
    const r = calcularOrcamento(contextoDoModelo(MODELOS.domicilio), {
      canal: 'publico',
      hoje: HOJE,
      tipoEventoId: idDoModelo.tipoEvento('churrasco'),
      data: '2026-11-15', // domingo +10%
      turnoId: idDoModelo.turno('almoco'),
      espacoId: idDoModelo.espaco('local-cliente'),
      adultos: 50,
      criancas: [],
      pacoteId: idDoModelo.pacote('churrasco'),
      opcionais: [{ opcionalId: idDoModelo.opcional('garcom-extra'), quantidade: 2 }],
      horasExtras: 0,
      distanciaKm: 35,
    });
    expect(r.ok).toBe(true);
    expect(r.linhas.map((l) => [l.tipo, l.subtotalCentavos])).toEqual([
      ['pacote', 375000],
      ['ajuste_dia', 37500],
      ['opcional', 44000],
      ['deslocamento', 4500],
    ]);
  });

  it('eventos: sexta −10% e Noite só de quinta a domingo', () => {
    const contexto = contextoDoModelo(MODELOS.eventos);
    const base: EntradaOrcamento = {
      canal: 'publico',
      hoje: HOJE,
      tipoEventoId: idDoModelo.tipoEvento('casamento'),
      data: '2026-11-13',
      turnoId: idDoModelo.turno('noite'),
      espacoId: idDoModelo.espaco('salao'),
      adultos: 100,
      criancas: [],
      pacoteId: idDoModelo.pacote('especial'),
      opcionais: [],
      horasExtras: 0,
    };
    const sexta = calcularOrcamento(contexto, base);
    expect(sexta.linhas.map((l) => l.subtotalCentavos)).toEqual([1650000, -165000]);
    const terca = calcularOrcamento(contexto, { ...base, data: '2026-11-10' });
    expect(terca.erros.map((e) => e.codigo)).toEqual(['TURNO_INDISPONIVEL_NO_DIA']);
  });
});

describe('validação de integridade do modelo', () => {
  const base = MODELOS.infantil;

  it.each([
    [
      'pacote apontando para tipo inexistente',
      {
        pacotes: base.pacotes.map((p, i) => (i === 0 ? { ...p, tiposEvento: ['nao-existe'] } : p)),
      },
    ],
    [
      'opcional incluso em pacote inexistente',
      { opcionais: [{ ...base.opcionais[0]!, pacotesInclusos: ['fantasma'] }] },
    ],
    ['chave de pacote repetida', { pacotes: base.pacotes.map((p) => ({ ...p, chave: 'igual' })) }],
    [
      'faixas de idade sobrepostas',
      {
        faixasIdade: [
          { rotulo: 'a', idadeMin: 0, idadeMax: 6, fatorBp: 0 },
          { rotulo: 'b', idadeMin: 6, idadeMax: null, fatorBp: 1 },
        ],
      },
    ],
    [
      'deslocamento sem espaço no local do cliente',
      { regras: { ...base.regras, deslocamentoModelo: 'por_km' as const } },
    ],
    [
      'por faixa sem faixas',
      { pacotes: base.pacotes.map((p, i) => (i === 0 ? { ...p, faixasPreco: [] } : p)) },
    ],
    [
      'por pessoa sem preço',
      {
        pacotes: base.pacotes.map((p, i) =>
          i === 0 ? { ...p, modeloPreco: 'por_pessoa' as const } : p,
        ),
      },
    ],
    [
      'máximo menor que o mínimo',
      { pacotes: base.pacotes.map((p, i) => (i === 0 ? { ...p, maxConvidados: 1 } : p)) },
    ],
    [
      'ajuste repetido',
      {
        ajustesDia: [
          { diaSemana: 6, ajusteBp: 1 },
          { diaSemana: 6, ajusteBp: 2 },
        ],
      },
    ],
    [
      'ajuste com turno inexistente',
      { ajustesDia: [{ diaSemana: 6, turno: 'madrugada', ajusteBp: 1 }] },
    ],
  ])('recusa %s', (_n, mudanca) => {
    expect(modeloSchema.safeParse({ ...base, ...mudanca }).success).toBe(false);
  });
});
