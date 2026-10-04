import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { formatData } from '@/domain/dates';

/** Faixa enquanto a exclusão da conta está agendada (LGPD, Etapa 9B): data e como desistir. */
export function FaixaExclusao({ quando, fuso }: { quando: string; fuso: string }) {
  return (
    <div
      role="status"
      data-testid="faixa-exclusao"
      className="border-erro/30 bg-erro/10 flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center text-sm"
    >
      <Trash2 className="text-erro size-4 shrink-0" aria-hidden />
      <span>
        Esta conta será excluída em <strong>{formatData(quando, fuso)}</strong>. Até lá, só leitura.
      </span>
      <Link
        href="/app/empresa/privacidade"
        className="text-primary-texto font-semibold underline-offset-2 hover:underline"
      >
        Baixar dados ou desistir
      </Link>
    </div>
  );
}
