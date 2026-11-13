import { describe, expect, it } from 'vitest';
import {
  calcularOrcamento,
  entradaOrcamentoSchema,
  retiraveisDoPacote,
  type ContextoPreco,
  type EntradaOrcamento,
} from '@/domain/preco';
import { montarPrevia } from '@/domain/publico/previa';
import { contextoBase, entradaSimples, HOJE } from './fixture';

/*
 * Fase 6.5: o cliente tira do pacote um opcional incluso que o buffet marcou como retirável.
 * Sem desconto definido pelo buffet, o preço não muda; com desconto, vira linha negativa.
 */

function ctx(desconto: number | null = null, mudar?: (c: ContextoPreco) => void) {
  const c = contextoBase();
  const bolo = c.opcionais.find((o) => o.id === 'op-bolo')!;
  bolo.retiravelEm = [{ pacoteId: 'pac-super', descontoCentavos: desconto }];
  mudar?.(c);
  return c;
}
const entrada = (extra: Partial<EntradaOrcamento> = {}) =>
  entradaSimples({ pacoteId: 'pac-super', adultos: 40, ...extra });
const retirada = (r: ReturnType<typeof calcularOrcamento>) =>
  r.linhas.filter((l) => l.tipo === 'retirado');

describe('item incluso retirado', () => {
  it('sem desconto: linha "retirado" de valor zero e o total não muda', () => {
    const c = ctx();
    const sem = calcularOrcamento(c, entrada());
    const com = calcularOrcamento(c, entrada({ retirados: ['op-bolo'] }));
    expect(com.ok).toBe(true);
    expect(retirada(com)).toEqual([
      {
        tipo: 'retirado',
        referenciaId: 'op-bolo',
        descricao: 'Retirado: Bolo cenográfico',
        quantidade: 1,
        valorUnitarioCentavos: 0,
        subtotalCentavos: 0,
        detalhe: 'Retirado do pacote',
      },
    ]);
    expect(com.totalCentavos).toBe(sem.totalCentavos);
  });

  it('com o desconto do buffet: linha negativa e total menor', () => {
    const c = ctx(15000);
    const sem = calcularOrcamento(c, entrada());
    const com = calcularOrcamento(c, entrada({ retirados: ['op-bolo'] }));
    expect(retirada(com)[0]).toMatchObject({
      subtotalCentavos: -15000,
      detalhe: 'Retirado do pacote, com desconto',
    });
    expect(com.totalCentavos).toBe(sem.totalCentavos - 15000);
    // não é desconto do vendedor
    expect(com.descontoCentavos).toBe(0);
  });

  it('o desconto somado nunca passa do valor do pacote', () => {
    const c = ctx(9_000_000);
    const r = calcularOrcamento(c, entrada({ retirados: ['op-bolo'] }));
    const pacote = r.linhas.find((l) => l.tipo === 'pacote')!;
    expect(retirada(r)[0]!.subtotalCentavos).toBe(-pacote.subtotalCentavos);
  });

  it('item não marcado como retirável, de outro pacote, repetido ou inexistente: erro', () => {
    const naoMarcado = calcularOrcamento(contextoBase(), entrada({ retirados: ['op-bolo'] }));
    expect(naoMarcado.erros.map((e) => e.codigo)).toEqual(['ITEM_NAO_RETIRAVEL']);
    expect(naoMarcado.erros[0]!.campo).toBe('retirados.0');

    const outroPacote = calcularOrcamento(
      ctx(),
      entradaSimples({ pacoteId: 'pac-pessoa', adultos: 40, retirados: ['op-bolo'] }),
    );
    expect(outroPacote.erros.map((e) => e.codigo)).toEqual(['ITEM_NAO_RETIRAVEL']);

    const repetido = calcularOrcamento(ctx(), entrada({ retirados: ['op-bolo', 'op-bolo'] }));
    expect(repetido.erros.map((e) => e.campo)).toEqual(['retirados.1']);
    expect(retirada(repetido)).toHaveLength(1);

    const inexistente = calcularOrcamento(ctx(), entrada({ retirados: ['nao-existe'] }));
    expect(inexistente.ok).toBe(false);
  });

  it('retiraveisDoPacote lista só os marcados no pacote, com o desconto', () => {
    expect(retiraveisDoPacote(ctx(5000), 'pac-super')).toEqual([
      { id: 'op-bolo', nome: 'Bolo cenográfico', descontoCentavos: 5000 },
    ]);
    expect(retiraveisDoPacote(ctx(), 'pac-pessoa')).toEqual([]);
    expect(retiraveisDoPacote(contextoBase(), 'pac-super')).toEqual([]);
  });

  it('a entrada do motor aceita retirados (e continua aceitando sem)', () => {
    expect(entradaOrcamentoSchema.safeParse(entrada()).success).toBe(true);
  });
});

describe('prévia do link público', () => {
  const escolhas = {
    tipoEventoId: 'te-infantil',
    data: '2026-11-11',
    turnoId: 'tu-tarde',
    espacoId: 'esp-salao',
    adultos: 40,
    criancas: [],
    pacoteId: 'pac-super',
    opcionais: [],
    horasExtras: 0,
  };

  it('antes do contato, nada de retiráveis (nem valores)', () => {
    const p = montarPrevia(ctx(15000), escolhas, {
      hoje: HOJE,
      comContato: false,
      modo: 'exato',
    });
    expect(p.retiraveis).toEqual([]);
  });

  it('depois do contato: lista e aplica só no pacote escolhido', () => {
    const p = montarPrevia(
      ctx(15000),
      { ...escolhas, retirados: ['op-bolo'] },
      { hoje: HOJE, comContato: true, modo: 'exato' },
    );
    expect(p.retiraveis).toEqual([
      { id: 'op-bolo', nome: 'Bolo cenográfico', descontoCentavos: 15000 },
    ]);
    expect(p.resultado?.linhas.some((l) => l.tipo === 'retirado')).toBe(true);
    // o total dos outros pacotes não leva o retirado (ele é do pacote Super)
    const outro = montarPrevia(
      ctx(15000),
      { ...escolhas, retirados: ['op-bolo'] },
      { hoje: HOJE, comContato: true, modo: 'exato' },
    ).pacotes.find((x) => x.id === 'pac-pessoa');
    expect(outro?.totalCentavos ?? null).not.toBeUndefined();
  });
});
