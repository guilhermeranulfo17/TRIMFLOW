import { z } from 'zod';
import { validarFaixasDeslocamento } from '../catalogo/validacoes';
import {
  adicionarProblemas,
  bp,
  centavos,
  dataCivil,
  idSchema,
  inteiro,
  nomeCurto,
  textoOpcional,
} from './comum';

export const FORMAS_PAGAMENTO_SUGERIDAS = [
  'Pix',
  'Cartão de crédito',
  'Cartão de débito',
  'Dinheiro',
  'Transferência bancária',
  'Boleto',
] as const;

export const condicoesSchema = z.object({
  validadeDias: inteiro('a validade da proposta', 1, 365),
  prazoPreReservaHoras: inteiro('o prazo da pré-reserva', 1, 720),
  antecedenciaMinDias: inteiro('a antecedência mínima', 0, 365),
  sinalBp: bp(0, 10_000, 'o sinal'),
  parcelasMax: inteiro('o número de parcelas', 1, 24),
  prazoUltimaParcelaDias: inteiro('o prazo da última parcela', 0, 365),
  formasPagamento: z.array(z.string().trim().min(1).max(40)).max(12),
  condicoesTexto: textoOpcional(2000),
  naoInclusoTexto: textoOpcional(2000),
  cancelamentoTexto: textoOpcional(2000),
  modoExibicaoPreco: z.enum(['exato', 'faixa', 'apos_contato']),
  ajusteIncide: z.enum(['pacote', 'pacote_opcionais']),
});
export type CondicoesEntrada = z.input<typeof condicoesSchema>;

const ajusteSchema = z.object({
  tipo: z.enum(['dia_semana', 'feriado']),
  diaSemana: z.number().int().min(0).max(6).nullable(),
  turnoId: idSchema.nullable(),
  ajusteBp: bp(-9000, 20_000, 'o ajuste'),
});

/** Todos os ajustes de dia da empresa, gravados de uma vez (substitui os anteriores). */
export const ajustesDiaSchema = z
  .object({ ajustes: z.array(ajusteSchema).max(200) })
  .superRefine((v, ctx) => {
    const vistos = new Set<string>();
    v.ajustes.forEach((a, i) => {
      if ((a.tipo === 'dia_semana') !== (a.diaSemana !== null)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ajustes', i, 'diaSemana'],
          message: 'Dia da semana inválido.',
        });
      }
      const chave = `${a.tipo}:${a.diaSemana ?? ''}:${a.turnoId ?? ''}`;
      if (vistos.has(chave)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ajustes', i],
          message: 'Ajuste repetido para o mesmo dia e turno.',
        });
      }
      vistos.add(chave);
    });
  });
export type AjustesDiaEntrada = z.input<typeof ajustesDiaSchema>;

export const feriadosSchema = z
  .object({
    feriados: z.array(z.object({ data: dataCivil, nome: nomeCurto('o nome do feriado') })).max(100),
  })
  .superRefine((v, ctx) => {
    const datas = new Set<string>();
    v.feriados.forEach((f, i) => {
      if (datas.has(f.data)) {
        ctx.addIssue({ code: 'custom', path: ['feriados', i, 'data'], message: 'Data repetida.' });
      }
      datas.add(f.data);
    });
  });
export type FeriadosEntrada = z.input<typeof feriadosSchema>;

export const deslocamentoSchema = z
  .object({
    modelo: z.enum(['nenhum', 'por_km', 'por_faixa']),
    kmGratis: inteiro('os km grátis', 0, 10_000),
    valorKmCentavos: centavos('o valor por km'),
    faixas: z
      .array(
        z.object({
          ateKm: inteiro('a distância da faixa', 1, 10_000),
          valorCentavos: centavos('o valor da faixa'),
        }),
      )
      .max(30),
  })
  .superRefine((d, ctx) => {
    if (d.modelo === 'por_faixa' && d.faixas.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['faixas'],
        message: 'Cadastre pelo menos uma faixa de distância.',
      });
    }
    adicionarProblemas(ctx, validarFaixasDeslocamento(d.faixas));
  });
export type DeslocamentoEntrada = z.input<typeof deslocamentoSchema>;

/** Configuração da agenda (Etapa 3). */
export const agendaRegrasSchema = z.object({
  intervaloEntreEventosMin: inteiro('o intervalo entre eventos', 0, 720),
});
export type AgendaRegrasEntrada = z.input<typeof agendaRegrasSchema>;
