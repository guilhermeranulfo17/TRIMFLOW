import { NextResponse } from 'next/server';
import { contarEventoLanding, type EventoLanding } from '@/server/marketing/carregar';

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
    console.error('[landing] falha ao contar', (e as { code?: string }).code ?? 'sem-codigo');
  }
  return new NextResponse(null, { status: 204 });
}
