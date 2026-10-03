import { describe, expect, it } from 'vitest';
import {
  codigoPlanoVigente,
  itensDoPlano,
  mensagemErroConta,
  mensagemLimite,
  pedeIrAoPlano,
  planoVigente,
  podeAdicionarEspaco,
  podeAdicionarUsuario,
  type RecursosPlano,
} from '@/domain/cobranca/limites';
import { mrrDaAssinatura, resumoInterno, type EmpresaResumo } from '@/domain/cobranca/mrr';
import { MOTIVOS_CANCELAMENTO, rotuloMotivo } from '@/domain/cobranca/motivos-cancelamento';

const essencial: RecursosPlano = {
  codigo: 'essencial',
  nome: 'Essencial',
  maxUsuarios: 2,
  maxEspacos: 1,
  whatsappAvisos: false,
  followUp: false,
  numerosCompleto: false,
};
const profissional: RecursosPlano = {
  codigo: 'profissional',
  nome: 'Profissional',
  maxUsuarios: 5,
  maxEspacos: null,
  whatsappAvisos: true,
  followUp: true,
  numerosCompleto: true,
};
const planos = [essencial, profissional];

describe('limites', () => {
  it('teste e cortesia sem assinatura usam o Profissional', () => {
    expect(
      codigoPlanoVigente({ situacao: 'trial', isenta: false, planoAssinatura: 'essencial' }),
    ).toBe('profissional');
    expect(codigoPlanoVigente({ situacao: 'ativo', isenta: true, planoAssinatura: null })).toBe(
      'profissional',
    );
    expect(codigoPlanoVigente({ situacao: 'suspenso', isenta: false, planoAssinatura: null })).toBe(
      'essencial',
    );
    expect(
      planoVigente(planos, { situacao: 'ativo', isenta: false, planoAssinatura: 'essencial' }),
    ).toBe(essencial);
    expect(planoVigente(planos, { situacao: 'ativo', isenta: false, planoAssinatura: 'xx' })).toBe(
      essencial,
    );
    expect(() =>
      planoVigente([], { situacao: 'ativo', isenta: false, planoAssinatura: null }),
    ).toThrow();
  });

  it('usuários e espaços', () => {
    expect(podeAdicionarUsuario(essencial, 1)).toBe(true);
    expect(podeAdicionarUsuario(essencial, 2)).toBe(false);
    expect(podeAdicionarEspaco(essencial, 1)).toBe(false);
    expect(podeAdicionarEspaco(profissional, 40)).toBe(true);
  });

  it('mensagens e itens', () => {
    expect(mensagemLimite('LIMITE_PLANO_USUARIOS', essencial)).toBe(
      'O plano Essencial permite até 2 usuários. Mude de plano para adicionar mais gente.',
    );
    expect(mensagemLimite('LIMITE_PLANO_ESPACOS', essencial)).toContain('1 espaço ativo');
    expect(mensagemLimite('LIMITE_PLANO_USUARIOS')).toContain('limite de usuários');
    expect(mensagemLimite('LIMITE_PLANO_ESPACOS')).toContain('limite de espaços');
    expect(mensagemErroConta('CONTA_SOMENTE_LEITURA')).toContain('somente leitura');
    expect(mensagemErroConta('LIMITE_PLANO_FOLLOW_UP')).toContain('follow-up');
    expect(mensagemErroConta('OUTRO')).toBeNull();
    expect(mensagemErroConta(null)).toBeNull();
    expect(pedeIrAoPlano(mensagemErroConta('LIMITE_PLANO_ESPACOS')!)).toBe(true);
    expect(pedeIrAoPlano('Salvo.')).toBe(false);
    expect(mensagemLimite('LIMITE_PLANO_WHATSAPP')).toContain('Profissional');
    expect(mensagemLimite('LIMITE_PLANO_FOLLOW_UP')).toContain('follow-up');
    expect(itensDoPlano(essencial)).toContain('1 espaço');
    expect(itensDoPlano(profissional)).toContain('Espaços ilimitados');
    expect(itensDoPlano(profissional)).toContain('Follow-up automático');
  });
});

describe('MRR e resumo do /interno', () => {
  const agora = new Date('2026-11-10T12:00:00Z');
  const e = (o: Partial<EmpresaResumo>): EmpresaResumo => ({
    situacao: 'ativo',
    trialAte: new Date('2026-10-01'),
    isenta: false,
    pagou: true,
    assinatura: { status: 'ativa', ciclo: 'mensal', valorCentavos: 24700 },
    cancelamentoMotivo: null,
    ...o,
  });

  it('anual entra como 1/12', () => {
    expect(mrrDaAssinatura({ status: 'ativa', ciclo: 'anual', valorCentavos: 247000 })).toBe(20583);
    expect(mrrDaAssinatura({ status: 'pendente', ciclo: 'mensal', valorCentavos: 100 })).toBe(0);
    expect(mrrDaAssinatura(null)).toBe(0);
  });

  it('pagantes, testes, conversão e cancelamentos', () => {
    const r = resumoInterno(
      [
        e({}),
        e({ assinatura: { status: 'ativa', ciclo: 'mensal', valorCentavos: 9700 } }),
        e({ situacao: 'trial', trialAte: new Date('2026-11-20'), pagou: false, assinatura: null }),
        e({ situacao: 'suspenso', pagou: false, assinatura: null }),
        e({
          situacao: 'suspenso',
          assinatura: { status: 'cancelada', ciclo: 'mensal', valorCentavos: 24700 },
          cancelamentoMotivo: 'preco',
        }),
        e({ isenta: true, assinatura: null }),
      ],
      agora,
    );
    expect(r.mrrCentavos).toBe(34400);
    expect(r.pagantes).toBe(2);
    expect(r.testesAtivos).toBe(1);
    // 3 pagaram de 4 com teste encerrado (a cortesia não conta)
    expect(r.conversaoBp).toBe(7500);
    expect(r.cancelamentos).toEqual([{ motivo: 'preco', quantidade: 1 }]);
    expect(resumoInterno([], agora).conversaoBp).toBeNull();
  });

  it('motivos', () => {
    expect(MOTIVOS_CANCELAMENTO.at(-1)?.valor).toBe('outro');
    expect(rotuloMotivo('preco')).toBe('Ficou caro para mim');
    expect(rotuloMotivo('x')).toBe('x');
  });
});
