import { describe, expect, it } from 'vitest';
import {
  calcularOrcamento,
  type ContextoPreco,
  type EntradaOrcamento,
  type ResultadoOrcamento,
} from '@/domain/preco';
import { contextoBase, entradaAceitacao, entradaSimples, HOJE, SABADO } from './fixture';

function calc(entrada: Partial<EntradaOrcamento>, mudarContexto?: (c: ContextoPreco) => void) {
  const contexto = contextoBase();
  mudarContexto?.(contexto);
  return calcularOrcamento(contexto, entradaSimples(entrada));
}
const codigos = (r: ResultadoOrcamento) => r.erros.map((e) => e.codigo);
const avisos = (r: ResultadoOrcamento) => r.avisos.map((a) => a.codigo);
const linha = (r: ResultadoOrcamento, tipo: string) => r.linhas.filter((l) => l.tipo === tipo);

describe('convidados equivalentes', () => {
  it.each([
    ['só adultos', 40, [], 40, 40],
    ['1 criança meia arredonda para cima', 0, [{ faixaIdadeId: 'fi-6-10', quantidade: 1 }], 1, 1],
    ['3 crianças meia = 1,5 → 2', 30, [{ faixaIdadeId: 'fi-6-10', quantidade: 3 }], 32, 33],
    ['isentas não contam', 30, [{ faixaIdadeId: 'fi-0-5', quantidade: 10 }], 30, 40],
    ['11+ contam inteiro', 30, [{ faixaIdadeId: 'fi-11', quantidade: 5 }], 35, 35],
  ])('%s', (_n, adultos, criancas, eq, pessoas) => {
    const r = calc({ adultos, criancas, pacoteId: 'pac-faixas' });
    expect(r.convidadosEquivalentes).toBe(eq);
    expect(r.pessoasFisicas).toBe(pessoas);
  });

  it('faixas do pacote sobrescrevem as da empresa (mapeando pela idade mínima)', () => {
    const r = calc(
      { adultos: 30, criancas: [{ faixaIdadeId: 'fi-6-10', quantidade: 10 }] },
      (c) => {
        c.faixasIdade.push(
          {
            id: 'pk-0-7',
            rotulo: '0 a 7',
            idadeMin: 0,
            idadeMax: 7,
            fatorBp: 0,
            pacoteId: 'pac-pessoa',
            ordem: 1,
          },
          {
            id: 'pk-8',
            rotulo: '8+',
            idadeMin: 8,
            idadeMax: null,
            fatorBp: 10000,
            pacoteId: 'pac-pessoa',
            ordem: 2,
          },
        );
      },
    );
    // 6 a 10 da empresa cai em "0 a 7" do pacote (fator 0)
    expect(r.convidadosEquivalentes).toBe(30);
    expect(r.ok).toBe(true);
  });

  it('aceita o id da faixa do próprio pacote', () => {
    const r = calc({ adultos: 30, criancas: [{ faixaIdadeId: 'pk-8', quantidade: 4 }] }, (c) => {
      c.faixasIdade.push({
        id: 'pk-8',
        rotulo: '8+',
        idadeMin: 8,
        idadeMax: null,
        fatorBp: 2500,
        pacoteId: 'pac-pessoa',
        ordem: 1,
      });
    });
    expect(r.convidadosEquivalentes).toBe(31);
  });

  it('faixa sem correspondente no pacote é referência inválida', () => {
    const r = calc({ adultos: 30, criancas: [{ faixaIdadeId: 'fi-0-5', quantidade: 2 }] }, (c) => {
      c.faixasIdade.push({
        id: 'pk-8',
        rotulo: '8+',
        idadeMin: 8,
        idadeMax: null,
        fatorBp: 10000,
        pacoteId: 'pac-pessoa',
        ordem: 1,
      });
    });
    expect(r.erros).toContainEqual(
      expect.objectContaining({ codigo: 'REFERENCIA_INVALIDA', campo: 'criancas.0' }),
    );
    expect(r.pessoasFisicas).toBe(32);
  });

  it('faixa inexistente é referência inválida', () => {
    const r = calc({ criancas: [{ faixaIdadeId: 'nao-existe', quantidade: 1 }] });
    expect(codigos(r)).toEqual(['REFERENCIA_INVALIDA']);
  });
});

