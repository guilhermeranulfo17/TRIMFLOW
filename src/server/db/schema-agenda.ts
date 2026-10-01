/**
 * Espelho Drizzle da agenda (Etapa 3).
 * Fonte da verdade: supabase/migrations/20261003000001..4. Mantenha em sincronia.
 * Escrita SÓ pelas funções SQL (criar_reserva, criar_bloqueio…): o painel só lê estas tabelas.
 */
import {
  date,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { empresas, usuarios } from './schema';
import { espacos, tiposEvento, turnos } from './schema-catalogo';

export const tipoReserva = pgEnum('tipo_reserva', ['pre_reserva', 'confirmada']);
export const statusReserva = pgEnum('status_reserva', [
  'ativa',
  'vencida',
  'cancelada',
  'realizada',
]);
export const origemReserva = pgEnum('origem_reserva', ['manual', 'link_publico', 'orcamento']);

const instante = (nome: string) => timestamp(nome, { withTimezone: true });

export const bloqueios = pgTable(
  'bloqueios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    data: date('data', { mode: 'string' }).notNull(),
    /** null = dia inteiro */
    turnoId: uuid('turno_id'),
    /** null = todos os espaços */
    espacoId: uuid('espaco_id'),
    motivo: text('motivo'),
    criadoPor: uuid('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.turnoId, t.empresaId],
      foreignColumns: [turnos.id, turnos.empresaId],
    }),
    foreignKey({
      columns: [t.espacoId, t.empresaId],
      foreignColumns: [espacos.id, espacos.empresaId],
    }),
    unique().on(t.empresaId, t.data, t.turnoId, t.espacoId).nullsNotDistinct(),
  ],
);

export const reservas = pgTable(
  'reservas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    espacoId: uuid('espaco_id').notNull(),
    turnoId: uuid('turno_id').notNull(),
    data: date('data', { mode: 'string' }).notNull(),
    inicio: instante('inicio').notNull(),
    /** já somado ao intervalo entre eventos */
    fim: instante('fim').notNull(),
    tipo: tipoReserva('tipo').notNull(),
    status: statusReserva('status').notNull().default('ativa'),
    expiraEm: instante('expira_em'),
    origem: origemReserva('origem').notNull().default('manual'),
    clienteNome: text('cliente_nome').notNull(),
    clienteWhatsappE164: text('cliente_whatsapp_e164'),
    tipoEventoId: uuid('tipo_evento_id'),
    convidados: integer('convidados'),
    valorTotalCentavos: integer('valor_total_centavos'),
    sinalCentavos: integer('sinal_centavos'),
    sinalPagoEm: date('sinal_pago_em', { mode: 'string' }),
    observacoes: text('observacoes'),
    leadId: uuid('lead_id'),
    orcamentoId: uuid('orcamento_id'),
    criadoPor: uuid('criado_por'),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    confirmadaPor: uuid('confirmada_por'),
    confirmadaEm: instante('confirmada_em'),
    canceladaPor: uuid('cancelada_por'),
    canceladaEm: instante('cancelada_em'),
    motivoCancelamento: text('motivo_cancelamento'),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.espacoId, t.empresaId],
      foreignColumns: [espacos.id, espacos.empresaId],
    }),
    foreignKey({
      columns: [t.turnoId, t.empresaId],
      foreignColumns: [turnos.id, turnos.empresaId],
    }),
    foreignKey({
      columns: [t.tipoEventoId, t.empresaId],
      foreignColumns: [tiposEvento.id, tiposEvento.empresaId],
    }),
  ],
);

export type Reserva = typeof reservas.$inferSelect;
export type Bloqueio = typeof bloqueios.$inferSelect;
