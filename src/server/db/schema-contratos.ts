/**
 * Espelho Drizzle dos contratos (Etapa 10).
 * Fonte da verdade: supabase/migrations (20261015000002). Mantenha em sincronia.
 * O painel só LÊ (dono, via RLS). Escrita: só pelas funções SQL (emitir_contrato,
 * publico.contrato_*…). contrato_codigos não é lida por ninguém do painel.
 */
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { empresas, segmentoEmpresa, usuarios } from './schema';

const instante = (nome: string) => timestamp(nome, { withTimezone: true });
const empresaId = () =>
  uuid('empresa_id')
    .notNull()
    .references(() => empresas.id, { onDelete: 'cascade' });

export const statusContrato = pgEnum('status_contrato', [
  'rascunho',
  'enviado',
  'assinado_cliente',
  'concluido',
  'recusado',
  'expirado',
  'cancelado',
]);
export const parteContrato = pgEnum('parte_contrato', ['buffet', 'cliente']);
export const metodoAssinatura = pgEnum('metodo_assinatura', ['aceite', 'aceite_com_codigo']);

export const contratoModelos = pgTable(
  'contrato_modelos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    titulo: text('titulo').notNull(),
    segmento: segmentoEmpresa('segmento').notNull(),
    texto: text('texto').notNull(),
    opcoes: jsonb('opcoes').notNull().default({}),
    origem: text('origem'),
    versao: integer('versao').notNull().default(1),
    ativo: boolean('ativo').notNull().default(true),
    criadoPor: uuid('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.id, t.empresaId),
    index('contrato_modelos_empresa_idx').on(t.empresaId, t.ativo),
  ],
);

export const contratos = pgTable(
  'contratos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    ano: smallint('ano').notNull(),
    numero: integer('numero').notNull(),
    versao: integer('versao').notNull().default(1),
    substituiContratoId: uuid('substitui_contrato_id'),
    leadId: uuid('lead_id').notNull(),
    orcamentoId: uuid('orcamento_id'),
    reservaId: uuid('reserva_id'),
    modeloId: uuid('modelo_id'),
    modeloOrigem: text('modelo_origem'),
    titulo: text('titulo').notNull(),
    status: statusContrato('status').notNull().default('rascunho'),
    texto: text('texto').notNull(),
    hash: text('hash').notNull(),
    valores: jsonb('valores').notNull().default({}),
    variaveis: jsonb('variaveis').notNull().default({}),
    exigeCodigo: boolean('exige_codigo').notNull().default(false),
    emailCliente: text('email_cliente'),
    tokenHash: text('token_hash'),
    expiraEm: instante('expira_em'),
    enviadoEm: instante('enviado_em'),
    enviadoPor: uuid('enviado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    visualizadoEm: instante('visualizado_em'),
    concluidoEm: instante('concluido_em'),
    recusadoEm: instante('recusado_em'),
    recusaMotivo: text('recusa_motivo'),
    canceladoEm: instante('cancelado_em'),
    canceladoPor: uuid('cancelado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    cancelamentoMotivo: text('cancelamento_motivo'),
    pdfGeradoEm: instante('pdf_gerado_em'),
    anonimizadoEm: instante('anonimizado_em'),
    ehTeste: boolean('eh_teste').notNull().default(false),
    criadoPor: uuid('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.id, t.empresaId),
    unique().on(t.empresaId, t.ano, t.numero),
    unique().on(t.tokenHash),
    foreignKey({
      columns: [t.substituiContratoId, t.empresaId],
      foreignColumns: [t.id, t.empresaId],
    }),
    index('contratos_lead_idx').on(t.leadId, t.empresaId),
    index('contratos_empresa_status_idx').on(t.empresaId, t.status, t.enviadoEm),
  ],
);

export const contratoAssinaturas = pgTable(
  'contrato_assinaturas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    contratoId: uuid('contrato_id').notNull(),
    parte: parteContrato('parte').notNull(),
    nome: text('nome').notNull(),
    representa: text('representa'),
    documentoCifrado: text('documento_cifrado'),
    documentoMascarado: text('documento_mascarado'),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    assinadoEm: instante('assinado_em').notNull().defaultNow(),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    hashDocumento: text('hash_documento').notNull(),
    metodo: metodoAssinatura('metodo').notNull(),
    codigoVerificado: boolean('codigo_verificado').notNull().default(false),
    anonimizadoEm: instante('anonimizado_em'),
  },
  (t) => [
    unique().on(t.contratoId, t.parte),
    foreignKey({
      columns: [t.contratoId, t.empresaId],
      foreignColumns: [contratos.id, contratos.empresaId],
    }).onDelete('cascade'),
  ],
);

export const contratoCodigos = pgTable('contrato_codigos', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: empresaId(),
  contratoId: uuid('contrato_id').notNull(),
  codigoHash: text('codigo_hash').notNull(),
  expiraEm: instante('expira_em').notNull(),
  tentativas: smallint('tentativas').notNull().default(0),
  usadoEm: instante('usado_em'),
  criadoEm: instante('criado_em').notNull().defaultNow(),
});

export type Contrato = typeof contratos.$inferSelect;
export type ContratoModelo = typeof contratoModelos.$inferSelect;
export type ContratoAssinatura = typeof contratoAssinaturas.$inferSelect;
