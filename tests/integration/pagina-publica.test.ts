import { afterAll, describe, expect, it } from 'vitest';
import {
  assumirAnon,
  comoUsuario,
  conectar,
  emTransacao,
  esperarErroSql,
  IDS,
} from '../support/db';
import { diferenciaisValidos } from '@/domain/publico/pagina';

/*
 * Etapa 9.5 · PR 2: página pública. Tabelas novas (galeria, depoimentos, perguntas) com RLS por
 * empresa, escrita só pelas funções salvar_* (dono, auditoria, limites) e leitura pública só por
 * publico.pagina.
 */

const sql = conectar();
afterAll(async () => {
  await sql.end();
});

const TABELAS = ['galeria_fotos', 'depoimentos', 'perguntas_frequentes'] as const;
const foto = (empresa: string, n: number) => {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    caminho_640: `${empresa}/galeria/${id}-640.webp`,
    caminho_1280: `${empresa}/galeria/${id}-1280.webp`,
    largura: 1280,
    altura: 853,
    alt: `Foto ${n}`,
  };
};

describe('RLS das tabelas da página', () => {
  it('o dono lê só as da própria empresa; o vendedor e anon não leem', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      for (const t of TABELAS) {
        const linhas = await tx.unsafe(`select distinct empresa_id from public.${t}`);
        expect(linhas.map((l) => l.empresa_id)).toEqual([IDS.empresaA]);
      }
    });
    await comoUsuario(sql, IDS.donoB, async (tx) => {
      for (const t of TABELAS) {
        expect(await tx.unsafe(`select 1 from public.${t}`)).toHaveLength(0);
      }
    });
    await comoUsuario(sql, IDS.vendedorA, async (tx) => {
      for (const t of TABELAS) {
        expect(await tx.unsafe(`select 1 from public.${t}`)).toHaveLength(0);
      }
    });
    await emTransacao(sql, async (tx) => {
      await assumirAnon(tx);
      for (const t of TABELAS) {
        await esperarErroSql(
          tx.savepoint((s) => s.unsafe(`select 1 from public.${t}`)),
          '42501',
        );
      }
    });
  });

  it('ninguém grava direto nas tabelas (nem o dono)', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      await esperarErroSql(
        tx.savepoint(
          (s) => s`insert into public.depoimentos (empresa_id, nome, texto)
            values (${IDS.empresaA}, 'Fulana', 'Texto grande o bastante')`,
        ),
        '42501',
      );
      await esperarErroSql(
        tx.savepoint((s) => s`delete from public.perguntas_frequentes`),
        '42501',
      );
      await esperarErroSql(
        tx.savepoint((s) => s`update public.galeria_fotos set alt = 'x'`),
        '42501',
      );
    });
  });
});

