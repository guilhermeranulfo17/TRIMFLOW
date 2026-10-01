/**
 * Espelho Drizzle do catálogo e das regras (Etapa 1).
 * Fonte da verdade: supabase/migrations/20261001000001..3. Mantenha em sincronia.
 * Dinheiro em centavos (integer), percentuais em basis points (integer), durações em minutos.
 */
import {
  boolean,
  date,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { empresas } from './schema';

export const tipoAjusteDia = pgEnum('tipo_ajuste_dia', ['dia_semana', 'feriado']);
export const modoExibicaoPreco = pgEnum('modo_exibicao_preco', ['exato', 'faixa', 'apos_contato']);
export const ajusteIncide = pgEnum('ajuste_incide', ['pacote', 'pacote_opcionais']);
export const deslocamentoModelo = pgEnum('deslocamento_modelo', ['nenhum', 'por_km', 'por_faixa']);
export const modeloPreco = pgEnum('modelo_preco', ['por_pessoa', 'por_faixa']);
export const cobrancaOpcional = pgEnum('cobranca_opcional', [
  'por_pessoa',
  'fixo',
  'por_unidade',
  'por_hora',
]);
export const relacaoOpcionalPacote = pgEnum('relacao_opcional_pacote', ['compativel', 'incluso']);

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow();
const empresaId = () =>
  uuid('empresa_id')
    .notNull()
    .references(() => empresas.id, { onDelete: 'cascade' });

export const tiposEvento = pgTable(
  'tipos_evento',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    nome: text('nome').notNull(),
    icone: text('icone'),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [unique().on(t.id, t.empresaId)],
);

export const espacos = pgTable(
  'espacos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    nome: text('nome').notNull(),
    capacidadeMax: integer('capacidade_max').notNull(),
    noLocalDoCliente: boolean('no_local_do_cliente').notNull().default(false),
    eventosSimultaneos: integer('eventos_simultaneos').notNull().default(1),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [unique().on(t.id, t.empresaId)],
);

export const turnos = pgTable(
  'turnos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    nome: text('nome').notNull(),
    /** "HH:MM:SS" */
    horaInicio: time('hora_inicio').notNull(),
    duracaoMin: integer('duracao_min').notNull(),
    diasSemana: smallint('dias_semana').array().notNull(),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [unique().on(t.id, t.empresaId)],
);

export const feriados = pgTable(
  'feriados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    data: date('data', { mode: 'string' }).notNull(),
    nome: text('nome').notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [unique().on(t.empresaId, t.data)],
);

export const ajustesDia = pgTable(
  'ajustes_dia',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    tipo: tipoAjusteDia('tipo').notNull(),
    diaSemana: smallint('dia_semana'),
    turnoId: uuid('turno_id'),
    ajusteBp: integer('ajuste_bp').notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    foreignKey({
      columns: [t.turnoId, t.empresaId],
      foreignColumns: [turnos.id, turnos.empresaId],
    }),
  ],
);

export const faixasDeslocamento = pgTable(
  'faixas_deslocamento',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    ateKm: integer('ate_km').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [unique().on(t.empresaId, t.ateKm)],
);

