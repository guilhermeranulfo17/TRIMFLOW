'use client';

import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import type { FaixaCancelamento, OpcoesContrato } from '@/domain/contratos/opcoes';
import { analisarModelo } from '@/domain/contratos/variaveis';
import { ROTULO_SEGMENTO, type Segmento } from '@/domain/segmento';
import { ativarModeloContrato, salvarModeloContrato } from '@/server/actions/contratos';

/*
 * Editor do modelo de contrato (Etapa 10, PR 2): nome, texto com as variáveis {{…}} (conferido
 * na hora com o mesmo analisarModelo do servidor), multas de cancelamento, prazo para remarcar e
 * a cláusula de uso de imagem. Contrato já enviado nunca muda: vale só para os próximos.
 */

const CAMPO =
  'rounded-control border-input bg-background focus-visible:ring-ring/50 mt-1 block w-full border px-3 text-base font-normal focus-visible:ring-[3px] focus-visible:outline-none';

type Modelo = {
  id: string | null;
  titulo: string;
  segmento: Segmento;
  texto: string;
  origem: string | null;
  versao: number;
  ativo: boolean;
  opcoes: OpcoesContrato;
};

export function EditorModelo({
  modelo,
  variaveis,
  blocos,
}: {
  modelo: Modelo;
  variaveis: { nome: string; rotulo: string }[];
  blocos: { nome: string; rotulo: string }[];
}) {
  const toast = useToast();
  const router = useRouter();
  const texto = useRef<HTMLTextAreaElement>(null);
  const [titulo, setTitulo] = useState(modelo.titulo);
  const [corpo, setCorpo] = useState(modelo.texto);
  const [faixas, setFaixas] = useState<FaixaCancelamento[]>(modelo.opcoes.cancelamento);
  const [remarcacao, setRemarcacao] = useState(modelo.opcoes.remarcacaoDias);
  const [usoImagem, setUsoImagem] = useState(modelo.opcoes.usoImagem);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const analise = useMemo(() => analisarModelo(corpo), [corpo]);

  function inserir(marca: string) {
    const el = texto.current;
    if (!el) return;
    const ini = el.selectionStart ?? corpo.length;
    const fim = el.selectionEnd ?? ini;
    const novo = corpo.slice(0, ini) + marca + corpo.slice(fim);
    setCorpo(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await salvarModeloContrato({
        id: modelo.id,
        titulo,
        segmento: modelo.segmento,
        texto: corpo,
        origem: modelo.origem,
        ativo: modelo.ativo,
        opcoes: {
          cancelamento: [...faixas].sort((a, b) => b.diasAntes - a.diasAntes),
          remarcacaoDias: remarcacao,
          usoImagem,
        },
      });
      if (r.ok && r.dados) {
        toast.sucesso(r.mensagem);
        if (!modelo.id) router.replace(`/app/contratos/modelos/${r.dados.id}`);
        else router.refresh();
      } else if (!r.ok) {
        setErro(r.campos ? Object.values(r.campos)[0]! : r.erro);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="bg-card rounded-card flex min-w-0 flex-col gap-4 border p-4">
        <label className="text-sm font-semibold">
          Nome do modelo
          <input
            className={`${CAMPO} h-11`}
            value={titulo}
            maxLength={120}
            onChange={(e) => setTitulo(e.target.value)}
            data-testid="modelo-titulo"
          />
        </label>
        <p className="text-muted-foreground -mt-2 text-sm">
          {ROTULO_SEGMENTO[modelo.segmento]}
          {modelo.id && ` · versão ${modelo.versao}`}
        </p>
        <label className="text-sm font-semibold">
          Texto
          <textarea
            ref={texto}
            className={`${CAMPO} min-h-[28rem] py-2 font-mono text-sm leading-relaxed`}
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            spellCheck
            data-testid="modelo-texto"
            aria-invalid={!analise.ok || undefined}
            aria-describedby="ajuda-texto"
          />
        </label>
        <p id="ajuda-texto" className="text-muted-foreground -mt-2 text-sm">
          &ldquo;# &rdquo; no começo da linha é o título, &ldquo;## &rdquo; uma cláusula e &ldquo;-
          &rdquo; um item de lista. As partes entre {'{{ }}'} são preenchidas com os dados do
          orçamento.
        </p>
        {!analise.ok && (
          <ul className="text-erro text-sm font-semibold" role="alert" data-testid="erros-modelo">
            {analise.erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
        <section className="bg-card rounded-card flex flex-col gap-3 border p-4">
          <h2 className="font-bold">Multas de cancelamento</h2>
          <ul className="flex flex-col gap-2">
            {faixas.map((f, i) => (
              <li key={i} className="flex items-end gap-2">
                <label className="flex-1 text-xs font-semibold">
                  A partir de (dias antes)
                  <input
                    type="number"
                    min={0}
                    max={730}
                    inputMode="numeric"
                    className={`${CAMPO} h-11`}
                    value={f.diasAntes}
                    onChange={(e) =>
                      setFaixas((l) =>
                        l.map((x, j) =>
                          j === i
                            ? { ...x, diasAntes: Math.max(0, Number(e.target.value) || 0) }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <label className="w-20 text-xs font-semibold">
                  Multa (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="numeric"
                    className={`${CAMPO} h-11`}
                    value={Math.round(f.multaBp / 100)}
                    onChange={(e) =>
                      setFaixas((l) =>
                        l.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                multaBp:
                                  Math.min(100, Math.max(0, Number(e.target.value) || 0)) * 100,
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="hover:bg-accent grid size-11 shrink-0 place-items-center rounded-full"
                  aria-label={`Tirar a faixa ${i + 1}`}
                  disabled={faixas.length <= 1}
                  onClick={() => setFaixas((l) => l.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {faixas.length < 6 && (
            <button
              type="button"
              className="text-primary-texto inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
              onClick={() => setFaixas((l) => [...l, { diasAntes: 0, multaBp: 0 }])}
            >
              <Plus className="size-4" aria-hidden />
              Faixa
            </button>
          )}
          <label className="text-sm font-semibold">
            Prazo para remarcar (dias antes)
            <input
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              className={`${CAMPO} h-11`}
              value={remarcacao}
              onChange={(e) => setRemarcacao(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-primary mt-0.5 size-5"
              checked={usoImagem}
              onChange={(e) => setUsoImagem(e.target.checked)}
            />
            <span>
              <span className="font-semibold">Cláusula de uso de imagem</span>
              <span className="text-muted-foreground block">
                Liga o trecho entre {'{{#uso_imagem}}'} e {'{{/uso_imagem}}'}.
              </span>
            </span>
          </label>
        </section>

        <section className="bg-card rounded-card flex flex-col gap-2 border p-4">
          <h2 className="font-bold">Variáveis</h2>
          <p className="text-muted-foreground text-sm">Toque para inserir no texto.</p>
          <ul className="flex max-h-72 flex-col overflow-y-auto">
            {variaveis.map((v) => (
              <li key={v.nome}>
                <button
                  type="button"
                  className="hover:bg-accent flex min-h-11 w-full flex-col items-start rounded-md px-2 text-left text-sm"
                  onClick={() => inserir(`{{${v.nome}}}`)}
                >
                  <span className="font-semibold">{v.rotulo}</span>
                  <span className="text-muted-foreground font-mono text-xs">{`{{${v.nome}}}`}</span>
                </button>
              </li>
            ))}
            {blocos.map((b) => (
              <li key={b.nome}>
                <button
                  type="button"
                  className="hover:bg-accent flex min-h-11 w-full flex-col items-start rounded-md px-2 text-left text-sm"
                  onClick={() => inserir(`{{#${b.nome}}}\n\n{{/${b.nome}}}`)}
                >
                  <span className="font-semibold">{b.rotulo} (bloco)</span>
                  <span className="text-muted-foreground font-mono text-xs">{`{{#${b.nome}}} … {{/${b.nome}}}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {erro && (
          <p className="text-erro text-sm font-semibold" role="alert">
            {erro}
          </p>
        )}
        <Button
          type="button"
          onClick={salvar}
          disabled={pendente || !analise.ok}
          className="min-h-12 w-full"
          data-testid="salvar-modelo"
        >
          {pendente ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {modelo.id ? 'Salvar modelo' : 'Criar modelo'}
        </Button>
        <p className="text-muted-foreground text-xs">
          Contratos já enviados não mudam. O modelo vale para os próximos.
        </p>
      </aside>
    </div>
  );
}

/** Liga ou desliga um modelo na lista. */
export function AlternarModelo({ id, ativo }: { id: string; ativo: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        role="switch"
        className="accent-primary size-5"
        checked={ativo}
        disabled={pendente}
        onChange={(e) =>
          iniciar(async () => {
            const r = await ativarModeloContrato(id, e.target.checked);
            if (r.ok) {
              toast.sucesso(r.mensagem);
              router.refresh();
            } else toast.erro(r.erro);
          })
        }
        data-testid="alternar-modelo"
      />
      {ativo ? 'Ligado' : 'Desligado'}
    </label>
  );
}
