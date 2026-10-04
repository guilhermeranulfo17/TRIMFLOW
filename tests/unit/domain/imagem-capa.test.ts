import { describe, expect, it } from 'vitest';
import { arquivosDaCapa, caminhosDaCapa, capaPequenaDe } from '@/domain/imagem';
import { caminhoImagemValido } from '@/domain/validacao/empresa';

const EMP = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';

describe('capa em duas larguras (B.0)', () => {
  it('o envio gera 1920 (salvo na empresa) e 960 com o mesmo id', () => {
    expect(caminhosDaCapa(EMP, ID)).toEqual({
      grande: `${EMP}/capa/${ID}-1920.webp`,
      pequena: `${EMP}/capa/${ID}-960.webp`,
    });
  });

  it('a versão de 960 só existe nas capas novas', () => {
    expect(capaPequenaDe(`${EMP}/capa/${ID}-1920.webp`)).toBe(`${EMP}/capa/${ID}-960.webp`);
    expect(capaPequenaDe(`${EMP}/capa/${ID}.webp`)).toBeNull();
    expect(capaPequenaDe(null)).toBeNull();
  });

  it('apagar a capa nova leva os dois arquivos; a antiga, um', () => {
    expect(arquivosDaCapa(`${EMP}/capa/${ID}-1920.webp`)).toHaveLength(2);
    expect(arquivosDaCapa(`${EMP}/capa/${ID}.webp`)).toEqual([`${EMP}/capa/${ID}.webp`]);
    expect(arquivosDaCapa(null)).toEqual([]);
  });

  it('o servidor aceita o caminho novo e o antigo da capa, e nunca o de 960', () => {
    expect(caminhoImagemValido(`${EMP}/capa/${ID}-1920.webp`, EMP, 'capa')).toBe(true);
    expect(caminhoImagemValido(`${EMP}/capa/${ID}.webp`, EMP, 'capa')).toBe(true);
    expect(caminhoImagemValido(`${EMP}/capa/${ID}-960.webp`, EMP, 'capa')).toBe(false);
    expect(caminhoImagemValido(`${EMP}/logo/${ID}-1920.webp`, EMP, 'logo')).toBe(false);
  });
});
