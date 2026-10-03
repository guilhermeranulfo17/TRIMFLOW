import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormRecuperarSenha } from './form-recuperar-senha';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default async function RecuperarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Esqueceu a senha?</h1>
        </CardTitle>
        <CardDescription>
          Informe seu e-mail e enviaremos um link para criar uma nova.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <FormRecuperarSenha
          avisoInicial={
            erro === 'link-invalido'
              ? 'Esse link expirou ou já foi usado. Peça um novo.'
              : undefined
          }
        />
        <p className="text-muted-foreground text-center text-sm">
          <Link href="/login" className="text-primary-texto font-semibold hover:underline">
            Voltar para o login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
