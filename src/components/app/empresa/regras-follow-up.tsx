'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { classeCampo } from '@/components/app/form/estilos';
import { PRAZOS, type RegraFollowUp } from '@/domain/follow-up/regras';
import { EXPLICACAO_REGRA } from '@/domain/follow-up/titulos';
import { cn } from '@/lib/utils';
import { salvarRegraFollowUp } from '@/server/actions/avisos';

function textoPrazo(regra: RegraFollowUp, prazo: number | null): string {
  const p = PRAZOS[regra];
  if (!p || prazo === null) return '';
  return p.unidade === 'horas'
    ? `${prazo} ${prazo === 1 ? 'hora' : 'horas'}`
    : `${prazo} ${prazo === 1 ? 'dia' : 'dias'}`;
}

function Regra({
  regra,
  ligadaInicial,
  prazoInicial,
  podeEditar,
}: {
  regra: RegraFollowUp;
  ligadaInicial: boolean;
  prazoInicial: number | null;
  podeEditar: boolean;
}) {
  const toast = useToast();
  const [ligada, setLigada] = useState(ligadaInicial);
  const [prazo, setPrazo] = useState(prazoInicial);
  const [, iniciar] = useTransition();
  const p = PRAZOS[regra];
  const e = EXPLICACAO_REGRA[regra];

  function salvar(novaLigada: boolean, novoPrazo: number | null) {
    const antes = { ligada, prazo };
    setLigada(novaLigada);
    setPrazo(novoPrazo);
    iniciar(async () => {
      const r = await salvarRegraFollowUp({ regra, ligada: novaLigada, prazo: novoPrazo });
      if (r.ok) toast.sucesso(r.mensagem);
      else {
        setLigada(antes.ligada);
        setPrazo(antes.prazo);
        toast.erro(r.erro);
      }
    });
  }

  const opcoes = p ? Array.from({ length: p.max - p.min + 1 }, (_, i) => p.min + i) : [];
  return (
    <li
      className={cn('bg-card rounded-card flex flex-col gap-3 p-4', !ligada && 'opacity-70')}
      data-testid={`regra-${regra}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{e.titulo}</p>
          <p className="text-muted-foreground text-sm">
            {e.frase.replace('{prazo}', textoPrazo(regra, prazo) || '')}
          </p>
        </div>
        <label className="relative inline-flex min-h-11 shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={ligada}
            disabled={!podeEditar}
            onChange={(ev) => salvar(ev.target.checked, prazo)}
            aria-label={`${e.titulo}: ${ligada ? 'ligada' : 'desligada'}`}
          />
          <span className="bg-input peer-checked:bg-primary peer-focus-visible:ring-ring/50 h-7 w-12 rounded-full transition-colors peer-focus-visible:ring-[3px]" />
          <span className="bg-foreground peer-checked:bg-primary-foreground absolute left-1 size-5 rounded-full transition-transform peer-checked:translate-x-5" />
        </label>
      </div>
      {p && (
        <label className="flex items-center gap-2 text-sm">
          Prazo
          <select
            className={cn(classeCampo, 'h-10 w-auto')}
            value={prazo ?? p.padrao}
            disabled={!podeEditar || !ligada}
            onChange={(ev) => salvar(ligada, Number(ev.target.value))}
            aria-label={`Prazo de ${e.titulo}`}
          >
            {opcoes.map((n) => (
              <option key={n} value={n}>
                {textoPrazo(regra, n)}
              </option>
            ))}
          </select>
        </label>
      )}
    </li>
  );
}

/** Minha empresa → Follow-up: cada regra com liga/desliga e prazo (só o dono altera). */
export function RegrasFollowUp({
  regras,
  podeEditar,
}: {
  regras: { regra: RegraFollowUp; ligada: boolean; prazo: number | null }[];
  podeEditar: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3" data-testid="regras-follow-up">
      {regras.map((r) => (
        <Regra
          key={r.regra}
          regra={r.regra}
          ligadaInicial={r.ligada}
          prazoInicial={r.prazo}
          podeEditar={podeEditar}
        />
      ))}
    </ul>
  );
}
