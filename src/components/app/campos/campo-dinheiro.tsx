'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { centavosParaTexto, textoParaCentavos } from '@/domain/conversao';

type Props = {
  id: string;
  valor: number | null;
  onChange: (centavos: number | null) => void;
  invalido?: boolean;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'id'>;

/** Digita "4.500,00", guarda centavos (inteiro). */
export function CampoDinheiro({ id, valor, onChange, invalido, ...props }: Props) {
  const [texto, setTexto] = useState(centavosParaTexto(valor));
  const ultimo = useRef(valor);

  useEffect(() => {
    // Vazio pode chegar como null ou NaN (formulário): os dois valem "sem valor".
    if (semValor(valor) ? !semValor(ultimo.current) : valor !== ultimo.current) {
      ultimo.current = valor;
      setTexto(centavosParaTexto(valor));
    }
  }, [valor]);

  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm">
        R$
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        aria-invalid={invalido || undefined}
        {...props}
        className="pl-10"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const c = textoParaCentavos(e.target.value);
          ultimo.current = c;
          onChange(c);
        }}
        onBlur={() => {
          const c = textoParaCentavos(texto);
          if (c !== null) setTexto(centavosParaTexto(c));
        }}
      />
    </div>
  );
}

function semValor(v: number | null | undefined): boolean {
  return v === null || v === undefined || Number.isNaN(v);
}
