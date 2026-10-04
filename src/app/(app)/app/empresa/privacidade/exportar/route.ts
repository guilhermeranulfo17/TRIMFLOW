import { sql } from 'drizzle-orm';
import { after } from 'next/server';
import { usuarioAtual } from '@/server/auth/sessao';
import { processarAvisosSemFalhar } from '@/server/avisos/processar';
import { comUsuario } from '@/server/db/tenant';
import { arquivosDaEmpresa } from '@/server/lgpd/exportar';
import { montarZip } from '@/server/lgpd/zip';
import { logar } from '@/server/log';

// O ZIP é montado na hora (até alguns MB para milhares de leads).
export const maxDuration = 60;

/**
 * LGPD (Etapa 9B): todos os dados da empresa num ZIP (um CSV por tabela), lidos com o RLS do
 * dono: nada de outra empresa entra. Vale com a conta suspensa. Fica na auditoria.
 */
export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario) return new Response('Faça login de novo.', { status: 401 });
  if (usuario.perfil !== 'dono') {
    return new Response('Só o dono do buffet pode exportar os dados.', { status: 403 });
  }
  try {
    const arquivos = await comUsuario(usuario.id, async (tx) => {
      await tx.execute(sql`select public.lgpd_registrar_exportacao()`);
      return arquivosDaEmpresa(tx);
    });
    // aviso de segurança "seus dados foram exportados" (painel, push e e-mail)
    after(processarAvisosSemFalhar);
    const zip = montarZip(arquivos);
    const dia = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="orkestra-${usuario.empresa.slug}-${dia}.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (erro) {
    logar('erro', 'lgpd.exportar_empresa', {
      empresa_id: usuario.empresa.id,
      codigo: (erro as { code?: string }).code ?? 'sem-codigo',
    });
    return new Response('Não foi possível exportar agora. Tente de novo.', { status: 500 });
  }
}
