import { diaDaSemanaNumero, somarDias, type DataCivil } from '../dates';
import { calcularOrcamento, pacotesDisponiveis, type ContextoPreco } from '../preco';
import { entradaDoMotor } from '../publico/previa';
import type { Escolhas } from '../publico/tipos';

/**
 * Festa de exemplo para "Ver como fica minha proposta" (nada é gravado): primeiro tipo de festa
 * com pacote, o pacote em destaque (ou o primeiro), um sábado depois da antecedência (ou o
 * primeiro dia com horário) e convidados dentro dos limites do pacote. Null se o catálogo
 * ainda não permite um orçamento válido.
 */
export function escolhasDeExemplo(ctx: ContextoPreco, hoje: DataCivil): Escolhas | null {
  const turnos = ctx.turnos.filter((t) => t.ativo).sort((a, b) => a.ordem - b.ordem);
  const espacos = ctx.espacos.filter((e) => e.ativo);
  const espaco = espacos.find((e) => !e.noLocalDoCliente) ?? espacos[0];
  if (!espaco || turnos.length === 0) return null;

  const inicio = somarDias(hoje, Math.max(ctx.regras.antecedenciaMinDias, 30));
  const dias = Array.from({ length: 14 }, (_, i) => somarDias(inicio, i));
  const comTurno = (d: DataCivil) =>
    turnos.some((t) => t.diasSemana.includes(diaDaSemanaNumero(d)));
  const data =
    dias.find((d) => diaDaSemanaNumero(d) === 6 && comTurno(d)) ?? dias.find(comTurno) ?? null;
  if (!data) return null;
  const turno = turnos.find((t) => t.diasSemana.includes(diaDaSemanaNumero(data)))!;

  for (const tipo of ctx.tiposEvento.filter((t) => t.ativo)) {
    const pacotes = pacotesDisponiveis(ctx, { tipoEventoId: tipo.id })
      .map((p) => p.pacote)
      .sort((a, b) => Number(b.destaque) - Number(a.destaque) || a.ordem - b.ordem);
    for (const pacote of pacotes) {
      const teto = Math.min(pacote.maxConvidados ?? 50, espaco.capacidadeMax);
      const adultos = Math.max(pacote.minConvidados, Math.min(50, teto));
      const escolhas: Escolhas = {
        tipoEventoId: tipo.id,
        data,
        turnoId: turno.id,
        espacoId: espaco.id,
        adultos,
        criancas: [],
        pacoteId: pacote.id,
        opcionais: [],
        horasExtras: 0,
      };
      const entrada = entradaDoMotor(ctx, escolhas, hoje);
      if (entrada && calcularOrcamento(ctx, entrada).ok) return escolhas;
    }
  }
  return null;
}
