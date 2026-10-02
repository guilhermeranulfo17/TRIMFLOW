import { formatInTimeZone } from 'date-fns-tz';
import { dataPorExtenso, FUSO_PADRAO, hojeNoFuso, somarDias } from '../dates';
import { formatBRL } from '../money';
import type { StatusLead, TemperaturaLead } from '../publico/status-lead';

/*
 * Mensagens prontas para o vendedor mandar no WhatsApp (nada é enviado automaticamente: ele vê,
 * edita e só então abre a conversa). Textos curtos e naturais. Variável que falta sai do texto:
 * nunca aparece "undefined" nem um buraco na frase.
 */

export const SITUACOES_MENSAGEM = [
  'primeiro_contato',
  'proposta_sem_resposta',
  'pre_reserva_vencendo',
  'confirmacao_visita',
  'reativar_frio',
] as const;
/** Situações só das tarefas automáticas (Etapa 7); não aparecem no seletor do WhatsApp. */
export const SITUACOES_AUTOMATICAS = [
  'proposta_nao_aberta',
  'segundo_toque',
  'proposta_vencendo',
  'ultimo_contato',
  'pos_visita',
  'chamar_quente',
] as const;
export type SituacaoMensagem =
  (typeof SITUACOES_MENSAGEM)[number] | (typeof SITUACOES_AUTOMATICAS)[number];

export const ROTULO_SITUACAO: Record<SituacaoMensagem, string> = {
  primeiro_contato: 'Primeiro contato',
  proposta_sem_resposta: 'Proposta aberta, sem resposta',
  pre_reserva_vencendo: 'Pré-reserva vencendo',
  confirmacao_visita: 'Confirmar visita',
  reativar_frio: 'Reativar lead frio',
  proposta_nao_aberta: 'Proposta não aberta',
  segundo_toque: 'Segundo toque',
  proposta_vencendo: 'Proposta vencendo',
  ultimo_contato: 'Último contato',
  pos_visita: 'Depois da visita',
  chamar_quente: 'Lead quente',
};

export type DadosMensagem = {
  nome: string;
  buffet: string;
  /** primeiro nome de quem envia (opcional) */
  vendedor?: string | null;
  tipoFesta?: string | null;
  /** data civil da festa (yyyy-MM-dd) */
  dataFesta?: string | null;
  linkProposta?: string | null;
  preReservaExpiraEm?: Date | null;
  sinalCentavos?: number | null;
  visitaEm?: Date | null;
  /** a data da festa ainda está livre na agenda (o servidor confere) */
  dataAindaLivre?: boolean;
  /** validade da proposta (yyyy-MM-dd) */
  validadeAte?: string | null;
  fuso?: string;
  agora?: Date;
};

const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

function tipoComArtigo(tipo: string | null | undefined): string | null {
  if (!tipo?.trim()) return null;
  return `a festa (${tipo.trim().toLowerCase()})`;
}

function quandoVisita(d: Date, agora: Date, fuso: string): string {
  const dia = formatInTimeZone(d, fuso, 'yyyy-MM-dd');
  const hora = formatInTimeZone(d, fuso, "HH'h'mm").replace(/h00$/, 'h');
  const hoje = hojeNoFuso(fuso, agora);
  if (dia === hoje) return `hoje às ${hora}`;
  if (dia === somarDias(hoje, 1)) return `amanhã às ${hora}`;
  return `${dataPorExtenso(dia).toLowerCase()}, às ${hora}`;
}

