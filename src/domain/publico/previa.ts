// módulos específicos (não o índice de ../preco, que traz o Zod da entrada para o navegador)
import { aPartirDe } from '../preco/a-partir-de';
import { contarConvidados } from '../preco/equivalentes';
import { calcularOrcamento } from '../preco/calcular';
import { opcionaisDisponiveis, retiraveisDoPacote } from '../preco/disponibilidade';
import { descreverOpcional } from '../preco/opcional';
import type {
  ContextoPreco,
  DataCivil,
  EntradaOrcamento,
  Id,
  ModoVenda,
  ResultadoOrcamento,
} from '../preco/tipos';
import { contextoSemDeslocamento } from './contexto';
import { espacoEscolhido, itensSemPacote, pacotesDoPasso, pessoas, vendeSemPacote } from './passos';
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
  /** null = sem pacote (§96); por padrão, o das escolhas */
  pacoteId: Id | null | undefined = e.semPacote ? null : e.pacoteId,
  opcionais: Escolhas['opcionais'] = e.opcionais,
  extra: ExtraInterno = {},
): EntradaOrcamento | null {
  const espaco = espacoEscolhido(
    ctx.espacos.filter((x) => x.ativo),
    e,
  );
  if (!e.tipoEventoId || !e.data || !e.turnoId || !espaco || pacoteId === undefined) return null;
  // retirados valem só para o pacote escolhido (os totais dos outros pacotes vêm sem eles)
  const retirados =
    pacoteId !== null && pacoteId === e.pacoteId ? [...new Set(e.retirados ?? [])] : [];
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
    ...(retirados.length ? { retirados } : {}),
    horasExtras: e.horasExtras,
    limiteDescontoBp: 0,
    ...extra,
  };
}

/**
 * Só o orçamento interno (painel): canal interno, itens avulsos, desconto e o limite de
 * desconto do usuário (vindo do servidor). O link público nunca passa nada disso.
 */
export type ExtraInterno = Partial<
  Pick<EntradaOrcamento, 'canal' | 'itensAvulsos' | 'desconto' | 'limiteDescontoBp'>
>;

export type PacotePrevia = {
  id: Id;
  disponivel: boolean;
  motivo?: string;
  totalCentavos: number | null;
};
export type RetiravelPrevia = { id: Id; nome: string; descontoCentavos: number | null };
export type OpcionalPrevia = {
  id: Id;
  precoCentavos: number;
  cobranca: string;
  qtdMin: number;
  qtdMax: number | null;
};

/**
 * Item do orçamento sem pacote (§96), depois do WhatsApp. `valorCentavos` = quanto o item custa
 * para os convidados informados (por unidade com quantidade escolhida: o valor de cada um).
 * Com quantidade por convidado, o cliente só marca o item: a conta fica com o buffet.
 */
export type ItemPrevia = {
  id: Id;
  cobranca: string;
  valorCentavos: number;
  porUnidade: boolean;
  automatica: boolean;
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
  /** inclusos do pacote escolhido que o cliente pode retirar (só depois do contato) */
  retiraveis: RetiravelPrevia[];
  resultado: ResultadoOrcamento | null;
  /** valor da hora extra do pacote escolhido (0 = o pacote não vende hora extra) */
  horaExtraCentavos: number | null;
  avisos: string[];
  /** §96: itens para montar a festa sem pacote (só depois do contato) */
  itens: ItemPrevia[];
  /** §96: erro do pedido sem pacote para mostrar no passo (pedido mínimo, nenhum item…) */
  erroSemPacote: string | null;
  /** §96: a festa sem pacote tem preço base por pessoa (dá para pedir sem item com preço) */
  festaComPreco: boolean;
};

/**
 * Prévia de preço do wizard, respeitando o modo de exibição:
 * - antes do WhatsApp: no máximo "a partir de" (exato e faixa); nada no "após contato";
 * - depois do WhatsApp: totais por pacote, preços dos extras e o resultado completo.
 */
