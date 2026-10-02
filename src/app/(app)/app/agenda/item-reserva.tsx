'use client';

import { useState, useTransition } from 'react';
import { SeloEstado } from '@/components/app/agenda/estados';
import Link from 'next/link';
import { CampoDinheiro } from '@/components/app/campos/campo-dinheiro';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { prazoRestante } from '@/domain/agenda';
import { formatData } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { cancelarReserva, confirmarReserva, estenderPreReserva } from '@/server/actions/agenda';
import type { ReservaAgenda } from '@/server/agenda/carregar';

/** Uma reserva ou pré-reserva no painel do dia, com as ações do seu estado. */
export function ItemReserva({
  reserva,
  hoje,
  agora,
  onAlterado,
  mostrarLead = true,
}: {
  reserva: ReservaAgenda;
  hoje: string;
  agora: Date;
  onAlterado: () => void;
  /** na Agenda, leva ao detalhe do lead ligado à reserva */
  mostrarLead?: boolean;
}) {
  const toast = useToast();
  const [modo, setModo] = useState<'confirmar' | 'cancelar' | 'estender' | null>(null);
  const [sinal, setSinal] = useState<number | null>(reserva.sinalCentavos);
  const [pagoEm, setPagoEm] = useState(hoje);
  const [motivo, setMotivo] = useState('');
  const [executando, iniciar] = useTransition();
  const pre = reserva.tipo === 'pre_reserva';

  const executar = (acao: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) =>
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        toast.sucesso(r.mensagem ?? 'Salvo.');
        setModo(null);
        onAlterado();
      } else toast.erro(r.erro ?? 'Não foi possível salvar.');
    });

  return (
    <div className="bg-muted/40 space-y-2 rounded-md border p-3" data-testid="item-reserva">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold break-words">{reserva.clienteNome}</p>
        <span className="flex items-center gap-1.5">
          {reserva.veioDoLink && <SeloLink />}
          <SeloEstado estado={pre ? 'pre_reservado' : 'reservado'} />
        </span>
      </div>
      {mostrarLead && reserva.leadId && (
        <p className="text-muted-foreground -mt-1 text-sm">
          Lead:{' '}
          <Link
            href={`/app/leads/${reserva.leadId}`}
            className="text-primary font-semibold underline-offset-2 hover:underline"
            data-testid="abrir-lead"
          >
            {reserva.leadNome ?? 'Abrir lead'}
          </Link>
        </p>
      )}
      <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
        {pre && reserva.expiraEm && (
          <div className="col-span-2 font-medium text-amber-800">
            {prazoRestante(new Date(reserva.expiraEm), agora)}
          </div>
        )}
        {reserva.clienteWhatsapp && (
          <div className="col-span-2">
            <a
              className="text-primary underline-offset-2 hover:underline"
              href={`https://wa.me/${reserva.clienteWhatsapp.replace('+', '')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {reserva.clienteTelefone ?? reserva.clienteWhatsapp}
            </a>
          </div>
        )}
        {reserva.tipoEventoNome && <div className="col-span-2">{reserva.tipoEventoNome}</div>}
        {reserva.convidados !== null && <div>{reserva.convidados} convidados</div>}
        {reserva.valorTotalCentavos !== null && (
          <div>Total {formatBRL(reserva.valorTotalCentavos)}</div>
        )}
        {reserva.sinalCentavos !== null && (
          <div className="col-span-2">
            Sinal {formatBRL(reserva.sinalCentavos)}
            {reserva.sinalPagoEm ? ` pago em ${formatData(reserva.sinalPagoEm)}` : ''}
          </div>
        )}
        {reserva.observacoes && (
          <div className="col-span-2 whitespace-pre-line">{reserva.observacoes}</div>
        )}
      </dl>

      {modo === null && (
        <div className="flex flex-wrap gap-2">
          {pre && (
            <>
              <Button type="button" size="sm" onClick={() => setModo('confirmar')}>
                Confirmar (sinal pago)
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setModo('estender')}>
                Estender prazo
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setModo('cancelar')}>
            Cancelar
          </Button>
        </div>
      )}

      {modo === 'confirmar' && (
        <div className="bg-card space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Sinal</span>
              <CampoDinheiro id={`sinal-${reserva.id}`} valor={sinal} onChange={setSinal} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Pago em</span>
              <Input type="date" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setModo(null)}>
              Voltar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={executando}
              onClick={() =>
                executar(() =>
                  confirmarReserva(reserva.id, { sinalCentavos: sinal, sinalPagoEm: pagoEm }),
                )
              }
            >
              Confirmar reserva
            </Button>
          </div>
        </div>
      )}

      {modo === 'estender' && (
        <div className="bg-card flex flex-wrap items-center gap-2 rounded-md border p-3">
          <span className="text-sm font-medium">Mais</span>
          {[12, 24, 48].map((h) => (
            <Button
              key={h}
              type="button"
              size="sm"
              variant="outline"
              disabled={executando}
              onClick={() => executar(() => estenderPreReserva(reserva.id, { horas: h }))}
            >
              {h}h
            </Button>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setModo(null)}>
            Voltar
          </Button>
        </div>
      )}

      {modo === 'cancelar' && (
        <div className="bg-card space-y-2 rounded-md border p-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Motivo do cancelamento (opcional)</span>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <p className="text-muted-foreground text-xs">
            A data fica livre na hora. Isso não pode ser desfeito.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setModo(null)}>
              Voltar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={executando}
              onClick={() => executar(() => cancelarReserva(reserva.id, { motivo }))}
            >
              {pre ? 'Cancelar pré-reserva' : 'Cancelar reserva'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Reserva pedida pelo próprio cliente no link público. */
export function SeloLink() {
  return (
    <span
      className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-semibold"
      data-testid="selo-link"
    >
      Veio do link
    </span>
  );
}
