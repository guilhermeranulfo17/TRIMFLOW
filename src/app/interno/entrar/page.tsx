import type { Metadata } from 'next';
import { FormEntrarInterno } from '@/components/interno/formularios';

export const metadata: Metadata = { title: 'Entrar' };
// Dinâmica para receber o nonce da CSP (Etapa 9B): página estática sai do cache sem nonce.
export const dynamic = 'force-dynamic';

export default function EntrarInterno() {
  return (
    <div className="bg-card rounded-card mx-auto mt-10 max-w-sm border p-5">
      <h1 className="mb-1 text-xl font-bold">Orkestra interno</h1>
      <p className="text-muted-foreground mb-5 text-sm">
        Acesso da equipe, com código de verificação.
      </p>
      <FormEntrarInterno />
    </div>
  );
}
