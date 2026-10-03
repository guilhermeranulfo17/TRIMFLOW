import { describe, expect, it } from 'vitest';
import {
  cardapioSchema,
  dadosOpcionalSchema,
  dadosPacoteSchema,
  espacoSchema,
  faixasIdadeSchema,
  precoPacoteSchema,
  tipoEventoSchema,
  turnoSchema,
  vinculosOpcionalSchema,
} from '@/domain/validacao/catalogo';
import { caminhoImagemValido, identidadeSchema, slugSchema } from '@/domain/validacao/empresa';
import {
  ajustesDiaSchema,
  condicoesSchema,
  deslocamentoSchema,
  feriadosSchema,
} from '@/domain/validacao/regras';
import { limiteDescontoSchema, novoVendedorSchema } from '@/domain/validacao/usuario';

const erros = (r: {
  success: boolean;
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}) => r.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? [];

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

describe('identidade e slug', () => {
  const valida = {
    nome: 'Buffet Alegria',
    whatsappE164: '+5534991355450',
    email: '',
    cidade: 'Uberlândia',
    uf: 'MG',
    fuso: 'America/Sao_Paulo',
    corMarca: '#0F766E',
    sobre: '',
  };

  it('aceita identidade válida', () => {
    expect(identidadeSchema.safeParse(valida).success).toBe(true);
  });

  it.each([
    ['nome curto', { nome: 'A' }, 'nome: Informe o nome do buffet.'],
    [
      'telefone inválido',
      { whatsappE164: '123' },
      'whatsappE164: Informe um telefone válido com DDD.',
    ],
    ['e-mail inválido', { email: 'x@' }, 'email: E-mail inválido.'],
    ['cor inválida', { corMarca: 'roxo' }, 'corMarca: Use uma cor no formato #RRGGBB.'],
    ['sobre longo', { sobre: 'a'.repeat(601) }, 'sobre: Use no máximo 600 caracteres.'],
  ])('recusa %s', (_n, mudanca, erro) => {
    expect(erros(identidadeSchema.safeParse({ ...valida, ...mudanca }))).toContain(erro);
  });

  it('slug normaliza e valida', () => {
    expect(slugSchema.parse({ slug: '  Buffet-Alegria ' })).toEqual({ slug: 'buffet-alegria' });
    expect(slugSchema.safeParse({ slug: 'buffet alegria' }).success).toBe(false);
    expect(slugSchema.safeParse({ slug: 'ab' }).success).toBe(false);
  });

  it('caminho de imagem preso à pasta e ao tipo', () => {
    const arquivo = '33333333-3333-4333-8333-333333333333.webp';
    expect(caminhoImagemValido(`${ID}/logo/${arquivo}`, ID, 'logo')).toBe(true);
    expect(caminhoImagemValido(`${ID2}/logo/${arquivo}`, ID, 'logo')).toBe(false);
    expect(caminhoImagemValido(`${ID}/capa/${arquivo}`, ID, 'logo')).toBe(false);
    expect(caminhoImagemValido(`${ID}/logo/../x.webp`, ID, 'logo')).toBe(false);
  });
});

describe('espaço, turno e tipo de evento', () => {
  it('espaço', () => {
    expect(
      espacoSchema.safeParse({
        nome: 'Salão',
        capacidadeMax: 120,
        eventosSimultaneos: 1,
        noLocalDoCliente: false,
        ativo: true,
      }).success,
    ).toBe(true);
    expect(
      erros(
        espacoSchema.safeParse({
          nome: '',
          capacidadeMax: 0,
          eventosSimultaneos: 51,
          noLocalDoCliente: false,
          ativo: true,
        }),
      ),
    ).toEqual([
      'nome: Informe o nome do espaço.',
      'capacidadeMax: A capacidade precisa ser pelo menos 1.',
      'eventosSimultaneos: O número de eventos ao mesmo tempo pode ser no máximo 50.',
    ]);
  });

  it('turno usa as validações de negócio', () => {
    const base = {
      nome: 'Tarde',
      horaInicio: '15:00',
      duracaoMin: 240,
      diasSemana: [6],
      ativo: true,
    };
    expect(turnoSchema.safeParse(base).success).toBe(true);
    expect(erros(turnoSchema.safeParse({ ...base, duracaoMin: 0, diasSemana: [] }))).toEqual([
      'duracaoMin: Informe a duração do turno.',
      'diasSemana: Escolha pelo menos um dia da semana.',
    ]);
    expect(turnoSchema.safeParse({ ...base, horaInicio: '25:00' }).success).toBe(false);
  });

  it('tipo de evento', () => {
    expect(tipoEventoSchema.safeParse({ nome: 'Casamento', icone: '', ativo: true }).success).toBe(
      true,
    );
    expect(
      tipoEventoSchema.safeParse({ nome: 'Casamento', icone: 'Coração!', ativo: true }).success,
    ).toBe(false);
  });
});

