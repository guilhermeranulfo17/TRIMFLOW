import { Check } from 'lucide-react';
import Link from 'next/link';
import { acaoPrincipal, etiquetaDoCartao } from '@/domain/modulos';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import type { SolucaoTela } from '@/server/modulos/carregar';
import { EtiquetaSolucao } from './etiqueta';

export const precoComPeriodo = (s: Pick<SolucaoTela, 'precoCentavos' | 'cobranca'>) =>
  `${formatBRL(s.precoCentavos)} ${s.cobranca === 'mensal' ? 'por mês' : 'por festa'}`;

/** Destino do botão principal do cartão (contratar e pagar levam às telas do dono). */
export function hrefDaAcao(s: SolucaoTela, tipo: ReturnType<typeof acaoPrincipal>['tipo']) {
  switch (tipo) {
    case 'acessar':
      return s.ondeUsar?.href ?? `/app/solucoes/${s.codigo}`;
    case 'configurar':
      return s.codigo === 'orkmargem' ? '/app/margem?aba=pacotes' : `/app/solucoes/${s.codigo}`;
    case 'contratar':
      return `/app/solucoes/${s.codigo}/contratar`;
    default:
      return `/app/solucoes/${s.codigo}`;
  }
}

export function CartaoSolucao({ s, podeContratar }: { s: SolucaoTela; podeContratar: boolean }) {
  const etiqueta = etiquetaDoCartao({ situacao: s.situacao, vendaLiberada: s.contratavel });
  const acao = acaoPrincipal({
    situacao: s.situacao,
    acesso: s.acesso,
    vendaLiberada: s.contratavel,
    podeContratar,
    configuracaoPendente: s.configuracaoPendente,
    podeUsar: !s.soDono || podeContratar,
  });
  const destaque =
    acao.tipo === 'contratar' || acao.tipo === 'acessar' || acao.tipo === 'configurar';
  return (
    <li
      className="bg-card rounded-card flex flex-col gap-4 border p-5"
      data-testid={`cartao-${s.codigo}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-primary-texto text-sm font-bold">{s.nome}</p>
          <h2 className="mt-1 text-lg leading-snug font-bold">{s.beneficio}</h2>
        </div>
        <EtiquetaSolucao texto={etiqueta.texto} tom={etiqueta.tom} />
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">{s.explicacao}</p>
      <ul className="space-y-2 text-sm" aria-label={`O que o ${s.nome} entrega`}>
        {s.entregas.map((e) => (
          <li key={e} className="flex items-start gap-2">
            <Check className="text-primary-texto mt-0.5 size-4 shrink-0" aria-hidden />
            {e}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm">
          <span className="font-bold tabular-nums">{precoComPeriodo(s)}</span>
          <span className="text-muted-foreground block text-xs">à parte da assinatura</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {acao.tipo !== 'conhecer' && (
            <Link
              href={`/app/solucoes/${s.codigo}`}
              className="hover:bg-accent inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
            >
              Detalhes
            </Link>
          )}
          <Link
            href={hrefDaAcao(s, acao.tipo)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold',
              destaque
                ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
                : 'hover:bg-accent border',
            )}
            data-testid={`acao-${s.codigo}`}
          >
            {acao.rotulo}
          </Link>
        </div>
      </div>
    </li>
  );
}
