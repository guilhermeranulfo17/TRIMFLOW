import { afterAll, describe, expect, it } from 'vitest';
import { criarComAnon } from '@/server/db/anon';
import { criarDb } from '@/server/db/client';
import { lerPagina } from '@/server/publico/carregar';
import { comoUsuario, conectar, esperarErroSql, IDS, urlBancoTeste } from '../support/db';

/* Página pública elegante (§84): o modelo só é gravado por salvar_pagina_publica (dono). */

const sql = conectar();
const { db, sql: conexao } = criarDb(urlBancoTeste(), { max: 2 });
const comAnon = criarComAnon(db);

afterAll(async () => {
  await sql`update public.empresas set modelo_pagina = null, modelo_proposta = null
    where id in (${IDS.empresaA}, ${IDS.empresaB})`;
  await sql.end();
  await conexao.end();
});

describe('modelo da página pública', () => {
  it('o dono grava o modelo; vazio volta ao automático; ausente não muda; audita', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      await tx`select public.salvar_pagina_publica(${tx.json({ modelo: 'elegante' })})`;
      let [e] =
        await tx`select modelo_pagina, slogan from public.empresas where id = ${IDS.empresaA}`;
      expect(e!.modelo_pagina).toBe('elegante');
      await tx`select public.salvar_pagina_publica(${tx.json({ slogan: 'Outra frase' })})`;
      [e] = await tx`select modelo_pagina from public.empresas where id = ${IDS.empresaA}`;
      expect(e!.modelo_pagina).toBe('elegante');
      await tx`select public.salvar_pagina_publica(${tx.json({ modelo: '' })})`;
      [e] = await tx`select modelo_pagina from public.empresas where id = ${IDS.empresaA}`;
      expect(e!.modelo_pagina).toBeNull();
      const auditorias = await tx`select dados from public.auditoria
        where empresa_id = ${IDS.empresaA} and acao = 'pagina.textos_alterados'
        and dados->'depois' ? 'modelo' order by criado_em`;
      expect(auditorias.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('recusa modelo inválido', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      await esperarErroSql(
        tx.savepoint((s) => s`select public.salvar_pagina_publica(${s.json({ modelo: 'neon' })})`),
        '23514',
      );
    });
  });

  it('vendedor não grava o modelo', async () => {
    await comoUsuario(sql, IDS.vendedorA, async (tx) => {
      await esperarErroSql(
        tx.savepoint(
          (s) => s`select public.salvar_pagina_publica(${s.json({ modelo: 'elegante' })})`,
        ),
        '42501',
      );
    });
  });

  it('o link público lê o modelo efetivo: página, depois proposta, depois o segmento', async () => {
    // Buffet Demo é infantil: sem escolha, alegre (e o estilo do dono)
    let p = await lerPagina('buffet-demo', comAnon);
    expect(p!.modelo).toBe('alegre');
    expect(p!.estilo).toBe(p!.estiloAlegre);

    // a proposta elegante puxa a página junto
    await sql`update public.empresas set modelo_proposta = 'elegante' where id = ${IDS.empresaA}`;
    p = await lerPagina('buffet-demo', comAnon);
    expect(p!.modelo).toBe('elegante');
    expect(p!.estilo).toBe('elegante');

    // a escolha da página vale sobre a da proposta
    await sql`update public.empresas set modelo_pagina = 'alegre' where id = ${IDS.empresaA}`;
    p = await lerPagina('buffet-demo', comAnon);
    expect(p!.modelo).toBe('alegre');

    // buffet de eventos sem escolha: elegante
    const b = await lerPagina('buffet-teste-b', comAnon);
    expect(b!.modelo).toBe('elegante');
  });
});
