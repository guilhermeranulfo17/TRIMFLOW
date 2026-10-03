import { CreditCard, ExternalLink, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { AcessoSuporte, CancelarAssinatura } from '@/components/app/plano/cancelar-e-suporte';
import { EscolherPlano } from '@/components/app/plano/escolher-plano';
import { formatData, formatDataHora } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { diasRestantesTeste, rotuloPlano } from '@/domain/plano';
import { cn } from '@/lib/utils';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarTelaPlano } from '@/server/cobranca/carregar';

export const metadata: Metadata = { title: 'Plano' };

const STATUS_FATURA: Record<string, { rotulo: string; classe: string }> = {
  pendente: { rotulo: 'Em aberto', classe: 'bg-amber-400/10 text-amber-300' },
  vencida: { rotulo: 'Vencida', classe: 'bg-red-500/10 text-red-300' },
  confirmada: { rotulo: 'Paga', classe: 'bg-emerald-400/10 text-emerald-300' },
  recebida: { rotulo: 'Paga', classe: 'bg-emerald-400/10 text-emerald-300' },
  estornada: { rotulo: 'Estornada', classe: 'bg-muted text-muted-foreground' },
  cancelada: { rotulo: 'Cancelada', classe: 'bg-muted text-muted-foreground' },
};

function linkWhatsappVendas(): string | null {
  const n = process.env.NEXT_PUBLIC_WHATSAPP_VENDAS?.replace(/\D/g, '');
  return n ? `https://wa.me/${n}?text=${encodeURIComponent('Quero assinar o Orkestra.')}` : null;
}

/** Minha empresa → Plano: situação, faturas, assinar/mudar, cancelar e acesso do suporte. */
export default async function PlanoPage({
  searchParams,
}: {
  searchParams: Promise<{ pagamento?: string }>;
}) {
  const usuario = await exigirSessao();
  if (usuario.perfil !== 'dono') {
    return (
      <EmptyState icone={Lock} titulo="Acesso restrito">
        Só o dono do buffet vê o plano.
      </EmptyState>
    );
  }
  const { pagamento } = await searchParams;
  const t = await carregarTelaPlano(usuario);
  const dias = diasRestantesTeste(t.trialAte);
  const aberta = t.assinaturaAberta;
  const proxima = t.faturas
    .filter((f) => f.status === 'pendente' || f.status === 'vencida')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  const whatsapp = linkWhatsappVendas();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {pagamento === 'ok' && (
        <p
          className="rounded-card border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200"
          role="status"
        >
          Pagamento enviado. Assim que o banco confirmar, sua conta é atualizada aqui (Pix costuma
          ser na hora).
        </p>
      )}

      <section className="bg-card rounded-card border p-4 sm:p-5" data-testid="situacao-plano">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CreditCard className="text-primary size-5" aria-hidden />
          {rotuloPlano(t.situacao, dias)}
        </h2>
        <div className="text-muted-foreground mt-2 space-y-1 text-sm">
          {t.situacao === 'trial' && t.trialAte && (
            <p>
              Seu teste vai até{' '}
              <strong className="text-foreground">{formatDataHora(t.trialAte, t.fuso)}</strong>. No
              teste, tudo do Profissional funciona.
            </p>
          )}
          {t.isenta && <p>Conta de cortesia do Orkestra.</p>}
          {t.assinatura && t.assinatura.status !== 'pendente' && (
            <p>
              Plano <strong className="text-foreground">{t.vigente.nome}</strong>{' '}
              {t.assinatura.ciclo === 'anual' ? 'anual' : 'mensal'}:{' '}
              {formatBRL(t.assinatura.valorCentavos)}
              {t.assinatura.cupomCodigo && t.assinatura.cupomAte
                ? ` com o cupom ${t.assinatura.cupomCodigo} até ${formatData(t.assinatura.cupomAte)}`
                : ''}
              .
            </p>
          )}
          {t.assinatura?.pagoAte && (
            <p>
              Pago até{' '}
              <strong className="text-foreground">{formatData(t.assinatura.pagoAte)}</strong>.
            </p>
          )}
          {t.situacao === 'inadimplente' && t.suspendeEm && (
            <p className="text-amber-300">
              Sem o pagamento, a conta fica somente leitura em {formatData(t.suspendeEm)}.
            </p>
          )}
          {t.situacao === 'suspenso' && (
            <p className="text-red-300">
              O painel está somente leitura e o link mostra só a vitrine. Você ainda pode ver tudo e
              pagar por aqui.
            </p>
          )}
          {proxima && (
            <p>
              Próxima cobrança:{' '}
              <strong className="text-foreground">{formatBRL(proxima.valorCentavos)}</strong> em{' '}
              {formatData(proxima.vencimento)}.
            </p>
          )}
        </div>
        {proxima?.link && (
          <a
            href={proxima.link}
            className="bg-primary text-primary-foreground rounded-control mt-4 inline-flex min-h-11 items-center gap-2 px-4 font-semibold"
            data-testid="pagar-fatura"
          >
            Pagar fatura <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </section>

      <section className="bg-card rounded-card border p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-bold">{aberta ? 'Mudar de plano' : 'Assinar'}</h2>
        {t.cobrancaDisponivel ? (
          <EscolherPlano
            planos={t.planos}
            atual={aberta ? { plano: aberta.planoCodigo, ciclo: aberta.ciclo } : null}
            dados={t.dadosCobranca}
            emailPadrao={usuario.email}
          />
        ) : (
          <div className="text-muted-foreground space-y-3 text-sm" data-testid="cobranca-desligada">
            <p>A assinatura pelo painel ainda não está ligada. Fale com a gente para assinar.</p>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener"
                className="bg-primary text-primary-foreground rounded-control inline-flex min-h-11 items-center px-4 font-semibold"
              >
                Fale com a gente no WhatsApp
              </a>
            )}
          </div>
        )}
      </section>

      {t.faturas.length > 0 && (
        <section className="bg-card rounded-card border p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-bold">Faturas</h2>
          <ul className="divide-y" data-testid="lista-faturas">
            {t.faturas.map((f) => {
              const s = STATUS_FATURA[f.status] ?? STATUS_FATURA.pendente!;
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                  <span className="min-w-24 font-medium tabular-nums">
                    {formatData(f.vencimento)}
                  </span>
                  <span className="tabular-nums">{formatBRL(f.valorCentavos)}</span>
                  {f.tipo === 'implantacao' && (
                    <span className="text-muted-foreground text-xs">Implantação</span>
                  )}
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', s.classe)}>
                    {s.rotulo}
                  </span>
                  {f.link && (
                    <a
                      href={f.link}
                      className="text-primary ml-auto inline-flex min-h-11 items-center gap-1 font-semibold"
                    >
                      {f.status === 'pendente' || f.status === 'vencida' ? 'Pagar' : 'Ver'}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="bg-card rounded-card border p-4 sm:p-5">
        <h2 className="mb-3 text-lg font-bold">Suporte</h2>
        <AcessoSuporte ate={t.suporteAte ? formatDataHora(t.suporteAte, t.fuso) : null} />
      </section>

      {aberta && t.cobrancaDisponivel && (
        <section className="px-1">
          <CancelarAssinatura />
        </section>
      )}
    </div>
  );
}
