import { asc, isNull } from 'drizzle-orm';
import type { Metadata } from 'next';
import { LinkTestarPrecos } from '@/components/app/empresa/link-testar-precos';
import { exigirSessao } from '@/server/auth/sessao';
import {
  ajustesDia,
  faixasDeslocamento,
  faixasIdade,
  feriados,
  regrasComerciais,
  turnos,
} from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { FormAgenda } from './form-agenda';
import { FormAjustes } from './form-ajustes';
import { FormCondicoes } from './form-condicoes';
import { FormCriancasEmpresa } from './form-criancas-empresa';
import { FormDeslocamento } from './form-deslocamento';
import { FormFeriados } from './form-feriados';

export const metadata: Metadata = { title: 'Preços e regras' };

export default async function RegrasPage() {
  const usuario = await exigirSessao();
  const somenteLeitura = usuario.perfil !== 'dono';
  const dados = await comUsuario(usuario.id, async (tx) => ({
    regras: (await tx.select().from(regrasComerciais))[0],
    ajustes: await tx.select().from(ajustesDia),
    feriados: await tx.select().from(feriados).orderBy(asc(feriados.data)),
    idades: await tx
      .select()
      .from(faixasIdade)
      .where(isNull(faixasIdade.pacoteId))
      .orderBy(asc(faixasIdade.idadeMin)),
    faixasKm: await tx.select().from(faixasDeslocamento).orderBy(asc(faixasDeslocamento.ateKm)),
    turnos: await tx
      .select({ id: turnos.id, nome: turnos.nome })
      .from(turnos)
      .orderBy(asc(turnos.ordem), asc(turnos.horaInicio)),
  }));
  const { regras } = dados;
  if (!regras) return <p>Regras da empresa não encontradas.</p>;

  // Ordem estável na tela: dia da semana (dom→sáb), feriado por último; geral antes de turno.
  const ajustesOrdenados = [...dados.ajustes].sort(
    (a, b) =>
      (a.diaSemana ?? 7) - (b.diaSemana ?? 7) ||
      Number(a.turnoId !== null) - Number(b.turnoId !== null),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Regras que o motor de preço aplica em todo orçamento.
        </p>
        {!somenteLeitura && <LinkTestarPrecos />}
      </div>
      <FormAjustes
        ajustes={ajustesOrdenados.map((a) => ({
          tipo: a.tipo,
          diaSemana: a.diaSemana,
          turnoId: a.turnoId,
          ajusteBp: a.ajusteBp,
        }))}
        turnos={dados.turnos}
        somenteLeitura={somenteLeitura}
      />
      <FormFeriados
        inicial={{ feriados: dados.feriados.map((f) => ({ data: f.data, nome: f.nome })) }}
        somenteLeitura={somenteLeitura}
      />
      <FormCriancasEmpresa
        inicial={dados.idades.map((f) => ({
          rotulo: f.rotulo,
          idadeMin: f.idadeMin,
          idadeMax: f.idadeMax,
          fatorBp: f.fatorBp,
        }))}
        somenteLeitura={somenteLeitura}
      />
      <FormDeslocamento
        inicial={{
          modelo: regras.deslocamentoModelo,
          kmGratis: regras.deslocamentoKmGratis,
          valorKmCentavos: regras.deslocamentoValorKmCentavos,
          faixas: dados.faixasKm.map((f) => ({ ateKm: f.ateKm, valorCentavos: f.valorCentavos })),
        }}
        somenteLeitura={somenteLeitura}
      />
      <FormAgenda
        inicial={{ intervaloEntreEventosMin: regras.intervaloEntreEventosMin }}
        somenteLeitura={somenteLeitura}
      />
      <FormCondicoes
        inicial={{
          validadeDias: regras.validadeDias,
          prazoPreReservaHoras: regras.prazoPreReservaHoras,
          antecedenciaMinDias: regras.antecedenciaMinDias,
          sinalBp: regras.sinalBp,
          parcelasMax: regras.parcelasMax,
          prazoUltimaParcelaDias: regras.prazoUltimaParcelaDias,
          formasPagamento: regras.formasPagamento,
          condicoesTexto: regras.condicoesTexto,
          naoInclusoTexto: regras.naoInclusoTexto,
          cancelamentoTexto: regras.cancelamentoTexto,
          alteracaoConvidadosTexto: regras.alteracaoConvidadosTexto,
          modoExibicaoPreco: regras.modoExibicaoPreco,
          ajusteIncide: regras.ajusteIncide,
        }}
        somenteLeitura={somenteLeitura}
      />
    </div>
  );
}
