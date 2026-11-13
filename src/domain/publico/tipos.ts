import type { DataCivil, Id } from '../preco';

/** Origem do lead (mesmo enum do banco). */
export type OrigemLead =
  | 'instagram'
  | 'google'
  | 'indicacao'
  | 'whatsapp'
  | 'link_direto'
  | 'interno'
  | 'outro'
  | 'qrcode';

export type ModoPreco = 'exato' | 'faixa' | 'apos_contato';

/**
 * Escolhas do cliente no wizard. É tudo o que o navegador manda ao servidor: nunca preço,
 * desconto, "hoje" ou total. O servidor recalcula tudo com calcularOrcamento.
 */
export type Escolhas = {
  tipoEventoId?: Id;
  data?: DataCivil;
  turnoId?: Id;
  espacoId?: Id;
  adultos?: number;
  criancas: { faixaIdadeId: Id; quantidade: number }[];
  /** bairro e cidade, só para espaço "no local do cliente" */
  localCliente?: string;
  pacoteId?: Id;
  opcionais: { opcionalId: Id; quantidade: number }[];
  /** opcionais inclusos que o cliente retirou do pacote escolhido (Fase 6.5) */
  retirados?: Id[];
  horasExtras: number;
  /** 2ª e 3ª datas de preferência (Fase 6): só informam o buffet, não mudam o preço */
  datasAlternativas?: DataCivil[];
};

export const ESCOLHAS_VAZIAS: Escolhas = { criancas: [], opcionais: [], horasExtras: 0 };
