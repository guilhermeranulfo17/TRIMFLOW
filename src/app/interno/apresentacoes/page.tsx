import type { Metadata } from 'next';
import Link from 'next/link';
import { AcoesApresentacao } from '@/components/interno/apresentacoes';
import { CONTAS_APRESENTACAO } from '@/domain/apresentacao/contas';
import { formatData } from '@/domain/dates';
import { listarApresentacoes } from '@/server/apresentacao/criar';
import { obterDb } from '@/server/db/client';
import { siteUrl } from '@/server/env';
import { exigirAdmin } from '@/server/interno/guard';

export const metadata: Metadata = { title: 'Contas de apresentação' };
export const dynamic = 'force-dynamic';
// criar uma conta grava o catálogo e 60 dias de dados numa transação
export const maxDuration = 120;

/**
 * /interno/apresentacoes: uma conta por modelo de negócio para apresentar o sistema em chamada
 * de vídeo. Cortesia (sem cobrança), dados fictícios, editáveis; recriadas só por aqui.
 */
export default async function PaginaApresentacoes() {
  await exigirAdmin();
  const contas = await listarApresentacoes(obterDb(), CONTAS_APRESENTACAO);
  const site = siteUrl();
  return (
    <div className="flex flex-col gap-6" data-testid="apresentacoes">
      <header className="flex flex-col gap-2">
        <Link href="/interno" className="text-muted-foreground text-sm">
          Voltar para a visão geral
        </Link>
        <h1 className="text-2xl font-bold">Contas de apresentação</h1>
        <p className="text-muted-foreground text-sm">
          Uma conta por modelo de negócio, com catálogo, leads, orçamentos, agenda e números
          fictícios. Sem cobrança e editáveis: o que for mexido numa apresentação fica salvo até
          alguém recriar. Ao entrar, este navegador sai do /interno; para voltar, entre de novo.
        </p>
      </header>
      <ul className="grid gap-3 md:grid-cols-2">
        {contas.map((c) => (
          <li
            key={c.conta.chave}
            className="bg-card rounded-card flex flex-col gap-3 border p-4"
            data-testid={`apresentacao-${c.conta.chave}`}
          >
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">{c.conta.rotulo}</span>
              <span className="font-semibold">{c.conta.nome}</span>
              {c.empresaId ? (
                <span className="text-muted-foreground text-xs">
                  {c.leads} leads · criada em {formatData(c.criadaEm!)} ·{' '}
                  <a
                    href={`${site}/b/${c.conta.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="underline"
                  >
                    página pública
                  </a>
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">Ainda não criada.</span>
              )}
            </div>
            <AcoesApresentacao chave={c.conta.chave} existe={!!c.empresaId} />
          </li>
        ))}
      </ul>
    </div>
  );
}
