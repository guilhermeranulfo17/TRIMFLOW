'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CampoDinheiro } from '@/components/app/campos';
import { useToast } from '@/components/app/toast';
import { formatBRL } from '@/domain/money';
import { faixasProporcionais, type FaixaPreco } from '@/domain/onboarding/precos';
import { cn } from '@/lib/utils';
import { confirmarPrecos, type PrecosEntrada } from '@/server/actions/onboarding';
import type { OpcionalPreco, PacotePreco } from '@/server/onboarding/carregar';
import { RodapePasso } from './navegacao';

type Estado = {
  /** valor digitado: 1ª faixa (por faixa) ou valor por pessoa */
  valor: number | null;
  faixas: FaixaPreco[];
  excedente: number | null;
  /** o dono mexeu nas faixas à mão: para de recalcular pela proporção */
  faixasManuais: boolean;
  aberto: boolean;
};

const COBRANCA: Record<string, string> = {
  por_pessoa: 'por pessoa',
  fixo: 'valor fixo',
  por_unidade: 'por unidade',
  por_hora: 'por hora',
};

function inicial(p: PacotePreco): Estado {
  if (p.modeloPreco === 'por_pessoa') {
    return {
      valor: p.confirmado ? p.precoPessoaCentavos : null,
      faixas: [],
      excedente: null,
      faixasManuais: false,
      aberto: false,
    };
  }
  return {
    valor: p.confirmado ? (p.faixas[0]?.valorCentavos ?? null) : null,
    faixas: p.faixas,
    excedente: p.valorExcedenteCentavos,
    faixasManuais: p.confirmado,
    aberto: false,
  };
}

/**
 * Passo 3: o dono digita só o preço de cada pacote. Por faixa: o valor da 1ª faixa; as outras e
 * o excedente saem na proporção do modelo e ficam visíveis em "Ajustar faixas". Nada é
 * confirmado sem digitar; pacote sem preço confirmado não aparece no link.
 */
