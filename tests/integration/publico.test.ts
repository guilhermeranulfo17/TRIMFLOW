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
import { criarEmpresaTemporaria, removerEmpresa } from '../support/empresa-temporaria';
import {
  cenarioPublico,
  comoAnon,
  concluir,
  dataDaqui,
  iniciar,
  preReservar,
  type Cenario,
} from '../support/publico';

const sql = conectar();
afterAll(() => sql.end());

type Tx = postgres.TransactionSql;

/** Espera que a promessa falhe com a mensagem (código PUBLICO_*, LIMITE_EXCEDIDO…). */
async function esperarMensagem(tx: Tx, promessa: () => Promise<unknown>, mensagem: string) {
  try {
    await tx.savepoint(async () => {
      await promessa();
    });
  } catch (e) {
    expect((e as Error).message).toBe(mensagem);
    return;
  }
  throw new Error(`Esperava ${mensagem}, mas passou.`);
}

/** Orçamento concluído (como anon), pronto para pré-reservar. */
async function orcamentoConcluido(tx: Tx, c: Cenario, o: { whatsapp?: string; data: string }) {
  return comoAnon(tx, async () => {
    const token = await iniciar(tx, c, o);
    return concluir(tx, c, token, { data: o.data });
  });
}

describe('acesso do anon', () => {
  it('anon não tem nenhum privilégio em nenhuma tabela de public e publico', async () => {
    const linhas = await sql`
      select n.nspname || '.' || c.relname as tabela,
             has_table_privilege('anon', c.oid, 'select') as sel,
             has_table_privilege('anon', c.oid, 'insert') as ins,
             has_table_privilege('anon', c.oid, 'update') as upd,
             has_table_privilege('anon', c.oid, 'delete') as del
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'publico') and c.relkind in ('r', 'v', 'm', 'p')`;
    expect(linhas.length).toBeGreaterThan(20);
    const comAcesso = linhas.filter((l) => l.sel || l.ins || l.upd || l.del);
    expect(comAcesso).toEqual([]);
  });

  it('anon executa só as funções públicas de publico; authenticated não executa nenhuma', async () => {
    const funcoes = await sql`
      select n.nspname, p.proname,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'publico')`;
    const anonPode = funcoes.filter((f) => f.anon).map((f) => `${f.nspname}.${f.proname}`);
    // Em public, anon só executa os helpers das policies e o redirecionamento de slug da Etapa 2.
    for (const nome of anonPode) {
      if (nome.startsWith('publico.')) expect(nome).not.toMatch(/^publico\._/);
    }
    expect(anonPode).toEqual(
      expect.arrayContaining([
        'publico.buffet',
        'publico.contexto_preco',
        'publico.disponibilidade',
        'publico.iniciar_orcamento',
        'publico.pre_reservar',
      ]),
    );
    for (const proibida of [
      'public._disponibilidade',
      'public._criar_reserva_core',
      'public._lead_aplicar_evento',
      'public.criar_reserva',
      'public.abandonar_leads',
      'publico._limitar',
      'publico._orcamento',
    ]) {
      expect(anonPode).not.toContain(proibida);
    }
    const publicoParaAuth = funcoes.filter((f) => f.nspname === 'publico' && f.auth);
    expect(publicoParaAuth).toEqual([]);
  });

  it('anon lê o buffet pelas funções, mas não pelas tabelas', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirAnon(tx);
      const [b] = await tx`select * from publico.buffet('buffet-demo')`;
      expect(b).toMatchObject({ nome: 'Buffet Demo', slug: 'buffet-demo', suspenso: false });
      expect(Object.keys(b!)).not.toContain('email');
      expect(Object.keys(b!)).not.toContain('plano');
      await esperarErroSql(
        tx.savepoint((s) => s`select * from public.empresas`),
        '42501',
      );
      await esperarErroSql(
        tx.savepoint((s) => s`select * from public.leads`),
        '42501',
      );
      await esperarErroSql(
        tx.savepoint((s) => s`select * from publico.tentativas`),
        '42501',
      );
    });
  });

  it('slug inexistente: buffet vazio e contexto com erro', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirAnon(tx);
      expect(await tx`select * from publico.buffet('nao-existe-xyz')`).toEqual([]);
      await esperarMensagem(
        tx,
        () => tx`select publico.contexto_preco('nao-existe-xyz')`,
        'PUBLICO_NAO_ENCONTRADO',
      );
    });
  });

  it('slug antigo ainda válido devolve o atual', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`insert into public.slugs_antigos (slug, empresa_id, expira_em)
        values ('buffet-antigo-teste', ${IDS.empresaA}, now() + interval '1 day')`;
      await assumirAnon(tx);
      const [r] = await tx`select publico.slug_atual('buffet-antigo-teste') as s`;
      expect(r!.s).toBe('buffet-demo');
    });
  });
});

