'use client';

import { CalendarCheck, CheckCircle2, Download, Eye, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { diaDaSemana, formatData, formatDataHora } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import {
  MENSAGEM_SEM_SUGESTOES,
  MENSAGEM_SLOT_INDISPONIVEL,
  type Sugestao,
} from '@/domain/publico/sugestoes';
import {
  linkWhatsApp,
  mensagemDuvida,
  mensagemPreReserva,
  type ResumoMensagem,
} from '@/domain/publico/whatsapp';
import {
  atualizarPrecos,
  escolherOutraData,
  pedirVisita,
  preReservar,
  registrarWhatsapp,
} from '@/server/actions/publico';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/publico/marca';

type Estado = 'aberta' | 'reservada' | 'expirada' | 'suspensa';

type Props = {
  slug: string;
  token: string;
  buffet: { nome: string; whatsappE164: string | null };
  estado: Estado;
  expiraEm: string | null;
  hoje: string;
  resumo: ResumoMensagem;
  sinalCentavos: number;
  turno: { nome: string; horaInicio: string } | null;
};

const CAMPO =
  'mt-1 h-12 w-full rounded-control border px-3 text-base focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/** Botões da proposta: reservar, visitar e tirar dúvidas no WhatsApp. */
export function AcoesProposta(p: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>(p.estado);
  const [expiraEm, setExpiraEm] = useState(p.expiraEm);
  const [simulada, setSimulada] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [visita, setVisita] = useState<'fechada' | 'aberta' | 'enviada'>('fechada');
  const [dataVisita, setDataVisita] = useState('');
  const [periodo, setPeriodo] = useState<'manha' | 'tarde' | 'noite' | ''>('');
  const [obs, setObs] = useState('');
  const [pendente, iniciar] = useTransition();

  const whatsapp = p.buffet.whatsappE164;
  const linkDuvida = whatsapp
    ? linkWhatsApp(whatsapp, mensagemDuvida(p.buffet.nome, p.resumo))
    : null;

  function reservar() {
    setErro(null);
    iniciar(async () => {
      const r = await preReservar(p.slug, p.token);
      if (!r.ok) {
        setErro(r.erro);
        if (r.codigo === 'ORCAMENTO_EXPIRADO') setEstado('expirada');
        return;
      }
      if ('atualizada' in r.dados) {
        router.replace(`/b/${p.slug}/proposta/${r.dados.token}?atualizada=1`);
        return;
      }
      if (r.dados.reservado) {
        setEstado('reservada');
        setExpiraEm(r.dados.expiraEm);
        setSimulada(r.dados.simulada);
        router.refresh();
      } else {
        setSugestoes(r.dados.sugestoes);
      }
    });
  }

  function outraData(s: Sugestao) {
    setErro(null);
    iniciar(async () => {
      const r = await escolherOutraData(p.slug, p.token, s);
      if (r.ok) router.push(`/b/${p.slug}/proposta/${r.dados.token}`);
      else setErro(r.erro);
    });
  }

  function refazer() {
    setErro(null);
    iniciar(async () => {
      const r = await atualizarPrecos(p.slug, p.token);
      if (r.ok) {
        router.push(`/b/${p.slug}/proposta/${r.dados.token}`);
        return;
      }
      if (r.codigo === 'DATA_IMPOSSIVEL') {
        // escolhas pré-preenchidas no wizard (o cookie aponta para este orçamento)
        router.push(`/b/${p.slug}/orcamento?passo=2`);
        return;
      }
      setErro(r.erro);
    });
  }

  function enviarVisita(e: React.FormEvent) {
    e.preventDefault();
    if (!dataVisita || !periodo) {
      setErro('Escolha a data e o período da visita.');
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await pedirVisita(p.slug, p.token, {
        dataPreferida: dataVisita,
        periodo,
        observacoes: obs || undefined,
      });
      if (r.ok) setVisita('enviada');
      else setErro(r.erro);
    });
  }

  const botaoWhatsApp = linkDuvida && (
    <a
      href={linkDuvida}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void registrarWhatsapp(p.slug, p.token)}
      className={`${BOTAO_SECUNDARIO} w-full`}
    >
      <IconeWhatsApp />
      Tirar dúvidas no WhatsApp
    </a>
  );

  const botaoPdf = (
    <a
      href={`/b/${p.slug}/proposta/${p.token}/pdf`}
      className={`${BOTAO_SECUNDARIO} w-full`}
      data-testid="baixar-pdf"
      download
    >
      <Download className="size-5" aria-hidden />
      Baixar PDF
    </a>
  );

  if (estado === 'expirada') {
    return (
      <section className="mt-6 flex flex-col gap-3" aria-live="polite">
        {erro && (
          <p role="alert" className="text-destructive font-semibold">
            {erro}
          </p>
        )}
        <button
          type="button"
          onClick={refazer}
          disabled={pendente}
          className={`${BOTAO_PRINCIPAL} w-full`}
        >
          <RotateCcw className="size-5" aria-hidden />
          {pendente ? 'Atualizando…' : 'Atualizar com os preços de hoje'}
        </button>
        {botaoWhatsApp}
        {botaoPdf}
      </section>
    );
  }

  if (estado === 'reservada') {
    return (
      <section className="mt-6 flex flex-col gap-3" aria-live="polite" data-testid="pre-reserva-ok">
        <div className="rounded-card border-2 border-emerald-600 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-lg font-bold text-emerald-900">
            <CheckCircle2 className="size-6" aria-hidden />
            {simulada ? 'Pré-reserva simulada (modo teste)' : 'Data pré-reservada!'}
          </p>
          <p className="mt-1 text-emerald-900">
            {simulada
              ? 'Em modo teste nada é gravado na agenda.'
              : `Guardamos esta data para você${expiraEm ? ` até ${formatDataHora(expiraEm)}` : ''}. Para confirmar, combine o sinal${p.sinalCentavos > 0 ? ` de ${formatBRL(p.sinalCentavos)}` : ''} com o buffet.`}
          </p>
        </div>
        {whatsapp && (
          <a
            href={linkWhatsApp(whatsapp, mensagemPreReserva(p.buffet.nome, p.resumo))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void registrarWhatsapp(p.slug, p.token)}
            className={`${BOTAO_PRINCIPAL} w-full`}
          >
            <IconeWhatsApp />
            Combinar o sinal no WhatsApp
          </a>
        )}
        {botaoPdf}
      </section>
    );
  }

  return (
    <section className="mt-6 flex flex-col gap-3">
      {erro && (
        <p role="alert" className="text-destructive font-semibold">
          {erro}
        </p>
      )}
      {sugestoes && (
        <div
          className="rounded-card border-2 border-amber-500 bg-amber-50 p-4"
          role="alert"
          data-testid="sugestoes"
        >
          <p className="font-bold text-amber-900">
            {sugestoes.length > 0 ? MENSAGEM_SLOT_INDISPONIVEL : MENSAGEM_SEM_SUGESTOES}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {sugestoes.map((s) => (
              <button
                key={`${s.data}-${s.turnoId}`}
                type="button"
                disabled={pendente}
                onClick={() => outraData(s)}
                className={`${BOTAO_SECUNDARIO} w-full justify-start`}
                data-testid="sugestao"
              >
                <CalendarCheck className="size-5" aria-hidden />
                {diaDaSemana(s.data)}, {formatData(s.data)}
                {p.turno ? ` · ${p.turno.nome} (${p.turno.horaInicio})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      {estado === 'aberta' && !sugestoes && (
        <button
          type="button"
          onClick={reservar}
          disabled={pendente}
          className={`${BOTAO_PRINCIPAL} w-full`}
        >
          <CalendarCheck className="size-5" aria-hidden />
          {pendente ? 'Reservando…' : 'Quero reservar esta data'}
        </button>
      )}
      {visita === 'fechada' && (
        <button
          type="button"
          onClick={() => setVisita('aberta')}
          className={`${BOTAO_SECUNDARIO} w-full`}
        >
          <Eye className="size-5" aria-hidden />
          Quero visitar o espaço
        </button>
      )}
      {visita === 'aberta' && (
        <form onSubmit={enviarVisita} className="rounded-card border p-4" aria-label="Pedir visita">
          <h2 className="font-bold">Quando você quer visitar?</h2>
          <label htmlFor="data-visita" className="mt-3 block font-semibold">
            Data preferida
          </label>
          <input
            id="data-visita"
            type="date"
            min={p.hoje}
            value={dataVisita}
            onChange={(e) => setDataVisita(e.target.value)}
            className={CAMPO}
          />
          <fieldset className="mt-3">
            <legend className="font-semibold">Período</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(
                [
                  ['manha', 'Manhã'],
                  ['tarde', 'Tarde'],
                  ['noite', 'Noite'],
                ] as const
              ).map(([valor, rotulo]) => (
                <label
                  key={valor}
                  className={`rounded-control flex min-h-12 cursor-pointer items-center justify-center border-2 font-semibold ${periodo === valor ? 'border-primary bg-accent' : ''}`}
                >
                  <input
                    type="radio"
                    name="periodo"
                    value={valor}
                    checked={periodo === valor}
                    onChange={() => setPeriodo(valor)}
                    className="sr-only"
                  />
                  {rotulo}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="obs-visita" className="mt-3 block font-semibold">
            Observações (opcional)
          </label>
          <textarea
            id="obs-visita"
            value={obs}
            maxLength={500}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            className={`${CAMPO} h-auto py-2`}
          />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRINCIPAL} mt-3 w-full`}>
            Pedir visita
          </button>
        </form>
      )}
      {visita === 'enviada' && (
        <p className="rounded-card border p-4 font-semibold" role="status">
          Pedido de visita enviado! O buffet vai confirmar com você pelo WhatsApp.
        </p>
      )}
      {botaoWhatsApp}
      {botaoPdf}
    </section>
  );
}
