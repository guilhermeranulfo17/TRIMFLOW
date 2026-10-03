'use client';

import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { ListaOrdenavel } from '@/components/app/campos';
import { converterParaWebp } from '@/components/app/campos/upload-imagem';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validarArquivoImagem } from '@/domain/imagem';
import { altPadrao, LIMITES_PAGINA as L } from '@/domain/publico/pagina';
import type { FotoGaleriaEntrada } from '@/domain/validacao/pagina';
import { urlPublicaMidia } from '@/lib/midia';
import { salvarGaleria } from '@/server/actions/empresa/pagina';
import { usePrevia } from './previa';

type Foto = FotoGaleriaEntrada & { alt: string };

/** Miniatura de ~16 px em data URL (o placeholder desfocado da vitrine). */
async function miniatura(arquivo: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = 16 / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const url = canvas.toDataURL('image/webp', 0.5);
    return url.startsWith('data:image/') && url.length <= 2000 ? url : null;
  } catch {
    return null;
  }
}

async function dimensoes(blob: Blob): Promise<{ largura: number; altura: number }> {
  const b = await createImageBitmap(blob);
  const r = { largura: b.width, altura: b.height };
  b.close();
  return r;
}

/**
 * Galeria do espaço (até 12 fotos). Cada foto sobe em duas larguras (640 e 1280, WEBP) para o
 * srcset. Enviar e remover gravam na hora; texto alternativo e ordem, no botão Salvar.
 */
export function SecaoGaleria({
  empresaId,
  nomeBuffet,
  inicial,
}: {
  empresaId: string;
  nomeBuffet: string;
  inicial: Foto[];
}) {
  const toast = useToast();
  const { atualizar } = usePrevia();
  const entrada = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<Foto[]>(inicial);
  const [salvo, setSalvo] = useState<Foto[]>(inicial);
  const [enviando, setEnviando] = useState(0);
  const [salvando, iniciar] = useTransition();
  const sujo = JSON.stringify(fotos) !== JSON.stringify(salvo);

  async function gravar(lista: Foto[], mensagem?: string) {
    const r = await salvarGaleria(lista);
    if (r.ok) {
      setFotos(lista);
      setSalvo(lista);
      toast.sucesso(mensagem ?? r.mensagem);
      atualizar();
    } else {
      toast.erro(r.erro);
    }
    return r.ok;
  }

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    const vagas = L.galeria - fotos.length;
    const lista = [...arquivos].slice(0, vagas);
    if (arquivos.length > vagas) toast.erro(`A galeria aceita até ${L.galeria} fotos.`);
    setEnviando(lista.length);
    const novas: Foto[] = [];
    const { criarClienteSupabaseNavegador } = await import('@/lib/supabase-browser');
    const storage = criarClienteSupabaseNavegador().storage.from('midia');
    for (const arquivo of lista) {
      const problema = validarArquivoImagem(arquivo.type, arquivo.size);
      if (problema) {
        toast.erro(problema);
        setEnviando((n) => n - 1);
        continue;
      }
      try {
        const [p640, p1280, blur] = await Promise.all([
          converterParaWebp(arquivo, 640),
          converterParaWebp(arquivo, 1280),
          miniatura(arquivo),
        ]);
        const id = crypto.randomUUID();
        const caminho640 = `${empresaId}/galeria/${id}-640.webp`;
        const caminho1280 = `${empresaId}/galeria/${id}-1280.webp`;
        const opcoes = { contentType: 'image/webp', cacheControl: '31536000', upsert: false };
        const [a, b] = await Promise.all([
          storage.upload(caminho640, p640, opcoes),
          storage.upload(caminho1280, p1280, opcoes),
        ]);
        if (a.error || b.error) throw new Error('upload');
        const { largura, altura } = await dimensoes(p1280);
        novas.push({ caminho640, caminho1280, largura, altura, blur, alt: '' });
      } catch {
        toast.erro('Não foi possível enviar uma das fotos. Tente de novo.');
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    if (entrada.current) entrada.current.value = '';
    // grava junto com o que já estava salvo (ordem e textos pendentes continuam pendentes)
    if (novas.length) {
      const r = await salvarGaleria([...salvo, ...novas]);
      if (r.ok) {
        setSalvo((s) => [...s, ...novas]);
        setFotos((f) => [...f, ...novas]);
        toast.sucesso(novas.length === 1 ? 'Foto enviada.' : `${novas.length} fotos enviadas.`);
        atualizar();
      } else {
        toast.erro(r.erro);
      }
    }
  }

  return (
    <Secao
      id="pagina-galeria"
      titulo={`Galeria do espaço (${fotos.length}/${L.galeria})`}
      descricao="Fotos do salão, da decoração e da comida. A primeira aparece maior no computador."
      onSubmit={(ev) => {
        ev.preventDefault();
        iniciar(async () => {
          await gravar(fotos);
        });
      }}
      salvando={salvando}
      sujo={sujo}
      textoBotao="Salvar galeria"
    >
      {fotos.length > 0 && (
        <ListaOrdenavel
          itens={fotos}
          chave={(f) => f.caminho1280}
          rotulo={(f) => f.alt || 'foto'}
          onReordenar={setFotos}
        >
          {(f, i) => (
            <div className="flex items-start gap-3" data-testid="foto-editor">
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de 640 px em WEBP */}
              <img
                src={urlPublicaMidia(f.caminho640) ?? ''}
                alt=""
                width={96}
                height={72}
                className="rounded-control h-18 w-24 shrink-0 object-cover"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor={`alt-${i}`} className="text-xs font-medium">
                  Descrição da foto (para leitores de tela)
                </label>
                <Input
                  id={`alt-${i}`}
                  value={f.alt}
                  maxLength={L.altFoto}
                  placeholder={altPadrao(nomeBuffet, i + 1)}
                  onChange={(ev) =>
                    setFotos(fotos.map((x, j) => (j === i ? { ...x, alt: ev.target.value } : x)))
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover foto ${i + 1}`}
                onClick={() =>
                  iniciar(async () => {
                    await gravar(
                      fotos.filter((x) => x.caminho1280 !== f.caminho1280),
                      'Foto removida.',
                    );
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          )}
        </ListaOrdenavel>
      )}
      {fotos.length < L.galeria && (
        <div>
          <input
            ref={entrada}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Escolher fotos da galeria"
            onChange={(ev) => enviar(ev.target.files)}
            data-testid="entrada-galeria"
          />
          <Button
            type="button"
            variant="outline"
            disabled={enviando > 0}
            onClick={() => entrada.current?.click()}
          >
            {enviando > 0 ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ImagePlus aria-hidden />
            )}
            {enviando > 0 ? `Enviando ${enviando}…` : 'Enviar fotos'}
          </Button>
          <p className="text-muted-foreground mt-2 text-xs">
            JPG, PNG ou WEBP até 5 MB cada. Convertemos para WEBP em dois tamanhos.
          </p>
        </div>
      )}
    </Secao>
  );
}