export function montarPrevia(
  ctxOriginal: ContextoPreco,
  e: Escolhas,
  opcoes: { hoje: DataCivil; comContato: boolean; modo: ModoPreco; extra?: ExtraInterno },
): Previa {
  const espaco = espacoEscolhido(
    ctxOriginal.espacos.filter((x) => x.ativo),
    e,
  );
  const ctx = contextoSemDeslocamento(ctxOriginal);
  const avisos = espaco?.noLocalDoCliente ? [AVISO_DESLOCAMENTO] : [];
  const vazia: Previa = {
    totalCentavos: null,
    aPartirDeCentavos: null,
    pacotes: [],
    opcionais: [],
    retiraveis: [],
    resultado: null,
    horaExtraCentavos: null,
    avisos,
    itens: [],
    erroSemPacote: null,
    festaComPreco: false,
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
    const entrada = p.disponivel
      ? entradaDoMotor(
          ctx,
          e,
          opcoes.hoje,
          p.pacote.id,
          [],
          opcoes.extra?.canal ? { canal: opcoes.extra.canal } : {},
        )
      : null;
    const r = entrada ? calcularOrcamento(ctx, entrada) : null;
    return {
      id: p.pacote.id,
      disponivel: p.disponivel,
      ...(p.motivo ? { motivo: p.motivo } : {}),
      totalCentavos: r?.ok ? r.totalCentavos : null,
    };
  });

  if (e.semPacote && vendeSemPacote(ctx.regras.modoVenda)) {
    const eq = calcularEquivalentes(ctx, e);
    previa.festaComPreco = (ctx.regras.faixasFestaPorPessoa?.length ?? 0) > 0;
    previa.itens = itensSemPacote(ctx, e.tipoEventoId).map((o) => {
      const linha = descreverOpcional(o, Math.max(o.qtdMin, 1), eq);
      const porUnidade =
        (o.cobranca === 'por_unidade' || o.cobranca === 'por_hora') && !linha.ocultarConta;
      return {
        id: o.id,
        cobranca: o.cobranca,
        valorCentavos: porUnidade ? o.precoCentavos : linha.subtotalCentavos,
        porUnidade,
        automatica: !!linha.ocultarConta,
        qtdMin: o.qtdMin,
        qtdMax: o.qtdMax,
      };
    });
    const entrada = entradaDoMotor(ctx, e, opcoes.hoje, null, e.opcionais, opcoes.extra);
    // o "a partir de" é dos pacotes: montando por itens, vale o total do que foi escolhido
    previa.aPartirDeCentavos = null;
    if (entrada) {
      previa.resultado = calcularOrcamento(ctx, entrada);
      // abaixo do pedido mínimo, o cliente vê quanto já deu (e o passo diz quanto falta)
      const soMinimo =
        previa.resultado.erros.length > 0 &&
        previa.resultado.erros.every((x) => x.codigo === 'PEDIDO_MINIMO');
      previa.totalCentavos =
        previa.resultado.ok || soMinimo ? previa.resultado.totalCentavos : null;
      previa.erroSemPacote =
        previa.resultado.erros.find((x) =>
          [
            'ITENS_OBRIGATORIOS',
            'PEDIDO_MINIMO',
            'CONVIDADOS_ABAIXO_MINIMO',
            'OPCIONAL_QUANTIDADE',
          ].includes(x.codigo),
        )?.mensagem ?? null;
    }
    return previa;
  }

  if (e.pacoteId) {
    previa.horaExtraCentavos =
      ctx.pacotes.find((p) => p.id === e.pacoteId)?.valorHoraExtraCentavos ?? null;
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
    previa.retiraveis = retiraveisDoPacote(ctx, e.pacoteId);
    const entrada = entradaDoMotor(ctx, e, opcoes.hoje, e.pacoteId, e.opcionais, opcoes.extra);
    if (entrada) {
      previa.resultado = calcularOrcamento(ctx, entrada);
      previa.totalCentavos = previa.resultado.ok ? previa.resultado.totalCentavos : null;
    }
  }
  return previa;
}

function calcularEquivalentes(ctx: ContextoPreco, e: Escolhas): number {
  return contarConvidados(ctx, null, e.adultos ?? 0, e.criancas).equivalentes;
}

/**
 * Ajusta as escolhas ao jeito de vender do buffet (servidor e navegador): "só itens" monta sempre
 * sem pacote; "só pacotes" nunca. No "os dois", vale a escolha do cliente.
 */
export function escolhasNoModo(modo: ModoVenda | undefined, e: Escolhas): Escolhas {
  const m = modo ?? 'pacotes';
  if (m === 'itens') {
    const { pacoteId: _p, retirados: _r, ...resto } = e;
    return { ...resto, semPacote: true, horasExtras: 0 };
  }
  if (m === 'pacotes' && e.semPacote) {
    const { semPacote: _s, ...resto } = e;
    return resto;
  }
  return e;
}
