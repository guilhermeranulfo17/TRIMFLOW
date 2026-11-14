'use client';

import { Bot, Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { CampoDinheiro } from '@/components/app/campos/campo-dinheiro';
import { UploadImagem } from '@/components/app/campos/upload-imagem';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBRL } from '@/domain/money';
import { OPCOES_MODO_PRECO } from '@/domain/onboarding/modo-preco';
import {
  PASSO_DO_TRECHO,
  perguntaDaCapacidade,
  perguntaDoPacote,
  resumoTurnos,
  type TrechoConversa,
} from '@/domain/onboarding/conversa';
import { percentualProgresso } from '@/domain/onboarding/passos';
import { faixasProporcionais } from '@/domain/onboarding/precos';
import type { ModoPreco } from '@/domain/publico/tipos';
import { UFS } from '@/domain/uf';
import type { IdentidadeEntrada } from '@/domain/validacao/empresa';
import { cn } from '@/lib/utils';
import { urlPublicaMidia } from '@/lib/midia';
import { salvarEspaco } from '@/server/actions/empresa/agenda-config';
import { salvarIdentidade, salvarImagemEmpresa } from '@/server/actions/empresa/identidade';
import {
  confirmarPrecos,
  irParaPasso,
  trocarModeloDoOnboarding,
  type PrecosEntrada,
} from '@/server/actions/onboarding';
import type { AgendaRapida, OpcionalPreco, PacotePreco } from '@/server/onboarding/carregar';

/*
 * Onboarding em conversa (§91): uma pergunta por vez, em balões, salvando a cada resposta com
 * as mesmas ações dos passos em formulário (que continuam em /app/comecar?passo=N).
 */

type Mensagem = { de: 'bot' | 'eu'; texto: string };

type Etapa =
  | { t: 'boas_vindas' }
  | { t: 'trocar' }
  | { t: 'cidade' }
  | { t: 'logo' }
  | { t: 'pacote'; i: number }
  | { t: 'extras_pergunta' }
  | { t: 'extra'; i: number }
  | { t: 'modo' }
  | { t: 'capacidade'; i: number }
  | { t: 'turnos' };

export type DadosConversa = {
  nomeUsuario: string;
  nomeBuffet: string;
  empresaId: string;
  logoPath: string | null;
  identidade: IdentidadeEntrada;
  modeloRotulo: string;
  pacotesDoModelo: string[];
  podeTrocar: boolean;
  modelos: { chave: string; rotulo: string; descricao: string }[];
  pacotes: PacotePreco[];
  opcionais: OpcionalPreco[];
  modoPreco: ModoPreco;
  agenda: AgendaRapida;
  trechoInicial: TrechoConversa;
};

const COBRANCA: Record<string, string> = {
  por_pessoa: 'por convidado',
  fixo: 'valor fixo',
  por_unidade: 'por unidade',
  por_hora: 'por hora',
};

function primeiroNome(n: string) {
  return n.trim().split(/\s+/)[0] ?? '';
}

function etapaDoTrecho(t: TrechoConversa): Etapa {
  if (t === 'cidade') return { t: 'cidade' };
  if (t === 'precos') return { t: 'pacote', i: 0 };
  if (t === 'agenda') return { t: 'capacidade', i: 0 };
  return { t: 'boas_vindas' };
}

