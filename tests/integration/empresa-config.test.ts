import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assumirAnon,
  assumirUsuario,
  comoUsuario,
  conectar,
  emTransacao,
  esperarErroSql,
  IDS,
} from '../support/db';

const sql = conectar();
afterAll(() => sql.end());

async function slugDe(tx: postgres.TransactionSql, empresaId: string) {
  const [r] = await tx`select slug from public.empresas where id = ${empresaId}`;
  return r?.slug as string;
}

describe('identidade da empresa', () => {
  it('dono altera logo, capa, cor e sobre da própria empresa', async () => {
    const r = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) =>
        tx`update public.empresas set cor_marca = '#112233', sobre = 'Festas com carinho',
           logo_path = ${`${IDS.empresaA}/logo/${randomUUID()}.webp`}
         where id = ${IDS.empresaA}`,
    );
    expect(r.count).toBe(1);
  });

  it('vendedor não altera nada da empresa', async () => {
    const r = await comoUsuario(
      sql,
      IDS.vendedorA,
      (tx) =>
        tx`update public.empresas set cor_marca = '#000000', sobre = 'x' where id = ${IDS.empresaA}`,
    );
    expect(r.count).toBe(0);
  });

  it('slug, plano e trial não são editáveis direto pelo painel', async () => {
    for (const comando of [
      `update public.empresas set slug = 'outro-slug'`,
      `update public.empresas set plano = 'ativo'`,
      `update public.empresas set trial_ate = now()`,
    ]) {
      await comoUsuario(sql, IDS.donoA, (tx) => esperarErroSql(tx.unsafe(comando), '42501'));
    }
  });

  it.each([
    ['cor fora do formato hex', `update public.empresas set cor_marca = 'roxo'`],
    ['sobre com mais de 600 caracteres', `update public.empresas set sobre = repeat('a', 601)`],
    [
      'logo apontando para pasta de outra empresa',
      `update public.empresas set logo_path = '${IDS.empresaB}/logo/${randomUUID()}.webp'`,
    ],
    ['capa fora do padrão de caminho', `update public.empresas set capa_path = 'qualquer.png'`],
    ['fuso inexistente', `update public.empresas set fuso = 'America/Atlantida'`],
  ])('recusa %s', async (_n, comando) => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(tx.unsafe(`${comando} where id = '${IDS.empresaA}'`), '23514'),
    );
  });

  it('aceita fuso válido', async () => {
    const r = await comoUsuario(
      sql,
      IDS.donoA,
      (tx) => tx`update public.empresas set fuso = 'America/Manaus' where id = ${IDS.empresaA}`,
    );
    expect(r.count).toBe(1);
  });
});

