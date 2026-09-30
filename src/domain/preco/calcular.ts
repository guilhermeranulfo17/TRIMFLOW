import {
  compararDatas,
  dataCivilValida,
  diaDaSemana,
  diaDaSemanaNumero,
  somarDias,
} from '../dates';
import { dividirArredondando, formatBRL, pctBp } from '../money';
import { formatBp } from '../percent';
import { escolherAjusteDia } from './ajuste-dia';
import { contarConvidados } from './equivalentes';
import { descreverOpcional } from './opcional';
import { mensagens } from './mensagens';
import { calcularParcelas } from './parcelas';
import { buscarAtivo, pacoteValeParaTipo, valorDoPacote } from './pacote';
import {
  VERSAO_MOTOR,
  type AvisoOrcamento,
  type CodigoAviso,
  type CodigoErro,
  type ContextoPreco,
  type EntradaOrcamento,
  type ErroOrcamento,
  type LinhaOrcamento,
  type ResultadoOrcamento,
} from './tipos';

/**
 * Motor de preço: função pura. A mesma entrada sempre gera o mesmo resultado.
 * Ordem: equivalentes → validações → pacote → ajuste de dia → opcionais → horas extras →
 * deslocamento → avulsos → subtotal → desconto → total → por convidado → sinal/saldo → parcelas.
 * Com erro, `ok = false`, mas as linhas que puderam ser calculadas continuam no resultado.
 */