describe('painel nas tabelas novas', () => {
  it('authenticated não tem escrita direta em nenhuma tabela nova', async () => {
    const tabelas = [
      'leads',
      'orcamentos',
      'orcamento_itens',
      'atividades',
      'visitas',
      'funil_eventos',
    ];
    for (const t of tabelas) {
      const [p] = await sql`select
        has_table_privilege('authenticated', ${'public.' + t}, 'select') as sel,
        has_table_privilege('authenticated', ${'public.' + t}, 'insert') as ins,
        has_table_privilege('authenticated', ${'public.' + t}, 'update') as upd,
        has_table_privilege('authenticated', ${'public.' + t}, 'delete') as del`;
      expect({ t, ...p }).toEqual({ t, sel: true, ins: false, upd: false, del: false });
    }
  });

  it('cada empresa só lê os próprios leads (RLS)', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      await comoAnon(tx, () => iniciar(tx, c, { data, whatsapp: '+5534990001111' }));
      await assumirUsuario(tx, IDS.donoB);
      const deB = await tx`select id from public.leads where whatsapp_e164 = '+5534990001111'`;
      expect(deB).toEqual([]);
      await tx`reset role`;
      await assumirUsuario(tx, IDS.vendedorA);
      const deA = await tx`select id from public.leads where whatsapp_e164 = '+5534990001111'`;
      expect(deA).toHaveLength(1);
      await esperarErroSql(
        tx.savepoint((s) => s`update public.leads set status = 'reservado'`),
        '42501',
      );
    });
  });
});

