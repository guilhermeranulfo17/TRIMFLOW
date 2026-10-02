import type { Metadata } from 'next';
import { ChecklistPainel } from '@/components/app/onboarding/checklist-painel';
import { eq } from 'drizzle-orm';
import { exigirSessao } from '@/server/auth/sessao';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { urlDoSite } from '@/server/env';
import { FormDadosProposta } from './form-dados-proposta';
import { FormIdentidade } from './form-identidade';
import { FormSlug } from './form-slug';
import { SecaoImagens } from './secao-imagens';

export const metadata: Metadata = { title: 'Minha empresa' };

export default async function IdentidadePage() {
  const usuario = await exigirSessao();
  const [empresa] = await comUsuario(usuario.id, (tx) =>
    tx.select().from(empresas).where(eq(empresas.id, usuario.empresa.id)),
  );
  if (!empresa) return null;
  const somenteLeitura = usuario.perfil !== 'dono';

  return (
    <div className="space-y-6">
      <ChecklistPainel usuario={usuario} aberto />
      <FormIdentidade
        somenteLeitura={somenteLeitura}
        inicial={{
          nome: empresa.nome,
          whatsappE164: empresa.whatsappE164 ?? '',
          email: empresa.email ?? '',
          cidade: empresa.cidade ?? '',
          uf: (empresa.uf ?? '') as '',
          fuso: empresa.fuso,
          corMarca: empresa.corMarca,
          sobre: empresa.sobre ?? '',
        }}
      />
      <FormDadosProposta
        somenteLeitura={somenteLeitura}
        inicial={{
          razaoSocial: empresa.razaoSocial ?? '',
          cnpj: empresa.cnpj ?? '',
          endereco: empresa.endereco ?? '',
        }}
      />
      <SecaoImagens
        somenteLeitura={somenteLeitura}
        empresaId={empresa.id}
        logoPath={empresa.logoPath}
        capaPath={empresa.capaPath}
      />
      <FormSlug
        somenteLeitura={somenteLeitura}
        slugAtual={empresa.slug}
        urlSite={urlDoSite() ?? ''}
      />
    </div>
  );
}