describe('funções de escrita', () => {
  it('salvar_pagina_publica grava os textos da própria empresa e audita', async () => {
    await comoUsuario(sql, IDS.donoB, async (tx) => {
      await tx`select public.salvar_pagina_publica(${tx.json({
        slogan: '  Festa boa  ',
        estilo: 'elegante',
        diferenciais: ['Espaço próprio', ' Monitores ', ''],
        bairro: 'Centro',
        mostrar_endereco: true,
      })})`;
      const [e] = await tx`select slogan, estilo, diferenciais, bairro, mostrar_endereco,
        pagina_personalizada_em from public.empresas where id = ${IDS.empresaB}`;
      expect(e).toMatchObject({
        slogan: 'Festa boa',
        estilo: 'elegante',
        diferenciais: ['Espaço próprio', 'Monitores'],
        bairro: 'Centro',
        mostrar_endereco: true,
      });
      expect(e!.pagina_personalizada_em).not.toBeNull();
      const [a] = await tx`select usuario_id, dados from public.auditoria
        where empresa_id = ${IDS.empresaB} and acao = 'pagina.textos_alterados'`;
      expect(a!.usuario_id).toBe(IDS.donoB);
      expect(a!.dados.depois.slogan).toBe('Festa boa');
      // o Buffet Demo não mudou
      const [demo] = await tx`select estilo from public.empresas where id = ${IDS.empresaA}`;
      expect(demo).toBeUndefined(); // RLS: o dono B nem vê a empresa A
    });
  });

  it('estilo vazio volta ao padrão do segmento; campo ausente não muda', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      await tx`select public.salvar_pagina_publica(${tx.json({ estilo: 'festivo' })})`;
      await tx`select public.salvar_pagina_publica(${tx.json({ estilo: '' })})`;
      const [e] = await tx`select estilo, slogan from public.empresas where id = ${IDS.empresaA}`;
      expect(e!.estilo).toBeNull();
      expect(e!.slogan).toMatch(/carinho/);
    });
  });

  it('recusa slogan longo, diferenciais demais ou repetidos e estilo inválido', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      const casos = [
        { slogan: 'x'.repeat(81) },
        { diferenciais: Array.from({ length: 9 }, (_, i) => `Item ${i}`) },
        { diferenciais: ['Monitores', 'monitores'] },
        { diferenciais: ['x'.repeat(41)] },
      ];
      for (const c of casos) {
        await esperarErroSql(
          tx.savepoint((s) => s`select public.salvar_pagina_publica(${s.json(c)})`),
          '23514',
        );
      }
      await esperarErroSql(
        tx.savepoint((s) => s`select public.salvar_pagina_publica(${s.json({ estilo: 'neon' })})`),
        '22P02',
      );
    });
  });

  it('vendedor não grava a página', async () => {
    await comoUsuario(sql, IDS.vendedorA, async (tx) => {
      for (const f of [
        'salvar_pagina_publica',
        'salvar_galeria',
        'salvar_depoimentos',
        'salvar_perguntas',
      ]) {
        await esperarErroSql(
          tx.savepoint((s) =>
            s.unsafe(`select public.${f}($1::jsonb)`, [
              f === 'salvar_pagina_publica' ? '{}' : '[]',
            ]),
          ),
          '42501',
        );
      }
    });
  });

  it('salvar_galeria substitui, devolve os caminhos que saíram e respeita o limite de 12', async () => {
    await comoUsuario(sql, IDS.donoB, async (tx) => {
      const b = IDS.empresaB;
      const [r1] =
        await tx`select public.salvar_galeria(${tx.json([foto(b, 1), foto(b, 2)])}) as saiu`;
      expect(r1!.saiu).toEqual([]);
      const [r2] =
        await tx`select public.salvar_galeria(${tx.json([foto(b, 2), foto(b, 3)])}) as saiu`;
      expect([...r2!.saiu].sort()).toEqual(
        [foto(b, 1).caminho_1280, foto(b, 1).caminho_640].sort(),
      );
      const linhas = await tx`select alt, ordem from public.galeria_fotos order by ordem`;
      expect(linhas).toEqual([
        { alt: 'Foto 2', ordem: 0 },
        { alt: 'Foto 3', ordem: 1 },
      ]);
      const treze = Array.from({ length: 13 }, (_, i) => foto(b, i + 1));
      await esperarErroSql(
        tx.savepoint((s) => s`select public.salvar_galeria(${s.json(treze)})`),
        '23514',
      );
      const doze = treze.slice(0, 12);
      await tx`select public.salvar_galeria(${tx.json(doze)})`;
      const { n } = (await tx`select count(*)::int as n from public.galeria_fotos`)[0]!;
      expect(n).toBe(12);
    });
  });

  it('salvar_galeria recusa caminho de outra empresa ou fora da pasta galeria', async () => {
    await comoUsuario(sql, IDS.donoB, async (tx) => {
      for (const ruim of [
        foto(IDS.empresaA, 1),
        { ...foto(IDS.empresaB, 1), caminho_640: `${IDS.empresaB}/capa/x.webp` },
      ]) {
        await esperarErroSql(
          tx.savepoint((s) => s`select public.salvar_galeria(${s.json([ruim])})`),
          '23514',
        );
      }
    });
  });

  it('depoimentos e perguntas: limites de 6 e 8 e validação de tamanho', async () => {
    await comoUsuario(sql, IDS.donoB, async (tx) => {
      const dep = (i: number) => ({
        nome: `Cliente ${i}`,
        tipo_festa: null,
        texto: 'Festa linda, recomendo!',
      });
      await tx`select public.salvar_depoimentos(${tx.json([1, 2, 3, 4, 5, 6].map(dep))})`;
      await esperarErroSql(
        tx.savepoint(
          (s) => s`select public.salvar_depoimentos(${s.json([1, 2, 3, 4, 5, 6, 7].map(dep))})`,
        ),
        '23514',
      );
      await esperarErroSql(
        tx.savepoint(
          (s) => s`select public.salvar_depoimentos(${s.json([{ nome: 'A', texto: 'curto' }])})`,
        ),
        '23514',
      );
      const per = (i: number) => ({ pergunta: `Pergunta ${i}?`, resposta: 'Sim.' });
      await tx`select public.salvar_perguntas(${tx.json([1, 2, 3, 4, 5, 6, 7, 8].map(per))})`;
      await esperarErroSql(
        tx.savepoint(
          (s) => s`select public.salvar_perguntas(${s.json([1, 2, 3, 4, 5, 6, 7, 8, 9].map(per))})`,
        ),
        '23514',
      );
      const acoes = await tx`select acao from public.auditoria where empresa_id = ${IDS.empresaB}
        and acao like 'pagina.%' order by criado_em`;
      expect(acoes.map((a) => a.acao)).toEqual([
        'pagina.depoimentos_alterados',
        'pagina.perguntas_alteradas',
      ]);
    });
  });

  it('conta suspensa não grava a página', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`update public.empresas set plano = 'suspenso' where id = ${IDS.empresaB}`;
      const claims = JSON.stringify({ sub: IDS.donoB, role: 'authenticated' });
      await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`;
      await esperarErroSql(
        tx.savepoint((s) => s`select public.salvar_pagina_publica(${s.json({ slogan: 'Oi' })})`),
        '42501',
      );
      await esperarErroSql(
        tx.savepoint((s) => s`select public.salvar_perguntas(${s.json([])})`),
        '42501',
      );
    });
  });
});

describe('leitura pública', () => {
  it('anon lê só por publico.pagina; endereço completo só quando o dono marca', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirAnon(tx);
      const { p } = (await tx`select publico.pagina('buffet-demo') as p`)[0]!;
      expect(p).toMatchObject({ segmento: 'infantil', bairro: 'Centro', endereco: null });
      expect(p.galeria).toHaveLength(6);
      expect(p.depoimentos).toHaveLength(3);
      expect(p.perguntas).toHaveLength(3);
      expect(Object.keys(p).sort()).toEqual(
        [
          'bairro',
          'depoimentos',
          'diferenciais',
          'endereco',
          'estilo',
          'galeria',
          'perguntas',
          'segmento',
          'slogan',
        ].sort(),
      );
      const { b } = (await tx`select publico.pagina('buffet-teste-b') as b`)[0]!;
      expect(b).toMatchObject({ galeria: [], depoimentos: [], perguntas: [], diferenciais: [] });
      const { x } = (await tx`select publico.pagina('nao-existe') as x`)[0]!;
      expect(x).toBeNull();
    });
    await emTransacao(sql, async (tx) => {
      await tx`update public.empresas set mostrar_endereco = true where id = ${IDS.empresaA}`;
      await assumirAnon(tx);
      const { p } = (await tx`select publico.pagina('buffet-demo') as p`)[0]!;
      expect(p.endereco).toMatch(/Rondon Pacheco/);
    });
  });
});

describe('equivalência SQL × domínio', () => {
  it('_diferenciais_validos = diferenciaisValidos', async () => {
    const casos: string[][] = [
      [],
      ['Monitores'],
      ['Monitores', 'monitores'],
      ['Monitores', ' Monitores '],
      ['x'],
      ['  ab  '],
      ['x'.repeat(40)],
      ['x'.repeat(41)],
      Array.from({ length: 8 }, (_, i) => `Item ${i}`),
      Array.from({ length: 9 }, (_, i) => `Item ${i}`),
      ['Espaço próprio', 'ESPAÇO PRÓPRIO'],
    ];
    for (const c of casos) {
      const { v } = (await sql`select public._diferenciais_validos(${c}::text[]) as v`)[0]!;
      expect(v, JSON.stringify(c)).toBe(diferenciaisValidos(c));
    }
  });
});
