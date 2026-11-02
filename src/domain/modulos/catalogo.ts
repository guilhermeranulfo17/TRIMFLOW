/*
 * Textos das soluções adicionais ("Nossas soluções"). Preço, periodicidade e liberação de venda
 * vêm do banco (public.modulos); aqui fica o que o cliente lê e o que falta para vender.
 *
 * Um módulo só pode ser contratado quando:
 *   - está implementado (entrega principal, autorização no servidor, primeiro uso) e sem
 *     pendência técnica aqui (`prontoParaVenda`), E
 *   - o banco tem venda_liberada = true (decisão comercial: condições, limites e políticas).
 * O servidor confere as duas coisas antes de criar qualquer cobrança.
 */

export const CODIGOS_MODULO = [
  'orkflow',
  'orkmargem',
  'orkstage',
  'orkpass',
  'orkpay',
  'orkbis',
] as const;
export type CodigoModulo = (typeof CODIGOS_MODULO)[number];

export const ehCodigoModulo = (v: unknown): v is CodigoModulo =>
  typeof v === 'string' && (CODIGOS_MODULO as readonly string[]).includes(v);

export type TextoModulo = {
  codigo: CodigoModulo;
  nome: string;
  /** frase curta da tabela comercial */
  descricaoCurta: string;
  /** benefício principal (título do cartão) */
  beneficio: string;
  /** breve explicação do cartão */
  explicacao: string;
  /** três entregas concretas */
  entregas: [string, string, string];
  problema: string;
  comoFunciona: string[];
  incluso: string[];
  limites: string[];
  /** custos fora do preço do módulo (provedores, mensagens…) */
  custosExternos: string[];
  /** o que já existe no plano e NÃO é cobrado de novo */
  jaNoPlano: string[];
  foraDoEscopo: string[];
  /** a entrega existe no sistema (tabelas, telas e regras do módulo) */
  implementado: boolean;
  /** o que falta construir ou integrar antes de cobrar (vazio = pronto tecnicamente) */
  pendenciasTecnicas: string[];
  /** decisões comerciais que o dono do produto precisa tomar antes de liberar a venda */
  pendenciasComerciais: string[];
  /** onde o módulo é usado no dia a dia, depois de contratado */
  ondeUsar: { href: string; rotulo: string } | null;
  /** demonstração com dados fictícios na página de detalhes */
  temDemonstracao: boolean;
};

const POLITICAS_COMUNS = [
  'Confirmar a regra de cancelamento dos adicionais (proposta: como a assinatura-base, sem multa, com acesso até o fim do período pago).',
  'Confirmar que não há proporcionalidade na primeira cobrança (proposta: cobrança cheia no dia da contratação; o Asaas não calcula pró-rata).',
  'Definir a carência depois de um vencimento sem pagamento (hoje 0 dia: o acesso para no fim do período pago).',
  'Confirmar a política com a conta-base suspensa (proposta: o adicional fica só para consulta, como o resto do painel, e a cobrança continua até o cancelamento).',
];

