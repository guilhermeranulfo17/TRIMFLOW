import { formatInTimeZone } from 'date-fns-tz';
import { FUSO_PADRAO, diaDaSemana, formatData, hojeNoFuso, somarDias } from '../dates';
import { formatBRL } from '../money';
import { PASSOS } from '../publico/passos';
import { ehAvisoCobranca, type TipoAviso } from './canais';

/*
 * Textos dos avisos: os mesmos no painel, no push e (como variáveis) nos modelos do WhatsApp.
 * `dados` é o contexto já resolvido pelo banco no momento do aviso (snake_case, como no jsonb).
 * Prazos relativos ("vence em 5h") são calculados na hora de mostrar/enviar.
 */

export type DadosAviso = Record<string, unknown>;

export type TextoAviso = { titulo: string; corpo: string; caminho: string };

const PERIODO: Record<string, string> = { manha: 'de manhã', tarde: 'à tarde', noite: 'à noite' };

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const instante = (v: unknown): Date | null => {
  if (typeof v !== 'string' && !(v instanceof Date)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const dataCivil = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** "sáb 14/11" */
export function diaCurto(data: string): string {
  return `${diaDaSemana(data).slice(0, 3)} ${formatData(data).slice(0, 5)}`;
}

/** "48h", "5h", "40 min" (prazo até um instante) */
export function prazoCurto(ate: Date, agora: Date): string {
  const min = Math.max(0, Math.floor((ate.getTime() - agora.getTime()) / 60_000));
  if (min < 60) return `${Math.max(min, 1)} min`;
  return `${Math.floor(min / 60)}h`;
}

/** "hoje às 14:00", "amanhã às 14:00", "sáb 14/11 às 14:00" */
export function quandoCurto(d: Date, agora: Date, fuso: string = FUSO_PADRAO): string {
  const dia = formatInTimeZone(d, fuso, 'yyyy-MM-dd');
  const hora = formatInTimeZone(d, fuso, 'HH:mm');
  const hoje = hojeNoFuso(fuso, agora);
  if (dia === hoje) return `hoje às ${hora}`;
  if (dia === somarDias(hoje, 1)) return `amanhã às ${hora}`;
  return `${diaCurto(dia)} às ${hora}`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const juntar = (partes: (string | null | false | undefined)[], sep = ', ') =>
  partes.filter(Boolean).join(sep);

/** Variáveis de cada tipo (as mesmas do texto e do modelo do WhatsApp). */
function variaveis(tipo: TipoAviso, d: DadosAviso, agora: Date, fuso: string) {
  const nome = txt(d.lead_nome) ?? 'Cliente';
  switch (tipo) {
    case 'pre_reserva_pedida': {
      const data = dataCivil(d.data);
      const expira = instante(d.expira_em);
      return {
        nome,
        festa: txt(d.tipo_evento) ?? 'festa',
        quando:
          juntar([data ? diaCurto(data) : null, txt(d.turno)?.toLowerCase()], ' ') ||
          'data a combinar',
        convidados: String(num(d.convidados) ?? 0),
        valor:
          num(d.total_centavos) !== null ? formatBRL(num(d.total_centavos)!) : 'valor a confirmar',
        prazo: expira ? prazoCurto(expira, agora) : '48h',
      };
    }
    case 'visita_pedida': {
      const data = dataCivil(d.data_preferida);
      return {
        nome,
        preferencia:
          juntar([data ? diaCurto(data) : null, PERIODO[txt(d.periodo) ?? '']], ' ') ||
          'dia a combinar',
        valor: num(d.total_centavos) !== null ? formatBRL(num(d.total_centavos)!) : null,
      };
    }
    case 'pre_reserva_vencendo': {
      const expira = instante(d.expira_em);
      return { nome, quando: expira ? quandoCurto(expira, agora, fuso) : 'em breve' };
    }
    case 'orcamentos_sem_acao':
      return {
        quantidade: num(d.quantidade) ?? 0,
        valor: num(d.total_centavos) !== null ? formatBRL(num(d.total_centavos)!) : null,
      };
    case 'cliente_parou': {
      const passo = num(d.passo);
      const p = PASSOS.find((x) => x.numero === passo);
      return {
        nome,
        passo: p ? `passo ${p.numero} (${p.curto.toLowerCase()})` : 'meio do orçamento',
      };
    }
    case 'cliente_esquentou':
      return { nome, aberturas: num(d.aberturas) ?? 2 };
    case 'resumo_diario':
      return {
        preReservas: num(d.pre_reservas_hoje) ?? 0,
        visitas: num(d.visitas_hoje) ?? 0,
        tarefas: num(d.tarefas_hoje) ?? 0,
        atrasadas: num(d.atrasadas) ?? 0,
        novos: num(d.novos_ontem) ?? 0,
      };
    case 'teste':
      return {};
    case 'teste_acabando':
      return { dias: num(d.dias) ?? 1 };
    case 'fatura_criada':
    case 'pagamento_falhou':
    case 'pagamento_confirmado': {
      const venc = dataCivil(d.vencimento);
      return {
        valor: num(d.valor_centavos) !== null ? formatBRL(num(d.valor_centavos)!) : null,
        vencimento: venc ? formatData(venc).slice(0, 5) : null,
      };
    }
    case 'carencia': {
      const em = dataCivil(d.suspende_em);
      return { suspendeEm: em ? formatData(em).slice(0, 5) : null };
    }
    case 'conta_suspensa':
      return {};
    case 'boas_vindas':
      return { buffet: txt(d.buffet) ?? 'seu buffet', slug: txt(d.slug) };
    case 'exportacao_pronta':
      return {};
    case 'exclusao_agendada': {
      const em = instante(d.exclusao_em);
      return { em: em ? formatInTimeZone(em, fuso, 'dd/MM/yyyy') : null };
    }
  }
}

/** Título, corpo e caminho do aviso (o mesmo no painel e no push). */
export function textoAviso(
  tipo: TipoAviso,
  dados: DadosAviso,
  o: { leadId?: string | null; agora?: Date; fuso?: string; agrupados?: number } = {},
): TextoAviso {
  const agora = o.agora ?? new Date();
  const fuso = o.fuso ?? FUSO_PADRAO;
  const caminho = o.leadId
    ? `/app/leads/${o.leadId}`
    : tipo === 'teste'
      ? '/app/avisos'
      : tipo === 'boas_vindas'
        ? '/app/comecar'
        : tipo === 'exportacao_pronta' || tipo === 'exclusao_agendada'
          ? '/app/empresa/privacidade'
          : ehAvisoCobranca(tipo)
            ? '/app/empresa/plano'
            : '/app/leads';
  const v = variaveis(tipo, dados, agora, fuso) as Record<string, string | number | null>;
  const mais = o.agrupados && o.agrupados > 1 ? ` (${o.agrupados} vezes)` : '';
  switch (tipo) {
    case 'pre_reserva_pedida':
      return {
        titulo: `Pré-reserva: ${v.nome}`,
        corpo: `Pré-reserva: ${v.nome}, ${v.festa}, ${v.quando}, ${v.convidados} pessoas, ${v.valor}. Vence em ${v.prazo}.${mais}`,
        caminho,
      };
    case 'visita_pedida':
      return {
        titulo: `Visita pedida: ${v.nome}`,
        corpo: `Visita pedida: ${v.nome}, prefere ${v.preferencia}.${v.valor ? ` Orçamento de ${v.valor}.` : ''}${mais}`,
        caminho,
      };
    case 'pre_reserva_vencendo':
      return {
        titulo: `Pré-reserva vencendo: ${v.nome}`,
        corpo: `A pré-reserva de ${v.nome} vence ${v.quando}. Hora de cobrar o sinal.`,
        caminho,
      };
    case 'orcamentos_sem_acao': {
      const q = Number(v.quantidade);
      return {
        titulo: 'Orçamentos sem resposta',
        corpo: `${plural(q, 'orçamento novo sem resposta', 'orçamentos novos sem resposta')}${v.valor ? `, ${v.valor} no total` : ''}.`,
        caminho,
      };
    }
    case 'cliente_parou':
      return {
        titulo: `${v.nome} parou no meio`,
        corpo: `${v.nome} parou no ${v.passo}.`,
        caminho,
      };
    case 'cliente_esquentou':
      return {
        titulo: `${v.nome} esquentou`,
        corpo: `${v.nome} abriu a proposta ${v.aberturas} vezes.`,
        caminho,
      };
    case 'resumo_diario': {
      const partes = [
        Number(v.preReservas) > 0 &&
          plural(Number(v.preReservas), 'pré-reserva vence', 'pré-reservas vencem'),
        Number(v.visitas) > 0 && plural(Number(v.visitas), 'visita', 'visitas'),
        Number(v.tarefas) > 0 && plural(Number(v.tarefas), 'tarefa', 'tarefas'),
        Number(v.atrasadas) > 0 &&
          plural(Number(v.atrasadas), 'tarefa atrasada', 'tarefas atrasadas'),
      ];
      const hoje = juntar(partes);
      const novos = Number(v.novos);
      return {
        titulo: 'Seu dia no Orkestra',
        corpo: juntar(
          [
            hoje ? `Hoje: ${hoje}.` : 'Nada vencendo hoje.',
            novos > 0 &&
              `Ontem ${novos === 1 ? 'chegou 1 lead novo' : `chegaram ${novos} leads novos`}.`,
          ],
          ' ',
        ),
        caminho,
      };
    }
    case 'teste':
      return {
        titulo: 'Aviso de teste',
        corpo: 'Se você recebeu isto, os avisos do Orkestra estão funcionando.',
        caminho,
      };
    case 'teste_acabando': {
      const dias = Number(v.dias);
      return {
        titulo: dias <= 1 ? 'Seu teste acaba amanhã' : `Seu teste acaba em ${dias} dias`,
        corpo: 'Assine para continuar recebendo pedidos pelo link sem interrupção.',
        caminho,
      };
    }
    case 'fatura_criada':
      return {
        titulo: 'Fatura do Orkestra',
        corpo: juntar(
          [
            `Sua fatura${v.valor ? ` de ${v.valor}` : ''} está disponível`,
            v.vencimento ? `vence em ${v.vencimento}` : null,
          ],
          ' e ',
        ).concat('. Pague por Pix, boleto ou cartão.'),
        caminho,
      };
    case 'pagamento_confirmado':
      return {
        titulo: 'Pagamento confirmado',
        corpo: `Recebemos seu pagamento${v.valor ? ` de ${v.valor}` : ''}. Obrigado!`,
        caminho,
      };
    case 'pagamento_falhou':
      return {
        titulo: 'Pagamento não identificado',
        corpo: `A fatura${v.valor ? ` de ${v.valor}` : ''}${v.vencimento ? ` venceu em ${v.vencimento}` : ' venceu'} e não identificamos o pagamento. Pague para não perder o acesso.`,
        caminho,
      };
    case 'carencia':
      return {
        titulo: 'Pagamento em atraso',
        corpo: v.suspendeEm
          ? `Sem o pagamento, sua conta fica somente leitura em ${v.suspendeEm}.`
          : 'Sem o pagamento, sua conta fica somente leitura em breve.',
        caminho,
      };
    case 'conta_suspensa':
      return {
        titulo: 'Conta suspensa',
        corpo:
          'Seu painel está somente leitura e o link mostra só a vitrine. Assine ou pague para voltar.',
        caminho,
      };
    case 'boas_vindas':
      return {
        titulo: 'Boas-vindas ao Orkestra',
        corpo: `A conta de ${v.buffet} está criada. Em poucos minutos o seu link de orçamento fica no ar: confirme os preços e divulgue.`,
        caminho,
      };
    case 'exportacao_pronta':
      return {
        titulo: 'Seus dados foram exportados',
        corpo:
          'Alguém da sua conta baixou todos os dados do buffet agora. Se não foi você, troque a senha e fale com o suporte.',
        caminho,
      };
    case 'exclusao_agendada':
      return {
        titulo: 'Sua conta será excluída',
        corpo: `A exclusão da conta foi pedida e acontece em ${v.em ?? '30 dias'}. Até lá a conta fica somente leitura e você pode baixar os dados ou desistir.`,
        caminho,
      };
  }
}

/** Resumo do dia tem algo a dizer? (zerado não é enviado) */
export function resumoTemConteudo(d: DadosAviso): boolean {
  return ['novos_ontem', 'pre_reservas_hoje', 'visitas_hoje', 'tarefas_hoje', 'atrasadas'].some(
    (k) => (num(d[k]) ?? 0) > 0,
  );
}

/*
 * Modelos do WhatsApp (Meta Cloud API, categoria utilidade, pt_BR). O texto exato de cada um
 * está em docs/WHATSAPP_MODELOS.md; aqui ficam o nome e a ordem das variáveis {{1}}, {{2}}…
 * O botão de URL de todos os modelos é "https://SITE/app/{{1}}" (sufixo = caminho sem /app/).
 */
export const MODELOS_WHATSAPP: Partial<Record<TipoAviso, string>> = {
  pre_reserva_pedida: 'orkestra_pre_reserva',
  visita_pedida: 'orkestra_visita_pedida',
  pre_reserva_vencendo: 'orkestra_pre_reserva_vencendo',
  resumo_diario: 'orkestra_resumo_diario',
  teste: 'orkestra_teste',
};

export function variaveisWhatsApp(
  tipo: TipoAviso,
  dados: DadosAviso,
  o: { agora?: Date; fuso?: string } = {},
): string[] {
  const v = variaveis(tipo, dados, o.agora ?? new Date(), o.fuso ?? FUSO_PADRAO) as Record<
    string,
    string | number | null
  >;
  const s = (x: string | number | null | undefined) => String(x ?? '-');
  switch (tipo) {
    case 'pre_reserva_pedida':
      return [v.nome, v.festa, v.quando, v.convidados, v.valor, v.prazo].map(s);
    case 'visita_pedida':
      return [v.nome, v.preferencia, v.valor ?? 'a definir'].map(s);
    case 'pre_reserva_vencendo':
      return [v.nome, v.quando].map(s);
    case 'resumo_diario':
      return [v.preReservas, v.visitas, v.tarefas, v.atrasadas, v.novos].map(s);
    default:
      return [];
  }
}