describe('alterar_slug', () => {
  it('troca o slug, guarda o antigo por 12 meses e audita', async () => {
    const r = await comoUsuario(sql, IDS.donoA, async (tx) => {
      const [novo] = await tx`select public.alterar_slug('  Buffet-Demo-Novo ') as slug`;
      const atual = await slugDe(tx, IDS.empresaA);
      const [antigo] =
        await tx`select slug, round(extract(epoch from (expira_em - now())) / 86400) as dias
                                from public.slugs_antigos where empresa_id = ${IDS.empresaA}`;
      const [aud] = await tx`select dados from public.auditoria
                             where empresa_id = ${IDS.empresaA} and acao = 'empresa.slug_alterado'`;
      return { novo: novo?.slug, atual, antigo, aud };
    });
    expect(r.novo).toBe('buffet-demo-novo');
    expect(r.atual).toBe('buffet-demo-novo');
    expect(r.antigo?.slug).toBe('buffet-demo');
    expect(Number(r.antigo?.dias)).toBeGreaterThanOrEqual(364);
    expect(r.aud?.dados).toEqual({ antes: 'buffet-demo', depois: 'buffet-demo-novo' });
  });

  it('recusa slug em uso por outra empresa', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(tx`select public.alterar_slug('buffet-teste-b')`, '23505'),
    );
  });

  it('recusa slug antigo (ainda válido) de outra empresa', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoB);
      await tx`select public.alterar_slug('buffet-b-renomeado')`;
      await tx`reset role`;
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroSql(tx`select public.alterar_slug('buffet-teste-b')`, '23505');
    });
  });

  it('libera slug antigo expirado de outra empresa', async () => {
    const atual = await emTransacao(sql, async (tx) => {
      await tx`insert into public.slugs_antigos (slug, empresa_id, expira_em)
               values ('slug-expirado', ${IDS.empresaB}, now() - interval '1 day')`;
      await assumirUsuario(tx, IDS.donoA);
      await tx`select public.alterar_slug('slug-expirado')`;
      return slugDe(tx, IDS.empresaA);
    });
    expect(atual).toBe('slug-expirado');
  });

  it('voltar para um slug antigo próprio o remove de slugs_antigos', async () => {
    const r = await comoUsuario(sql, IDS.donoA, async (tx) => {
      await tx`select public.alterar_slug('buffet-demo-2026')`;
      await tx`select public.alterar_slug('buffet-demo')`;
      const antigos =
        await tx`select slug from public.slugs_antigos where empresa_id = ${IDS.empresaA} order by slug`;
      return { atual: await slugDe(tx, IDS.empresaA), antigos: antigos.map((a) => a.slug) };
    });
    expect(r.atual).toBe('buffet-demo');
    expect(r.antigos).toEqual(['buffet-demo-2026']);
  });

  it('mesmo slug atual não muda nada', async () => {
    const n = await comoUsuario(sql, IDS.donoA, async (tx) => {
      await tx`select public.alterar_slug('buffet-demo')`;
      const [r] = await tx`select count(*)::int as n from public.slugs_antigos`;
      return r?.n;
    });
    expect(n).toBe(0);
  });

  it.each(['ab', 'com espaço', 'acentuação', '-hifen', 'a'.repeat(61)])(
    'recusa formato inválido "%s"',
    async (slug) => {
      await comoUsuario(sql, IDS.donoA, (tx) =>
        esperarErroSql(tx`select public.alterar_slug(${slug})`, '22023'),
      );
    },
  );

  it('só o dono troca o slug', async () => {
    await comoUsuario(sql, IDS.vendedorA, (tx) =>
      esperarErroSql(tx`select public.alterar_slug('slug-do-vendedor')`, '42501'),
    );
    await emTransacao(sql, async (tx) => {
      await assumirAnon(tx);
      await esperarErroSql(tx`select public.alterar_slug('slug-anonimo')`, '42501');
    });
  });

  it('o painel não grava em slugs_antigos direto', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(
        tx`insert into public.slugs_antigos (slug, empresa_id, expira_em) values ('x-y-z', ${IDS.empresaA}, now())`,
        '42501',
      ),
    );
  });

  it('cadastro novo não pega slug antigo válido de outra empresa', async () => {
    const slug = await emTransacao(sql, async (tx) => {
      await tx`insert into public.slugs_antigos (slug, empresa_id, expira_em)
               values ('buffet-ocupado', ${IDS.empresaB}, now() + interval '1 month')`;
      const [r] = await tx`select public.resolver_slug_disponivel('buffet-ocupado') as s`;
      return r?.s;
    });
    expect(slug).toBe('buffet-ocupado-2');
  });
});

describe('slug_atual_por_antigo (redirecionamento público)', () => {
  it('slug antigo válido resolve para o atual, inclusive para anon', async () => {
    const r = await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await tx`select public.alterar_slug('buffet-demo-atual')`;
      await tx`reset role`;
      await assumirAnon(tx);
      const [a] = await tx`select public.slug_atual_por_antigo('buffet-demo') as atual`;
      const [b] = await tx`select public.slug_atual_por_antigo('nao-existe') as atual`;
      return [a?.atual, b?.atual];
    });
    expect(r).toEqual(['buffet-demo-atual', null]);
  });

  it('slug antigo expirado não resolve', async () => {
    const atual = await emTransacao(sql, async (tx) => {
      await tx`insert into public.slugs_antigos (slug, empresa_id, expira_em)
               values ('antigo-vencido', ${IDS.empresaA}, now() - interval '1 minute')`;
      const [r] = await tx`select public.slug_atual_por_antigo('antigo-vencido') as atual`;
      return r?.atual;
    });
    expect(atual).toBeNull();
  });
});

