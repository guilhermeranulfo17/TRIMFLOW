'use client';

import { Ban, CalendarPlus, Loader2, Lock, Unlock } from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { SeloEstado } from '@/components/app/agenda/estados';
import { Folha } from '@/components/app/agenda/folha';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { bloqueioValePara } from '@/domain/agenda';
import { diaDaSemana, formatData } from '@/domain/dates';
import { desbloquear, detalhesDoDia } from '@/server/actions/agenda';
import type { BaseAgenda, DiaAgenda } from '@/server/agenda/carregar';
import type { PedidoBloqueio } from './form-bloqueio';
import type { PedidoReserva } from './form-reserva';
import { ItemReserva } from './item-reserva';

function fimDoTurno(hora: string, duracaoMin: number): string {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  const total = (h * 60 + m + duracaoMin) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Turnos de cada espaço num dia, com o estado e as ações de cada slot. */
export function PainelDia({
  data,
  base,
  hoje,
  podeBloquear,
  versao,
  onFechar,
  onReservar,
  onBloquear,
  onAlterado,
}: {
  data: string;
  base: BaseAgenda;
  hoje: string;
  podeBloquear: boolean;
  /** muda quando algo foi salvo fora do painel (recarrega) */
  versao: number;
  onFechar: () => void;
  onReservar: (p: PedidoReserva) => void;
  onBloquear: (p: PedidoBloqueio) => void;
  onAlterado: () => void;
}) {
  const toast = useToast();
  const [dia, setDia] = useState<DiaAgenda | null>(null);
  const [erro, setErro] = useState<string>();
  const [agora, setAgora] = useState(() => new Date());
  const [executando, iniciar] = useTransition();

  const carregar = useCallback(async () => {
    const r = await detalhesDoDia(data);
    setAgora(new Date());
    if (r.ok && r.dados) setDia(r.dados);
    else if (!r.ok) setErro(r.erro);
  }, [data]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  const alterado = () => {
    void carregar();
    onAlterado();
  };
  const passado = data < hoje;

  return (
    <Folha
      aberto
      onAbertoChange={(v) => !v && onFechar()}
      titulo={formatData(data)}
      descricao={diaDaSemana(data)[0]!.toUpperCase() + diaDaSemana(data).slice(1)}
    >
      {!dia && !erro && (
        <div className="grid place-items-center py-8">
          <Loader2 className="text-muted-foreground size-6 animate-spin" aria-label="Carregando" />
        </div>
      )}
      {erro && <p className="text-destructive text-sm">{erro}</p>}
      {dia && dia.slots.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum turno acontece neste dia da semana. Confira em Minha empresa → Espaços e turnos.
        </p>
      )}
      {dia &&
        base.espacos.map((espaco) => {
          const slots = dia.slots.filter((s) => s.espacoId === espaco.id);
          if (slots.length === 0) return null;
          return (
            <section key={espaco.id} className="space-y-3">
              {base.espacos.length > 1 && <h3 className="font-bold">{espaco.nome}</h3>}
              {slots.map((slot) => {
                const turno = base.turnos.find((t) => t.id === slot.turnoId);
                if (!turno) return null;
                const reservasDoSlot = dia.reservas.filter(
                  (r) => r.turnoId === slot.turnoId && r.espacoId === slot.espacoId,
                );
                const bloqueio = dia.bloqueios.find((b) =>
                  bloqueioValePara(
                    { data: b.data, turnoId: b.turnoId, espacoId: b.espacoId },
                    { ...slot, inicio: new Date(0), fim: new Date(0) },
                  ),
                );
                const ocupadoPorOutro =
                  slot.estado !== 'livre' &&
                  slot.estado !== 'bloqueado' &&
                  reservasDoSlot.length === 0;
                const livre = slot.estado === 'livre' && !passado;
                return (
                  <div
                    key={slot.turnoId}
                    className="rounded-card space-y-3 border p-3"
                    data-testid="slot"
                    aria-label={`${turno.nome} ${espaco.nome}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {turno.nome}{' '}
                        <span className="text-muted-foreground font-normal">
                          {turno.horaInicio}–{fimDoTurno(turno.horaInicio, turno.duracaoMin)}
                        </span>
                      </p>
                      <SeloEstado estado={slot.estado}>
                        {slot.capacidade > 1 && slot.estado === 'livre'
                          ? `Livre (${slot.vagas} de ${slot.capacidade})`
                          : undefined}
                      </SeloEstado>
                    </div>

                    {reservasDoSlot.map((r) => (
                      <ItemReserva
                        key={r.id}
                        reserva={r}
                        hoje={hoje}
                        agora={agora}
                        onAlterado={alterado}
                      />
                    ))}

                    {ocupadoPorOutro && (
                      <p className="text-muted-foreground text-sm">
                        Horário ocupado por um evento de outro turno (conta o intervalo entre
                        eventos).
                      </p>
                    )}

                    {bloqueio && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Lock className="size-4" aria-hidden />
                          {bloqueio.motivo ?? 'Bloqueado'}
                          {bloqueio.turnoId === null && ' (dia inteiro)'}
                        </span>
                        {podeBloquear && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={executando}
                            onClick={() =>
                              iniciar(async () => {
                                const r = await desbloquear(bloqueio.id);
                                if (r.ok) {
                                  toast.sucesso(r.mensagem);
                                  alterado();
                                } else toast.erro(r.erro);
                              })
                            }
                          >
                            <Unlock aria-hidden /> Desbloquear
                          </Button>
                        )}
                      </div>
                    )}

                    {livre && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            onReservar({
                              tipo: 'confirmada',
                              data,
                              turnoId: slot.turnoId,
                              espacoId: slot.espacoId,
                            })
                          }
                        >
                          <CalendarPlus aria-hidden /> Registrar evento
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onReservar({
                              tipo: 'pre_reserva',
                              data,
                              turnoId: slot.turnoId,
                              espacoId: slot.espacoId,
                            })
                          }
                        >
                          Pré-reservar
                        </Button>
                        {podeBloquear && reservasDoSlot.length === 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              onBloquear({
                                de: data,
                                turnoId: slot.turnoId,
                                espacoId: slot.espacoId,
                              })
                            }
                          >
                            <Ban aria-hidden /> Bloquear
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      {dia && podeBloquear && !passado && dia.slots.length > 0 && (
        <Button type="button" variant="outline" onClick={() => onBloquear({ de: data })}>
          <Ban aria-hidden /> Bloquear o dia inteiro
        </Button>
      )}
    </Folha>
  );
}