describe('pacote', () => {
  it('dados', () => {
    expect(
      dadosPacoteSchema.safeParse({
        nome: 'Super',
        subtitulo: '',
        descricao: '',
        destaque: true,
        ativo: true,
      }).success,
    ).toBe(true);
  });

  it('preço por faixa com erros no campo certo', () => {
    const r = precoPacoteSchema.safeParse({
      modeloPreco: 'por_faixa',
      precoPessoaCentavos: null,
      valorExcedenteCentavos: null,
      faixas: [
        { ateConvidados: 50, valorCentavos: 450000 },
        { ateConvidados: 30, valorCentavos: 300000 },
      ],
      minConvidados: 20,
      maxConvidados: 120,
      duracaoInclusaMin: 240,
      valorHoraExtraCentavos: 45000,
    });
    expect(erros(r)).toEqual([
      'faixas.1.ateConvidados: As faixas precisam estar em ordem crescente de convidados.',
      'valorExcedenteCentavos: Informe o valor por convidado acima da maior faixa.',
    ]);
  });

  it('cardápio exige itens em cada seção', () => {
    expect(
      cardapioSchema.safeParse({ secoes: [{ nome: 'Doces', itens: ['Brigadeiro'] }] }).success,
    ).toBe(true);
    expect(erros(cardapioSchema.safeParse({ secoes: [{ nome: 'Doces', itens: [] }] }))).toEqual([
      'secoes.0.itens: Coloque pelo menos um item na seção.',
    ]);
  });

  it('faixas de idade sem buraco', () => {
    const faixa = (idadeMin: number, idadeMax: number | null) => ({
      rotulo: 'x',
      idadeMin,
      idadeMax,
      fatorBp: 5000,
    });
    expect(faixasIdadeSchema.safeParse({ faixas: [faixa(0, 5), faixa(6, null)] }).success).toBe(
      true,
    );
    expect(erros(faixasIdadeSchema.safeParse({ faixas: [faixa(0, 5), faixa(7, null)] }))).toEqual([
      'faixas.1.idadeMin: Falta cobrir de 6 a 6 anos.',
    ]);
    expect(
      faixasIdadeSchema.safeParse({ faixas: [{ ...faixa(0, 5), fatorBp: 10001 }] }).success,
    ).toBe(false);
  });
});

describe('opcional', () => {
  it('quantidade máxima não pode ser menor que a mínima', () => {
    const base = {
      nome: 'Personagem',
      descricao: '',
      cobranca: 'por_unidade',
      precoCentavos: 35000,
      qtdMin: 2,
      qtdMax: 1,
      ativo: true,
    };
    expect(erros(dadosOpcionalSchema.safeParse(base))).toEqual([
      'qtdMax: A quantidade máxima é menor que a mínima.',
    ]);
    expect(dadosOpcionalSchema.safeParse({ ...base, qtdMax: null }).success).toBe(true);
  });

  it('vínculos: não pode ser compatível e incluso no mesmo pacote', () => {
    expect(
      vinculosOpcionalSchema.safeParse({
        pacotes: [
          { pacoteId: ID, relacao: 'compativel' },
          { pacoteId: ID2, relacao: 'incluso' },
        ],
        tipoEventoIds: [],
      }).success,
    ).toBe(true);
    expect(
      vinculosOpcionalSchema.safeParse({
        pacotes: [
          { pacoteId: ID, relacao: 'compativel' },
          { pacoteId: ID, relacao: 'incluso' },
        ],
        tipoEventoIds: [],
      }).success,
    ).toBe(false);
  });
});

