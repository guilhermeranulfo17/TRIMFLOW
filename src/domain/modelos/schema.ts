import { z } from 'zod';
import { SEGMENTOS } from '../segmento';

/**
 * Formato de um modelo de segmento: catálogo completo de exemplo, com referências internas
 * por CHAVE (ex.: pacote "super"), não por id. Validado com Zod, inclusive a integridade.
 */

const chave = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Chave inválida');
const centavos = z.number().int().min(0);
const bp = z.number().int();
const diaSemana = z.number().int().min(0).max(6);

export const regrasModeloSchema = z.object({
  validadeDias: z.number().int().min(1).max(365),
  prazoPreReservaHoras: z.number().int().min(1).max(720),
  antecedenciaMinDias: z.number().int().min(0).max(365),
  sinalBp: bp.min(0).max(10_000),
  parcelasMax: z.number().int().min(1).max(24),
  prazoUltimaParcelaDias: z.number().int().min(0).max(365),
  formasPagamento: z.array(z.string().min(1)),
  condicoesTexto: z.string(),
  naoInclusoTexto: z.string(),
  cancelamentoTexto: z.string(),
  modoExibicaoPreco: z.enum(['exato', 'faixa', 'apos_contato']),
  ajusteIncide: z.enum(['pacote', 'pacote_opcionais']),
  deslocamentoModelo: z.enum(['nenhum', 'por_km', 'por_faixa']),
  deslocamentoKmGratis: z.number().int().min(0),
  deslocamentoValorKmCentavos: centavos,
});

export const modeloSchema = z
  .object({
    segmento: z.enum(SEGMENTOS),
    nome: z.string().min(1),
    tiposEvento: z
      .array(z.object({ chave, nome: z.string().min(1), icone: z.string().regex(/^[a-z0-9-]+$/) }))
      .min(1),
    espacos: z
      .array(
        z.object({
          chave,
          nome: z.string().min(1),
          capacidadeMax: z.number().int().min(1),
          noLocalDoCliente: z.boolean(),
        }),
      )
      .min(1),
    turnos: z
      .array(
        z.object({
          chave,
          nome: z.string().min(1),
          horaInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          duracaoMin: z.number().int().min(1).max(1440),
          diasSemana: z.array(diaSemana).min(1).max(7),
        }),
      )
      .min(1),
    ajustesDia: z.array(
      z.object({ diaSemana, turno: chave.optional(), ajusteBp: bp.min(-9000).max(20_000) }),
    ),
    faixasIdade: z.array(
      z.object({
        rotulo: z.string().min(1),
        idadeMin: z.number().int().min(0).max(120),
        idadeMax: z.number().int().min(0).max(120).nullable(),
        fatorBp: bp.min(0).max(10_000),
      }),
    ),
    pacotes: z
      .array(
        z.object({
          chave,
          nome: z.string().min(1),
          subtitulo: z.string(),
          descricao: z.string(),
          destaque: z.boolean(),
          modeloPreco: z.enum(['por_pessoa', 'por_faixa']),
          precoPessoaCentavos: centavos.nullable(),
          valorExcedenteCentavos: centavos.nullable(),
          faixasPreco: z.array(
            z.object({ ateConvidados: z.number().int().min(1), valorCentavos: centavos }),
          ),
          minConvidados: z.number().int().min(1),
          maxConvidados: z.number().int().min(1).nullable(),
          duracaoInclusaMin: z.number().int().min(0).max(1440),
          valorHoraExtraCentavos: centavos,
          tiposEvento: z.array(chave),
          secoes: z.array(
            z.object({ nome: z.string().min(1), itens: z.array(z.string().min(1)).min(1) }),
          ),
        }),
      )
      .length(3),
    opcionais: z.array(
      z.object({
        chave,
        nome: z.string().min(1),
        descricao: z.string(),
        cobranca: z.enum(['por_pessoa', 'fixo', 'por_unidade', 'por_hora']),
        precoCentavos: centavos,
        qtdMin: z.number().int().min(0),
        qtdMax: z.number().int().min(0).nullable(),
        pacotesCompativeis: z.array(chave),
        pacotesInclusos: z.array(chave),
        tiposEvento: z.array(chave),
      }),
    ),
    faixasDeslocamento: z.array(
      z.object({ ateKm: z.number().int().min(1), valorCentavos: centavos }),
    ),
    regras: regrasModeloSchema,
  })
  .superRefine((m, ctx) => {
    const problema = (mensagem: string) => ctx.addIssue({ code: 'custom', message: mensagem });

    const unicas = (nome: string, chaves: string[]) => {
      if (new Set(chaves).size !== chaves.length) problema(`${nome}: chaves repetidas`);
      return new Set(chaves);
    };
    const tipos = unicas(
      'tiposEvento',
      m.tiposEvento.map((t) => t.chave),
    );
    const turnos = unicas(
      'turnos',
      m.turnos.map((t) => t.chave),
    );
    const pacotes = unicas(
      'pacotes',
      m.pacotes.map((p) => p.chave),
    );
    unicas(
      'espacos',
      m.espacos.map((e) => e.chave),
    );
    unicas(
      'opcionais',
      m.opcionais.map((o) => o.chave),
    );

    const exigir = (conjunto: Set<string>, refs: string[], onde: string) => {
      for (const r of refs)
        if (!conjunto.has(r)) problema(`${onde}: referência inexistente "${r}"`);
    };

    for (const a of m.ajustesDia) if (a.turno) exigir(turnos, [a.turno], 'ajustesDia');
    const combinacoes = m.ajustesDia.map((a) => `${a.diaSemana}:${a.turno ?? ''}`);
    if (new Set(combinacoes).size !== combinacoes.length) problema('ajustesDia: ajuste repetido');

    for (const p of m.pacotes) {
      exigir(tipos, p.tiposEvento, `pacote ${p.chave}`);
      if (p.modeloPreco === 'por_pessoa' && p.precoPessoaCentavos === null) {
        problema(`pacote ${p.chave}: preço por pessoa obrigatório`);
      }
      if (
        p.modeloPreco === 'por_faixa' &&
        (p.valorExcedenteCentavos === null || p.faixasPreco.length === 0)
      ) {
        problema(`pacote ${p.chave}: faixas e excedente obrigatórios`);
      }
      if (p.maxConvidados !== null && p.maxConvidados < p.minConvidados) {
        problema(`pacote ${p.chave}: máximo menor que o mínimo`);
      }
    }
    for (const o of m.opcionais) {
      exigir(pacotes, [...o.pacotesCompativeis, ...o.pacotesInclusos], `opcional ${o.chave}`);
      exigir(tipos, o.tiposEvento, `opcional ${o.chave}`);
    }

    const faixas = [...m.faixasIdade].sort((a, b) => a.idadeMin - b.idadeMin);
    faixas.forEach((f, i) => {
      const proxima = faixas[i + 1];
      if (proxima && (f.idadeMax === null || f.idadeMax >= proxima.idadeMin)) {
        problema('faixasIdade: faixas sobrepostas');
      }
    });

    if (m.regras.deslocamentoModelo !== 'nenhum' && !m.espacos.some((e) => e.noLocalDoCliente)) {
      problema('regras: deslocamento exige um espaço no local do cliente');
    }
  });

