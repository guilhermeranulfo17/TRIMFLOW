'use client';

import { ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { formatData } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import {
  motivoDoBotaoDesabilitado,
  passoAnterior,
  passoPermitido,
  passoValido,
  PASSOS,
  pessoas,
  primeiroPasso,
  proximoPasso,
  type DadosPassos,
  type NumeroPasso,
} from '@/domain/publico/passos';
import type { Previa } from '@/domain/publico/previa';
import type { Escolhas, OrigemLead } from '@/domain/publico/tipos';
import type { VitrinePublica } from '@/domain/publico/vitrine';
import { calcularPrevia, concluirOrcamento, registrarFunil } from '@/server/actions/publico';
import { sessaoDoFunil } from '@/components/publico/registro-funil';
import { BOTAO_PRINCIPAL } from '@/components/publico/marca';
import { RodapePublico } from '@/components/publico/rodape';
import type { Contato, PropsPasso } from './tipos';

function Carregando() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-muted rounded-card h-16 animate-pulse motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

// Um componente por passo, carregado sob demanda (o celular baixa só o passo da vez).
const PassoFesta = dynamic(() => import('./passo-festa'), { loading: Carregando });
const PassoQuando = dynamic(() => import('./passo-quando'), { loading: Carregando });
const PassoContato = dynamic(() => import('./passo-contato'), { loading: Carregando });
const PassoPacote = dynamic(() => import('./passo-pacote'), { loading: Carregando });
const PassoExtras = dynamic(() => import('./passo-extras'), { loading: Carregando });

const CHAVE = (slug: string) => `orkestra:orcamento:${slug}`;
const VALIDADE_LOCAL_MS = 7 * 24 * 60 * 60 * 1000;
const VAZIAS: Escolhas = { criancas: [], opcionais: [], horasExtras: 0 };

type Props = {
  slug: string;
  buffet: { nome: string; whatsappE164: string | null; logoUrl: string | null };
  vitrine: VitrinePublica;
  origem: OrigemLead;
  tipoNaUrl?: string;
  /** "Orçar este pacote" na vitrine: já vem escolhido (o cliente ainda pode trocar) */
  pacoteNaUrl?: string;
  inicio: string;
  retomada: { escolhas: Escolhas; passo: NumeroPasso } | null;
};

/** Progresso sem dado pessoal: só as escolhas (nunca nome ou WhatsApp). */
function lerLocal(slug: string): Escolhas | null {
  try {
    const bruto = localStorage.getItem(CHAVE(slug));
    if (!bruto) return null;
    const { escolhas, salvoEm } = JSON.parse(bruto) as { escolhas: Escolhas; salvoEm: number };
    if (Date.now() - salvoEm > VALIDADE_LOCAL_MS) return null;
    return { ...VAZIAS, ...escolhas };
  } catch {
    return null;
  }
}

/** Tipo e pacote vindos da vitrine valem sobre o progresso salvo. */
function daUrl(base: Escolhas, tipo?: string, pacote?: string): Escolhas {
  return {
    ...base,
    ...(tipo ? { tipoEventoId: tipo } : {}),
    ...(pacote ? { pacoteId: pacote } : {}),
  };
}

function salvarLocal(slug: string, escolhas: Escolhas) {
  try {
    localStorage.setItem(CHAVE(slug), JSON.stringify({ escolhas, salvoEm: Date.now() }));
  } catch {
    // modo privado: segue sem salvar
  }
}

export function Wizard({
  slug,
  buffet,
  vitrine,
  origem,
  tipoNaUrl,
  pacoteNaUrl,
  inicio,
  retomada,
}: Props) {
  const router = useRouter();
  const busca = useSearchParams();
  const [escolhas, setEscolhas] = useState<Escolhas>(() => {
    if (retomada) return retomada.escolhas;
    return daUrl(VAZIAS, tipoNaUrl, pacoteNaUrl);
  });
  const [comContato, setComContato] = useState(retomada !== null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [contato, setContato] = useState<Contato>({
    nome: '',
    whatsapp: '',
    aceite: false,
    site: '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [concluindo, iniciarConclusao] = useTransition();
  const requisicao = useRef(0);
  const titulo = useRef<HTMLHeadingElement>(null);

  // Retoma o progresso salvo neste aparelho (antes do WhatsApp).
  useEffect(() => {
    if (retomada) return;
    const local = lerLocal(slug);
    if (local) setEscolhas(daUrl(local, tipoNaUrl, pacoteNaUrl));
  }, [slug, retomada, tipoNaUrl, pacoteNaUrl]);

  useEffect(() => salvarLocal(slug, escolhas), [slug, escolhas]);

  const alterar = useCallback((parcial: Partial<Escolhas>) => {
    setErro(null);
    setEscolhas((atual) => ({ ...atual, ...parcial }));
  }, []);

  const dados: DadosPassos = useMemo(
    () => ({
      tiposEvento: vitrine.tiposEvento,
      turnos: vitrine.turnos,
      espacos: vitrine.espacos,
      pacotes:
        previa?.pacotes && previa.pacotes.length > 0
          ? previa.pacotes
          : escolhas.pacoteId
            ? [{ id: escolhas.pacoteId, disponivel: true }]
            : undefined,
    }),
    [vitrine, previa, escolhas.pacoteId],
  );

  const pedido = passoValido(busca.get('passo')) ?? retomada?.passo ?? primeiroPasso(!!tipoNaUrl);
  const passo = passoPermitido(pedido, escolhas, dados, {
    temToken: comContato,
    tipoNaUrl: !!tipoNaUrl,
  });

  // Prévia de preço (servidor) a cada mudança; depois do WhatsApp também salva o rascunho.
  useEffect(() => {
    if (!escolhas.tipoEventoId) {
      setPrevia(null);
      return;
    }
    const id = ++requisicao.current;
    setCarregando(true);
    const timer = setTimeout(async () => {
      const r = await calcularPrevia(slug, escolhas, passo);
      if (id !== requisicao.current) return;
      setCarregando(false);
      if (r.ok) setPrevia(r.dados);
    }, 250);
    return () => clearTimeout(timer);
  }, [slug, escolhas, passo, comContato]);

  // Funil: passo visto (sem dado pessoal).
  useEffect(() => {
    void registrarFunil(slug, { sessao: sessaoDoFunil(), passo, evento: 'passo_visto', origem });
    titulo.current?.focus();
  }, [slug, passo, origem]);

  const irPara = useCallback(
    (n: NumeroPasso) => {
      const p = new URLSearchParams(busca.toString());
      p.set('passo', String(n));
      router.push(`?${p}`, { scroll: false });
      window.scrollTo({ top: 0 });
    },
    [busca, router],
  );

  const motivoContato = !contato.nome.trim()
    ? 'Informe seu nome.'
    : contato.whatsapp.replace(/\D/g, '').length < 10
      ? 'Informe seu WhatsApp com DDD.'
      : !contato.aceite
        ? 'Aceite a Política de Privacidade para continuar.'
        : null;
  const motivo = passo === 3 ? motivoContato : motivoDoBotaoDesabilitado(passo, escolhas, dados);

  function avancar() {
    if (motivo) return;
    void registrarFunil(slug, {
      sessao: sessaoDoFunil(),
      passo,
      evento: 'passo_concluido',
      origem,
    });
    if (passo === 5) {
      iniciarConclusao(async () => {
        const r = await concluirOrcamento(slug, escolhas);
        if (r.ok) router.push(`/b/${slug}/proposta/${r.dados.token}`);
        else setErro(r.erro);
      });
      return;
    }
    const proximo = proximoPasso(passo);
    if (proximo) irPara(proximo);
  }

  function contatoConfirmado(p: Previa) {
    setComContato(true);
    setPrevia(p);
    irPara(4);
  }

  const anterior = passoAnterior(passo, !!tipoNaUrl);
  const info = PASSOS.find((p) => p.numero === passo)!;
  const props: PropsPasso = { slug, vitrine, escolhas, alterar, previa, carregando, buffet };

  const tipo = vitrine.tiposEvento.find((t) => t.id === escolhas.tipoEventoId);
  const turno = vitrine.turnos.find((t) => t.id === escolhas.turnoId);
  const resumo = [
    tipo?.nome,
    escolhas.data ? formatData(escolhas.data).slice(0, 5) : null,
    turno?.nome,
    pessoas(escolhas) > 0 ? `${pessoas(escolhas)} convidados` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  let preco: string | null = null;
  if (previa?.totalCentavos != null) preco = `Total ${formatBRL(previa.totalCentavos)}`;
  else if (previa?.aPartirDeCentavos != null)
    preco = `A partir de ${formatBRL(previa.aPartirDeCentavos)}`;
  else if (vitrine.modoPreco === 'apos_contato' && !comContato) {
    preco = 'Valores depois do seu WhatsApp';
  }

  const rotulo =
    passo === 3 ? 'Ver pacotes e valores' : passo === 5 ? 'Ver minha proposta' : 'Continuar';

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-20 border-b bg-white/95 px-4 pt-3 pb-2 backdrop-blur">
        <div className="flex items-center gap-2">
          {anterior ? (
            <button
              type="button"
              onClick={() => irPara(anterior)}
              className="hover:bg-accent -ml-2 grid size-12 place-items-center rounded-full"
              aria-label="Voltar ao passo anterior"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </button>
          ) : (
            <a
              href={`/b/${slug}`}
              className="hover:bg-accent -ml-2 grid size-12 place-items-center rounded-full"
              aria-label={`Voltar para a página de ${buffet.nome}`}
            >
              <ArrowLeft className="size-5" aria-hidden />
            </a>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground truncate text-xs font-semibold">{buffet.nome}</p>
            <p className="text-sm font-bold" data-testid="passo-atual">
              Passo {passo} de 6 · {info.curto}
            </p>
          </div>
        </div>
        <div
          className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={6}
          aria-valuenow={passo}
          aria-label="Progresso do orçamento"
        >
          <div
            className="bg-primary h-full rounded-full transition-[width] motion-reduce:transition-none"
            style={{ width: `${(passo / 6) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 px-4 pt-5 pb-48">
        <h1
          ref={titulo}
          tabIndex={-1}
          className="text-2xl font-extrabold tracking-tight outline-none"
        >
          {info.titulo}
        </h1>
        <div className="mt-5">
          {passo === 1 && <PassoFesta {...props} />}
          {passo === 2 && <PassoQuando {...props} />}
          {passo === 3 && (
            <PassoContato
              {...props}
              contato={contato}
              setContato={setContato}
              inicio={inicio}
              origem={origem}
              confirmado={contatoConfirmado}
            />
          )}
          {passo === 4 && <PassoPacote {...props} />}
          {passo === 5 && <PassoExtras {...props} />}
        </div>
        <RodapePublico />
      </main>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur"
        data-testid="barra-resumo"
      >
        <div className="mx-auto max-w-2xl px-4 pt-2 pb-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground min-w-0 truncate">
              {resumo || 'Monte sua festa'}
            </span>
            <span className="shrink-0 font-bold" aria-live="polite" data-testid="preco-resumo">
              {carregando && !preco ? '…' : preco}
            </span>
          </div>
          <p
            className="text-muted-foreground mt-1 min-h-5 text-xs"
            aria-live="polite"
            data-testid="motivo"
          >
            {erro ? <span className="text-destructive font-semibold">{erro}</span> : motivo}
          </p>
          <button
            type={passo === 3 ? 'submit' : 'button'}
            form={passo === 3 ? 'form-contato' : undefined}
            onClick={passo === 3 ? undefined : avancar}
            disabled={!!motivo || concluindo}
            aria-disabled={!!motivo || concluindo}
            className={`${BOTAO_PRINCIPAL} mt-1 w-full`}
          >
            {concluindo ? 'Calculando sua proposta…' : rotulo}
          </button>
        </div>
      </div>
    </div>
  );
}
