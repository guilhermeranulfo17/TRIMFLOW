import { describe, expect, it } from 'vitest';
import { precisaSegundoFator } from '@/domain/auth/mfa';

describe('precisaSegundoFator', () => {
  it('só quem ligou a verificação e ainda está em aal1', () => {
    expect(precisaSegundoFator({ aal: 'aal1', app_metadata: { mfa: true } })).toBe(true);
    expect(precisaSegundoFator({ aal: 'aal2', app_metadata: { mfa: true } })).toBe(false);
    expect(precisaSegundoFator({ aal: 'aal1', app_metadata: { mfa: false } })).toBe(false);
    expect(precisaSegundoFator({ aal: 'aal1', app_metadata: {} })).toBe(false);
    expect(precisaSegundoFator({ aal: 'aal1', app_metadata: { mfa: 'true' } })).toBe(false);
    expect(precisaSegundoFator(null)).toBe(false);
  });
});
