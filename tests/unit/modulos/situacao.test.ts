import { describe, expect, it } from 'vitest';
import {
  acaoPrincipal,
  ehMinha,
  etiquetaDoCartao,
  naCarencia,
  situacaoModulo,
  temAcesso,
} from '@/domain/modulos';

const HOJE = '2026-11-10';

describe('situacaoModulo', () => {
  it('pago cobrindo hoje = ativo; cancelada com período pago = cancelamento agendado', () => {
    expect(
      situacaoModulo({ status: 'ativa', pagoAte: '2026-11-30', estornada: false, hoje: HOJE }),
    ).toBe('ativo');
    expect(situacaoModulo({ status: 'ativa', pagoAte: HOJE, estornada: false, hoje: HOJE })).toBe(
      'ativo',
    );
    expect(
      situacaoModulo({ status: 'cancelada', pagoAte: '2026-11-30', estornada: false, hoje: HOJE }),
    ).toBe('cancelamento_agendado');
  });

  it('sem pagamento confirmado não há acesso (voltar do checkout não libera)', () => {
    const s = situacaoModulo({ status: 'pendente', pagoAte: null, estornada: false, hoje: HOJE });
    expect(s).toBe('pagamento_pendente');
    expect(temAcesso(s)).toBe(false);
  });

  it('período vencido: falha de pagamento (ativa), expirado (cancelada), estornado', () => {
    expect(
      situacaoModulo({ status: 'ativa', pagoAte: '2026-11-09', estornada: false, hoje: HOJE }),
    ).toBe('falha_pagamento');
    expect(
      situacaoModulo({ status: 'cancelada', pagoAte: '2026-11-09', estornada: false, hoje: HOJE }),
    ).toBe('expirado');
    expect(
      situacaoModulo({ status: 'cancelada', pagoAte: null, estornada: false, hoje: HOJE }),
    ).toBe('nao_contratado');
    expect(situacaoModulo({ status: 'ativa', pagoAte: null, estornada: true, hoje: HOJE })).toBe(
      'estornado',
    );
  });

  it('carência só na falha de pagamento e só com dias configurados', () => {
    const base = {
      situacao: 'falha_pagamento' as const,
      pagoAte: '2026-11-08',
      atrasadaDesde: null,
    };
    expect(naCarencia({ ...base, carenciaDias: 0, hoje: HOJE })).toBe(false);
    expect(naCarencia({ ...base, carenciaDias: 3, hoje: HOJE })).toBe(true); // 09 + 3 = 12
    expect(naCarencia({ ...base, carenciaDias: 3, hoje: '2026-11-13' })).toBe(false);
    expect(naCarencia({ ...base, situacao: 'expirado', carenciaDias: 3, hoje: HOJE })).toBe(false);
  });
});

describe('cartão: botão e etiqueta', () => {
  it('contratar só com venda liberada e para quem pode contratar', () => {
    const base = { situacao: 'nao_contratado' as const, acesso: false };
    expect(acaoPrincipal({ ...base, vendaLiberada: true, podeContratar: true }).tipo).toBe(
      'contratar',
    );
    expect(acaoPrincipal({ ...base, vendaLiberada: true, podeContratar: false }).tipo).toBe(
      'conhecer',
    );
    expect(acaoPrincipal({ ...base, vendaLiberada: false, podeContratar: true }).tipo).toBe(
      'conhecer',
    );
  });

  it('acesso: acessar ou configurar; pendente: continuar pagamento (só o dono)', () => {
    expect(
      acaoPrincipal({ situacao: 'ativo', acesso: true, vendaLiberada: false, podeContratar: false })
        .tipo,
    ).toBe('acessar');
    expect(
      acaoPrincipal({
        situacao: 'ativo',
        acesso: true,
        vendaLiberada: true,
        podeContratar: true,
        configuracaoPendente: true,
      }).rotulo,
    ).toBe('Configurar');
    expect(
      acaoPrincipal({
        situacao: 'pagamento_pendente',
        acesso: false,
        vendaLiberada: true,
        podeContratar: true,
      }).rotulo,
    ).toBe('Continuar pagamento');
  });

  it('etiquetas e "Minhas soluções"', () => {
    expect(etiquetaDoCartao({ situacao: 'nao_contratado', vendaLiberada: false }).texto).toBe(
      'Indisponível para contratação',
    );
    expect(etiquetaDoCartao({ situacao: 'nao_contratado', vendaLiberada: true }).texto).toBe(
      'Disponível',
    );
    expect(etiquetaDoCartao({ situacao: 'cancelamento_agendado', vendaLiberada: true }).texto).toBe(
      'Cancelamento agendado',
    );
    expect(ehMinha('nao_contratado')).toBe(false);
    expect(ehMinha('expirado')).toBe(true);
  });
});

describe('módulo só do dono', () => {
  it('com acesso, quem não usa as telas vê "Conhecer solução"', () => {
    expect(
      acaoPrincipal({
        situacao: 'ativo',
        acesso: true,
        vendaLiberada: true,
        podeContratar: false,
        podeUsar: false,
      }).tipo,
    ).toBe('conhecer');
  });
});
