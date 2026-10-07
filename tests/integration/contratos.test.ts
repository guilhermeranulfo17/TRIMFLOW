import { createHash, randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { hashTexto, normalizarTexto } from '@/domain/contratos/integridade';
import { assumirUsuario, conectar, emTransacao, esperarErroSql, IDS } from '../support/db';
import { comoAnon } from '../support/publico';

/*
 * Etapa 10 (PR 1) no banco: emitir (o dono assina ao enviar), link do cliente (token só como
 * hash, mesma resposta para inexistente/vencido/cancelado), assinatura com e sem código,
 * recusa, refazer, imutabilidade, isolamento, limite do plano, conta suspensa e LGPD.
 */

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;
const SLUG = 'buffet-demo';
const SLUG_B = 'buffet-teste-b';

async function como<T>(tx: Tx, usuarioId: string, fn: () => Promise<T>): Promise<T> {
  await assumirUsuario(tx, usuarioId);
  try {
    return await fn();
  } finally {
    // depois de um erro dentro de um savepoint, o rollback dele já desfaz a identidade
    await tx`reset role`.catch(() => {});
    await tx`select set_config('request.jwt.claims', '', true)`.catch(() => {});
  }
}

async function mensagemDoErro(
  tx: Tx,
  fn: (sp: Tx) => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp as unknown as Tx);
    });
  } catch (e) {
    return (e as { message?: string }).message;
  }
  return undefined;
}

const novoToken = () => randomBytes(32).toString('base64url');
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const TEXTO = normalizarTexto(
  '# Contrato de teste\n\n## 1. Partes\nCONTRATANTE: Clara Contratante, CPF informado na assinatura.\n\n## 2. Valor\nR$ 5.000,00',
);
const CIFRADO = `v1:${'A'.repeat(60)}`;

type Base = { lead: string; orcamento: string; email: string | null };

/** Lead do Buffet Demo com orçamento aceito (o seed tem), com nome e e-mail conhecidos. */
async function base(tx: Tx): Promise<Base> {
  const [o] = await tx`select o.id, o.lead_id from public.orcamentos o
    join public.leads l on l.id = o.lead_id
    where o.empresa_id = ${IDS.empresaA} and o.status = 'aceito' and not l.eh_teste
      and l.anonimizado_em is null
    order by o.criado_em limit 1`;
  await tx`update public.leads set nome = 'Clara Contratante', email = 'clara@exemplo.com'
    where id = ${o!.lead_id}`;
  return { lead: o!.lead_id as string, orcamento: o!.id as string, email: 'clara@exemplo.com' };
}

async function emitir(
  tx: Tx,
  b: Base,
  o: { exigeCodigo?: boolean; substitui?: string; texto?: string; usuario?: string } = {},
): Promise<{ id: string; numero: number; ano: number; versao: number; token: string }> {
  const token = novoToken();
  const p = {
    lead_id: b.lead,
    orcamento_id: b.orcamento,
    titulo: 'Contrato de teste',
    texto: o.texto ?? TEXTO,
    valores: { total_centavos: 500000, data: '2026-12-12' },
    variaveis: { cliente_nome: 'Clara Contratante' },
    exige_codigo: o.exigeCodigo ?? false,
    email_cliente: b.email,
    validade_dias: 14,
    token_hash: sha(token),
    substitui_contrato_id: o.substitui ?? null,
    ip_hash: sha('ip-dono'),
    user_agent: 'Teste/1.0',
  };
  const r = await como(tx, o.usuario ?? IDS.donoA, async () => {
    const [l] = await tx`select public.emitir_contrato(${tx.json(p)}) as r`;
    return l!.r as { id: string; numero: number; ano: number; versao: number };
  });
  return { ...r, token };
}

const publico = <T>(tx: Tx, fn: () => Promise<T>) => comoAnon(tx, fn);

async function lerPublico(tx: Tx, token: string, slug = SLUG) {
  return publico(tx, async () => {
    const [l] = await tx`select publico.contrato(${slug}, ${token}) as c`;
    return l!.c as Record<string, unknown>;
  });
}

async function assinar(tx: Tx, token: string, extra: Record<string, unknown> = {}) {
  const c = await lerPublico(tx, token);
  const p = {
    nome: 'Clara Contratante',
    documento_cifrado: CIFRADO,
    documento_mascarado: '***.982.247-**',
    hash: c.hash as string,
    ip_hash: sha('ip-cliente'),
    user_agent: 'Celular/1.0',
    eh_usuario_empresa: false,
    ...extra,
  };
  return publico(tx, async () => {
    const [l] = await tx`select publico.contrato_assinar(${SLUG}, ${token}, ${tx.json(p)}) as r`;
    return l!.r as { ok: boolean; codigo?: string; restantes?: number };
  });
}