describe('iniciar orçamento', () => {
  it('mesmo WhatsApp: mesmo lead, token novo, resposta idêntica e nome preservado', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const [t1, t2] = await comoAnon(tx, async () => [
        await iniciar(tx, c, { data, nome: 'Ana Original', whatsapp: '+5534990002222' }),
        await iniciar(tx, c, { data, nome: 'Outro Nome', whatsapp: '+5534990002222' }),
      ]);
      expect(t1).not.toBe(t2);
      expect(t1).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(t2).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const leads =
        await tx`select id, nome, status from public.leads where whatsapp_e164 = '+5534990002222'`;
      expect(leads).toHaveLength(1);
      expect(leads[0]).toMatchObject({ nome: 'Ana Original', status: 'em_andamento' });
      const orcs =
        await tx`select numero from public.orcamentos where lead_id = ${leads[0]!.id} order by numero`;
      expect(orcs).toHaveLength(2);
      expect(orcs[1]!.numero).toBe(orcs[0]!.numero + 1);
      const tipos = await tx`select tipo, dados from public.atividades
        where lead_id = ${leads[0]!.id} order by criado_em, tipo`;
      expect(tipos.map((t) => t.tipo)).toEqual(
        expect.arrayContaining(['lead_criado', 'orcamento_iniciado', 'voltou']),
      );
      const voltou = tipos.find((t) => t.tipo === 'voltou');
      expect(voltou!.dados).toMatchObject({ nome_informado: 'Outro Nome' });
    });
  });

  it('modo teste cria lead separado, marcado como teste', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      await comoAnon(tx, async () => {
        await iniciar(tx, c, { data, whatsapp: '+5534990003333' });
        await iniciar(tx, c, { data, whatsapp: '+5534990003333', teste: true });
      });
      const leads = await tx`select eh_teste from public.leads
        where whatsapp_e164 = '+5534990003333' order by eh_teste`;
      expect(leads.map((l) => l.eh_teste)).toEqual([false, true]);
    });
  });

  it('valida nome, WhatsApp, consentimento e escolhas de outra empresa', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const deB = await cenarioPublico(tx, IDS.empresaB);
      const data = await dataDaqui(tx, 200);
      await comoAnon(tx, async () => {
        await esperarMensagem(
          tx,
          () => iniciar(tx, c, { data, whatsapp: '34991110000' }),
          'PUBLICO_DADOS_INVALIDOS',
        );
        await esperarMensagem(
          tx,
          () => iniciar(tx, c, { data, nome: 'A' }),
          'PUBLICO_DADOS_INVALIDOS',
        );
        // Turno/espaço/tipo da empresa B no link da empresa A.
        await esperarMensagem(
          tx,
          () => iniciar(tx, { ...deB, slug: c.slug }, { data }),
          'PUBLICO_DADOS_INVALIDOS',
        );
      });
    });
  });

  it('empresa suspensa não aceita orçamento e o buffet aparece como suspenso', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      await tx`update public.empresas set plano = 'suspenso' where id = ${IDS.empresaA}`;
      await comoAnon(tx, async () => {
        const [b] = await tx`select suspenso from publico.buffet('buffet-demo')`;
        expect(b!.suspenso).toBe(true);
        await esperarMensagem(tx, () => iniciar(tx, c, { data }), 'PUBLICO_SUSPENSO');
        await esperarMensagem(
          tx,
          () => tx`select publico.contexto_preco('buffet-demo')`,
          'PUBLICO_SUSPENSO',
        );
      });
    });
  });
});

describe('limites', () => {
  async function encher(tx: Tx, acao: string, tipo: string, hash: string, n: number) {
    await tx`insert into publico.tentativas (acao, chave_tipo, chave_hash, empresa_id)
      select ${acao}, ${tipo}, ${hash}, ${IDS.empresaA} from generate_series(1, ${n})`;
  }

  it('por IP: o 11º orçamento na mesma hora é recusado', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      await encher(tx, 'iniciar', 'ip', 'ip-cheio', 10);
      await comoAnon(tx, () =>
        esperarMensagem(tx, () => iniciar(tx, c, { data, ip: 'ip-cheio' }), 'LIMITE_EXCEDIDO'),
      );
      // Tentativas de mais de 1 hora não contam.
      await tx`update publico.tentativas set criado_em = now() - interval '2 hours'
        where chave_hash = 'ip-cheio'`;
      await comoAnon(tx, () => iniciar(tx, c, { data, ip: 'ip-cheio' }));
    });
  });

  it('por WhatsApp e por empresa', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const [h] =
        await tx`select encode(sha256(convert_to(${IDS.empresaA} || ':+5534990004444', 'UTF8')), 'hex') as h`;
      await encher(tx, 'iniciar', 'whatsapp', h!.h as string, 5);
      await comoAnon(tx, () =>
        esperarMensagem(
          tx,
          () => iniciar(tx, c, { data, whatsapp: '+5534990004444', ip: 'ip-livre-1' }),
          'LIMITE_EXCEDIDO',
        ),
      );
      await encher(tx, 'iniciar', 'empresa', IDS.empresaA, 300);
      await comoAnon(tx, () =>
        esperarMensagem(tx, () => iniciar(tx, c, { data, ip: 'ip-livre-2' }), 'LIMITE_EXCEDIDO'),
      );
    });
  });

  it('as tentativas guardam só hashes', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      await comoAnon(tx, () => iniciar(tx, c, { data, whatsapp: '+5534990005555' }));
      const linhas =
        await tx`select chave_hash from publico.tentativas where chave_tipo = 'whatsapp'`;
      expect(linhas.length).toBeGreaterThan(0);
      for (const l of linhas) expect(l.chave_hash).not.toContain('5534990005555');
    });
  });
});

