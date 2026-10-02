import { Bell, Settings2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarcarTodosLidos } from '@/components/app/avisos/marcar-todos';
import { EmptyState } from '@/components/app/empty-state';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { cn } from '@/lib/utils';
import { exigirSessao } from '@/server/auth/sessao';
import { listarAvisos } from '@/server/avisos/carregar';

export const metadata: Metadata = { title: 'Avisos' };

/** Histórico de avisos dos últimos 30 dias (não lidos primeiro). */
export default async function AvisosPage() {
  const usuario = await exigirSessao();
  const avisos = await listarAvisos(usuario, { dias: 30 });
  const naoLidos = avisos.filter((a) => !a.lido).length;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloPagina>Avisos</TituloPagina>
        <div className="-mt-6 flex flex-wrap gap-2">
          <MarcarTodosLidos desabilitado={naoLidos === 0} />
          <Link
            href="/app/conta/avisos"
            className="hover:bg-accent inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
          >
            <Settings2 className="size-4" aria-hidden />
            Preferências
          </Link>
        </div>
      </div>
      {avisos.length === 0 ? (
        <EmptyState icone={Bell} titulo="Nenhum aviso nos últimos 30 dias">
          Você é avisado quando houver ação a tomar: pré-reserva pedida, visita pedida, pré-reserva
          vencendo e o resumo do dia.
        </EmptyState>
      ) : (
        <ul className="bg-card rounded-card divide-y" data-testid="historico-avisos">
          {avisos.map((a) => (
            <li key={a.id}>
              <Link
                href={a.caminho}
                className={cn('hover:bg-accent/60 flex gap-3 p-4', !a.lido && 'bg-primary/5')}
              >
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    a.lido ? 'bg-transparent' : 'bg-primary',
                  )}
                  aria-label={a.lido ? undefined : 'Não lido'}
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{a.titulo}</span>
                  <span className="text-muted-foreground block text-sm">{a.corpo}</span>
                  <span className="text-muted-foreground block text-xs">{a.quando}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
