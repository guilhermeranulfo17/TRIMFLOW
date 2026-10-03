import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { situacaoParaLogin } from '@/server/db/admin';
import { FormCompletar } from './form-completar';

export const metadata: Metadata = { title: 'Complete seu cadastro' };

/** Quem entrou pelo Google sem conta no Orkestra: só os dados do buffet faltam. */
export default async function CompletarPage() {
  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { temUsuario } = await situacaoParaLogin(user.id);
  if (temUsuario) redirect('/app/leads');

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const nome = String(meta.full_name ?? meta.name ?? '').slice(0, 120);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Falta pouco</h1>
        </CardTitle>
        <CardDescription>
          Você entrou como <strong className="text-foreground">{user.email}</strong>. Conte sobre o
          seu buffet para começar os 14 dias grátis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormCompletar nome={nome} />
      </CardContent>
    </Card>
  );
}
