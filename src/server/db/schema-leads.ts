/**
 * Espelho Drizzle dos leads e orçamentos do link público (Etapa 4).
 * Fonte da verdade: supabase/migrations/20261004000001..4. Mantenha em sincronia.
 * Escrita SÓ pelas funções SQL (schema publico e agenda): o painel só lê estas tabelas.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
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
import { empresas, usuarios } from './schema';
import { espacos, tiposEvento, turnos } from './schema-catalogo';

export const origemLead = pgEnum('origem_lead', [
  'instagram',
  'google',
  'indicacao',
  'whatsapp',
  'link_direto',
  'interno',
  'outro',
]);
export const statusLead = pgEnum('status_lead', [
  'novo',
  'em_andamento',
  'abandonou',
  'pre_reservado',
  'reservado',
  'frio',
  'perdido',
  'cancelado',
  'realizado',
]);
export const temperaturaLead = pgEnum('temperatura_lead', ['frio', 'morno', 'quente']);
export const statusOrcamento = pgEnum('status_orcamento', [
  'em_montagem',
  'enviado',
  'visualizado',
  'substituido',
  'aceito',
  'expirado',
]);
export const canalOrcamento = pgEnum('canal_orcamento', ['publico', 'interno']);
export const tipoItemOrcamento = pgEnum('tipo_item_orcamento', [
  'pacote',
  'opcional',
  'hora_extra',
  'deslocamento',
  'avulso',
  'ajuste_dia',
  'desconto',
]);
export const tipoAtividade = pgEnum('tipo_atividade', [
  'lead_criado',
  'orcamento_iniciado',
  'orcamento_concluido',
  'voltou',
  'pre_reserva_pedida',
  'pre_reserva_vencida',
  'visita_pedida',
  'whatsapp_clicado',
  'reserva_confirmada',
  'reserva_cancelada',
  'status_alterado',
  'proposta_aberta',
  'proposta_enviada',
  'versao_criada',
  'orcamento_expirado',
  'orcamento_criado',
]);
export const autorAtividade = pgEnum('autor_atividade', ['cliente', 'usuario', 'sistema']);
export const periodoVisita = pgEnum('periodo_visita', ['manha', 'tarde', 'noite']);
export const statusVisita = pgEnum('status_visita', [
  'solicitada',
  'confirmada',
  'realizada',
  'cancelada',
]);
export const eventoFunil = pgEnum('evento_funil', ['passo_visto', 'passo_concluido', 'abandono']);

const instante = (nome: string) => timestamp(nome, { withTimezone: true });
const empresaId = () =>
  uuid('empresa_id')
    .notNull()
    .references(() => empresas.id, { onDelete: 'cascade' });

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    nome: text('nome').notNull(),
    whatsappE164: text('whatsapp_e164').notNull(),
    email: text('email'),
    origem: origemLead('origem').notNull().default('link_direto'),
    status: statusLead('status').notNull().default('novo'),
    temperatura: temperaturaLead('temperatura').notNull().default('frio'),
    ultimoPasso: smallint('ultimo_passo'),
    consentimentoEm: instante('consentimento_em'),
    consentimentoVersao: text('consentimento_versao'),
    consentimentoTexto: text('consentimento_texto'),
    ehTeste: boolean('eh_teste').notNull().default(false),
    ultimaAtividadeEm: instante('ultima_atividade_em').notNull().defaultNow(),
    proximoContatoEm: instante('proximo_contato_em'),
    motivoPerda: text('motivo_perda'),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [unique().on(t.id, t.empresaId), unique().on(t.empresaId, t.ehTeste, t.whatsappE164)],
);

export const orcamentos = pgTable(
  'orcamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    leadId: uuid('lead_id').notNull(),
    numero: integer('numero').notNull(),
    versao: integer('versao').notNull().default(1),
    token: text('token').notNull().unique(),
    status: statusOrcamento('status').notNull().default('em_montagem'),
    canal: canalOrcamento('canal').notNull().default('publico'),
    origem: origemLead('origem').notNull().default('link_direto'),
    rascunho: jsonb('rascunho').notNull().default({}),
    passoAtual: smallint('passo_atual').notNull().default(3),
    /** ResultadoOrcamento congelado (com versaoMotor) */
    resultado: jsonb('resultado'),
    totalCentavos: integer('total_centavos'),
    validadeAte: date('validade_ate', { mode: 'string' }),
    ehTeste: boolean('eh_teste').notNull().default(false),
    tipoEventoId: uuid('tipo_evento_id'),
    data: date('data', { mode: 'string' }),
    turnoId: uuid('turno_id'),
    espacoId: uuid('espaco_id'),
    convidados: integer('convidados'),
    enviadoEm: instante('enviado_em'),
    visualizadoEm: instante('visualizado_em'),
    aceitoEm: instante('aceito_em'),
    /** só no canal interno */
    criadoPor: uuid('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    /** aparecem na proposta */
    observacoes: text('observacoes'),
    /** NUNCA saem para o cliente */
    observacoesInternas: text('observacoes_internas'),
    descontoMotivo: text('desconto_motivo'),
    foraAntecedencia: boolean('fora_antecedencia').notNull().default(false),
    aberturas: integer('aberturas').notNull().default(0),
    ultimaAberturaEm: instante('ultima_abertura_em'),
    /** conteúdo congelado na conclusão (cardápio, textos, convidados por faixa) */
    conteudo: jsonb('conteudo'),
    pacoteId: uuid('pacote_id'),
    canalEnvio: text('canal_envio'),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.id, t.empresaId),
    unique().on(t.empresaId, t.numero, t.versao),
    foreignKey({ columns: [t.leadId, t.empresaId], foreignColumns: [leads.id, leads.empresaId] }),
    foreignKey({
      columns: [t.tipoEventoId, t.empresaId],
      foreignColumns: [tiposEvento.id, tiposEvento.empresaId],
    }),
    foreignKey({
      columns: [t.turnoId, t.empresaId],
      foreignColumns: [turnos.id, turnos.empresaId],
    }),
    foreignKey({
      columns: [t.espacoId, t.empresaId],
      foreignColumns: [espacos.id, espacos.empresaId],
    }),
  ],
);