function prazoTexto(expira: Date, agora: Date, fuso: string): string {
  const horas = Math.floor((expira.getTime() - agora.getTime()) / 3_600_000);
  if (horas < 1) return 'em menos de 1 hora';
  if (horas < 48) return `em ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  return `${quandoVisita(expira, agora, fuso)}`;
}

const juntar = (...partes: (string | null | undefined | false)[]) =>
  partes
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();

export function montarMensagem(situacao: SituacaoMensagem, d: DadosMensagem): string {
  const fuso = d.fuso ?? FUSO_PADRAO;
  const agora = d.agora ?? new Date();
  const nome = primeiro(d.nome);
  const ola = `Oi, ${nome}!`;
  const souEu = d.vendedor
    ? `Aqui é ${primeiro(d.vendedor)}, do ${d.buffet}.`
    : `Aqui é do ${d.buffet}.`;
  const data = d.dataFesta ? dataPorExtenso(d.dataFesta).toLowerCase() : null;
  const festa = tipoComArtigo(d.tipoFesta);
  const link = d.linkProposta ? `Sua proposta: ${d.linkProposta}` : null;

  switch (situacao) {
    case 'primeiro_contato':
      return juntar(
        ola,
        souEu,
        festa || data
          ? `Vi que você montou um orçamento para ${festa ?? 'a sua festa'}${data ? ` no dia ${data}` : ''}.`
          : 'Vi que você montou um orçamento com a gente.',
        'Posso te ajudar com alguma dúvida?',
        link,
      );
    case 'proposta_sem_resposta':
      return juntar(
        ola,
        `Vi que você abriu a proposta do ${d.buffet}${data ? ` para o dia ${data}` : ''}.`,
        'Ficou alguma dúvida? Se quiser, já seguro a data para você.',
        link,
      );
    case 'pre_reserva_vencendo':
      return juntar(
        ola,
        `Sua pré-reserva no ${d.buffet}${data ? ` para o dia ${data}` : ''}`,
        d.preReservaExpiraEm
          ? `vence ${prazoTexto(d.preReservaExpiraEm, agora, fuso)}.`
          : 'está para vencer.',
        d.sinalCentavos
          ? `Para garantir a data, o sinal é de ${formatBRL(d.sinalCentavos)}. Posso te mandar os dados para o pagamento?`
          : 'Para garantir a data, posso te mandar os dados do sinal?',
      );
    case 'confirmacao_visita':
      return juntar(
        ola,
        d.visitaEm
          ? `Confirmando sua visita ao ${d.buffet} ${quandoVisita(d.visitaEm, agora, fuso)}.`
          : `Vamos combinar sua visita ao ${d.buffet}? Qual dia e horário ficam bons para você?`,
        d.visitaEm ? 'Se tiver algum imprevisto, é só me avisar por aqui.' : null,
      );
    case 'reativar_frio':
      // Só cita a data se ela ainda estiver livre de verdade na agenda.
      if (data && d.dataAindaLivre) {
        return juntar(
          ola,
          `Passando para avisar que o dia ${data} ainda está livre aqui no ${d.buffet}, mas as datas estão saindo rápido.`,
          'Quer que eu segure para você?',
          link,
        );
      }
      return juntar(
        ola,
        `Ainda está planejando ${festa ?? 'a sua festa'}?`,
        `Temos datas boas nos próximos meses aqui no ${d.buffet}. Posso te mandar uma proposta atualizada?`,
      );
    case 'proposta_nao_aberta':
      return juntar(
        ola,
        souEu,
        `Te mandei a proposta${festa ? ` para ${festa}` : ''}${data ? ` do dia ${data}` : ''}. Conseguiu dar uma olhada?`,
        link,
      );
    case 'segundo_toque':
      // Escassez real: só cita a data se ela ainda estiver livre na agenda.
      return juntar(
        ola,
        data && d.dataAindaLivre
          ? `Ainda temos o dia ${data} livre aqui no ${d.buffet}, mas essa época sai rápido.`
          : `Passando para saber se você ainda está planejando ${festa ?? 'a sua festa'}.`,
        'Posso te ajudar a fechar ou tirar alguma dúvida?',
        link,
      );
    case 'proposta_vencendo':
      return juntar(
        ola,
        d.validadeAte
          ? `Sua proposta do ${d.buffet} vale até ${dataPorExtenso(d.validadeAte).toLowerCase()}.`
          : `Sua proposta do ${d.buffet} está para vencer.`,
        'Depois disso os valores podem mudar. Quer garantir a data?',
        link,
      );
    case 'ultimo_contato':
      return juntar(
        ola,
        `Sua proposta do ${d.buffet} venceu, mas posso atualizar os valores para você${data ? ` e ver se o dia ${data} ainda está livre` : ''}.`,
        'É só me responder por aqui.',
      );
    case 'pos_visita':
      return juntar(
        ola,
        `Obrigado pela visita ao ${d.buffet}! O que você achou do espaço?`,
        data
          ? `Se quiser, já faço a pré-reserva do dia ${data} para você.`
          : 'Se quiser, já faço a pré-reserva da sua data.',
      );
    case 'chamar_quente':
      return juntar(
        ola,
        souEu,
        `Vi que você está olhando a proposta${data ? ` para o dia ${data}` : ''}. Quer que eu tire alguma dúvida ou já segure a data?`,
        link,
      );
  }
}

export type MomentoLead = {
  status: StatusLead;
  temperatura: TemperaturaLead;
  preReservaAtiva: boolean;
  visitaConfirmada: boolean;
  aberturas: number;
  temOrcamento: boolean;
};

/** Qual mensagem faz sentido agora (o vendedor pode trocar). */
export function situacaoDoMomento(m: MomentoLead): SituacaoMensagem {
  if (m.preReservaAtiva) return 'pre_reserva_vencendo';
  if (m.visitaConfirmada) return 'confirmacao_visita';
  if (
    m.status === 'frio' ||
    m.status === 'abandonou' ||
    (m.temperatura === 'frio' && m.status !== 'novo')
  ) {
    return 'reativar_frio';
  }
  if (m.aberturas > 0 && m.temOrcamento) return 'proposta_sem_resposta';
  return 'primeiro_contato';
}