describe('regras', () => {
  it('condições', () => {
    const base = {
      validadeDias: 15,
      prazoPreReservaHoras: 48,
      antecedenciaMinDias: 7,
      sinalBp: 3000,
      parcelasMax: 3,
      prazoUltimaParcelaDias: 7,
      formasPagamento: ['Pix'],
      condicoesTexto: '',
      naoInclusoTexto: '',
      cancelamentoTexto: '',
      modoExibicaoPreco: 'exato',
      ajusteIncide: 'pacote',
    };
    expect(condicoesSchema.safeParse(base).success).toBe(true);
    expect(erros(condicoesSchema.safeParse({ ...base, sinalBp: 10001, parcelasMax: 0 }))).toEqual([
      'sinalBp: Use um percentual entre 0% e 100%.',
      'parcelasMax: O número de parcelas precisa ser pelo menos 1.',
    ]);
  });

  it('ajustes: repetição, dia coerente e limite', () => {
    expect(
      ajustesDiaSchema.safeParse({
        ajustes: [
          { tipo: 'dia_semana', diaSemana: 6, turnoId: null, ajusteBp: 1000 },
          { tipo: 'dia_semana', diaSemana: 6, turnoId: ID, ajusteBp: 1500 },
          { tipo: 'feriado', diaSemana: null, turnoId: null, ajusteBp: 2000 },
        ],
      }).success,
    ).toBe(true);
    expect(
      erros(
        ajustesDiaSchema.safeParse({
          ajustes: [
            { tipo: 'dia_semana', diaSemana: 6, turnoId: null, ajusteBp: 1000 },
            { tipo: 'dia_semana', diaSemana: 6, turnoId: null, ajusteBp: 500 },
            { tipo: 'feriado', diaSemana: 2, turnoId: null, ajusteBp: 0 },
            { tipo: 'dia_semana', diaSemana: 1, turnoId: null, ajusteBp: -9500 },
          ],
        }),
      ),
    ).toEqual([
      'ajustes.3.ajusteBp: Use um percentual entre -90% e 200%.',
      'ajustes.1: Ajuste repetido para o mesmo dia e turno.',
      'ajustes.2.diaSemana: Dia da semana inválido.',
    ]);
  });

  it('feriados sem data repetida e com data válida', () => {
    expect(
      feriadosSchema.safeParse({ feriados: [{ data: '2026-12-25', nome: 'Natal' }] }).success,
    ).toBe(true);
    expect(
      erros(
        feriadosSchema.safeParse({
          feriados: [
            { data: '2026-12-25', nome: 'Natal' },
            { data: '2026-12-25', nome: 'X' },
          ],
        }),
      ),
    ).toEqual(['feriados.1.data: Data repetida.']);
    expect(
      feriadosSchema.safeParse({ feriados: [{ data: '2026-02-30', nome: 'X' }] }).success,
    ).toBe(false);
  });

  it('deslocamento por faixa exige faixas crescentes', () => {
    const base = {
      modelo: 'por_faixa',
      kmGratis: 0,
      valorKmCentavos: 0,
      faixas: [] as { ateKm: number; valorCentavos: number }[],
    };
    expect(erros(deslocamentoSchema.safeParse(base))).toEqual([
      'faixas: Cadastre pelo menos uma faixa de distância.',
    ]);
    expect(
      deslocamentoSchema.safeParse({
        ...base,
        faixas: [
          { ateKm: 10, valorCentavos: 1 },
          { ateKm: 30, valorCentavos: 2 },
        ],
      }).success,
    ).toBe(true);
    expect(
      deslocamentoSchema.safeParse({
        ...base,
        modelo: 'por_km',
        kmGratis: 20,
        valorKmCentavos: 300,
      }).success,
    ).toBe(true);
  });
});

describe('usuário vendedor', () => {
  it('novo vendedor', () => {
    const r = novoVendedorSchema.parse({
      nome: 'Ana',
      email: ' Ana@Exemplo.com ',
      whatsapp: '(34) 99135-5450',
      limiteDescontoBp: 500,
    });
    expect(r.email).toBe('ana@exemplo.com');
    expect(
      novoVendedorSchema.safeParse({
        nome: 'Ana',
        email: 'ana@x.com',
        whatsapp: '(34) 3213-5450',
        limiteDescontoBp: 0,
      }).success,
    ).toBe(false);
  });

  it('limite de desconto entre 0 e 100%', () => {
    expect(limiteDescontoSchema.safeParse({ limiteDescontoBp: 10000 }).success).toBe(true);
    expect(limiteDescontoSchema.safeParse({ limiteDescontoBp: 10001 }).success).toBe(false);
  });
});
