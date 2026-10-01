import {
  aPartirDe,
  calcularOrcamento,
  opcionaisDisponiveis,
  type ContextoPreco,
  type DataCivil,
  type EntradaOrcamento,
  type Id,
  type ResultadoOrcamento,
} from '../preco';
import { contextoSemDeslocamento } from './contexto';
import { espacoEscolhido, pacotesDoPasso, pessoas } from './passos';
import type { Escolhas, ModoPreco } from './tipos';

export const AVISO_DESLOCAMENTO =
  'O deslocamento até o local da festa é combinado diretamente com o buffet.';

/**
 * Entrada do motor a partir das escolhas. Tudo o que não é escolha do cliente vem do servidor:
 * "hoje", canal público, nenhum desconto, limite de desconto zero, nenhum item avulso.
 */
export function entradaDoMotor(
  ctx: ContextoPreco,
  e: Escolhas,
  hoje: DataCivil,
  pacoteId: Id | undefined = e.pacoteId,
  opcionais: Escolhas['opcionais'] = e.opcionais,
): EntradaOrcamento | null {
  const espaco = espacoEscolhido(ctx, e);
  if (!e.tipoEventoId || !e.data || !e.turnoId || !espaco || !pacoteId) return null;
  return {
    canal: 'publico',
    hoje,
    tipoEventoId: e.tipoEventoId,
    data: e.data,
    turnoId: e.turnoId,
    espacoId: espaco.id,
    adultos: e.adultos ?? 0,
    criancas: e.criancas.filter((c) => c.quantidade > 0),
    pacoteId,
    opcionais: opcionais.filter((o) => o.quantidade > 0),
    horasExtras: e.horasExtras,
    limiteDescontoBp: 0,
  };
}

export type PacotePrevia = {
  id: Id;
  disponivel: boolean;
  motivo?: string;
  totalCentavos: number | null;
};
export type OpcionalPrevia = {
  id: Id;
  precoCentavos: number;
  cobranca: string;
  qtdMin: number;
  qtdMax: number | null;
};

export type Previa = {
  /** total das escolhas atuais (só depois do contato e com pacote escolhido) */
  totalCentavos: number | null;
  /** menor total possível (nunca no modo "após contato" antes do WhatsApp) */
  aPartirDeCentavos: number | null;
  pacotes: PacotePrevia[];
  opcionais: OpcionalPrevia[];
  resultado: ResultadoOrcamento | null;
  avisos: string[];
};

/**
 * Prévia de preço do wizard, respeitando o modo de exibição:
 * - antes do WhatsApp: no máximo "a partir de" (exato e faixa); nada no "após contato";
 * - depois do WhatsApp: totais por pacote, preços dos extras e o resultado completo.
 */
export function montarPrevia(
  ctxOriginal: ContextoPreco,
  e: Escolhas,
  opcoes: { hoje: DataCivil; comContato: boolean; modo: ModoPreco },
): Previa {
  const espaco = espacoEscolhido(ctxOriginal, e);
  const ctx = contextoSemDeslocamento(ctxOriginal);
  const avisos = espaco?.noLocalDoCliente ? [AVISO_DESLOCAMENTO] : [];
  const vazia: Previa = {
    totalCentavos: null,
    aPartirDeCentavos: null,
    pacotes: [],
    opcionais: [],
    resultado: null,
    avisos,
  };
  if (!e.tipoEventoId) return vazia;

  const podeMostrar = opcoes.comContato || opcoes.modo !== 'apos_contato';
  const minimo = podeMostrar
    ? aPartirDe(ctx, {
        tipoEventoId: e.tipoEventoId,
        data: e.data,
        turnoId: e.turnoId,
        ...(pessoas(e) > 0 ? { adultos: e.adultos ?? 0, criancas: e.criancas } : {}),
      })
    : null;
  const previa: Previa = { ...vazia, aPartirDeCentavos: minimo?.totalCentavos ?? null };
  if (!opcoes.comContato) return previa;

  previa.pacotes = pacotesDoPasso(ctx, e).map((p) => {
    const entrada = p.disponivel ? entradaDoMotor(ctx, e, opcoes.hoje, p.pacote.id, []) : null;
    const r = entrada ? calcularOrcamento(ctx, entrada) : null;
    return {
      id: p.pacote.id,
      disponivel: p.disponivel,
      ...(p.motivo ? { motivo: p.motivo } : {}),
      totalCentavos: r?.ok ? r.totalCentavos : null,
    };
  });

  if (e.pacoteId) {
    previa.opcionais = opcionaisDisponiveis(ctx, {
      pacoteId: e.pacoteId,
      tipoEventoId: e.tipoEventoId,
    }).map((o) => ({
      id: o.id,
      precoCentavos: o.precoCentavos,
      cobranca: o.cobranca,
      qtdMin: o.qtdMin,
      qtdMax: o.qtdMax,
    }));
    const entrada = entradaDoMotor(ctx, e, opcoes.hoje);
    if (entrada) {
      previa.resultado = calcularOrcamento(ctx, entrada);
      previa.totalCentavos = previa.resultado.ok ? previa.resultado.totalCentavos : null;
    }
  }
  return previa;
}