describe('disponibilidade pública', () => {
  it('devolve só disponível ou não, respeitando antecedência e ocupação', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      await tx`update public.regras_comerciais set antecedencia_min_dias = 10
        where empresa_id = ${IDS.empresaA}`;
      const perto = await dataDaqui(tx, 5);
      const longe = await dataDaqui(tx, 200);
      await assumirUsuario(tx, IDS.donoA);
      await tx`select public.criar_reserva(${c.espaco}, ${c.turno}, ${longe}::date,
        'confirmada', 'Cliente Secreto')`;
      await tx`reset role`;
      const consultar = (de: string, ate: string) =>
        tx`select * from publico.disponibilidade(${c.slug}, ${de}::date, ${ate}::date, ${c.espaco})
          where turno_id = ${c.turno}`;
      const linhas = await comoAnon(tx, async () => [
        ...(await consultar(perto, perto)),
        ...(await consultar(await dataDaqui(tx, 199), longe)),
      ]);
      expect(Object.keys(linhas[0]!).sort()).toEqual([
        'data',
        'disponivel',
        'espaco_id',
        'turno_id',
      ]);
      const porData = new Map(
        linhas.map((l) => [(l.data as Date).toISOString().slice(0, 10), l.disponivel]),
      );
      expect(porData.get(perto)).toBe(false);
      expect(porData.get(longe)).toBe(false);
      expect(porData.get(await dataDaqui(tx, 199))).toBe(true);
      expect(JSON.stringify(linhas)).not.toContain('Cliente Secreto');
    });
  });

  it('recusa períodos acima de 62 dias', async () => {
    await emTransacao(sql, async (tx) => {
      await comoAnon(tx, () =>
        esperarMensagem(
          tx,
          () =>
            tx`select * from publico.disponibilidade('buffet-demo', current_date, current_date + 70)`,
          'PUBLICO_PERIODO_INVALIDO',
        ),
      );
    });
  });
});

describe('proposta', () => {
  it('concluir congela e a proposta só abre com o slug certo', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await orcamentoConcluido(tx, c, { data });
      await comoAnon(tx, async () => {
        const [p] = await tx`select publico.proposta(${c.slug}, ${token}) as p`;
        // Ler a proposta não marca visualizada: só a abertura registrada (Etapa 5) marca.
        expect(p!.p).toMatchObject({ status: 'enviado', total_centavos: 500_000 });
        expect(p!.p.itens).toHaveLength(1);
        expect(p!.p.cliente_primeiro_nome).toBe('Maria');
        // nunca o WhatsApp do cliente (o do buffet aparece no rodapé)
        expect(JSON.stringify(p!.p)).not.toContain('+5534991110000');
        await esperarMensagem(
          tx,
          () => tx`select publico.proposta('buffet-teste-b', ${token})`,
          'PUBLICO_ORCAMENTO_NAO_ENCONTRADO',
        );
        await esperarMensagem(
          tx,
          () => tx`select publico.proposta(${c.slug}, ${'x'.repeat(43)})`,
          'PUBLICO_ORCAMENTO_NAO_ENCONTRADO',
        );
      });
    });
  });

  it('o token de um buffet não serve na página de outro', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await orcamentoConcluido(tx, c, { data });
      const outro = { ...c, slug: 'buffet-teste-b' };
      await comoAnon(tx, async () => {
        const [e] = await tx`select publico.estado_orcamento('buffet-teste-b', ${token}) as e`;
        expect(e!.e).toBeNull();
        const [ok] = await tx`select publico.estado_orcamento(${c.slug}, ${token}) as e`;
        expect(ok!.e).toMatchObject({ status: 'enviado', passo_atual: 6 });
        await esperarMensagem(
          tx,
          () => preReservar(tx, outro, token),
          'PUBLICO_ORCAMENTO_NAO_ENCONTRADO',
        );
      });
    });
  });

  it('concluir de novo depois de enviado cria um orçamento novo e substitui o anterior', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const t1 = await orcamentoConcluido(tx, c, { data });
      const t2 = await comoAnon(tx, () => concluir(tx, c, t1, { data, total: 600_000 }));
      expect(t2).not.toBe(t1);
      const linhas = await tx`select token, status, total_centavos from public.orcamentos
        where token in ${tx([t1, t2])}`;
      const porToken = new Map(linhas.map((l) => [l.token, l]));
      expect(porToken.get(t1)).toMatchObject({ status: 'substituido', total_centavos: 500_000 });
      expect(porToken.get(t2)).toMatchObject({ status: 'enviado', total_centavos: 600_000 });
    });
  });

  it('orçamento vencido vira expirado e não pré-reserva', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await orcamentoConcluido(tx, c, { data });
      await tx`update public.orcamentos set validade_ate = current_date - 1 where token = ${token}`;
      const r = await comoAnon(tx, () => preReservar(tx, c, token));
      expect(r).toEqual({ ok: false, codigo: 'ORCAMENTO_EXPIRADO' });
      const [o] = await tx`select status from public.orcamentos where token = ${token}`;
      expect(o!.status).toBe('expirado');
      expect(await tx`select 1 from public.reservas where espaco_id = ${c.espaco}`).toEqual([]);
    });
  });
});

