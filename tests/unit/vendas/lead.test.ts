import { describe, expect, it } from 'vitest';
import { ETAPAS_VENDAS, ROTULO_ETAPA_VENDAS } from '@/domain/vendas/etapas';
import { LEAD_VAZIO, leadVendasSchema, normalizarBusca } from '@/domain/vendas/lead';

describe('lead de vendas', () => {
  it('as sete etapas na ordem do pipeline, cada uma com rótulo', () => {
    expect(ETAPAS_VENDAS.map((e) => ROTULO_ETAPA_VENDAS[e])).toEqual([
      'Novo',
      'Abordado',
      'Respondeu',
      'Interessado',
      'Fechando',
      'Cliente',
      'Perdido',
    ]);
  });

  it('aceita só o nome; campos vazios viram null', () => {
    const r = leadVendasSchema.parse({ ...LEAD_VAZIO, nome: '  Ana  ' });
    expect(r).toEqual({
      nome: 'Ana',
      buffet: null,
      telefone: null,
      cidade: null,
      origem: null,
      resumo: null,
      proximoFollowup: null,
      naoContatar: false,
    });
  });

  it('converte o telefone digitado para E.164', () => {
    const r = leadVendasSchema.parse({ ...LEAD_VAZIO, nome: 'Ana', telefone: '(34) 99135-5450' });
    expect(r.telefone).toBe('+5534991355450');
  });

  it('recusa telefone inválido, data inválida e nome curto com mensagens simples', () => {
    const r = leadVendasSchema.safeParse({
      ...LEAD_VAZIO,
      nome: 'A',
      telefone: '123',
      proximoFollowup: '2026-02-30',
    });
    expect(r.success).toBe(false);
    const msgs = Object.fromEntries(r.error!.issues.map((i) => [i.path[0], i.message]));
    expect(msgs).toEqual({
      nome: 'Informe o nome.',
      telefone: 'Informe um telefone válido com DDD.',
      proximoFollowup: 'Informe uma data válida.',
    });
  });

  it('busca sem acento e sem diferença de maiúsculas', () => {
    expect(normalizarBusca('  São JOSÉ ')).toBe('sao jose');
  });
});
