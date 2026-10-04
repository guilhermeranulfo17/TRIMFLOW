import { describe, expect, it } from 'vitest';
import {
  lerOrigemDoCookie,
  limparValorOrigem,
  mesclarOrigem,
  origemDaUrl,
  serializarOrigem,
} from '@/domain/marketing';

describe('origem do cadastro', () => {
  it('lê só as chaves conhecidas da URL e limpa os valores', () => {
    const url = new URLSearchParams(
      'utm_source=Instagram&utm_medium=Stories%20Pagos&utm_campaign=lançamento&ref=Bio&email=a@b.c',
    );
    expect(origemDaUrl(url)).toEqual({
      utm_source: 'instagram',
      utm_medium: 'stories-pagos',
      utm_campaign: 'lancamento',
      ref: 'bio',
    });
    expect(origemDaUrl({ utm_source: ['google', 'x'], outro: 'y' })).toEqual({
      utm_source: 'google',
    });
    expect(origemDaUrl(new URLSearchParams('q=1'))).toBeNull();
    expect(origemDaUrl({ utm_source: '   ' })).toBeNull();
  });

  it('valor limitado a 60 caracteres e só [a-z0-9._-]', () => {
    expect(limparValorOrigem('x'.repeat(80))).toHaveLength(60);
    expect(limparValorOrigem('<script>alert(1)</script>')).toBe('script-alert-1-script');
    expect(limparValorOrigem(null)).toBeNull();
    expect(limparValorOrigem('---')).toBeNull();
  });

  it('último toque com UTM; visita sem origem não apaga a guardada', () => {
    const guardada = { utm_source: 'instagram' };
    expect(mesclarOrigem(guardada, null)).toBe(guardada);
    expect(mesclarOrigem(guardada, { utm_source: 'google' })).toEqual({ utm_source: 'google' });
    expect(mesclarOrigem(null, null)).toBeNull();
  });

  it('cookie: ida e volta; lixo vira null sem lançar', () => {
    const o = { utm_source: 'instagram', ref: 'bio' };
    expect(lerOrigemDoCookie(serializarOrigem(o))).toEqual(o);
    expect(lerOrigemDoCookie('%7Bquebrado')).toBeNull();
    expect(lerOrigemDoCookie(encodeURIComponent('[1,2]'))).toBeNull();
    expect(lerOrigemDoCookie(encodeURIComponent('{"email":"a@b.c"}'))).toBeNull();
    expect(lerOrigemDoCookie(undefined)).toBeNull();
  });
});