describe('pacote', () => {
  it('por pessoa: equivalentes × preço', () => {
    const r = calc({ adultos: 40 });
    expect(linha(r, 'pacote')[0]).toMatchObject({
      quantidade: 40,
      valorUnitarioCentavos: 12000,
      subtotalCentavos: 480000,
      detalhe: '40 convidados equivalentes × R$ 120,00',
    });
  });

  it.each([
    [30, 300000, '30 convidados equivalentes: faixa até 30'],
    [31, 420000, '31 convidados equivalentes: faixa até 50'],
    [50, 420000, '50 convidados equivalentes: faixa até 50'],
    [80, 600000, '80 convidados equivalentes: faixa até 80'],
    [83, 621000, '83 convidados equivalentes: faixa até 80 + 3 × R$ 70,00'],
    [1, 300000, '1 convidado equivalente: faixa até 30'],
  ])('por faixa com %i equivalentes = %i', (adultos, valor, detalhe) => {
    const r = calc({ adultos, pacoteId: 'pac-faixas' });
    expect(linha(r, 'pacote')[0]).toMatchObject({ subtotalCentavos: valor, detalhe });
  });

  it('pacote sem faixas de preço não gera linha e acusa referência inválida', () => {
    const r = calc({ pacoteId: 'pac-sem-preco' });
    expect(linha(r, 'pacote')).toEqual([]);
    expect(r.erros).toContainEqual(
      expect.objectContaining({ codigo: 'REFERENCIA_INVALIDA', campo: 'pacoteId' }),
    );
  });

  it('pacote por pessoa sem preço também é inválido', () => {
    const r = calc({}, (c) => {
      c.pacotes.find((p) => p.id === 'pac-pessoa')!.precoPessoaCentavos = null;
    });
    expect(codigos(r)).toEqual(['REFERENCIA_INVALIDA']);
  });
});

describe('ajuste de dia', () => {
  const comAjustes = (c: ContextoPreco) => {
    c.feriados = [{ data: SABADO, nome: 'Aniversário da cidade' }];
    c.ajustesDia = [
      { id: 'dia', tipo: 'dia_semana', diaSemana: 6, turnoId: null, ajusteBp: 1000 },
      { id: 'dia-turno', tipo: 'dia_semana', diaSemana: 6, turnoId: 'tu-tarde', ajusteBp: 1500 },
      { id: 'feriado', tipo: 'feriado', diaSemana: null, turnoId: null, ajusteBp: 2000 },
      {
        id: 'feriado-turno',
        tipo: 'feriado',
        diaSemana: null,
        turnoId: 'tu-tarde',
        ajusteBp: 2500,
      },
    ];
  };
  const base = { data: SABADO, adultos: 50 }; // pacote 600.000

  it.each([
    [
      'feriado com o turno vence tudo',
      [],
      'feriado-turno',
      150000,
      'Ajuste feriado (Aniversário da cidade), Tarde',
    ],
    [
      'sem ele, feriado geral',
      ['feriado-turno'],
      'feriado',
      120000,
      'Ajuste feriado (Aniversário da cidade)',
    ],
    [
      'sem feriados, dia com o turno',
      ['feriado-turno', 'feriado'],
      'dia-turno',
      90000,
      'Ajuste sábado, Tarde',
    ],
    [
      'por fim, dia da semana geral',
      ['feriado-turno', 'feriado', 'dia-turno'],
      'dia',
      60000,
      'Ajuste sábado',
    ],
  ])('%s', (_n, remover, id, valor, descricao) => {
    const r = calc(base, (c) => {
      comAjustes(c);
      c.ajustesDia = c.ajustesDia.filter((a) => !remover.includes(a.id));
    });
    expect(linha(r, 'ajuste_dia')[0]).toMatchObject({
      referenciaId: id,
      subtotalCentavos: valor,
      descricao,
    });
  });

  it('feriado sem ajuste próprio cai no ajuste do dia da semana', () => {
    const r = calc(base, (c) => {
      c.feriados = [{ data: SABADO, nome: 'Qualquer' }];
    });
    expect(linha(r, 'ajuste_dia')[0]).toMatchObject({
      referenciaId: 'aj-sab',
      subtotalCentavos: 60000,
    });
  });

  it('ajuste de outro turno não vale', () => {
    const r = calc({ ...base, turnoId: 'tu-almoco' }, (c) => {
      c.ajustesDia = [
        { id: 'x', tipo: 'dia_semana', diaSemana: 6, turnoId: 'tu-tarde', ajusteBp: 1500 },
      ];
    });
    expect(linha(r, 'ajuste_dia')).toEqual([]);
  });

  it('ajuste negativo vira linha negativa', () => {
    const r = calc({ adultos: 50, data: '2026-11-11' }, (c) => {
      c.ajustesDia = [
        { id: 'qua', tipo: 'dia_semana', diaSemana: 3, turnoId: null, ajusteBp: -1500 },
      ];
    });
    expect(linha(r, 'ajuste_dia')[0]).toMatchObject({
      subtotalCentavos: -90000,
      descricao: 'Ajuste quarta-feira',
      detalhe: '-15% sobre o pacote (R$ 6.000,00)',
    });
    expect(r.subtotalCentavos).toBe(510000);
  });

  it('ajuste 0% não gera linha, mas anula o de menor precedência', () => {
    const r = calc(base, (c) => {
      c.feriados = [{ data: SABADO, nome: 'Feriado' }];
      c.ajustesDia.push({
        id: 'zero',
        tipo: 'feriado',
        diaSemana: null,
        turnoId: null,
        ajusteBp: 0,
      });
    });
    expect(linha(r, 'ajuste_dia')).toEqual([]);
  });

  it('ajuste sobre pacote + opcionais quando configurado', () => {
    const r = calc({ ...base, opcionais: [{ opcionalId: 'op-mesa', quantidade: 1 }] }, (c) => {
      c.regras.ajusteIncide = 'pacote_opcionais';
    });
    expect(linha(r, 'ajuste_dia')[0]).toMatchObject({
      subtotalCentavos: 66000,
      detalhe: '+10% sobre pacote e opcionais (R$ 6.600,00)',
    });
  });

  it('sem ajuste aplicável, sem linha', () => {
    expect(linha(calc({ data: '2026-11-11' }), 'ajuste_dia')).toEqual([]);
  });
});