describe('pré-reserva pelo link', () => {
  it('cria a pré-reserva ligada ao lead e ao orçamento, e o lead fica quente', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await orcamentoConcluido(tx, c, { data, whatsapp: '+5534990006666' });
      const r = await comoAnon(tx, () => preReservar(tx, c, token));
      expect(r).toMatchObject({ ok: true, simulada: false, sinal_centavos: 150_000 });
      const [reserva] = await tx`select r.*, o.status as orc_status, l.status as lead_status,
          l.temperatura, l.nome as lead_nome
        from public.reservas r
        join public.orcamentos o on o.id = r.orcamento_id
        join public.leads l on l.id = r.lead_id
        where r.espaco_id = ${c.espaco}`;
      expect(reserva).toMatchObject({
        tipo: 'pre_reserva',
        origem: 'link_publico',
        cliente_nome: 'Maria Cliente',
        cliente_whatsapp_e164: '+5534990006666',
        valor_total_centavos: 500_000,
        convidados: 50,
        orc_status: 'aceito',
        lead_status: 'pre_reservado',
        temperatura: 'quente',
      });
      expect(reserva!.expira_em).not.toBeNull();
      // Duplo clique devolve a mesma, sem criar outra.
      const de_novo = await comoAnon(tx, () => preReservar(tx, c, token));
      expect(de_novo.ok).toBe(true);
      const total =
        await tx`select count(*)::int as n from public.reservas where espaco_id = ${c.espaco}`;
      expect(total[0]!.n).toBe(1);
    });
  });

  it('segundo cliente no mesmo slot recebe SLOT_INDISPONIVEL com sugestões', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const t1 = await orcamentoConcluido(tx, c, { data, whatsapp: '+5534990007771' });
      const t2 = await orcamentoConcluido(tx, c, { data, whatsapp: '+5534990007772' });
      await comoAnon(tx, () => preReservar(tx, c, t1));
      const r = await comoAnon(tx, () => preReservar(tx, c, t2));
      expect(r.ok).toBe(false);
      expect(r.codigo).toBe('SLOT_INDISPONIVEL');
      expect(r.sugestoes).toHaveLength(3);
      for (const s of r.sugestoes!) {
        expect(s.turno_id).toBe(c.turno);
        expect(s.data > data).toBe(true);
      }
    });
  });

  it('uma pré-reserva ativa por lead: escolher outra data libera a anterior', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const d1 = await dataDaqui(tx, 200);
      const d2 = await dataDaqui(tx, 210);
      const t1 = await orcamentoConcluido(tx, c, { data: d1, whatsapp: '+5534990008888' });
      await comoAnon(tx, () => preReservar(tx, c, t1));
      const t2 = await orcamentoConcluido(tx, c, { data: d2, whatsapp: '+5534990008888' });
      await comoAnon(tx, () => preReservar(tx, c, t2));
      const reservas = await tx`select data::text, status, motivo_cancelamento
        from public.reservas where espaco_id = ${c.espaco} order by data`;
      expect(reservas).toEqual([
        { data: d1, status: 'cancelada', motivo_cancelamento: 'cliente escolheu outra data' },
        { data: d2, status: 'ativa', motivo_cancelamento: null },
      ]);
    });
  });

  it('não cancela a pré-reserva manual do dono para o mesmo cliente', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const d1 = await dataDaqui(tx, 200);
      const d2 = await dataDaqui(tx, 205);
      const t1 = await orcamentoConcluido(tx, c, { data: d2, whatsapp: '+5534990008899' });
      const [lead] = await tx`select id from public.leads where whatsapp_e164 = '+5534990008899'`;
      // Pré-reserva manual ligada ao lead (como o painel faria numa etapa futura).
      await assumirUsuario(tx, IDS.donoA);
      const [m] = await tx`select public.criar_reserva(${c.espaco}, ${c.turno}, ${d1}::date,
        'pre_reserva', 'Maria') as id`;
      await tx`reset role`;
      await tx`update public.reservas set lead_id = ${lead!.id} where id = ${m!.id}`;
      await comoAnon(tx, () => preReservar(tx, c, t1));
      const [manual] = await tx`select status from public.reservas where id = ${m!.id}`;
      expect(manual!.status).toBe('ativa');
    });
  });

  it('modo teste valida e simula, sem gravar reserva', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await comoAnon(tx, async () => {
        const t = await iniciar(tx, c, { data, teste: true });
        return concluir(tx, c, t, { data });
      });
      const r = await comoAnon(tx, () => preReservar(tx, c, token));
      expect(r).toMatchObject({ ok: true, simulada: true });
      expect(await tx`select 1 from public.reservas where espaco_id = ${c.espaco}`).toEqual([]);
    });
  });

  it('pré-reserva vencida libera o slot e o lead volta para em andamento', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await orcamentoConcluido(tx, c, { data, whatsapp: '+5534990009999' });
      await comoAnon(tx, () => preReservar(tx, c, token));
      await tx`update public.reservas set expira_em = now() - interval '1 minute'
        where espaco_id = ${c.espaco}`;
      const livre = await comoAnon(
        tx,
        () => tx`select disponivel from publico.disponibilidade(${c.slug}, ${data}::date, ${data}::date, ${c.espaco})
          where turno_id = ${c.turno}`,
      );
      expect(livre[0]!.disponivel).toBe(true);
      await tx`select public.vencer_pre_reservas()`;
      const [lead] =
        await tx`select status from public.leads where whatsapp_e164 = '+5534990009999'`;
      expect(lead!.status).toBe('em_andamento');
      const [atividade] = await tx`select a.tipo, a.autor from public.atividades a
        join public.leads l on l.id = a.lead_id
        where l.whatsapp_e164 = '+5534990009999' order by a.criado_em desc limit 1`;
      expect(atividade).toMatchObject({ tipo: 'pre_reserva_vencida', autor: 'sistema' });
    });
  });
});

