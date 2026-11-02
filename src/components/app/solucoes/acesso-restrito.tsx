import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/app/empty-state';

/** Tela só do dono aberta por outro perfil (o servidor não carrega nenhum dado). */
export function AcessoRestrito({ texto }: { texto: string }) {
  return (
    <EmptyState icone={Lock} titulo="Acesso restrito">
      {texto}
    </EmptyState>
  );
}
