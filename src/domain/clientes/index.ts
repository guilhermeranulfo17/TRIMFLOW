import { dataPorExtenso, diasEntre, somarMeses, type DataCivil } from '../dates';
import type { StatusLead } from '../publico/status-lead';

/*
 * Clientes (Etapa 12): quem já fechou festa com o buffet. Cliente = uma pessoa com pelo menos uma
 * reserva confirmada (ativa ou realizada). As reservas se juntam pelo lead; a reserva feita direto
 * na Agenda (sem lead) entra pelo lead do mesmo WhatsApp ou, sem lead, pelo próprio WhatsApp.
 * "Hora de chamar de novo": a festa fez (ou vai fazer) aniversário e não há festa marcada.
 */

export type FestaDoCliente = {
  reservaId: string;
  /** lead da reserva ou o lead do mesmo WhatsApp (o servidor resolve) */
  leadId: string | null;
  /** nome do lead (ou da reserva, se não houver lead) */
  nome: string;
  whatsapp: string | null;
  data: DataCivil;
  status: 'ativa' | 'realizada';
  valorTotalCentavos: number | null;
  tipoEvento: string | null;
  /** status do lead (null sem lead) */
  statusLead: StatusLead | null;
};

export type Cliente = {
  /** id da ficha: o lead ou, sem lead, a reserva mais recente */
  id: string;
  leadId: string | null;
  nome: string;
  whatsapp: string | null;
  /** da mais recente para a mais antiga */
  festas: FestaDoCliente[];
  primeiraFesta: DataCivil;
  /** última festa que já aconteceu (data antes de hoje) */
  ultimaFesta: DataCivil | null;
  /** próxima festa marcada (hoje em diante) */
  proximaFesta: DataCivil | null;
  totalCentavos: number;
  /** já pediu orçamento de novo (lead aberto) */
  emNegociacao: boolean;
  /** aniversário da última festa, para chamar de novo (sem festa marcada) */
  aniversario: DataCivil | null;
  horaDeChamar: boolean;
};

/** Janela do "hora de chamar": 30 dias depois até 60 dias antes do aniversário da festa. */
export const JANELA_CHAMAR = { antes: 60, depois: 30 } as const;

const STATUS_NEGOCIACAO: readonly StatusLead[] = ['novo', 'em_andamento', 'pre_reservado'];

/**
 * O aniversário (1, 2, 3… anos) da festa que ainda não passou da janela: o primeiro que cai em
 * hoje − 30 dias ou depois.
 */
export function proximoAniversario(festa: DataCivil, hoje: DataCivil): DataCivil {
  for (let anos = 1; ; anos++) {
    const a = somarMeses(festa, 12 * anos);
    if (diasEntre(hoje, a) >= -JANELA_CHAMAR.depois) return a;
  }
}

function chave(f: FestaDoCliente): string {
  if (f.leadId) return `l:${f.leadId}`;
  if (f.whatsapp) return `w:${f.whatsapp}`;
  return `r:${f.reservaId}`;
}

/** Junta as festas por cliente. A ordem sai de `ordenarClientes`. */
export function agruparClientes(festas: FestaDoCliente[], hoje: DataCivil): Cliente[] {
  const grupos = new Map<string, FestaDoCliente[]>();
  for (const f of festas) {
    const k = chave(f);
    const g = grupos.get(k);
    if (g) g.push(f);
    else grupos.set(k, [f]);
  }
  return [...grupos.values()].map((g) => montarCliente(g, hoje));
}

/** Um cliente a partir das festas dele (todas da mesma pessoa). */
export function montarCliente(festas: FestaDoCliente[], hoje: DataCivil): Cliente {
  const ordem = [...festas].sort((a, b) =>
    a.data === b.data ? a.reservaId.localeCompare(b.reservaId) : a.data < b.data ? 1 : -1,
  );
  const recente = ordem[0]!;
  const comLead = ordem.find((f) => f.leadId);
  const passadas = ordem.filter((f) => f.data < hoje);
  const futuras = ordem.filter((f) => f.data >= hoje && f.status === 'ativa');
  const ultimaFesta = passadas[0]?.data ?? null;
  const proximaFesta = futuras.at(-1)?.data ?? null;
  const emNegociacao = !!comLead?.statusLead && STATUS_NEGOCIACAO.includes(comLead.statusLead);
  const aniversario = ultimaFesta && !proximaFesta ? proximoAniversario(ultimaFesta, hoje) : null;
  return {
    id: comLead?.leadId ?? recente.reservaId,
    leadId: comLead?.leadId ?? null,
    nome: (comLead ?? recente).nome,
    whatsapp: comLead?.whatsapp ?? ordem.find((f) => f.whatsapp)?.whatsapp ?? null,
    festas: ordem,
    primeiraFesta: ordem.at(-1)!.data,
    ultimaFesta,
    proximaFesta,
    totalCentavos: ordem.reduce((s, f) => s + (f.valorTotalCentavos ?? 0), 0),
    emNegociacao,
    aniversario,
    horaDeChamar:
      !!aniversario && !emNegociacao && diasEntre(hoje, aniversario) <= JANELA_CHAMAR.antes,
  };
}

