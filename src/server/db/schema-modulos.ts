/**
 * Espelho Drizzle dos módulos adicionais (Nossas soluções) e do OrkMargem.
 * Fonte da verdade: supabase/migrations (20261102000002_modulos, 20261102000003_orkmargem).
 * O painel só LÊ (RLS). Escrita: servidor (conexão administrativa) e funções SQL.
 */
import {
  boolean,
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

const instante = (nome: string) => timestamp(nome, { withTimezone: true });
const empresaId = () =>
  uuid('empresa_id')
    .notNull()
    .references(() => empresas.id, { onDelete: 'cascade' });

export type CobrancaModuloBanco = 'mensal' | 'por_evento';
export type StatusModuloAssinatura = 'pendente' | 'ativa' | 'cancelada';
export type StatusModuloCompra = 'pendente' | 'paga' | 'cancelada' | 'estornada';

export const modulos = pgTable('modulos', {
  codigo: text('codigo').primaryKey(),
  nome: text('nome').notNull(),
  cobranca: text('cobranca').$type<CobrancaModuloBanco>().notNull(),
  precoCentavos: integer('preco_centavos').notNull(),
  vendaLiberada: boolean('venda_liberada').notNull().default(false),
  carenciaDias: smallint('carencia_dias').notNull().default(0),
  acessoEventoDias: smallint('acesso_evento_dias'),
  ordem: smallint('ordem').notNull().default(0),
  atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
});

export const moduloAssinaturas = pgTable(
  'modulo_assinaturas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    modulo: text('modulo')
      .notNull()
      .references(() => modulos.codigo),
    asaasAssinaturaId: text('asaas_assinatura_id').unique(),
    status: text('status').$type<StatusModuloAssinatura>().notNull().default('pendente'),
    valorCentavos: integer('valor_centavos').notNull(),
    pagoAte: date('pago_ate', { mode: 'string' }),
    atrasadaDesde: date('atrasada_desde', { mode: 'string' }),
    criadaPor: uuid('criada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: instante('criada_em').notNull().defaultNow(),
    canceladaEm: instante('cancelada_em'),
    canceladaPor: uuid('cancelada_por').references(() => usuarios.id, { onDelete: 'set null' }),
  },
  (t) => [unique().on(t.id, t.empresaId)],
);

export const moduloCompras = pgTable(
  'modulo_compras',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    modulo: text('modulo')
      .notNull()
      .references(() => modulos.codigo),
    reservaId: uuid('reserva_id').notNull(),
    status: text('status').$type<StatusModuloCompra>().notNull().default('pendente'),
    valorCentavos: integer('valor_centavos').notNull(),
    acessoAte: date('acesso_ate', { mode: 'string' }),
    criadaPor: uuid('criada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: instante('criada_em').notNull().defaultNow(),
  },
  (t) => [unique().on(t.id, t.empresaId)],
);

export const moduloCobrancas = pgTable(
  'modulo_cobrancas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    moduloAssinaturaId: uuid('modulo_assinatura_id'),
    moduloCompraId: uuid('modulo_compra_id'),
    asaasCobrancaId: text('asaas_cobranca_id').notNull().unique(),
    valorCentavos: integer('valor_centavos').notNull(),
    vencimento: date('vencimento', { mode: 'string' }).notNull(),
    status: text('status').notNull(),
    forma: text('forma'),
    linkFatura: text('link_fatura'),
    pagoEm: instante('pago_em'),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.moduloAssinaturaId, t.empresaId],
      foreignColumns: [moduloAssinaturas.id, moduloAssinaturas.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.moduloCompraId, t.empresaId],
      foreignColumns: [moduloCompras.id, moduloCompras.empresaId],
    }).onDelete('cascade'),
  ],
);
