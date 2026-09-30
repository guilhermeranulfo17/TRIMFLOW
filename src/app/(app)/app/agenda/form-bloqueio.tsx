'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Folha } from '@/components/app/agenda/folha';
import { Campo } from '@/components/app/form/campo';
import { aplicarErrosServidor } from '@/components/app/form/erros';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { bloqueioSchema, type BloqueioEntrada } from '@/domain/validacao/agenda';
import { bloquearDatas } from '@/server/actions/agenda';
import type { BaseAgenda } from '@/server/agenda/carregar';

export type PedidoBloqueio = { de?: string; turnoId?: string; espacoId?: string };

/** Bloquear um dia, um turno ou um período inteiro (ex.: férias coletivas). */
export function FormBloqueio({
  pedido,
  base,
  hoje,
  onFechar,
  onSalvo,
}: {
  pedido: PedidoBloqueio;
  base: BaseAgenda;
  hoje: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const form = useForm<BloqueioEntrada>({
    resolver: zodResolver(bloqueioSchema),
    defaultValues: {
      de: pedido.de ?? '',
      ate: pedido.de ?? '',
      turnoId: pedido.turnoId ?? '',
      espacoId: pedido.espacoId ?? '',
      motivo: '',
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((valores) =>
    iniciar(async () => {
      const r = await bloquearDatas(valores);
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
      titulo="Bloquear datas"
      descricao="Datas bloqueadas não podem ser reservadas nem aparecem como livres no link."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <fieldset disabled={salvando} className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo id="bloqueio-de" rotulo="De" erro={e.de?.message}>
              <Input
                id="bloqueio-de"
                type="date"
                min={hoje}
                {...form.register('de', {
                  onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
                    const ate = form.getValues('ate');
                    if (!ate || ate < ev.target.value) form.setValue('ate', ev.target.value);
                  },
                })}
              />
            </Campo>
            <Campo id="bloqueio-ate" rotulo="Até" erro={e.ate?.message}>
              <Input id="bloqueio-ate" type="date" min={hoje} {...form.register('ate')} />
            </Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="bloqueio-turno" rotulo="Turno">
              <select id="bloqueio-turno" className={classeCampo} {...form.register('turnoId')}>
                <option value="">Dia inteiro</option>
                {base.turnos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.horaInicio})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="bloqueio-espaco" rotulo="Espaço">
              <select id="bloqueio-espaco" className={classeCampo} {...form.register('espacoId')}>
                <option value="">Todos os espaços</option>
                {base.espacos.map((es) => (
                  <option key={es.id} value={es.id}>
                    {es.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo id="bloqueio-motivo" rotulo="Motivo (opcional)" erro={e.motivo?.message}>
            <Input
              id="bloqueio-motivo"
              placeholder="Ex.: férias coletivas, manutenção"
              {...form.register('motivo')}
            />
          </Campo>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando} className="min-w-32">
            {salvando ? 'Bloqueando…' : 'Bloquear'}
          </Button>
        </div>
      </form>
    </Folha>
  );
}
