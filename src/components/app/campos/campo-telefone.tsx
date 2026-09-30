'use client';

import { Input } from '@/components/ui/input';
import { mascaraTelefoneBR } from '@/domain/mascara';
import { formatPhoneBR } from '@/domain/phone';

/**
 * Telefone com máscara BR. Mostra um E.164 salvo já formatado; o servidor converte o texto
 * digitado de volta para E.164 (`toE164`) antes de gravar.
 */
export function CampoTelefone({
  id,
  valor,
  onChange,
  invalido,
  ...props
}: {
  id: string;
  valor: string;
  onChange: (texto: string) => void;
  invalido?: boolean;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'id'>) {
  const exibido = valor.startsWith('+55') ? formatPhoneBR(valor) : valor;
  return (
    <Input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder="(34) 99135-5450"
      aria-invalid={invalido || undefined}
      {...props}
      value={exibido}
      onChange={(e) => onChange(mascaraTelefoneBR(e.target.value))}
    />
  );
}
