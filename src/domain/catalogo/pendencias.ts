/**
 * O que falta para o link público funcionar: ao menos um pacote ativo com preço CONFIRMADO pelo
 * dono (Etapa 8: preço de exemplo do modelo não conta) ou, vendendo por itens (§96), um item
 * vendável sem pacote com preço confirmado (ou o preço da festa por faixa), um tipo de
 * festa ativo (o motor exige o tipo), um turno ativo e um espaço ativo. Alimenta os badges do
 * menu Minha empresa.
 */

export type ResumoCatalogo = {
  pacotes: {
    ativo: boolean;
    modeloPreco: 'por_pessoa' | 'por_faixa';
    precoPessoaCentavos: number | null;
    valorExcedenteCentavos: number | null;
    quantidadeFaixas: number;
    /** O dono confirmou o preço (preco_confirmado_em preenchido). */
    precoConfirmado: boolean;
  }[];
  tiposEvento: { ativo: boolean }[];
  turnos: { ativo: boolean }[];
  espacos: { ativo: boolean }[];
  /**
   * Jeito de vender (§96). Ausente = só pacotes. `itensComPreco`: algum opcional ativo, com preço
   * confirmado e sem ligação de "compatível" com pacote (vendável sem pacote); `festaComPreco`:
   * a empresa tem faixas de preço da festa por pessoa.
   */
  venda?: { modo: 'pacotes' | 'itens' | 'ambos'; itensComPreco: boolean; festaComPreco: boolean };
};

export type CodigoPendencia =
  | 'SEM_PACOTE_COM_PRECO'
  | 'SEM_ITEM_COM_PRECO'
  | 'SEM_TIPO_EVENTO_ATIVO'
  | 'SEM_TURNO_ATIVO'
  | 'SEM_ESPACO_ATIVO';

export type Pendencia = {
  codigo: CodigoPendencia;
  mensagem: string;
  secao: 'catalogo' | 'agenda-config';
};

export function pacoteTemPreco(p: ResumoCatalogo['pacotes'][number]): boolean {
  if (!p.precoConfirmado) return false;
  return p.modeloPreco === 'por_pessoa'
    ? p.precoPessoaCentavos !== null
    : p.quantidadeFaixas > 0 && p.valorExcedenteCentavos !== null;
}

export function pendenciasDoLinkPublico(resumo: ResumoCatalogo): Pendencia[] {
  const pendencias: Pendencia[] = [];
  const modo = resumo.venda?.modo ?? 'pacotes';
  const temPacote = resumo.pacotes.some((p) => p.ativo && pacoteTemPreco(p));
  const temItens = !!resumo.venda && (resumo.venda.itensComPreco || resumo.venda.festaComPreco);
  // no "os dois", basta um dos jeitos funcionar
  const vende =
    modo === 'pacotes' ? temPacote : modo === 'itens' ? temItens : temPacote || temItens;
  if (!vende) {
    pendencias.push(
      modo === 'pacotes'
        ? {
            codigo: 'SEM_PACOTE_COM_PRECO',
            mensagem:
              'Nenhum pacote ativo com preço confirmado. Sem pacote, o cliente não consegue montar o orçamento.',
            secao: 'catalogo',
          }
        : modo === 'itens'
          ? {
              codigo: 'SEM_ITEM_COM_PRECO',
              mensagem:
                'Nenhum item ativo com preço confirmado. Cadastre os itens (opcionais) que o cliente pode escolher.',
              secao: 'catalogo',
            }
          : {
              codigo: 'SEM_PACOTE_COM_PRECO',
              mensagem:
                'Nenhum pacote nem item ativo com preço confirmado. Sem eles, o cliente não consegue montar o orçamento.',
              secao: 'catalogo',
            },
    );
  }
  if (!resumo.tiposEvento.some((t) => t.ativo)) {
    pendencias.push({
      codigo: 'SEM_TIPO_EVENTO_ATIVO',
      mensagem:
        'Nenhum tipo de festa ativo. Cadastre pelo menos um (ex.: aniversário infantil) no Catálogo.',
      secao: 'catalogo',
    });
  }
  if (!resumo.turnos.some((t) => t.ativo)) {
    pendencias.push({
      codigo: 'SEM_TURNO_ATIVO',
      mensagem: 'Nenhum turno ativo. Sem turno, o cliente não consegue escolher horário.',
      secao: 'agenda-config',
    });
  }
  if (!resumo.espacos.some((e) => e.ativo)) {
    pendencias.push({
      codigo: 'SEM_ESPACO_ATIVO',
      mensagem: 'Nenhum espaço ativo. Cadastre onde as festas acontecem.',
      secao: 'agenda-config',
    });
  }
  return pendencias;
}
