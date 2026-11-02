import { ArrowLeft, Check, Minus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DemonstracaoMargem } from '@/components/app/margem/demonstracao';
import { CancelarSolucao, VerificarPagamento } from '@/components/app/solucoes/acoes-assinatura';
import { hrefDaAcao, precoComPeriodo } from '@/components/app/solucoes/cartao';
import { EtiquetaSolucao } from '@/components/app/solucoes/etiqueta';
import { acaoPrincipal, dataBR, etiquetaDoCartao, regraDeCobranca } from '@/domain/modulos';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarSolucao } from '@/server/modulos/carregar';

type Props = { params: Promise<{ codigo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  return { title: codigo.charAt(0).toUpperCase() + codigo.slice(1) };
}

function Lista({
  titulo,
  itens,
  marca = 'check',
}: {
  titulo: string;
  itens: string[];
  marca?: 'check' | 'menos';
}) {
  if (itens.length === 0) return null;
  const Icone = marca === 'check' ? Check : Minus;
  return (
    <section className="bg-card rounded-card border p-5">
      <h2 className="font-bold">{titulo}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {itens.map((i) => (
          <li key={i} className="flex items-start gap-2">
            <Icone
              className={
                marca === 'check'
                  ? 'text-primary-texto mt-0.5 size-4 shrink-0'
                  : 'text-muted-foreground mt-0.5 size-4 shrink-0'
              }
              aria-hidden
            />
            {i}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Detalhes de uma solução: problema, funcionamento, inclusos, limites, preço e a ação. */
export default async function SolucaoPage({ params }: Props) {
  const { codigo } = await params;
  const usuario = await exigirPerfil('dono', 'vendedor');
  const t = await carregarSolucao(usuario, codigo);
  if (!t) notFound();
  const s = t.solucao;
  const etiqueta = etiquetaDoCartao({ situacao: s.situacao, vendaLiberada: s.contratavel });
  const acao = acaoPrincipal({
    situacao: s.situacao,
    acesso: s.acesso,
    vendaLiberada: s.contratavel,
    podeContratar: t.podeContratar,
    configuracaoPendente: s.configuracaoPendente,
  });
  const comAssinatura =
    s.cobranca === 'mensal' &&
    ['pagamento_pendente', 'ativo', 'falha_pagamento'].includes(s.situacao);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        href="/app/solucoes"
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Nossas soluções
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{s.nome}</h1>
          <EtiquetaSolucao texto={etiqueta.texto} tom={etiqueta.tom} />
        </div>
        <p className="text-lg font-semibold">{s.beneficio}</p>
        <p className="text-muted-foreground">{s.explicacao}</p>
      </header>

      <section
        className="bg-card rounded-card flex flex-col gap-3 border p-5"
        aria-labelledby="titulo-preco"
      >
        <h2 id="titulo-preco" className="font-bold">
          Preço e cobrança
        </h2>
        <p className="text-2xl font-bold tabular-nums">{precoComPeriodo(s)}</p>
        <p className="text-muted-foreground text-sm">
          {regraDeCobranca({ ...s, precoCentavos: s.precoCentavos })}
        </p>
        {s.situacao === 'ativo' && s.pagoAte && (
          <p className="text-sm">Pago até {dataBR(s.pagoAte)}.</p>
        )}
        {s.situacao === 'cancelamento_agendado' && s.pagoAte && (
          <p className="text-sm">
            Assinatura cancelada: nada mais será cobrado e o acesso vai até {dataBR(s.pagoAte)}.
          </p>
        )}
        {s.situacao === 'falha_pagamento' && (
          <p className="text-erro text-sm font-semibold">
            A mensalidade venceu sem pagamento. As operações do {s.nome} ficam paradas até o
            pagamento; o que você registrou continua visível.
          </p>
        )}
        {s.situacao === 'estornado' && (
          <p className="text-erro text-sm font-semibold">
            O pagamento foi estornado e o acesso foi suspenso. O histórico continua visível.
          </p>
        )}
        {s.situacao === 'expirado' && (
          <p className="text-sm">A assinatura foi encerrada. O histórico continua visível.</p>
        )}
        {!s.contratavel && s.situacao === 'nao_contratado' && (
          <p className="bg-muted rounded-control p-3 text-sm" data-testid="indisponivel">
            Esta solução ainda não pode ser contratada pelo painel. Estamos finalizando o que ela
            precisa para funcionar do jeito descrito aqui; nada é cobrado antes disso.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {s.situacao === 'pagamento_pendente' && t.podeContratar && s.linkFatura && (
            <a
              href={s.linkFatura}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold"
              data-testid="continuar-pagamento"
            >
              Continuar pagamento
            </a>
          )}
          {(s.situacao === 'falha_pagamento' || s.situacao === 'pagamento_pendente') &&
            t.podeContratar && (
              <>
                {s.situacao === 'falha_pagamento' && s.linkFatura && (
                  <a
                    href={s.linkFatura}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold"
                  >
                    Pagar a mensalidade
                  </a>
                )}
                <VerificarPagamento codigo={s.codigo} />
              </>
            )}
          {acao.tipo !== 'conhecer' && acao.tipo !== 'pagar' && (
            <Link
              href={hrefDaAcao(s, acao.tipo)}
              className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold"
              data-testid="acao-detalhe"
            >
              {acao.rotulo}
            </Link>
          )}
        </div>
        {comAssinatura && t.podeContratar && (
          <div className="border-t pt-3">
            <h3 className="mb-2 text-sm font-bold">Gerenciar assinatura</h3>
            <CancelarSolucao codigo={s.codigo} nome={s.nome} />
          </div>
        )}
      </section>

      <section className="bg-card rounded-card border p-5">
        <h2 className="font-bold">O problema</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{s.problema}</p>
      </section>
      <Lista titulo="Como funciona no Orkestra" itens={s.comoFunciona} />
      <Lista titulo="O que está incluído" itens={s.incluso} />
      <Lista titulo="Limites e cuidados" itens={s.limites} marca="menos" />
      <Lista titulo="Custos fora do Orkestra" itens={s.custosExternos} marca="menos" />
      <Lista titulo="Já faz parte do seu plano (sem custo extra)" itens={s.jaNoPlano} />
      <Lista titulo="Fora desta versão" itens={s.foraDoEscopo} marca="menos" />

      {s.temDemonstracao && s.codigo === 'orkmargem' && <DemonstracaoMargem />}
    </div>
  );
}
