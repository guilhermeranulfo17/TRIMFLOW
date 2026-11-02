'use client';

import { Minus, Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { maxCriancas, simular, type ExemploSimulador } from '@/domain/marketing/simulador';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { BotaoTeste } from './ctas';

/** "2026-11-07" → "07/11" (data civil, sem fuso). */
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pct = (bp: number) => `${Math.round(bp / 100)}%`;

/**
 * Demonstração: o mesmo motor de preço do link público, rodando no navegador, sobre um catálogo
 * de exemplo com preços fictícios. Nada é enviado ao servidor: não gera lead, reserva nem número.
 */
export function SimuladorDemo({ exemplo }: { exemplo: ExemploSimulador }) {
  const id = useId();
  const [tipo, setTipo] = useState(exemplo.tipos[0]!.id);
  const [pacote, setPacote] = useState(
    exemplo.pacotes[Math.min(1, exemplo.pacotes.length - 1)]!.id,
  );
  const [convidados, setConvidados] = useState(exemplo.convidados.inicial);
  const [criancas, setCriancas] = useState(0);
  const [adicionais, setAdicionais] = useState<string[]>([]);

  const limiteCriancas = maxCriancas(exemplo, convidados);
  const criancasValidas = Math.min(criancas, limiteCriancas);
  const r = useMemo(
    () =>
      simular(exemplo, {
        tipoEventoId: tipo,
        pacoteId: pacote,
        convidados,
        criancas: criancasValidas,
        adicionais,
      }),
    [exemplo, tipo, pacote, convidados, criancasValidas, adicionais],
  );

  const { min, max, passo } = exemplo.convidados;
  const mudarConvidados = (n: number) => setConvidados(Math.min(max, Math.max(min, n)));
  const nomePacote = exemplo.pacotes.find((p) => p.id === pacote)?.nome ?? '';
  const turno = exemplo.contexto.turnos.find((t) => t.id === exemplo.turnoId)?.nome ?? '';
  const espaco = exemplo.contexto.espacos.find((e) => e.id === exemplo.espacoId)?.nome ?? '';
  const adultos = convidados - criancasValidas;

  return (
    <div className="ld-vidro grid overflow-hidden rounded-[28px] shadow-[0_40px_100px_-40px_rgb(0_0_0/0.9)] lg:grid-cols-[1.15fr_1fr]">
      <form className="min-w-0 space-y-7 p-5 sm:p-6 md:p-8" onSubmit={(e) => e.preventDefault()}>
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

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor={`${id}-convidados`} className="text-sm font-bold">
              Convidados
            </label>
            <div className="flex items-center gap-2">
              <BotaoPasso
                rotulo={`Menos ${passo} convidados`}
                onClick={() => mudarConvidados(convidados - passo)}
                desligado={convidados <= min}
              >
                <Minus className="size-4" aria-hidden />
              </BotaoPasso>
              <output
                htmlFor={`${id}-convidados`}
                className="min-w-[3ch] text-center text-2xl font-extrabold tabular-nums"
                data-testid="simulador-convidados"
              >
                {convidados}
              </output>
              <BotaoPasso
                rotulo={`Mais ${passo} convidados`}
                onClick={() => mudarConvidados(convidados + passo)}
                desligado={convidados >= max}
              >
                <Plus className="size-4" aria-hidden />
              </BotaoPasso>
            </div>
          </div>
          <input
            id={`${id}-convidados`}
            type="range"
            min={min}
            max={max}
            step={passo}
            value={convidados}
            onChange={(e) => mudarConvidados(Number(e.target.value))}
            aria-valuetext={`${convidados} convidados`}
            className="accent-primary-texto h-11 w-full cursor-pointer"
          />
          <div className="text-muted-foreground flex justify-between text-xs" aria-hidden>
            <span>{min}</span>
            <span>{max}</span>
          </div>
        </div>

        {exemplo.criancas && (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm">
              <span className="font-bold" id={`${id}-criancas`}>
                Crianças de {exemplo.criancas.rotulo}
              </span>
              <span className="text-muted-foreground block text-xs">
                Entre os convidados; neste exemplo pagam {pct(exemplo.criancas.fatorBp)}
              </span>
            </p>
            <div
              className="flex shrink-0 items-center gap-2"
              role="group"
              aria-labelledby={`${id}-criancas`}
            >
              <BotaoPasso
                rotulo="Menos uma criança"
                onClick={() => setCriancas(Math.max(0, criancasValidas - 1))}
                desligado={criancasValidas <= 0}
              >
                <Minus className="size-4" aria-hidden />
              </BotaoPasso>
              <output
                className="min-w-[2ch] text-center text-xl font-extrabold tabular-nums"
                data-testid="simulador-criancas"
                aria-label={`${criancasValidas} crianças de ${exemplo.criancas.rotulo}`}
              >
                {criancasValidas}
              </output>
              <BotaoPasso
                rotulo="Mais uma criança"
                onClick={() => setCriancas(Math.min(limiteCriancas, criancasValidas + 1))}
                desligado={criancasValidas >= limiteCriancas}
              >
                <Plus className="size-4" aria-hidden />
              </BotaoPasso>
            </div>
          </div>
        )}

        {exemplo.adicionais.length > 0 && (
          <fieldset>
            <legend className="mb-3 text-sm font-bold">Adicionais</legend>
            <div className="flex flex-wrap gap-2">
              {exemplo.adicionais.map((a) => {
                const marcado = adicionais.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={cn(
                      'has-[:focus-visible]:ring-ring/60 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-[3px]',
                      marcado
                        ? 'bg-primary text-primary-foreground border-transparent'
                        : 'border-white/15 bg-white/[0.03] hover:bg-white/[0.08]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() =>
                        setAdicionais((atual) =>
                          marcado ? atual.filter((x) => x !== a.id) : [...atual, a.id],
                        )
                      }
                      className="sr-only"
                    />
                    {marcado ? (
                      <Minus className="size-4" aria-hidden />
                    ) : (
                      <Plus className="size-4" aria-hidden />
                    )}
                    {a.nome}
                    <span className={cn('font-medium', marcado ? 'opacity-75' : 'text-white/60')}>
                      {formatBRL(a.precoCentavos)}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </form>

      {/* resultado: o que o cliente vê no link (e o que o buffet recebe junto com o contato) */}
      <div className="bg-primary text-primary-foreground m-2 flex min-w-0 flex-col justify-between gap-6 rounded-[22px] p-5 sm:p-6 md:p-8">
        <div>
          <p className="text-sm font-semibold opacity-75">Orçamento da festa</p>
          <p className="mt-1 text-sm font-bold" data-testid="simulador-resumo">
            Pacote {nomePacote} · {convidados} convidados
            {criancasValidas > 0 && ` (${adultos} adultos e ${criancasValidas} crianças)`}
          </p>
          <p className="text-xs font-medium opacity-75">
            Sábado, {diaMes(exemplo.data)} · {turno} · {espaco}
          </p>
          <p
            className="mt-4 text-[2.6rem] leading-none font-extrabold tracking-[-0.04em] tabular-nums sm:text-5xl"
            data-testid="simulador-total"
          >
            {r.ok ? formatBRL(r.totalCentavos) : '—'}
          </p>
          {r.ok ? (
            <>
              <p className="mt-3 rounded-2xl bg-black/10 px-4 py-3 text-sm font-semibold">
                Sinal para reservar a data:{' '}
                <span className="whitespace-nowrap tabular-nums" data-testid="simulador-sinal">
                  {formatBRL(r.sinalCentavos)}
                </span>
              </p>
              <ul
                className="mt-4 space-y-1.5 text-sm font-medium"
                aria-label="Como o valor foi calculado"
              >
                {r.linhas.map((l, i) => (
                  <li key={`${l.tipo}-${i}`} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 opacity-80">{l.descricao}</span>
                    <span className="shrink-0 tabular-nums">
                      {l.subtotalCentavos < 0 ? '− ' : ''}
                      {formatBRL(Math.abs(l.subtotalCentavos))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-sm font-medium opacity-80">{r.erros[0]?.mensagem}</p>
          )}
          {/* leitor de tela: só o essencial, depois de cada mudança */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {r.ok
              ? `Pacote ${nomePacote}, ${convidados} convidados: total ${formatBRL(r.totalCentavos)}, sinal ${formatBRL(r.sinalCentavos)}.`
              : r.erros[0]?.mensagem}
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-medium opacity-80">
            Valores fictícios. No seu link, entram os seus pacotes, preços e regras.
          </p>
          <BotaoTeste
            tamanho="medio"
            className="min-h-12 w-full bg-[#0c0c0c] text-[#f4f4f2] hover:bg-black"
          >
            Quero usar com os meus pacotes
          </BotaoTeste>
        </div>
      </div>
    </div>
  );
}

function BotaoPasso({
  rotulo,
  onClick,
  desligado,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  desligado: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      onClick={onClick}
      disabled={desligado}
      className="focus-visible:ring-ring/60 grid size-11 place-items-center rounded-full border border-white/15 bg-white/[0.03] transition-colors hover:bg-white/[0.08] focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
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
        'has-[:focus-visible]:ring-ring/60 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-4 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-[3px]',
        largo && 'w-full px-2',
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
