import { describe, expect, it } from 'vitest';
import { AREAS_USO, areaDaRota, areaValida } from '@/domain/uso/areas';
import { montarRadar, nivelDeCalor } from '@/domain/uso/radar';

/* §92: radar de uso do painel no /interno. */

describe('área de cada tela do painel', () => {
  it.each([
    ['/app/leads', 'inicio'],
    ['/app/leads?visao=lista', 'inicio'],
    ['/app/leads/0a1b', 'lead'],
    ['/app/leads/0a1b/exportar', 'lead'],
    ['/app/tarefas', 'tarefas'],
    ['/app/agenda', 'agenda'],
    ['/app/orcamentos/novo', 'orcamento'],
    ['/app/empresa/catalogo/pacotes/1', 'catalogo'],
    ['/app/empresa/regras', 'regras'],
    ['/app/empresa/link/qr', 'link'],
    ['/app/empresa/plano/faturas', 'plano'],
    ['/app/empresa', 'empresa'],
    ['/app/empresa/simulador', 'empresa'],
    ['/app/conta/avisos', 'conta'],
    ['/app/comecar', 'onboarding'],
    ['/app/xyz', 'outra'],
    ['/app/', 'outra'],
  ])('%s → %s', (rota, area) => {
    expect(areaDaRota(rota)).toBe(area);
  });

  it('fora do painel não conta', () => {
    expect(areaDaRota('/')).toBeNull();
    expect(areaDaRota('/b/buffet-demo')).toBeNull();
    expect(areaDaRota('/interno')).toBeNull();
    expect(areaDaRota('/application')).toBeNull();
  });

  it('valida a área recebida', () => {
    expect(areaValida('agenda')).toBe(true);
    expect(areaValida('pagina')).toBe(false);
    expect(areaValida(1)).toBe(false);
  });
});

describe('mapa de calor', () => {
  it('nível relativo à célula mais quente', () => {
    expect(nivelDeCalor(0, 10)).toBe(0);
    expect(nivelDeCalor(1, 10)).toBe(1);
    expect(nivelDeCalor(5, 10)).toBe(2);
    expect(nivelDeCalor(10, 10)).toBe(4);
    expect(nivelDeCalor(3, 0)).toBe(0);
  });

  it('soma por semana, conta empresas e ordena pela mais usada', () => {
    const r = montarRadar(
      [
        { area: 'agenda', dia: '2026-11-14', empresaId: 'a', acessos: 10 },
        { area: 'agenda', dia: '2026-11-13', empresaId: 'b', acessos: 2 },
        { area: 'inicio', dia: '2026-11-01', empresaId: 'a', acessos: 3 },
        { area: 'contratos', dia: '2026-09-01', empresaId: 'c', acessos: 50 }, // fora do período
        { area: 'lixo', dia: '2026-11-14', empresaId: 'c', acessos: 9 }, // área desconhecida
        { area: 'numeros', dia: '2026-11-14', empresaId: 'c', acessos: 0 },
      ],
      '2026-11-14',
      2,
    );
    expect(r.semanas).toEqual(['2026-11-01', '2026-11-08']);
    expect(r.empresasAtivas).toBe(2);
    const [primeira, segunda] = r.linhas;
    expect(primeira).toMatchObject({ area: 'agenda', total: 12, empresas: 2, alcance: 100 });
    expect(primeira!.semanas).toEqual([
      { acessos: 0, nivel: 0 },
      { acessos: 12, nivel: 4 },
    ]);
    expect(segunda).toMatchObject({ area: 'inicio', total: 3, empresas: 1, alcance: 50 });
    expect(segunda!.semanas[0]).toEqual({ acessos: 3, nivel: 1 });
    expect(r.linhas.find((l) => l.area === 'contratos')!.total).toBe(0);
    expect(r.linhas).toHaveLength(AREAS_USO.length);
  });

  it('sem uso: tudo zero, alcance zero', () => {
    const r = montarRadar([], '2026-11-14');
    expect(r.empresasAtivas).toBe(0);
    expect(r.linhas.every((l) => l.total === 0 && l.alcance === 0)).toBe(true);
    expect(r.semanas).toHaveLength(8);
  });
});
