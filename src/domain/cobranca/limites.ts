import type { Situacao } from './situacao';

/*
 * Limites e recursos do plano. ESPELHO de public._plano_vigente e dos triggers de limite
 * (usuarios, espacos, whatsapp_ativo, regras de follow-up): o servidor confere antes para a
 * mensagem sair limpa; o banco confere de novo. Downgrade só bloqueia o que é novo.
 */

export type CodigoPlano = 'essencial' | 'profissional';

export type RecursosPlano = {
  codigo: string;
  nome: string;
  maxUsuarios: number;
  /** null = ilimitado */
  maxEspacos: number | null;
  whatsappAvisos: boolean;
  followUp: boolean;
  numerosCompleto: boolean;
};

/** Plano que vale para os limites: teste e cortesia sem assinatura = Profissional. */
export function codigoPlanoVigente(o: {
  situacao: Situacao;
  isenta: boolean;
  planoAssinatura: string | null;
}): string {
  if (o.situacao === 'trial') return 'profissional';
  if (o.planoAssinatura) return o.planoAssinatura;
  return o.isenta ? 'profissional' : 'essencial';
}

export function planoVigente(
  planos: RecursosPlano[],
  o: { situacao: Situacao; isenta: boolean; planoAssinatura: string | null },
): RecursosPlano {
  const codigo = codigoPlanoVigente(o);
  const p = planos.find((x) => x.codigo === codigo) ?? planos.find((x) => x.codigo === 'essencial');
  if (!p) throw new Error('Planos não carregados.');
  return p;
}

export const CODIGOS_LIMITE = [
  'LIMITE_PLANO_USUARIOS',
  'LIMITE_PLANO_ESPACOS',
  'LIMITE_PLANO_WHATSAPP',
  'LIMITE_PLANO_FOLLOW_UP',
] as const;
export type CodigoLimite = (typeof CODIGOS_LIMITE)[number];

export function podeAdicionarUsuario(p: RecursosPlano, ativos: number): boolean {
  return ativos < p.maxUsuarios;
}

export function podeAdicionarEspaco(p: RecursosPlano, ativos: number): boolean {
  return p.maxEspacos === null || ativos < p.maxEspacos;
}

const de = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Mensagem simples para cada limite (a tela mostra junto o botão "Mudar de plano"). */
export function mensagemLimite(codigo: CodigoLimite, p?: RecursosPlano): string {
  switch (codigo) {
    case 'LIMITE_PLANO_USUARIOS':
      return p
        ? `O plano ${p.nome} permite até ${de(p.maxUsuarios, 'usuário', 'usuários')}. Mude de plano para adicionar mais gente.`
        : 'Você chegou ao limite de usuários do seu plano. Mude de plano para adicionar mais gente.';
    case 'LIMITE_PLANO_ESPACOS':
      return p?.maxEspacos
        ? `O plano ${p.nome} permite ${de(p.maxEspacos, 'espaço ativo', 'espaços ativos')}. Mude de plano para ter mais espaços.`
        : 'Você chegou ao limite de espaços do seu plano. Mude de plano para ter mais espaços.';
    case 'LIMITE_PLANO_WHATSAPP':
      return 'Avisos por WhatsApp fazem parte do Profissional. Mude de plano para ligar.';
    case 'LIMITE_PLANO_FOLLOW_UP':
      return 'O follow-up automático faz parte do Profissional. Mude de plano para ligar.';
  }
}

export const MENSAGEM_SOMENTE_LEITURA =
  'Sua conta está suspensa e o painel está somente leitura. Assine ou pague em Minha empresa → Plano para voltar a editar.';

/** Código de erro do banco ligado à conta (suspensa ou limite) → mensagem; senão null. */
export function mensagemErroConta(codigo: string | null | undefined): string | null {
  if (codigo === 'CONTA_SOMENTE_LEITURA') return MENSAGEM_SOMENTE_LEITURA;
  if ((CODIGOS_LIMITE as readonly string[]).includes(codigo ?? '')) {
    return mensagemLimite(codigo as CodigoLimite);
  }
  return null;
}

/** A mensagem pede uma mudança de plano/pagamento (o toast mostra o link para o Plano). */
export const pedeIrAoPlano = (mensagem: string): boolean =>
  /Mude de plano|somente leitura/.test(mensagem);

/** Lista curta do que o plano inclui (tela de Plano e página de vendas). */
export function itensDoPlano(p: RecursosPlano): string[] {
  return [
    de(p.maxUsuarios, 'usuário', 'usuários'),
    p.maxEspacos === null ? 'Espaços ilimitados' : de(p.maxEspacos, 'espaço', 'espaços'),
    'Link de orçamento, propostas e agenda',
    'Avisos no painel e no celular (push)',
    p.whatsappAvisos ? 'Avisos por WhatsApp' : null,
    p.followUp ? 'Follow-up automático' : null,
    p.numerosCompleto ? 'Números completos' : 'Números: resumo e funil',
  ].filter((x): x is string => x !== null);
}
