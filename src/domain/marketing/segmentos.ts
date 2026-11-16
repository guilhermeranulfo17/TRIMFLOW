import type { Duvida } from './landing';

/*
 * Páginas por tipo de buffet (§98, SEO): uma página para cada busca que o dono de buffet faz no
 * Google ("sistema para buffet infantil", "sistema para buffet de casamento"...). Cada uma tem
 * título, descrição e texto próprios, só com o que o produto faz hoje (sem número inventado,
 * sem depoimento, sem travessão). O resto da página reaproveita as seções da landing.
 */

export type ChaveSegmento = 'infantil' | 'casamento' | 'eventos' | 'domicilio';

export type PaginaSegmento = {
  chave: ChaveSegmento;
  /** caminho da página, sem barra no fim */
  caminho: `/${string}`;
  /** rótulo curto (rodapé e "para quem é" da landing) */
  rotulo: string;
  /** <title> (até 60 caracteres, para o Google não cortar) */
  titulo: string;
  /** meta description (até 160 caracteres) */
  descricao: string;
  /** h1 da página */
  h1: string;
  /** parágrafo de abertura */
  abertura: string;
  /** o que o sistema faz por esse tipo de buffet */
  recursos: { titulo: string; texto: string }[];
  /** festas que o modelo já traz cadastradas */
  festas: string[];
  /** dúvidas próprias (vão antes das dúvidas gerais e no JSON-LD) */
  duvidas: Duvida[];
};

