import 'server-only';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { documentoValido } from '@/domain/cobranca/documento';
import { hojeNoFuso } from '@/domain/dates';
import { ehCodigoModulo, MODULOS, podeVender, type CodigoModulo } from '@/domain/modulos';
import type { DepsCobranca, Resultado } from '@/server/cobranca/fluxos';
import { ERRO_ASAAS, garantirCliente, registrarCobrancaLida } from '@/server/cobranca/fluxos';
import { ErroAsaas } from '@/server/cobranca/asaas';
import {
  auditoria,
  empresas,
  empresasCobranca,
  moduloAssinaturas,
  moduloCobrancas,
  moduloCompras,
  modulos,
  reservas,
} from '@/server/db/schema';
import { codigoDoErro, logar } from '@/server/log';

/*
 * Contratação dos módulos adicionais (Nossas soluções). Pela conexão administrativa, como a
 * cobrança da assinatura-base: quem chama já conferiu que é o dono. Cada módulo mensal é uma
 * assinatura PRÓPRIA no Asaas (a assinatura-base nunca é alterada); o por evento é uma cobrança
 * avulsa ligada à reserva. A referência externa é "modulo:<id>" (o webhook reconhece por ela).
 *
 * Nada aqui libera acesso: o direito nasce da cobrança confirmada pelo provedor
 * (cobranca_registrar_evento → _modulo_registrar_evento).
 */

export type DadosCobranca = { nome: string; documento: string; email: string };

export type EntradaContratar = {
  empresaId: string;
  usuarioId: string;
  codigo: string;
  /** por evento: a festa que será ativada */
  reservaId?: string | null;
  /** obrigatório se a empresa ainda não tem dados de cobrança */
  dados?: DadosCobranca | null;
};

const ERRO_INDISPONIVEL = 'Esta solução ainda não está disponível para contratação.';

const agoraDe = (d: DepsCobranca) => (d.agora ?? (() => new Date()))();

const ehViolacaoUnica = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === '23505';

async function auditar(
  d: DepsCobranca,
  empresaId: string,
  usuarioId: string | null,
  acao: string,
  entidadeId: string | null,
  dados: Record<string, unknown>,
) {
  await d.db.insert(auditoria).values({
    empresaId,
    usuarioId,
    acao,
    entidade: 'modulo',
    entidadeId,
    dados,
  });
}

/** Link da fatura em aberto mais antiga (pendente ou vencida). */
async function faturaEmAberto(
  d: DepsCobranca,
  o: { assinaturaId?: string; compraId?: string },
): Promise<string | null> {
  const [c] = await d.db
    .select({ link: moduloCobrancas.linkFatura })
    .from(moduloCobrancas)
    .where(
      and(
        o.assinaturaId
          ? eq(moduloCobrancas.moduloAssinaturaId, o.assinaturaId)
          : eq(moduloCobrancas.moduloCompraId, o.compraId!),
        inArray(moduloCobrancas.status, ['pendente', 'vencida']),
      ),
    )
    .orderBy(moduloCobrancas.vencimento)
    .limit(1);
  return c?.link ?? null;
}

/** Busca as cobranças da assinatura do módulo no Asaas e registra (idempotente). */
async function sincronizarAssinatura(d: DepsCobranca, asaasAssinaturaId: string) {
  const lista = await d.asaas.cobrancasDaAssinatura(asaasAssinaturaId);
  for (const p of lista) await registrarCobrancaLida(d.db, 'sinc', p);
}

async function lerContexto(d: DepsCobranca, empresaId: string, codigo: string) {
  if (!ehCodigoModulo(codigo)) return null;
  const [m] = await d.db.select().from(modulos).where(eq(modulos.codigo, codigo));
  const [e] = await d.db
    .select({
      id: empresas.id,
      fuso: empresas.fuso,
      plano: empresas.plano,
      demo: sql<boolean>`${empresas}.eh_demo`,
    })
    .from(empresas)
    .where(eq(empresas.id, empresaId));
  if (!m || !e) return null;
  return { modulo: m, empresa: e, codigo: codigo as CodigoModulo };
}

