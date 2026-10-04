import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormVerificacaoLogin } from '@/components/auth/mfa';
import { destinoSeguro } from '@/server/auth/redirecionamento';
import { corrigirMarcaMfa } from '@/server/auth/mfa';
import { criarClienteSupabase } from '@/server/auth/supabase-server';

export const metadata: Metadata = { title: 'Código de verificação' };

type Props = { searchParams: Promise<{ next?: string }> };

/** Segundo passo do login para quem ligou a verificação em duas etapas (Etapa 9B). */
export default async function VerificacaoPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  if (!fatores?.totp.some((f) => f.status === 'verified')) {
    // marca sem fator (desligado por fora): corrige para não prender a pessoa aqui
    if (user.app_metadata?.mfa === true) await corrigirMarcaMfa(user.id);
    redirect(destinoSeguro(next));
  }
  const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (nivel?.currentLevel === 'aal2') redirect(destinoSeguro(next));
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Código de verificação</h1>
        </CardTitle>
        <CardDescription>
          Abra o aplicativo autenticador do seu celular e digite o código do Orkestra.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormVerificacaoLogin next={next ?? null} />
        {/* <a>, não <Link>: o prefetch do Link chamaria a rota que encerra a sessão */}
        <a
          href="/auth/sair"
          className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
        >
          Entrar com outra conta
        </a>
      </CardContent>
    </Card>
  );
}
