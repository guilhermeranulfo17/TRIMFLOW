'use client';

import { Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Campo } from '@/components/app/form/campo';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import { formatarDocumento } from '@/domain/cobranca/documento';
import { itensDoPlano } from '@/domain/cobranca/limites';
import { type Ciclo, mesesGratisNoAnual, precoDoCiclo } from '@/domain/cobranca/precos';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { assinarPlano, mudarDePlano } from '@/server/actions/cobranca';
import type { PlanoTela } from '@/server/cobranca/carregar';

type Props = {
  planos: PlanoTela[];
  /** já tem assinatura não cancelada: o botão vira "Mudar de plano" */
  atual: { plano: string; ciclo: Ciclo } | null;
  dados: { nome: string; documento: string; email: string } | null;
  emailPadrao: string;
};

/**
 * Assinar ou mudar de plano: planos lado a lado, mensal ou anual ("2 meses grátis"), cupom e
 * dados de cobrança. Assinar abre a fatura do Asaas (Pix, boleto ou cartão).
 */
export function EscolherPlano({ planos, atual, dados, emailPadrao }: Props) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [plano, setPlano] = useState(atual?.plano ?? 'profissional');
  const [ciclo, setCiclo] = useState<Ciclo>(atual?.ciclo ?? 'mensal');
  const [cupom, setCupom] = useState('');
  const [nome, setNome] = useState(dados?.nome ?? '');
  const [documento, setDocumento] = useState(dados ? formatarDocumento(dados.documento) : '');
  const [email, setEmail] = useState(dados?.email ?? emailPadrao);
  const [erros, setErros] = useState<Record<string, string>>({});
  const gratis = Math.max(...planos.map(mesesGratisNoAnual));
  const mesmo = atual && atual.plano === plano && atual.ciclo === ciclo;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErros({});
    iniciar(async () => {
      if (atual) {
        const r = await mudarDePlano({ plano, ciclo });
        if (r.ok) toast.sucesso(r.mensagem);
        else toast.erro(r.erro);
        return;
      }
      const r = await assinarPlano({
        plano: plano as 'essencial' | 'profissional',
        ciclo,
        cupom: cupom || null,
        nome,
        documento,
        email,
      });
      if (!r.ok) {
        setErros(r.campos ?? {});
        toast.erro(r.erro);
        return;
      }
      toast.sucesso(r.mensagem);
      if (r.dados?.urlFatura) window.location.assign(r.dados.urlFatura);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" data-testid="escolher-plano">
      <div
        role="radiogroup"
        aria-label="Cobrança"
        className="bg-muted rounded-control grid grid-cols-2 gap-1 p-1"
      >
        {(['mensal', 'anual'] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={ciclo === c}
            onClick={() => setCiclo(c)}
            className={cn(
              'rounded-control min-h-11 px-3 text-sm font-semibold',
              ciclo === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {c === 'mensal' ? 'Mensal' : `Anual${gratis > 0 ? ` (${gratis} meses grátis)` : ''}`}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Plano" className="grid gap-3 sm:grid-cols-2">
        {planos.map((p) => {
          const escolhido = plano === p.codigo;
          const preco = precoDoCiclo(p, ciclo);
          return (
            <button
              key={p.codigo}
              type="button"
              role="radio"
              aria-checked={escolhido}
              onClick={() => setPlano(p.codigo)}
              data-testid={`plano-${p.codigo}`}
              className={cn(
                'rounded-card bg-card flex flex-col gap-2 border p-4 text-left',
                escolhido && 'border-primary ring-primary/40 ring-2',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-base font-bold">{p.nome}</span>
                {atual?.plano === p.codigo && (
                  <span className="text-primary-texto text-xs font-semibold">Seu plano</span>
                )}
              </span>
              <span className="text-2xl font-bold tabular-nums">
                {formatBRL(preco)}
                <span className="text-muted-foreground text-sm font-normal">
                  /{ciclo === 'anual' ? 'ano' : 'mês'}
                </span>
              </span>
              <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
                {itensDoPlano(p).map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="text-primary-texto mt-0.5 size-4 shrink-0" aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {!atual && (
        <>
          <Campo id="cupom" rotulo="Cupom (opcional)" erro={erros.cupom}>
            <input
              id="cupom"
              className={cn(classeCampo, 'uppercase')}
              value={cupom}
              onChange={(e) => setCupom(e.target.value)}
              autoCapitalize="characters"
              aria-invalid={!!erros.cupom}
            />
          </Campo>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-semibold">Dados de cobrança</legend>
            <Campo id="cobranca-nome" rotulo="Nome ou razão social" erro={erros.nome}>
              <input
                id="cobranca-nome"
                className={classeCampo}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="name"
                aria-invalid={!!erros.nome}
              />
            </Campo>
            <Campo id="cobranca-documento" rotulo="CPF ou CNPJ" erro={erros.documento}>
              <input
                id="cobranca-documento"
                className={classeCampo}
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                onBlur={() => setDocumento((d) => formatarDocumento(d))}
                inputMode="numeric"
                aria-invalid={!!erros.documento}
              />
            </Campo>
            <Campo id="cobranca-email" rotulo="E-mail para a fatura" erro={erros.email}>
              <input
                id="cobranca-email"
                type="email"
                className={classeCampo}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                aria-invalid={!!erros.email}
              />
            </Campo>
          </fieldset>
        </>
      )}

      <button
        type="submit"
        disabled={pendente || !!mesmo}
        className="bg-primary text-primary-foreground rounded-control min-h-11 px-4 font-semibold disabled:opacity-60"
        data-testid="botao-assinar"
      >
        {pendente
          ? 'Aguarde…'
          : atual
            ? mesmo
              ? 'Este é o seu plano'
              : 'Mudar de plano'
            : 'Assinar e pagar'}
      </button>
      {!atual && (
        <p className="text-muted-foreground text-xs">
          Você paga por Pix, boleto ou cartão na página segura do Asaas. Se ainda estiver no teste,
          a primeira cobrança vence no último dia do teste.
        </p>
      )}
    </form>
  );
}
