import { NextResponse } from 'next/server';
import { eventoDemonstracao, idDoLead } from '@/domain/prospeccao';
import { rastrearDemonstracao } from '@/server/prospeccao';
import { dentroDoLimite } from '@/server/seguranca/limite';

/*
 * Eventos da demonstração da landing para o CRM de prospecção (ARQUITETURA §81): "abriu a
 * demonstração" e "montou um orçamento", sempre com o r do link (?r=<id do lead no CRM>).
 *
 * O navegador manda só o nome do evento e o r; o token do CRM fica no servidor. A resposta sai na
 * hora (204) e a chamada ao CRM roda depois, em segundo plano: a página nunca espera o CRM. Sem
 * r válido, nada é enviado.
 */
export async function POST(req: Request) {
  let corpo: { evento?: unknown; r?: unknown };
  try {
    corpo = (await req.json()) as { evento?: unknown; r?: unknown };
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const evento = eventoDemonstracao(corpo?.evento);
  const r = idDoLead(corpo?.r);
  if (!evento || !r) return new NextResponse(null, { status: 400 });
  // limite por IP (só o hash): acima dele a resposta é a mesma e nada é enviado
  if (await dentroDoLimite('prospeccao')) rastrearDemonstracao(evento, r);
  return new NextResponse(null, { status: 204 });
}
