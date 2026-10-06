'use client';

import { useId, useMemo, useState } from 'react';
import { simular, type ExemploSimulador } from '@/domain/marketing/simulador';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { BotaoTeste } from './ctas';

/**
 * Demonstração: o mesmo motor de preço do link público, rodando no navegador, sobre um catálogo
 * de exemplo com preços fictícios. Nada é enviado ao servidor.
 */
export function SimuladorDemo({ exemplo }: { exemplo: ExemploSimulador }) {
  const id = useId();
  const [tipo, setTipo] = useState(exemplo.tipos[0]!.id);
  const [pacote, setPacote] = useState(
    exemplo.pacotes[Math.min(1, exemplo.pacotes.length - 1)]!.id,
  );
  const [convidados, setConvidados] = useState(exemplo.convidados.inicial);
  const r = useMemo(
    () => simular(exemplo, { tipoEventoId: tipo, pacoteId: pacote, convidados }),
    [exemplo, tipo, pacote, convidados],
  );

  return (
    <div className="ld-vidro grid overflow-hidden rounded-[28px] shadow-[0_40px_100px_-40px_rgb(0_0_0/0.9)] lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-7 p-6 md:p-8">
        <fieldset>
          <legend className="mb-3 text-sm font-bold">Tipo de festa</legend>
          <div className="flex flex-wrap gap-2">
            {exemplo.tipos.map((t) => (
              <Opcao
                key={t.id}
                nome={`${id}-tipo`}
                valor={t.id}
                marcado={tipo === t.id}
                onEscolher={setTipo}
              >
                {t.nome}
              </Opcao>
            ))}
          </div>
        </fieldset>

        <div>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <label htmlFor={`${id}-convidados`} className="text-sm font-bold">
              Convidados
            </label>
            <output
              htmlFor={`${id}-convidados`}
              className="text-2xl font-extrabold tabular-nums"
              data-testid="simulador-convidados"
            >
              {convidados}
            </output>
          </div>
          <input
            id={`${id}-convidados`}
            type="range"
            min={exemplo.convidados.min}
            max={exemplo.convidados.max}
            step={exemplo.convidados.passo}
            value={convidados}
            onChange={(e) => setConvidados(Number(e.target.value))}
            aria-valuetext={`${convidados} convidados`}
            className="accent-primary-texto h-11 w-full cursor-pointer"
          />
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>{exemplo.convidados.min}</span>
            <span>{exemplo.convidados.max}</span>
          </div>
        </div>

        <fieldset>
          <legend className="mb-3 text-sm font-bold">Pacote</legend>
          <div className="grid grid-cols-3 gap-2">
            {exemplo.pacotes.map((p) => (
              <Opcao
                key={p.id}
                nome={`${id}-pacote`}
                valor={p.id}
                marcado={pacote === p.id}
                onEscolher={setPacote}
                largo
              >
                {p.nome}
              </Opcao>
            ))}
          </div>
        </fieldset>
      </div>

      {/* resultado no visual da vitrine (claro neutro, verde-petróleo do buffet de exemplo) */}
      <div className="bg-primary text-primary-foreground m-2 flex flex-col justify-between gap-6 rounded-[22px] p-6 md:p-8">
        <div aria-live="polite">
          <p className="text-sm font-semibold opacity-75">Valor estimado da festa</p>
          <p
            className="mt-1 text-5xl font-extrabold tracking-[-0.04em] tabular-nums"
            data-testid="simulador-total"
          >
            {r.ok ? formatBRL(r.totalCentavos) : '—'}
          </p>
          {r.ok ? (
            <ul className="mt-3 space-y-1 text-sm font-medium opacity-80">
              <li>{formatBRL(r.porConvidadoCentavos)} por convidado</li>
              <li>Sinal de {formatBRL(r.sinalCentavos)} para reservar a data</li>
              <li>Sábado à tarde, no salão do buffet</li>
            </ul>
          ) : (
            <p className="mt-3 text-sm font-medium opacity-80">{r.erros[0]?.mensagem}</p>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-xs font-medium opacity-75">Exemplo com preços fictícios.</p>
          <BotaoTeste
            tamanho="medio"
            className="min-h-12 w-full bg-[#0c0c0c] text-[#f4f4f2] hover:bg-black"
          >
            Quer isso com os seus preços? Teste grátis
          </BotaoTeste>
        </div>
      </div>
    </div>
  );
}

function Opcao({
  nome,
  valor,
  marcado,
  onEscolher,
  children,
  largo = false,
}: {
  nome: string;
  valor: string;
  marcado: boolean;
  onEscolher: (v: string) => void;
  children: React.ReactNode;
  largo?: boolean;
}) {
  return (
    <label
      className={cn(
        'has-[:focus-visible]:ring-ring/60 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-[3px]',
        largo && 'w-full',
        marcado
          ? 'bg-primary text-primary-foreground border-transparent'
          : 'border-white/15 bg-white/[0.03] hover:bg-white/[0.08]',
      )}
    >
      <input
        type="radio"
        name={nome}
        value={valor}
        checked={marcado}
        onChange={() => onEscolher(valor)}
        className="sr-only"
      />
      {children}
    </label>
  );
}