export const orcamentoItens = pgTable(
  'orcamento_itens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    orcamentoId: uuid('orcamento_id').notNull(),
    ordem: smallint('ordem').notNull(),
    tipo: tipoItemOrcamento('tipo').notNull(),
    descricao: text('descricao').notNull(),
    quantidade: integer('quantidade').notNull(),
    valorUnitarioCentavos: integer('valor_unitario_centavos').notNull(),
    subtotalCentavos: integer('subtotal_centavos').notNull(),
    detalhe: text('detalhe'),
    /** pacote ou opcional de origem */
    referenciaId: uuid('referencia_id'),
  },
  (t) => [
    foreignKey({
      columns: [t.orcamentoId, t.empresaId],
      foreignColumns: [orcamentos.id, orcamentos.empresaId],
    }),
  ],
);

export const atividades = pgTable(
  'atividades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    leadId: uuid('lead_id').notNull(),
    orcamentoId: uuid('orcamento_id'),
    tipo: tipoAtividade('tipo').notNull(),
    dados: jsonb('dados').notNull().default({}),
    autor: autorAtividade('autor').notNull(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    criadoEm: instante('criado_em')
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    foreignKey({ columns: [t.leadId, t.empresaId], foreignColumns: [leads.id, leads.empresaId] }),
    foreignKey({
      columns: [t.orcamentoId, t.empresaId],
      foreignColumns: [orcamentos.id, orcamentos.empresaId],
    }),
  ],
);

export const visitas = pgTable(
  'visitas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    leadId: uuid('lead_id').notNull(),
    orcamentoId: uuid('orcamento_id'),
    dataPreferida: date('data_preferida', { mode: 'string' }).notNull(),
    periodo: periodoVisita('periodo').notNull(),
    observacoes: text('observacoes'),
    status: statusVisita('status').notNull().default('solicitada'),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.leadId, t.empresaId], foreignColumns: [leads.id, leads.empresaId] }),
    foreignKey({
      columns: [t.orcamentoId, t.empresaId],
      foreignColumns: [orcamentos.id, orcamentos.empresaId],
    }),
  ],
);

export const funilEventos = pgTable('funil_eventos', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: empresaId(),
  sessao: uuid('sessao').notNull(),
  /** 0 = página do buffet; 1 a 6 = passos do wizard */
  passo: smallint('passo').notNull(),
  evento: eventoFunil('evento').notNull(),
  origem: origemLead('origem').notNull().default('link_direto'),
  criadoEm: instante('criado_em').notNull().defaultNow(),
});

export type Lead = typeof leads.$inferSelect;
export type Orcamento = typeof orcamentos.$inferSelect;
export type OrcamentoItem = typeof orcamentoItens.$inferSelect;
export type Atividade = typeof atividades.$inferSelect;
export type Visita = typeof visitas.$inferSelect;
