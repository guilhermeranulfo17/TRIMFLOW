import { describe, expect, it } from 'vitest';
import { textoAviso } from '@/domain/avisos/textos';
import {
  TIPOS_CONFIGURAVEIS,
  canaisDoTipo,
  ehAvisoContrato,
  recebeEmail,
} from '@/domain/avisos/canais';
import { contratoDeExemplo } from '@/domain/contratos/exemplo';
import {
  acoesDoContrato,
  contagemPorFiltro,
  filtroContratoDaUrl,
  filtroDoStatus,
  linhaDoTempoContrato,
  textoDoEvento,
} from '@/domain/contratos/painel';
import { hashTexto } from '@/domain/contratos/integridade';
import { duracaoCurta, metricasContratos } from '@/domain/numeros/contratos';

const ID = '7f1c6a2e-1b1a-4c55-9d3e-2a8f1e0c9b11';

describe('avisos do contrato', () => {
  it('textos e caminho para o contrato no painel', () => {
    const d = { lead_nome: 'Ana Lima', contrato: '2026-0007', contrato_id: ID };
    expect(textoAviso('contrato_aberto', d, { leadId: 'x' })).toEqual({
      titulo: 'Ana Lima abriu o contrato',
      corpo: 'Ana Lima abriu o contrato 2026-0007 pela primeira vez.',
      caminho: `/app/contratos/${ID}`,
    });
    expect(textoAviso('contrato_assinado', d).titulo).toBe('Contrato assinado: Ana Lima');
    expect(textoAviso('contrato_ajuste', d).corpo).toContain('pediu um ajuste');
    const agora = new Date('2026-10-07T12:00:00Z');
    expect(
      textoAviso(
        'contrato_vencendo',
        { ...d, expira_em: '2026-10-08T15:00:00Z' },
        { agora, fuso: 'America/Sao_Paulo' },
      ).corpo,
    ).toBe(
      'O link do contrato 2026-0007 de Ana Lima vence amanhã às 12:00 sem assinatura. Lembre o cliente ou mande um link novo.',
    );
  });

  it('sem contrato_id cai no lead; sem nome, "Cliente"', () => {
    expect(textoAviso('contrato_assinado', {}, { leadId: 'abc' })).toMatchObject({
      titulo: 'Contrato assinado: Cliente',
      caminho: '/app/leads/abc',
    });
  });

  it('canais: só push, configuráveis; e-mail só no assinado', () => {
    for (const t of [
      'contrato_aberto',
      'contrato_assinado',
      'contrato_ajuste',
      'contrato_vencendo',
    ] as const) {
      expect(ehAvisoContrato(t)).toBe(true);
      expect(TIPOS_CONFIGURAVEIS).toContain(t);
      expect(canaisDoTipo(t, null)).toEqual(['push']);
      expect(canaisDoTipo(t, { [t]: ['push', 'whatsapp'] })).toEqual(['push']);
      expect(recebeEmail(t)).toBe(t === 'contrato_assinado');
    }
    expect(ehAvisoContrato('pre_reserva_pedida')).toBe(false);
  });
});

describe('lista do painel', () => {
  it('filtro da URL', () => {
    expect(filtroContratoDaUrl('assinados')).toBe('assinados');
    expect(filtroContratoDaUrl(['ajuste', 'x'])).toBe('ajuste');
    expect(filtroContratoDaUrl('qualquer')).toBe('todos');
    expect(filtroContratoDaUrl(undefined)).toBe('todos');
  });

  it('status → filtro e contagem', () => {
    expect(filtroDoStatus('enviado')).toBe('aguardando');
    expect(filtroDoStatus('concluido')).toBe('assinados');
    expect(filtroDoStatus('rascunho')).toBeNull();
    expect(
      contagemPorFiltro(['enviado', 'enviado', 'concluido', 'recusado', 'expirado', 'cancelado']),
    ).toEqual({ todos: 6, aguardando: 2, assinados: 1, ajuste: 1, vencidos: 1, cancelados: 1 });
  });

  it('ações por status', () => {
    expect(acoesDoContrato('enviado')).toEqual({
      reenviar: true,
      novoLink: false,
      cancelar: true,
      refazer: true,
      pdf: false,
    });
    expect(acoesDoContrato('expirado')).toMatchObject({ novoLink: true, reenviar: false });
    expect(acoesDoContrato('concluido')).toEqual({
      reenviar: false,
      novoLink: false,
      cancelar: false,
      refazer: false,
      pdf: true,
    });
    expect(acoesDoContrato('cancelado')).toMatchObject({ cancelar: false, refazer: true });
  });
});

