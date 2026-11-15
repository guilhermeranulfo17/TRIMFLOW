import { describe, expect, it } from 'vitest';
import { mostraBotaoOrcamento } from '@/components/app/botao-orcamento-rotas';

describe('mostraBotaoOrcamento', () => {
  it('aparece nas telas comerciais', () => {
    for (const c of [
      '/app',
      '/app/leads',
      '/app/tarefas',
      '/app/agenda',
      '/app/clientes',
      '/app/clientes/abc',
    ]) {
      expect(mostraBotaoOrcamento(c), c).toBe(true);
    }
  });

  it('some na configuração, nas soluções e nas telas com barra própria', () => {
    for (const c of [
      '/app/empresa',
      '/app/empresa/catalogo',
      '/app/solucoes',
      '/app/solucoes/orkmargem',
      '/app/numeros',
      '/app/contratos',
      '/app/financeiro',
      '/app/margem',
      '/app/conta/avisos',
      '/app/avisos',
      '/app/orcamentos/novo',
      '/app/leads/123',
      '/app/agendamento',
    ]) {
      expect(mostraBotaoOrcamento(c), c).toBe(false);
    }
  });
});