describe('opcionais', () => {
  it.each([
    ['fixo', 'op-mesa', 1, 60000, 1, 'Valor fixo'],
    ['por unidade', 'op-personagem', 2, 70000, 2, '2 × R$ 350,00'],
    ['por hora', 'op-recreacao', 3, 54000, 3, '3 h × R$ 180,00'],
    ['por pessoa', 'op-bebidas', 1, 48000, 40, '40 convidados equivalentes × R$ 12,00'],
  ])('%s', (_n, opcionalId, quantidade, valor, qtdLinha, detalhe) => {
    const r = calc({ opcionais: [{ opcionalId, quantidade }] });
    expect(r.ok).toBe(true);
    expect(linha(r, 'opcional')[0]).toMatchObject({
      subtotalCentavos: valor,
      quantidade: qtdLinha,
      detalhe,
    });
  });

  it.each([
    ['já incluso no pacote', 'pac-super', 'op-bolo', 1, 'OPCIONAL_JA_INCLUSO'],
    ['fora dos pacotes compatíveis', 'pac-faixas', 'op-so-pessoa', 1, 'OPCIONAL_INCOMPATIVEL'],
    ['fora dos tipos de evento', 'pac-pessoa', 'op-so-casamento', 1, 'OPCIONAL_INCOMPATIVEL'],
    ['acima da quantidade máxima', 'pac-pessoa', 'op-personagem', 4, 'OPCIONAL_QUANTIDADE'],
    ['abaixo da quantidade mínima', 'pac-pessoa', 'op-personagem', 0, 'OPCIONAL_QUANTIDADE'],
    ['inativo', 'pac-pessoa', 'op-inativo', 1, 'REFERENCIA_INVALIDA'],
    ['inexistente', 'pac-pessoa', 'op-nada', 1, 'REFERENCIA_INVALIDA'],
  ])('%s → %s', (_n, pacoteId, opcionalId, quantidade, codigo) => {
    const r = calc({ adultos: 40, pacoteId, opcionais: [{ opcionalId, quantidade }] });
    expect(codigos(r)).toEqual([codigo]);
    expect(r.erros[0]?.campo).toBe('opcionais.0');
    expect(linha(r, 'opcional')).toEqual([]);
    expect(linha(r, 'pacote')).toHaveLength(1); // o resto continua calculado
  });

  it('opcional repetido é recusado', () => {
    const r = calc({
      opcionais: [
        { opcionalId: 'op-mesa', quantidade: 1 },
        { opcionalId: 'op-mesa', quantidade: 1 },
      ],
    });
    expect(r.erros).toEqual([
      expect.objectContaining({ codigo: 'REFERENCIA_INVALIDA', campo: 'opcionais.1' }),
    ]);
    expect(linha(r, 'opcional')).toHaveLength(1);
  });

  it('mensagens de quantidade', () => {
    const msg = (qtdMin: number, qtdMax: number | null, quantidade: number) =>
      calc({ opcionais: [{ opcionalId: 'op-personagem', quantidade }] }, (c) => {
        const o = c.opcionais.find((x) => x.id === 'op-personagem')!;
        o.qtdMin = qtdMin;
        o.qtdMax = qtdMax;
      }).erros[0]?.mensagem;
    expect(msg(1, 3, 5)).toBe('Escolha de 1 a 3 para Personagem.');
    expect(msg(2, null, 1)).toBe('Escolha pelo menos 2 para Personagem.');
    expect(msg(2, 2, 3)).toBe('A quantidade de Personagem precisa ser 2.');
  });
});

