import { NextResponse } from 'next/server';
import { contarEventoLanding, type EventoLanding } from '@/server/marketing/carregar';
import { codigoDoErro, logar } from '@/server/log';

/*
 * Contagem agregada da landing (Etapa 9.6): só o evento ('visita' | 'clicou_teste') e o dia.
 * Não guarda IP, user agent nem cookie, e não loga nada pessoal.
 */

const EVENTOS: readonly EventoLanding[] = ['visita', 'clicou_teste'];

export async function POST(req: Request) {
  let evento: unknown;
  try {
    const corpo = (await req.json()) as { evento?: unknown };
    evento = corpo?.evento;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (typeof evento !== 'string' || !EVENTOS.includes(evento as EventoLanding)) {
    return new NextResponse(null, { status: 400 });
  }
  try {
    await contarEventoLanding(evento as EventoLanding);
  } catch (e) {
    logar('erro', 'landing.contar', { codigo: codigoDoErro(e) });
  }
  return new NextResponse(null, { status: 204 });
}