// ---------------------------------------------------------------------------
// Filtros, busca e ordem
// ---------------------------------------------------------------------------

export const FILTROS_CLIENTES = ['chamar', 'marcadas', 'todos'] as const;
export type FiltroClientes = (typeof FILTROS_CLIENTES)[number];

export const ROTULO_FILTRO_CLIENTES: Record<FiltroClientes, string> = {
  chamar: 'Hora de chamar de novo',
  marcadas: 'Com festa marcada',
  todos: 'Todos',
};

export function filtroClientesDaUrl(v: string | string[] | undefined): FiltroClientes {
  const s = Array.isArray(v) ? v[0] : v;
  return (FILTROS_CLIENTES as readonly string[]).includes(s ?? '')
    ? (s as FiltroClientes)
    : 'todos';
}

export function noFiltroClientes(c: Cliente, f: FiltroClientes): boolean {
  if (f === 'chamar') return c.horaDeChamar;
  if (f === 'marcadas') return !!c.proximaFesta;
  return true;
}

const semAcento = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Busca por nome (sem acento) ou por 4+ dígitos do WhatsApp. Até 80 caracteres. */
export function buscaClientesDaUrl(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? '').trim().slice(0, 80);
}

export function casaBusca(c: Cliente, busca: string): boolean {
  const b = semAcento(busca);
  if (!b) return true;
  const digitos = busca.replace(/\D/g, '');
  if (digitos.length >= 4 && c.whatsapp?.replace(/\D/g, '').includes(digitos)) return true;
  return semAcento(c.nome).includes(b);
}

/**
 * Ordem da lista: "chamar" pelo aniversário mais perto; "marcadas" pela próxima festa; "todos"
 * pela festa mais recente (marcada ou não) primeiro.
 */
export function ordenarClientes(cs: Cliente[], f: FiltroClientes): Cliente[] {
  const desempate = (a: Cliente, b: Cliente) => a.nome.localeCompare(b.nome, 'pt-BR');
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return [...cs].sort((a, b) => {
    if (f === 'chamar') return cmp(a.aniversario ?? '', b.aniversario ?? '') || desempate(a, b);
    if (f === 'marcadas') return cmp(a.proximaFesta ?? '', b.proximaFesta ?? '') || desempate(a, b);
    return cmp(b.festas[0]!.data, a.festas[0]!.data) || desempate(a, b);
  });
}

export type TelaClientes = {
  total: number;
  contagem: Record<FiltroClientes, number>;
  clientes: Cliente[];
  /** sobrou cliente além do limite (botão "Mostrar mais") */
  temMais: boolean;
};

export const LIMITE_CLIENTES = 50;

export function limiteDaUrl(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  if (!Number.isInteger(n) || n < LIMITE_CLIENTES) return LIMITE_CLIENTES;
  return Math.min(n, 2000);
}

/** A tela inteira: contagem por filtro (com a busca), filtra, ordena e corta no limite. */
export function telaClientes(
  todos: Cliente[],
  filtro: FiltroClientes,
  busca: string,
  limite: number = LIMITE_CLIENTES,
): TelaClientes {
  const achados = todos.filter((c) => casaBusca(c, busca));
  const contagem = {} as Record<FiltroClientes, number>;
  for (const f of FILTROS_CLIENTES) {
    contagem[f] = achados.filter((c) => noFiltroClientes(c, f)).length;
  }
  const lista = ordenarClientes(
    achados.filter((c) => noFiltroClientes(c, filtro)),
    filtro,
  );
  return {
    total: todos.length,
    contagem,
    clientes: lista.slice(0, limite),
    temMais: lista.length > limite,
  };
}

// ---------------------------------------------------------------------------
// Mensagem "festa de novo" (o vendedor vê e edita; nada sai sozinho)
// ---------------------------------------------------------------------------

function tempoDesde(festa: DataCivil, hoje: DataCivil): string {
  const dias = diasEntre(festa, hoje);
  if (dias < 300) return 'alguns meses';
  if (dias < 365) return 'quase um ano';
  if (dias <= 400) return 'um ano';
  return 'mais de um ano';
}

export function mensagemFestaDeNovo(d: {
  nome: string;
  buffet: string;
  vendedor?: string | null;
  tipoFesta?: string | null;
  ultimaFesta: DataCivil | null;
  hoje: DataCivil;
}): string {
  const primeiro = (n: string) => n.trim().split(/\s+/)[0] ?? n;
  const souEu = d.vendedor
    ? `Aqui é ${primeiro(d.vendedor)}, do ${d.buffet}.`
    : `Aqui é do ${d.buffet}.`;
  const festa = d.tipoFesta?.trim() ? `da festa (${d.tipoFesta.trim().toLowerCase()})` : 'da festa';
  const lembranca = d.ultimaFesta
    ? `Já faz ${tempoDesde(d.ultimaFesta, d.hoje)} ${festa} aqui com a gente, no dia ${dataPorExtenso(d.ultimaFesta).replace(/^[^,]+, /, '')}.`
    : null;
  return [
    `Oi, ${primeiro(d.nome)}!`,
    souEu,
    lembranca,
    'Já está pensando na próxima? Posso te mandar as datas livres e uma proposta atualizada.',
  ]
    .filter(Boolean)
    .join(' ');
}