export function calcularOrcamento(
  contexto: ContextoPreco,
  entrada: EntradaOrcamento,
): ResultadoOrcamento {
  const erros: ErroOrcamento[] = [];
  const avisos: AvisoOrcamento[] = [];
  const erro = (codigo: CodigoErro, mensagem: string, campo?: string) =>
    erros.push(campo ? { codigo, mensagem, campo } : { codigo, mensagem });
  const aviso = (codigo: CodigoAviso, mensagem: string) => avisos.push({ codigo, mensagem });

  const { regras } = contexto;
  const interno = entrada.canal === 'interno';

  // Referências -------------------------------------------------------------
  const tipo = buscarAtivo(contexto.tiposEvento, entrada.tipoEventoId);
  if (!tipo)
    erro('REFERENCIA_INVALIDA', mensagens.referenciaInvalida('O tipo de festa'), 'tipoEventoId');
  const turno = buscarAtivo(contexto.turnos, entrada.turnoId);
  if (!turno) erro('REFERENCIA_INVALIDA', mensagens.referenciaInvalida('O turno'), 'turnoId');
  const espaco = buscarAtivo(contexto.espacos, entrada.espacoId);
  if (!espaco) erro('REFERENCIA_INVALIDA', mensagens.referenciaInvalida('O espaço'), 'espacoId');
  const pacote = buscarAtivo(contexto.pacotes, entrada.pacoteId);
  if (!pacote) erro('REFERENCIA_INVALIDA', mensagens.referenciaInvalida('O pacote'), 'pacoteId');

  // Data --------------------------------------------------------------------
  const dataValida = dataCivilValida(entrada.data) && dataCivilValida(entrada.hoje);
  if (!dataValida) {
    erro('DATA_INVALIDA', mensagens.dataInvalida(), 'data');
  } else if (compararDatas(entrada.data, entrada.hoje) < 0) {
    erro('DATA_PASSADA', mensagens.dataPassada(), 'data');
  } else if (compararDatas(entrada.data, somarDias(entrada.hoje, regras.antecedenciaMinDias)) < 0) {
    const msg = mensagens.antecedencia(regras.antecedenciaMinDias);
    if (interno) aviso('ANTECEDENCIA_MINIMA', msg);
    else erro('ANTECEDENCIA_MINIMA', msg, 'data');
  }
  if (dataValida && turno && !turno.diasSemana.includes(diaDaSemanaNumero(entrada.data))) {
    erro(
      'TURNO_INDISPONIVEL_NO_DIA',
      mensagens.turnoIndisponivel(turno.nome, diaDaSemana(entrada.data)),
      'turnoId',
    );
  }

  // 1. Convidados -------------------------------------------------------------
  const contagem = contarConvidados(
    contexto,
    pacote?.id ?? null,
    entrada.adultos,
    entrada.criancas,
  );
  for (const i of contagem.faixasInvalidas) {
    erro('REFERENCIA_INVALIDA', mensagens.referenciaInvalida('A faixa de idade'), `criancas.${i}`);
  }
  const eq = contagem.equivalentes;

  // 2. Validações do pacote e do espaço ---------------------------------------
  if (pacote && tipo && !pacoteValeParaTipo(pacote, tipo.id)) {
    erro(
      'TIPO_EVENTO_INCOMPATIVEL',
      mensagens.tipoIncompativel(pacote.nome, tipo.nome),
      'pacoteId',
    );
  }
  if (pacote && eq < pacote.minConvidados) {
    erro(
      'CONVIDADOS_ABAIXO_MINIMO',
      mensagens.abaixoMinimo(pacote.nome, pacote.minConvidados),
      'adultos',
    );
  }
  if (pacote && pacote.maxConvidados !== null && eq > pacote.maxConvidados) {
    erro(
      'CONVIDADOS_ACIMA_MAXIMO',
      mensagens.acimaMaximo(pacote.nome, pacote.maxConvidados),
      'adultos',
    );
  }
  if (espaco && contagem.pessoasFisicas > espaco.capacidadeMax) {
    erro('CAPACIDADE_ESPACO', mensagens.capacidade(espaco.nome, espaco.capacidadeMax), 'espacoId');
  }

  // 3. Pacote -----------------------------------------------------------------
  let linhaPacote: LinhaOrcamento | null = null;
  if (pacote) {
    const valor = valorDoPacote(pacote, eq);
    if (!valor) {
      erro(
        'REFERENCIA_INVALIDA',
        mensagens.referenciaInvalida(`O preço do pacote ${pacote.nome}`),
        'pacoteId',
      );
    } else {
      linhaPacote = {
        tipo: 'pacote',
        referenciaId: pacote.id,
        descricao: `Pacote ${pacote.nome}`,
        quantidade: valor.quantidade,
        valorUnitarioCentavos: valor.valorUnitarioCentavos,
        subtotalCentavos: valor.subtotalCentavos,
        detalhe: valor.detalhe,
      };
    }
  }

  // 5. Opcionais (calculados antes do ajuste, que pode incidir sobre eles) ------
  const linhasOpcionais: LinhaOrcamento[] = [];
  const vistos = new Set<string>();
  entrada.opcionais.forEach((item, i) => {
    const campo = `opcionais.${i}`;
    const opcional = buscarAtivo(contexto.opcionais, item.opcionalId);
    if (!opcional || vistos.has(item.opcionalId)) {
      erro('REFERENCIA_INVALIDA', mensagens.referenciaInvalida('O opcional'), campo);
      return;
    }
    vistos.add(opcional.id);
    if (pacote && opcional.pacotesInclusoIds.includes(pacote.id)) {
      erro('OPCIONAL_JA_INCLUSO', mensagens.opcionalIncluso(opcional.nome, pacote.nome), campo);
      return;
    }
    const foraDoPacote =
      pacote &&
      opcional.pacotesCompativeisIds.length > 0 &&
      !opcional.pacotesCompativeisIds.includes(pacote.id);
    const foraDoTipo =
      tipo && opcional.tiposEventoIds.length > 0 && !opcional.tiposEventoIds.includes(tipo.id);
    if (foraDoPacote || foraDoTipo) {
      erro('OPCIONAL_INCOMPATIVEL', mensagens.opcionalIncompativel(opcional.nome), campo);
      return;
    }
    if (
      item.quantidade < opcional.qtdMin ||
      (opcional.qtdMax !== null && item.quantidade > opcional.qtdMax)
    ) {
      erro(
        'OPCIONAL_QUANTIDADE',
        mensagens.opcionalQuantidade(opcional.nome, opcional.qtdMin, opcional.qtdMax),
        campo,
      );
      return;
    }
    linhasOpcionais.push(descreverOpcional(opcional, item.quantidade, eq));
  });
  const totalOpcionais = linhasOpcionais.reduce((s, l) => s + l.subtotalCentavos, 0);

  // 4. Ajuste de dia ------------------------------------------------------------
  let linhaAjuste: LinhaOrcamento | null = null;
  if (linhaPacote && dataValida) {
    const escolhido = escolherAjusteDia(contexto, entrada.data, turno?.id ?? null);
    if (escolhido && escolhido.ajuste.ajusteBp !== 0) {
      const sobreOpcionais = regras.ajusteIncide === 'pacote_opcionais';
      const base = linhaPacote.subtotalCentavos + (sobreOpcionais ? totalOpcionais : 0);
      const valor = pctBp(base, escolhido.ajuste.ajusteBp);
      linhaAjuste = {
        tipo: 'ajuste_dia',
        referenciaId: escolhido.ajuste.id,
        descricao: escolhido.descricao,
        quantidade: 1,
        valorUnitarioCentavos: valor,
        subtotalCentavos: valor,
        detalhe:
          `${formatBp(escolhido.ajuste.ajusteBp, { sinal: true })} sobre ` +
          `${sobreOpcionais ? 'pacote e opcionais' : 'o pacote'} (${formatBRL(base)})`,
      };
    }
  }

  // 6. Horas extras ---------------------------------------------------------------
  let linhaHoraExtra: LinhaOrcamento | null = null;
  if (pacote && entrada.horasExtras > 0) {
    linhaHoraExtra = {
      tipo: 'hora_extra',
      referenciaId: pacote.id,
      descricao: 'Hora extra',
      quantidade: entrada.horasExtras,
      valorUnitarioCentavos: pacote.valorHoraExtraCentavos,
      subtotalCentavos: entrada.horasExtras * pacote.valorHoraExtraCentavos,
      detalhe: `${entrada.horasExtras} h × ${formatBRL(pacote.valorHoraExtraCentavos)}`,
    };
  }

  // 7. Deslocamento ---------------------------------------------------------------
  let linhaDeslocamento: LinhaOrcamento | null = null;
  if (espaco?.noLocalDoCliente && regras.deslocamentoModelo !== 'nenhum') {
    if (entrada.distanciaKm === undefined) {
      erro('DISTANCIA_OBRIGATORIA', mensagens.distanciaObrigatoria(), 'distanciaKm');
    } else {
      const km = Math.ceil(entrada.distanciaKm);
      if (regras.deslocamentoModelo === 'por_km') {
        const cobrados = Math.max(0, km - regras.deslocamentoKmGratis);
        linhaDeslocamento = {
          tipo: 'deslocamento',
          descricao: 'Deslocamento',
          quantidade: cobrados,
          valorUnitarioCentavos: regras.deslocamentoValorKmCentavos,
          subtotalCentavos: cobrados * regras.deslocamentoValorKmCentavos,
          detalhe:
            cobrados === 0
              ? `${km} km (grátis até ${regras.deslocamentoKmGratis} km)`
              : `${km} km − ${regras.deslocamentoKmGratis} km grátis = ${cobrados} km × ` +
                formatBRL(regras.deslocamentoValorKmCentavos),
        };
      } else {
        const faixas = [...contexto.faixasDeslocamento].sort((a, b) => a.ateKm - b.ateKm);
        const faixa = faixas.find((f) => f.ateKm >= km);
        if (faixa) {
          linhaDeslocamento = {
            tipo: 'deslocamento',
            descricao: 'Deslocamento',
            quantidade: 1,
            valorUnitarioCentavos: faixa.valorCentavos,
            subtotalCentavos: faixa.valorCentavos,
            detalhe: `${km} km: faixa até ${faixa.ateKm} km`,
          };
        } else {
          const msg = mensagens.foraArea(faixas.at(-1)?.ateKm ?? 0);
          if (interno) aviso('FORA_AREA_ATENDIMENTO', msg);
          else erro('FORA_AREA_ATENDIMENTO', msg, 'distanciaKm');
        }
      }
    }
  }

  // 8. Itens avulsos (só interno) -------------------------------------------------
  const linhasAvulsas: LinhaOrcamento[] = [];
  const avulsos = entrada.itensAvulsos ?? [];
  if (avulsos.length > 0 && !interno) {
    erro('CANAL_NAO_PERMITE', mensagens.canalNaoPermite(), 'itensAvulsos');
  } else {
    for (const item of avulsos) {
      linhasAvulsas.push({
        tipo: 'avulso',
        descricao: item.descricao,
        quantidade: item.quantidade,
        valorUnitarioCentavos: item.valorUnitarioCentavos,
        subtotalCentavos: item.quantidade * item.valorUnitarioCentavos,
        detalhe: `${item.quantidade} × ${formatBRL(item.valorUnitarioCentavos)}`,
      });
    }
  }

  // 9. Subtotal -----------------------------------------------------------------------
  const linhasSemDesconto = [
    linhaPacote,
    linhaAjuste,
    ...linhasOpcionais,
    linhaHoraExtra,
    linhaDeslocamento,
    ...linhasAvulsas,
  ].filter((l): l is LinhaOrcamento => l !== null);
  const subtotal = linhasSemDesconto.reduce((s, l) => s + l.subtotalCentavos, 0);

  // 10. Desconto (só interno) ---------------------------------------------------------
  let desconto = 0;
  let linhaDesconto: LinhaOrcamento | null = null;
  if (entrada.desconto && !interno) {
    erro('CANAL_NAO_PERMITE', mensagens.canalNaoPermite(), 'desconto');
  } else if (entrada.desconto) {
    const limiteBp = entrada.limiteDescontoBp ?? 0;
    const pedido =
      entrada.desconto.tipo === 'percentual'
        ? pctBp(subtotal, entrada.desconto.bp)
        : entrada.desconto.centavos;
    const acimaDoLimite =
      entrada.desconto.tipo === 'percentual'
        ? entrada.desconto.bp > limiteBp
        : pedido > pctBp(subtotal, limiteBp);
    if (acimaDoLimite)
      erro('DESCONTO_ACIMA_LIMITE', mensagens.descontoAcimaLimite(limiteBp), 'desconto');
    desconto = Math.min(pedido, subtotal);
    if (pedido > subtotal) aviso('DESCONTO_LIMITADO_AO_SUBTOTAL', mensagens.descontoLimitado());
    if (desconto > 0) {
      linhaDesconto = {
        tipo: 'desconto',
        descricao: 'Desconto',
        quantidade: 1,
        valorUnitarioCentavos: -desconto,
        subtotalCentavos: -desconto,
        detalhe:
          entrada.desconto.tipo === 'percentual'
            ? `${formatBp(entrada.desconto.bp)} sobre ${formatBRL(subtotal)}`
            : 'Valor fixo',
      };
    }
  }

  // 11 a 14. Total, por convidado, sinal, saldo e parcelas -----------------------------
  const total = subtotal - desconto;
  const porConvidado = eq > 0 ? dividirArredondando(total, eq) : 0;
  const sinal = pctBp(total, regras.sinalBp);
  const saldo = total - sinal;
  const plano = dataValida
    ? calcularParcelas(
        saldo,
        entrada.data,
        entrada.hoje,
        regras.parcelasMax,
        regras.prazoUltimaParcelaDias,
      )
    : { parcelas: [], prazoCurto: false };
  if (plano.prazoCurto) aviso('PRAZO_PARCELAS_CURTO', mensagens.prazoCurto());

  return {
    versaoMotor: VERSAO_MOTOR,
    ok: erros.length === 0,
    erros,
    avisos,
    convidadosEquivalentes: eq,
    pessoasFisicas: contagem.pessoasFisicas,
    linhas: linhaDesconto ? [...linhasSemDesconto, linhaDesconto] : linhasSemDesconto,
    subtotalCentavos: subtotal,
    descontoCentavos: desconto,
    totalCentavos: total,
    porConvidadoCentavos: porConvidado,
    sinalCentavos: sinal,
    saldoCentavos: saldo,
    parcelas: plano.parcelas,
  };
}
