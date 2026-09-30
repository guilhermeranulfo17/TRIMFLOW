import { describe, expect, it } from 'vitest';
import {
  aPartirDe,
  entradaOrcamentoSchema,
  faixasIdadeAplicaveis,
  opcionaisDisponiveis,
  pacotesDisponiveis,
  turnosDoDia,
} from '@/domain/preco';
import { contextoBase, entradaAceitacao, SABADO } from './fixture';

describe('pacotesDisponiveis', () => {
  it('só pacotes ativos e compatíveis com o tipo', () => {
    const ids = pacotesDisponiveis(contextoBase(), { tipoEventoId: 'te-casamento' }).map(
      (p) => p.pacote.id,
    );
    expect(ids).toEqual(['pac-faixas', 'pac-sem-preco', 'pac-pessoa']);
  });

  it('marca motivo quando fora do mínimo ou do máximo', () => {
    const r = pacotesDisponiveis(contextoBase(), { tipoEventoId: 'te-infantil', equivalentes: 25 });
    expect(r.find((p) => p.pacote.id === 'pac-pessoa')).toMatchObject({
      disponivel: false,
      motivo: 'a partir de 30 convidados',
    });
    expect(r.find((p) => p.pacote.id === 'pac-super')?.disponivel).toBe(true);
    const muitos = pacotesDisponiveis(contextoBase(), {
      tipoEventoId: 'te-infantil',
      equivalentes: 130,
    });
    expect(muitos.find((p) => p.pacote.id === 'pac-super')).toMatchObject({
      disponivel: false,
      motivo: 'até 120 convidados',
    });
  });
});

describe('opcionaisDisponiveis', () => {
  it('exclui inclusos, incompatíveis e inativos', () => {
    const ids = (pacoteId: string, tipoEventoId: string) =>
      opcionaisDisponiveis(contextoBase(), { pacoteId, tipoEventoId }).map((o) => o.id);
    expect(ids('pac-super', 'te-infantil')).toEqual([
      'op-mesa',
      'op-personagem',
      'op-recreacao',
      'op-bebidas',
    ]);
    expect(ids('pac-pessoa', 'te-casamento')).toContain('op-so-pessoa');
    expect(ids('pac-pessoa', 'te-casamento')).toContain('op-so-casamento');
    expect(ids('pac-pessoa', 'te-casamento')).toContain('op-bolo');
  });
});

describe('turnosDoDia', () => {
  it('turnos ativos do dia, em ordem', () => {
    expect(turnosDoDia(contextoBase(), SABADO).map((t) => t.id)).toEqual([
      'tu-almoco',
      'tu-tarde',
      'tu-noite',
    ]);
    expect(turnosDoDia(contextoBase(), '2026-11-11').map((t) => t.id)).toEqual([
      'tu-almoco',
      'tu-tarde',
    ]);
    expect(turnosDoDia(contextoBase(), 'invalida')).toEqual([]);
  });
});

describe('faixasIdadeAplicaveis', () => {
  it('da empresa quando o pacote não tem as próprias', () => {
    expect(faixasIdadeAplicaveis(contextoBase(), 'pac-super').map((f) => f.id)).toEqual([
      'fi-0-5',
      'fi-6-10',
      'fi-11',
    ]);
    expect(faixasIdadeAplicaveis(contextoBase(), null)).toHaveLength(3);
  });
});

describe('aPartirDe', () => {
  it('menor total sem convidados informados usa o mínimo de cada pacote', () => {
    // infantil: Super (20 → faixa até 50 = 4.500), Faixas (1 → 3.000), Clássico (30 × 120 = 3.600)
    expect(aPartirDe(contextoBase(), { tipoEventoId: 'te-infantil' })).toEqual({
      totalCentavos: 300000,
      pacoteId: 'pac-faixas',
      convidadosEquivalentes: 1,
    });
  });

  it('com convidados e data de sábado aplica o ajuste e pula pacotes fora do limite', () => {
    const r = aPartirDe(contextoBase(), {
      tipoEventoId: 'te-infantil',
      data: SABADO,
      turnoId: 'tu-tarde',
      adultos: 60,
      criancas: [{ faixaIdadeId: 'fi-6-10', quantidade: 10 }],
    });
    // 65 eq: Super 5.775 +10% = 6.352,50; Faixas 6.000 +10% = 6.600; Clássico 7.800 +10% = 8.580
    expect(r).toEqual({ totalCentavos: 635250, pacoteId: 'pac-super', convidadosEquivalentes: 65 });
  });

  it('pula pacote cujo mínimo não é atingido e ignora data inválida', () => {
    const r = aPartirDe(contextoBase(), { tipoEventoId: 'te-casamento', adultos: 10, data: 'x' });
    expect(r).toEqual({
      totalCentavos: 300000,
      pacoteId: 'pac-faixas',
      convidadosEquivalentes: 10,
    });
  });

  it('pula pacote acima do máximo', () => {
    const r = aPartirDe(contextoBase(), { tipoEventoId: 'te-infantil', adultos: 150 });
    expect(r?.pacoteId).toBe('pac-faixas');
  });

  it('null quando nenhum pacote serve', () => {
    const c = contextoBase();
    c.pacotes = [];
    expect(aPartirDe(c, { tipoEventoId: 'te-infantil' })).toBeNull();
  });
});

describe('entradaOrcamentoSchema', () => {
  it('aceita a entrada do teste de aceitação', () => {
    expect(entradaOrcamentoSchema.parse(entradaAceitacao())).toEqual(entradaAceitacao());
  });

  it.each([
    ['adultos negativos', { adultos: -1 }],
    ['adultos fracionados', { adultos: 1.5 }],
    ['data mal formatada', { data: '14/11/2026' }],
    ['desconto acima de 100%', { desconto: { tipo: 'percentual', bp: 10001 } }],
    ['canal desconhecido', { canal: 'whatsapp' }],
    ['horas extras demais', { horasExtras: 25 }],
  ])('recusa %s', (_n, mudanca) => {
    expect(entradaOrcamentoSchema.safeParse({ ...entradaAceitacao(), ...mudanca }).success).toBe(
      false,
    );
  });
});