export const regrasComerciais = pgTable('regras_comerciais', {
  empresaId: uuid('empresa_id')
    .primaryKey()
    .references(() => empresas.id, { onDelete: 'cascade' }),
  validadeDias: integer('validade_dias').notNull().default(15),
  prazoPreReservaHoras: integer('prazo_pre_reserva_horas').notNull().default(48),
  antecedenciaMinDias: integer('antecedencia_min_dias').notNull().default(7),
  sinalBp: integer('sinal_bp').notNull().default(3000),
  parcelasMax: integer('parcelas_max').notNull().default(3),
  prazoUltimaParcelaDias: integer('prazo_ultima_parcela_dias').notNull().default(7),
  formasPagamento: text('formas_pagamento').array().notNull(),
  condicoesTexto: text('condicoes_texto').notNull().default(''),
  naoInclusoTexto: text('nao_incluso_texto').notNull().default(''),
  cancelamentoTexto: text('cancelamento_texto').notNull().default(''),
  modoExibicaoPreco: modoExibicaoPreco('modo_exibicao_preco').notNull().default('exato'),
  ajusteIncide: ajusteIncide('ajuste_incide').notNull().default('pacote'),
  deslocamentoModelo: deslocamentoModelo('deslocamento_modelo').notNull().default('nenhum'),
  deslocamentoKmGratis: integer('deslocamento_km_gratis').notNull().default(0),
  deslocamentoValorKmCentavos: integer('deslocamento_valor_km_centavos').notNull().default(0),
  intervaloEntreEventosMin: integer('intervalo_entre_eventos_min').notNull().default(60),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

export const pacotes = pgTable(
  'pacotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    nome: text('nome').notNull(),
    subtitulo: text('subtitulo'),
    descricao: text('descricao'),
    destaque: boolean('destaque').notNull().default(false),
    modeloPreco: modeloPreco('modelo_preco').notNull(),
    precoPessoaCentavos: integer('preco_pessoa_centavos'),
    valorExcedenteCentavos: integer('valor_excedente_centavos'),
    minConvidados: integer('min_convidados').notNull().default(1),
    maxConvidados: integer('max_convidados'),
    duracaoInclusaMin: integer('duracao_inclusa_min').notNull().default(240),
    valorHoraExtraCentavos: integer('valor_hora_extra_centavos').notNull().default(0),
    fotos: jsonb('fotos').$type<string[]>().notNull().default([]),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [unique().on(t.id, t.empresaId)],
);

export const faixasPreco = pgTable(
  'faixas_preco',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    pacoteId: uuid('pacote_id').notNull(),
    ateConvidados: integer('ate_convidados').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    foreignKey({
      columns: [t.pacoteId, t.empresaId],
      foreignColumns: [pacotes.id, pacotes.empresaId],
    }).onDelete('cascade'),
    unique().on(t.pacoteId, t.ateConvidados),
  ],
);

export const secoesCardapio = pgTable(
  'secoes_cardapio',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    pacoteId: uuid('pacote_id').notNull(),
    nome: text('nome').notNull(),
    itens: text('itens').array().notNull(),
    ordem: integer('ordem').notNull().default(0),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    foreignKey({
      columns: [t.pacoteId, t.empresaId],
      foreignColumns: [pacotes.id, pacotes.empresaId],
    }).onDelete('cascade'),
  ],
);

export const faixasIdade = pgTable(
  'faixas_idade',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    rotulo: text('rotulo').notNull(),
    idadeMin: integer('idade_min').notNull(),
    idadeMax: integer('idade_max'),
    fatorBp: integer('fator_bp').notNull(),
    pacoteId: uuid('pacote_id'),
    ordem: integer('ordem').notNull().default(0),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    foreignKey({
      columns: [t.pacoteId, t.empresaId],
      foreignColumns: [pacotes.id, pacotes.empresaId],
    }).onDelete('cascade'),
  ],
);

export const pacoteTiposEvento = pgTable(
  'pacote_tipos_evento',
  {
    empresaId: empresaId(),
    pacoteId: uuid('pacote_id').notNull(),
    tipoEventoId: uuid('tipo_evento_id').notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    primaryKey({ columns: [t.pacoteId, t.tipoEventoId] }),
    foreignKey({
      columns: [t.pacoteId, t.empresaId],
      foreignColumns: [pacotes.id, pacotes.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tipoEventoId, t.empresaId],
      foreignColumns: [tiposEvento.id, tiposEvento.empresaId],
    }).onDelete('cascade'),
  ],
);

export const opcionais = pgTable(
  'opcionais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: empresaId(),
    nome: text('nome').notNull(),
    descricao: text('descricao'),
    cobranca: cobrancaOpcional('cobranca').notNull(),
    precoCentavos: integer('preco_centavos').notNull(),
    qtdMin: integer('qtd_min').notNull().default(1),
    qtdMax: integer('qtd_max'),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [unique().on(t.id, t.empresaId)],
);

export const opcionalPacotes = pgTable(
  'opcional_pacotes',
  {
    empresaId: empresaId(),
    opcionalId: uuid('opcional_id').notNull(),
    pacoteId: uuid('pacote_id').notNull(),
    relacao: relacaoOpcionalPacote('relacao').notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    primaryKey({ columns: [t.opcionalId, t.pacoteId] }),
    foreignKey({
      columns: [t.opcionalId, t.empresaId],
      foreignColumns: [opcionais.id, opcionais.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.pacoteId, t.empresaId],
      foreignColumns: [pacotes.id, pacotes.empresaId],
    }).onDelete('cascade'),
  ],
);

export const opcionalTiposEvento = pgTable(
  'opcional_tipos_evento',
  {
    empresaId: empresaId(),
    opcionalId: uuid('opcional_id').notNull(),
    tipoEventoId: uuid('tipo_evento_id').notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    primaryKey({ columns: [t.opcionalId, t.tipoEventoId] }),
    foreignKey({
      columns: [t.opcionalId, t.empresaId],
      foreignColumns: [opcionais.id, opcionais.empresaId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.tipoEventoId, t.empresaId],
      foreignColumns: [tiposEvento.id, tiposEvento.empresaId],
    }).onDelete('cascade'),
  ],
);
