/**
 * Espelho Drizzle do financeiro da festa (Etapa 11).
 * Fonte da verdade: supabase/migrations/20261017000001_financeiro.sql. Mantenha em sincronia.
 * O painel só LÊ (dono, via RLS). Escrita: salvar_plano_pagamento, registrar_recebimento e
 * estornar_recebimento.
 */
import {
  date,
  foreignKey,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { empresas, usuarios } from './schema';
import { reservas } from './schema-agenda';

const instante = (nome: string) => timestamp(nome, { withTimezone: true });

export const reservaParcelas = pgTable(
  'reserva_parcelas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    reservaId: uuid('reserva_id').notNull(),
    numero: smallint('numero').notNull(),
    descricao: text('descricao').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    venceEm: date('vence_em', { mode: 'string' }).notNull(),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.reservaId, t.numero),
    foreignKey({
      columns: [t.reservaId, t.empresaId],
      foreignColumns: [reservas.id, reservas.empresaId],
    }).onDelete('cascade'),
  ],
);

export const recebimentos = pgTable(
  'recebimentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    reservaId: uuid('reserva_id').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    recebidoEm: date('recebido_em', { mode: 'string' }).notNull(),
    forma: text('forma').notNull(),
    observacao: text('observacao'),
    criadoPor: uuid('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    estornadoEm: instante('estornado_em'),
    estornadoPor: uuid('estornado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    estornoMotivo: text('estorno_motivo'),
  },
  (t) => [
    foreignKey({
      columns: [t.reservaId, t.empresaId],
      foreignColumns: [reservas.id, reservas.empresaId],
    }).onDelete('cascade'),
  ],
);
