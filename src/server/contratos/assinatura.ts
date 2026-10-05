import 'server-only';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  cpfLimpo,
  mascararCpf,
  mascararEmail,
  nomeCompletoValido,
  normalizarNome,
  numeroContrato,
} from '@/domain/contratos';
import { emailCodigoContrato } from '@/domain/email/contrato';
import { comAnon as comAnonPadrao } from '@/server/db/anon';
import { codigoDoErro, logar } from '@/server/log';
import type { ComAnon } from '@/server/publico/carregar';
import { carregarContratoPublico } from './carregar';
import { enviarEmailContrato, type ResultadoEmail } from './email';
import {
  ContratosSemChaveError,
  REGEX_TOKEN_CONTRATO,
  cifrarCpf,
  gerarCodigo,
  hashCodigo,
} from './segredos';

/*
 * Ações do cliente no link do contrato (Etapa 10), com as dependências injetadas para os testes:
 * pedir o código por e-mail, assinar e pedir ajuste. O navegador manda só o que a pessoa digitou
 * e o hash do texto que ela leu; quem decide tudo é o banco (publico.contrato_*).
 */

export type Resultado<T = undefined> = { ok: true; dados?: T } | { ok: false; erro: string };

export type DepsLink = {
  comAnon?: ComAnon;
  ipHash: string;
  userAgent?: string | null;
  /** usuário logado da própria empresa ("testar como cliente"): nada é gravado */
  modoTeste: boolean;
  enviarEmail?: (
    para: string,
    email: ReturnType<typeof emailCodigoContrato>,
    chave: string,
  ) => Promise<ResultadoEmail>;
};

export const MENSAGENS_LINK: Record<string, string> = {
  INDISPONIVEL: 'Este link não está mais disponível. Fale com o buffet para receber um novo.',
  JA_ASSINADO: 'Este contrato já foi assinado.',
  LIMITE: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  CONTRATO_MUDOU: 'O contrato foi atualizado. Recarregue a página para ler a versão nova.',
  DADOS_INVALIDOS: 'Confira o nome completo e o CPF.',
  CODIGO_PEDIR: 'Toque em "Enviar código para o meu e-mail" e digite o código que chegar.',
  CODIGO_EXPIRADO: 'O código venceu (vale 10 minutos). Peça um novo.',
  CODIGO_BLOQUEADO: 'Muitas tentativas com o código errado. Peça um código novo.',
  SEM_CODIGO: 'Este contrato não precisa de código.',
  MODO_TESTE:
    'Você está vendo como o cliente (modo teste). A assinatura fica desligada para quem é do buffet.',
  SEM_CHAVE: 'A assinatura está indisponível no momento. Tente de novo mais tarde.',
  EMAIL: 'Não conseguimos enviar o código agora. Tente de novo em instantes.',
  GENERICO: 'Não foi possível concluir agora. Tente de novo em instantes.',
};

const mensagem = (codigo: string | undefined) =>
  MENSAGENS_LINK[codigo ?? ''] ?? MENSAGENS_LINK.GENERICO!;

const linkValido = (token: string) => REGEX_TOKEN_CONTRATO.test(token);

/** Pede o código de 6 dígitos (vale 10 minutos; o anterior deixa de valer). */
export async function pedirCodigo(
  slug: string,
  token: string,
  d: DepsLink,
): Promise<Resultado<{ email: string }>> {
  if (!linkValido(token)) return { ok: false, erro: mensagem('INDISPONIVEL') };
  if (d.modoTeste) return { ok: false, erro: mensagem('MODO_TESTE') };
  const comAnon = d.comAnon ?? comAnonPadrao;
  const c = await carregarContratoPublico(slug, token, comAnon);
  if (c.estado !== 'aberto') return { ok: false, erro: mensagem('INDISPONIVEL') };
  if (!c.exigeCodigo) return { ok: false, erro: mensagem('SEM_CODIGO') };

  const codigo = gerarCodigo();
  const [linha] = await comAnon((tx) =>
    tx.execute<{ r: Record<string, unknown> }>(
      sql`select publico.contrato_pedir_codigo(${slug}, ${token}, ${hashCodigo(codigo, c.hash)}, ${d.ipHash}) as r`,
    ),
  );
  const r = linha?.r ?? {};
  if (r.ok !== true) return { ok: false, erro: mensagem(String(r.codigo)) };

  const email = emailCodigoContrato({
    buffet: String(r.buffet),
    codigo,
    contrato: numeroContrato(Number(r.ano), Number(r.numero)),
  });
  const para = String(r.email);
  const envio = await (
    d.enviarEmail ?? ((p, e, k) => enviarEmailContrato(p, e, k, { tag: 'contrato_codigo' }))
  )(para, email, String(r.codigo_id));
  if (!envio.ok) {
    logar('aviso', 'contrato.codigo_nao_enviado', {
      contratoId: String(r.contrato_id),
      codigo: envio.erro,
    });
    return { ok: false, erro: mensagem('EMAIL') };
  }
  logar('info', 'contrato.codigo_enviado', { contratoId: String(r.contrato_id) });
  return { ok: true, dados: { email: mascararEmail(para) } };
}

