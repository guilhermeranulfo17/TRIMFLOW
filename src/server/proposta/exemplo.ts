import 'server-only';
import { eq } from 'drizzle-orm';
import { calcularOrcamento } from '@/domain/preco';
import {
  escolhasDeExemplo,
  montarConteudo,
  type BuffetProposta,
  type ModeloProposta,
  type VersaoProposta,
} from '@/domain/proposta';
import { entradaDoMotor } from '@/domain/publico/previa';
import { urlPublicaMidia } from '@/lib/midia';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { carregarBaseInterna } from '@/server/orcamentos/carregar';
import { prepararVersao } from './versao';

export const CLIENTE_EXEMPLO = 'Ana Souza';

/**
 * "Ver como fica minha proposta": a proposta montada em memória com o catálogo e as regras de
 * hoje, para uma festa de exemplo. Não grava lead nem orçamento. Mesmo modelo da web e do PDF.
 */
export async function montarPropostaExemplo(
  usuario: UsuarioAtual,
): Promise<{ modelo: ModeloProposta; buffet: BuffetProposta } | null> {
  const [base, empresa] = await Promise.all([
    carregarBaseInterna(usuario),
    comUsuario(usuario.id, async (tx) => {
      const [e] = await tx.select().from(empresas).where(eq(empresas.id, usuario.empresa.id));
      return e;
    }),
  ]);
  if (!base || !empresa) return null;
  const escolhas = escolhasDeExemplo(base.ctx, base.hoje);
  if (!escolhas) return null;
  const entrada = entradaDoMotor(base.ctx, escolhas, base.hoje);
  if (!entrada) return null;
  const resultado = calcularOrcamento(base.ctx, entrada);
  if (!resultado.ok) return null;
  const v = prepararVersao({
    ctx: base.ctx,
    escolhas,
    resultado,
    hoje: base.hoje,
    textos: base.textos,
    aberturaModelo: base.aberturaPorTipo[escolhas.tipoEventoId!] ?? null,
    clienteNome: CLIENTE_EXEMPLO,
    buffetNome: empresa.nome,
  });
  const turno = base.ctx.turnos.find((t) => t.id === escolhas.turnoId);
  const buffet: BuffetProposta = {
    nome: empresa.nome,
    logoUrl: urlPublicaMidia(empresa.logoPath),
    corMarca: empresa.corMarca,
    razaoSocial: empresa.razaoSocial,
    cnpj: empresa.cnpj,
    endereco: empresa.endereco,
    whatsappE164: empresa.whatsappE164,
    rodapeOrkestra: empresa.rodapeOrkestra,
  };
  const versao: VersaoProposta = {
    numero: 1,
    versao: 1,
    status: 'enviado',
    emitidaEm: new Date().toISOString(),
    validadeAte: v.validade,
    hoje: base.hoje,
    resultado,
    conteudo: v.conteudo,
    itens: v.itens,
    totalCentavos: resultado.totalCentavos,
    data: v.campos.data,
    convidados: v.campos.convidados,
    tipoEvento: base.ctx.tiposEvento.find((t) => t.id === escolhas.tipoEventoId)?.nome ?? null,
    turno: turno ? { nome: turno.nome, horaInicio: turno.horaInicio } : null,
    espaco: base.ctx.espacos.find((e) => e.id === v.campos.espacoId)?.nome ?? null,
    clienteNome: CLIENTE_EXEMPLO,
    observacoes: null,
  };
  return { modelo: montarConteudo(versao, buffet), buffet };
}
