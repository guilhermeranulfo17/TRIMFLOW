'use client';

import { useState, useTransition } from 'react';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import {
  aplicarCupomInterno,
  criarImplantacaoInterna,
  entrarComoEmpresa,
  estenderTeste,
  isentarEmpresa,
  mudarPlanoInterno,
  reativarEmpresa,
  sairInterno,
  suspenderEmpresa,
  type ResultadoInterno,
} from '@/server/actions/interno';

const BOTAO = 'rounded-control min-h-11 border px-4 text-sm font-semibold disabled:opacity-60';

export function BotaoSairInterno() {
  return (
    <form action={sairInterno}>
      <button type="submit" className={BOTAO}>
        Sair
      </button>
    </form>
  );
}

type Props = {
  empresaId: string;
  suspensaManual: boolean;
  isenta: boolean;
  suporteLiberado: boolean;
  temAssinatura: boolean;
};

/** Ações da equipe na ficha da empresa (todas registradas em auditoria_interna). */
export function AcoesEmpresa({
  empresaId,
  suspensaManual,
  isenta,
  suporteLiberado,
  temAssinatura,
}: Props) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [dias, setDias] = useState('7');
  const [cupom, setCupom] = useState('');
  const [motivo, setMotivo] = useState('');
  const [plano, setPlano] = useState('profissional');
  const [ciclo, setCiclo] = useState('mensal');

  const rodar = (fn: () => Promise<ResultadoInterno | undefined>) =>
    iniciar(async () => {
      const r = await fn();
      if (!r) return;
      if (r.ok) {
        toast.sucesso(r.mensagem);
        if (r.url) window.open(r.url, '_blank', 'noopener');
      } else toast.erro(r.erro);
    });

  return (
    <div className="flex flex-col gap-5" data-testid="acoes-empresa">
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Acesso de suporte</h3>
        {suporteLiberado ? (
          <button
            type="button"
            disabled={pendente}
            className={`${BOTAO} border-erro/40 bg-erro/10 text-erro`}
            onClick={() => rodar(() => entrarComoEmpresa(empresaId))}
            data-testid="entrar-como-empresa"
          >
            Entrar como esta empresa
          </button>
        ) : (
          <p className="text-muted-foreground text-sm">
            O dono não liberou o acesso. Ele libera em Minha empresa → Plano → Suporte.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Estender teste (dias)
          <input
            className={`${classeCampo} w-24`}
            inputMode="numeric"
            value={dias}
            onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button
          type="button"
          disabled={pendente}
          className={BOTAO}
          onClick={() => rodar(() => estenderTeste(empresaId, Number(dias)))}
        >
          Estender
        </button>
      </div>

      {temAssinatura && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Cupom
            <input
              className={`${classeCampo} w-40 uppercase`}
              value={cupom}
              onChange={(e) => setCupom(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={pendente || !cupom}
            className={BOTAO}
            onClick={() => rodar(() => aplicarCupomInterno(empresaId, cupom))}
          >
            Aplicar cupom
          </button>
        </div>
      )}

      {temAssinatura && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Plano
            <select
              className={`${classeCampo} w-40`}
              value={plano}
              onChange={(e) => setPlano(e.target.value)}
            >
              <option value="essencial">Essencial</option>
              <option value="profissional">Profissional</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Ciclo
            <select
              className={`${classeCampo} w-32`}
              value={ciclo}
              onChange={(e) => setCiclo(e.target.value)}
            >
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
          </label>
          <button
            type="button"
            disabled={pendente}
            className={BOTAO}
            onClick={() => rodar(() => mudarPlanoInterno(empresaId, plano, ciclo))}
          >
            Mudar plano
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendente}
          className={BOTAO}
          onClick={() => rodar(() => criarImplantacaoInterna(empresaId))}
        >
          Cobrar implantação (R$ 497)
        </button>
        <button
          type="button"
          disabled={pendente}
          className={BOTAO}
          onClick={() => rodar(() => isentarEmpresa(empresaId, !isenta))}
        >
          {isenta ? 'Remover cortesia' : 'Marcar como cortesia'}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {suspensaManual ? (
          <button
            type="button"
            disabled={pendente}
            className={BOTAO}
            onClick={() => rodar(() => reativarEmpresa(empresaId))}
          >
            Reativar
          </button>
        ) : (
          <>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Motivo da suspensão
              <input
                className={classeCampo}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={pendente || motivo.trim().length < 3}
              className={`${BOTAO} border-erro/40 text-erro`}
              onClick={() => rodar(() => suspenderEmpresa(empresaId, motivo))}
            >
              Suspender
            </button>
          </>
        )}
      </div>
    </div>
  );
}
