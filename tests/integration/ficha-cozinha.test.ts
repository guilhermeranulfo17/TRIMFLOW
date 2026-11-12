import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lerUsuario, type UsuarioAtual } from '@/server/auth/sessao';
import { carregarFichaCozinha } from '@/server/ficha/carregar';
import { gerarPdfFicha } from '@/server/ficha/pdf';
import { conectar, IDS, urlBancoTeste } from '../support/db';

/*
 * Fase 4: ficha da cozinha. Só reserva confirmada (ativa ou realizada), só usuários da empresa
 * da reserva (RLS), sem preço nenhum.
 */

// os loaders do servidor usam a conexão padrão (DATABASE_URL)
process.env.DATABASE_URL ??= urlBancoTeste();
const sql = conectar();
let dono: UsuarioAtual;
let vendedor: UsuarioAtual;
let donoB: UsuarioAtual;
let reservaId: string;
let orcamentoId: string;
let conteudoAntes: unknown;

async function usuario(id: string): Promise<UsuarioAtual> {
  return { ...(await lerUsuario(id))!, suporte: null } as UsuarioAtual;
}

beforeAll(async () => {
  [dono, vendedor, donoB] = await Promise.all([
    usuario(IDS.donoA),
    usuario(IDS.vendedorA),
    usuario(IDS.donoB),
  ]);
  const [r] = await sql`select r.id, r.orcamento_id, o.conteudo from public.reservas r
    join public.orcamentos o on o.id = r.orcamento_id
    where r.empresa_id = ${IDS.empresaA} and r.tipo = 'confirmada' and r.status = 'ativa'
    order by r.data limit 1`;
  reservaId = r!.id as string;
  orcamentoId = r!.orcamento_id as string;
  conteudoAntes = r!.conteudo;
});

afterAll(async () => {
  await sql`update public.reservas set convidados = null where id = ${reservaId}`;
  // o conteúdo do seed é nulo; volta ao que era (jsonb por texto: o tipo do driver é estrito)
  await sql`update public.orcamentos set conteudo = ${conteudoAntes === null ? null : JSON.stringify(conteudoAntes)}::jsonb
    where id = ${orcamentoId}`;
  await sql.end();
});

describe('ficha da cozinha', () => {
  it('versão antiga (sem conteúdo congelado): total de convidados e itens, sem preço', async () => {
    await sql`update public.orcamentos set conteudo = null where id = ${orcamentoId}`;
    await sql`update public.reservas set convidados = 80 where id = ${reservaId}`;
    const d = await carregarFichaCozinha(dono, reservaId);
    expect(d).not.toBeNull();
    expect(d!.ficha.convidados).toEqual([{ rotulo: 'Convidados', quantidade: 80 }]);
    expect(d!.ficha.totalConvidados).toBe(80);
    expect(JSON.stringify(d!.ficha)).not.toContain('R$');
  });

  it('com conteúdo congelado: faixas de idade, cardápio por seção e local', async () => {
    await sql`update public.orcamentos set conteudo = ${sql.json({
      formato: 1,
      pacote: {
        nome: 'Super',
        duracaoInclusaMin: 240,
        secoes: [
          { nome: 'Salgados', itens: ['Coxinha', 'Kibe'] },
          { nome: 'Doces', itens: ['Brigadeiro'] },
        ],
      },
      convidados: { adultos: 40, criancas: [{ rotulo: '0 a 5 anos', quantidade: 12 }] },
      espaco: { nome: 'Salão principal', noLocalDoCliente: false, localCliente: null },
      abertura: null,
      textos: {
        condicoes: '',
        formasPagamento: [],
        naoIncluso: '',
        cancelamento: '',
        alteracaoConvidados: '',
        sinalBp: 3000,
      },
    })} where id = ${orcamentoId}`;
    const d = await carregarFichaCozinha(dono, reservaId);
    const f = d!.ficha;
    expect(f.convidados).toEqual([
      { rotulo: 'Adultos', quantidade: 40 },
      { rotulo: 'Crianças de 0 a 5 anos', quantidade: 12 },
    ]);
    expect(f.totalConvidados).toBe(52);
    expect(f.cardapio.map((s) => s.secao)).toEqual(['Salgados', 'Doces']);
    expect(f.evento.find((e) => e.rotulo === 'Local')!.valor).toBe('Salão principal');
    expect(f.evento.find((e) => e.rotulo === 'Horário')!.valor).toMatch(
      /^\d{2}:\d{2} às \d{2}:\d{2}/,
    );

    const pdf = await gerarPdfFicha(f);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('vendedor da empresa também baixa (a ficha não tem valores)', async () => {
    expect(await carregarFichaCozinha(vendedor, reservaId)).not.toBeNull();
  });

  it('outra empresa não vê a ficha (RLS)', async () => {
    expect(await carregarFichaCozinha(donoB, reservaId)).toBeNull();
  });

  it('pré-reserva, cancelada ou id inválido: sem ficha', async () => {
    const [pre] = await sql`select id from public.reservas where empresa_id = ${IDS.empresaA}
      and tipo = 'pre_reserva' limit 1`;
    expect(await carregarFichaCozinha(dono, pre!.id as string)).toBeNull();
    expect(await carregarFichaCozinha(dono, 'nao-e-uuid')).toBeNull();
    expect(await carregarFichaCozinha(dono, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
