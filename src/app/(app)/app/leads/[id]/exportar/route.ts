import { csvDoLead } from '@/domain/lgpd/csv';
import { usuarioAtual } from '@/server/auth/sessao';
import { comUsuario } from '@/server/db/tenant';
import { exportacaoDoLead } from '@/server/lgpd/exportar';
import { logar } from '@/server/log';

/**
 * LGPD (Etapa 9B): dados de um lead para o titular, em JSON ou CSV. Só o dono; a função SQL
 * confere a empresa e grava "lead.exportado" na auditoria. Vale com a conta suspensa.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await usuarioAtual();
  if (!usuario) return new Response('Faça login de novo.', { status: 401 });
  if (usuario.perfil !== 'dono') {
    return new Response('Só o dono do buffet pode exportar os dados.', { status: 403 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Lead não encontrado.', { status: 404 });

  const formato = new URL(request.url).searchParams.get('formato') === 'csv' ? 'csv' : 'json';
  let dados: Record<string, unknown>;
  try {
    dados = await comUsuario(usuario.id, (tx) => exportacaoDoLead(tx, id));
  } catch (erro) {
    const codigo = (erro as { cause?: { message?: string } }).cause?.message;
    if (codigo === 'LEAD_NAO_ENCONTRADO') {
      return new Response('Lead não encontrado.', { status: 404 });
    }
    logar('erro', 'lgpd.exportar_lead', { lead_id: id });
    return new Response('Não foi possível exportar agora.', { status: 500 });
  }
  const corpo = formato === 'csv' ? csvDoLead(dados) : JSON.stringify(dados, null, 2);
  return new Response(corpo, {
    headers: {
      'Content-Type':
        formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="lead-${id.slice(0, 8)}.${formato}"`,
      'Cache-Control': 'no-store',
    },
  });
}