describe('emitir contrato', () => {
  it('numera por ano, calcula o mesmo hash do domínio e o buffet já assina', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      const c = await emitir(tx, b);
      expect(c.numero).toBe(a.numero + 1);
      expect(a.versao).toBe(1);

      const [linha] =
        await tx`select status, hash, texto, eh_teste, token_hash from public.contratos
        where id = ${a.id}`;
      expect(linha!.status).toBe('enviado');
      // equivalência: sha256 do banco = hashTexto do domínio
      expect(linha!.hash).toBe(hashTexto(TEXTO));
      expect(linha!.token_hash).toBe(sha(a.token));
      expect(linha!.texto).not.toContain(a.token);

      const ass =
        await tx`select parte, nome, representa, documento_cifrado, hash_documento, usuario_id
        from public.contrato_assinaturas where contrato_id = ${a.id}`;
      expect(ass).toHaveLength(1);
      expect(ass[0]).toMatchObject({
        parte: 'buffet',
        usuario_id: IDS.donoA,
        documento_cifrado: null,
      });
      expect(ass[0]!.hash_documento).toBe(linha!.hash);

      const [aud] = await tx`select acao from public.auditoria where entidade_id = ${a.id}`;
      expect(aud!.acao).toBe('contrato.enviado');
    });
  });

  it('o hash do banco bate com o domínio também com acentos e emojis', async () => {
    const [l] =
      await sql`select encode(sha256(convert_to(${'Ação ✓ 🎉 coração'}, 'UTF8')), 'hex') as h`;
    expect(l!.h).toBe(hashTexto('Ação ✓ 🎉 coração'));
  });

  it('recusa vendedor, texto com variável faltando e código sem e-mail', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      expect(await mensagemDoErro(tx, () => emitir(tx, b, { usuario: IDS.vendedorA }))).toBe(
        'CONTRATO_SO_DONO',
      );
      expect(
        await mensagemDoErro(tx, () => emitir(tx, b, { texto: `${TEXTO}\n[[FALTA:buffet_cnpj]]` })),
      ).toBe('CONTRATO_VARIAVEL_FALTANDO');
      expect(
        await mensagemDoErro(tx, () => emitir(tx, { ...b, email: null }, { exigeCodigo: true })),
      ).toBe('CONTRATO_CODIGO_SEM_EMAIL');
    });
  });

  it('limite do plano: contratos por mês (lead de teste não conta)', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      // Buffet Demo usa o Profissional: limite de 1 só nesta transação
      await tx`update public.planos set contratos_mes = 1 where codigo = 'profissional'`;
      await tx`delete from public.contratos where empresa_id = ${IDS.empresaA}`;
      await emitir(tx, b);
      expect(await mensagemDoErro(tx, () => emitir(tx, b))).toBe('LIMITE_PLANO_CONTRATOS');
      await tx`update public.leads set eh_teste = true where id = ${b.lead}`;
      await expect(emitir(tx, b)).resolves.toMatchObject({ versao: 1 });
    });
  });

  it('conta suspensa não emite; ver o CPF continua', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      expect((await assinar(tx, a.token)).ok).toBe(true);
      await tx`update public.empresas set plano = 'suspenso' where id = ${IDS.empresaA}`;
      expect(await mensagemDoErro(tx, () => emitir(tx, b))).toBe('CONTA_SOMENTE_LEITURA');
      const cpf = await como(tx, IDS.donoA, async () => {
        const [l] = await tx`select public.ler_cpf_contrato(${a.id}) as c`;
        return l!.c as string;
      });
      expect(cpf).toBe(CIFRADO);
      const [aud] = await tx`select count(*)::int as n from public.auditoria
        where entidade_id = ${a.id} and acao = 'contrato.cpf_visto'`;
      expect(aud!.n).toBe(1);
    });
  });
});

