import type { DataCivil } from '../dates';
import type { Segmento } from '../segmento';
import {
  blocosDoContrato,
  resumoDoContrato,
  valoresDoContrato,
  type FonteContrato,
} from './montar';
import { MODELOS_PADRAO, origemModelo } from './modelos';
import { normalizarTexto } from './integridade';
import { preencherModelo } from './variaveis';

/*
 * Contrato de exemplo da conta de demonstração (Etapa 10, PR 2): o modelo infantil preenchido
 * com a reserva confirmada da demo. Tudo fictício (buffet e cliente da demo).
 */

export type ReservaExemplo = {
  buffet: string;
  cliente: string;
  whatsappE164: string | null;
  data: DataCivil;
  convidados: number | null;
  totalCentavos: number;
  sinalCentavos: number;
  hoje: DataCivil;
  /** contas de apresentação: modelo de contrato do segmento e dados da festa (padrão: infantil) */
  segmento?: Segmento;
  festa?: Partial<FonteContrato['festa']>;
};

export function contratoDeExemplo(r: ReservaExemplo): {
  titulo: string;
  texto: string;
  valores: ReturnType<typeof resumoDoContrato>;
  modeloOrigem: string;
} {
  const modelo = MODELOS_PADRAO[r.segmento ?? 'infantil'];
  const fonte: FonteContrato = {
    hoje: r.hoje,
    cliente: { nome: r.cliente, whatsappE164: r.whatsappE164 ?? '+5534997000000', email: null },
    buffet: {
      nome: r.buffet,
      razaoSocial: `${r.buffet} Festas Ltda.`,
      cnpj: '11222333000181',
      endereco: 'Rua das Festas, 100, Centro',
      cidade: 'Uberlândia',
      uf: 'MG',
      whatsappE164: '+5534999990000',
    },
    festa: {
      tipoEvento: 'Aniversário infantil',
      data: r.data,
      horaInicio: '15:00',
      duracaoMin: 240,
      espaco: 'Salão principal',
      convidados: r.convidados ?? 60,
      pacote: 'Encanto',
      itens: ['Pacote Encanto', 'Decoração temática', 'Monitores de recreação'],
      naoIncluso: 'Bolo e lembrancinhas.',
      ...r.festa,
    },
    valores: {
      totalCentavos: r.totalCentavos,
      sinalCentavos: r.sinalCentavos,
      saldoCentavos: r.totalCentavos - r.sinalCentavos,
    },
    formasPagamento: ['Pix', 'Cartão de crédito'],
    prazoSaldoDias: 7,
    horaExtraCentavos: 35000,
    alteracaoConvidados: 'Convidados a mais podem ser incluídos até 7 dias antes da festa.',
    opcoes: modelo.opcoes,
  };
  const preenchido = preencherModelo(
    modelo.texto,
    valoresDoContrato(fonte),
    blocosDoContrato(modelo.opcoes),
  );
  const texto = normalizarTexto(preenchido.texto);
  const m = /^# (.+)$/m.exec(texto);
  return {
    titulo: (m?.[1] ?? modelo.titulo).trim().slice(0, 160),
    texto,
    valores: resumoDoContrato(fonte),
    modeloOrigem: origemModelo(modelo),
  };
}
