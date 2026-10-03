'use client';

import { CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { salvarEspaco, salvarTurno } from '@/server/actions/empresa/agenda-config';
import type { AgendaRapida } from '@/server/onboarding/carregar';
import { RodapePasso } from './navegacao';

/** Passo 4: espaços, capacidade e horário dos turnos sugeridos pelo modelo (edição rápida). */
export function PassoAgenda({ inicial }: { inicial: AgendaRapida }) {
  const toast = useToast();
  const [espacos, setEspacos] = useState(inicial.espacos);
  const [turnos, setTurnos] = useState(inicial.turnos);

  async function salvar(): Promise<boolean> {
    for (const e of espacos) {
      const antes = inicial.espacos.find((x) => x.id === e.id);
      if (JSON.stringify(antes) === JSON.stringify(e)) continue;
      const { id, ...dados } = e;
      const r = await salvarEspaco(id, dados);
      if (!r.ok) {
        toast.erro(`${e.nome || 'Espaço'}: ${r.erro}`);
        return false;
      }
    }
    for (const t of turnos) {
      const antes = inicial.turnos.find((x) => x.id === t.id);
      if (JSON.stringify(antes) === JSON.stringify(t)) continue;
      const { id, ...dados } = t;
      const r = await salvarTurno(id, dados);
      if (!r.ok) {
        toast.erro(`${t.nome || 'Turno'}: ${r.erro}`);
        return false;
      }
    }
    return true;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground">
        Confira onde e quando as festas acontecem. A agenda mostra ao cliente só as datas livres.
      </p>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Espaços</h2>
        {espacos.map((e, i) => (
          <div
            key={e.id}
            className="bg-card rounded-card grid grid-cols-[1fr_7rem] gap-3 border p-4"
          >
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nome do espaço
              <Input
                value={e.nome}
                onChange={(ev) =>
                  setEspacos((xs) =>
                    xs.map((x, j) => (j === i ? { ...x, nome: ev.target.value } : x)),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Convidados
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={e.capacidadeMax}
                aria-label={`Capacidade de ${e.nome}`}
                onChange={(ev) =>
                  setEspacos((xs) =>
                    xs.map((x, j) =>
                      j === i ? { ...x, capacidadeMax: Number(ev.target.value) || 0 } : x,
                    ),
                  )
                }
              />
            </label>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Turnos</h2>
        {turnos.map((t, i) => (
          <div
            key={t.id}
            className="bg-card rounded-card grid grid-cols-[1fr_6.5rem_5.5rem] gap-3 border p-4"
          >
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nome
              <Input
                value={t.nome}
                onChange={(ev) =>
                  setTurnos((xs) =>
                    xs.map((x, j) => (j === i ? { ...x, nome: ev.target.value } : x)),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Começa
              <Input
                type="time"
                value={t.horaInicio}
                aria-label={`Início do turno ${t.nome}`}
                onChange={(ev) =>
                  setTurnos((xs) =>
                    xs.map((x, j) => (j === i ? { ...x, horaInicio: ev.target.value } : x)),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Horas
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                max={24}
                step={0.5}
                value={t.duracaoMin / 60}
                aria-label={`Duração do turno ${t.nome} em horas`}
                onChange={(ev) =>
                  setTurnos((xs) =>
                    xs.map((x, j) =>
                      j === i
                        ? { ...x, duracaoMin: Math.round((Number(ev.target.value) || 0) * 60) }
                        : x,
                    ),
                  )
                }
              />
            </label>
          </div>
        ))}
      </section>
      <p className="bg-card rounded-card text-muted-foreground flex items-start gap-3 border p-4 text-sm">
        <CalendarCheck className="text-primary-texto mt-0.5 size-5 shrink-0" aria-hidden />
        <span>
          <strong className="text-foreground">Já tem festas fechadas?</strong> Depois de terminar,
          registre-as na Agenda para essas datas não aparecerem livres. Fica no seu checklist.
        </span>
      </p>
      <RodapePasso passo={4} antes={salvar} />
    </div>
  );
}