describe('link do cliente', () => {
  it('mesma resposta para token inexistente, de outro buffet, vencido e cancelado', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      const aberto = await lerPublico(tx, a.token);
      expect(aberto).toMatchObject({ estado: 'aberto', titulo: 'Contrato de teste', texto: TEXTO });
      expect(aberto.email_mascarado).toBe('c***@exemplo.com');
      expect(JSON.stringify(aberto)).not.toMatch(/token_hash|documento_cifrado|clara@/);

      const indisponivel = { estado: 'indisponivel' };
      expect(await lerPublico(tx, novoToken())).toEqual(indisponivel);
      expect(await lerPublico(tx, 'curto')).toEqual(indisponivel);
      expect(await lerPublico(tx, a.token, SLUG_B)).toEqual(indisponivel);

      await tx`update public.contratos set expira_em = now() - interval '1 minute' where id = ${a.id}`;
      expect(await lerPublico(tx, a.token)).toEqual(indisponivel);
      const [st] = await tx`select status from public.contratos where id = ${a.id}`;
      expect(st!.status).toBe('expirado');

      const c = await emitir(tx, b);
      await como(tx, IDS.donoA, () => tx`select public.cancelar_contrato(${c.id}, 'teste')`);
      expect(await lerPublico(tx, c.token)).toEqual(indisponivel);
    });
  });

  it('abrir registra a visualização (o dono testando não conta)', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      await publico(
        tx,
        () => tx`select publico.contrato_visualizar(${SLUG}, ${a.token}, true, 'x')`,
      );
      let [l] = await tx`select visualizado_em from public.contratos where id = ${a.id}`;
      expect(l!.visualizado_em).toBeNull();
      await publico(
        tx,
        () => tx`select publico.contrato_visualizar(${SLUG}, ${a.token}, false, 'x')`,
      );
      await publico(
        tx,
        () => tx`select publico.contrato_visualizar(${SLUG}, ${a.token}, false, 'x')`,
      );
      [l] = await tx`select visualizado_em from public.contratos where id = ${a.id}`;
      expect(l!.visualizado_em).not.toBeNull();
      const [n] = await tx`select count(*)::int as n from public.auditoria
        where entidade_id = ${a.id} and acao = 'contrato.visualizado'`;
      expect(n!.n).toBe(1);
    });
  });

  it('assina sem código: concluído, registro completo e não assina duas vezes', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      expect(await assinar(tx, a.token, { hash: 'f'.repeat(64) })).toMatchObject({
        ok: false,
        codigo: 'CONTRATO_MUDOU',
      });
      expect(await assinar(tx, a.token, { nome: 'Clara' })).toMatchObject({
        codigo: 'DADOS_INVALIDOS',
      });
      expect(await assinar(tx, a.token, { documento_mascarado: '529.982.247-25' })).toMatchObject({
        codigo: 'DADOS_INVALIDOS',
      });
      expect(await assinar(tx, a.token, { eh_usuario_empresa: true })).toMatchObject({
        codigo: 'MODO_TESTE',
      });
      expect(await assinar(tx, a.token)).toEqual({ ok: true });
      expect(await assinar(tx, a.token)).toMatchObject({ ok: false, codigo: 'JA_ASSINADO' });

      const [c] = await tx`select status, concluido_em from public.contratos where id = ${a.id}`;
      expect(c!.status).toBe('concluido');
      const [cl] = await tx`select * from public.contrato_assinaturas
        where contrato_id = ${a.id} and parte = 'cliente'`;
      expect(cl).toMatchObject({
        nome: 'Clara Contratante',
        documento_cifrado: CIFRADO,
        documento_mascarado: '***.982.247-**',
        metodo: 'aceite',
        codigo_verificado: false,
        ip_hash: sha('ip-cliente'),
        user_agent: 'Celular/1.0',
      });

      expect(await lerPublico(tx, a.token)).toMatchObject({
        estado: 'concluido',
        cliente_nome: 'Clara Contratante',
      });
      const comp = await publico(tx, async () => {
        const [l] = await tx`select publico.contrato_comprovante(${SLUG}, ${a.token}, 'ip') as c`;
        return l!.c as {
          assinaturas: { parte: string; documento: string | null; ip: string | null }[];
        };
      });
      expect(comp.assinaturas.map((s) => s.parte)).toEqual(['buffet', 'cliente']);
      expect(comp.assinaturas[1]!.documento).toBe('***.982.247-**');
      expect(comp.assinaturas[1]!.ip).toHaveLength(16);
      expect(JSON.stringify(comp)).not.toContain(CIFRADO);
    });
  });

  it('com código: pedir, errar até bloquear, código vencido e o certo', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b, { exigeCodigo: true });
      expect(await assinar(tx, a.token)).toMatchObject({ codigo: 'CODIGO_PEDIR' });

      const pedir = (codigo: string) =>
        publico(tx, async () => {
          const [l] = await tx`select publico.contrato_pedir_codigo(${SLUG}, ${a.token},
            ${sha(codigo)}, ${sha('ip-cliente')}) as r`;
          return l!.r as { ok: boolean; email?: string; codigo?: string };
        });
      expect(await pedir('111111')).toMatchObject({ ok: true, email: 'clara@exemplo.com' });
      for (let i = 1; i <= 4; i++) {
        expect(await assinar(tx, a.token, { codigo_hash: sha('000000') })).toMatchObject({
          codigo: 'CODIGO_INVALIDO',
          restantes: 5 - i,
        });
      }
      expect(await assinar(tx, a.token, { codigo_hash: sha('000000') })).toMatchObject({
        codigo: 'CODIGO_BLOQUEADO',
      });
      expect(await assinar(tx, a.token, { codigo_hash: sha('111111') })).toMatchObject({
        codigo: 'CODIGO_BLOQUEADO',
      });

      // código novo invalida o anterior; vencido não vale
      expect((await pedir('222222')).ok).toBe(true);
      await tx`update public.contrato_codigos set expira_em = now() - interval '1 second'
        where contrato_id = ${a.id} and usado_em is null`;
      expect(await assinar(tx, a.token, { codigo_hash: sha('222222') })).toMatchObject({
        codigo: 'CODIGO_EXPIRADO',
      });
      expect((await pedir('333333')).ok).toBe(true);
      expect(await assinar(tx, a.token, { codigo_hash: sha('333333') })).toEqual({ ok: true });
      const [cl] = await tx`select metodo, codigo_verificado from public.contrato_assinaturas
        where contrato_id = ${a.id} and parte = 'cliente'`;
      expect(cl).toEqual({ metodo: 'aceite_com_codigo', codigo_verificado: true });

      // limite de códigos por contrato (5 por hora)
      const c = await emitir(tx, b, { exigeCodigo: true });
      const pedirC = () =>
        publico(tx, async () => {
          const [l] = await tx`select publico.contrato_pedir_codigo(${SLUG}, ${c.token},
            ${sha('1')}, ${sha('outro-ip')}) as r`;
          return l!.r as { ok: boolean; codigo?: string };
        });
      for (let i = 0; i < 5; i++) expect((await pedirC()).ok).toBe(true);
      expect(await pedirC()).toEqual({ ok: false, codigo: 'LIMITE' });
    });
  });

  it('pedir ajuste (recusa) e refazer: número novo, versão 2, anterior cancelado', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      const r = await publico(tx, async () => {
        const [l] = await tx`select publico.contrato_recusar(${SLUG}, ${a.token}, 'Mudar a data',
          'ip', false) as r`;
        return l!.r;
      });
      expect(r).toEqual({ ok: true });
      expect(await lerPublico(tx, a.token)).toEqual({ estado: 'recusado', buffet: 'Buffet Demo' });
      expect(await assinar(tx, a.token)).toMatchObject({ codigo: 'INDISPONIVEL' });

      const novo = await emitir(tx, b, { substitui: a.id });
      expect(novo.versao).toBe(2);
      expect(novo.numero).toBe(a.numero + 1);
      const [ant] =
        await tx`select status, cancelamento_motivo from public.contratos where id = ${a.id}`;
      expect(ant).toEqual({ status: 'cancelado', cancelamento_motivo: 'Refeito' });
      const [n] =
        await tx`select substitui_contrato_id from public.contratos where id = ${novo.id}`;
      expect(n!.substitui_contrato_id).toBe(a.id);

      // concluído não é refeito nem cancelado
      expect((await assinar(tx, novo.token)).ok).toBe(true);
      expect(await mensagemDoErro(tx, () => emitir(tx, b, { substitui: novo.id }))).toBe(
        'CONTRATO_NAO_REFAZ',
      );
      expect(
        await mensagemDoErro(tx, () =>
          como(tx, IDS.donoA, () => tx`select public.cancelar_contrato(${novo.id}, null)`),
        ),
      ).toBe('CONTRATO_CONCLUIDO');
    });
  });

  it('link novo: o antigo para de abrir', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      const outro = novoToken();
      await como(
        tx,
        IDS.donoA,
        () => tx`select public.novo_link_contrato(${a.id}, ${sha(outro)}, 7)`,
      );
      expect(await lerPublico(tx, a.token)).toEqual({ estado: 'indisponivel' });
      expect((await lerPublico(tx, outro)).estado).toBe('aberto');
    });
  });
});