describe('storage: bucket midia', () => {
  const caminho = (empresa: string, tipo = 'logo') => `${empresa}/${tipo}/${randomUUID()}.webp`;
  const inserir = (tx: postgres.TransactionSql, nome: string) =>
    tx`insert into storage.objects (bucket_id, name) values ('midia', ${nome})`;
  /**
   * O Storage bloqueia DELETE direto por SQL (trigger `storage.protect_delete`); a Storage API
   * liga `storage.allow_delete_query` na própria transação antes de apagar. Fazemos o mesmo:
   * as policies de RLS continuam valendo.
   */
  const apagar = async (tx: postgres.TransactionSql, nome: string) => {
    await tx`select set_config('storage.allow_delete_query', 'true', true)`;
    return tx`delete from storage.objects where name = ${nome}`;
  };

  it('é público (leitura pela URL do bucket)', async () => {
    const [b] = await sql`select public, file_size_limit from storage.buckets where id = 'midia'`;
    expect(b).toEqual({ public: true, file_size_limit: '5242880' });
  });

  it('dono grava, lê e apaga na pasta da própria empresa', async () => {
    const r = await comoUsuario(sql, IDS.donoA, async (tx) => {
      const nome = caminho(IDS.empresaA, 'pacotes');
      const ins = await inserir(tx, nome);
      const sel = await tx`select name from storage.objects where name = ${nome}`;
      const del = await apagar(tx, nome);
      return [ins.count, sel.length, del.count];
    });
    expect(r).toEqual([1, 1, 1]);
  });

  it('dono não grava na pasta de outra empresa', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(inserir(tx, caminho(IDS.empresaB)), '42501'),
    );
  });

  it('dono não grava fora das pastas logo, capa e pacotes', async () => {
    await comoUsuario(sql, IDS.donoA, (tx) =>
      esperarErroSql(inserir(tx, caminho(IDS.empresaA, 'outros')), '42501'),
    );
  });

  it('vendedor não grava', async () => {
    await comoUsuario(sql, IDS.vendedorA, (tx) =>
      esperarErroSql(inserir(tx, caminho(IDS.empresaA)), '42501'),
    );
  });

  it('anon não grava', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirAnon(tx);
      await esperarErroSql(inserir(tx, caminho(IDS.empresaA)), '42501');
    });
  });

  it('DELETE direto por SQL é bloqueado (só pela Storage API)', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      const nome = caminho(IDS.empresaA);
      await inserir(tx, nome);
      await esperarErroSql(tx`delete from storage.objects where name = ${nome}`, '42501');
    });
  });

  it('dono de B não vê nem apaga arquivos de A', async () => {
    const r = await emTransacao(sql, async (tx) => {
      const nome = caminho(IDS.empresaA);
      await inserir(tx, nome);
      await assumirUsuario(tx, IDS.donoB);
      const sel = await tx`select 1 from storage.objects where name = ${nome}`;
      const del = await apagar(tx, nome);
      return [sel.length, del.count];
    });
    expect(r).toEqual([0, 0]);
  });
});

describe('sincronização de e-mail', () => {
  it('trocar o e-mail no Auth atualiza usuarios.email', async () => {
    const email = await emTransacao(sql, async (tx) => {
      await tx`update auth.users set email = 'Vendedor.Novo@Demo.local' where id = ${IDS.vendedorA}`;
      const [u] = await tx`select email from public.usuarios where id = ${IDS.vendedorA}`;
      return u?.email;
    });
    expect(email).toBe('vendedor.novo@demo.local');
  });
});
