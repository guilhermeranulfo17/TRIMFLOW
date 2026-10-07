/*
 * Tipos de aviso e canais. O painel é sempre ligado (fonte da verdade); push e WhatsApp seguem
 * a preferência do usuário por tipo, ou o padrão. ESPELHO de public._aviso_canais.
 */
export const TIPOS_AVISO = [
  'pre_reserva_pedida',
  'visita_pedida',
  'pre_reserva_vencendo',
  'orcamentos_sem_acao',
  'cliente_parou',
  'cliente_esquentou',
  'resumo_diario',
  'teste',
  'teste_acabando',
  'fatura_criada',
  'pagamento_confirmado',
  'pagamento_falhou',
  'carencia',
  'conta_suspensa',
  // Etapa 9B: avisos da conta (só para o dono, também por e-mail)
  'boas_vindas',
  'exportacao_pronta',
  'exclusao_agendada',
  // Etapa 10: contrato digital (só para o dono)
  'contrato_aberto',
  'contrato_assinado',
  'contrato_ajuste',
  'contrato_vencendo',
] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

/** Avisos de cobrança (Etapa 9A): só para o dono, push sempre ligado, não configuráveis. */
export const TIPOS_COBRANCA = [
  'teste_acabando',
  'fatura_criada',
  'pagamento_confirmado',
  'pagamento_falhou',
  'carencia',
  'conta_suspensa',
] as const satisfies readonly TipoAviso[];

export const ehAvisoCobranca = (tipo: TipoAviso): boolean =>
  (TIPOS_COBRANCA as readonly TipoAviso[]).includes(tipo);

/** Avisos da conta (Etapa 9B): como os de cobrança, só para o dono e não configuráveis. */
export const TIPOS_CONTA = [
  'boas_vindas',
  'exportacao_pronta',
  'exclusao_agendada',
] as const satisfies readonly TipoAviso[];

/** Cobrança ou conta: push sempre, sem preferência, chegam mesmo com a conta suspensa. */
export const ehAvisoDeConta = (tipo: TipoAviso): boolean =>
  ehAvisoCobranca(tipo) || (TIPOS_CONTA as readonly TipoAviso[]).includes(tipo);

/**
 * Tipos que também vão por e-mail (Etapa 9B, canal `email` da fila, para o e-mail do dono).
 * ESPELHO de public._aviso_email. Avisos de lead nunca vão por e-mail.
 */
export const TIPOS_COM_EMAIL = [
  'boas_vindas',
  'teste_acabando',
  'fatura_criada',
  'pagamento_confirmado',
  'pagamento_falhou',
  'conta_suspensa',
  'exportacao_pronta',
  'exclusao_agendada',
  'contrato_assinado',
] as const satisfies readonly TipoAviso[];

export const recebeEmail = (tipo: TipoAviso): boolean =>
  (TIPOS_COM_EMAIL as readonly TipoAviso[]).includes(tipo);

export const CANAIS_EXTERNOS = ['push', 'whatsapp'] as const;
export type CanalExterno = (typeof CANAIS_EXTERNOS)[number];
export type CanalAviso = 'painel' | CanalExterno;
/** Canais da fila de entregas: os externos configuráveis e o e-mail (só avisos da conta). */
export type CanalEntrega = CanalExterno | 'email';

/** Tipos que aparecem em Minha conta → Avisos (teste e cobrança não são configuráveis). */
export const TIPOS_CONFIGURAVEIS = TIPOS_AVISO.filter((t) => t !== 'teste' && !ehAvisoDeConta(t));

export const CANAIS_PADRAO: Record<TipoAviso, CanalExterno[]> = {
  pre_reserva_pedida: ['push', 'whatsapp'],
  visita_pedida: ['push', 'whatsapp'],
  pre_reserva_vencendo: ['push', 'whatsapp'],
  orcamentos_sem_acao: ['push'],
  cliente_parou: [],
  cliente_esquentou: [],
  resumo_diario: ['push', 'whatsapp'],
  teste: ['push', 'whatsapp'],
  teste_acabando: ['push'],
  fatura_criada: ['push'],
  pagamento_confirmado: ['push'],
  pagamento_falhou: ['push'],
  carencia: ['push'],
  conta_suspensa: ['push'],
  boas_vindas: ['push'],
  exportacao_pronta: ['push'],
  exclusao_agendada: ['push'],
  contrato_aberto: ['push'],
  contrato_assinado: ['push'],
  contrato_ajuste: ['push'],
  contrato_vencendo: ['push'],
};

export const ROTULO_TIPO_AVISO: Record<TipoAviso, string> = {
  pre_reserva_pedida: 'Pré-reserva pedida',
  visita_pedida: 'Visita pedida',
  pre_reserva_vencendo: 'Pré-reserva vencendo',
  orcamentos_sem_acao: 'Orçamentos sem resposta',
  cliente_parou: 'Cliente parou no meio',
  cliente_esquentou: 'Cliente esquentou',
  resumo_diario: 'Resumo do dia (8h)',
  teste: 'Aviso de teste',
  teste_acabando: 'Teste grátis acabando',
  fatura_criada: 'Fatura criada',
  pagamento_confirmado: 'Pagamento confirmado',
  pagamento_falhou: 'Pagamento não identificado',
  carencia: 'Pagamento em atraso',
  conta_suspensa: 'Conta suspensa',
  boas_vindas: 'Boas-vindas',
  exportacao_pronta: 'Exportação dos dados',
  exclusao_agendada: 'Exclusão da conta',
  contrato_aberto: 'Cliente abriu o contrato',
  contrato_assinado: 'Contrato assinado',
  contrato_ajuste: 'Cliente pediu ajuste no contrato',
  contrato_vencendo: 'Link do contrato vencendo',
};

/** Avisos do contrato (Etapa 10): só para o dono (o vendedor não vê contratos). */
export const TIPOS_CONTRATO = [
  'contrato_aberto',
  'contrato_assinado',
  'contrato_ajuste',
  'contrato_vencendo',
] as const satisfies readonly TipoAviso[];

export const ehAvisoContrato = (tipo: TipoAviso): boolean =>
  (TIPOS_CONTRATO as readonly TipoAviso[]).includes(tipo);

/** Só estes tipos têm modelo aprovado no WhatsApp (docs/WHATSAPP_MODELOS.md). */
export const TIPOS_COM_WHATSAPP: TipoAviso[] = [
  'pre_reserva_pedida',
  'visita_pedida',
  'pre_reserva_vencendo',
  'resumo_diario',
  'teste',
];

export function canaisDisponiveis(tipo: TipoAviso): CanalExterno[] {
  return TIPOS_COM_WHATSAPP.includes(tipo) ? ['push', 'whatsapp'] : ['push'];
}

/** Canais externos ligados para o tipo: a preferência salva ou o padrão. */
export function canaisDoTipo(
  tipo: TipoAviso,
  preferencias: Partial<Record<string, unknown>> | null | undefined,
): CanalExterno[] {
  const salvo = tipo === 'teste' || ehAvisoDeConta(tipo) ? undefined : preferencias?.[tipo];
  const escolhidos = Array.isArray(salvo) ? salvo : CANAIS_PADRAO[tipo];
  const disponiveis = canaisDisponiveis(tipo);
  return CANAIS_EXTERNOS.filter((c) => escolhidos.includes(c) && disponiveis.includes(c));
}
