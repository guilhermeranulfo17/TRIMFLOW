import 'server-only';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  NOMES_VARIAVEIS,
  VARIAVEIS,
  blocosDoContrato,
  normalizarTexto,
  numeroContrato,
  preencherModelo,
  resumoDoContrato,
  valoresDoContrato,
  type NomeVariavel,
  type Preenchido,
  type ValoresContrato,
} from '@/domain/contratos';
import type { UsuarioAtual } from '@/server/auth/sessao';
import type { Tx } from '@/server/db/tenant';
import {
  carregarOrigemDoOrcamento,
  modeloParaContrato,
  type ModeloEscolhido,
  type OrigemContrato,
} from './carregar';
import { gerarTokenContrato } from './segredos';

/*
 * Do orçamento ao contrato enviado (Etapa 10). A prévia e o envio usam a MESMA montagem: o
 * servidor lê o orçamento, o lead e o buffet, preenche o modelo e só aceita do navegador os
 * valores que estavam faltando (o dono completa na prévia), a validade e o "exigir código".
 */

export const preparoSchema = z.object({
  orcamentoId: z.uuid(),
  modeloId: z.uuid().nullish(),
  /** só para variáveis que faltavam; o resto vem do orçamento */
  preencher: z.record(z.string(), z.string().max(2000)).default({}),
  usoImagem: z.boolean().nullish(),
});

export const emissaoSchema = preparoSchema.extend({
  exigeCodigo: z.boolean().default(false),
  validadeDias: z.number().int().min(1).max(60).default(14),
  substituiContratoId: z.uuid().nullish(),
});

export type EntradaPreparo = z.input<typeof preparoSchema>;
export type EntradaEmissao = z.input<typeof emissaoSchema>;

export type Preparo = {
  origem: OrigemContrato;
  modelo: ModeloEscolhido;
  valores: ValoresContrato;
  preenchido: Preenchido;
  /** variáveis que o orçamento não trouxe (o dono pode completar) */
  completaveis: { nome: NomeVariavel; rotulo: string; ajuda?: string; valor: string }[];
};

export async function prepararContrato(
  usuario: UsuarioAtual,
  entrada: z.output<typeof preparoSchema>,
  tx: Tx,
): Promise<Preparo | null> {
  const origem = await carregarOrigemDoOrcamento(usuario, entrada.orcamentoId, tx);
  if (!origem) return null;
  const modelo = await modeloParaContrato(
    tx,
    usuario.empresa.id,
    origem.segmento,
    entrada.modeloId,
  );
  const opcoes = {
    ...modelo.opcoes,
    usoImagem: entrada.usoImagem ?? modelo.opcoes.usoImagem,
  };
  const doOrcamento = valoresDoContrato({ ...origem.fonte, opcoes });
  const ausentes = NOMES_VARIAVEIS.filter((n) => !doOrcamento[n]);
  const valores: ValoresContrato = { ...doOrcamento };
  for (const n of ausentes) {
    const v = entrada.preencher[n]?.trim();
    if (v) valores[n] = v;
  }
  const preenchido = preencherModelo(modelo.texto, valores, blocosDoContrato(opcoes));
  const usados = new Set(
    [...modelo.texto.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1] as NomeVariavel),
  );
  const completaveis = ausentes
    .filter((n) => usados.has(n))
    .map((n) => {
      const def = VARIAVEIS[n] as { rotulo: string; ajuda?: string };
      return { nome: n, rotulo: def.rotulo, ajuda: def.ajuda, valor: valores[n] ?? '' };
    });
  return { origem, modelo: { ...modelo, opcoes }, valores, preenchido, completaveis };
}

export type ResultadoEmissao =
  | {
      ok: true;
      id: string;
      codigo: string;
      token: string;
      expiraEm: string;
      clienteNome: string;
      clienteWhatsapp: string | null;
    }
  | { ok: false; faltando: string[] }
  | { ok: false; naoEncontrado: true };

/**
 * Envia (o dono assina ao enviar): texto normalizado, hash calculado no banco, token só aqui
 * (o banco guarda o hash). Erros do banco (limite, demo, conta suspensa) sobem para a action.
 */
export async function emitirContrato(
  usuario: UsuarioAtual,
  entrada: z.output<typeof emissaoSchema>,
  tx: Tx,
  o: { ipHash: string | null; userAgent: string | null },
): Promise<ResultadoEmissao> {
  const prep = await prepararContrato(usuario, entrada, tx);
  if (!prep) return { ok: false, naoEncontrado: true };
  if (prep.preenchido.faltando.length) {
    return {
      ok: false,
      faltando: prep.preenchido.faltando.map((n) => (VARIAVEIS[n] as { rotulo: string }).rotulo),
    };
  }
  const { origem, modelo } = prep;
  const texto = normalizarTexto(prep.preenchido.texto);
  const { token, hash } = gerarTokenContrato();
  const p = {
    lead_id: origem.leadId,
    orcamento_id: origem.orcamentoId,
    reserva_id: origem.reservaId,
    modelo_id: modelo.id,
    modelo_origem: modelo.origem,
    titulo: tituloDoContrato(texto, modelo.titulo),
    texto,
    valores: resumoDoContrato(origem.fonte),
    variaveis: prep.valores,
    exige_codigo: entrada.exigeCodigo && Boolean(origem.clienteEmail),
    email_cliente: origem.clienteEmail,
    validade_dias: entrada.validadeDias,
    token_hash: hash,
    substitui_contrato_id: entrada.substituiContratoId ?? null,
    ip_hash: o.ipHash,
    user_agent: o.userAgent?.slice(0, 400) ?? null,
  };
  const [linha] = await tx.execute<{
    r: { id: string; ano: number; numero: number; expira_em: string };
  }>(sql`select public.emitir_contrato(${JSON.stringify(p)}::jsonb) as r`);
  const r = linha!.r;
  return {
    ok: true,
    id: r.id,
    codigo: numeroContrato(r.ano, r.numero),
    token,
    expiraEm: r.expira_em,
    clienteNome: origem.clienteNome,
    clienteWhatsapp: origem.fonte.cliente.whatsappE164,
  };
}

/** Título do contrato: a primeira linha "# …" do texto, senão o título do modelo. */
export function tituloDoContrato(texto: string, padrao: string): string {
  const m = /^# (.+)$/m.exec(texto);
  return (m?.[1] ?? padrao).trim().slice(0, 160);
}