describe('status do lead sincronizado com a agenda', () => {
  async function leadPreReservado(tx: Tx, whatsapp: string) {
    const c = await cenarioPublico(tx, IDS.empresaA);
    const data = await dataDaqui(tx, 200);
    const token = await orcamentoConcluido(tx, c, { data, whatsapp });
    await comoAnon(tx, () => preReservar(tx, c, token));
    const [r] = await tx`select id, lead_id from public.reservas where espaco_id = ${c.espaco}`;
    return { reserva: r!.id as string, lead: r!.lead_id as string };
  }
  const statusDo = async (tx: Tx, lead: string) =>
    (await tx`select status from public.leads where id = ${lead}`)[0]!.status as string;

  it('confirmar → reservado; cancelar confirmada → cancelado', async () => {
    await emTransacao(sql, async (tx) => {
      const { reserva, lead } = await leadPreReservado(tx, '+5534990010001');
      await assumirUsuario(tx, IDS.vendedorA);
      await tx`select public.confirmar_reserva(${reserva}, 100000)`;
      await tx`reset role`;
      expect(await statusDo(tx, lead)).toBe('reservado');
      await assumirUsuario(tx, IDS.donoA);
      await tx`select public.cancelar_reserva(${reserva}, 'desistiu')`;
      await tx`reset role`;
      expect(await statusDo(tx, lead)).toBe('cancelado');
      const [a] = await tx`select autor, usuario_id from public.atividades
        where lead_id = ${lead} and tipo = 'reserva_cancelada'`;
      expect(a).toMatchObject({ autor: 'usuario', usuario_id: IDS.donoA });
    });
  });

  it('cancelar a pré-reserva → em andamento', async () => {
    await emTransacao(sql, async (tx) => {
      const { reserva, lead } = await leadPreReservado(tx, '+5534990010002');
      await assumirUsuario(tx, IDS.donoA);
      await tx`select public.cancelar_reserva(${reserva})`;
      await tx`reset role`;
      expect(await statusDo(tx, lead)).toBe('em_andamento');
    });
  });

  it('marcar_realizadas → realizado', async () => {
    await emTransacao(sql, async (tx) => {
      const { reserva, lead } = await leadPreReservado(tx, '+5534990010003');
      await tx`update public.reservas set tipo = 'confirmada', expira_em = null,
        inicio = now() - interval '2 days', fim = now() - interval '1 day' where id = ${reserva}`;
      await tx`select public.marcar_realizadas()`;
      expect(await statusDo(tx, lead)).toBe('realizado');
    });
  });

  it('abandonar_leads: novo sem atividade há 24h vira abandonou; os outros não mudam', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      await comoAnon(tx, async () => {
        await iniciar(tx, c, { data, whatsapp: '+5534990010004' });
        await iniciar(tx, c, { data, whatsapp: '+5534990010005' });
      });
      await tx`update public.leads set ultima_atividade_em = now() - interval '25 hours'
        where whatsapp_e164 = '+5534990010004'`;
      await tx`select public.abandonar_leads()`;
      const linhas = await tx`select whatsapp_e164, status from public.leads
        where whatsapp_e164 in ('+5534990010004', '+5534990010005') order by whatsapp_e164`;
      expect(linhas.map((l) => l.status)).toEqual(['abandonou', 'novo']);
      // Voltou: abandonou → em andamento, com atividade "voltou".
      await comoAnon(tx, () => iniciar(tx, c, { data, whatsapp: '+5534990010004' }));
      const [l] = await tx`select status from public.leads where whatsapp_e164 = '+5534990010004'`;
      expect(l!.status).toBe('em_andamento');
    });
  });

  it('criar_reserva manual continua igual (sem lead, sem atividade)', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      await tx`reset role`;
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      await assumirUsuario(tx, IDS.donoA);
      const [r] = await tx`select public.criar_reserva(${c.espaco}, ${c.turno}, ${data}::date,
        'pre_reserva', 'Manual', null, null, 30) as id`;
      const [linha] = await tx`select origem, lead_id, orcamento_id, criado_por, convidados
        from public.reservas where id = ${r!.id}`;
      expect(linha).toEqual({
        origem: 'manual',
        lead_id: null,
        orcamento_id: null,
        criado_por: IDS.donoA,
        convidados: 30,
      });
    });
  });
});

