'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Campo } from '@/components/app/form/campo';
import { useToast } from '@/components/app/toast';
import { Textarea } from '@/components/ui/textarea';
import {
  importarLeadsVendas,
  previsualizarImportacao,
  type LinhaPrevia,
  type PreviaImportacao,
} from '@/server/actions/vendas';
import { cn } from '@/lib/utils';

const BOTAO =
  'bg-primary text-primary-foreground rounded-control min-h-11 px-5 font-semibold disabled:opacity-60';

const SITUACAO: Record<LinhaPrevia['situacao'], { rotulo: string; classe: string }> = {
  nova: { rotulo: 'Nova', classe: 'bg-sucesso/10 text-sucesso border-sucesso/30' },
  invalida: { rotulo: 'Com erro', classe: 'bg-erro/10 text-erro border-erro/30' },
  repetida: { rotulo: 'Repetida no arquivo', classe: 'bg-alerta/10 text-alerta border-alerta/30' },
  ja_cadastrada: { rotulo: 'Já cadastrada', classe: 'bg-muted text-muted-foreground' },
};

/** Excel em português costuma salvar em Windows-1252: tenta UTF-8 e cai para ele. */
async function lerArquivo(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function ImportarCsv() {
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);

  const verPrevia = (conteudo: string) =>
    iniciar(async () => {
      const r = await previsualizarImportacao(conteudo);
      if (!r.ok) {
        setPrevia(null);
        toast.erro(r.erro);
        return;
      }
      setPrevia(r.dados ?? null);
    });

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-card rounded-card flex flex-col gap-4 border p-4">
        <p className="text-muted-foreground text-sm">
          A primeira linha precisa ter os nomes das colunas. Reconheço <b>nome</b> (obrigatória),
          buffet, telefone (ou whatsapp), cidade, origem e resumo (ou observação), em qualquer
          ordem, separadas por ponto e vírgula ou vírgula. Telefone repetido é ignorado.
        </p>
        <Campo id="arquivo" rotulo="Arquivo CSV">
          <input
            id="arquivo"
            type="file"
            accept=".csv,text/csv"
            className="file:rounded-control file:bg-card text-sm file:mr-3 file:min-h-11 file:border file:px-4 file:font-semibold"
            onChange={async (e) => {
              const arquivo = e.target.files?.[0];
              if (!arquivo) return;
              const conteudo = await lerArquivo(arquivo);
              setTexto(conteudo);
              verPrevia(conteudo);
            }}
          />
        </Campo>
        <Campo id="texto-csv" rotulo="Ou cole o conteúdo da planilha">
          <Textarea
            id="texto-csv"
            rows={5}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPrevia(null);
            }}
            placeholder={'nome;buffet;telefone;cidade\nAna;Buffet Sol;(34) 99135-5450;Uberaba'}
            className="font-mono text-sm"
          />
        </Campo>
        <div>
          <button
            type="button"
            className="rounded-control min-h-11 border px-4 font-semibold disabled:opacity-60"
            disabled={pendente || !texto.trim()}
            onClick={() => verPrevia(texto)}
          >
            {pendente && !previa ? 'Lendo…' : 'Ver prévia'}
          </button>
        </div>
      </section>

      {previa && (
        <section className="flex flex-col gap-3" data-testid="previa-importacao">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <b>{previa.novas}</b> {previa.novas === 1 ? 'lead novo' : 'leads novos'} de{' '}
              {previa.linhas.length} {previa.linhas.length === 1 ? 'linha' : 'linhas'}.
            </p>
            <button
              type="button"
              className={BOTAO}
              disabled={pendente || previa.novas === 0}
              data-testid="confirmar-importacao"
              onClick={() =>
                iniciar(async () => {
                  const r = await importarLeadsVendas(texto);
                  if (!r.ok) {
                    toast.erro(r.erro);
                    return;
                  }
                  toast.sucesso(r.mensagem);
                  router.push('/interno/vendas/leads');
                })
              }
            >
              {pendente ? 'Importando…' : `Importar ${previa.novas}`}
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {previa.linhas.map((l) => (
              <li
                key={l.linha}
                className="bg-card rounded-card flex flex-wrap items-center justify-between gap-2 border p-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="text-muted-foreground mr-2 tabular-nums">L{l.linha}</span>
                  <span className="font-semibold">{l.nome || '(sem nome)'}</span>
                  {l.buffet && <span className="text-muted-foreground"> · {l.buffet}</span>}
                  {(l.telefone || l.cidade) && (
                    <span className="text-muted-foreground block text-xs">
                      {[l.telefone, l.cidade].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {l.erro && <span className="text-erro block text-xs">{l.erro}</span>}
                </span>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-semibold',
                    SITUACAO[l.situacao].classe,
                  )}
                >
                  {SITUACAO[l.situacao].rotulo}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
