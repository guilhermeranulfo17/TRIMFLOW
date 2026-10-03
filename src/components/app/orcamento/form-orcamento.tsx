'use client';

import { AlertTriangle, ChevronUp, Loader2, Plus, Trash2, UserCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CampoDinheiro } from '@/components/app/campos/campo-dinheiro';
import { CampoPercentual } from '@/components/app/campos/campo-percentual';
import { Campo } from '@/components/app/form/campo';
import { classeCampo } from '@/components/app/form/estilos';
import { classeOpcao, Contador } from '@/components/orcamento/contador';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatData } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { formatBp } from '@/domain/percent';
import type { VitrinePublica } from '@/domain/publico';
import { resumoCardapio } from '@/domain/publico/cardapio';
import { espacoEscolhido, pessoas, turnosNaData } from '@/domain/publico/passos';
import { AVISO_DESLOCAMENTO } from '@/domain/publico/previa';
import { mascaraTelefoneBR } from '@/domain/mascara';
import type { AjustesInternos, EstadoInterno } from '@/domain/validacao/orcamento-interno';
import { ORIGENS_INTERNAS } from '@/domain/validacao/origens';
import {
  previaInterna,
  procurarCliente,
  salvarOrcamentoInterno,
  type OrcamentoSalvo,
  type PreviaInterna,
} from '@/server/actions/orcamentos';
import { CalendarioAgenda, livresPorData, useAgendaDoMes } from './calendario-agenda';
import { SaidasOrcamento } from './saidas-orcamento';

type Escolhas = EstadoInterno['escolhas'];
type Cliente = { whatsapp: string; nome: string; origem: string };
type Rascunho = { cliente: Cliente; escolhas: Escolhas; ajustes: AjustesInternos };

export type PropsFormOrcamento = {
  vitrine: VitrinePublica;
  fuso: string;
  limiteDescontoBp: number;
  ehDono: boolean;
  /** edição: versão vigente de onde sai a versão nova */
  orcamento?: {
    id: string;
    numero: number;
    versao: number;
    slot: { data?: string; turnoId?: string; espacoId?: string };
  };
  clienteInicial: Cliente | null;
  estadoInicial: EstadoInterno;
  /** chave do rascunho local (novo, lead:{id} ou {id} na edição) */
  chaveRascunho: string;
};

const CAMPOS_COM_LUGAR = [
  /^cliente\.(whatsapp|nome)$/,
  /^ajustes\.(descontoMotivo|observacoes|observacoesInternas)$/,
  /^ajustes\.avulsos\.\d+\.descricao$/,
];

const CHAVE = (k: string) => `orkestra:orcamento:${k}`;

function lerRascunho(chave: string): Rascunho | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE(chave));
    return bruto ? (JSON.parse(bruto) as Rascunho) : null;
  } catch {
    return null;
  }
}
function gravarRascunho(chave: string, r: Rascunho | null) {
  try {
    if (r) window.localStorage.setItem(CHAVE(chave), JSON.stringify(r));
    else window.localStorage.removeItem(CHAVE(chave));
  } catch {
    // modo privado ou armazenamento cheio: segue sem rascunho
  }
}

