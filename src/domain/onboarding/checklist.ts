/*
 * Checklist "Seu link está X% pronto": calculado no servidor a partir do estado REAL da empresa
 * (nunca de marcações soltas, exceto "link na bio", que só o dono sabe). Os obrigatórios pesam
 * 3 e os de "vender melhor", 1. Cada item leva à tela que resolve.
 */

export type EstadoChecklist = {
  pacoteConfirmado: boolean;
  tipoEventoAtivo: boolean;
  espacoETurnoAtivos: boolean;
  logo: boolean;
  capa: boolean;
  sobre: boolean;
  /** Etapa 9.5: salvou algo no editor da página (frase, estilo, galeria…) */
  paginaPersonalizada: boolean;
  fotoEmPacote: boolean;
  /** todos os pacotes ativos com pelo menos uma seção de cardápio com itens */
  cardapioCompleto: boolean;
  /** sinal, parcelas e formas de pagamento preenchidos */
  condicoesPagamento: boolean;
  /** textos de cancelamento e de "não incluso" */
  textosProposta: boolean;
  /** razão social e CNPJ */
  dadosEmpresa: boolean;
  eventosNaAgenda: boolean;
  linkTestado: boolean;
  linkNaBio: boolean;
  pushAtivo: boolean;
  /** null = canal de WhatsApp não configurado no servidor (o item não aparece) */
  whatsappAvisos: boolean | null;
};

export type ChaveItem = keyof EstadoChecklist;

export type ItemChecklist = {
  chave: ChaveItem;
  titulo: string;
  obrigatorio: boolean;
  feito: boolean;
  href: string;
  /** o dono marca "Fiz" (não dá para verificar sozinho) */
  manual?: boolean;
};

const ITENS: Omit<ItemChecklist, 'feito'>[] = [
  {
    chave: 'pacoteConfirmado',
    titulo: 'Pelo menos 1 pacote com preço confirmado',
    obrigatorio: true,
    href: '/app/empresa/catalogo',
  },
  {
    chave: 'tipoEventoAtivo',
    titulo: 'Um tipo de festa ativo',
    obrigatorio: true,
    href: '/app/empresa/catalogo',
  },
  {
    chave: 'espacoETurnoAtivos',
    titulo: 'Um espaço e um turno ativos',
    obrigatorio: true,
    href: '/app/empresa/agenda-config',
  },
  { chave: 'logo', titulo: 'Logo do buffet', obrigatorio: false, href: '/app/empresa' },
  { chave: 'capa', titulo: 'Foto de capa', obrigatorio: false, href: '/app/empresa' },
  { chave: 'sobre', titulo: 'Texto "sobre" o buffet', obrigatorio: false, href: '/app/empresa' },
  {
    chave: 'paginaPersonalizada',
    titulo: 'Personalize sua página',
    obrigatorio: false,
    href: '/app/empresa/link#pagina',
  },
  {
    chave: 'fotoEmPacote',
    titulo: 'Foto em pelo menos 1 pacote',
    obrigatorio: false,
    href: '/app/empresa/catalogo',
  },
  {
    chave: 'cardapioCompleto',
    titulo: 'Cardápio em todos os pacotes ativos',
    obrigatorio: false,
    href: '/app/empresa/catalogo',
  },
  {
    chave: 'condicoesPagamento',
    titulo: 'Sinal, parcelas e formas de pagamento',
    obrigatorio: false,
    href: '/app/empresa/regras',
  },
  {
    chave: 'textosProposta',
    titulo: 'Textos de cancelamento e de "não incluso"',
    obrigatorio: false,
    href: '/app/empresa/regras',
  },
  {
    chave: 'dadosEmpresa',
    titulo: 'Razão social e CNPJ na proposta',
    obrigatorio: false,
    href: '/app/empresa',
  },
  {
    chave: 'eventosNaAgenda',
    titulo: 'Festas já fechadas registradas na Agenda',
    obrigatorio: false,
    href: '/app/agenda',
  },
  {
    chave: 'linkTestado',
    titulo: 'Testar o link como cliente',
    obrigatorio: false,
    href: '/app/empresa/link',
  },
  {
    chave: 'linkNaBio',
    titulo: 'Colocar o link na bio do Instagram',
    obrigatorio: false,
    href: '/app/empresa/link',
    manual: true,
  },
  {
    chave: 'pushAtivo',
    titulo: 'Ativar os avisos no celular',
    obrigatorio: false,
    href: '/app/conta/avisos',
  },
  {
    chave: 'whatsappAvisos',
    titulo: 'Receber avisos no WhatsApp',
    obrigatorio: false,
    href: '/app/conta/avisos',
  },
];

export const PESO_OBRIGATORIO = 3;
export const PESO_OPCIONAL = 1;

export type Checklist = {
  itens: ItemChecklist[];
  /** 0 a 100, inteiro */
  percentual: number;
  /** todos os obrigatórios feitos (o link funciona) */
  linkFunciona: boolean;
  completo: boolean;
  faltam: number;
};

export function calcularChecklist(estado: EstadoChecklist): Checklist {
  const itens = ITENS.filter((i) => estado[i.chave] !== null).map((i) => ({
    ...i,
    feito: estado[i.chave] === true,
  }));
  const peso = (i: ItemChecklist) => (i.obrigatorio ? PESO_OBRIGATORIO : PESO_OPCIONAL);
  const total = itens.reduce((s, i) => s + peso(i), 0);
  const feito = itens.reduce((s, i) => s + (i.feito ? peso(i) : 0), 0);
  // arredonda para baixo: só mostra 100% quando está tudo feito
  const percentual = total === 0 ? 100 : Math.floor((feito * 100) / total);
  const faltam = itens.filter((i) => !i.feito).length;
  return {
    itens,
    percentual,
    linkFunciona: itens.filter((i) => i.obrigatorio).every((i) => i.feito),
    completo: faltam === 0,
    faltam,
  };
}
