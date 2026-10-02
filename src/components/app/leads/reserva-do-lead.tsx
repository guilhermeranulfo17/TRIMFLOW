'use client';

import { useRouter } from 'next/navigation';
import { ItemReserva } from '@/app/(app)/app/agenda/item-reserva';
import type { ReservaAgenda } from '@/server/agenda/carregar';

/**
 * Pré-reserva ou reserva ativa no detalhe do lead: as MESMAS ações e funções da Agenda
 * (confirmar sinal, estender prazo, cancelar), então os dois caminhos dão o mesmo resultado.
 */
export function ReservaDoLead({ reservas, hoje }: { reservas: ReservaAgenda[]; hoje: string }) {
  const router = useRouter();
  const agora = new Date();
  return (
    <div className="flex flex-col gap-2" data-testid="reserva-lead">
      {reservas.map((r) => (
        <ItemReserva
          key={r.id}
          reserva={r}
          hoje={hoje}
          agora={agora}
          mostrarLead={false}
          onAlterado={() => router.refresh()}
        />
      ))}
    </div>
  );
}
