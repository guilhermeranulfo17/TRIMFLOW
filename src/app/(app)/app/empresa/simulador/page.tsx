import { Calculator, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { compararDatas, diaDaSemanaNumero, hojeNoFuso, somarDias } from '@/domain/dates';
import { AcessoNegadoError, exigirPerfil } from '@/server/auth/guards';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { carregarContexto } from '@/server/catalogo/carregar';
import { BotaoCarregarModelo } from './botao-carregar-modelo';
import { Simulador } from './simulador';

export const metadata: Metadata = { title: 'Simulador de preço' };

/** Próximo sábado a partir da antecedência mínima: uma data que costuma ser válida. */
function dataSugerida(hoje: string, antecedenciaDias: number): string {
  let data = somarDias(hoje, antecedenciaDias);
  while (diaDaSemanaNumero(data) !== 6) data = somarDias(data, 1);
  return compararDatas(data, hoje) >= 0 ? data : hoje;
}

export default async function SimuladorPage() {
  let dono: UsuarioAtual;
  try {
    dono = await exigirPerfil('dono');
  } catch (erro) {
    if (!(erro instanceof AcessoNegadoError)) throw erro;
    return (
      <>
        <EmptyState icone={Lock} titulo="Acesso restrito">
          Só o dono do buffet pode usar o simulador de preço.
        </EmptyState>
      </>
    );
  }

  const contexto = await carregarContexto(dono.id);
  const cabecalho = (
    <div className="mb-6">
      <h2 className="text-xl font-bold">Simulador de preço</h2>
      <p className="text-muted-foreground text-sm">
        Ferramenta de conferência: monte uma festa e veja exatamente como o preço é calculado.
      </p>
    </div>
  );

  if (!contexto || contexto.pacotes.length === 0) {
    return (
      <>
        {cabecalho}
        <EmptyState icone={Calculator} titulo="Seu catálogo ainda está vazio">
          <p>
            Carregue um modelo de exemplo do seu segmento, com pacotes, opcionais, turnos e regras,
            para testar o simulador. Os preços são exemplos e poderão ser editados na próxima versão
            do Orkestra.
          </p>
          <div className="mt-5">
            <BotaoCarregarModelo />
          </div>
        </EmptyState>
      </>
    );
  }

  const hoje = hojeNoFuso(dono.empresa.fuso);
  return (
    <>
      {cabecalho}
      <Simulador
        contexto={contexto}
        dataInicial={dataSugerida(hoje, contexto.regras.antecedenciaMinDias)}
      />
    </>
  );
}
