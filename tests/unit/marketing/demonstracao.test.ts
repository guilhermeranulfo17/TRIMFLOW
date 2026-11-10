import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIAS_TESTE_GRATIS } from '@/domain/cobranca/precos';
import { diaDaSemanaNumero } from '@/domain/dates';
import {
  comConvidados,
  diaCurtoDoPedido,
  montarExemploDemonstracao,
  NOME_BUFFET_EXEMPLO,
  pedidoDaDemonstracao,
  previaDaDemonstracao,
  proximoSabado,
} from '@/domain/marketing';
import { contextoDoModelo, MODELOS } from '@/domain/modelos';
import { calcularOrcamento } from '@/domain/preco';
import { pessoas } from '@/domain/publico';

const HOJE = '2026-10-03';
const ex = montarExemploDemonstracao(contextoDoModelo(MODELOS.infantil), HOJE);
const nomeDoExtra = (id: string) => ex.vitrine.opcionais.find((o) => o.id === id)!.nome;

describe('demonstração da landing (Buffet Exemplo)', () => {
  it('monta a festa de exemplo: sábado à tarde, 50 convidados e o pacote em destaque', () => {
    expect(ex.buffet).toBe(NOME_BUFFET_EXEMPLO);
    expect(diaDaSemanaNumero(ex.inicial.data!)).toBe(6);
    expect(ex.inicial.data! > HOJE).toBe(true);
    expect(pessoas(ex.inicial)).toBe(50);
    expect(ex.vitrine.tiposEvento).toHaveLength(1);
    expect(ex.vitrine.pacotes.map((p) => p.nome)).toEqual(['Alegria', 'Super', 'Encanto']);
    expect(ex.vitrine.pacotes.find((p) => p.id === ex.inicial.pacoteId)?.nome).toBe('Super');
    expect(ex.convidados).toEqual({ min: 15, max: 120, passo: 10 });
    // poucos extras e sem hora extra: a demonstração cabe numa tela de celular
    expect(ex.vitrine.opcionais.length).toBeGreaterThan(0);
    expect(ex.vitrine.opcionais.length).toBeLessThanOrEqual(3);
    expect(ex.contexto.pacotes.every((p) => p.valorHoraExtraCentavos === 0)).toBe(true);
  });

  it('a prévia é a do link público: total de cada pacote e o total da escolha, do mesmo motor', () => {
    for (let n = ex.convidados.min; n <= ex.convidados.max; n += 5) {
      for (const pacote of ex.vitrine.pacotes) {
        const e = { ...comConvidados(ex, ex.inicial, n), pacoteId: pacote.id };
        const previa = previaDaDemonstracao(ex, e);
        const motor = calcularOrcamento(ex.contexto, {
          canal: 'publico',
          hoje: ex.hoje,
          tipoEventoId: e.tipoEventoId!,
          data: e.data!,
          turnoId: e.turnoId!,
          espacoId: e.espacoId!,
          adultos: n,
          criancas: [],
          pacoteId: pacote.id,
          opcionais: [],
          horasExtras: 0,
          limiteDescontoBp: 0,
        });
        expect(motor.ok).toBe(true);
        expect(previa.resultado).toEqual(motor);
        expect(previa.totalCentavos).toBe(motor.totalCentavos);
        // todos os pacotes continuam disponíveis e com valor dentro dos limites do exemplo
        expect(previa.pacotes).toHaveLength(3);
        expect(previa.pacotes.every((p) => p.disponivel && p.totalCentavos !== null)).toBe(true);
        expect(previa.pacotes.find((p) => p.id === pacote.id)?.totalCentavos).toBe(
          motor.totalCentavos,
        );
      }
    }
  });

  it('convidados, pacote e extra mudam o total', () => {
    const base = previaDaDemonstracao(ex, ex.inicial).totalCentavos!;
    expect(previaDaDemonstracao(ex, comConvidados(ex, ex.inicial, 80)).totalCentavos).not.toBe(
      base,
    );
    const outro = ex.vitrine.pacotes.find((p) => p.id !== ex.inicial.pacoteId)!;
    expect(previaDaDemonstracao(ex, { ...ex.inicial, pacoteId: outro.id }).totalCentavos).not.toBe(
      base,
    );
    const extra = previaDaDemonstracao(ex, ex.inicial).opcionais[0]!;
    const comExtra = {
      ...ex.inicial,
      opcionais: [{ opcionalId: extra.id, quantidade: 1 }],
    };
    expect(previaDaDemonstracao(ex, comExtra).totalCentavos).toBeGreaterThan(base);
  });

  it('convidados fora da faixa voltam para dentro dela', () => {
    expect(comConvidados(ex, ex.inicial, 3).adultos).toBe(ex.convidados.min);
    expect(comConvidados(ex, ex.inicial, 999).adultos).toBe(ex.convidados.max);
    expect(comConvidados(ex, ex.inicial, Number.NaN).adultos).toBe(ex.convidados.min);
  });

  it('o pedido leva o que o dono precisa: quem, quando, quantos, pacote, extras e valor', () => {
    const [a, b] = previaDaDemonstracao(ex, ex.inicial).opcionais;
    const e = {
      ...comConvidados(ex, ex.inicial, 60),
      opcionais: [
        { opcionalId: a!.id, quantidade: 1 },
        { opcionalId: b!.id, quantidade: 2 },
      ],
    };
    const previa = previaDaDemonstracao(ex, e);
    const pedido = pedidoDaDemonstracao(ex, e, previa);
    expect(pedido).toMatchObject({
      tipoEvento: 'Aniversário infantil',
      quando: `${diaCurtoDoPedido(e.data!)} · Tarde`,
      convidados: 60,
      pacote: 'Super',
      extras: [nomeDoExtra(a!.id), `2 × ${nomeDoExtra(b!.id)}`],
      totalCentavos: previa.totalCentavos,
      sinalCentavos: previa.resultado!.sinalCentavos,
    });
    expect(pedido.cliente.length).toBeGreaterThan(0);
    expect(pedido.totalCentavos).toBeGreaterThan(0);
  });

  it('página em cache ou aba antiga: a data do exemplo nunca fica no passado', () => {
    const velho = { ...ex, hoje: '2027-03-01' };
    const previa = previaDaDemonstracao(velho, ex.inicial);
    expect(previa.resultado?.ok).toBe(true);
    expect(pedidoDaDemonstracao(velho, ex.inicial, previa).quando).toBe(
      `${diaCurtoDoPedido(proximoSabado('2027-03-01'))} · Tarde`,
    );
  });

  it('próximo sábado a partir de hoje + 30 dias; dia curto do pedido', () => {
    expect(proximoSabado('2026-10-03')).toBe('2026-11-07');
    expect(proximoSabado('2026-10-03', 0)).toBe('2026-10-03');
    expect(diaCurtoDoPedido('2026-11-07')).toBe('sáb, 07/11');
  });

  it('"14 dias grátis" do texto bate com o trial do cadastro no SQL', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const ultima = readdirSync(dir)
      .sort()
      .filter((f) => /_criar_conta_dono\s*\(/.test(readFileSync(join(dir, f), 'utf8')))
      .at(-1)!;
    const corpo = readFileSync(join(dir, ultima), 'utf8');
    expect(corpo).toMatch(new RegExp(`now\\(\\) \\+ interval '${DIAS_TESTE_GRATIS} days'`));
  });
});
