import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { decidirVoltaExterna, depsDoSupabase } from '@/server/auth/volta-externa';

/**
 * Volta do login pelo Google: troca o code pela sessão e manda para o painel, para completar o
 * cadastro ou de volta ao login (vendedor desativado, erro). Regra em domain/auth/destino.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const supabase = await criarClienteSupabase();
  const url = await decidirVoltaExterna(
    depsDoSupabase(supabase),
    searchParams.get('code'),
    searchParams.get('next'),
  );
  return NextResponse.redirect(new URL(url, request.url));
}
