import { describe, expect, it } from 'vitest';
import { forcaDaSenha } from '@/domain/forca-senha';

describe('forcaDaSenha', () => {
  it.each([
    ['', 'fraca'],
    ['abc', 'fraca'],
    ['abcdefgh', 'fraca'],
    ['12345678', 'fraca'],
    ['senha123', 'fraca'],
    ['aaaaaaaa1', 'fraca'],
    ['festa2026', 'fraca'],
    ['Festa2026', 'media'],
    ['buffet-alegria', 'media'],
    ['Festa-2026!', 'forte'],
    ['Buffet da Ana 2026', 'forte'],
  ] as const)('"%s" → %s', (senha, nivel) => {
    expect(forcaDaSenha(senha).nivel).toBe(nivel);
  });
});