export const PAGINAS_SEGMENTO: readonly PaginaSegmento[] = [
  {
    chave: 'infantil',
    caminho: '/sistema-para-buffet-infantil',
    rotulo: 'Buffet infantil',
    titulo: 'Sistema para buffet infantil com orçamento online | Orkestra',
    descricao:
      'Sistema para buffet infantil: os pais montam o orçamento da festa no seu link, com preço por idade das crianças, e o pedido chega no seu WhatsApp.',
    h1: 'Sistema para buffet infantil',
    abertura:
      'Os pais escolhem a data, o pacote e quantas crianças vão, e veem o preço na hora, no link do seu buffet. Você recebe o pedido pronto no WhatsApp e cuida da agenda, da proposta e do contrato no mesmo lugar.',
    recursos: [
      {
        titulo: 'Preço por idade das crianças',
        texto:
          'Você define as faixas de idade, por exemplo até 5 anos não paga e de 6 a 10 paga meia. O link calcula sozinho.',
      },
      {
        titulo: 'Agenda por turno',
        texto:
          'Almoço, tarde e noite, cada um com o seu horário. O link só oferece data e turno livres e nunca vende o mesmo horário duas vezes.',
      },
      {
        titulo: 'Pacotes e adicionais',
        texto:
          'Seus pacotes com o cardápio e os adicionais, como bolo e doces, com o preço que você digitou.',
      },
      {
        titulo: 'Pré-reserva e visita',
        texto:
          'O cliente pede a pré-reserva ou a visita ao salão pelo link, e o pedido entra na sua lista de leads.',
      },
    ],
    festas: ['Aniversário infantil', 'Chá revelação', 'Batizado'],
    duvidas: [
      {
        pergunta: 'Dá para cobrar diferente por idade da criança?',
        resposta:
          'Sim. Você cria as faixas de idade e quanto cada uma paga do valor por pessoa. Quem monta o orçamento informa as idades e o preço já sai certo.',
      },
      {
        pergunta: 'O buffet infantil já começa com os pacotes cadastrados?',
        resposta:
          'O cadastro já traz um modelo de buffet infantil com festas, turnos e pacotes de exemplo. Você troca os preços pelos seus antes de divulgar o link.',
      },
    ],
  },
  {
    chave: 'casamento',
    caminho: '/sistema-para-buffet-de-casamento',
    rotulo: 'Casamento e 15 anos',
    titulo: 'Sistema para buffet de casamento e 15 anos | Orkestra',
    descricao:
      'Sistema para buffet de casamento e 15 anos: orçamento online no seu link, proposta com a sua marca, contrato assinado no celular e parcelas da festa.',
    h1: 'Sistema para buffet de casamento e 15 anos',
    abertura:
      'Os noivos e as famílias montam o orçamento da recepção no seu link e pedem a visita ao salão. Do primeiro contato ao último pagamento, tudo fica no mesmo lugar.',
    recursos: [
      {
        titulo: 'Proposta com a sua marca',
        texto:
          'A proposta sai com o seu logo, o cardápio e as condições de pagamento, em página e em PDF, e você vê quando o cliente abriu.',
      },
      {
        titulo: 'Contrato assinado no celular',
        texto:
          'O contrato é montado a partir do orçamento e o cliente assina pelo celular, com código no e-mail e comprovante em PDF.',
      },
      {
        titulo: 'Parcelas e recebimentos',
        texto:
          'Plano de pagamento da festa, parcelas pagas e atrasadas e o que falta receber, festa por festa.',
      },
      {
        titulo: 'Visita ao salão',
        texto:
          'O casal pede a visita pelo link, você confirma e ela aparece na agenda e nas tarefas do dia.',
      },
    ],
    festas: ['Casamento', '15 anos', 'Bodas'],
    duvidas: [
      {
        pergunta: 'Posso mandar a proposta depois da visita?',
        resposta:
          'Pode. Você monta o orçamento pelo painel, ajusta o que combinou na visita e envia a proposta. Cada mudança vira uma versão nova e a anterior fica guardada.',
      },
      {
        pergunta: 'O contrato digital tem validade?',
        resposta:
          'O cliente confirma o nome, o CPF e um código enviado ao e-mail dele. O Orkestra guarda o texto assinado e um comprovante com a data e a hora da assinatura.',
      },
    ],
  },
  {
    chave: 'eventos',
    caminho: '/sistema-para-buffet-de-eventos',
    rotulo: 'Eventos e corporativo',
    titulo: 'Sistema para buffet de eventos e corporativo | Orkestra',
    descricao:
      'Sistema para buffet de eventos, formaturas e corporativo: orçamento online, agenda do salão, proposta, contrato e funil de vendas em um lugar só.',
    h1: 'Sistema para buffet de eventos e corporativo',
    abertura:
      'Formaturas, confraternizações e eventos de empresa pedem resposta rápida. O cliente vê o preço no seu link, você acompanha cada pedido no funil e não perde prazo de retorno.',
    recursos: [
      {
        titulo: 'Preço por dia da semana',
        texto:
          'Desconto ou acréscimo por dia, para vender melhor a quinta e o domingo sem mexer no preço do sábado.',
      },
      {
        titulo: 'Funil de vendas',
        texto:
          'Cada pedido entra como lead e anda pelas etapas: novo, em conversa, proposta e pré-reserva. Você vê onde cada um parou.',
      },
      {
        titulo: 'Retorno na hora certa',
        texto:
          'Tarefas automáticas lembram de chamar quem recebeu a proposta e não respondeu, com a mensagem pronta para o WhatsApp.',
      },
      {
        titulo: 'Equipe de vendas',
        texto:
          'Vendedores com acesso próprio, cada um com os seus leads, e o dono vendo tudo e os números do período.',
      },
    ],
    festas: ['Formatura', 'Corporativo', 'Casamento', '15 anos'],
    duvidas: [
      {
        pergunta: 'Dá para ter mais de um vendedor?',
        resposta:
          'Sim. O dono cria o acesso de cada vendedor. O vendedor vê os próprios leads e o dono vê todos, com os números de cada um.',
      },
      {
        pergunta: 'O cliente vê o desconto que eu dou?',
        resposta:
          'O desconto entra no orçamento feito pelo painel, dentro do limite que você definir para cada vendedor. O link público sempre mostra a sua tabela.',
      },
    ],
  },
  {
    chave: 'domicilio',
    caminho: '/sistema-para-buffet-em-domicilio',
    rotulo: 'Buffet em domicílio',
    titulo: 'Sistema para buffet em domicílio e churrasco | Orkestra',
    descricao:
      'Sistema para buffet em domicílio: o cliente escolhe os itens da festa no seu link, a quantidade sai pelo número de convidados e o pedido chega no WhatsApp.',
    h1: 'Sistema para buffet em domicílio',
    abertura:
      'Salgados, churrasco, massas, bebidas e garçom: o cliente monta a festa item por item no seu link, sem você mandar cardápio em PDF. A quantidade e o valor saem pelo número de convidados.',
    recursos: [
      {
        titulo: 'Orçamento por itens',
        texto:
          'Para quem não vende pacote: o cliente escolhe os itens que quer e vê o total. Você pode vender por pacote, por item ou dos dois jeitos.',
      },
      {
        titulo: 'Quantidade por convidado',
        texto:
          'Você diz quanto vai por pessoa, por exemplo 12 salgados, e o sistema calcula para a festa. O cliente vê o valor, não a sua conta.',
      },
      {
        titulo: 'Pedido mínimo e deslocamento',
        texto:
          'Defina um pedido mínimo e a taxa de deslocamento por quilômetro, para a festa no local do cliente sair no preço certo.',
      },
      {
        titulo: 'Agenda da equipe',
        texto: 'Almoço e noite em qualquer dia da semana, sem vender o mesmo turno duas vezes.',
      },
    ],
    festas: ['Aniversário', 'Churrasco', 'Confraternização', 'Corporativo'],
    duvidas: [
      {
        pergunta: 'Funciona para quem não trabalha com pacote?',
        resposta:
          'Funciona. Em Regras de venda você escolhe vender só por itens, e o link mostra "Monte sua festa" no lugar dos pacotes.',
      },
      {
        pergunta: 'Dá para ter preço diferente conforme o número de convidados?',
        resposta:
          'Sim. O item pode ter faixas de preço pela quantidade de convidados, e também pode ter um pedido mínimo para a festa.',
      },
    ],
  },
];

export function paginaDoSegmento(chave: ChaveSegmento): PaginaSegmento {
  const p = PAGINAS_SEGMENTO.find((s) => s.chave === chave);
  if (!p) throw new Error(`Segmento sem página: ${chave}`);
  return p;
}
