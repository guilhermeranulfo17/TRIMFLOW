import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoForm } from '@/components/auth/aviso-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { precisaTrocarSenha } from '@/server/auth/redirecionamento';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { FormNovaSenha } from './form-nova-senha';

export const metadata: Metadata = { title: 'Nova senha' };

export default async function NovaSenhaPage() {
  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const primeiroAcesso = precisaTrocarSenha(user?.app_metadata);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">{primeiroAcesso ? 'Crie sua senha' : 'Criar nova senha'}</h1>
        </CardTitle>
        <CardDescription>
          {primeiroAcesso
            ? 'Primeiro acesso: troque a senha temporária por uma senha só sua, com pelo menos 8 caracteres.'
            : 'Escolha uma senha com pelo menos 8 caracteres.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {user ? (
          <FormNovaSenha />
        ) : (
          <>
            <AvisoForm tipo="erro">Esse link expirou ou já foi usado. Peça um novo.</AvisoForm>
            <p className="text-center text-sm">
              <Link href="/recuperar-senha" className="text-primary font-semibold hover:underline">
                Pedir novo link
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