describe('visita, atividade e funil', () => {
  it('pedir visita cria a visita e esquenta o lead sem mudar o status', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await orcamentoConcluido(tx, c, { data, whatsapp: '+5534990011111' });
      const preferida = await dataDaqui(tx, 7);
      await comoAnon(
        tx,
        () =>
          tx`select publico.solicitar_visita(${c.slug}, ${token}, ${preferida}::date, 'tarde', 'Depois das 15h', 'ip')`,
      );
      const [l] = await tx`select l.status, l.temperatura, v.periodo from public.leads l
        join public.visitas v on v.lead_id = l.id where l.whatsapp_e164 = '+5534990011111'`;
      expect(l).toEqual({ status: 'em_andamento', temperatura: 'quente', periodo: 'tarde' });
    });
  });

  it('registrar_atividade aceita só o clique no WhatsApp', async () => {
    await emTransacao(sql, async (tx) => {
      const c = await cenarioPublico(tx, IDS.empresaA);
      const data = await dataDaqui(tx, 200);
      const token = await orcamentoConcluido(tx, c, { data });
      await comoAnon(tx, async () => {
        await tx`select publico.registrar_atividade(${c.slug}, ${token}, 'whatsapp_clicado')`;
        await esperarMensagem(
          tx,
          () => tx`select publico.registrar_atividade(${c.slug}, ${token}, 'reserva_confirmada')`,
          'PUBLICO_DADOS_INVALIDOS',
        );
      });
      const [n] = await tx`select count(*)::int as n from public.atividades a
        join public.orcamentos o on o.id = a.orcamento_id
        where o.token = ${token} and a.tipo = 'whatsapp_clicado'`;
      expect(n!.n).toBe(1);
    });
  });

  it('funil grava sem dado pessoal; modo teste não conta', async () => {
    await emTransacao(sql, async (tx) => {
      const sessao = '9f000000-0000-4000-8000-000000000001';
      await comoAnon(tx, async () => {
        await tx`select publico.registrar_funil('buffet-demo', ${sessao}, 2::smallint, 'passo_visto', 'google', 'ip')`;
        await tx`select publico.registrar_funil('buffet-demo', ${sessao}, 3::smallint, 'passo_visto', 'google', 'ip', true)`;
      });
      const linhas =
        await tx`select passo, evento, origem from public.funil_eventos where sessao = ${sessao}`;
      expect(linhas).toEqual([{ passo: 2, evento: 'passo_visto', origem: 'google' }]);
    });
  });
});

