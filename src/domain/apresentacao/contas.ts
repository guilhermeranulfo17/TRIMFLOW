import { CHAVES_MODELO, MODELOS_ONBOARDING, type ChaveModelo } from '../modelos';
import type { Segmento } from '../segmento';

/*
 * Contas de apresentação: uma por modelo de negócio, para a equipe Orkestra mostrar o sistema
 * em chamada de vídeo. Dados fictícios, conta de cortesia (sem cobrança), editável e recriada só
 * quando a equipe pede no /interno. O e-mail usa o domínio reservado .invalid: nunca recebe nada.
 */

export type ContaApresentacao = {
  chave: ChaveModelo;
  /** rótulo do modelo (o mesmo do onboarding) */
  rotulo: string;
  slug: string;
  email: string;
  nome: string;
  segmento: Segmento;
  cidade: string;
  sobre: string;
  slogan: string;
  diferenciais: string[];
  usuarioNome: string;
};

const TEXTOS: Record<
  ChaveModelo,
  Pick<ContaApresentacao, 'nome' | 'cidade' | 'sobre' | 'slogan' | 'diferenciais'>
> = {
  infantil: {
    nome: 'Buffet Pula Pula',
    cidade: 'Uberlândia',
    sobre:
      'Festas infantis com brinquedão, monitores e cardápio feito na hora. Conta de apresentação com dados fictícios.',
    slogan: 'A festa que a criançada lembra o ano inteiro',
    diferenciais: [
      'Monitores em todas as festas',
      'Cardápio feito na hora',
      'Estacionamento próprio',
    ],
  },
  casamento: {
    nome: 'Villa Jardim Recepções',
    cidade: 'Uberlândia',
    sobre:
      'Casamentos, 15 anos e bodas com jardim para cerimônia, jantar completo e equipe de salão. Conta de apresentação com dados fictícios.',
    slogan: 'O seu grande dia do jeito que você sonhou',
    diferenciais: ['Cerimônia no jardim', 'Jantar servido à mesa', 'Assessoria no dia'],
  },
  eventos: {
    nome: 'Espaço Prisma Eventos',
    cidade: 'Uberlândia',
    sobre:
      'Espaço para aniversários, confraternizações e eventos de empresa, com buffet completo. Conta de apresentação com dados fictícios.',
    slogan: 'Seu evento com tudo resolvido num lugar só',
    diferenciais: ['Climatizado', 'Som e iluminação inclusos', 'Estacionamento com manobrista'],
  },
  domicilio: {
    nome: 'Sabor em Casa Buffet',
    cidade: 'Uberlândia',
    sobre:
      'Buffet em domicílio: levamos cardápio, equipe e louça até a sua casa ou chácara. Conta de apresentação com dados fictícios.',
    slogan: 'A festa vai até você',
    diferenciais: ['Equipe uniformizada', 'Louça e utensílios inclusos', 'Montagem e limpeza'],
  },
};

export const CONTAS_APRESENTACAO: readonly ContaApresentacao[] = CHAVES_MODELO.map((chave) => ({
  chave,
  rotulo: MODELOS_ONBOARDING[chave].rotulo,
  slug: `apresentacao-${chave}`,
  email: `apresentacao-${chave}@orkestra.invalid`,
  segmento: MODELOS_ONBOARDING[chave].modelo.segmento,
  usuarioNome: 'Equipe Orkestra',
  ...TEXTOS[chave],
}));

export function contaApresentacao(chave: string): ContaApresentacao | null {
  return CONTAS_APRESENTACAO.find((c) => c.chave === chave) ?? null;
}