export type Modelo = z.infer<typeof modeloSchema>;
export type RegrasModelo = z.infer<typeof regrasModeloSchema>;

/** Regras comerciais de exemplo, iguais nos três segmentos (o dono ajusta depois). */
export const REGRAS_EXEMPLO: RegrasModelo = {
  validadeDias: 15,
  prazoPreReservaHoras: 48,
  antecedenciaMinDias: 7,
  sinalBp: 3000,
  parcelasMax: 3,
  prazoUltimaParcelaDias: 7,
  formasPagamento: ['Pix', 'Cartão de crédito'],
  condicoesTexto:
    'Sinal de 30% para reservar a data. Saldo parcelado, com a última parcela até 7 dias antes da festa.',
  naoInclusoTexto: 'Bebidas alcoólicas, decoração personalizada e itens que não estão no pacote.',
  cancelamentoTexto:
    'Cancelamento com mais de 30 dias de antecedência: devolução de 50% do sinal. Com menos de 30 dias, o sinal não é devolvido.',
  modoExibicaoPreco: 'exato',
  ajusteIncide: 'pacote',
  deslocamentoModelo: 'nenhum',
  deslocamentoKmGratis: 0,
  deslocamentoValorKmCentavos: 0,
};

export const FAIXAS_IDADE_EXEMPLO: Modelo['faixasIdade'] = [
  { rotulo: '0 a 5 anos', idadeMin: 0, idadeMax: 5, fatorBp: 0 },
  { rotulo: '6 a 10 anos', idadeMin: 6, idadeMax: 10, fatorBp: 5000 },
  { rotulo: '11 anos ou mais', idadeMin: 11, idadeMax: null, fatorBp: 10000 },
];

export const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];
