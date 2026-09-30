'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Folha } from '@/components/app/agenda/folha';
import { CampoDinheiro, CampoTelefone } from '@/components/app/campos';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { diaDaSemanaNumero } from '@/domain/dates';
import { reservaSchema, type ReservaEntrada } from '@/domain/validacao/agenda';
import { criarReserva } from '@/server/actions/agenda';
import type { BaseAgenda } from '@/server/agenda/carregar';

export type PedidoReserva = {
  tipo: 'pre_reserva' | 'confirmada';
  data?: string;
  turnoId?: string;
  espacoId?: string;
};

const numeroOuNulo = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

/** Registrar evento (fechado fora do sistema) ou pré-reservar uma data. */
export function FormReserva({
  pedido,
  base,
  hoje,
  onFechar,
  onSalvo,
}: {
  pedido: PedidoReserva;
  base: BaseAgenda;
  hoje: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const confirmada = pedido.tipo === 'confirmada';
  const form = useForm<ReservaEntrada>({
    resolver: zodResolver(reservaSchema),
    defaultValues: {
      espacoId: pedido.espacoId ?? base.espacos[0]?.id ?? '',
      turnoId: pedido.turnoId ?? '',
      data: pedido.data ?? '',
      tipo: pedido.tipo,
      clienteNome: '',
      clienteWhatsapp: '',
      tipoEventoId: '',
      convidados: null,
      valorTotalCentavos: null,
      sinalCentavos: null,
      sinalPagoEm: '',
      observacoes: '',
    },
  });
  const e = form.formState.errors;
  const data = form.watch('data');
  const turnosDoDia = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return base.turnos;
    const dia = diaDaSemanaNumero(data);
    return base.turnos.filter((t) => t.diasSemana.includes(dia));
  }, [data, base.turnos]);

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await criarReserva(valores);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        onSalvo();
      } else {
        toast.erro(r.erro);
        aplicarErrosServidor(form.setError, r.campos);
      }
    }),
  );

  return (
    <Folha
      aberto
      onAbertoChange={(v) => !v && !salvando && onFechar()}
      titulo={confirmada ? 'Registrar evento' : 'Pré-reservar'}
      descricao={
        confirmada
          ? 'Para eventos já fechados fora do Orkestra: a data fica reservada e o link não a vende.'
          : 'Segura a data pelo prazo de pré-reserva definido em Preços e regras.'
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <fieldset disabled={salvando} className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="reserva-data" rotulo="Data" erro={e.data?.message}>
              <Input id="reserva-data" type="date" min={hoje} {...form.register('data')} />
            </Campo>
            <Campo id="reserva-turno" rotulo="Turno" erro={e.turnoId?.message}>
              <select id="reserva-turno" className={classeCampo} {...form.register('turnoId')}>
                <option value="">Escolha o turno</option>
                {turnosDoDia.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.horaInicio})
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          {base.espacos.length > 1 && (
            <Campo id="reserva-espaco" rotulo="Espaço" erro={e.espacoId?.message}>
              <select id="reserva-espaco" className={classeCampo} {...form.register('espacoId')}>
                {base.espacos.map((es) => (
                  <option key={es.id} value={es.id}>
                    {es.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo id="reserva-cliente" rotulo="Nome do cliente" erro={e.clienteNome?.message}>
            <Input id="reserva-cliente" autoComplete="off" {...form.register('clienteNome')} />
          </Campo>
          <Campo
            id="reserva-whatsapp"
            rotulo="WhatsApp do cliente (opcional)"
            erro={e.clienteWhatsapp?.message}
          >
            <Controller
              control={form.control}
              name="clienteWhatsapp"
              render={({ field }) => (
                <CampoTelefone
                  id="reserva-whatsapp"
                  valor={field.value}
                  onChange={field.onChange}
                  invalido={!!e.clienteWhatsapp}
                />
              )}
            />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="reserva-tipo-evento" rotulo="Tipo de festa (opcional)">
              <select
                id="reserva-tipo-evento"
                className={classeCampo}
                {...form.register('tipoEventoId')}
              >
                <option value="">Não informado</option>
                {base.tiposEvento.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              id="reserva-convidados"
              rotulo="Convidados (opcional)"
              erro={e.convidados?.message}
            >
              <Input
                id="reserva-convidados"
                type="number"
                inputMode="numeric"
                min={1}
                {...form.register('convidados', { setValueAs: numeroOuNulo })}
              />
            </Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              id="reserva-valor"
              rotulo="Valor total (opcional)"
              erro={e.valorTotalCentavos?.message}
            >
              <Controller
                control={form.control}
                name="valorTotalCentavos"
                render={({ field }) => (
                  <CampoDinheiro id="reserva-valor" valor={field.value} onChange={field.onChange} />
                )}
              />
            </Campo>
            <Campo id="reserva-sinal" rotulo="Sinal (opcional)" erro={e.sinalCentavos?.message}>
              <Controller
                control={form.control}
                name="sinalCentavos"
                render={({ field }) => (
                  <CampoDinheiro id="reserva-sinal" valor={field.value} onChange={field.onChange} />
                )}
              />
            </Campo>
          </div>
          {confirmada && (
            <Campo id="reserva-sinal-pago" rotulo="Sinal pago em (opcional)">
              <Input id="reserva-sinal-pago" type="date" {...form.register('sinalPagoEm')} />
            </Campo>
          )}
          <Campo id="reserva-obs" rotulo="Observações (opcional)" erro={e.observacoes?.message}>
            <Textarea id="reserva-obs" rows={3} {...form.register('observacoes')} />
          </Campo>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando} className="min-w-32">
            {salvando ? 'Salvando…' : confirmada ? 'Registrar evento' : 'Pré-reservar'}
          </Button>
        </div>
      </form>
    </Folha>
  );
}
