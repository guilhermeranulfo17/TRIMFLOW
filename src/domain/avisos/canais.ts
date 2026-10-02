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

export const CANAIS_EXTERNOS = ['push', 'whatsapp'] as const;
export type CanalExterno = (typeof CANAIS_EXTERNOS)[number];
export type CanalAviso = 'painel' | CanalExterno;

/** Tipos que aparecem em Minha conta → Avisos (teste e cobrança não são configuráveis). */
export const TIPOS_CONFIGURAVEIS = TIPOS_AVISO.filter((t) => t !== 'teste' && !ehAvisoCobranca(t));

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
};

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
  const salvo = tipo === 'teste' || ehAvisoCobranca(tipo) ? undefined : preferencias?.[tipo];
  const escolhidos = Array.isArray(salvo) ? salvo : CANAIS_PADRAO[tipo];
  const disponiveis = canaisDisponiveis(tipo);
  return CANAIS_EXTERNOS.filter((c) => escolhidos.includes(c) && disponiveis.includes(c));
}
