import { z } from 'zod';
import { compararDatas, somarDias } from '../dates';
import { celularBRParaE164 } from '../phone';
import { centavos, dataCivil, idSchema, inteiro, nomeCurto, textoOpcional } from './comum';

const opcionalId = z.union([z.literal(''), idSchema]);
const opcionalData = z.union([z.literal(''), dataCivil]);

/** Registrar evento (confirmada) ou pré-reservar. */
export const reservaSchema = z.object({
  espacoId: idSchema,
  turnoId: idSchema,
  data: dataCivil,
  tipo: z.enum(['pre_reserva', 'confirmada']),
  clienteNome: nomeCurto('o nome do cliente', 120),
  clienteWhatsapp: z
    .string()
    .trim()
    .refine((v) => v === '' || celularBRParaE164(v) !== null, 'Informe um celular válido com DDD.'),
  tipoEventoId: opcionalId,
  convidados: inteiro('o número de convidados', 1, 100_000).nullable(),
  valorTotalCentavos: centavos('o valor total').nullable(),
  sinalCentavos: centavos('o sinal').nullable(),
  sinalPagoEm: opcionalData,
  observacoes: textoOpcional(1000),
});
export type ReservaEntrada = z.input<typeof reservaSchema>;

export const confirmarSchema = z.object({
  sinalCentavos: centavos('o sinal').nullable(),
  sinalPagoEm: opcionalData,
});
export type ConfirmarEntrada = z.input<typeof confirmarSchema>;

export const cancelarSchema = z.object({ motivo: textoOpcional(300) });

export const estenderSchema = z.object({ horas: inteiro('as horas', 1, 720) });

/** Bloqueio de um dia ou de um período (ex.: férias coletivas). */
export const bloqueioSchema = z
  .object({
    de: dataCivil,
    ate: dataCivil,
    turnoId: opcionalId,
    espacoId: opcionalId,
    motivo: textoOpcional(200),
  })
  .superRefine((b, ctx) => {
    if (compararDatas(b.ate, b.de) < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['ate'],
        message: 'A data final vem antes da inicial.',
      });
    } else if (compararDatas(b.ate, somarDias(b.de, 365)) > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['ate'],
        message: 'Bloqueie no máximo um ano de cada vez.',
      });
    }
  });
export type BloqueioEntrada = z.input<typeof bloqueioSchema>;
