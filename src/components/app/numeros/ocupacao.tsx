import { formatData } from '@/domain/dates';
import { textoPromocao } from '@/domain/numeros';
import { formatBp } from '@/domain/percent';
import type { OcupacaoTela } from '@/server/numeros/carregar';
import { BotaoCopiar } from '@/components/app/divulgacao/botao-copiar';
import { Barra } from './barra';
import { Bloco, TabelaDoGrafico } from './comum';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/** Ocupação dos próximos 3 meses: por mês (barras) e mapa de calor dia da semana × turno. */
export function Ocupacao({ o }: { o: OcupacaoTela }) {
  const celula = (dia: number, turnoId: string) =>
    o.porDiaTurno.find((x) => x.dia === dia && x.turnoId === turnoId);
  const diasComTurno = DIAS.map((_, d) => d).filter((d) => o.porDiaTurno.some((x) => x.dia === d));
  return (
    <Bloco
      titulo="Ocupação da agenda"
      descricao={`De ${formatData(o.de)} a ${formatData(o.ate)}: ${o.total.bp === null ? 'sem horários' : `${formatBp(o.total.bp)} ocupada`}.`}
      testid="ocupacao"
    >
      <ul className="flex flex-col gap-3">
        {o.porMes.map((m) => (
          <li key={m.mes} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span className="capitalize">{nomeMes(m.mes)}</span>
              <span className="tabular-nums">
                {m.reservados}/{m.disponiveis} · {m.bp === null ? '—' : formatBp(m.bp)}
              </span>
            </div>
            <Barra fracao={m.disponiveis ? m.reservados / m.disponiveis : 0} />
          </li>
        ))}
      </ul>
      {o.turnos.length > 0 && diasComTurno.length > 0 && (
        <div className="overflow-x-auto">
          <table
            className="w-full text-center text-xs"
            aria-label={`Mapa de ocupação por dia da semana e turno: ${o.porDiaTurno
              .map(
                (x) =>
                  `${DIAS_EXTENSO[x.dia]} ${o.turnos.find((t) => t.id === x.turnoId)?.nome ?? ''} ${x.bp === null ? '—' : formatBp(x.bp)}`,
              )
              .join('; ')}`}
          >
            <thead>
              <tr>
                <th className="w-16" />
                {diasComTurno.map((d) => (
                  <th key={d} className="text-muted-foreground px-0.5 pb-1 font-medium">
                    {DIAS[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {o.turnos.map((t) => (
                <tr key={t.id}>
                  <th className="text-muted-foreground truncate pr-1 text-left font-medium">
                    {t.nome}
                  </th>
                  {diasComTurno.map((d) => {
                    const c = celula(d, t.id);
                    if (!c) return <td key={d} className="p-0.5" />;
                    const f = c.disponiveis ? c.reservados / c.disponiveis : 0;
                    return (
                      <td key={d} className="p-0.5">
                        <svg
                          viewBox="0 0 40 28"
                          className="h-7 w-full"
                          role="img"
                          aria-label={`${DIAS_EXTENSO[d]}, ${t.nome}: ${c.bp === null ? '—' : formatBp(c.bp)}`}
                        >
                          <rect width={40} height={28} rx={6} className="fill-muted" />
                          <rect
                            width={40}
                            height={28}
                            rx={6}
                            className="fill-primary-texto"
                            opacity={f === 0 ? 0 : 0.15 + f * 0.85}
                          />
                          <text
                            x={20}
                            y={18}
                            textAnchor="middle"
                            className={f > 0.55 ? 'fill-primary-foreground' : 'fill-foreground'}
                            fontSize={10}
                          >
                            {Math.round(f * 100)}%
                          </text>
                        </svg>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TabelaDoGrafico
        titulo="ocupação por mês"
        cabecalho={['Mês', 'Reservados', 'Disponíveis', 'Ocupação']}
        linhas={o.porMes.map((m) => [
          nomeMes(m.mes),
          m.reservados,
          m.disponiveis,
          m.bp === null ? '—' : formatBp(m.bp),
        ])}
      />
    </Bloco>
  );
}

/** Fins de semana livres nos próximos 60 dias, com texto de promoção pronto. */
export function DatasLivres({
  o,
  buffet,
  link,
}: {
  o: OcupacaoTela;
  buffet: string;
  link: string;
}) {
  const nome = (id: string) => o.turnos.find((t) => t.id === id)?.nome ?? '';
  return (
    <Bloco
      titulo="Datas livres para promover"
      descricao="Sábados e domingos com horário livre nos próximos 60 dias."
      testid="datas-livres"
    >
      {o.datasLivres.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum fim de semana livre nos próximos 60 dias. Agenda cheia!
        </p>
      ) : (
        <ul className="divide-y">
          {o.datasLivres.slice(0, 12).map((d) => {
            const turnos = d.turnoIds.map(nome).filter(Boolean);
            const texto = textoPromocao({ data: d.data, turnos, buffet, link });
            return (
              <li
                key={d.data}
                className="flex items-center justify-between gap-3 py-2"
                data-testid="data-livre"
              >
                <div className="min-w-0">
                  <p className="font-semibold capitalize">
                    {DIAS_EXTENSO[new Date(`${d.data}T12:00:00Z`).getUTCDay()]} {formatData(d.data)}
                  </p>
                  <p className="text-muted-foreground text-sm">{turnos.join(', ')}</p>
                </div>
                <BotaoCopiar
                  texto={texto}
                  rotulo="Copiar texto de promoção"
                  rotuloAcessivel={`Copiar texto de promoção de ${formatData(d.data)}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Bloco>
  );
}
