import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contraste, misturar } from '@/domain/publico/cor';

/*
 * Etapa 9.5 (B): contraste AA dos tokens de cada tema, lidos direto de globals.css.
 * Texto: 4,5:1. Foco (anel): 3:1 sobre fundo e cartão.
 */

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Tokens (--nome: #hex) do primeiro bloco cujo seletor contém `marca`. */
function bloco(marca: string, depoisDe = 0): Record<string, string> {
  const i = css.indexOf(marca, depoisDe);
  if (i < 0) throw new Error(`bloco não encontrado: ${marca}`);
  const abre = css.indexOf('{', i);
  const fecha = css.indexOf('}', abre);
  const tokens: Record<string, string> = {};
  for (const m of css.slice(abre, fecha).matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[m[1]!] = m[2]!.toLowerCase();
  }
  return tokens;
}

const TEMAS = {
  'claro neutro (link público)': bloco(':root,\n.tema-claro'),
  'escuro da marca': bloco(':root:has([data-acesso]),\n'),
  'claro da marca': bloco(':root:has([data-orkestra-claro])'),
};
const SISTEMA_ESCURO = bloco(
  ":root:has([data-painel][data-tema='sistema'])",
  css.lastIndexOf('@media (prefers-color-scheme: dark)'),
);
const SISTEMA_CLARO = bloco(
  ":root:has([data-painel][data-tema='sistema'])",
  css.lastIndexOf('@media (prefers-color-scheme: light)'),
);

const TEXTO: [string, string][] = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['primary-texto', 'background'],
  ['primary-texto', 'card'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['destructive', 'card'],
  ['success', 'card'],
  ['sidebar-foreground', 'sidebar'],
  ['destaque-foreground', 'destaque'],
];
const ESTADOS = ['alerta', 'erro', 'sucesso', 'info', 'quente'];

describe('tokens do tema', () => {
  it('"seguir o sistema" usa exatamente os blocos escuro e claro da marca', () => {
    expect(SISTEMA_ESCURO).toEqual(TEMAS['escuro da marca']);
    expect(SISTEMA_CLARO).toEqual(TEMAS['claro da marca']);
  });

  it('os três temas definem os mesmos tokens', () => {
    const [a, ...resto] = Object.values(TEMAS).map((t) => Object.keys(t).sort());
    for (const r of resto) expect(r).toEqual(a);
  });

  for (const [nome, t] of Object.entries(TEMAS)) {
    describe(nome, () => {
      it.each(TEXTO)('texto %s sobre %s ≥ 4,5:1', (frente, fundo) => {
        expect(contraste(t[frente]!, t[fundo]!)).toBeGreaterThanOrEqual(4.5);
      });

      it.each(ESTADOS)(
        'estado %s: texto sobre cartão, fundo e o próprio tom suave ≥ 4,5:1',
        (e) => {
          const cor = t[e]!;
          expect(contraste(cor, t.card!)).toBeGreaterThanOrEqual(4.5);
          expect(contraste(cor, t.background!)).toBeGreaterThanOrEqual(4.5);
          // bg-{estado}/10 e /15 sobre o cartão
          expect(contraste(cor, misturar(cor, t.card!, 0.9))).toBeGreaterThanOrEqual(4.5);
          expect(contraste(cor, misturar(cor, t.card!, 0.85))).toBeGreaterThanOrEqual(4.5);
        },
      );

      it('texto primário sobre o próprio tom suave (bg-primary/10 e /15) ≥ 4,5:1', () => {
        for (const peso of [0.9, 0.85]) {
          const fundo = misturar(t.primary!, t.card!, peso);
          expect(contraste(t['primary-texto']!, fundo)).toBeGreaterThanOrEqual(4.5);
        }
      });

      it('anel de foco ≥ 3:1 sobre fundo e cartão', () => {
        expect(contraste(t.ring!, t.background!)).toBeGreaterThanOrEqual(3);
        expect(contraste(t.ring!, t.card!)).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

describe('landing: escuro da marca sobre o fundo quase preto', () => {
  const t = { ...TEMAS['escuro da marca'], ...bloco(':root:has([data-landing]) {') };

  it('o bloco só troca o fundo', () => {
    expect(t.background).toBe('#070707');
    expect(t['landing-fundo']).toBe('#070707');
  });

  it.each(TEXTO.filter(([, fundo]) => fundo === 'background'))(
    'texto %s sobre %s ≥ 4,5:1',
    (frente, fundo) => {
      expect(contraste(t[frente]!, t[fundo]!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(ESTADOS)('estado %s sobre o fundo ≥ 4,5:1', (e) => {
    expect(contraste(t[e]!, t.background!)).toBeGreaterThanOrEqual(4.5);
  });

  it('anel de foco ≥ 3:1 sobre o fundo', () => {
    expect(contraste(t.ring!, t.background!)).toBeGreaterThanOrEqual(3);
  });
});
