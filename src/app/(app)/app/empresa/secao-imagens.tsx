'use client';

import { useRouter } from 'next/navigation';
import { UploadImagem } from '@/components/app/campos';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { urlPublicaMidia } from '@/lib/supabase-browser';
import { salvarImagemEmpresa } from '@/server/actions/empresa/identidade';

export function SecaoImagens({
  empresaId,
  logoPath,
  capaPath,
  somenteLeitura,
}: {
  empresaId: string;
  logoPath: string | null;
  capaPath: string | null;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const router = useRouter();

  async function salvar(tipo: 'logo' | 'capa', caminho: string | null) {
    const r = await salvarImagemEmpresa({ tipo, caminho });
    if (r.ok) {
      toast.sucesso(r.mensagem);
      router.refresh();
    } else {
      toast.erro(r.erro);
    }
    return r.ok;
  }

  return (
    <Secao
      titulo="Logo e capa"
      descricao="As imagens aparecem na página do buffet e na proposta."
      somenteLeitura={somenteLeitura}
    >
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div>
          <p className="mb-2 text-sm font-medium">Logo</p>
          <UploadImagem
            empresaId={empresaId}
            tipo="logo"
            rotulo="Logo"
            urlAtual={urlPublicaMidia(logoPath)}
            disabled={somenteLeitura}
            onEnviado={(c) => salvar('logo', c)}
            onRemover={() => salvar('logo', null)}
          />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium">Capa</p>
          <UploadImagem
            empresaId={empresaId}
            tipo="capa"
            rotulo="Capa"
            proporcao="larga"
            urlAtual={urlPublicaMidia(capaPath)}
            disabled={somenteLeitura}
            onEnviado={(c) => salvar('capa', c)}
            onRemover={() => salvar('capa', null)}
          />
        </div>
      </div>
    </Secao>
  );
}
