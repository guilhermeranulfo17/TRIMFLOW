import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CadastroMfa, FormCodigoMfa } from '@/components/interno/formularios';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { adminAtual } from '@/server/interno/guard';

export const metadata: Metadata = { title: 'Verificação' };

/** MFA obrigatório do /interno: cadastra o TOTP na primeira vez; depois, pede o código. */
export default async function MfaInterno() {
  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/interno/entrar');
  const admin = await adminAtual();
  if (!admin) notFound();
  if (admin.aal2) redirect('/interno');
  return (
    <div
      className="bg-card rounded-card mx-auto mt-10 max-w-sm border p-5"
      data-testid="mfa-interno"
    >
      <h1 className="mb-1 text-xl font-bold">
        {admin.temFator ? 'Código de verificação' : 'Cadastre o código de verificação'}
      </h1>
      <p className="text-muted-foreground mb-5 text-sm">
        O /interno exige um segundo fator a cada login.
      </p>
      {admin.temFator ? <FormCodigoMfa /> : <CadastroMfa />}
    </div>
  );
}
