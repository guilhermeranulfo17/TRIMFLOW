'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UploadImagem } from '@/components/app/campos/upload-imagem';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UFS } from '@/domain/uf';
import type { IdentidadeEntrada } from '@/domain/validacao/empresa';
import { urlPublicaMidia } from '@/lib/midia';
import { salvarIdentidade, salvarImagemEmpresa } from '@/server/actions/empresa/identidade';
import { RodapePasso } from './navegacao';

/** Passo 2 (pode pular): cidade e UF, logo, cor da marca e uma frase "sobre". */
export function PassoIdentidade({
  empresaId,
  inicial,
  logoPath,
}: {
  empresaId: string;
  inicial: IdentidadeEntrada;
  logoPath: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [dados, setDados] = useState(inicial);
  const mudar = <K extends keyof IdentidadeEntrada>(k: K, v: IdentidadeEntrada[K]) =>
    setDados((d) => ({ ...d, [k]: v }));
  const alterado = JSON.stringify(dados) !== JSON.stringify(inicial);

  async function salvar(): Promise<boolean> {
    if (!alterado) return true;
    const r = await salvarIdentidade(dados);
    if (!r.ok) toast.erro(r.erro);
    return r.ok;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground">
        É assim que o cliente vê o seu buffet no link. Se preferir, pule e faça depois.
      </p>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Logo</span>
        <UploadImagem
          empresaId={empresaId}
          tipo="logo"
          rotulo="Logo"
          urlAtual={urlPublicaMidia(logoPath)}
          onEnviado={async (caminho) => {
            const r = await salvarImagemEmpresa({ tipo: 'logo', caminho });
            if (r.ok) router.refresh();
            else toast.erro(r.erro);
            return r.ok;
          }}
        />
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Cidade
          <Input
            value={dados.cidade ?? ''}
            onChange={(e) => mudar('cidade', e.target.value)}
            placeholder="Ex.: Uberlândia"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          UF
          <select
            className={classeCampo}
            value={dados.uf ?? ''}
            onChange={(e) => mudar('uf', e.target.value as IdentidadeEntrada['uf'])}
          >
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="color"
          value={dados.corMarca}
          onChange={(e) => mudar('corMarca', e.target.value.toUpperCase())}
          className="size-11 cursor-pointer rounded-md border bg-transparent"
          aria-label="Cor da marca"
        />
        Cor da marca <span className="text-muted-foreground font-normal">({dados.corMarca})</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Uma frase sobre o buffet
        <Textarea
          value={dados.sobre ?? ''}
          maxLength={600}
          rows={3}
          onChange={(e) => mudar('sobre', e.target.value)}
          placeholder="Ex.: Festas infantis com brinquedão, monitores e cardápio feito na hora."
        />
      </label>
      <RodapePasso
        passo={2}
        rotulo={alterado ? 'Salvar e continuar' : 'Pular por agora'}
        antes={salvar}
      />
    </div>
  );
}
