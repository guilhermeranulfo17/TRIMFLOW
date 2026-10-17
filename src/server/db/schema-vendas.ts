/**
 * Espelho Drizzle do Vendas Orkestra (Etapa 14): CRM interno da equipe para vender o Orkestra.
 * Fonte da verdade: supabase/migrations/20261020000001_vendas_orkestra.sql. Mantenha em sincronia.
 * Sem empresa_id e sem RLS de usuário: só o /interno lê e escreve, pela conexão administrativa,
 * depois de exigirAdmin().
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const instante = (nome: string) => timestamp(nome, { withTimezone: true });

export const vendasEtapa = pgEnum('vendas_etapa', [
  'novo',
  'abordado',
  'respondeu',
  'interessado',
  'fechando',
  'cliente',
  'perdido',
]);
export const vendasAutor = pgEnum('vendas_autor', ['lead', 'gui', 'conversa']);
export const vendasOrigemMovimento = pgEnum('vendas_origem_movimento', [
  'manual',
  'agente',
  'importacao',
]);
export const vendasStatusSugestao = pgEnum('vendas_status_sugestao', [
  'pendente',
  'aprovada',
  'descartada',
]);
export const vendasTipoConhecimento = pgEnum('vendas_tipo_conhecimento', [
  'produto',
  'preco',
  'objecao',
  'script',
]);
export const vendasAvaliacao = pgEnum('vendas_avaliacao', ['boa', 'ruim']);

export const vendasLeads = pgTable(
  'vendas_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull(),
    buffet: text('buffet'),
    telefoneE164: text('telefone_e164'),
    cidade: text('cidade'),
    origem: text('origem'),
    etapa: vendasEtapa('etapa').notNull().default('novo'),
    resumo: text('resumo'),
    proximoFollowup: date('proximo_followup', { mode: 'string' }),
    tentativas: smallint('tentativas').notNull().default(0),
    naoContatar: boolean('nao_contatar').notNull().default(false),
    naoContatarEm: instante('nao_contatar_em'),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [index('vendas_leads_etapa_idx').on(t.etapa, t.atualizadoEm)],
);

export const vendasSugestoes = pgTable(
  'vendas_sugestoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => vendasLeads.id, { onDelete: 'cascade' }),
    entrada: text('entrada').notNull(),
    saida: jsonb('saida').notNull(),
    mensagemSugerida: text('mensagem_sugerida').notNull(),
    mensagemFinal: text('mensagem_final'),
    editada: boolean('editada').notNull().default(false),
    status: vendasStatusSugestao('status').notNull().default('pendente'),
    promptVersao: text('prompt_versao').notNull(),
    provedor: text('provedor').notNull(),
    modelo: text('modelo').notNull(),
    exemplosUsados: jsonb('exemplos_usados').notNull().default([]),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    decididoEm: instante('decidido_em'),
  },
  (t) => [index('vendas_sugestoes_lead_idx').on(t.leadId, t.criadoEm)],
);

export const vendasMensagens = pgTable(
  'vendas_mensagens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => vendasLeads.id, { onDelete: 'cascade' }),
    autor: vendasAutor('autor').notNull(),
    texto: text('texto').notNull(),
    sugestaoId: uuid('sugestao_id').references(() => vendasSugestoes.id, { onDelete: 'set null' }),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [
    index('vendas_mensagens_lead_idx').on(t.leadId, t.criadoEm),
    index('vendas_mensagens_sugestao_idx').on(t.sugestaoId),
  ],
);

export const vendasMovimentos = pgTable(
  'vendas_movimentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => vendasLeads.id, { onDelete: 'cascade' }),
    de: vendasEtapa('de'),
    para: vendasEtapa('para').notNull(),
    origem: vendasOrigemMovimento('origem').notNull(),
    motivo: text('motivo'),
    sugestaoId: uuid('sugestao_id').references(() => vendasSugestoes.id, { onDelete: 'set null' }),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [
    index('vendas_movimentos_lead_idx').on(t.leadId, t.criadoEm),
    index('vendas_movimentos_sugestao_idx').on(t.sugestaoId),
  ],
);

export const vendasConhecimento = pgTable('vendas_conhecimento', {
  id: uuid('id').primaryKey().defaultRandom(),
  tipo: vendasTipoConhecimento('tipo').notNull(),
  titulo: text('titulo').notNull(),
  conteudo: text('conteudo').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
  criadoEm: instante('criado_em').notNull().defaultNow(),
  atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
});

export const vendasExemplos = pgTable(
  'vendas_exemplos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sugestaoId: uuid('sugestao_id')
      .notNull()
      .unique()
      .references(() => vendasSugestoes.id, { onDelete: 'cascade' }),
    avaliacao: vendasAvaliacao('avaliacao').notNull(),
    motivo: text('motivo').notNull(),
    criadoEm: instante('criado_em').notNull().defaultNow(),
  },
  (t) => [index('vendas_exemplos_avaliacao_idx').on(t.avaliacao, t.criadoEm)],
);