export function ConversaOnboarding({ d }: { d: DadosConversa }) {
  const toast = useToast();
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  const espacos = d.agenda.espacos.filter((e) => e.ativo);
  const continuacao = d.trechoInicial !== 'boas_vindas';

  const [historico, setHistorico] = useState<Mensagem[]>(() =>
    continuacao
      ? [
          {
            de: 'bot',
            texto: `Oi de novo, ${primeiroNome(d.nomeUsuario)}! Vamos continuar de onde paramos.`,
          },
        ]
      : [],
  );
  const [etapa, setEtapa] = useState<Etapa>(() => etapaDoTrecho(d.trechoInicial));
  const [cidade, setCidade] = useState(d.identidade.cidade ?? '');
  const [uf, setUf] = useState<string>(d.identidade.uf ?? '');
  const [valor, setValor] = useState<number | null>(null);
  const [numero, setNumero] = useState('');
  const [precosPacote, setPrecosPacote] = useState<Record<string, number>>({});
  const [precosExtra, setPrecosExtra] = useState<Record<string, number>>({});

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [historico, etapa]);

  const falou = (pergunta: string, resposta: string) =>
    setHistorico((h) => [...h, { de: 'bot', texto: pergunta }, { de: 'eu', texto: resposta }]);

  /** Grava o passo (o progresso fica salvo: fechar e voltar continua daqui). */
  async function passo(trecho: TrechoConversa): Promise<boolean> {
    const r = await irParaPasso(PASSO_DO_TRECHO[trecho]);
    if (!r.ok) toast.erro(r.erro);
    return r.ok;
  }

  // ------------------------------------------------------------------------------------------
  // Texto da pergunta atual
  // ------------------------------------------------------------------------------------------
  const pacote = etapa.t === 'pacote' ? d.pacotes[etapa.i] : undefined;
  const extra = etapa.t === 'extra' ? d.opcionais[etapa.i] : undefined;
  const espaco = etapa.t === 'capacidade' ? espacos[etapa.i] : undefined;

  let pergunta = '';
  let dica: string | null = null;
  switch (etapa.t) {
    case 'boas_vindas':
      pergunta =
        `Oi, ${primeiroNome(d.nomeUsuario)}! Vou deixar o link de orçamento do ${d.nomeBuffet} pronto com você, uma pergunta por vez. Leva uns 5 minutos.\n\n` +
        `Já montei um catálogo de exemplo de ${d.modeloRotulo.toLowerCase()}` +
        (d.pacotesDoModelo.length ? `, com os pacotes ${d.pacotesDoModelo.join(', ')}.` : '.') +
        ' É esse o seu tipo de buffet?';
      break;
    case 'trocar':
      pergunta = 'Sem problema. Qual destes combina mais com o seu buffet?';
      break;
    case 'cidade':
      pergunta = 'Em que cidade fica o buffet?';
      break;
    case 'logo':
      pergunta = 'Quer colocar a sua logo agora? Ela aparece no link e na proposta.';
      break;
    case 'pacote':
      if (pacote) ({ texto: pergunta, dica } = perguntaDoPacote(pacote));
      break;
    case 'extras_pergunta':
      pergunta = `Seu catálogo tem ${d.opcionais.length} extras (opcionais que o cliente pode somar à festa). Quer colocar os preços deles agora?`;
      dica = 'Extra sem preço não aparece no link. Dá para fazer depois em Minha empresa.';
      break;
    case 'extra':
      if (extra) {
        pergunta = `Quanto custa ${extra.nome} (${COBRANCA[extra.cobranca] ?? extra.cobranca})?`;
        dica = `No exemplo está ${formatBRL(extra.precoCentavos)}.`;
      }
      break;
    case 'modo':
      pergunta = 'Última sobre preço: como ele aparece para o cliente no seu link?';
      break;
    case 'capacidade':
      if (espaco) pergunta = perguntaDaCapacidade(espaco);
      break;
    case 'turnos':
      pergunta = `Estes são os seus horários de festa:\n${resumoTurnos(d.agenda.turnos)
        .map((l) => `• ${l}`)
        .join('\n')}\n\nEstá certo?`;
      dica = 'A agenda mostra ao cliente só os dias e horários livres.';
      break;
  }

  // ------------------------------------------------------------------------------------------
  // Respostas
  // ------------------------------------------------------------------------------------------
  const irPrecos = () =>
    iniciar(async () => {
      if (!(await passo('precos'))) return;
      setValor(null);
      setEtapa(d.pacotes.length ? { t: 'pacote', i: 0 } : { t: 'modo' });
    });

  function aposPacotes() {
    setValor(null);
    if (d.opcionais.length) setEtapa({ t: 'extras_pergunta' });
    else setEtapa({ t: 'modo' });
  }

  function proximoPacote(i: number) {
    if (i + 1 < d.pacotes.length) {
      setValor(null);
      setEtapa({ t: 'pacote', i: i + 1 });
    } else aposPacotes();
  }

  function proximoExtra(i: number) {
    setValor(null);
    if (i + 1 < d.opcionais.length) setEtapa({ t: 'extra', i: i + 1 });
    else setEtapa({ t: 'modo' });
  }

  const salvarPrecos = (modo: ModoPreco, rotulo: string) =>
    iniciar(async () => {
      const comPreco = d.pacotes.filter((p) => precosPacote[p.id] !== undefined);
      if (comPreco.length === 0) {
        toast.erro('Digite o preço de pelo menos um pacote.');
        setEtapa({ t: 'pacote', i: 0 });
        return;
      }
      const entrada: PrecosEntrada = {
        pacotes: comPreco.map((p) => {
          const v = precosPacote[p.id]!;
          if (p.modeloPreco === 'por_pessoa') return { id: p.id, precoPessoaCentavos: v };
          const prop = faixasProporcionais(p.faixas, p.valorExcedenteCentavos, v);
          return {
            id: p.id,
            faixas: prop.faixas.map((f, i) => (i === 0 ? { ...f, valorCentavos: v } : f)),
            valorExcedenteCentavos: prop.excedenteCentavos ?? 0,
          };
        }),
        opcionais: Object.entries(precosExtra).map(([id, precoCentavos]) => ({
          id,
          precoCentavos,
        })),
        modoExibicaoPreco: modo,
      };
      const r = await confirmarPrecos(entrada);
      if (!r.ok) {
        toast.erro(r.erro);
        return;
      }
      falou(pergunta, rotulo);
      if (!(await passo('agenda'))) return;
      setNumero('');
      setEtapa(espacos.length ? { t: 'capacidade', i: 0 } : { t: 'turnos' });
    });

  const terminar = () =>
    iniciar(async () => {
      if (!(await passo('pronto'))) return;
      router.push('/app/comecar?passo=5');
      router.refresh();
    });

  // ------------------------------------------------------------------------------------------
  // Tela
  // ------------------------------------------------------------------------------------------
  const passoAtual =
    etapa.t === 'boas_vindas' || etapa.t === 'trocar'
      ? 1
      : etapa.t === 'cidade' || etapa.t === 'logo'
        ? 2
        : etapa.t === 'capacidade' || etapa.t === 'turnos'
          ? 4
          : 3;

  return (
    <div className="flex flex-col gap-4 pb-6" data-testid="conversa-onboarding">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <Link
            href={`/app/comecar?passo=${passoAtual}`}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            data-testid="prefiro-formulario"
          >
            Prefiro o formulário
          </Link>
          <Link
            href="/app/leads"
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            Sair e terminar depois
          </Link>
        </div>
        <div
          className="bg-muted h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={percentualProgresso(passoAtual)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso da configuração"
        >
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${percentualProgresso(passoAtual)}%` }}
          />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Vamos montar seu link</h1>
      </header>

      <ol className="flex flex-col gap-3" aria-live="polite">
        {historico.map((m, i) => (
          <Balao key={i} de={m.de} texto={m.texto} />
        ))}
        <Balao de="bot" texto={pergunta} dica={dica} atual />
      </ol>

      <div className="bg-card rounded-card flex flex-col gap-3 border p-4" data-testid="resposta">
        {etapa.t === 'boas_vindas' && (
          <Opcoes
            ocupado={ocupado}
            opcoes={[
              {
                rotulo: 'Sim, é isso',
                acao: () =>
                  iniciar(async () => {
                    if (!(await passo('cidade'))) return;
                    falou(pergunta, 'Sim, é isso');
                    setEtapa({ t: 'cidade' });
                  }),
              },
              ...(d.podeTrocar
                ? [
                    {
                      rotulo: 'Quero outro tipo',
                      acao: () => {
                        falou(pergunta, 'Quero outro tipo');
                        setEtapa({ t: 'trocar' });
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}

        {etapa.t === 'trocar' && (
          <Opcoes
            ocupado={ocupado}
            opcoes={d.modelos.map((m) => ({
              rotulo: m.rotulo,
              dica: m.descricao,
              acao: () =>
                iniciar(async () => {
                  const r = await trocarModeloDoOnboarding(m.chave);
                  if (!r.ok) {
                    toast.erro(r.erro);
                    return;
                  }
                  toast.sucesso(r.mensagem);
                  // os pacotes e preços mudam: a conversa recomeça com o catálogo novo
                  router.refresh();
                }),
            }))}
          />
        )}

        {etapa.t === 'cidade' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              iniciar(async () => {
                const r = await salvarIdentidade({
                  ...d.identidade,
                  cidade,
                  uf: uf as IdentidadeEntrada['uf'],
                });
                if (!r.ok) {
                  toast.erro(r.erro);
                  return;
                }
                falou(pergunta, uf ? `${cidade} (${uf})` : cidade);
                setEtapa({ t: 'logo' });
              });
            }}
          >
            <div className="grid grid-cols-[1fr_5.5rem] gap-2">
              <Input
                aria-label="Cidade"
                placeholder="Ex.: Uberlândia"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                autoFocus
              />
              <select
                aria-label="Estado"
                className={classeCampo}
                value={uf}
                onChange={(e) => setUf(e.target.value)}
              >
                <option value="">UF</option>
                {UFS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <Enviar ocupado={ocupado} desabilitado={cidade.trim().length < 2} />
          </form>
        )}

        {etapa.t === 'logo' && (
          <div className="flex flex-col gap-3">
            <UploadImagem
              empresaId={d.empresaId}
              tipo="logo"
              rotulo="Logo"
              urlAtual={urlPublicaMidia(d.logoPath)}
              onEnviado={async (caminho) => {
                const r = await salvarImagemEmpresa({ tipo: 'logo', caminho });
                if (!r.ok) {
                  toast.erro(r.erro);
                  return false;
                }
                falou(pergunta, 'Enviei a logo');
                irPrecos();
                return true;
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={() => {
                falou(pergunta, 'Depois eu coloco');
                irPrecos();
              }}
            >
              Depois eu coloco
            </Button>
          </div>
        )}

        {etapa.t === 'pacote' && pacote && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (valor === null || valor <= 0) return;
              setPrecosPacote((p) => ({ ...p, [pacote.id]: valor }));
              falou(pergunta, formatBRL(valor));
              proximoPacote(etapa.i);
            }}
          >
            <CampoDinheiro
              id={`conversa-pacote-${pacote.id}`}
              aria-label={`Preço do pacote ${pacote.nome}`}
              valor={valor}
              onChange={setValor}
            />
            <Enviar ocupado={ocupado} desabilitado={valor === null || valor <= 0} />
            <button
              type="button"
              className="text-muted-foreground min-h-11 text-sm underline-offset-4 hover:underline"
              onClick={() => {
                falou(pergunta, 'Não vendo este pacote agora');
                proximoPacote(etapa.i);
              }}
            >
              Não vendo este pacote agora
            </button>
          </form>
        )}

        {etapa.t === 'extras_pergunta' && (
          <Opcoes
            ocupado={ocupado}
            opcoes={[
              {
                rotulo: 'Sim, um por um',
                acao: () => {
                  falou(pergunta, 'Sim, um por um');
                  setValor(null);
                  setEtapa({ t: 'extra', i: 0 });
                },
              },
              {
                rotulo: 'Depois',
                acao: () => {
                  falou(pergunta, 'Depois');
                  setEtapa({ t: 'modo' });
                },
              },
            ]}
          />
        )}

        {etapa.t === 'extra' && extra && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (valor === null || valor < 0) return;
              setPrecosExtra((p) => ({ ...p, [extra.id]: valor }));
              falou(pergunta, formatBRL(valor));
              proximoExtra(etapa.i);
            }}
          >
            <CampoDinheiro
              id={`conversa-extra-${extra.id}`}
              aria-label={`Preço de ${extra.nome}`}
              valor={valor}
              onChange={setValor}
            />
            <Enviar ocupado={ocupado} desabilitado={valor === null || valor < 0} />
            <button
              type="button"
              className="text-muted-foreground min-h-11 text-sm underline-offset-4 hover:underline"
              onClick={() => {
                falou(pergunta, 'Não ofereço este');
                proximoExtra(etapa.i);
              }}
            >
              Não ofereço este
            </button>
          </form>
        )}

        {etapa.t === 'modo' && (
          <Opcoes
            ocupado={ocupado}
            opcoes={OPCOES_MODO_PRECO.map((o) => ({
              rotulo: o.titulo,
              dica: o.frase,
              acao: () => salvarPrecos(o.valor, o.titulo),
            }))}
          />
        )}

        {etapa.t === 'capacidade' && espaco && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(numero);
              if (!Number.isInteger(n) || n < 1) return;
              iniciar(async () => {
                const { id, ...dados } = espaco;
                const r = await salvarEspaco(id, { ...dados, capacidadeMax: n });
                if (!r.ok) {
                  toast.erro(r.erro);
                  return;
                }
                falou(pergunta, `${n} convidados`);
                setNumero('');
                setEtapa(
                  etapa.i + 1 < espacos.length
                    ? { t: 'capacidade', i: etapa.i + 1 }
                    : { t: 'turnos' },
                );
              });
            }}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              aria-label="Quantidade de convidados"
              placeholder={String(espaco.capacidadeMax)}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              autoFocus
            />
            <Enviar ocupado={ocupado} desabilitado={!(Number(numero) >= 1)} />
          </form>
        )}

        {etapa.t === 'turnos' && (
          <div className="flex flex-col gap-2">
            <Button type="button" disabled={ocupado} onClick={terminar} data-testid="turnos-certos">
              {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Está certo, terminar
            </Button>
            <Link
              href="/app/comecar?passo=4"
              className="rounded-control hover:bg-accent inline-flex min-h-11 items-center justify-center border px-4 text-sm font-semibold"
            >
              Ajustar horários
            </Link>
          </div>
        )}
      </div>
      <div ref={fim} />
    </div>
  );
}

function Balao({
  de,
  texto,
  dica,
  atual,
}: {
  de: 'bot' | 'eu';
  texto: string;
  dica?: string | null;
  atual?: boolean;
}) {
  if (!texto) return null;
  const bot = de === 'bot';
  return (
    <li className={cn('flex gap-2', bot ? 'justify-start' : 'justify-end')}>
      {bot && (
        <span
          className="bg-primary text-primary-foreground mt-1 grid size-7 shrink-0 place-items-center rounded-full"
          aria-hidden
        >
          <Bot className="size-4" />
        </span>
      )}
      <div
        className={cn(
          'rounded-card max-w-[85%] px-3 py-2 text-sm whitespace-pre-line',
          bot ? 'bg-card border' : 'bg-primary text-primary-foreground',
          atual && 'ring-ring/40 ring-1',
        )}
        data-testid={atual ? 'pergunta-atual' : undefined}
      >
        {texto}
        {dica && <p className="text-muted-foreground mt-1 text-xs">{dica}</p>}
      </div>
    </li>
  );
}

function Opcoes({
  opcoes,
  ocupado,
}: {
  opcoes: { rotulo: string; dica?: string; acao: () => void }[];
  ocupado: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {opcoes.map((o) => (
        <button
          key={o.rotulo}
          type="button"
          disabled={ocupado}
          onClick={o.acao}
          className="rounded-control hover:border-ring flex min-h-11 flex-col items-start border px-3 py-2 text-left disabled:opacity-60"
        >
          <span className="font-semibold">{o.rotulo}</span>
          {o.dica && <span className="text-muted-foreground text-xs">{o.dica}</span>}
        </button>
      ))}
    </div>
  );
}

function Enviar({ ocupado, desabilitado }: { ocupado: boolean; desabilitado: boolean }) {
  return (
    <Button type="submit" disabled={ocupado || desabilitado}>
      {ocupado ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Check className="size-4" aria-hidden />
      )}
      Responder
    </Button>
  );
}
