'use client';

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { montarCalendario, somarMes } from '@/domain/agenda/calendario';
import { diaDaSemana, formatData } from '@/domain/dates';
import { agendaDoMes, type SlotNoMes } from '@/server/actions/orcamentos';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const nomeDoMes = (mes: string) => {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  return `${MESES[m - 1]} de ${ano}`;
};

/**
 * Calendário do orçamento interno com a ocupação da Agenda. Datas passadas ficam desligadas;
 * datas sem horário livre aparecem riscadas, mas podem ser abertas (o vendedor vê os horários).
 * `livresNaData` devolve os turnos livres do dia para o espaço escolhido.
 */
export function useAgendaDoMes(mesInicial: string) {
  const [mes, setMes] = useState(mesInicial);
  const [porMes, setPorMes] = useState<Record<string, SlotNoMes[]>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (porMes[mes]) return;
    let ativo = true;
    setErro(null);
    void agendaDoMes(mes).then((r) => {
      if (!ativo) return;
      if (r.ok) setPorMes((p) => ({ ...p, [mes]: r.dados }));
      else setErro(r.erro);
    });
    return () => {
      ativo = false;
    };
  }, [mes, porMes]);

  return { mes, setMes, slots: porMes[mes], erro };
}

export function livresPorData(slots: SlotNoMes[] | undefined, espacoId: string | undefined) {
  const mapa = new Map<string, Set<string>>();
  for (const s of slots ?? []) {
    if (!s.livre || (espacoId && s.espacoId !== espacoId)) continue;
    if (!mapa.has(s.data)) mapa.set(s.data, new Set());
    mapa.get(s.data)!.add(s.turnoId);
  }
  return mapa;
}

export function CalendarioAgenda({
  hoje,
  mes,
  setMes,
  slots,
  erro,
  espacoId,
  data,
  aoEscolher,
}: {
  hoje: string;
  mes: string;
  setMes: (m: string) => void;
  slots: SlotNoMes[] | undefined;
  erro: string | null;
  espacoId: string | undefined;
  data: string | undefined;
  aoEscolher: (data: string) => void;
}) {
  const livres = useMemo(() => livresPorData(slots, espacoId), [slots, espacoId]);
  const calendario = useMemo(() => montarCalendario(mes, []), [mes]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Data da festa</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMes(somarMes(mes, -1))}
            disabled={mes <= hoje.slice(0, 7)}
            className="hover:bg-accent grid size-11 place-items-center rounded-full disabled:opacity-30"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <span className="w-36 text-center text-sm font-semibold" aria-live="polite">
            {nomeDoMes(mes)}
          </span>
          <button
            type="button"
            onClick={() => setMes(somarMes(mes, 1))}
            disabled={mes >= somarMes(hoje.slice(0, 7), 24)}
            className="hover:bg-accent grid size-11 place-items-center rounded-full disabled:opacity-30"
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>
      <div
        className="mt-1 grid grid-cols-7 gap-1 text-center"
        role="grid"
        aria-label={`Datas de ${nomeDoMes(mes)}`}
      >
        {SEMANA.map((d, i) => (
          <span key={i} className="text-muted-foreground py-1 text-xs font-semibold" aria-hidden>
            {d}
          </span>
        ))}
        {calendario.semanas.flat().map((dia) => {
          if (!dia.doMes) return <span key={dia.data} aria-hidden />;
          const passada = dia.data < hoje;
          const livre = (livres.get(dia.data)?.size ?? 0) > 0;
          const marcado = data === dia.data;
          return (
            <button
              key={dia.data}
              type="button"
              disabled={passada}
              onClick={() => aoEscolher(dia.data)}
              aria-pressed={marcado}
              aria-label={`${diaDaSemana(dia.data)}, ${formatData(dia.data)}, ${livre ? 'com horário livre' : 'sem horário livre'}`}
              data-testid={`data-${dia.data}`}
              className={[
                'grid aspect-square min-h-10 place-items-center rounded-full text-sm font-semibold transition-colors',
                'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-30',
                marcado
                  ? 'bg-primary text-primary-foreground'
                  : livre
                    ? 'hover:bg-accent text-foreground'
                    : 'text-muted-foreground line-through',
              ].join(' ')}
            >
              {Number(dia.data.slice(8))}
            </button>
          );
        })}
      </div>
      {!slots && !erro && (
        <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Lendo a agenda…
        </p>
      )}
      {erro && (
        <p role="alert" className="text-destructive mt-1 text-sm font-semibold">
          {erro}
        </p>
      )}
    </div>
  );
}
