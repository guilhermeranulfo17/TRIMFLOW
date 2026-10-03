/**
 * Schema Drizzle — espelho TIPADO das migrations em /supabase/migrations.
 * A fonte da verdade é o SQL (inclui RLS, funções e triggers). Ao mudar uma migration,
 * atualize este arquivo no mesmo commit.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  index,
  unique,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';

export const segmentoEmpresa = pgEnum('segmento_empresa', ['infantil', 'eventos', 'domicilio']);
export const planoEmpresa = pgEnum('plano_empresa', [
  'trial',
  'ativo',
  'suspenso',
  'inadimplente',
  'cancelado',
]);
export const perfilUsuario = pgEnum('perfil_usuario', ['dono', 'vendedor']);

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow();

export const empresas = pgTable('empresas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  slug: text('slug').notNull().unique(),
  segmento: segmentoEmpresa('segmento').notNull(),
  whatsappE164: text('whatsapp_e164'),
  email: text('email'),
  cidade: text('cidade'),
  uf: char('uf', { length: 2 }),
  fuso: text('fuso').notNull().default('America/Sao_Paulo'),
  plano: planoEmpresa('plano').notNull().default('trial'),
  trialAte: timestamp('trial_ate', { withTimezone: true }),
  /** Caminho no bucket midia: {empresa_id}/logo/{uuid}.webp */
  logoPath: text('logo_path'),
  /** Caminho no bucket midia: {empresa_id}/capa/{uuid}.webp */
  capaPath: text('capa_path'),
  corMarca: text('cor_marca').notNull().default('#7C5CD6'),
  sobre: text('sobre'),
  razaoSocial: text('razao_social'),
  /** só dígitos (14) */
  cnpj: text('cnpj'),
  endereco: text('endereco'),
  rodapeOrkestra: boolean('rodape_orkestra').notNull().default(true),
  /** Etapa 8: passo atual do onboarding (1 a 5) e marcos do checklist. */
  onboardingPasso: smallint('onboarding_passo').notNull().default(1),
  onboardingIniciadoEm: timestamp('onboarding_iniciado_em', { withTimezone: true }),
  onboardingConcluidoEm: timestamp('onboarding_concluido_em', { withTimezone: true }),
  linkNaBioEm: timestamp('link_na_bio_em', { withTimezone: true }),
  linkTestadoEm: timestamp('link_testado_em', { withTimezone: true }),
  /** Etapa 9A: suspensão manual pelo /interno e conta de cortesia (ativa sem assinatura). */
  suspensaManualEm: timestamp('suspensa_manual_em', { withTimezone: true }),
  motivoSuspensao: text('motivo_suspensao'),
  isenta: boolean('isenta').notNull().default(false),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

/** Slugs já usados: /b/{slug antigo} redireciona para o atual até expiraEm (Etapa 2). */
export const slugsAntigos = pgTable('slugs_antigos', {
  slug: text('slug').primaryKey(),
  empresaId: uuid('empresa_id')
    .notNull()
    .references(() => empresas.id, { onDelete: 'cascade' }),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  criadoEm: criadoEm(),
});

export const usuarios = pgTable(
  'usuarios',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'restrict' }),
    nome: text('nome').notNull(),
    email: text('email').notNull(),
    whatsappE164: text('whatsapp_e164'),
    perfil: perfilUsuario('perfil').notNull().default('vendedor'),
    /** numeric(5,2) chega como string para não perder precisão. */
    limiteDescontoPct: numeric('limite_desconto_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    ativo: boolean('ativo').notNull().default(true),
    checklistDispensadoEm: timestamp('checklist_dispensado_em', { withTimezone: true }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index('usuarios_empresa_id_idx').on(t.empresaId), unique().on(t.id, t.empresaId)],
);

export const auditoria = pgTable(
  'auditoria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    acao: text('acao').notNull(),
    entidade: text('entidade').notNull(),
    entidadeId: uuid('entidade_id'),
    dados: jsonb('dados')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    criadoEm: criadoEm(),
  },
  (t) => [index('auditoria_empresa_criado_idx').on(t.empresaId, t.criadoEm.desc())],
);

export type Empresa = typeof empresas.$inferSelect;
export type Usuario = typeof usuarios.$inferSelect;
export type RegistroAuditoria = typeof auditoria.$inferSelect;
export type NovoRegistroAuditoria = typeof auditoria.$inferInsert;
export type Perfil = (typeof perfilUsuario.enumValues)[number];
export type Segmento = (typeof segmentoEmpresa.enumValues)[number];

// Catálogo e regras comerciais (Etapa 1).
export * from './schema-catalogo';
export * from './schema-agenda';
export * from './schema-leads';
export * from './schema-avisos';
export * from './schema-cobranca';
