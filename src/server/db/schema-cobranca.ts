/**
 * Espelho Drizzle da cobrança (Etapa 9A).
 * Fonte da verdade: supabase/migrations (20261009000002). Mantenha em sincronia.
 * O painel só LÊ (dono, via RLS). Escrita: servidor (server/db/admin) e funções SQL.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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

export type Ciclo = 'mensal' | 'anual';
export type StatusAssinatura = 'pendente' | 'ativa' | 'cancelada';
export type StatusCobranca =
  'pendente' | 'vencida' | 'confirmada' | 'recebida' | 'estornada' | 'cancelada';

export const planos = pgTable('planos', {
  codigo: text('codigo').primaryKey(),
  nome: text('nome').notNull(),
  precoMensalCentavos: integer('preco_mensal_centavos').notNull(),
  precoAnualCentavos: integer('preco_anual_centavos').notNull(),
  maxUsuarios: integer('max_usuarios').notNull(),
  /** null = ilimitado */
  maxEspacos: integer('max_espacos'),
  whatsappAvisos: boolean('whatsapp_avisos').notNull().default(false),
  followUp: boolean('follow_up').notNull().default(false),
  numerosCompleto: boolean('numeros_completo').notNull().default(false),
  /** contratos enviados por mês (Etapa 10); null = sem limite */
  contratosMes: integer('contratos_mes'),
  ordem: smallint('ordem').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
});

export const cupons = pgTable('cupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: text('codigo').notNull(),
  planoCodigo: text('plano_codigo')
    .notNull()
    .references(() => planos.codigo),
  ciclo: text('ciclo').$type<Ciclo>().notNull().default('mensal'),
  descontoCentavos: integer('desconto_centavos').notNull(),
  duracaoMeses: smallint('duracao_meses').notNull(),
  maxUsos: integer('max_usos'),
  usos: integer('usos').notNull().default(0),
  validoAte: instante('valido_ate'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: instante('criado_em').notNull().defaultNow(),
});

export const cuponsUsos = pgTable(
  'cupons_usos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cupomId: uuid('cupom_id')
      .notNull()
      .references(() => cupons.id),
    empresaId: empresaId(),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [unique().on(t.cupomId, t.empresaId)],
);

export const empresasCobranca = pgTable('empresas_cobranca', {
  empresaId: uuid('empresa_id')
    .primaryKey()
    .references(() => empresas.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  /** CPF (11) ou CNPJ (14), só dígitos */
  documento: text('documento').notNull(),
  email: text('email').notNull(),
  asaasClienteId: text('asaas_cliente_id').unique(),
  atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
});

export const assinaturas = pgTable(
  'assinaturas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    asaasAssinaturaId: text('asaas_assinatura_id').unique(),
    planoCodigo: text('plano_codigo')
      .notNull()
      .references(() => planos.codigo),
    ciclo: text('ciclo').$type<Ciclo>().notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    cupomId: uuid('cupom_id').references(() => cupons.id),
    cupomCodigo: text('cupom_codigo'),
    /** yyyy-MM-dd */
    cupomAte: date('cupom_ate'),
    status: text('status').$type<StatusAssinatura>().notNull().default('pendente'),
    pagoAte: date('pago_ate'),
    atrasadaDesde: date('atrasada_desde'),
    criadaEm: instante('criada_em').notNull().defaultNow(),
    canceladaEm: instante('cancelada_em'),
    cancelamentoMotivo: text('cancelamento_motivo'),
    cancelamentoTexto: text('cancelamento_texto'),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [unique().on(t.id, t.empresaId)],
);

export const cobrancas = pgTable(
  'cobrancas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    assinaturaId: uuid('assinatura_id'),
    asaasCobrancaId: text('asaas_cobranca_id').notNull().unique(),
    tipo: text('tipo').$type<'assinatura' | 'implantacao'>().notNull().default('assinatura'),
    valorCentavos: integer('valor_centavos').notNull(),
    vencimento: date('vencimento').notNull(),
    status: text('status').$type<StatusCobranca>().notNull().default('pendente'),
    forma: text('forma'),
    linkFatura: text('link_fatura'),
    pagoEm: instante('pago_em'),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.assinaturaId, t.empresaId],
      foreignColumns: [assinaturas.id, assinaturas.empresaId],
    }).onDelete('cascade'),
  ],
);

export const cobrancaEventos = pgTable('cobranca_eventos', {
  id: uuid('id').primaryKey().defaultRandom(),
  asaasEventoId: text('asaas_evento_id').notNull().unique(),
  tipo: text('tipo').notNull(),
  empresaId: uuid('empresa_id').references(() => empresas.id, { onDelete: 'set null' }),
  payload: jsonb('payload')
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  recebidoEm: instante('recebido_em').notNull().defaultNow(),
  processadoEm: instante('processado_em'),
  ignorado: boolean('ignorado').notNull().default(false),
  resultado: text('resultado'),
});

export const auditoriaInterna = pgTable('auditoria_interna', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminEmail: text('admin_email').notNull(),
  acao: text('acao').notNull(),
  empresaId: uuid('empresa_id').references(() => empresas.id, { onDelete: 'set null' }),
  dados: jsonb('dados')
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  criadoEm: instante('criado_em').notNull().defaultNow(),
});

export const acessosSuporte = pgTable(
  'acessos_suporte',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    concedidoPor: uuid('concedido_por').notNull(),
    concedidoEm: instante('concedido_em').notNull().defaultNow(),
    expiraEm: instante('expira_em').notNull(),
    revogadoEm: instante('revogado_em'),
    revogadoPor: uuid('revogado_por'),
  },
  (t) => [
    foreignKey({
      columns: [t.concedidoPor, t.empresaId],
      foreignColumns: [usuarios.id, usuarios.empresaId],
    }).onDelete('cascade'),
  ],
);

export type PlanoComercial = typeof planos.$inferSelect;
export type Assinatura = typeof assinaturas.$inferSelect;
export type Cobranca = typeof cobrancas.$inferSelect;

/** Etapa 9.6: visitas e cliques da landing por dia (sem nada pessoal). Só publico.landing_contar grava. */
export const landingContagem = pgTable(
  'landing_contagem',
  {
    dia: date('dia', { mode: 'string' }).notNull(),
    evento: text('evento').$type<'visita' | 'clicou_teste'>().notNull(),
    total: integer('total').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.dia, t.evento] })],
);