export const assinaturaSchema = z.object({
  nome: z.string().max(200),
  cpf: z.string().max(30),
  aceite: z.literal(true, { error: 'Marque que leu e concorda com o contrato.' }),
  codigo: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'O código tem 6 números.')
    .optional()
    .or(z.literal('')),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type EntradaAssinatura = z.input<typeof assinaturaSchema>;

export type ResultadoAssinatura =
  { ok: true } | { ok: false; erro: string; campos?: Record<string, string> };

/** Assinatura do cliente: nome completo, CPF válido, "li e concordo" e o código (se pedido). */
export async function assinar(
  slug: string,
  token: string,
  entrada: unknown,
  d: DepsLink,
): Promise<ResultadoAssinatura> {
  if (!linkValido(token)) return { ok: false, erro: mensagem('INDISPONIVEL') };
  const v = assinaturaSchema.safeParse(entrada);
  const campos: Record<string, string> = {};
  const bruto = (entrada ?? {}) as Record<string, unknown>;
  const nome = normalizarNome(String(bruto.nome ?? ''));
  const cpf = cpfLimpo(String(bruto.cpf ?? ''));
  if (!nomeCompletoValido(nome)) campos.nome = 'Escreva o nome completo (nome e sobrenome).';
  if (!cpf) campos.cpf = 'CPF inválido. Confira os números.';
  if (!v.success) {
    for (const i of v.error.issues) {
      const k = String(i.path[0] ?? '_');
      if (k === 'aceite' || k === 'codigo') campos[k] ??= i.message;
      else if (k === 'hash') return { ok: false, erro: mensagem('CONTRATO_MUDOU') };
    }
  }
  if (Object.keys(campos).length || !v.success || !cpf) {
    return { ok: false, erro: 'Confira os campos destacados.', campos };
  }
  if (d.modoTeste) return { ok: false, erro: mensagem('MODO_TESTE') };

  let cifrado: string;
  try {
    cifrado = cifrarCpf(cpf, v.data.hash);
  } catch (erro) {
    if (erro instanceof ContratosSemChaveError) {
      logar('erro', 'contrato.sem_chave');
      return { ok: false, erro: mensagem('SEM_CHAVE') };
    }
    throw erro;
  }
  const p = {
    nome,
    documento_cifrado: cifrado,
    documento_mascarado: mascararCpf(cpf),
    hash: v.data.hash,
    codigo_hash: v.data.codigo ? hashCodigo(v.data.codigo, v.data.hash) : null,
    ip_hash: d.ipHash,
    user_agent: d.userAgent?.slice(0, 400) ?? null,
    eh_usuario_empresa: false,
  };
  try {
    const [linha] = await (d.comAnon ?? comAnonPadrao)((tx) =>
      tx.execute<{ r: { ok: boolean; codigo?: string; restantes?: number } }>(
        sql`select publico.contrato_assinar(${slug}, ${token}, ${JSON.stringify(p)}::jsonb) as r`,
      ),
    );
    const r = linha!.r;
    if (r.ok) return { ok: true };
    if (r.codigo === 'CODIGO_INVALIDO') {
      const n = r.restantes ?? 0;
      return {
        ok: false,
        erro: `Código incorreto. Você ainda tem ${n} ${n === 1 ? 'tentativa' : 'tentativas'}.`,
        campos: { codigo: 'Código incorreto.' },
      };
    }
    return { ok: false, erro: mensagem(r.codigo) };
  } catch (erro) {
    logar('erro', 'contrato.assinar_falhou', { codigo: codigoDoErro(erro) });
    return { ok: false, erro: mensagem('GENERICO') };
  }
}

/** "Não concordo / Pedir ajuste": motivo opcional; o buffet é avisado e nada é apagado. */
export async function recusar(
  slug: string,
  token: string,
  motivo: string,
  d: DepsLink,
): Promise<Resultado> {
  if (!linkValido(token)) return { ok: false, erro: mensagem('INDISPONIVEL') };
  if (d.modoTeste) return { ok: false, erro: mensagem('MODO_TESTE') };
  const [linha] = await (d.comAnon ?? comAnonPadrao)((tx) =>
    tx.execute<{ r: { ok: boolean; codigo?: string } }>(
      sql`select publico.contrato_recusar(${slug}, ${token}, ${motivo.slice(0, 500)}, ${d.ipHash}, false) as r`,
    ),
  );
  const r = linha!.r;
  return r.ok ? { ok: true } : { ok: false, erro: mensagem(r.codigo) };
}