describe('concorrência no link público (duas conexões reais)', () => {
  it('dois clientes no mesmo slot: um pré-reserva, o outro recebe sugestões', async () => {
    const e = await criarEmpresaTemporaria(sql, 'infantil');
    const conexaoA = conectar();
    const conexaoB = conectar();
    try {
      const c = await cenarioPublico(sql, e.empresaId);
      const data = await dataDaqui(sql, 40);
      const tokens: string[] = [];
      for (const whatsapp of ['+5534990012001', '+5534990012002']) {
        await sql.begin(async (tx) => {
          tokens.push(await orcamentoConcluido(tx, c, { data, whatsapp }));
        });
      }
      const tentar = (conexao: postgres.Sql, token: string, segurar?: Promise<void>) =>
        conexao.begin(async (tx) => {
          await assumirAnon(tx);
          const r = await preReservar(tx, c, token);
          if (segurar) await segurar;
          return r;
        });

      let liberarA!: () => void;
      const segurandoA = new Promise<void>((ok) => (liberarA = ok));
      const a = tentar(conexaoA, tokens[0]!, segurandoA);
      await new Promise((ok) => setTimeout(ok, 300));
      const b = tentar(conexaoB, tokens[1]!);
      await new Promise((ok) => setTimeout(ok, 300));
      liberarA();

      const [ra, rb] = await Promise.all([a, b]);
      expect(ra.ok).toBe(true);
      expect(rb).toMatchObject({ ok: false, codigo: 'SLOT_INDISPONIVEL' });
      expect(rb.sugestoes!.length).toBeGreaterThan(0);
      const [n] =
        await sql`select count(*)::int as n from public.reservas where empresa_id = ${e.empresaId} and status = 'ativa'`;
      expect(n!.n).toBe(1);
    } finally {
      await conexaoA.end();
      await conexaoB.end();
      await sql`delete from public.reservas where empresa_id = ${e.empresaId}`;
      await removerEmpresa(sql, e);
    }
  });
});
