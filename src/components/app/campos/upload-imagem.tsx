'use client';

import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  dimensoesRedimensionadas,
  LADO_MAXIMO,
  QUALIDADE_WEBP,
  validarArquivoImagem,
  type TipoImagemUpload,
} from '@/domain/imagem';
import { cn } from '@/lib/utils';

/** Redimensiona no navegador (canvas) e exporta WEBP. */
async function converterParaWebp(arquivo: File, ladoMaximo: number): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const { largura, altura } = dimensoesRedimensionadas(bitmap.width, bitmap.height, ladoMaximo);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, 'image/webp', QUALIDADE_WEBP),
  );
  if (!blob || blob.type !== 'image/webp') throw new Error('webp');
  return blob;
}

/**
 * Envia uma imagem para o bucket "midia" em `{empresaId}/{tipo}/{uuid}.webp` e devolve o
 * caminho para a server action gravar (e apagar a anterior). As policies do bucket garantem
 * que só o dono grava na pasta da própria empresa.
 */
export function UploadImagem({
  empresaId,
  tipo,
  urlAtual,
  rotulo,
  onEnviado,
  onRemover,
  disabled,
  proporcao = 'quadrada',
}: {
  empresaId: string;
  tipo: TipoImagemUpload;
  urlAtual: string | null;
  rotulo: string;
  onEnviado: (caminho: string) => Promise<boolean>;
  onRemover?: () => Promise<boolean>;
  disabled?: boolean;
  proporcao?: 'quadrada' | 'larga';
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(undefined);
    const problema = validarArquivoImagem(arquivo.type, arquivo.size);
    if (problema) {
      setErro(problema);
      return;
    }
    setEnviando(true);
    try {
      const webp = await converterParaWebp(arquivo, LADO_MAXIMO[tipo]);
      const caminho = `${empresaId}/${tipo}/${crypto.randomUUID()}.webp`;
      // cliente do Supabase só na hora do envio (fora do bundle inicial das telas)
      const { criarClienteSupabaseNavegador } = await import('@/lib/supabase-browser');
      const { error } = await criarClienteSupabaseNavegador()
        .storage.from('midia')
        .upload(caminho, webp, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: false,
        });
      if (error) {
        setErro('Não foi possível enviar a imagem. Tente de novo.');
        return;
      }
      await onEnviado(caminho);
    } catch {
      setErro('Não foi possível ler essa imagem. Tente outra foto.');
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'rounded-card bg-muted relative overflow-hidden border',
          proporcao === 'larga' ? 'aspect-[3/1]' : 'aspect-square w-32',
        )}
      >
        {urlAtual ? (
          <Image
            src={urlAtual}
            alt={rotulo}
            fill
            sizes="(max-width: 768px) 100vw, 480px"
            className="object-cover"
          />
        ) : (
          <div className="text-muted-foreground grid h-full place-items-center">
            <ImagePlus className="size-6" aria-hidden />
          </div>
        )}
        {enviando && (
          <div className="bg-background/70 absolute inset-0 grid place-items-center">
            <Loader2 className="size-6 animate-spin" aria-label="Enviando" />
          </div>
        )}
      </div>
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={`Escolher ${rotulo}`}
            onChange={(e) => aoEscolher(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={() => entrada.current?.click()}
          >
            <ImagePlus aria-hidden /> {urlAtual ? 'Trocar' : 'Enviar'} {rotulo.toLowerCase()}
          </Button>
          {urlAtual && onRemover && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={enviando}
              onClick={async () => {
                setEnviando(true);
                await onRemover();
                setEnviando(false);
              }}
            >
              <Trash2 aria-hidden /> Remover
            </Button>
          )}
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        JPG, PNG ou WEBP até 5 MB. Convertemos para WEBP automaticamente.
      </p>
      {erro && (
        <p className="text-destructive text-xs" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
