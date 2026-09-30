import { eq } from 'drizzle-orm';
import { CreditCard, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatData } from '@/domain/dates';
import { diasRestantesTeste, rotuloPlano } from '@/domain/plano';
import { exigirSessao } from '@/server/auth/sessao';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';

export const metadata: Metadata = { title: 'Plano' };

export default async function PlanoPage() {
  const usuario = await exigirSessao();
  if (usuario.perfil !== 'dono') {
    return (
      <EmptyState icone={Lock} titulo="Acesso restrito">
        Só o dono do buffet vê o plano.
      </EmptyState>
    );
  }
  const [empresa] = await comUsuario(usuario.id, (tx) =>
    tx
      .select({ plano: empresas.plano, trialAte: empresas.trialAte })
      .from(empresas)
      .where(eq(empresas.id, usuario.empresa.id)),
  );
  if (!empresa) return null;
  const dias = diasRestantesTeste(empresa.trialAte);

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <CreditCard className="text-primary size-5" aria-hidden />
            {rotuloPlano(empresa.plano, dias)}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-3 text-sm">
        {empresa.plano === 'trial' && empresa.trialAte && (
          <p>
            Seu teste vai até{' '}
            <strong className="text-foreground">
              {formatData(empresa.trialAte, usuario.empresa.fuso)}
            </strong>
            . Durante o teste, tudo funciona sem limites.
          </p>
        )}
        {empresa.plano === 'ativo' && <p>Obrigado por assinar o Orkestra.</p>}
        {empresa.plano === 'suspenso' && (
          <p>Fale com a equipe do Orkestra para regularizar a assinatura.</p>
        )}
        <p>
          A assinatura pelo painel chega em breve. Para assinar agora ou tirar dúvidas, fale com a
          equipe do Orkestra.
        </p>
      </CardContent>
    </Card>
  );
}