describe('linha do tempo', () => {
  const ev = (acao: string, criadoEm: string, dados = {}, usuarioNome: string | null = null) => ({
    acao,
    criadoEm,
    dados,
    usuarioNome,
  });

  it('ordena, traduz e esconde o que não é do contrato', () => {
    const l = linhaDoTempoContrato([
      ev('contrato.assinado', '2026-10-03T10:00:00Z', { parte: 'cliente' }),
      ev('contrato.enviado', '2026-10-01T10:00:00Z', { versao: 2 }, 'Marina'),
      ev('contrato.visualizado', '2026-10-02T10:00:00Z', { primeira: true }),
      ev('contrato.outra_coisa', '2026-10-02T11:00:00Z'),
    ]);
    expect(l.map((i) => i.texto)).toEqual([
      'Marina assinou pelo buffet e enviou (versão 2)',
      'Cliente abriu o contrato',
      'Cliente assinou',
    ]);
    expect(l[2]!.destaque).toBe(true);
  });

  it('cancelado: refeito, pelo dono com motivo ou sem autor', () => {
    expect(
      textoDoEvento(ev('contrato.cancelado', 'x', { motivo: 'Refeito' }, 'Marina'))!.texto,
    ).toBe('Cancelado: foi refeito em um contrato novo');
    expect(
      textoDoEvento(ev('contrato.cancelado', 'x', { motivo: 'Desistiu' }, 'Marina'))!.texto,
    ).toBe('Marina cancelou: Desistiu');
    expect(textoDoEvento(ev('contrato.cancelado', 'x'))!.texto).toBe('Cancelado');
    expect(textoDoEvento(ev('contrato.visualizado', 'x', { primeira: false }))!.texto).toBe(
      'Cliente abriu de novo',
    );
  });
});

describe('Números: contratos', () => {
  const p = { de: '2026-10-01', ate: '2026-10-31' };
  it('enviados e assinados no período (fuso), tempo médio dos assinados; teste não conta', () => {
    const m = metricasContratos(
      [
        // enviado 30/09 21:30 em SP = 01/10 00:30 UTC: fora (data civil 30/09)
        { enviadoEm: new Date('2026-10-01T00:30:00Z'), concluidoEm: null, ehTeste: false },
        {
          enviadoEm: new Date('2026-10-02T12:00:00Z'),
          concluidoEm: new Date('2026-10-02T14:00:00Z'),
          ehTeste: false,
        },
        {
          enviadoEm: new Date('2026-09-28T12:00:00Z'),
          concluidoEm: new Date('2026-10-03T12:00:00Z'),
          ehTeste: false,
        },
        {
          enviadoEm: new Date('2026-10-05T12:00:00Z'),
          concluidoEm: new Date('2026-10-05T12:10:00Z'),
          ehTeste: true,
        },
      ],
      p,
      'America/Sao_Paulo',
    );
    expect(m).toEqual({ enviados: 1, assinados: 2, tempoMedioMin: (120 + 7200) / 2 });
  });

  it('sem assinados: tempo nulo; duração curta', () => {
    expect(metricasContratos([], p).tempoMedioMin).toBeNull();
    expect(duracaoCurta(40)).toBe('40 min');
    expect(duracaoCurta(0)).toBe('1 min');
    expect(duracaoCurta(300)).toBe('5 h');
    expect(duracaoCurta(60 * 50)).toBe('2 dias e 2 h');
    expect(duracaoCurta(60 * 72)).toBe('3 dias');
  });
});

describe('contrato de exemplo da demo', () => {
  it('modelo infantil todo preenchido, com título e resumo', () => {
    const c = contratoDeExemplo({
      buffet: 'Buffet Demonstração',
      cliente: 'Ana Lima',
      whatsappE164: '+5534997000001',
      data: '2026-11-14',
      convidados: 60,
      totalCentavos: 490000,
      sinalCentavos: 147000,
      hoje: '2026-10-07',
    });
    expect(c.texto).not.toMatch(/\[\[FALTA:|\{\{/);
    expect(c.texto).toContain('Ana Lima');
    expect(c.texto).toContain('Buffet Demonstração');
    expect(c.titulo.length).toBeGreaterThan(5);
    expect(c.valores).toMatchObject({
      data: '2026-11-14',
      totalCentavos: 490000,
      saldoCentavos: 343000,
    });
    expect(c.modeloOrigem).toBe('infantil@1');
    expect(hashTexto(c.texto)).toMatch(/^[0-9a-f]{64}$/);
  });
});
