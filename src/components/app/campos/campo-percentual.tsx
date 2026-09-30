'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { bpParaTexto, textoParaBp } from '@/domain/conversao';

type Props = {
  id: string;
  valor: number | null;
  onChange: (bp: number | null) => void;
  permitirNegativo?: boolean;
  invalido?: boolean;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'id'>;

/** Digita "10" ou "-15", guarda basis points (1% = 100). */
export function CampoPercentual({
  id,
  valor,
  onChange,
  permitirNegativo,
  invalido,
  ...props
}: Props) {
  const [texto, setTexto] = useState(bpParaTexto(valor));
  const ultimo = useRef(valor);

  useEffect(() => {
    if (valor !== ultimo.current) {
      ultimo.current = valor;
      setTexto(bpParaTexto(valor));
    }
  }, [valor]);

  return (
    <div className="relative">
      <Input
        id={id}
        inputMode={permitirNegativo ? 'text' : 'decimal'}
        autoComplete="off"
        placeholder="0"
        aria-invalid={invalido || undefined}
        {...props}
        className="pr-9"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const bp = textoParaBp(e.target.value, { permitirNegativo });
          ultimo.current = bp;
          onChange(bp);
        }}
      />
      <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm">
        %
      </span>
    </div>
  );
}
