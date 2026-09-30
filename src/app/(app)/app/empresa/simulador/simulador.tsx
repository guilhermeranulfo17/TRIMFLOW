'use client';

import { useMemo, useState, useTransition } from 'react';
import { AvisoForm } from '@/components/auth/aviso-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { tentarParseBRL } from '@/domain/money';
import { percentualTextoParaBp } from '@/domain/percent';
import {
  opcionaisDisponiveis,
  pacotesDisponiveis,
  turnosDoDia,
} from '@/domain/preco/disponibilidade';
import type { ContextoPreco, Desconto, ResultadoOrcamento } from '@/domain/preco/tipos';
import { cn } from '@/lib/utils';
import { simularOrcamento, type EntradaSimulador } from '@/server/actions/simulador';
import { ResultadoSimulacao } from './resultado';

const campo =
  'h-11 w-full min-w-0 rounded-control border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';

function Campo({
  id,
  rotulo,
  children,
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      {children}
    </div>
  );
}

const inteiro = (texto: string) => {
  const n = Number.parseInt(texto, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const ROTULO_COBRANCA = {
  por_pessoa: 'por convidado',
  fixo: 'valor fixo',
  por_unidade: 'por unidade',
  por_hora: 'por hora',
} as const;

export function Simulador({
  contexto,
  dataInicial,
}: {
  contexto: ContextoPreco;
  dataInicial: string;
}) {
  const tiposAtivos = contexto.tiposEvento.filter((t) => t.ativo);
  const espacosAtivos = contexto.espacos.filter((e) => e.ativo);
  const faixasEmpresa = contexto.faixasIdade.filter((f) => f.pacoteId === null);

  const [canal, setCanal] = useState<'interno' | 'publico'>('interno');
  const [tipoEventoId, setTipoEventoId] = useState(tiposAtivos[0]?.id ?? '');
  const [data, setData] = useState(dataInicial);
  const [turnoId, setTurnoId] = useState(contexto.turnos.find((t) => t.ativo)?.id ?? '');
  const [espacoId, setEspacoId] = useState(espacosAtivos[0]?.id ?? '');
  const [adultos, setAdultos] = useState('50');
  const [criancas, setCriancas] = useState<Record<string, string>>({});
  const [pacoteId, setPacoteId] = useState(contexto.pacotes.find((p) => p.ativo)?.id ?? '');
  const [opcionais, setOpcionais] = useState<Record<string, string>>({});
  const [horasExtras, setHorasExtras] = useState('0');
  const [distanciaKm, setDistanciaKm] = useState('');
  const [descontoTipo, setDescontoTipo] = useState<'nenhum' | 'percentual' | 'valor'>('nenhum');
  const [descontoTexto, setDescontoTexto] = useState('');

  const [resultado, setResultado] = useState<ResultadoOrcamento>();
  const [erro, setErro] = useState<string>();
  const [calculando, iniciar] = useTransition();

  const turnos = useMemo(() => {
    const doDia = turnosDoDia(contexto, data);
    return doDia.length > 0 ? doDia : contexto.turnos.filter((t) => t.ativo);
  }, [contexto, data]);
  const pacotes = pacotesDisponiveis(contexto, { tipoEventoId });
  const extras = opcionaisDisponiveis(contexto, { pacoteId, tipoEventoId });
  const espaco = contexto.espacos.find((e) => e.id === espacoId);
  const pedeKm = !!espaco?.noLocalDoCliente && contexto.regras.deslocamentoModelo !== 'nenhum';

  function montarEntrada(): EntradaSimulador | string {
    let desconto: Desconto | undefined;
    if (descontoTipo === 'percentual') {
      try {
        desconto = {
          tipo: 'percentual',
          bp: percentualTextoParaBp(descontoTexto.replace(',', '.') || '0'),
        };
      } catch {
        return 'Informe o desconto em %, por exemplo 5 ou 7,5.';
      }
    } else if (descontoTipo === 'valor') {
      const centavos = tentarParseBRL(descontoTexto || '0');
      if (centavos === null || centavos < 0)
        return 'Informe o desconto em reais, por exemplo 150,00.';
      desconto = { tipo: 'valor', centavos };
    }
    const km = distanciaKm.replace(',', '.');
    return {
      canal,
      tipoEventoId,
      data,
      turnoId,
      espacoId,
      pacoteId,
      adultos: inteiro(adultos),
      criancas: faixasEmpresa
        .map((f) => ({ faixaIdadeId: f.id, quantidade: inteiro(criancas[f.id] ?? '0') }))
        .filter((c) => c.quantidade > 0),
      opcionais: extras
        .map((o) => ({ opcionalId: o.id, quantidade: inteiro(opcionais[o.id] ?? '0') }))
        .filter((o) => o.quantidade > 0),
      horasExtras: Math.min(inteiro(horasExtras), 24),
      distanciaKm: pedeKm && km !== '' && Number.isFinite(Number(km)) ? Number(km) : undefined,
      desconto,
    };
  }

  function calcular(e: React.FormEvent) {
    e.preventDefault();
    setErro(undefined);
    const entrada = montarEntrada();
    if (typeof entrada === 'string') {
      setErro(entrada);
      return;
    }
    iniciar(async () => {
      const r = await simularOrcamento(entrada);
      if (r.ok) setResultado(r.resultado);
      else setErro(r.erro);
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg">Festa</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={calcular} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="sim-canal" rotulo="Canal">
                <select
                  id="sim-canal"
                  className={campo}
                  value={canal}
                  onChange={(e) => setCanal(e.target.value as 'interno' | 'publico')}
                >
                  <option value="interno">Interno (equipe)</option>
                  <option value="publico">Público (link do cliente)</option>
                </select>
              </Campo>
              <Campo id="sim-tipo" rotulo="Tipo de festa">
                <select
                  id="sim-tipo"
                  className={campo}
                  value={tipoEventoId}
                  onChange={(e) => setTipoEventoId(e.target.value)}
                >
                  {tiposAtivos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="sim-data" rotulo="Data">
                <input
                  id="sim-data"
                  type="date"
                  className={campo}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </Campo>
              <Campo id="sim-turno" rotulo="Turno">
                <select
                  id="sim-turno"
                  className={campo}
                  value={turnoId}
                  onChange={(e) => setTurnoId(e.target.value)}
                >
                  {!turnos.some((t) => t.id === turnoId) && (
                    <option value={turnoId}>Escolha um turno</option>
                  )}
                  {turnos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} ({t.horaInicio})
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="sim-espaco" rotulo="Espaço">
                <select
                  id="sim-espaco"
                  className={campo}
                  value={espacoId}
                  onChange={(e) => setEspacoId(e.target.value)}
                >
                  {espacosAtivos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome} (até {e.capacidadeMax} pessoas)
                    </option>
                  ))}
                </select>
              </Campo>
              {pedeKm && (
                <Campo id="sim-km" rotulo="Distância até o local (km)">
                  <input
                    id="sim-km"
                    inputMode="decimal"
                    className={campo}
                    value={distanciaKm}
                    onChange={(e) => setDistanciaKm(e.target.value)}
                  />
                </Campo>
              )}
            </div>

            <fieldset className="rounded-control space-y-3 border p-3">
              <legend className="px-1 text-sm font-semibold">Convidados</legend>
              <div className="grid grid-cols-2 gap-3">
                <Campo id="sim-adultos" rotulo="Adultos">
                  <input
                    id="sim-adultos"
                    inputMode="numeric"
                    className={campo}
                    value={adultos}
                    onChange={(e) => setAdultos(e.target.value)}
                  />
                </Campo>
                {faixasEmpresa.map((f) => (
                  <Campo key={f.id} id={`sim-crianca-${f.id}`} rotulo={`Crianças ${f.rotulo}`}>
                    <input
                      id={`sim-crianca-${f.id}`}
                      inputMode="numeric"
                      className={campo}
                      value={criancas[f.id] ?? ''}
                      placeholder="0"
                      onChange={(e) => setCriancas({ ...criancas, [f.id]: e.target.value })}
                    />
                  </Campo>
                ))}
              </div>
            </fieldset>

            <Campo id="sim-pacote" rotulo="Pacote">
              <select
                id="sim-pacote"
                className={campo}
                value={pacoteId}
                onChange={(e) => setPacoteId(e.target.value)}
              >
                {!pacotes.some((p) => p.pacote.id === pacoteId) && (
                  <option value={pacoteId}>Escolha um pacote</option>
                )}
                {pacotes.map(({ pacote }) => (
                  <option key={pacote.id} value={pacote.id}>
                    {pacote.nome}
                    {pacote.destaque ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </Campo>

            {extras.length > 0 && (
              <fieldset className="rounded-control space-y-3 border p-3">
                <legend className="px-1 text-sm font-semibold">Opcionais (quantidade)</legend>
                {extras.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3">
                    <label htmlFor={`sim-opcional-${o.id}`} className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{o.nome}</span>
                      <span className="text-muted-foreground block text-xs">
                        {ROTULO_COBRANCA[o.cobranca]}
                      </span>
                    </label>
                    <input
                      id={`sim-opcional-${o.id}`}
                      inputMode="numeric"
                      className={cn(campo, 'w-20 shrink-0')}
                      value={opcionais[o.id] ?? ''}
                      placeholder="0"
                      onChange={(e) => setOpcionais({ ...opcionais, [o.id]: e.target.value })}
                    />
                  </div>
                ))}
              </fieldset>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="sim-horas" rotulo="Horas extras">
                <input
                  id="sim-horas"
                  inputMode="numeric"
                  className={campo}
                  value={horasExtras}
                  onChange={(e) => setHorasExtras(e.target.value)}
                />
              </Campo>
              <Campo id="sim-desconto-tipo" rotulo="Desconto">
                <select
                  id="sim-desconto-tipo"
                  className={campo}
                  value={descontoTipo}
                  onChange={(e) =>
                    setDescontoTipo(e.target.value as 'nenhum' | 'percentual' | 'valor')
                  }
                >
                  <option value="nenhum">Sem desconto</option>
                  <option value="percentual">Em %</option>
                  <option value="valor">Em R$</option>
                </select>
              </Campo>
              {descontoTipo !== 'nenhum' && (
                <Campo
                  id="sim-desconto"
                  rotulo={descontoTipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'}
                >
                  <input
                    id="sim-desconto"
                    inputMode="decimal"
                    className={campo}
                    value={descontoTexto}
                    onChange={(e) => setDescontoTexto(e.target.value)}
                  />
                </Campo>
              )}
            </div>

            {erro && <AvisoForm tipo="erro">{erro}</AvisoForm>}
            <Button type="submit" className="w-full" disabled={calculando}>
              {calculando ? 'Calculando…' : 'Calcular preço'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ResultadoSimulacao resultado={resultado} />
    </div>
  );
}
