/**
 * Espelho Drizzle dos avisos e do follow-up (Etapa 7).
 * Fonte da verdade: supabase/migrations (20261007000001). Mantenha em sincronia.
 * Escrita SÓ pelas funções SQL (marcar_avisos_lidos, salvar_preferencias_avisos, fila…).
 */
import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { empresas, usuarios } from './schema';
import { leads } from './schema-leads';

const instante = (nome: string) => timestamp(nome, { withTimezone: true });
const empresaId = () =>
  uuid('empresa_id')
    .notNull()
    .references(() => empresas.id, { onDelete: 'cascade' });

export const tipoAviso = pgEnum('tipo_aviso', [
  'pre_reserva_pedida',
  'visita_pedida',
  'pre_reserva_vencendo',
  'orcamentos_sem_acao',
  'cliente_parou',
  'cliente_esquentou',
  'resumo_diario',
  'teste',
  // Etapa 9A: cobrança (só o dono)
  'teste_acabando',
  'fatura_criada',
  'pagamento_confirmado',
  'pagamento_falhou',
  'carencia',
  'conta_suspensa',
]);
export const canalAviso = pgEnum('canal_aviso', ['painel', 'push', 'whatsapp']);
export const statusEntrega = pgEnum('status_entrega', [
  'pendente',
  'enviando',
  'enviado',
  'falhou',
  'ignorado',
]);

export const avisos = pgTable(
  'avisos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    usuarioId: uuid('usuario_id').notNull(),
    tipo: tipoAviso('tipo').notNull(),
    leadId: uuid('lead_id'),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
    chave: text('chave').notNull().unique(),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    lidoEm: instante('lido_em'),
    agendadoPara: instante('agendado_para').notNull().defaultNow(),
    agrupados: integer('agrupados').notNull().default(1),
  },
  (t) => [
    unique().on(t.id, t.empresaId),
    foreignKey({
      columns: [t.usuarioId, t.empresaId],
      foreignColumns: [usuarios.id, usuarios.empresaId],
    }),
    foreignKey({ columns: [t.leadId, t.empresaId], foreignColumns: [leads.id, leads.empresaId] }),
  ],
);

export const avisosEntregas = pgTable(
  'avisos_entregas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    avisoId: uuid('aviso_id').notNull(),
    canal: canalAviso('canal').notNull(),
    status: statusEntrega('status').notNull().default('pendente'),
    tentativas: integer('tentativas').notNull().default(0),
    proximoEnvioEm: instante('proximo_envio_em').notNull().defaultNow(),
    bloqueadoAte: instante('bloqueado_ate'),
    enviadoEm: instante('enviado_em'),
    erroCodigo: text('erro_codigo'),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.avisoId, t.canal),
    foreignKey({
      columns: [t.avisoId, t.empresaId],
      foreignColumns: [avisos.id, avisos.empresaId],
    }),
  ],
);

export const pushInscricoes = pgTable(
  'push_inscricoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    usuarioId: uuid('usuario_id').notNull(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    aparelho: text('aparelho'),
    criadoEm: instante('criado_em').notNull().defaultNow(),
    ultimoUsoEm: instante('ultimo_uso_em'),
  },
  (t) => [
    foreignKey({
      columns: [t.usuarioId, t.empresaId],
      foreignColumns: [usuarios.id, usuarios.empresaId],
    }),
  ],
);

export const preferenciasAvisos = pgTable(
  'preferencias_avisos',
  {
    usuarioId: uuid('usuario_id').primaryKey(),
    empresaId: empresaId(),
    canais: jsonb('canais').$type<Record<string, string[]>>().notNull().default({}),
    silencioInicio: time('silencio_inicio').notNull().default('22:00'),
    silencioFim: time('silencio_fim').notNull().default('07:00'),
    receberDeVendedores: boolean('receber_de_vendedores').notNull().default(false),
    whatsappAtivo: boolean('whatsapp_ativo').notNull().default(false),
    whatsappNumero: text('whatsapp_numero'),
    whatsappAceiteEm: instante('whatsapp_aceite_em'),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.usuarioId, t.empresaId],
      foreignColumns: [usuarios.id, usuarios.empresaId],
    }),
  ],
);

export const regrasFollowUp = pgTable(
  'regras_follow_up',
  {
    empresaId: empresaId(),
    regra: text('regra').notNull(),
    ligada: boolean('ligada').notNull().default(true),
    prazo: integer('prazo'),
    atualizadoEm: instante('atualizado_em').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.regra] })],
);
