/*
 * Saúde do sistema (Etapa 9B, B.3) para GET /api/saude e o monitor de disponibilidade. Cada item
 * tem um nome estável e um detalhe curto, sem dado de empresa ou pessoa.
 */

export const ATRASO_MAXIMO_FILA_MIN = 10;

export type JobCron = {
  nome: string;
  agenda: string;
  ativo: boolean;
  ultima: string | null;
  ultimo_status: string | null;
};

export type DadosSaude = {
  banco: boolean;
  filaAtrasoMin: number | null;
  /** null = banco sem pg_cron (CI, Postgres local sem a extensão) */
  jobs: JobCron[] | null;
  asaasConfigurado: boolean;
  planosVitrine: boolean;
};

export type ItemSaude = { item: string; ok: boolean; detalhe?: string };
export type Saude = { ok: boolean; itens: ItemSaude[] };

/** Intervalo em minutos das agendas usadas pelo Orkestra (null = não reconhecida). */
export function intervaloMinutos(agenda: string): number | null {
  const [min, hora, dia, mes, semana] = agenda.trim().split(/\s+/);
  if ([dia, mes, semana].some((c) => c !== '*')) return null;
  if (min === '*' && hora === '*') return 1;
  const cada = /^\*\/(\d+)$/.exec(min ?? '');
  if (cada && hora === '*') return Number(cada[1]);
  if (/^\d+$/.test(min ?? '') && hora === '*') return 60;
  if (/^\d+$/.test(min ?? '') && /^\d+$/.test(hora ?? '')) return 1440;
  return null;
}

/** Um job está atrasado se a última execução passou de 2 intervalos (+5 min de folga). */
export function avaliarJob(j: JobCron, agora: Date): ItemSaude {
  const item = `job:${j.nome}`;
  if (!j.ativo) return { item, ok: false, detalhe: 'desativado' };
  if (j.ultimo_status === 'failed') return { item, ok: false, detalhe: 'última execução falhou' };
  if (!j.ultima) return { item, ok: true, detalhe: 'ainda sem execução' };
  const intervalo = intervaloMinutos(j.agenda);
  if (intervalo === null) return { item, ok: true };
  const minutos = (agora.getTime() - new Date(j.ultima).getTime()) / 60_000;
  return minutos <= intervalo * 2 + 5
    ? { item, ok: true }
    : { item, ok: false, detalhe: `sem rodar há ${Math.round(minutos)} min` };
}

export function avaliarSaude(d: DadosSaude, agora = new Date()): Saude {
  const itens: ItemSaude[] = [{ item: 'banco', ok: d.banco }];
  if (d.banco) {
    const atraso = d.filaAtrasoMin ?? 0;
    itens.push(
      atraso <= ATRASO_MAXIMO_FILA_MIN
        ? { item: 'fila_avisos', ok: true }
        : { item: 'fila_avisos', ok: false, detalhe: `atrasada ${atraso} min` },
    );
    if (d.jobs) itens.push(...d.jobs.map((j) => avaliarJob(j, agora)));
  }
  itens.push({
    item: 'asaas',
    ok: d.asaasConfigurado,
    ...(d.asaasConfigurado ? {} : { detalhe: 'não configurado' }),
  });
  itens.push({ item: 'planos_vitrine', ok: d.planosVitrine });
  return { ok: itens.every((i) => i.ok), itens };
}
