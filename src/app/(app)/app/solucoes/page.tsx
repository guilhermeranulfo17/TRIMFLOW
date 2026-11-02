import { Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { CartaoSolucao } from '@/components/app/solucoes/cartao';
import { ehMinha } from '@/domain/modulos';
import { cn } from '@/lib/utils';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarSolucoes } from '@/server/modulos/carregar';

export const metadata: Metadata = { title: 'Nossas soluções' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Nossas soluções: o catálogo dos módulos adicionais e os contratados pela empresa. */
export default async function SolucoesPage({ searchParams }: Props) {
  const usuario = await exigirPerfil('dono', 'vendedor');
  const minhas = (await searchParams).aba === 'minhas';
  const t = await carregarSolucoes(usuario);
  const lista = minhas ? t.solucoes.filter((s) => ehMinha(s.situacao)) : t.solucoes;
  const abas = [
    ['todas', 'Todas as soluções', '/app/solucoes'],
    ['minhas', 'Minhas soluções', '/app/solucoes?aba=minhas'],
  ] as const;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header>
        <p className="text-primary-texto text-sm font-bold">Nossas soluções</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">
          Mais possibilidades para o seu buffet
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Escolha as soluções que ajudam na sua rotina e acompanhe tudo pelo Orkestra.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Cada solução é cobrada à parte da assinatura do sistema e não muda o seu plano.
          {!t.podeContratar && ' Só o dono do buffet contrata e cancela.'}
        </p>
      </header>

      <nav aria-label="Filtrar soluções">
        <ul className="flex gap-2">
          {abas.map(([chave, rotulo, href]) => {
            const ativo = (chave === 'minhas') === minhas;
            return (
              <li key={chave}>
                <Link
                  href={href}
                  aria-current={ativo ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors',
                    ativo ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
                  )}
                  data-testid={`aba-${chave}`}
                >
                  {rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {lista.length === 0 ? (
        <EmptyState icone={Sparkles} titulo="Nenhuma solução contratada">
          Veja em{' '}
          <Link href="/app/solucoes" className="text-primary-texto font-semibold underline">
            Todas as soluções
          </Link>{' '}
          o que cada uma faz e quanto custa.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" data-testid="lista-solucoes">
          {lista.map((s) => (
            <CartaoSolucao key={s.codigo} s={s} podeContratar={t.podeContratar} />
          ))}
        </ul>
      )}
    </div>
  );
}
