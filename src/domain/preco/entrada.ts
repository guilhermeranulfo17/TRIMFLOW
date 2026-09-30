import { z } from 'zod';

/**
 * Validação estrutural da entrada do motor (formato, limites). As regras de negócio
 * (datas, capacidade, compatibilidade…) ficam no motor, que devolve erros em português.
 */
const id = z.string().trim().min(1).max(64);
const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');
const inteiro = (min: number, max: number) => z.number().int().min(min).max(max);

export const entradaOrcamentoSchema = z.object({
  canal: z.enum(['publico', 'interno']),
  hoje: dataCivil,
  tipoEventoId: id,
  data: dataCivil,
  turnoId: id,
  espacoId: id,
  adultos: inteiro(0, 100_000),
  criancas: z.array(z.object({ faixaIdadeId: id, quantidade: inteiro(0, 100_000) })).max(20),
  pacoteId: id,
  opcionais: z.array(z.object({ opcionalId: id, quantidade: inteiro(0, 100_000) })).max(50),
  horasExtras: inteiro(0, 24),
  distanciaKm: z.number().min(0).max(10_000).optional(),
  itensAvulsos: z
    .array(
      z.object({
        descricao: z.string().trim().min(1).max(120),
        quantidade: inteiro(1, 10_000),
        valorUnitarioCentavos: inteiro(0, 100_000_000),
      }),
    )
    .max(30)
    .optional(),
  desconto: z
    .discriminatedUnion('tipo', [
      z.object({ tipo: z.literal('percentual'), bp: inteiro(0, 10_000) }),
      z.object({ tipo: z.literal('valor'), centavos: inteiro(0, 1_000_000_000) }),
    ])
    .optional(),
  limiteDescontoBp: inteiro(0, 10_000).optional(),
});