function Secao({
  titulo,
  children,
  id,
}: {
  titulo: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section aria-labelledby={id} className="bg-card rounded-card border p-4 md:p-5">
      <h2 id={id} className="mb-4 text-lg font-bold">
        {titulo}
      </h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function precoDoExtra(cobranca: string, preco: number): string {
  switch (cobranca) {
    case 'por_pessoa':
      return `${formatBRL(preco)} por convidado`;
    case 'por_unidade':
      return `${formatBRL(preco)} cada`;
    case 'por_hora':
      return `${formatBRL(preco)} por hora`;
    default:
      return formatBRL(preco);
  }
}

export function FormOrcamento(props: PropsFormOrcamento) {
  const { vitrine, orcamento, limiteDescontoBp, ehDono, chaveRascunho } = props;
  const [cliente, setCliente] = useState<Cliente>(
    props.clienteInicial ?? { whatsapp: '', nome: '', origem: 'whatsapp' },
  );
  const [escolhas, setEscolhas] = useState<Escolhas>(props.estadoInicial.escolhas);
  const [ajustes, setAjustes] = useState<AjustesInternos>(props.estadoInicial.ajustes);
  const [previa, setPrevia] = useState<PreviaInterna | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [leadExistente, setLeadExistente] = useState<{ nome: string; orcamentos: number } | null>(
    null,
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [camposSalvar, setCamposSalvar] = useState<Record<string, string>>({});
  const [camposPrevia, setCamposPrevia] = useState<Record<string, string>>({});
  const campos = { ...camposPrevia, ...camposSalvar };
  const [salvo, setSalvo] = useState<OrcamentoSalvo | null>(null);
  const [recuperado, setRecuperado] = useState(false);
  const [resumoAberto, setResumoAberto] = useState(false);
  const sujo = useRef(false);
  const pedido = useRef(0);
  const clienteFixo = !!orcamento;

  const espaco = espacoEscolhido(vitrine.espacos, escolhas);
  const agenda = useAgendaDoMes((escolhas.data ?? vitrine.hoje).slice(0, 7));

  // Rascunho local: recupera ao abrir, grava a cada mudança, apaga ao salvar.
  useEffect(() => {
    const r = lerRascunho(chaveRascunho);
    if (!r) return;
    setCliente((c) => (clienteFixo ? c : r.cliente));
    setEscolhas(r.escolhas);
    setAjustes(r.ajustes);
    setRecuperado(true);
  }, [chaveRascunho, clienteFixo]);
  useEffect(() => {
    if (!sujo.current || salvo) return;
    const t = setTimeout(() => gravarRascunho(chaveRascunho, { cliente, escolhas, ajustes }), 400);
    return () => clearTimeout(t);
  }, [chaveRascunho, cliente, escolhas, ajustes, salvo]);

  const alterar = useCallback((parcial: Partial<Escolhas>) => {
    sujo.current = true;
    setEscolhas((e) => ({ ...e, ...parcial }));
  }, []);
  const ajustar = (parcial: Partial<AjustesInternos>) => {
    sujo.current = true;
    setAjustes((a) => ({ ...a, ...parcial }));
  };
  const mudarCliente = (parcial: Partial<Cliente>) => {
    sujo.current = true;
    setCliente((c) => ({ ...c, ...parcial }));
  };

  // Prévia no servidor a cada mudança (o preço nunca é calculado aqui).
  useEffect(() => {
    if (!escolhas.tipoEventoId) {
      setPrevia(null);
      return;
    }
    const meu = ++pedido.current;
    setCalculando(true);
    const t = setTimeout(() => {
      void previaInterna({ escolhas, ajustes }).then((r) => {
        if (meu !== pedido.current) return;
        setCalculando(false);
        if (r.ok) {
          setPrevia(r.dados);
          setErroPrevia(null);
          setCamposPrevia({});
        } else {
          // Com campos, a tela destaca cada um; a frase só aparece se não houver campo.
          setCamposPrevia(r.campos ?? {});
          setErroPrevia(r.campos && Object.keys(r.campos).length ? null : r.erro || null);
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [escolhas, ajustes]);

  // Este WhatsApp já é lead? (só no orçamento novo)
  const digitos = cliente.whatsapp.replace(/\D/g, '');
  useEffect(() => {
    if (clienteFixo || digitos.length < 10) {
      setLeadExistente(null);
      return;
    }
    let ativo = true;
    const t = setTimeout(() => {
      void procurarCliente(digitos).then((r) => {
        if (!ativo || !r.ok) return;
        setLeadExistente(r.dados);
        if (r.dados) setCliente((c) => (c.nome.trim() ? c : { ...c, nome: r.dados!.nome }));
      });
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [digitos, clienteFixo]);

  const livres = livresPorData(agenda.slots, espaco?.id);
  const turnosDoDia = escolhas.data ? turnosNaData(vitrine.turnos, escolhas.data) : [];
  const slotOriginal = (turnoId: string) =>
    orcamento?.slot.data === escolhas.data &&
    orcamento?.slot.turnoId === turnoId &&
    (!espaco || orcamento?.slot.espacoId === espaco.id);
  const turnoLivre = (turnoId: string) =>
    slotOriginal(turnoId) ||
    !agenda.slots ||
    escolhas.data?.slice(0, 7) !== agenda.mes ||
    (livres.get(escolhas.data ?? '')?.has(turnoId) ?? false);

  const pacotesDoTipo = vitrine.pacotes.filter(
    (p) => p.tiposEventoIds.length === 0 || p.tiposEventoIds.includes(escolhas.tipoEventoId ?? ''),
  );
  const previaPacote = new Map((previa?.pacotes ?? []).map((p) => [p.id, p]));
  const nomesOpcionais = new Map(vitrine.opcionais.map((o) => [o.id, o]));
  const extras = (previa?.opcionais ?? []).filter((o) => nomesOpcionais.has(o.id));
  const qtdExtra = (id: string) =>
    escolhas.opcionais.find((o) => o.opcionalId === id)?.quantidade ?? 0;
  const mudarExtra = (id: string, q: number) =>
    alterar({
      opcionais: [
        ...escolhas.opcionais.filter((o) => o.opcionalId !== id),
        ...(q > 0 ? [{ opcionalId: id, quantidade: q }] : []),
      ],
    });
  const qtdFaixa = (id: string) =>
    escolhas.criancas.find((c) => c.faixaIdadeId === id)?.quantidade ?? 0;
  const mudarFaixa = (id: string, q: number) =>
    alterar({
      criancas: [
        ...escolhas.criancas.filter((c) => c.faixaIdadeId !== id),
        ...(q > 0 ? [{ faixaIdadeId: id, quantidade: q }] : []),
      ],
    });

  const resultado = previa?.resultado ?? null;
  const foraAntecedencia = !!resultado?.avisos.some((a) => a.codigo === 'ANTECEDENCIA_MINIMA');
  const erroDesconto = resultado?.erros.find((e) => e.campo === 'desconto')?.mensagem;
  const outrosErros = resultado?.erros.filter((e) => e.campo !== 'desconto') ?? [];
  // Erros de campos que não têm lugar próprio na tela aparecem no bloco de erros.
  const camposSemLugar = Object.entries(campos).filter(
    ([chave]) => !CAMPOS_COM_LUGAR.some((r) => r.test(chave)),
  );
  const pronto = !!resultado?.ok && (!foraAntecedencia || ajustes.foraAntecedencia);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setCamposSalvar({});
    const r = await salvarOrcamentoInterno({
      ...(orcamento ? { orcamentoId: orcamento.id } : {}),
      cliente: { ...cliente, origem: cliente.origem as never },
      escolhas,
      ajustes,
    });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      setCamposSalvar(r.campos ?? {});
      // Leva até o primeiro campo com erro.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>('form [aria-invalid="true"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus({ preventScroll: true });
      });
      return;
    }
    gravarRascunho(chaveRascunho, null);
    sujo.current = false;
    setSalvo(r.dados);
    window.scrollTo({ top: 0 });
  }

  if (salvo) {
    return (
      <SaidasOrcamento
        salvo={salvo}
        cliente={cliente.nome}
        fuso={props.fuso}
        podePreReservar={!!resultado?.ok}
      />
    );
  }

  const tipoSelecionado = vitrine.tiposEvento.find((t) => t.id === escolhas.tipoEventoId);

  return (
    <form
      className="mx-auto flex max-w-2xl flex-col gap-4 pb-28"
      onSubmit={(e) => {
        e.preventDefault();
        if (pronto && !salvando) void salvar();
      }}
      noValidate
    >
      {recuperado && (
        <div
          className="rounded-card border-alerta/30 bg-alerta/10 text-alerta flex items-center justify-between gap-3 border p-3 text-sm"
          role="status"
        >
          <span>Recuperamos o rascunho que você não salvou.</span>
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={() => {
              gravarRascunho(chaveRascunho, null);
              window.location.reload();
            }}
          >
            Descartar
          </button>
        </div>
      )}

      <Secao titulo="Cliente" id="sec-cliente">
        {clienteFixo ? (
          <p data-testid="cliente-fixo">
            <span className="font-semibold">{cliente.nome}</span>
            <span className="text-muted-foreground"> · {cliente.whatsapp}</span>
          </p>
        ) : (
          <>
            <Campo
              id="cliente-whatsapp"
              rotulo="WhatsApp do cliente"
              erro={campos['cliente.whatsapp']}
            >
              {/* só a máscara no navegador; o servidor confere e converte para E.164 */}
              <Input
                id="cliente-whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="(34) 99135-5450"
                value={cliente.whatsapp}
                onChange={(e) => mudarCliente({ whatsapp: mascaraTelefoneBR(e.target.value) })}
                aria-invalid={!!campos['cliente.whatsapp'] || undefined}
                autoFocus={!cliente.whatsapp}
              />
            </Campo>
            {leadExistente && (
              <p
                className="rounded-control bg-info/10 text-info flex items-start gap-2 p-3 text-sm"
                data-testid="aviso-lead-existente"
              >
                <UserCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Este número já é o lead <strong>{leadExistente.nome}</strong>
                  {leadExistente.orcamentos > 0
                    ? ` (${leadExistente.orcamentos} ${leadExistente.orcamentos === 1 ? 'orçamento' : 'orçamentos'})`
                    : ''}
                  . O orçamento entra no mesmo lead.
                </span>
              </p>
            )}
            <Campo id="cliente-nome" rotulo="Nome do cliente" erro={campos['cliente.nome']}>
              <Input
                id="cliente-nome"
                value={cliente.nome}
                onChange={(e) => mudarCliente({ nome: e.target.value })}
                autoComplete="off"
                maxLength={120}
                aria-invalid={!!campos['cliente.nome'] || undefined}
              />
            </Campo>
            <Campo id="cliente-origem" rotulo="Como chegou">
              <select
                id="cliente-origem"
                className={classeCampo}
                value={cliente.origem}
                onChange={(e) => mudarCliente({ origem: e.target.value })}
              >
                {ORIGENS_INTERNAS.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </>
        )}
      </Secao>

      <Secao titulo="Festa" id="sec-festa">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Tipo de festa</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {vitrine.tiposEvento.map((t) => {
              const marcado = escolhas.tipoEventoId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  onClick={() =>
                    alterar({ tipoEventoId: t.id, pacoteId: undefined, opcionais: [] })
                  }
                  className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${marcado ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
                >
                  {t.nome}
                </button>
              );
            })}
          </div>
        </fieldset>

        {vitrine.espacos.length > 1 && (
          <Campo id="espaco" rotulo="Espaço">
            <select
              id="espaco"
              className={classeCampo}
              value={escolhas.espacoId ?? ''}
              onChange={(e) => alterar({ espacoId: e.target.value || undefined })}
            >
              <option value="">Escolha o espaço</option>
              {vitrine.espacos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} (até {e.capacidadeMax} pessoas)
                </option>
              ))}
            </select>
          </Campo>
        )}

        <CalendarioAgenda
          hoje={vitrine.hoje}
          mes={agenda.mes}
          setMes={agenda.setMes}
          slots={agenda.slots}
          erro={agenda.erro}
          espacoId={espaco?.id}
          data={escolhas.data}
          aoEscolher={(data) => alterar({ data, turnoId: undefined })}
        />

        {escolhas.data && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              Horário em {formatData(escolhas.data)}
            </legend>
            {turnosDoDia.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum horário neste dia da semana.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
                {turnosDoDia.map((t) => {
                  const livre = turnoLivre(t.id);
                  const marcado = escolhas.turnoId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={marcado}
                      disabled={!livre}
                      onClick={() => alterar({ turnoId: t.id })}
                      className={classeOpcao(marcado, !livre)}
                      data-testid="turno"
                    >
                      <span className="flex-1">
                        <span className="block font-bold">{t.nome}</span>
                        <span className="text-muted-foreground text-sm">
                          {livre ? `começa às ${t.horaInicio}` : 'Ocupado na agenda'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        )}

        <fieldset>
          <legend className="text-sm font-medium">Convidados</legend>
          <div className="divide-y">
            <Contador
              id="adultos"
              rotulo="Adultos"
              valor={escolhas.adultos ?? 0}
              aoMudar={(v) => alterar({ adultos: v })}
            />
            {vitrine.faixasIdade.map((f) => (
              <Contador
                key={f.id}
                id={`faixa-${f.id}`}
                rotulo={`Crianças de ${f.rotulo}`}
                valor={qtdFaixa(f.id)}
                aoMudar={(v) => mudarFaixa(f.id, v)}
              />
            ))}
          </div>
          {espaco && pessoas(escolhas) > 0 && (
            <p className="text-muted-foreground mt-1 text-sm">
              {pessoas(escolhas)} pessoas · {espaco.nome} recebe até {espaco.capacidadeMax}
            </p>
          )}
        </fieldset>

        {espaco?.noLocalDoCliente && (
          <Campo id="local" rotulo="Bairro e cidade da festa" dica={AVISO_DESLOCAMENTO}>
            <Input
              id="local"
              value={escolhas.localCliente ?? ''}
              onChange={(e) => alterar({ localCliente: e.target.value.slice(0, 120) })}
              placeholder="Ex.: Centro, Uberlândia"
            />
          </Campo>
        )}
      </Secao>

      {tipoSelecionado && (
        <Secao titulo="Pacote" id="sec-pacote">
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Pacotes">
            {pacotesDoTipo.map((p) => {
              const info = previaPacote.get(p.id);
              const disponivel = info?.disponivel ?? true;
              const marcado = escolhas.pacoteId === p.id;
              const cardapio = resumoCardapio(p.secoes);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  disabled={!disponivel && !marcado}
                  onClick={() => alterar({ pacoteId: p.id, opcionais: [] })}
                  className={classeOpcao(marcado, !disponivel)}
                  data-testid="opcao-pacote"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{p.nome}</span>
                    {cardapio && (
                      <span className="text-muted-foreground line-clamp-1 block text-sm">
                        {cardapio}
                      </span>
                    )}
                    {!disponivel && info?.motivo && (
                      <span className="text-destructive block text-sm">{info.motivo}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right font-bold">
                    {info?.totalCentavos != null ? formatBRL(info.totalCentavos) : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </Secao>
      )}

      {escolhas.pacoteId && (extras.length > 0 || (previa?.horaExtraCentavos ?? 0) > 0) && (
        <Secao titulo="Extras" id="sec-extras">
          <div className="flex flex-col gap-2">
            {extras.map((o) => {
              const info = nomesOpcionais.get(o.id)!;
              const q = qtdExtra(o.id);
              if (o.cobranca === 'por_unidade' || o.cobranca === 'por_hora') {
                return (
                  <div key={o.id} className="rounded-card border px-3" data-testid="opcao-extra">
                    <Contador
                      id={`extra-${o.id}`}
                      rotulo={info.nome}
                      dica={precoDoExtra(o.cobranca, o.precoCentavos)}
                      valor={q}
                      max={o.qtdMax ?? 100}
                      aoMudar={(v) => mudarExtra(o.id, v > 0 ? Math.max(v, o.qtdMin) : 0)}
                    />
                  </div>
                );
              }
              return (
                <label
                  key={o.id}
                  className="rounded-card flex min-h-12 cursor-pointer items-center gap-3 border px-3 py-2"
                  data-testid="opcao-extra"
                >
                  <input
                    type="checkbox"
                    className="accent-primary size-5"
                    checked={q > 0}
                    onChange={(e) => mudarExtra(o.id, e.target.checked ? 1 : 0)}
                  />
                  <span className="min-w-0 flex-1 font-semibold">{info.nome}</span>
                  <span className="text-muted-foreground text-sm">
                    {precoDoExtra(o.cobranca, o.precoCentavos)}
                  </span>
                </label>
              );
            })}
            {(previa?.horaExtraCentavos ?? 0) > 0 && (
              <div className="rounded-card border px-3">
                <Contador
                  id="horas-extras"
                  rotulo="Horas extras"
                  dica={`${formatBRL(previa!.horaExtraCentavos!)} por hora`}
                  valor={escolhas.horasExtras}
                  max={12}
                  aoMudar={(v) => alterar({ horasExtras: v })}
                />
              </div>
            )}
          </div>
        </Secao>
      )}

      <Secao titulo="Ajustes" id="sec-ajustes">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Itens avulsos</legend>
          <ul className="flex flex-col gap-3">
            {ajustes.avulsos.map((item, i) => {
              const mudar = (parcial: Partial<typeof item>) =>
                ajustar({
                  avulsos: ajustes.avulsos.map((x, j) => (j === i ? { ...x, ...parcial } : x)),
                });
              return (
                <li key={i} className="rounded-control grid grid-cols-6 gap-2 border p-3">
                  <div className="col-span-6">
                    <Input
                      aria-label={`Descrição do item ${i + 1}`}
                      placeholder="Ex.: Mesa de doces extra"
                      value={item.descricao}
                      maxLength={120}
                      aria-invalid={!!campos[`ajustes.avulsos.${i}.descricao`] || undefined}
                      aria-describedby={
                        campos[`ajustes.avulsos.${i}.descricao`] ? `avulso-erro-${i}` : undefined
                      }
                      onChange={(e) => {
                        setCamposSalvar(
                          ({ [`ajustes.avulsos.${i}.descricao`]: _, ...resto }) => resto,
                        );
                        mudar({ descricao: e.target.value });
                      }}
                    />
                    {campos[`ajustes.avulsos.${i}.descricao`] && (
                      <p
                        id={`avulso-erro-${i}`}
                        role="alert"
                        className="text-destructive mt-1 text-xs"
                      >
                        {campos[`ajustes.avulsos.${i}.descricao`]}
                      </p>
                    )}
                  </div>
                  <Input
                    aria-label={`Quantidade do item ${i + 1}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="col-span-2"
                    value={item.quantidade}
                    onChange={(e) =>
                      mudar({ quantidade: Math.max(1, parseInt(e.target.value || '1', 10)) })
                    }
                  />
                  <div className="col-span-3">
                    <CampoDinheiro
                      id={`avulso-valor-${i}`}
                      aria-label={`Valor unitário do item ${i + 1}`}
                      valor={item.valorUnitarioCentavos}
                      onChange={(c) => mudar({ valorUnitarioCentavos: c ?? 0 })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-span-1"
                    aria-label={`Remover item ${i + 1}`}
                    onClick={() => ajustar({ avulsos: ajustes.avulsos.filter((_, j) => j !== i) })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            disabled={ajustes.avulsos.length >= 30}
            onClick={() =>
              ajustar({
                avulsos: [
                  ...ajustes.avulsos,
                  { descricao: '', quantidade: 1, valorUnitarioCentavos: 0 },
                ],
              })
            }
          >
            <Plus aria-hidden />
            Item avulso
          </Button>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Desconto</legend>
          <div className="flex gap-2">
            <div className="rounded-control flex shrink-0 border p-0.5" role="radiogroup">
              {(['percentual', 'valor'] as const).map((tipo) => {
                const marcado = (ajustes.desconto?.tipo ?? 'percentual') === tipo;
                return (
                  <button
                    key={tipo}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    onClick={() =>
                      ajustar({
                        desconto:
                          tipo === 'percentual' ? { tipo, bp: 0 } : { tipo: 'valor', centavos: 0 },
                      })
                    }
                    className={`min-h-10 rounded-md px-3 text-sm font-semibold ${marcado ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    {tipo === 'percentual' ? '%' : 'R$'}
                  </button>
                );
              })}
            </div>
            <div className="min-w-0 flex-1">
              {ajustes.desconto?.tipo === 'valor' ? (
                <CampoDinheiro
                  id="desconto"
                  aria-label="Desconto em reais"
                  valor={ajustes.desconto.centavos || null}
                  onChange={(c) => ajustar({ desconto: c ? { tipo: 'valor', centavos: c } : null })}
                  invalido={!!erroDesconto}
                />
              ) : (
                <CampoPercentual
                  id="desconto"
                  aria-label="Desconto em porcentagem"
                  valor={
                    ajustes.desconto?.tipo === 'percentual' ? ajustes.desconto.bp || null : null
                  }
                  onChange={(bp) => ajustar({ desconto: bp ? { tipo: 'percentual', bp } : null })}
                  invalido={!!erroDesconto}
                />
              )}
            </div>
          </div>
          {erroDesconto ? (
            <p className="text-destructive mt-1 text-sm" role="alert">
              {erroDesconto}
            </p>
          ) : (
            !ehDono && (
              <p className="text-muted-foreground mt-1 text-sm">
                Seu limite de desconto: {formatBp(limiteDescontoBp)}
              </p>
            )
          )}
        </fieldset>
        {ajustes.desconto && (
          <Campo
            id="desconto-motivo"
            rotulo="Motivo do desconto (só a equipe vê)"
            erro={campos['ajustes.descontoMotivo']}
          >
            <Input
              id="desconto-motivo"
              value={ajustes.descontoMotivo}
              maxLength={200}
              onChange={(e) => ajustar({ descontoMotivo: e.target.value })}
            />
          </Campo>
        )}
        <Campo
          id="observacoes"
          rotulo="Observações para o cliente"
          dica="Aparecem na proposta e no PDF."
          erro={campos['ajustes.observacoes']}
        >
          <Textarea
            id="observacoes"
            rows={3}
            maxLength={1000}
            value={ajustes.observacoes}
            onChange={(e) => ajustar({ observacoes: e.target.value })}
          />
        </Campo>
        <Campo
          id="observacoes-internas"
          rotulo="Observações internas"
          dica="Só a equipe vê. Nunca vão para o cliente."
          erro={campos['ajustes.observacoesInternas']}
        >
          <Textarea
            id="observacoes-internas"
            rows={2}
            maxLength={1000}
            value={ajustes.observacoesInternas}
            onChange={(e) => ajustar({ observacoesInternas: e.target.value })}
          />
        </Campo>
      </Secao>

      {foraAntecedencia && (
        <div
          className="rounded-card border-alerta/30 bg-alerta/10 text-alerta flex flex-col gap-3 border p-4"
          data-testid="alerta-antecedencia"
        >
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            Esta data está dentro da antecedência mínima de {vitrine.antecedenciaMinDias} dias. O
            link público não aceitaria; confirme que a equipe consegue atender.
          </p>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              className="accent-primary size-5"
              checked={ajustes.foraAntecedencia}
              onChange={(e) => ajustar({ foraAntecedencia: e.target.checked })}
            />
            Ciente da antecedência
          </label>
        </div>
      )}

      {(erro || erroPrevia || outrosErros.length > 0 || camposSemLugar.length > 0) && (
        <div role="alert" className="text-destructive flex flex-col gap-1 text-sm font-semibold">
          {erro && <p>{erro}</p>}
          {erroPrevia && <p>{erroPrevia}</p>}
          {camposSemLugar.map(([chave, msg]) => (
            <p key={chave}>{msg}</p>
          ))}
          {outrosErros.map((e) => (
            <p key={e.codigo}>{e.mensagem}</p>
          ))}
        </div>
      )}

      {/* Resumo fixo: total do servidor e o botão de salvar */}
      <div className="bg-card fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:bottom-0 md:left-60">
        {resumoAberto && resultado?.ok && (
          <ul
            className="mx-auto max-h-[40dvh] max-w-2xl overflow-y-auto border-b px-4 py-2 text-sm"
            data-testid="linhas-resumo"
          >
            {resultado.linhas.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 py-1">
                <span className="min-w-0">{l.descricao}</span>
                <span className="shrink-0 font-semibold">{formatBRL(l.subtotalCentavos)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
            onClick={() => setResumoAberto((v) => !v)}
            disabled={!resultado?.ok}
            aria-expanded={resumoAberto}
          >
            <span className="min-w-0">
              <span className="text-muted-foreground block text-xs">
                {orcamento
                  ? `Nº ${String(orcamento.numero).padStart(4, '0')} · nova versão`
                  : 'Total'}
              </span>
              <span className="block text-lg font-extrabold" data-testid="total-interno">
                {resultado?.ok ? formatBRL(resultado.totalCentavos) : '—'}
              </span>
            </span>
            {calculando && (
              <Loader2
                className="text-muted-foreground size-4 animate-spin motion-reduce:animate-none"
                aria-label="Calculando"
              />
            )}
            {resultado?.ok && (
              <ChevronUp
                className={`size-4 transition-transform ${resumoAberto ? '' : 'rotate-180'}`}
                aria-hidden
              />
            )}
          </button>
          <Button type="submit" size="lg" disabled={!pronto || salvando || calculando}>
            {salvando && <Loader2 className="animate-spin" aria-hidden />}
            {orcamento ? 'Salvar nova versão' : 'Salvar orçamento'}
          </Button>
        </div>
      </div>
    </form>
  );
}
