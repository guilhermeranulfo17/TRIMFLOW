'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { classeCampo } from '@/components/app/form/estilos';
import {
  ROTULO_TIPO_AVISO,
  TIPOS_CONFIGURAVEIS,
  type CanalExterno,
  type TipoAviso,
} from '@/domain/avisos/canais';
import { cn } from '@/lib/utils';
import { salvarPreferenciasAvisos } from '@/server/actions/avisos';

const ROTULO_CANAL: Record<CanalExterno, string> = { push: 'Celular', whatsapp: 'WhatsApp' };

/** Por tipo de aviso, os canais ligados (o painel é sempre ligado) e o horário de silêncio. */
export function PreferenciasAvisos({
  inicial,
  dono,
}: {
  inicial: {
    canais: Record<TipoAviso, CanalExterno[]>;
    disponiveis: Record<TipoAviso, CanalExterno[]>;
    silencioInicio: string;
    silencioFim: string;
    receberDeVendedores: boolean;
  };
  dono: boolean;
}) {
  const toast = useToast();
  const [canais, setCanais] = useState(inicial.canais);
  const [inicio, setInicio] = useState(inicial.silencioInicio);
  const [fim, setFim] = useState(inicial.silencioFim);
  const [receber, setReceber] = useState(inicial.receberDeVendedores);
  const [salvando, iniciar] = useTransition();

  function alternar(t: TipoAviso, c: CanalExterno) {
    setCanais((atual) => {
      const lista = atual[t] ?? [];
      return { ...atual, [t]: lista.includes(c) ? lista.filter((x) => x !== c) : [...lista, c] };
    });
  }

  function salvar() {
    iniciar(async () => {
      const r = await salvarPreferenciasAvisos({
        canais,
        silencioInicio: inicio,
        silencioFim: fim,
        receberDeVendedores: receber,
      });
      if (r.ok) toast.sucesso(r.mensagem);
      else toast.erro(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="canais-por-tipo">
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="py-2 font-semibold">Aviso</th>
              <th className="w-16 py-2 text-center font-semibold">Painel</th>
              <th className="w-16 py-2 text-center font-semibold">Celular</th>
              <th className="w-20 py-2 text-center font-semibold">WhatsApp</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {TIPOS_CONFIGURAVEIS.map((t) => (
              <tr key={t}>
                <td className="py-1 pr-2 font-medium">{ROTULO_TIPO_AVISO[t]}</td>
                <td className="text-muted-foreground text-center text-xs">sempre</td>
                {(['push', 'whatsapp'] as const).map((c) => {
                  const pode = inicial.disponiveis[t]?.includes(c);
                  return (
                    <td key={c} className="text-center">
                      {pode ? (
                        <label className="inline-grid size-11 cursor-pointer place-items-center">
                          <input
                            type="checkbox"
                            className="accent-primary size-5"
                            checked={canais[t]?.includes(c) ?? false}
                            onChange={() => alternar(t, c)}
                            aria-label={`${ROTULO_TIPO_AVISO[t]} no ${ROTULO_CANAL[c]}`}
                          />
                        </label>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Horário de silêncio</legend>
        <p className="text-muted-foreground text-sm">
          Nesse horário, celular e WhatsApp esperam; o aviso aparece no painel na hora. O resumo do
          dia não espera.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">
            Das
            <input
              type="time"
              aria-label="Início do silêncio"
              className={cn(classeCampo, 'ml-2 inline-block w-32')}
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </label>
          <label className="text-sm">
            às
            <input
              type="time"
              aria-label="Fim do silêncio"
              className={cn(classeCampo, 'ml-2 inline-block w-32')}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      {dono && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-5"
            checked={receber}
            onChange={(e) => setReceber(e.target.checked)}
          />
          Receber também os avisos dos leads que têm vendedor responsável
        </label>
      )}

      <Button type="button" onClick={salvar} disabled={salvando} className="self-start">
        Salvar preferências
      </Button>
    </div>
  );
}
