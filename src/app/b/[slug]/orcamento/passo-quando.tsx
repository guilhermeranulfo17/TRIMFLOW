'use client';

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { montarCalendario, somarMes } from '@/domain/agenda/calendario';
import { diaDaSemana, formatData, somarDias } from '@/domain/dates';
import { espacoEscolhido, pessoas, turnosNaData } from '@/domain/publico/passos';
import { verDisponibilidade, type DiaDisponivel } from '@/server/actions/publico';
import { classeOpcao, Contador } from '@/components/orcamento/contador';
import type { PropsPasso } from './tipos';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function nomeDoMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  const nome = MESES[m - 1]!;
  return `${nome[0]!.toUpperCase()}${nome.slice(1)} de ${ano}`;
}

/** Passo 2: espaço (se houver mais de um), data, horário e convidados. */
export default function PassoQuando({ slug, vitrine, escolhas, alterar }: PropsPasso) {
  const espaco = espacoEscolhido(vitrine.espacos, escolhas);
  const minimo = somarDias(vitrine.hoje, vitrine.antecedenciaMinDias);
  const mesInicial = (escolhas.data ?? minimo).slice(0, 7);
  const [mes, setMes] = useState(mesInicial);
  const [dias, setDias] = useState<Record<string, DiaDisponivel[]>>({});
  const [erro, setErro] = useState<string | null>(null);
  const chave = `${mes}:${espaco?.id ?? 'todos'}`;
  const linhas = dias[chave];

  useEffect(() => {
    if (dias[chave]) return;
    let ativo = true;
    setErro(null);
    void verDisponibilidade(slug, mes, espaco?.id).then((r) => {
      if (!ativo) return;
      if (r.ok) setDias((d) => ({ ...d, [chave]: r.dados }));
      else setErro(r.erro);
    });
    return () => {
      ativo = false;
    };
  }, [slug, mes, espaco?.id, chave, dias]);

  const livresPorData = useMemo(() => {
    const mapa = new Map<string, Set<string>>();
    for (const l of linhas ?? []) {
      if (!l.disponivel) continue;
      if (!mapa.has(l.data)) mapa.set(l.data, new Set());
      mapa.get(l.data)!.add(l.turnoId);
    }
    return mapa;
  }, [linhas]);

  const calendario = useMemo(() => montarCalendario(mes, []), [mes]);
  const turnosDoDia = escolhas.data ? turnosNaData(vitrine.turnos, escolhas.data) : [];
  const livresNoDia = escolhas.data ? livresPorData.get(escolhas.data) : undefined;

  // Mudou espaço ou data e o horário escolhido não está mais livre: limpa.
  useEffect(() => {
    if (!linhas || !escolhas.data || !escolhas.turnoId) return;
    if (escolhas.data.slice(0, 7) !== mes) return;
    if (!livresPorData.get(escolhas.data)?.has(escolhas.turnoId)) alterar({ turnoId: undefined });
  }, [linhas, livresPorData, escolhas.data, escolhas.turnoId, mes, alterar]);

  const quantidade = (faixaId: string) =>
    escolhas.criancas.find((c) => c.faixaIdadeId === faixaId)?.quantidade ?? 0;
  const mudarCriancas = (faixaId: string, q: number) =>
    alterar({
      criancas: [
        ...escolhas.criancas.filter((c) => c.faixaIdadeId !== faixaId),
        ...(q > 0 ? [{ faixaIdadeId: faixaId, quantidade: q }] : []),
      ],
    });

  return (
    <div className="flex flex-col gap-8">
      {vitrine.espacos.length > 1 && (
        <fieldset>
          <legend className="text-lg font-bold">Onde vai ser?</legend>
          <div className="mt-3 flex flex-col gap-2" role="radiogroup">
            {vitrine.espacos.map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={escolhas.espacoId === e.id}
                onClick={() => alterar({ espacoId: e.id, turnoId: undefined })}
                className={classeOpcao(escolhas.espacoId === e.id)}
              >
                <span className="flex-1">
                  <span className="block font-bold">{e.nome}</span>
                  <span className="text-muted-foreground text-sm">
                    {e.noLocalDoCliente ? 'No local da festa · ' : ''}até {e.capacidadeMax} pessoas
                  </span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {espaco && (
        <section aria-labelledby="titulo-data">
          <div className="flex items-center justify-between">
            <h2 id="titulo-data" className="text-lg font-bold whitespace-nowrap">
              Data da festa
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMes(somarMes(mes, -1))}
                disabled={mes <= vitrine.hoje.slice(0, 7)}
                className="hover:bg-accent grid size-12 place-items-center rounded-full disabled:opacity-30"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <span className="w-32 text-center text-sm font-semibold" aria-live="polite">
                {nomeDoMes(mes)}
              </span>
              <button
                type="button"
                onClick={() => setMes(somarMes(mes, 1))}
                disabled={mes >= somarMes(vitrine.hoje.slice(0, 7), 24)}
                className="hover:bg-accent grid size-12 place-items-center rounded-full disabled:opacity-30"
                aria-label="Próximo mês"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </div>
          </div>
          <div
            className="mt-2 grid grid-cols-7 gap-1 text-center"
            role="grid"
            aria-label={`Datas de ${nomeDoMes(mes)}`}
          >
            {SEMANA.map((d, i) => (
              <span
                key={i}
                className="text-muted-foreground py-1 text-xs font-semibold"
                aria-hidden
              >
                {d}
              </span>
            ))}
            {calendario.semanas.flat().map((dia) => {
              if (!dia.doMes) return <span key={dia.data} aria-hidden />;
              const livre = (livresPorData.get(dia.data)?.size ?? 0) > 0;
              const marcado = escolhas.data === dia.data;
              const rotulo = `${diaDaSemana(dia.data)}, ${formatData(dia.data)}, ${livre ? 'disponível' : 'indisponível'}`;
              return (
                <button
                  key={dia.data}
                  type="button"
                  disabled={!livre}
                  onClick={() => alterar({ data: dia.data, turnoId: undefined })}
                  aria-pressed={marcado}
                  aria-label={rotulo}
                  data-testid={`data-${dia.data}`}
                  className={[
                    'grid aspect-square min-h-11 place-items-center rounded-full text-base font-semibold transition-colors',
                    'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                    marcado
                      ? 'bg-primary text-primary-foreground'
                      : livre
                        ? 'hover:bg-accent text-foreground'
                        : 'text-muted-foreground/50 line-through',
                  ].join(' ')}
                >
                  {Number(dia.data.slice(8))}
                </button>
              );
            })}
          </div>
          {!linhas && !erro && (
            <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Buscando datas livres…
            </p>
          )}
          {erro && (
            <p role="alert" className="text-destructive mt-2 text-sm font-semibold">
              {erro}
            </p>
          )}
          {linhas && livresPorData.size === 0 && (
            <p className="text-muted-foreground mt-2 text-sm">
              Nenhuma data livre neste mês. Veja o próximo.
            </p>
          )}
        </section>
      )}

      {escolhas.data && (
        <fieldset>
          <legend className="text-lg font-bold">Horário</legend>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
            {turnosDoDia.map((t) => {
              const livre = livresNoDia?.has(t.id) ?? false;
              const marcado = escolhas.turnoId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  disabled={!livre}
                  onClick={() => alterar({ turnoId: t.id })}
                  className={classeOpcao(marcado, !livre)}
                  data-testid="turno"
                >
                  <span className="flex-1">
                    <span className="block font-bold">{t.nome}</span>
                    <span className="text-muted-foreground text-sm">
                      {livre ? `começa às ${t.horaInicio}` : 'Indisponível'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {escolhas.turnoId && (
        <fieldset>
          <legend className="text-lg font-bold">Quantos convidados?</legend>
          <div className="mt-2 divide-y">
            <Contador
              id="adultos"
              rotulo="Adultos"
              valor={escolhas.adultos ?? 0}
              aoMudar={(v) => alterar({ adultos: v })}
            />
            {vitrine.faixasIdade.map((f) => (
              <Contador
                key={f.id}
                id={`faixa-${f.id}`}
                rotulo={`Crianças de ${f.rotulo}`}
                valor={quantidade(f.id)}
                aoMudar={(v) => mudarCriancas(f.id, v)}
              />
            ))}
          </div>
          {espaco && pessoas(escolhas) > 0 && (
            <p className="text-muted-foreground mt-2 text-sm">
              {pessoas(escolhas)} pessoas · {espaco.nome} recebe até {espaco.capacidadeMax}
            </p>
          )}
        </fieldset>
      )}

      {escolhas.turnoId && espaco?.noLocalDoCliente && (
        <div>
          <label htmlFor="local" className="text-lg font-bold">
            Bairro e cidade da festa
          </label>
          <input
            id="local"
            value={escolhas.localCliente ?? ''}
            onChange={(e) => alterar({ localCliente: e.target.value.slice(0, 120) })}
            placeholder="Ex.: Centro, Uberlândia"
            autoComplete="address-level2"
            className="focus-visible:ring-ring/50 rounded-control mt-2 h-12 w-full border px-3 text-base focus-visible:ring-[3px] focus-visible:outline-none"
          />
          <p className="text-muted-foreground mt-1 text-sm">
            O deslocamento é combinado com o buffet depois.
          </p>
        </div>
      )}
    </div>
  );
}