export const MODULOS: Record<CodigoModulo, TextoModulo> = {
  orkflow: {
    codigo: 'orkflow',
    nome: 'OrkFlow',
    descricaoCurta: 'Retornos automáticos pelo WhatsApp',
    beneficio: 'Retornos enviados no momento certo',
    explicacao:
      'Usa os dados da negociação para enviar o retorno pelo WhatsApp oficial no prazo que você configurou, e para quando o cliente responde.',
    entregas: [
      'Retorno de proposta enviada sem resposta',
      'Confirmação de visita na véspera',
      'Aviso de pré-reserva perto de vencer',
    ],
    problema:
      'O retorno depende de alguém lembrar e ter tempo de escrever. Quando a equipe está ocupada, a proposta esfria e a pré-reserva vence sem contato.',
    comoFunciona: [
      'Parte das propostas, visitas e pré-reservas que já estão no Orkestra.',
      'Antes de cada envio, confere a situação atual do lead e cancela o que perdeu sentido.',
      'Para a sequência quando o cliente responde, quando a negociação muda ou quando você pausa.',
      'Registra envio, entrega, falha e resposta na ficha do lead, para o responsável continuar a conversa.',
    ],
    incluso: [
      'Três fluxos: proposta sem resposta, confirmação de visita e pré-reserva vencendo.',
      'Prazo, horário e texto dentro dos modelos aprovados no WhatsApp oficial.',
      'Pausa manual por lead.',
    ],
    limites: [
      'Franquia mensal de mensagens e preço do excedente ainda não definidos.',
      'Só modelos de mensagem aprovados pela Meta.',
    ],
    custosExternos: ['Conversas cobradas pela Meta no WhatsApp oficial, conforme a regra deles.'],
    jaNoPlano: [
      'As tarefas automáticas de follow-up e as mensagens prontas que a equipe envia (Profissional) continuam no plano, sem custo extra.',
    ],
    foraDoEscopo: [
      'Negociação autônoma',
      'Descontos decididos por IA',
      'Campanhas para listas',
      'Chatbot',
    ],
    implementado: false,
    pendenciasTecnicas: [
      'Envio ao cliente final pela Cloud API (hoje o WhatsApp oficial só avisa a equipe do buffet).',
      'Recebimento das respostas do cliente (webhook de entrada do WhatsApp) para pausar a sequência.',
      'Modelos de mensagem dos três fluxos aprovados na Meta.',
      'Registro de consentimento do cliente final para receber mensagens.',
    ],
    pendenciasComerciais: [
      'Definir a franquia mensal de mensagens e o preço do excedente.',
      'Decidir quem paga as conversas da Meta (repasse ou incluso).',
      'Revisar a regra do produto "nenhuma mensagem automática ao cliente final" e os Termos.',
      ...POLITICAS_COMUNS,
    ],
    ondeUsar: { href: '/app/leads', rotulo: 'Ir para Leads' },
    temDemonstracao: false,
  },
  orkmargem: {
    codigo: 'orkmargem',
    nome: 'OrkMargem',
    descricaoCurta: 'Custos e resultado financeiro por festa',
    beneficio: 'Quanto sobra de cada festa',
    explicacao:
      'Compare o valor vendido com os custos variáveis da festa, do previsto ao realizado, sem dezenas de lançamentos.',
    entregas: [
      'Custos previstos por pacote, copiados para cada festa',
      'Custo realizado e margem de contribuição por festa',
      'Comparação entre festas e pacotes',
    ],
    problema:
      'O preço do pacote é conhecido, mas o custo de cada festa fica em notas e na memória. Sem comparar previsto e realizado, é difícil saber quais pacotes deixam mais resultado.',
    comoFunciona: [
      'Você cadastra uma vez o custo previsto de cada pacote, por categoria: um valor fixo e um valor por convidado.',
      'Na festa confirmada, o Orkestra copia a previsão para o número de convidados da reserva.',
      'Depois da festa, você registra só as diferenças: o que não mudou, confirma com um toque.',
      'Ao fechar a festa, os valores ficam travados; reabrir pede um motivo e fica no histórico.',
    ],
    incluso: [
      'Categorias: alimentação, bebidas, equipe, decoração, terceiros, descartáveis, taxas e outros custos variáveis.',
      'Receita contratada, valor recebido, custo previsto e custo realizado, separados.',
      'Margem de contribuição prevista e realizada, por festa e por pacote.',
      'Pendências: festas sem previsão, custos sem valor realizado e festas passadas sem fechamento.',
    ],
    limites: [
      'Margem de contribuição não é lucro líquido: custos fixos (aluguel, salários fixos, impostos sobre o faturamento) não entram.',
      'Valor a receber não é dinheiro em caixa: o recebido vem do Financeiro.',
      'Só o dono vê valores e custos.',
    ],
    custosExternos: [],
    jaNoPlano: [
      'Plano de pagamento, recebimentos e atrasos de cada festa (Financeiro) continuam no plano.',
    ],
    foraDoEscopo: ['Estoque', 'Contabilidade', 'Emissão fiscal', 'Ficha técnica de receitas'],
    implementado: true,
    pendenciasTecnicas: [],
    pendenciasComerciais: POLITICAS_COMUNS,
    ondeUsar: { href: '/app/margem', rotulo: 'Abrir OrkMargem' },
    temDemonstracao: true,
  },
  orkstage: {
    codigo: 'orkstage',
    nome: 'OrkStage',
    descricaoCurta: 'Organização da operação da festa',
    beneficio: 'A festa vendida vira ficha de operação',
    explicacao:
      'Uma ficha por festa com cardápio, opcionais, checklist e tarefas para quem executa, sem expor contrato nem valores.',
    entregas: [
      'Ficha da festa a partir da reserva e do pacote',
      'Checklist e tarefas com responsável e prazo',
      'Cronograma simples e ficha para imprimir',
    ],
    problema:
      'O que foi vendido chega à cozinha e à recepção por mensagens soltas. Mudanças de última hora se perdem e a equipe descobre na hora.',
    comoFunciona: [
      'A ficha nasce da reserva confirmada e do pacote vendido.',
      'Cada função vê só o que precisa: coordenação, cozinha, recepção ou equipe.',
      'Alterações relevantes ficam registradas na ficha.',
    ],
    incluso: [
      'Cardápio, opcionais e orientações da festa.',
      'Checklist por pacote e tarefas com responsável, prazo e status.',
      'Visão das pendências antes do evento e impressão da ficha.',
    ],
    limites: ['Usuários de operação contam no limite de usuários do plano (a definir).'],
    custosExternos: [],
    jaNoPlano: ['A Agenda, as reservas e as tarefas comerciais continuam no plano.'],
    foraDoEscopo: [
      'Folha de pagamento',
      'Contratação de freelancers',
      'Marketplace de profissionais',
      'Gestão de fornecedores',
    ],
    implementado: false,
    pendenciasTecnicas: [
      'Perfis de operação (coordenação, cozinha, recepção, equipe): hoje o sistema só tem dono e vendedor.',
      'Ficha operacional, checklist por pacote, cronograma e impressão.',
    ],
    pendenciasComerciais: [
      'Decidir se usuários de operação contam no limite de usuários do plano.',
      ...POLITICAS_COMUNS,
    ],
    ondeUsar: { href: '/app/agenda', rotulo: 'Ir para a Agenda' },
    temDemonstracao: false,
  },
  orkpass: {
    codigo: 'orkpass',
    nome: 'OrkPass',
    descricaoCurta: 'Convites, confirmações e portaria',
    beneficio: 'Do convite à presença na portaria',
    explicacao:
      'Convite com link de confirmação para cada família, QR code e check-in na portaria, ligado à festa cadastrada.',
    entregas: [
      'Convite e link individual de confirmação',
      'QR code e check-in sem entrada duplicada',
      'Contratados, confirmados e presentes lado a lado',
    ],
    problema:
      'A lista de convidados chega em papel ou planilha, as confirmações ficam no WhatsApp da família e a portaria não sabe quem já entrou.',
    comoFunciona: [
      'Ativado para uma festa específica: a compra vale só para ela.',
      'O contratante acessa só a própria festa, sem entrar no painel do buffet.',
      'Convidados não entram em nenhuma lista de marketing.',
    ],
    incluso: [
      'Convite a partir de modelos, com data, horário, endereço e orientações.',
      'Lista de famílias, adultos e crianças, prazo de resposta e estados de confirmação.',
      'Check-in por QR code ou busca e histórico de ajustes de contagem.',
    ],
    limites: [
      'Confirmação não garante comparecimento: o Orkestra não reduz compras nem produção sozinho.',
      'Período de acesso ao convite e à portaria ainda não definido.',
    ],
    custosExternos: [],
    jaNoPlano: [],
    foraDoEscopo: ['Convites sob medida', 'Editor gráfico', 'Jogos', 'Reconhecimento facial'],
    implementado: false,
    pendenciasTecnicas: [
      'Convite, confirmação pública, QR code e portaria (a compra por festa já existe no banco).',
      'Acesso do contratante só à própria festa (link próprio, sem conta no painel).',
    ],
    pendenciasComerciais: [
      'Definir por quantos dias depois da festa o convite e a portaria ficam acessíveis.',
      'Definir a política de reembolso de uma festa ativada e depois cancelada.',
    ],
    ondeUsar: { href: '/app/agenda', rotulo: 'Ir para a Agenda' },
    temDemonstracao: false,
  },
  orkpay: {
    codigo: 'orkpay',
    nome: 'OrkPay',
    descricaoCurta: 'Cobranças e recebimentos integrados',
    beneficio: 'Parcela vira cobrança e baixa sozinha',
    explicacao:
      'Gera a cobrança da parcela da festa por um provedor de pagamento, na conta do buffet, e registra o recebimento quando o provedor confirma.',
    entregas: [
      'Cobrança gerada a partir da parcela',
      'Recebimento registrado após confirmação do provedor',
      'Sem cobrança duplicada e com conciliação registrada',
    ],
    problema:
      'Cada parcela é cobrada à mão, o comprovante chega pelo WhatsApp e a baixa no controle depende de alguém conferir o extrato.',
    comoFunciona: [
      'Parte das parcelas que você já controla no Financeiro.',
      'O dinheiro da festa vai para a conta do buffet no provedor, nunca para a conta do Orkestra.',
      'A baixa só acontece com confirmação verificada do provedor.',
    ],
    incluso: [
      'Cobrança por parcela com valor, vencimento, situação e link.',
      'Registro de falhas, divergências e conciliação manual com histórico.',
      'Taxas do provedor mostradas antes da contratação.',
    ],
    limites: ['Meios de pagamento e taxas são os do provedor da conta do buffet.'],
    custosExternos: ['Taxas do provedor de pagamento por cobrança recebida.'],
    jaNoPlano: [
      'O plano de pagamento e o registro manual de recebimentos (Financeiro) continuam no plano.',
    ],
    foraDoEscopo: ['Crédito', 'Antecipação', 'Carteira financeira', 'Divisão de pagamento'],
    implementado: false,
    pendenciasTecnicas: [
      'Conta do buffet no provedor (subconta do Asaas com abertura e aprovação próprias); hoje o Asaas do Orkestra só cobra a assinatura do sistema.',
      'Cobrança por parcela, webhook da conta do buffet e conciliação.',
    ],
    pendenciasComerciais: [
      'Contratar com o Asaas o modelo de contas para clientes (subcontas) e as taxas repassadas.',
      'Definir as taxas mostradas ao buffet e quem paga cada uma.',
      ...POLITICAS_COMUNS,
    ],
    ondeUsar: { href: '/app/financeiro', rotulo: 'Ir para o Financeiro' },
    temDemonstracao: false,
  },
  orkbis: {
    codigo: 'orkbis',
    nome: 'OrkBis',
    descricaoCurta: 'Recompra e indicação de clientes',
    beneficio: 'Clientes de volta e indicações acompanhadas',
    explicacao:
      'Cria oportunidades a partir do histórico de festas e registra quem indicou quem, com tarefa para o responsável.',
    entregas: [
      'Oportunidade e tarefa antes da data relevante',
      'Indicação ligada ao cliente que indicou',
      'Contatos, propostas e reservas resultantes',
    ],
    problema:
      'Quem já fez uma festa costuma voltar ou indicar, mas ninguém lembra de chamar na hora certa nem sabe de onde veio a indicação.',
    comoFunciona: [
      'Usa a data relevante cadastrada (não presume que a festa anterior foi no aniversário).',
      'Não cria oportunidade quando já existe negociação ou festa futura.',
      'Mensagens preparadas: o envio automático depende do OrkFlow ou de outro canal contratado.',
    ],
    incluso: [
      'Antecedência configurável e exclusão de clientes da abordagem.',
      'Contexto do relacionamento na oportunidade.',
      'Registro e acompanhamento de indicações.',
    ],
    limites: ['Sem cupons, comissões ou recompensas.'],
    custosExternos: [],
    jaNoPlano: [
      'A aba Clientes, com "hora de chamar de novo" pelo aniversário da última festa e a mensagem pronta, continua no plano.',
    ],
    foraDoEscopo: ['Cupons', 'Comissões', 'Programa de recompensas'],
    implementado: false,
    pendenciasTecnicas: [
      'Campo próprio para a data relevante (aniversário) e sua confirmação.',
      'Registro de indicação, oportunidades automáticas e acompanhamento dos resultados.',
    ],
    pendenciasComerciais: [
      'Separar com clareza o que é do plano (Clientes) e o que é do OrkBis.',
      ...POLITICAS_COMUNS,
    ],
    ondeUsar: { href: '/app/clientes', rotulo: 'Ir para Clientes' },
    temDemonstracao: false,
  },
};

/** Pronto tecnicamente para cobrar (a liberação comercial vem do banco). */
export const prontoParaVenda = (codigo: CodigoModulo): boolean =>
  MODULOS[codigo].implementado && MODULOS[codigo].pendenciasTecnicas.length === 0;

/** Contratação aceita: pronto no código E venda liberada no banco. */
export const podeVender = (codigo: CodigoModulo, vendaLiberada: boolean): boolean =>
  vendaLiberada && prontoParaVenda(codigo);
