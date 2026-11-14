import { formatBRL } from '../money';

/*
 * Onboarding em conversa (§91): o mesmo onboarding de 5 passos, mas uma pergunta por vez, em
 * formato de chat. Aqui ficam só os textos e a ordem (puros); a tela chama as mesmas ações de
 * salvar dos passos em formulário, que continuam disponíveis em /app/comecar?passo=N.
 */

/** Trechos da conversa, na ordem. Cada um corresponde a um passo do onboarding. */
export type TrechoConversa = 'boas_vindas' | 'cidade' | 'precos' | 'agenda' | 'pronto';

/** Onde a conversa recomeça, pelo passo salvo no servidor (fechar e voltar continua daqui). */
export function trechoDoPasso(passo: number): TrechoConversa {
  if (passo >= 5) return 'pronto';
  if (passo === 4) return 'agenda';
  if (passo === 3) return 'precos';
  if (passo === 2) return 'cidade';
  return 'boas_vindas';
}

/** Passo do onboarding a gravar quando o trecho começa. */
export const PASSO_DO_TRECHO: Record<TrechoConversa, number> = {
  boas_vindas: 1,
  cidade: 2,
  precos: 3,
  agenda: 4,
  pronto: 5,
};

export type PacoteConversa = {
  nome: string;
  modeloPreco: string;
  precoPessoaCentavos: number | null;
  faixas: { ateConvidados: number; valorCentavos: number }[];
};

/** Pergunta do preço de um pacote (o valor de exemplo vai só como dica, nunca preenchido). */
export function perguntaDoPacote(p: PacoteConversa): { texto: string; dica: string | null } {
  if (p.modeloPreco === 'por_pessoa') {
    return {
      texto: `Quanto você cobra por convidado no pacote ${p.nome}?`,
      dica: p.precoPessoaCentavos
        ? `No exemplo está ${formatBRL(p.precoPessoaCentavos)} por convidado.`
        : null,
    };
  }
  const primeira = p.faixas[0];
  if (!primeira) return { texto: `Quanto custa o pacote ${p.nome}?`, dica: null };
  return {
    texto: `Quanto custa o pacote ${p.nome} para até ${primeira.ateConvidados} convidados?`,
    dica: `No exemplo está ${formatBRL(primeira.valorCentavos)}. As outras faixas eu calculo na mesma proporção, e você ajusta depois se quiser.`,
  };
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function juntarDias(dias: number[]): string {
  const nomes = [...new Set(dias)]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => DIAS[d]!);
  if (nomes.length === 7) return 'todos os dias';
  if (nomes.length <= 1) return nomes[0] ?? 'nenhum dia';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

function horaFim(inicio: string, duracaoMin: number): string {
  const [h, m] = inicio.split(':').map(Number);
  const total = ((h ?? 0) * 60 + (m ?? 0) + duracaoMin) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "Tarde: sábado e domingo, das 13:00 às 18:00" (uma linha por turno ativo). */
export function resumoTurnos(
  turnos: {
    nome: string;
    horaInicio: string;
    duracaoMin: number;
    diasSemana: number[];
    ativo: boolean;
  }[],
): string[] {
  return turnos
    .filter((t) => t.ativo)
    .map(
      (t) =>
        `${t.nome}: ${juntarDias(t.diasSemana)}, das ${t.horaInicio} às ${horaFim(t.horaInicio, t.duracaoMin)}`,
    );
}

/** Pergunta da capacidade: salão próprio ou atendimento na casa do cliente (domicílio). */
export function perguntaDaCapacidade(e: { nome: string; noLocalDoCliente: boolean }): string {
  return e.noLocalDoCliente
    ? 'Você vai até a casa do cliente. Até quantos convidados você atende numa festa?'
    : `Quantos convidados cabem no ${e.nome}?`;
}

/**
 * Nome do tipo de buffet pelo catálogo: o segmento "eventos" serve a dois modelos (espaço de
 * eventos e casamento e 15 anos); o de eventos tem formatura entre os tipos de festa.
 */
export function rotuloDoCatalogo(segmento: string, tiposEvento: string[]): string {
  if (segmento === 'infantil') return 'Buffet infantil';
  if (segmento === 'domicilio') return 'Buffet em domicílio';
  const nomes = tiposEvento.map((t) => t.toLowerCase());
  return nomes.includes('formatura') ? 'Espaço de eventos' : 'Casamento e 15 anos';
}
