'use client';

import { Input } from '@/components/ui/input';
import { hmParaMinutos, minutosParaHm } from '@/domain/conversao';

/** Horas e minutos na tela; guarda minutos. */
export function CampoDuracao({
  id,
  valor,
  onChange,
  disabled,
  invalido,
}: {
  id: string;
  valor: number;
  onChange: (minutos: number) => void;
  disabled?: boolean;
  invalido?: boolean;
}) {
  const { horas, minutos } = minutosParaHm(valor);
  const numero = (texto: string) => {
    const n = Number.parseInt(texto, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return (
    <div className="flex items-center gap-2" role="group" aria-labelledby={`${id}-rotulo`}>
      <Input
        id={id}
        inputMode="numeric"
        className="w-20"
        aria-label="Horas"
        aria-invalid={invalido || undefined}
        disabled={disabled}
        value={String(horas)}
        onChange={(e) => onChange(hmParaMinutos(numero(e.target.value), minutos))}
      />
      <span className="text-muted-foreground text-sm">h</span>
      <Input
        id={`${id}-min`}
        inputMode="numeric"
        className="w-20"
        aria-label="Minutos"
        aria-invalid={invalido || undefined}
        disabled={disabled}
        value={String(minutos)}
        onChange={(e) => onChange(hmParaMinutos(horas, Math.min(59, numero(e.target.value))))}
      />
      <span className="text-muted-foreground text-sm">min</span>
    </div>
  );
}
