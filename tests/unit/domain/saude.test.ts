import { describe, expect, it } from 'vitest';
import {
  avaliarJob,
  avaliarSaude,
  intervaloMinutos,
  type DadosSaude,
} from '@/domain/observabilidade/saude';

const AGORA = new Date('2026-10-04T12:00:00Z');
const OK: DadosSaude = {
  banco: true,
  filaAtrasoMin: 0,
  jobs: [
    {
      nome: 'orkestra-processar-avisos',
      agenda: '* * * * *',
      ativo: true,
      ultima: '2026-10-04T11:59:00Z',
      ultimo_status: 'succeeded',
    },
    {
      nome: 'orkestra-lgpd-retencao',
      agenda: '20 6 * * *',
      ativo: true,
      ultima: '2026-10-04T06:20:00Z',
      ultimo_status: 'succeeded',
    },
  ],
  asaasConfigurado: true,
  planosVitrine: true,
  contratosChave: true,
};

describe('intervaloMinutos', () => {
  it('reconhece as agendas do Orkestra', () => {
    expect(intervaloMinutos('* * * * *')).toBe(1);
    expect(intervaloMinutos('*/15 * * * *')).toBe(15);
    expect(intervaloMinutos('7 * * * *')).toBe(60);
    expect(intervaloMinutos('10 7 * * *')).toBe(1440);
    expect(intervaloMinutos('0 7 * * 1')).toBeNull();
  });
});

describe('avaliarSaude', () => {
  it('tudo certo = ok', () => {
    expect(avaliarSaude(OK, AGORA).ok).toBe(true);
  });

  it('fila de avisos atrasada mais de 10 min = falha', () => {
    const s = avaliarSaude({ ...OK, filaAtrasoMin: 11 }, AGORA);
    expect(s.ok).toBe(false);
    expect(s.itens.find((i) => i.item === 'fila_avisos')).toEqual({
      item: 'fila_avisos',
      ok: false,
      detalhe: 'atrasada 11 min',
    });
    expect(avaliarSaude({ ...OK, filaAtrasoMin: 10 }, AGORA).ok).toBe(true);
  });

  it('planos_vitrine falhou, banco fora ou Asaas sem configuração = falha', () => {
    expect(avaliarSaude({ ...OK, planosVitrine: false }, AGORA).ok).toBe(false);
    expect(avaliarSaude({ ...OK, asaasConfigurado: false }, AGORA).ok).toBe(false);
    const fora = avaliarSaude({ ...OK, banco: false, filaAtrasoMin: null, jobs: null }, AGORA);
    expect(fora.ok).toBe(false);
    expect(fora.itens.map((i) => i.item)).toEqual([
      'banco',
      'asaas',
      'planos_vitrine',
      'contratos_chave',
    ]);
  });

  it('sem CONTRATOS_CHAVE = falha (o cliente não consegue assinar)', () => {
    const s = avaliarSaude({ ...OK, contratosChave: false }, AGORA);
    expect(s.ok).toBe(false);
    expect(s.itens.find((i) => i.item === 'contratos_chave')).toEqual({
      item: 'contratos_chave',
      ok: false,
      detalhe: 'CONTRATOS_CHAVE ausente ou inválida',
    });
  });

  it('job atrasado, desligado ou com falha; sem execução ainda passa', () => {
    const j = OK.jobs![0]!;
    expect(avaliarJob({ ...j, ultima: '2026-10-04T11:52:00Z' }, AGORA).ok).toBe(false);
    expect(avaliarJob({ ...j, ultima: '2026-10-04T11:54:00Z' }, AGORA).ok).toBe(true);
    expect(avaliarJob({ ...j, ativo: false }, AGORA).detalhe).toBe('desativado');
    expect(avaliarJob({ ...j, ultimo_status: 'failed' }, AGORA).ok).toBe(false);
    expect(avaliarJob({ ...j, ultima: null }, AGORA)).toEqual({
      item: 'job:orkestra-processar-avisos',
      ok: true,
      detalhe: 'ainda sem execução',
    });
    const diario = OK.jobs![1]!;
    expect(avaliarJob({ ...diario, ultima: '2026-10-02T06:20:00Z' }, AGORA).ok).toBe(false);
  });

  it('sem pg_cron (CI): os jobs não entram', () => {
    expect(
      avaliarSaude({ ...OK, jobs: null }, AGORA).itens.some((i) => i.item.startsWith('job:')),
    ).toBe(false);
  });
});
