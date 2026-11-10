import 'server-only';
import { after } from 'next/server';
import type { EventoDemonstracao, MarcoConta } from '@/domain/prospeccao';
import { obterDb } from '@/server/db/client';
import { codigoDoErro, logar } from '@/server/log';
import { clienteCrmDoAmbiente } from './cliente';
import { avisarCadastro, avisarMarco, type DepsProspeccao } from './conta';
import { abriuDemonstracao, montouOrcamento } from './rastreio';

/*
 * Rastreio para o CRM de prospecção (ARQUITETURA §81): a porta de entrada das ações e rotas.
 *
 * Tudo roda em SEGUNDO PLANO, depois da resposta (after()), e nunca lança: se o CRM falhar ou
 * demorar, o cadastro e a página funcionam normalmente e o erro vai para o log (só o evento e o
 * código, nada pessoal). Sem CRM_PROSPECCAO_TOKEN, nada é chamado.
 */

function deps(): DepsProspeccao | null {
  const crm = clienteCrmDoAmbiente();
  return crm ? { db: obterDb(), crm } : null;
}

function emSegundoPlano(evento: string, fn: (d: DepsProspeccao) => Promise<unknown>): void {
  let d: DepsProspeccao | null;
  try {
    d = deps();
  } catch (erro) {
    logar('aviso', 'prospeccao.falhou', { evento, codigo: codigoDoErro(erro) });
    return;
  }
  if (!d) return;
  const dependencias = d;
  const rodar = async () => {
    try {
      await fn(dependencias);
    } catch (erro) {
      logar('aviso', 'prospeccao.falhou', { evento, codigo: codigoDoErro(erro) });
    }
  };
  try {
    after(rodar);
  } catch {
    // fora de uma requisição (script, teste): roda solto, sem segurar quem chamou
    void rodar();
  }
}

/** 1 e 2. Eventos da demonstração da landing (com o r do link). */
export function rastrearDemonstracao(evento: EventoDemonstracao, r: string): void {
  emSegundoPlano(evento, (d) =>
    evento === 'abriu_demo' ? abriuDemonstracao(d.crm, r) : montouOrcamento(d.crm, r),
  );
}

/** 3. "Criou conta": no cadastro (e no "completar" de quem entrou pelo Google). */
export function rastrearCadastro(usuarioId: string, r: string | null): void {
  emSegundoPlano('criou_conta', (d) => avisarCadastro(d, usuarioId, r));
}

/**
 * 4 e 5. "Cadastrou pacote" e "Publicou a página": só a primeira vez de cada empresa, e só
 * quando foi o próprio dono (a equipe do Orkestra em modo suporte e a conta de demonstração não
 * contam: o evento diz que o buffet avançou sozinho).
 */
export function rastrearMarco(
  dono: { empresa: { id: string; demo: boolean }; suporte: unknown },
  marco: MarcoConta,
): void {
  if (dono.suporte || dono.empresa.demo) return;
  const empresaId = dono.empresa.id;
  emSegundoPlano(marco, (d) => avisarMarco(d, empresaId, marco));
}
