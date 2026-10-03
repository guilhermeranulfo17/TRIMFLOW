import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assinarSuporte,
  DURACAO_SUPORTE_MS,
  fimDaSessaoSuporte,
  lerSuporte,
  type SessaoSuporte,
} from '@/server/interno/suporte-cookie';

const chave = Buffer.from('chave-de-teste-32-bytes-.........');
const agora = 1_800_000_000_000;
const sessao: SessaoSuporte = {
  empresaId: randomUUID(),
  donoId: randomUUID(),
  adminId: randomUUID(),
  adminEmail: 'equipe@orkestra.app',
  exp: agora + 60 * 60 * 1000,
};

describe('cookie da sessão de suporte', () => {
  it('assina e lê de volta', () => {
    expect(lerSuporte(assinarSuporte(sessao, chave), chave, agora)).toEqual(sessao);
  });

  it('recusa assinatura errada, adulteração, expirado e validade longa demais', () => {
    const valor = assinarSuporte(sessao, chave);
    expect(lerSuporte(valor, Buffer.from('outra-chave'), agora)).toBeNull();
    const [corpo, assinatura] = valor.split('.');
    const outro = Buffer.from(JSON.stringify({ ...sessao, empresaId: randomUUID() })).toString(
      'base64url',
    );
    expect(lerSuporte(`${outro}.${assinatura}`, chave, agora)).toBeNull();
    expect(lerSuporte(`${corpo}.${assinatura}.x`, chave, agora)).toBeNull();
    expect(lerSuporte(valor, chave, sessao.exp)).toBeNull();
    const longo = assinarSuporte({ ...sessao, exp: agora + DURACAO_SUPORTE_MS + 120_000 }, chave);
    expect(lerSuporte(longo, chave, agora)).toBeNull();
    const semUuid = assinarSuporte({ ...sessao, donoId: 'x' }, chave);
    expect(lerSuporte(semUuid, chave, agora)).toBeNull();
    expect(lerSuporte('', chave, agora)).toBeNull();
    expect(lerSuporte(null, chave, agora)).toBeNull();
    expect(lerSuporte('a'.repeat(3000), chave, agora)).toBeNull();
  });

  it('dura até 2 horas, nunca além do consentimento', () => {
    expect(fimDaSessaoSuporte(agora, agora + 7 * 86_400_000)).toBe(agora + DURACAO_SUPORTE_MS);
    expect(fimDaSessaoSuporte(agora, agora + 1000)).toBe(agora + 1000);
  });
});
