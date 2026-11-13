import { diaDaSemana, diaDaSemanaNumero } from '../dates';
import type { AjusteDiaCtx, ContextoPreco, DataCivil, Id } from './tipos';

export type AjusteEscolhido = { ajuste: AjusteDiaCtx; descricao: string };

/**
 * Escolhe UM ajuste para a data e o turno, nesta precedência:
 * data especial (ajuste próprio da data) > feriado com o turno > feriado geral > dia da semana
 * com o turno > dia da semana geral.
 * Um ajuste de 0 bp também "vence" (ex.: feriado 0% anula o +10% de sábado).
 */
export function escolherAjusteDia(
  contexto: ContextoPreco,
  data: DataCivil,
  turnoId: Id | null,
): AjusteEscolhido | null {
  const feriado = contexto.feriados.find((f) => f.data === data);
  const dia = diaDaSemanaNumero(data);
  const nomeTurno = contexto.turnos.find((t) => t.id === turnoId)?.nome;

  // Data especial: o ajuste é da própria data, vale para qualquer turno
  if (feriado && feriado.ajusteBp !== null && feriado.ajusteBp !== undefined) {
    return {
      ajuste: {
        id: feriado.id ?? '',
        tipo: 'feriado',
        diaSemana: null,
        turnoId: null,
        ajusteBp: feriado.ajusteBp,
      },
      descricao: `Ajuste ${feriado.nome}`,
    };
  }

  const candidatos: [AjusteDiaCtx | undefined, string][] = [];
  if (feriado) {
    const rotulo = `Ajuste feriado (${feriado.nome})`;
    candidatos.push(
      [
        contexto.ajustesDia.find((a) => a.tipo === 'feriado' && turnoId && a.turnoId === turnoId),
        `${rotulo}, ${nomeTurno}`,
      ],
      [contexto.ajustesDia.find((a) => a.tipo === 'feriado' && a.turnoId === null), rotulo],
    );
  }
  const rotuloDia = `Ajuste ${diaDaSemana(data)}`;
  candidatos.push(
    [
      contexto.ajustesDia.find(
        (a) => a.tipo === 'dia_semana' && a.diaSemana === dia && turnoId && a.turnoId === turnoId,
      ),
      `${rotuloDia}, ${nomeTurno}`,
    ],
    [
      contexto.ajustesDia.find(
        (a) => a.tipo === 'dia_semana' && a.diaSemana === dia && a.turnoId === null,
      ),
      rotuloDia,
    ],
  );

  for (const [ajuste, descricao] of candidatos) {
    if (ajuste) return { ajuste, descricao };
  }
  return null;
}
