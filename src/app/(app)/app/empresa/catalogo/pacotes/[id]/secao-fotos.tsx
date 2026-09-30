'use client';

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { UploadImagem } from '@/components/app/campos';
import { mover } from '@/components/app/campos/lista-ordenavel';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { MAX_FOTOS_PACOTE } from '@/domain/imagem';
import { urlPublicaMidia } from '@/lib/midia';
import { salvarFotosPacote } from '@/server/actions/empresa/pacotes';

/** Até 6 fotos; a primeira é a capa. Cada mudança é salva na hora. */
export function SecaoFotos({
  pacoteId,
  empresaId,
  fotos: iniciais,
  somenteLeitura,
}: {
  pacoteId: string;
  empresaId: string;
  fotos: string[];
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [fotos, setFotos] = useState(iniciais);
  const [salvando, iniciar] = useTransition();

  async function gravar(novas: string[]): Promise<boolean> {
    const anteriores = fotos;
    setFotos(novas);
    const r = await salvarFotosPacote(pacoteId, novas);
    if (r.ok) {
      toast.sucesso(r.mensagem);
      router.refresh();
      return true;
    }
    setFotos(anteriores);
    toast.erro(r.erro);
    return false;
  }

  return (
    <Secao
      id="fotos"
      titulo="Fotos"
      descricao={`Até ${MAX_FOTOS_PACOTE} fotos. A primeira é a capa do pacote.`}
      somenteLeitura={somenteLeitura}
    >
      {fotos.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhuma foto ainda. Pacotes com foto chamam mais atenção do cliente.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fotos.map((caminho, i) => (
          <li key={caminho} className="space-y-2" data-testid="foto-pacote">
            <div className="rounded-card bg-muted relative aspect-[4/3] overflow-hidden border">
              <Image
                src={urlPublicaMidia(caminho)!}
                alt={`Foto ${i + 1}`}
                fill
                sizes="(max-width: 640px) 50vw, 240px"
                className="object-cover"
              />
              {i === 0 && (
                <span className="bg-primary text-primary-foreground absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium">
                  Capa
                </span>
              )}
            </div>
            {!somenteLeitura && (
              <div className="flex justify-between gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={salvando || i === 0}
                  aria-label={`Mover foto ${i + 1} para a esquerda`}
                  onClick={() => iniciar(async () => void (await gravar(mover(fotos, i, i - 1))))}
                >
                  <ArrowUp className="-rotate-90" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={salvando || i === fotos.length - 1}
                  aria-label={`Mover foto ${i + 1} para a direita`}
                  onClick={() => iniciar(async () => void (await gravar(mover(fotos, i, i + 1))))}
                >
                  <ArrowDown className="-rotate-90" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={salvando}
                  aria-label={`Remover foto ${i + 1}`}
                  onClick={() =>
                    iniciar(async () => void (await gravar(fotos.filter((f) => f !== caminho))))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!somenteLeitura && fotos.length < MAX_FOTOS_PACOTE && (
        <UploadImagem
          empresaId={empresaId}
          tipo="pacotes"
          urlAtual={null}
          rotulo="Foto"
          proporcao="quadrada"
          onEnviado={(caminho) => gravar([...fotos, caminho])}
        />
      )}
    </Secao>
  );
}