async function precisaDados(d: DepsCobranca, empresaId: string, dados?: DadosCobranca | null) {
  if (dados) {
    if (!documentoValido(dados.documento)) return 'CPF ou CNPJ inválido. Confira os números.';
    return null;
  }
  const [ec] = await d.db
    .select({ id: empresasCobranca.empresaId })
    .from(empresasCobranca)
    .where(eq(empresasCobranca.empresaId, empresaId));
  return ec ? null : 'Informe os dados de cobrança (nome, CPF ou CNPJ e e-mail).';
}

export async function contratarModulo(
  d: DepsCobranca,
  e: EntradaContratar,
): Promise<Resultado<{ urlFatura: string | null }>> {
  const ctx = await lerContexto(d, e.empresaId, e.codigo);
  if (!ctx) return { ok: false, erro: 'Solução não encontrada.' };
  if (!podeVender(ctx.codigo, ctx.modulo.vendaLiberada)) {
    return { ok: false, erro: ERRO_INDISPONIVEL, codigo: 'MODULO_SEM_VENDA' };
  }
  if (ctx.empresa.demo) {
    return { ok: false, erro: 'A conta de demonstração não contrata soluções.' };
  }
  if (ctx.empresa.plano === 'suspenso') {
    return {
      ok: false,
      erro: 'Regularize a assinatura do sistema em Minha empresa → Plano antes de contratar uma solução.',
    };
  }
  const faltaDados = await precisaDados(d, e.empresaId, e.dados);
  if (faltaDados) return { ok: false, erro: faltaDados, codigo: 'DADOS_COBRANCA' };

  const hoje = hojeNoFuso(ctx.empresa.fuso, agoraDe(d));
  const nome = MODULOS[ctx.codigo].nome;
  return ctx.modulo.cobranca === 'mensal'
    ? contratarMensal(d, e, ctx, hoje, nome)
    : contratarPorEvento(d, e, ctx, hoje, nome);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof lerContexto>>>;

async function contratarMensal(
  d: DepsCobranca,
  e: EntradaContratar,
  ctx: Ctx,
  hoje: string,
  nome: string,
): Promise<Resultado<{ urlFatura: string | null }>> {
  const [viva] = await d.db
    .select()
    .from(moduloAssinaturas)
    .where(
      and(
        eq(moduloAssinaturas.empresaId, e.empresaId),
        eq(moduloAssinaturas.modulo, ctx.codigo),
        ne(moduloAssinaturas.status, 'cancelada'),
      ),
    );
  try {
    // dois cliques ou "Continuar pagamento": devolve a mesma fatura, sem criar outra assinatura
    if (viva) {
      if (viva.status === 'ativa' && viva.pagoAte && viva.pagoAte >= hoje) {
        return { ok: false, erro: `${nome} já está ativo na sua conta.` };
      }
      if (viva.asaasAssinaturaId) await sincronizarAssinatura(d, viva.asaasAssinaturaId);
      return { ok: true, dados: { urlFatura: await faturaEmAberto(d, { assinaturaId: viva.id }) } };
    }

    let id: string;
    try {
      const [nova] = await d.db
        .insert(moduloAssinaturas)
        .values({
          empresaId: e.empresaId,
          modulo: ctx.codigo,
          valorCentavos: ctx.modulo.precoCentavos,
          criadaPor: e.usuarioId,
        })
        .returning({ id: moduloAssinaturas.id });
      id = nova!.id;
    } catch (erro) {
      if (ehViolacaoUnica(erro)) return contratarMensal(d, e, ctx, hoje, nome);
      throw erro;
    }

    try {
      const cliente = await garantirCliente(d, e.empresaId, e.dados ?? null);
      const sub = await d.asaas.criarAssinatura({
        cliente,
        valorCentavos: ctx.modulo.precoCentavos,
        vencimento: hoje,
        ciclo: 'MONTHLY',
        descricao: `Orkestra ${nome} (adicional mensal)`,
        empresaId: e.empresaId,
        referencia: `modulo:${id}`,
      });
      await d.db
        .update(moduloAssinaturas)
        .set({ asaasAssinaturaId: sub.id })
        .where(eq(moduloAssinaturas.id, id));
      await auditar(d, e.empresaId, e.usuarioId, 'modulo.contratar', id, {
        modulo: ctx.codigo,
        valor_centavos: ctx.modulo.precoCentavos,
      });
      await sincronizarAssinatura(d, sub.id);
    } catch (erro) {
      // sem assinatura no Asaas, a linha pendente não serve: some (a contratação pode recomeçar)
      await d.db
        .delete(moduloAssinaturas)
        .where(
          and(eq(moduloAssinaturas.id, id), sql`${moduloAssinaturas.asaasAssinaturaId} is null`),
        );
      throw erro;
    }
    return { ok: true, dados: { urlFatura: await faturaEmAberto(d, { assinaturaId: id }) } };
  } catch (erro) {
    logar('erro', 'modulo.contratar', { modulo: ctx.codigo, codigo: codigoDoErro(erro) });
    return {
      ok: false,
      erro:
        erro instanceof ErroAsaas && erro.codigo === 'SEM_DADOS_COBRANCA'
          ? 'Informe os dados de cobrança (nome, CPF ou CNPJ e e-mail).'
          : ERRO_ASAAS,
    };
  }
}

async function contratarPorEvento(
  d: DepsCobranca,
  e: EntradaContratar,
  ctx: Ctx,
  hoje: string,
  nome: string,
): Promise<Resultado<{ urlFatura: string | null }>> {
  if (ctx.modulo.acessoEventoDias === null) {
    return { ok: false, erro: ERRO_INDISPONIVEL, codigo: 'MODULO_SEM_VENDA' };
  }
  if (!e.reservaId) return { ok: false, erro: 'Escolha a festa que será ativada.' };
  const [r] = await d.db
    .select({ id: reservas.id, tipo: reservas.tipo, status: reservas.status, data: reservas.data })
    .from(reservas)
    .where(and(eq(reservas.id, e.reservaId), eq(reservas.empresaId, e.empresaId)));
  if (!r || r.tipo !== 'confirmada' || r.status !== 'ativa' || r.data < hoje) {
    return { ok: false, erro: 'Escolha uma festa confirmada que ainda vai acontecer.' };
  }
  const [viva] = await d.db
    .select()
    .from(moduloCompras)
    .where(
      and(
        eq(moduloCompras.empresaId, e.empresaId),
        eq(moduloCompras.modulo, ctx.codigo),
        eq(moduloCompras.reservaId, r.id),
        inArray(moduloCompras.status, ['pendente', 'paga']),
      ),
    );
  try {
    if (viva?.status === 'paga') return { ok: false, erro: `${nome} já está ativo nesta festa.` };
    if (viva)
      return { ok: true, dados: { urlFatura: await faturaEmAberto(d, { compraId: viva.id }) } };

    let id: string;
    try {
      const [nova] = await d.db
        .insert(moduloCompras)
        .values({
          empresaId: e.empresaId,
          modulo: ctx.codigo,
          reservaId: r.id,
          valorCentavos: ctx.modulo.precoCentavos,
          criadaPor: e.usuarioId,
        })
        .returning({ id: moduloCompras.id });
      id = nova!.id;
    } catch (erro) {
      if (ehViolacaoUnica(erro)) return contratarPorEvento(d, e, ctx, hoje, nome);
      throw erro;
    }
    try {
      const cliente = await garantirCliente(d, e.empresaId, e.dados ?? null);
      const pagamento = await d.asaas.criarCobranca({
        cliente,
        valorCentavos: ctx.modulo.precoCentavos,
        vencimento: hoje,
        descricao: `Orkestra ${nome} (festa de ${r.data.split('-').reverse().join('/')})`,
        empresaId: e.empresaId,
        referencia: `modulo:${id}`,
      });
      await registrarCobrancaLida(d.db, 'sinc', pagamento);
      await auditar(d, e.empresaId, e.usuarioId, 'modulo.comprar_evento', id, {
        modulo: ctx.codigo,
        reserva_id: r.id,
        valor_centavos: ctx.modulo.precoCentavos,
      });
    } catch (erro) {
      const temCobranca = await d.db
        .select({ id: moduloCobrancas.id })
        .from(moduloCobrancas)
        .where(eq(moduloCobrancas.moduloCompraId, id));
      if (temCobranca.length === 0) {
        await d.db.delete(moduloCompras).where(eq(moduloCompras.id, id));
      }
      throw erro;
    }
    return { ok: true, dados: { urlFatura: await faturaEmAberto(d, { compraId: id }) } };
  } catch (erro) {
    logar('erro', 'modulo.comprar_evento', { modulo: ctx.codigo, codigo: codigoDoErro(erro) });
    return { ok: false, erro: ERRO_ASAAS };
  }
}

/**
 * Cancela a assinatura de um módulo mensal: apaga no Asaas (nada mais é cobrado) e marca
 * cancelada. O acesso segue até o fim do período pago; os dados do módulo ficam guardados.
 */
export async function cancelarModulo(
  d: DepsCobranca,
  e: { empresaId: string; usuarioId: string; codigo: string },
): Promise<Resultado> {
  if (!ehCodigoModulo(e.codigo)) return { ok: false, erro: 'Solução não encontrada.' };
  const [viva] = await d.db
    .select()
    .from(moduloAssinaturas)
    .where(
      and(
        eq(moduloAssinaturas.empresaId, e.empresaId),
        eq(moduloAssinaturas.modulo, e.codigo),
        ne(moduloAssinaturas.status, 'cancelada'),
      ),
    );
  if (!viva) return { ok: false, erro: 'Não há assinatura desta solução para cancelar.' };
  try {
    if (viva.asaasAssinaturaId) await d.asaas.cancelarAssinatura(viva.asaasAssinaturaId);
  } catch (erro) {
    // já apagada no Asaas: segue e marca aqui
    if (!(erro instanceof ErroAsaas && erro.status === 404)) {
      logar('erro', 'modulo.cancelar', { modulo: e.codigo, codigo: codigoDoErro(erro) });
      return { ok: false, erro: ERRO_ASAAS };
    }
  }
  await d.db
    .update(moduloAssinaturas)
    .set({ status: 'cancelada', canceladaEm: agoraDe(d), canceladaPor: e.usuarioId })
    .where(eq(moduloAssinaturas.id, viva.id));
  await auditar(d, e.empresaId, e.usuarioId, 'modulo.cancelar', viva.id, {
    modulo: e.codigo,
    pago_ate: viva.pagoAte,
  });
  return { ok: true };
}

/**
 * "Já paguei": lê as cobranças do módulo no Asaas e registra (mesmo caminho do webhook,
 * idempotente). Útil quando o webhook atrasa; nunca libera sem confirmação do provedor.
 */
export async function verificarPagamentoModulo(
  d: DepsCobranca,
  e: { empresaId: string; codigo: string },
): Promise<Resultado> {
  if (!ehCodigoModulo(e.codigo)) return { ok: false, erro: 'Solução não encontrada.' };
  try {
    const assinaturas = await d.db
      .select({ asaas: moduloAssinaturas.asaasAssinaturaId })
      .from(moduloAssinaturas)
      .where(
        and(
          eq(moduloAssinaturas.empresaId, e.empresaId),
          eq(moduloAssinaturas.modulo, e.codigo),
          ne(moduloAssinaturas.status, 'cancelada'),
        ),
      );
    for (const a of assinaturas) if (a.asaas) await sincronizarAssinatura(d, a.asaas);
    const pendentes = await d.db
      .select({ asaas: moduloCobrancas.asaasCobrancaId })
      .from(moduloCobrancas)
      .innerJoin(moduloCompras, eq(moduloCompras.id, moduloCobrancas.moduloCompraId))
      .where(
        and(
          eq(moduloCompras.empresaId, e.empresaId),
          eq(moduloCompras.modulo, e.codigo),
          inArray(moduloCobrancas.status, ['pendente', 'vencida']),
        ),
      );
    for (const p of pendentes) {
      await registrarCobrancaLida(d.db, 'sinc', await d.asaas.buscarCobranca(p.asaas));
    }
    return { ok: true };
  } catch (erro) {
    logar('erro', 'modulo.verificar', { modulo: e.codigo, codigo: codigoDoErro(erro) });
    return { ok: false, erro: ERRO_ASAAS };
  }
}