describe('imutabilidade', () => {
  it('texto, hash e valores não mudam depois do envio, nem pelo banco direto', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      for (const mudanca of [
        (sp: Tx) => sp`update public.contratos set texto = texto || ' x' where id = ${a.id}`,
        (sp: Tx) =>
          sp`update public.contratos set texto = ${TEXTO + ' x'},
            hash = encode(sha256(convert_to(${TEXTO + ' x'}, 'UTF8')), 'hex') where id = ${a.id}`,
        (sp: Tx) =>
          sp`update public.contratos set valores = '{"total_centavos": 1}' where id = ${a.id}`,
        (sp: Tx) => sp`update public.contratos set numero = numero + 100 where id = ${a.id}`,
      ]) {
        expect(['CONTRATO_IMUTAVEL', 'CONTRATO_HASH_INVALIDO']).toContain(
          await mensagemDoErro(tx, mudanca),
        );
      }
      // hash errado na entrada
      expect(
        await mensagemDoErro(
          tx,
          (sp) =>
            sp`insert into public.contratos (empresa_id, ano, numero, lead_id, titulo, texto, hash)
            values (${IDS.empresaA}, 2026, 9999, ${b.lead}, 'X', ${TEXTO}, ${'0'.repeat(64)})`,
        ),
      ).toBe('CONTRATO_HASH_INVALIDO');

      // concluído não muda de status; assinatura não muda
      expect((await assinar(tx, a.token)).ok).toBe(true);
      expect(
        await mensagemDoErro(
          tx,
          (sp) => sp`update public.contratos set status = 'cancelado' where id = ${a.id}`,
        ),
      ).toBe('CONTRATO_IMUTAVEL');
      expect(
        await mensagemDoErro(
          tx,
          (sp) =>
            sp`update public.contrato_assinaturas set nome = 'Outra Pessoa' where contrato_id = ${a.id}`,
        ),
      ).toBe('CONTRATO_IMUTAVEL');
    });
  });

  it('o painel só lê (dono), e nem lê os códigos', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b, { exigeCodigo: true });
      await como(tx, IDS.donoA, async () => {
        expect(await tx`select id from public.contratos where id = ${a.id}`).toHaveLength(1);
        await esperarErroSql(
          tx.savepoint((sp) => sp`update public.contratos set titulo = 'x' where id = ${a.id}`),
          '42501',
        );
        await esperarErroSql(
          tx.savepoint((sp) => sp`delete from public.contratos where id = ${a.id}`),
          '42501',
        );
        await esperarErroSql(
          tx.savepoint((sp) => sp`select * from public.contrato_codigos`),
          '42501',
        );
      });
      await como(tx, IDS.vendedorA, async () => {
        expect(await tx`select id from public.contratos`).toHaveLength(0);
        expect(await tx`select id from public.contrato_assinaturas`).toHaveLength(0);
      });
    });
  });
});

