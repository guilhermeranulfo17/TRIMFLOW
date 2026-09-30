'use client';

import { Ban, CalendarPlus, ChevronLeft, ChevronRight, Clock, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Legenda } from '@/components/app/agenda/estados';
import { classeCampo } from '@/components/app/form/estilos';
import { Button } from '@/components/ui/button';
import { prazoRestante, somarMes, type Calendario } from '@/domain/agenda';
import { formatData } from '@/domain/dates';
import { cn } from '@/lib/utils';
import type { BaseAgenda, BloqueioAgenda, ReservaAgenda } from '@/server/agenda/carregar';
import { CalendarioMes } from './calendario-mes';
import { FormBloqueio, type PedidoBloqueio } from './form-bloqueio';
import { FormReserva, type PedidoReserva } from './form-reserva';
import { ListaAgenda } from './lista-agenda';
import { PainelDia } from './painel-dia';

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

function rotuloMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  return `${MESES[m - 1]} de ${ano}`;
}

export function AgendaCliente({
  base,
  hoje,
  mes,
  mesEscolhido,
  espacoId,
  calendario,
  lista,
  vencendo,
  podeBloquear,
}: {
  base: BaseAgenda;
  hoje: string;
  mes: string;
  /** true quando o usuário escolheu um mês (a lista mostra o mês, não os próximos 60 dias) */
  mesEscolhido: boolean;
  espacoId: string;
  calendario: Calendario;
  lista: { reservas: ReservaAgenda[]; bloqueios: BloqueioAgenda[] };
  vencendo: ReservaAgenda[];
  podeBloquear: boolean;
}) {
  const router = useRouter();
  const [agora] = useState(() => new Date());
  const [dia, setDia] = useState<string | null>(null);
  const [reserva, setReserva] = useState<PedidoReserva | null>(null);
  const [bloqueio, setBloqueio] = useState<PedidoBloqueio | null>(null);
  const [versao, setVersao] = useState(0);

  const href = (m: string, e = espacoId) => {
    const p = new URLSearchParams({ mes: m });
    if (e) p.set('espaco', e);
    return `/app/agenda?${p.toString()}`;
  };
  const salvo = () => {
    setReserva(null);
    setBloqueio(null);
    setVersao((v) => v + 1);
    router.refresh();
  };
  const formAberto = reserva !== null || bloqueio !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setReserva({ tipo: 'confirmada' })}>
          <CalendarPlus aria-hidden /> Registrar evento
        </Button>
        <Button type="button" variant="outline" onClick={() => setReserva({ tipo: 'pre_reserva' })}>
          <Hourglass aria-hidden /> Pré-reservar
        </Button>
        {podeBloquear && (
          <Button type="button" variant="ghost" onClick={() => setBloqueio({})}>
            <Ban aria-hidden /> Bloquear datas
          </Button>
        )}
      </div>

      {vencendo.length > 0 && (
        <section
          className="rounded-card space-y-2 border border-amber-300 bg-amber-50 p-3 text-amber-950"
          aria-labelledby="titulo-vencendo"
        >
          <h2 id="titulo-vencendo" className="flex items-center gap-2 text-sm font-bold">
            <Clock className="size-4" aria-hidden />
            {vencendo.length === 1
              ? '1 pré-reserva vence nas próximas 12h'
              : `${vencendo.length} pré-reservas vencem nas próximas 12h`}
          </h2>
          <ul className="space-y-1 text-sm">
            {vencendo.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="text-left underline-offset-2 hover:underline"
                  onClick={() => setDia(r.data)}
                >
                  {r.clienteNome} · {formatData(r.data)} ·{' '}
                  {r.expiraEm && prazoRestante(new Date(r.expiraEm), agora)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon">
            <Link href={href(somarMes(mes, -1))} aria-label="Mês anterior">
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <h2 className="min-w-40 text-center font-bold" aria-live="polite">
            {rotuloMes(mes)}
          </h2>
          <Button asChild variant="ghost" size="icon">
            <Link href={href(somarMes(mes, 1))} aria-label="Próximo mês">
              <ChevronRight aria-hidden />
            </Link>
          </Button>
          {mesEscolhido && (
            <Button asChild variant="link" size="sm" className="md:hidden">
              <Link href="/app/agenda">Próximos 60 dias</Link>
            </Button>
          )}
        </div>
        {base.espacos.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Espaço</span>
            <select
              className={cn(classeCampo, 'w-auto')}
              value={espacoId}
              onChange={(e) => router.push(href(mes, e.target.value))}
            >
              <option value="">Todos</option>
              {base.espacos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <Legenda />

      <div className="md:hidden">
        <p className="text-muted-foreground mb-3 text-sm">
          {mesEscolhido ? `Eventos de ${rotuloMes(mes).toLowerCase()}` : 'Próximos 60 dias'}. Toque
          numa data para ver os turnos.
        </p>
        <ListaAgenda
          reservas={lista.reservas.filter((r) => !espacoId || r.espacoId === espacoId)}
          bloqueios={lista.bloqueios.filter(
            (b) => !espacoId || b.espacoId === null || b.espacoId === espacoId,
          )}
          base={base}
          agora={agora}
          onAbrirDia={setDia}
          vazio={
            <p className="rounded-card text-muted-foreground border border-dashed px-4 py-6 text-center text-sm">
              Nenhum evento registrado. Comece registrando os eventos que você já fechou, para o
              link não vender essas datas.
            </p>
          }
        />
      </div>
      <div className="hidden md:block">
        <CalendarioMes calendario={calendario} hoje={hoje} onAbrirDia={setDia} />
      </div>

      {dia && !formAberto && (
        <PainelDia
          data={dia}
          base={base}
          hoje={hoje}
          podeBloquear={podeBloquear}
          versao={versao}
          onFechar={() => setDia(null)}
          onReservar={setReserva}
          onBloquear={setBloqueio}
          onAlterado={() => router.refresh()}
        />
      )}
      {reserva && (
        <FormReserva
          pedido={reserva}
          base={base}
          hoje={hoje}
          onFechar={() => setReserva(null)}
          onSalvo={salvo}
        />
      )}
      {bloqueio && (
        <FormBloqueio
          pedido={bloqueio}
          base={base}
          hoje={hoje}
          onFechar={() => setBloqueio(null)}
          onSalvo={salvo}
        />
      )}
    </div>
  );
}
