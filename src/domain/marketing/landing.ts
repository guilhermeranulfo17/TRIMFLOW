import type { PlanoVitrine } from './precos-vitrine';

/*
 * Textos da landing completa (§95) que dependem do plano à venda ou viram dados estruturados:
 * o que o plano inclui e as dúvidas frequentes (a mesma lista na página e no JSON-LD FAQPage).
 * Só o que o produto faz hoje: nada de envio automático ao cliente, nada de número inventado.
 */

const de = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O que a mensalidade inclui, a partir dos limites do plano (nada fixo no código). */
export function itensDoPlanoNaLanding(p: PlanoVitrine | null): string[] {
  const variaveis = p
    ? [
        `Até ${de(p.maxUsuarios, 'usuário', 'usuários')} da equipe`,
        p.maxEspacos === null ? 'Espaços ilimitados' : `${de(p.maxEspacos, 'espaço', 'espaços')}`,
        p.contratosMes === null
          ? 'Contratos digitais sem limite'
          : p.contratosMes !== undefined
            ? `${de(p.contratosMes, 'contrato digital', 'contratos digitais')} por mês`
            : 'Contratos digitais',
        p.whatsappAvisos ? 'Avisos no celular e no WhatsApp' : 'Avisos no celular',
        p.followUp ? 'Tarefas automáticas de retorno' : null,
      ]
    : [];
  return [
    'Link de orçamento e página do buffet',
    'Propostas em PDF com a sua marca',
    'Agenda com pré-reserva',
    ...variaveis,
    'Pagamentos da festa e Números',
  ].filter((x): x is string => x !== null);
}

export type Duvida = { pergunta: string; resposta: string };

/** Dúvidas frequentes. `p` = plano à venda (para dizer quantas pessoas usam). */
export function duvidasDaLanding(p: PlanoVitrine | null, diasTeste: number): Duvida[] {
  return [
    {
      pergunta: 'Preciso de cartão para testar?',
      resposta: `Não. São ${diasTeste} dias grátis com tudo liberado. No fim do teste você decide se assina.`,
    },
    {
      pergunta: 'Quanto trabalho dá para começar?',
      resposta:
        'A conta já nasce com o modelo do seu tipo de buffet: pacotes, extras e regras de exemplo. Você troca pelos seus preços e publica o link. A implantação assistida é grátis e combinada com você antes.',
    },
    {
      pergunta: 'Meu cliente precisa baixar aplicativo ou criar conta?',
      resposta:
        'Não. Ele abre o link do seu buffet no celular, monta o orçamento e o pedido chega organizado para você, com data, convidados, pacote e valor.',
    },
    {
      pergunta: 'O sistema conversa com o cliente sozinho?',
      resposta:
        'Não. O Orkestra organiza os pedidos, avisa a sua equipe e deixa as mensagens prontas. Quem conversa com o cliente é você, pelo seu WhatsApp.',
    },
    {
      pergunta: 'O preço que aparece no link é o meu?',
      resposta:
        'Sim. Você cadastra pacotes, extras e valores por dia da semana e feriado. Só vai para o link o preço que você confirmou, e você pode mostrar o valor exato, uma faixa ou só depois do contato.',
    },
    {
      pergunta: 'Quantas pessoas da equipe podem usar?',
      resposta: p
        ? `Até ${de(p.maxUsuarios, 'usuário', 'usuários')}. O vendedor vê só os próprios leads e não vê valores do financeiro.`
        : 'Você convida a sua equipe. O vendedor vê só os próprios leads e não vê valores do financeiro.',
    },
    {
      pergunta: 'O contrato digital vale?',
      resposta:
        'O cliente assina pelo celular com assinatura eletrônica simples, com código por e-mail e comprovante no PDF. Não usa certificado ICP-Brasil.',
    },
    {
      pergunta: 'Posso cancelar quando quiser?',
      resposta:
        'Pode. Você cancela pelo próprio painel, a qualquer momento, e o acesso continua até o fim do período já pago.',
    },
    {
      pergunta: 'Onde ficam os meus dados?',
      resposta:
        'Em servidores no Brasil. Você pode exportar tudo quando quiser e o sistema segue a LGPD: o buffet é o dono dos dados dos clientes.',
    },
  ];
}

/** JSON-LD FAQPage com as mesmas perguntas e respostas da página. */
export function jsonLdDuvidas(duvidas: Duvida[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: duvidas.map((d) => ({
      '@type': 'Question',
      name: d.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: d.resposta },
    })),
  };
}
