import type { FieldErrors, FieldValues, Path, UseFormSetError } from 'react-hook-form';

/** Lê a mensagem de erro de um caminho aninhado ("faixas.1.ateConvidados"). */
export function lerErro(erros: FieldErrors | undefined, caminho: string): string | undefined {
  let atual: unknown = erros;
  for (const parte of caminho.split('.')) {
    if (atual === null || typeof atual !== 'object') return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  const msg = (atual as { message?: unknown } | undefined)?.message;
  return typeof msg === 'string' ? msg : undefined;
}

/** Aplica no formulário os erros de campo devolvidos pela server action. */
export function aplicarErrosServidor<T extends FieldValues>(
  setError: UseFormSetError<T>,
  campos: Record<string, string> | undefined,
) {
  for (const [caminho, mensagem] of Object.entries(campos ?? {})) {
    if (caminho !== '_') setError(caminho as Path<T>, { type: 'server', message: mensagem });
  }
}