export function PassoPrecos({
  pacotes,
  opcionais,
}: {
  pacotes: PacotePreco[];
  opcionais: OpcionalPreco[];
}) {
  const toast = useToast();
  const [estados, setEstados] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(pacotes.map((p) => [p.id, inicial(p)])),
  );
  const [precosOpc, setPrecosOpc] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(opcionais.map((o) => [o.id, o.confirmado ? o.precoCentavos : null])),
  );
  const [opcAberto, setOpcAberto] = useState(false);
  const mudar = (id: string, f: (e: Estado) => Estado) =>
    setEstados((s) => ({ ...s, [id]: f(s[id]!) }));

  // faixas efetivas: proporcionais ao modelo enquanto o dono não editar à mão
  const efetivo = useMemo(() => {
    const r: Record<string, { faixas: FaixaPreco[]; excedente: number | null }> = {};
    for (const p of pacotes) {
      const e = estados[p.id]!;
      if (p.modeloPreco === 'por_pessoa' || e.faixasManuais || e.valor === null) {
        r[p.id] = { faixas: e.faixas, excedente: e.excedente };
      } else {
        const prop = faixasProporcionais(p.faixas, p.valorExcedenteCentavos, e.valor);
        r[p.id] = { faixas: prop.faixas, excedente: prop.excedenteCentavos };
      }
    }
    return r;
  }, [estados, pacotes]);

  const comPreco = pacotes.filter((p) => estados[p.id]!.valor !== null);

  async function salvar(): Promise<boolean> {
    if (comPreco.length === 0) {
      toast.erro('Digite o preço de pelo menos um pacote.');
      return false;
    }
    const entrada: PrecosEntrada = {
      pacotes: comPreco.map((p) => {
        const e = estados[p.id]!;
        return p.modeloPreco === 'por_pessoa'
          ? { id: p.id, precoPessoaCentavos: e.valor! }
          : {
              id: p.id,
              faixas: efetivo[p.id]!.faixas.map((f, i) =>
                i === 0 ? { ...f, valorCentavos: e.valor! } : f,
              ),
              valorExcedenteCentavos: efetivo[p.id]!.excedente ?? 0,
            };
      }),
      opcionais: opcionais
        .filter((o) => precosOpc[o.id] !== null && precosOpc[o.id] !== undefined)
        .map((o) => ({ id: o.id, precoCentavos: precosOpc[o.id]! })),
    };
    const r = await confirmarPrecos(entrada);
    if (!r.ok) toast.erro(r.erro);
    return r.ok;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground">
        Digite o preço de cada pacote. Só o que você confirmar aparece para o cliente; pacote sem
        preço fica fora do link até você preencher.
      </p>
      <ul className="flex flex-col gap-3">
        {pacotes.map((p) => {
          const e = estados[p.id]!;
          const ef = efetivo[p.id]!;
          const porFaixa = p.modeloPreco === 'por_faixa';
          const exemplo = porFaixa ? p.faixas[0]?.valorCentavos : p.precoPessoaCentavos;
          const rotulo = porFaixa
            ? `Preço do ${p.nome} até ${p.faixas[0]?.ateConvidados ?? '?'} convidados`
            : `Preço do ${p.nome} por pessoa`;
          return (
            <li key={p.id} className="bg-card rounded-card border p-4" data-testid="preco-pacote">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="font-semibold">{p.nome}</p>
                {p.confirmado && (
                  <span className="text-primary text-xs font-semibold">Confirmado</span>
                )}
              </div>
              <label htmlFor={`preco-${p.id}`} className="text-sm">
                {porFaixa ? `Até ${p.faixas[0]?.ateConvidados ?? '?'} convidados` : 'Por pessoa'}
              </label>
              <div className="mt-1 grid grid-cols-[1fr_auto] items-center gap-3">
                <CampoDinheiro
                  id={`preco-${p.id}`}
                  valor={e.valor}
                  aria-label={rotulo}
                  onChange={(v) => mudar(p.id, (x) => ({ ...x, valor: v }))}
                />
                {exemplo != null && (
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    Exemplo: {formatBRL(exemplo)}
                  </span>
                )}
              </div>
              {porFaixa && e.valor !== null && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="text-primary inline-flex min-h-11 items-center gap-1 text-sm font-semibold"
                    aria-expanded={e.aberto}
                    onClick={() => mudar(p.id, (x) => ({ ...x, aberto: !x.aberto }))}
                  >
                    <ChevronDown
                      className={cn('size-4 transition-transform', e.aberto && 'rotate-180')}
                      aria-hidden
                    />
                    {e.aberto ? 'Esconder as outras faixas' : 'Ver e ajustar as outras faixas'}
                  </button>
                  {!e.aberto && (
                    <p className="text-muted-foreground text-sm">
                      {ef.faixas
                        .slice(1)
                        .map((f) => `até ${f.ateConvidados}: ${formatBRL(f.valorCentavos)}`)
                        .join(' · ')}
                      {ef.excedente !== null && ` · convidado a mais: ${formatBRL(ef.excedente)}`}
                    </p>
                  )}
                  {e.aberto && (
                    <div className="mt-2 grid gap-2">
                      {ef.faixas.slice(1).map((f, i) => (
                        <label
                          key={f.ateConvidados}
                          className="grid grid-cols-[8rem_1fr] items-center gap-2 text-sm"
                        >
                          Até {f.ateConvidados}
                          <CampoDinheiro
                            id={`faixa-${p.id}-${f.ateConvidados}`}
                            valor={f.valorCentavos}
                            onChange={(v) =>
                              mudar(p.id, (x) => ({
                                ...x,
                                faixasManuais: true,
                                faixas: ef.faixas.map((g, j) =>
                                  j === i + 1 ? { ...g, valorCentavos: v ?? 0 } : g,
                                ),
                                excedente: ef.excedente,
                              }))
                            }
                          />
                        </label>
                      ))}
                      <label className="grid grid-cols-[8rem_1fr] items-center gap-2 text-sm">
                        Convidado a mais
                        <CampoDinheiro
                          id={`excedente-${p.id}`}
                          valor={ef.excedente}
                          onChange={(v) =>
                            mudar(p.id, (x) => ({
                              ...x,
                              faixasManuais: true,
                              faixas: ef.faixas,
                              excedente: v,
                            }))
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {opcionais.length > 0 && (
        <div className="bg-card rounded-card border">
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between gap-2 p-4 text-left font-semibold"
            aria-expanded={opcAberto}
            onClick={() => setOpcAberto((a) => !a)}
          >
            Opcionais (pode deixar para depois)
            <ChevronDown
              className={cn('size-5 transition-transform', opcAberto && 'rotate-180')}
              aria-hidden
            />
          </button>
          {opcAberto && (
            <ul className="flex flex-col gap-3 border-t p-4">
              {opcionais.map((o) => (
                <li key={o.id}>
                  <label htmlFor={`opcional-${o.id}`} className="text-sm font-medium">
                    {o.nome}{' '}
                    <span className="text-muted-foreground font-normal">
                      ({COBRANCA[o.cobranca] ?? o.cobranca})
                    </span>
                  </label>
                  <div className="mt-1 grid grid-cols-[1fr_auto] items-center gap-3">
                    <CampoDinheiro
                      id={`opcional-${o.id}`}
                      valor={precosOpc[o.id] ?? null}
                      onChange={(v) => setPrecosOpc((s) => ({ ...s, [o.id]: v }))}
                    />
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      Exemplo: {formatBRL(o.precoCentavos)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground px-4 pb-4 text-xs">
            Opcional sem preço confirmado fica fora do link.
          </p>
        </div>
      )}

      <RodapePasso
        passo={3}
        rotulo="Confirmar preços e continuar"
        antes={salvar}
        desabilitado={comPreco.length === 0}
      />
    </div>
  );
}