describe('isolamento entre buffets', () => {
  it('um buffet nunca vê o contrato do outro; anônimo não lê nada', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      await como(tx, IDS.donoB, async () => {
        for (const t of ['contratos', 'contrato_assinaturas', 'contrato_modelos']) {
          expect(await tx.unsafe(`select * from public.${t}`), t).toHaveLength(0);
        }
        expect(
          await mensagemDoErro(tx, (sp) => sp`select public.cancelar_contrato(${a.id}, null)`),
        ).toBe('CONTRATO_NAO_ENCONTRADO');
        expect(
          await mensagemDoErro(tx, (sp) => sp`select public.contrato_comprovante(${a.id})`),
        ).toBeUndefined();
        const [l] = await tx`select public.contrato_comprovante(${a.id}) as c`;
        expect(l!.c).toBeNull();
      });
      await comoAnon(tx, async () => {
        for (const t of [
          'contratos',
          'contrato_assinaturas',
          'contrato_modelos',
          'contrato_codigos',
        ]) {
          await esperarErroSql(
            tx.savepoint((sp) => sp.unsafe(`select * from public.${t}`)),
            '42501',
          );
        }
      });
    });
  });
});

describe('modelos da empresa', () => {
  it('dono cria e edita (versão sobe); vendedor não', async () => {
    await emTransacao(sql, async (tx) => {
      const id = await como(tx, IDS.donoA, async () => {
        const [l] = await tx`select public.salvar_contrato_modelo(${tx.json({
          titulo: 'Meu modelo',
          segmento: 'infantil',
          texto: 'Contrato de {{cliente_nome}} com {{buffet_nome}}.',
          opcoes: { usoImagem: true },
          origem: 'infantil@1',
        })}) as id`;
        return l!.id as string;
      });
      await como(
        tx,
        IDS.donoA,
        () =>
          tx`select public.salvar_contrato_modelo(${tx.json({ id, texto: 'Outro texto de {{cliente_nome}} aqui.' })})`,
      );
      const [m] =
        await tx`select versao, origem, ativo from public.contrato_modelos where id = ${id}`;
      expect(m).toEqual({ versao: 2, origem: 'infantil@1', ativo: true });
      expect(
        await mensagemDoErro(tx, () =>
          como(
            tx,
            IDS.vendedorA,
            () =>
              tx`select public.salvar_contrato_modelo(${tx.json({ titulo: 'X', segmento: 'infantil', texto: 'x'.repeat(30) })})`,
          ),
        ),
      ).toBe('CONTRATO_SO_DONO');
    });
  });
});

