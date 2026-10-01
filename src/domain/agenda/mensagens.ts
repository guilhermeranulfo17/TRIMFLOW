/** Códigos de erro das funções SQL da agenda → mensagem simples para a tela. */
export const MENSAGENS_AGENDA: Record<string, string> = {
  AGENDA_SLOT_OCUPADO: 'Esse horário já está ocupado nesse espaço. Escolha outro turno ou data.',
  AGENDA_BLOQUEADO: 'Essa data está bloqueada na agenda.',
  AGENDA_DATA_PASSADA: 'Essa data já passou. Escolha uma data a partir de hoje.',
  AGENDA_TURNO_FORA_DO_DIA: 'Esse turno não acontece nesse dia da semana.',
  AGENDA_REFERENCIA_INVALIDA: 'Espaço ou turno indisponível. Recarregue a página.',
  AGENDA_NAO_ENCONTRADA: 'Esse registro não existe mais. Recarregue a página.',
  AGENDA_ESTADO_INVALIDO: 'Essa ação não vale para o estado atual. Recarregue a página.',
  AGENDA_PRE_RESERVA_VENCIDA: 'Essa pré-reserva já venceu e a data foi liberada.',
  AGENDA_BLOQUEIO_COM_RESERVA:
    'Há reserva ou pré-reserva nesse período. Cancele antes de bloquear.',
  AGENDA_PERIODO_INVALIDO: 'Período inválido. Use no máximo um ano.',
  AGENDA_HORAS_INVALIDAS: 'Informe de 1 a 720 horas.',
  AGENDA_VALOR_INVALIDO: 'Valor inválido.',
  AGENDA_SO_DONO: 'Só o dono do buffet pode fazer isso.',
  AGENDA_SEM_PERMISSAO: 'Você não tem permissão para fazer isso.',
};

export const MENSAGEM_AGENDA_PADRAO = 'Não foi possível salvar agora. Tente de novo em instantes.';

/** Traduz a mensagem de erro do banco (ex.: "AGENDA_SLOT_OCUPADO"). */
export function traduzirErroAgenda(mensagem: string | undefined): string | null {
  if (!mensagem) return null;
  return MENSAGENS_AGENDA[mensagem.trim()] ?? null;
}

/** "vence em 14h", "vence em 35 min", "vence em 2 dias", "vencida". */
export function prazoRestante(expiraEm: Date, agora: Date): string {
  const minutos = Math.floor((expiraEm.getTime() - agora.getTime()) / 60_000);
  if (minutos <= 0) return 'vencida';
  if (minutos < 60) return `vence em ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `vence em ${horas}h`;
  return `vence em ${Math.floor(horas / 24)} dias`;
}
