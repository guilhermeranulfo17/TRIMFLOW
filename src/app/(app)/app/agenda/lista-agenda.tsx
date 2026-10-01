'use client';

import { ChevronRight, Lock } from 'lucide-react';
import { SeloEstado } from '@/components/app/agenda/estados';
import { prazoRestante } from '@/domain/agenda';
import { diaDaSemana, formatData } from '@/domain/dates';
import type { BaseAgenda, BloqueioAgenda, ReservaAgenda } from '@/server/agenda/carregar';
import { SeloLink } from './item-reserva';

/** Lista do celular: eventos, pré-reservas e bloqueios agrupados por data. */
export function ListaAgenda({
  reservas,
  bloqueios,
  base,
  agora,
  onAbrirDia,
  vazio,
}: {
  reservas: ReservaAgenda[];
  bloqueios: BloqueioAgenda[];
  base: BaseAgenda;
  agora: Date;
  onAbrirDia: (data: string) => void;
  vazio: React.ReactNode;
}) {
  const datas = [
    ...new Set([...reservas.map((r) => r.data), ...bloqueios.map((b) => b.data)]),
  ].sort();
  if (datas.length === 0) return <>{vazio}</>;
  const nomeTurno = (id: string | null) =>
    id ? (base.turnos.find((t) => t.id === id)?.nome ?? 'Turno') : 'Dia inteiro';
  const nomeEspaco = (id: string | null) =>
    base.espacos.length > 1
      ? id
        ? (base.espacos.find((e) => e.id === id)?.nome ?? '')
        : 'Todos os espaços'
      : '';

  return (
    <ol className="space-y-4">
      {datas.map((data) => {
        const doDia = reservas.filter((r) => r.data === data);
        const bloq = bloqueios.filter((b) => b.data === data);
        return (
          <li key={data} data-testid={`lista-dia-${data}`}>
            <button
              type="button"
              onClick={() => onAbrirDia(data)}
              className="rounded-card bg-card hover:bg-accent/40 w-full border p-3 text-left"
            >
              <span className="mb-2 flex items-center justify-between gap-2">
                <span className="font-bold">
                  {formatData(data)}{' '}
                  <span className="text-muted-foreground font-normal">{diaDaSemana(data)}</span>
                </span>
                <ChevronRight className="text-muted-foreground size-4" aria-hidden />
              </span>
              <span className="block space-y-2">
                {doDia.map((r) => (
                  <span key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block font-medium break-words">{r.clienteNome}</span>
                      <span className="text-muted-foreground block text-sm">
                        {nomeTurno(r.turnoId)}
                        {nomeEspaco(r.espacoId) && ` · ${nomeEspaco(r.espacoId)}`}
                        {r.tipo === 'pre_reserva' &&
                          r.expiraEm &&
                          ` · ${prazoRestante(new Date(r.expiraEm), agora)}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {r.veioDoLink && <SeloLink />}
                      <SeloEstado
                        estado={r.tipo === 'pre_reserva' ? 'pre_reservado' : 'reservado'}
                      />
                    </span>
                  </span>
                ))}
                {bloq.map((b) => (
                  <span key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
                      <Lock className="size-4 shrink-0" aria-hidden />
                      {nomeTurno(b.turnoId)}
                      {nomeEspaco(b.espacoId) && ` · ${nomeEspaco(b.espacoId)}`}
                      {b.motivo && ` · ${b.motivo}`}
                    </span>
                    <SeloEstado estado="bloqueado" />
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
