import { z } from 'zod';
import {
  validarFaixasIdade,
  validarPrecoPacote,
  validarTurno,
  validarVinculosOpcional,
} from '../catalogo/validacoes';
import {
  adicionarProblemas,
  bp,
  centavos,
  idSchema,
  inteiro,
  nomeCurto,
  textoOpcional,
} from './comum';

// ---------------------------------------------------------------------------
// Espaços, turnos e tipos de evento
// ---------------------------------------------------------------------------

export const espacoSchema = z.object({
  nome: nomeCurto('o nome do espaço'),
  capacidadeMax: inteiro('a capacidade', 1, 100_000),
  noLocalDoCliente: z.boolean(),
  ativo: z.boolean(),
});
export type EspacoEntrada = z.input<typeof espacoSchema>;

export const turnoSchema = z
  .object({
    nome: nomeCurto('o nome do turno', 60),
    horaInicio: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe o horário de início (ex.: 15:00).'),
    duracaoMin: z.number().int().min(0).max(1440, 'Um turno dura no máximo 24 horas.'),
    diasSemana: z.array(z.number().int().min(0).max(6)).max(7),
    ativo: z.boolean(),
  })
  .superRefine((t, ctx) => adicionarProblemas(ctx, validarTurno(t)));
export type TurnoEntrada = z.input<typeof turnoSchema>;

export const tipoEventoSchema = z.object({
  nome: nomeCurto('o nome do tipo de festa'),
  icone: z.union([z.literal(''), z.string().regex(/^[a-z0-9-]{1,50}$/)]),
  ativo: z.boolean(),
});
export type TipoEventoEntrada = z.input<typeof tipoEventoSchema>;

/** Nova ordem de uma lista (ids na ordem desejada). */
export const ordemSchema = z.object({ ids: z.array(idSchema).max(200) });

// ---------------------------------------------------------------------------
// Pacote
// ---------------------------------------------------------------------------

export const dadosPacoteSchema = z.object({
  nome: nomeCurto('o nome do pacote'),
  subtitulo: textoOpcional(160),
  descricao: textoOpcional(2000),
  destaque: z.boolean(),
  ativo: z.boolean(),
});
export type DadosPacoteEntrada = z.input<typeof dadosPacoteSchema>;

export const faixaPrecoSchema = z.object({
  ateConvidados: inteiro('o limite de convidados da faixa', 1, 100_000),
  valorCentavos: centavos('o valor da faixa'),
});

export const precoPacoteSchema = z
  .object({
    modeloPreco: z.enum(['por_pessoa', 'por_faixa'], { error: 'Escolha como o pacote é cobrado.' }),
    precoPessoaCentavos: centavos('o preço por convidado').nullable(),
    valorExcedenteCentavos: centavos('o valor do convidado excedente').nullable(),
    faixas: z.array(faixaPrecoSchema).max(30),
    minConvidados: inteiro('o mínimo de convidados', 1, 100_000),
    maxConvidados: inteiro('o máximo de convidados', 1, 100_000).nullable(),
    duracaoInclusaMin: z.number().int().min(0).max(1440, 'A duração pode ser no máximo 24 horas.'),
    valorHoraExtraCentavos: centavos('o valor da hora extra'),
  })
  .superRefine((p, ctx) => adicionarProblemas(ctx, validarPrecoPacote(p)));
export type PrecoPacoteEntrada = z.input<typeof precoPacoteSchema>;

export const cardapioSchema = z.object({
  secoes: z
    .array(
      z.object({
        nome: nomeCurto('o nome da seção'),
        itens: z
          .array(z.string().trim().min(1).max(120, 'Item muito longo.'))
          .min(1, 'Coloque pelo menos um item na seção.')
          .max(60),
      }),
    )
    .max(20),
});
export type CardapioEntrada = z.input<typeof cardapioSchema>;

export const faixaIdadeSchema = z.object({
  rotulo: nomeCurto('o nome da faixa', 60),
  idadeMin: inteiro('a idade mínima', 0, 120),
  idadeMax: inteiro('a idade máxima', 0, 120).nullable(),
  fatorBp: bp(0, 10_000, 'quanto a criança paga'),
});

export const faixasIdadeSchema = z
  .object({ faixas: z.array(faixaIdadeSchema).max(10) })
  .superRefine((v, ctx) => adicionarProblemas(ctx, validarFaixasIdade(v.faixas)));
export type FaixasIdadeEntrada = z.input<typeof faixasIdadeSchema>;

export const idsSchema = z.object({ ids: z.array(idSchema).max(200) });

// ---------------------------------------------------------------------------
// Opcional
// ---------------------------------------------------------------------------

export const dadosOpcionalSchema = z
  .object({
    nome: nomeCurto('o nome do opcional'),
    descricao: textoOpcional(1000),
    cobranca: z.enum(['por_pessoa', 'fixo', 'por_unidade', 'por_hora'], {
      error: 'Escolha como o opcional é cobrado.',
    }),
    precoCentavos: centavos('o preço'),
    qtdMin: inteiro('a quantidade mínima', 0, 100_000),
    qtdMax: inteiro('a quantidade máxima', 0, 100_000).nullable(),
    ativo: z.boolean(),
  })
  .superRefine((o, ctx) => {
    if (o.qtdMax !== null && o.qtdMax < o.qtdMin) {
      ctx.addIssue({
        code: 'custom',
        path: ['qtdMax'],
        message: 'A quantidade máxima é menor que a mínima.',
      });
    }
  });
export type DadosOpcionalEntrada = z.input<typeof dadosOpcionalSchema>;

export const vinculosOpcionalSchema = z
  .object({
    pacotes: z
      .array(z.object({ pacoteId: idSchema, relacao: z.enum(['compativel', 'incluso']) }))
      .max(200),
    tipoEventoIds: z.array(idSchema).max(200),
  })
  .superRefine((v, ctx) => {
    const compativeis = v.pacotes.filter((p) => p.relacao === 'compativel').map((p) => p.pacoteId);
    const inclusos = v.pacotes.filter((p) => p.relacao === 'incluso').map((p) => p.pacoteId);
    adicionarProblemas(ctx, validarVinculosOpcional({ compativeis, inclusos }));
  });
export type VinculosOpcionalEntrada = z.input<typeof vinculosOpcionalSchema>;