describe('horas extras', () => {
  it('horas × valor da hora extra do pacote', () => {
    const r = calc({ horasExtras: 2 });
    expect(linha(r, 'hora_extra')[0]).toMatchObject({
      subtotalCentavos: 120000,
      detalhe: '2 h × R$ 600,00',
    });
  });

  it('zero horas, sem linha', () => {
    expect(linha(calc({ horasExtras: 0 }), 'hora_extra')).toEqual([]);
  });
});

describe('deslocamento', () => {
  const domicilio = (
    km: number | undefined,
    modelo: 'por_km' | 'por_faixa' | 'nenhum',
    canal: 'publico' | 'interno' = 'publico',
  ) =>
    calc({ espacoId: 'esp-cliente', distanciaKm: km, canal }, (c) => {
      c.regras.deslocamentoModelo = modelo;
      c.regras.deslocamentoKmGratis = 20;
      c.regras.deslocamentoValorKmCentavos = 300;
    });

  it.each([
    [35, 4500, '35 km − 20 km grátis = 15 km × R$ 3,00'],
    [34.2, 4500, '35 km − 20 km grátis = 15 km × R$ 3,00'], // km arredondado para cima
    [12, 0, '12 km (grátis até 20 km)'],
  ])('por km: %d km = %i', (km, valor, detalhe) => {
    const r = domicilio(km, 'por_km');
    expect(r.ok).toBe(true);
    expect(linha(r, 'deslocamento')[0]).toMatchObject({ subtotalCentavos: valor, detalhe });
  });

  it.each([
    [8, 5000, '8 km: faixa até 10 km'],
    [10, 5000, '10 km: faixa até 10 km'],
    [10.5, 15000, '11 km: faixa até 30 km'],
  ])('por faixa: %d km = %i', (km, valor, detalhe) => {
    expect(linha(domicilio(km, 'por_faixa'), 'deslocamento')[0]).toMatchObject({
      subtotalCentavos: valor,
      detalhe,
    });
  });

  it('fora da área: erro no público, aviso no interno', () => {
    const publico = domicilio(31, 'por_faixa');
    expect(codigos(publico)).toEqual(['FORA_AREA_ATENDIMENTO']);
    expect(publico.erros[0]?.mensagem).toContain('até 30 km');
    const interno = domicilio(31, 'por_faixa', 'interno');
    expect(interno.ok).toBe(true);
    expect(avisos(interno)).toEqual(['FORA_AREA_ATENDIMENTO']);
    expect(linha(interno, 'deslocamento')).toEqual([]);
  });

  it('por faixa sem faixas cadastradas = fora da área', () => {
    const r = calc({ espacoId: 'esp-cliente', distanciaKm: 1 }, (c) => {
      c.regras.deslocamentoModelo = 'por_faixa';
      c.faixasDeslocamento = [];
    });
    expect(codigos(r)).toEqual(['FORA_AREA_ATENDIMENTO']);
  });

  it('sem km informado para o local do cliente', () => {
    expect(codigos(domicilio(undefined, 'por_km'))).toEqual(['DISTANCIA_OBRIGATORIA']);
  });

  it('modelo nenhum ignora o deslocamento', () => {
    expect(linha(domicilio(50, 'nenhum'), 'deslocamento')).toEqual([]);
  });

  it('km em espaço comum é ignorado', () => {
    const r = calc({ distanciaKm: 80 }, (c) => {
      c.regras.deslocamentoModelo = 'por_km';
    });
    expect(linha(r, 'deslocamento')).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe('itens avulsos e desconto', () => {
  const interno = (extra: Partial<EntradaOrcamento>) => calc({ canal: 'interno', ...extra });

  it('avulso no interno: quantidade × valor', () => {
    const r = interno({
      itensAvulsos: [{ descricao: 'Cadeira extra', quantidade: 10, valorUnitarioCentavos: 800 }],
    });
    expect(linha(r, 'avulso')[0]).toMatchObject({
      subtotalCentavos: 8000,
      detalhe: '10 × R$ 8,00',
    });
    expect(r.subtotalCentavos).toBe(488000);
  });

  it('canal público recusa avulso e desconto', () => {
    const r = calc({
      itensAvulsos: [{ descricao: 'X', quantidade: 1, valorUnitarioCentavos: 1 }],
      desconto: { tipo: 'valor', centavos: 100 },
    });
    expect(r.erros.map((e) => [e.codigo, e.campo])).toEqual([
      ['CANAL_NAO_PERMITE', 'itensAvulsos'],
      ['CANAL_NAO_PERMITE', 'desconto'],
    ]);
    expect(r.descontoCentavos).toBe(0);
    expect(linha(r, 'avulso')).toEqual([]);
  });

  it('desconto em valor dentro do limite', () => {
    const r = interno({ desconto: { tipo: 'valor', centavos: 20000 }, limiteDescontoBp: 500 });
    expect(r.ok).toBe(true);
    expect(r.descontoCentavos).toBe(20000);
    expect(r.totalCentavos).toBe(460000);
    expect(linha(r, 'desconto')[0]).toMatchObject({
      subtotalCentavos: -20000,
      detalhe: 'Valor fixo',
    });
  });

  it.each([
    ['percentual acima do limite', { tipo: 'percentual', bp: 1100 } as const, 1000],
    ['valor acima do limite', { tipo: 'valor', centavos: 48001 } as const, 1000],
    ['sem limite informado', { tipo: 'percentual', bp: 1 } as const, undefined],
  ])('%s', (_n, desconto, limiteDescontoBp) => {
    const r = interno({ desconto, limiteDescontoBp });
    expect(codigos(r)).toEqual(['DESCONTO_ACIMA_LIMITE']);
    expect(r.descontoCentavos).toBeGreaterThan(0); // mostrado para conferência
  });

  it('desconto maior que o subtotal é limitado ao subtotal (e passa de um limite de 100%)', () => {
    const r = interno({ desconto: { tipo: 'valor', centavos: 999999 }, limiteDescontoBp: 10000 });
    expect(r.descontoCentavos).toBe(480000);
    expect(r.totalCentavos).toBe(0);
    expect(avisos(r)).toEqual(['DESCONTO_LIMITADO_AO_SUBTOTAL']);
    expect(codigos(r)).toEqual(['DESCONTO_ACIMA_LIMITE']);
    expect(r.parcelas).toEqual([]);
  });

  it('desconto igual ao subtotal com limite de 100% zera o total sem erro', () => {
    const r = interno({ desconto: { tipo: 'percentual', bp: 10000 }, limiteDescontoBp: 10000 });
    expect(r.ok).toBe(true);
    expect(r.totalCentavos).toBe(0);
    expect(r.sinalCentavos).toBe(0);
  });

  it('desconto zero não gera linha', () => {
    const r = interno({ desconto: { tipo: 'percentual', bp: 0 } });
    expect(linha(r, 'desconto')).toEqual([]);
  });
});

describe('validações', () => {
  it.each<[string, Partial<EntradaOrcamento>, string]>([
    ['data passada', { data: '2026-09-29' }, 'DATA_PASSADA'],
    ['antecedência mínima', { data: '2026-10-06' }, 'ANTECEDENCIA_MINIMA'],
    ['data inválida', { data: '2026-02-30' }, 'DATA_INVALIDA'],
    ['hoje inválido', { hoje: 'ontem' }, 'DATA_INVALIDA'],
    ['turno fora do dia', { turnoId: 'tu-noite', data: '2026-11-11' }, 'TURNO_INDISPONIVEL_NO_DIA'],
    [
      'tipo incompatível com o pacote',
      { pacoteId: 'pac-super', adultos: 40, tipoEventoId: 'te-casamento' },
      'TIPO_EVENTO_INCOMPATIVEL',
    ],
    ['abaixo do mínimo', { adultos: 29 }, 'CONVIDADOS_ABAIXO_MINIMO'],
    ['acima do máximo', { adultos: 201, espacoId: 'esp-cliente' }, 'CONVIDADOS_ACIMA_MAXIMO'],
    [
      'capacidade do espaço',
      { adultos: 100, criancas: [{ faixaIdadeId: 'fi-0-5', quantidade: 21 }] },
      'CAPACIDADE_ESPACO',
    ],
    ['tipo inativo', { tipoEventoId: 'te-inativo' }, 'REFERENCIA_INVALIDA'],
    ['turno inativo', { turnoId: 'tu-inativo' }, 'REFERENCIA_INVALIDA'],
    ['espaço inexistente', { espacoId: 'nada' }, 'REFERENCIA_INVALIDA'],
    ['pacote inativo', { pacoteId: 'pac-inativo' }, 'REFERENCIA_INVALIDA'],
  ])('%s → %s', (_n, entrada, codigo) => {
    const r = calc(entrada);
    expect(r.ok).toBe(false);
    expect(codigos(r)).toEqual([codigo]);
  });

  it('antecedência mínima é só aviso no interno', () => {
    const r = calc({ canal: 'interno', data: '2026-10-06' });
    expect(r.ok).toBe(true);
    expect(avisos(r)).toContain('ANTECEDENCIA_MINIMA');
  });

  it('data passada é erro também no interno', () => {
    expect(codigos(calc({ canal: 'interno', data: '2026-09-01' }))).toEqual(['DATA_PASSADA']);
  });

  it('com erro, as linhas possíveis continuam na saída', () => {
    const r = calc({ adultos: 29, opcionais: [{ opcionalId: 'op-mesa', quantidade: 1 }] });
    expect(r.ok).toBe(false);
    expect(r.linhas.map((l) => l.tipo)).toEqual(['pacote', 'opcional']);
    expect(r.totalCentavos).toBe(29 * 12000 + 60000);
  });

  it('sem pacote válido, nada de pacote nem hora extra', () => {
    const r = calc({ pacoteId: 'nada', horasExtras: 2 });
    expect(r.linhas).toEqual([]);
    expect(r.totalCentavos).toBe(0);
    expect(r.porConvidadoCentavos).toBe(10000 * 0);
  });

  it('mensagens em português simples', () => {
    expect(calc({ adultos: 29 }).erros[0]?.mensagem).toBe(
      'O pacote Clássico é a partir de 30 convidados.',
    );
    expect(calc({ data: '2026-10-06' }).erros[0]?.mensagem).toBe(
      'Para essa data precisamos de pelo menos 7 dias de antecedência.',
    );
    expect(calc({ turnoId: 'tu-noite', data: '2026-11-11' }).erros[0]?.mensagem).toBe(
      'O turno Noite não está disponível em quarta-feira.',
    );
  });

  it('antecedência de 1 dia no singular', () => {
    const r = calc({ data: HOJE }, (c) => {
      c.regras.antecedenciaMinDias = 1;
    });
    expect(r.erros[0]?.mensagem).toBe(
      'Para essa data precisamos de pelo menos 1 dia de antecedência.',
    );
  });
});

describe('por convidado, sinal e resultado', () => {
  it('por convidado arredondado meio para cima; zero sem convidados', () => {
    const r = calc({ adultos: 30, pacoteId: 'pac-faixas' }); // 300.000 / 30
    expect(r.porConvidadoCentavos).toBe(10000);
    expect(calc({ adultos: 0, pacoteId: 'pac-faixas' }).porConvidadoCentavos).toBe(0);
  });

  it('é determinístico e serializável', () => {
    const a = calcularOrcamento(contextoBase(), entradaAceitacao());
    const b = calcularOrcamento(contextoBase(), entradaAceitacao());
    expect(a).toEqual(b);
    const r = calc({ adultos: 29, espacoId: 'esp-cliente', distanciaKm: 5 });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
