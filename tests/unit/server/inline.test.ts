import { describe, expect, it } from 'vitest';
import { inlineParametros, literal, ParametroInvalidoError } from '@/server/db/inline';

describe('literal', () => {
  it('escapa strings e tipos básicos', () => {
    expect(literal("O'Brien")).toBe("E'O''Brien'");
    expect(literal('a\\b')).toBe("E'a\\\\b'");
    expect(literal("'; drop table x; --")).toBe("E'''; drop table x; --'");
    expect(literal("\\'; drop table x; --")).toBe("E'\\\\''; drop table x; --'");
    expect(literal(null)).toBe('NULL');
    expect(literal(undefined)).toBe('NULL');
    expect(literal(true)).toBe('true');
    expect(literal(42)).toBe('42');
    expect(literal(-1.5)).toBe('(-1.5)');
    expect(literal(-3n)).toBe('(-3)');
    expect(inlineParametros('select 1-$1', [-1])).toBe('select 1-(-1)');
    expect(literal(10n)).toBe('10');
    expect(literal(new Date('2026-10-03T12:00:00Z'))).toBe("E'2026-10-03T12:00:00.000Z'");
    expect(literal({ a: "x'y" })).toBe(`E'{"a":"x''y"}'`);
    expect(literal(['a', 'b"c', null])).toBe(`E'{"a","b\\\\"c",NULL}'`);
    expect(literal(Buffer.from('hi'))).toBe("E'\\\\x6869'::bytea");
  });

  it('recusa NUL, número não finito e data inválida', () => {
    expect(() => literal('a\u0000b')).toThrow(ParametroInvalidoError);
    expect(() => literal(Number.NaN)).toThrow(ParametroInvalidoError);
    expect(() => literal(Infinity)).toThrow(ParametroInvalidoError);
    expect(() => literal(new Date('x'))).toThrow(ParametroInvalidoError);
    expect(() => literal(Symbol('x'))).toThrow(ParametroInvalidoError);
  });
});

describe('inlineParametros', () => {
  it('troca $n pelos literais (inclusive $10 e repetidos)', () => {
    const p = Array.from({ length: 11 }, (_, i) => i + 1);
    expect(inlineParametros('select $1, $10, $11, $1', p)).toBe('select 1, 10, 11, 1');
    expect(inlineParametros('select * from t where a = $1::uuid and b = $2', ['x', null])).toBe(
      "select * from t where a = E'x'::uuid and b = NULL",
    );
  });

  it('preserva strings, identificadores, comentários e blocos $$', () => {
    const sql = `select '$1', "c$1", $1 -- $1\n/* $1 */ , $$ $1 $$, $tag$ $1 $tag$, 'it''s $1'`;
    expect(inlineParametros(sql, ['v'])).toBe(
      `select '$1', "c$1", E'v' -- $1\n/* $1 */ , $$ $1 $$, $tag$ $1 $tag$, 'it''s $1'`,
    );
  });

  it('sem parâmetros devolve igual; marcador sem valor é erro', () => {
    expect(inlineParametros('select $1', [])).toBe('select $1');
    expect(() => inlineParametros('select $2', ['a'])).toThrow(ParametroInvalidoError);
  });
});