describe('LGPD e rotina diária', () => {
  it('lead anonimizado: contrato não assinado é anonimizado, o concluído fica', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const aberto = await emitir(tx, b, { exigeCodigo: true });
      const fechado = await emitir(tx, b);
      expect((await assinar(tx, fechado.token)).ok).toBe(true);
      // ontem no fuso da empresa (o banco confere "reserva futura" nele; current_date é UTC)
      await tx`update public.reservas
        set data = (now() at time zone 'America/Sao_Paulo')::date - 1 where lead_id = ${b.lead}`;

      const exportado = await como(tx, IDS.donoA, async () => {
        const [l] = await tx`select public.lgpd_exportar_lead(${b.lead}) as j`;
        return l!.j as {
          contratos: { status: string; assinaturas: { documento: string | null }[] }[];
        };
      });
      expect(exportado.contratos.map((c) => c.status)).toEqual(['enviado', 'concluido']);
      expect(JSON.stringify(exportado)).not.toContain(CIFRADO);

      await como(tx, IDS.donoA, () => tx`select public.lgpd_apagar_lead(${b.lead})`);
      const [x] = await tx`select texto, email_cliente, anonimizado_em, variaveis
        from public.contratos where id = ${aberto.id}`;
      expect(x!.texto).not.toMatch(/Clara|Contratante/);
      expect(x!.email_cliente).toBeNull();
      expect(x!.anonimizado_em).not.toBeNull();
      expect(JSON.stringify(x!.variaveis)).not.toMatch(/Clara/);
      expect(await lerPublico(tx, aberto.token)).toEqual({ estado: 'indisponivel' });

      const [y] =
        await tx`select texto, anonimizado_em from public.contratos where id = ${fechado.id}`;
      expect(y!.texto).toContain('Clara Contratante');
      expect(y!.anonimizado_em).toBeNull();
    });
  });

  it('rotina: link vencido expira; concluído há mais de 5 anos da festa é anonimizado', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await base(tx);
      const a = await emitir(tx, b);
      const c = await emitir(tx, b);
      expect((await assinar(tx, c.token)).ok).toBe(true);
      await tx`update public.contratos set expira_em = now() - interval '1 hour' where id = ${a.id}`;

      const [r1] = await tx`select public.contratos_rotina() as r`;
      expect(r1!.r).toMatchObject({ expirados: 1, anonimizados: 0 });
      const [st] = await tx`select status from public.contratos where id = ${a.id}`;
      expect(st!.status).toBe('expirado');

      // só os contratos deste teste (a demo pode ter um contrato concluído de exemplo)
      await tx`delete from public.contratos where empresa_id <> ${IDS.empresaA}`;
      // festa (valores.data = 2026-12-12) + 5 anos e 1 dia
      const [r2] = await tx`select public.contratos_rotina('2031-12-14T12:00:00Z') as r`;
      expect(r2!.r).toMatchObject({ anonimizados: 1 });
      const [cl] = await tx`select nome, documento_cifrado from public.contrato_assinaturas
        where contrato_id = ${c.id} and parte = 'cliente'`;
      expect(cl).toEqual({ nome: 'Titular removido', documento_cifrado: null });
      const [x] = await tx`select texto from public.contratos where id = ${c.id}`;
      expect(x!.texto).not.toContain('Clara');
    });
  });
});
