import 'server-only';
import { headers } from 'next/headers';
import { linhaDeLog, type DadosLog, type NivelLog } from '@/domain/observabilidade/log';

/** Cabeçalho com o id da requisição (gerado pelo middleware; na Vercel cai no x-vercel-id). */
export const CABECALHO_REQUISICAO = 'x-request-id';

async function idDaRequisicao(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get(CABECALHO_REQUISICAO) ?? h.get('x-vercel-id');
  } catch {
    return null; // fora de uma requisição (testes, scripts)
  }
}

/**
 * Log estruturado (JSON numa linha) com o id da requisição. Só ids, códigos e números: a linha
 * descarta chaves pessoais e mascara e-mails e telefones (domain/observabilidade/log).
 */
export function logar(nivel: NivelLog, evento: string, dados: DadosLog = {}): void {
  void idDaRequisicao().then((req) => {
    const linha = linhaDeLog(nivel, evento, dados, req);
    if (nivel === 'erro') console.error(linha);
    else if (nivel === 'aviso') console.warn(linha);
    else console.info(linha);
  });
}
