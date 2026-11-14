import { addDays, format, parseISO } from 'date-fns';
import { AREAS_USO, ROTULO_AREA, type AreaUso } from './areas';

/*
 * Radar de uso (§92): o mapa de calor do /interno. Linhas = áreas do painel, colunas = semanas
 * (da mais antiga para a atual); cada célula tem os acessos e um nível de 0 a 4 relativo à
 * célula mais quente. Também diz quantas empresas usaram cada área no período.
 */

export type LinhaUso = { area: string; dia: string; empresaId: string; acessos: number };

export type LinhaRadar = {
  area: AreaUso;
  rotulo: string;
  total: number;
  empresas: number;
  /** % das empresas ativas no período que abriram a área (0 a 100) */
  alcance: number;
  semanas: { acessos: number; nivel: 0 | 1 | 2 | 3 | 4 }[];
};

export type Radar = {
  /** primeiro dia de cada semana (yyyy-MM-dd) */
  semanas: string[];
  linhas: LinhaRadar[];
  empresasAtivas: number;
};

export function nivelDeCalor(valor: number, maximo: number): 0 | 1 | 2 | 3 | 4 {
  if (valor <= 0 || maximo <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((valor / maximo) * 4))) as 1 | 2 | 3 | 4;
}

/** Monta o radar das últimas `n` semanas terminando em `hoje` (inclusive). */
export function montarRadar(linhas: LinhaUso[], hoje: string, n = 8): Radar {
  const fim = parseISO(hoje);
  const inicio = addDays(fim, -(n * 7 - 1));
  const semanas = Array.from({ length: n }, (_, i) => format(addDays(inicio, i * 7), 'yyyy-MM-dd'));
  const indiceSemana = (dia: string) =>
    Math.floor((parseISO(dia).getTime() - inicio.getTime()) / (7 * 24 * 3600 * 1000));

  const celulas = new Map<AreaUso, number[]>();
  const empresasPorArea = new Map<AreaUso, Set<string>>();
  const ativas = new Set<string>();
  for (const a of AREAS_USO) {
    celulas.set(a, Array(n).fill(0));
    empresasPorArea.set(a, new Set());
  }
  for (const l of linhas) {
    if (!(AREAS_USO as readonly string[]).includes(l.area)) continue;
    const i = indiceSemana(l.dia);
    if (i < 0 || i >= n || l.acessos <= 0) continue;
    const area = l.area as AreaUso;
    celulas.get(area)![i]! += l.acessos;
    empresasPorArea.get(area)!.add(l.empresaId);
    ativas.add(l.empresaId);
  }
  const maximo = Math.max(0, ...[...celulas.values()].flat());

  const resultado: LinhaRadar[] = AREAS_USO.map((area) => {
    const valores = celulas.get(area)!;
    const empresas = empresasPorArea.get(area)!.size;
    return {
      area,
      rotulo: ROTULO_AREA[area],
      total: valores.reduce((s, v) => s + v, 0),
      empresas,
      alcance: ativas.size ? Math.round((empresas / ativas.size) * 100) : 0,
      semanas: valores.map((acessos) => ({ acessos, nivel: nivelDeCalor(acessos, maximo) })),
    };
  });
  // mais usada primeiro; empate pelo alcance e depois pela ordem do menu
  resultado.sort((a, b) => b.total - a.total || b.empresas - a.empresas);
  return { semanas, linhas: resultado, empresasAtivas: ativas.size };
}
