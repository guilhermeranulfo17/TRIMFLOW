/**
 * O que falta para o link público funcionar: ao menos um pacote ativo com preço, um tipo de
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
  }[];
  tiposEvento: { ativo: boolean }[];
  turnos: { ativo: boolean }[];
  espacos: { ativo: boolean }[];
};

export type CodigoPendencia =
  'SEM_PACOTE_COM_PRECO' | 'SEM_TIPO_EVENTO_ATIVO' | 'SEM_TURNO_ATIVO' | 'SEM_ESPACO_ATIVO';

export type Pendencia = {
  codigo: CodigoPendencia;
  mensagem: string;
  secao: 'catalogo' | 'agenda-config';
};

export function pacoteTemPreco(p: ResumoCatalogo['pacotes'][number]): boolean {
  return p.modeloPreco === 'por_pessoa'
    ? p.precoPessoaCentavos !== null
    : p.quantidadeFaixas > 0 && p.valorExcedenteCentavos !== null;
}

export function pendenciasDoLinkPublico(resumo: ResumoCatalogo): Pendencia[] {
  const pendencias: Pendencia[] = [];
  if (!resumo.pacotes.some((p) => p.ativo && pacoteTemPreco(p))) {
    pendencias.push({
      codigo: 'SEM_PACOTE_COM_PRECO',
      mensagem:
        'Nenhum pacote ativo com preço. Sem pacote, o cliente não consegue montar o orçamento.',
      secao: 'catalogo',
    });
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
