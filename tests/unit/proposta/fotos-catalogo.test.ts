import { describe, expect, it } from 'vitest';
import { contextoDoModelo, MODELOS } from '@/domain/modelos';
import { calcularOrcamento } from '@/domain/preco';
import {
  congelarConteudo,
  montarConteudo,
  type BuffetProposta,
  type ConteudoCongelado,
  type VersaoProposta,
  type VitrineOpcionais,
  type VitrinePacotes,
} from '@/domain/proposta';
import { entradaDoMotor, ESCOLHAS_VAZIAS, type Escolhas } from '@/domain/publico';
import { MAX_FOTOS_OPCIONAL } from '@/domain/imagem';
import { cardapioSchema, fotosOpcionalSchema } from '@/domain/validacao/catalogo';

/*
 * Fase 2: foto nos opcionais e nas seções do cardápio, congelada na versão como a do pacote.
 */

const HOJE = '2026-11-12';
const URL = (n: string) =>
  `https://x.supabase.co/storage/v1/object/public/midia/e/pacotes/${n}.webp`;
const BUFFET: BuffetProposta = {
  nome: 'Stillus',
  logoUrl: null,
  corMarca: '#8A6A3F',
  razaoSocial: null,
  cnpj: null,
  endereco: null,
  whatsappE164: null,
  rodapeOrkestra: true,
  modeloVisual: 'elegante',
};

function versao(vitrine: { pacotes?: VitrinePacotes; opcionais?: VitrineOpcionais }) {
  const ctx = contextoDoModelo(MODELOS.eventos);
  const tipo = ctx.tiposEvento[0]!;
  const pacote = ctx.pacotes.find(
    (p) => p.tiposEventoIds.length === 0 || p.tiposEventoIds.includes(tipo.id),
  )!;
  const opcionais = ctx.opcionais.filter((o) => o.ativo && o.pacotesInclusoIds.length === 0);
  const escolhas: Escolhas = {
    ...ESCOLHAS_VAZIAS,
    tipoEventoId: tipo.id,
    data: '2027-05-15',
    turnoId: ctx.turnos.find((t) => t.diasSemana.includes(6))!.id,
    espacoId: ctx.espacos[0]!.id,
    adultos: 120,
    pacoteId: pacote.id,
    opcionais: opcionais.slice(0, 2).map((o) => ({ opcionalId: o.id, quantidade: 1 })),
  };
  const r = calcularOrcamento(ctx, entradaDoMotor(ctx, escolhas, HOJE)!);
  expect(r.ok).toBe(true);
  const v: VersaoProposta = {
    numero: 1,
    versao: 1,
    status: 'enviado',
    emitidaEm: null,
    validadeAte: '2026-11-27',
    hoje: HOJE,
    resultado: r,
    conteudo: congelarConteudo({
      ctx,
      escolhas,
      textos: {
        condicoes: '',
        formasPagamento: [],
        naoIncluso: '',
        cancelamento: '',
        alteracaoConvidados: '',
      },
      aberturaModelo: null,
      clienteNome: 'Mariana',
      buffetNome: 'Stillus',
      vitrinePacotes: vitrine.pacotes,
      vitrineOpcionais: vitrine.opcionais,
    }),
    itens: r.linhas.map((l) => ({
      tipo: l.tipo,
      descricao: l.descricao,
      quantidade: l.quantidade,
      subtotalCentavos: l.subtotalCentavos,
      detalhe: l.detalhe,
    })),
    totalCentavos: r.totalCentavos,
    data: '2027-05-15',
    convidados: r.pessoasFisicas,
    tipoEvento: tipo.nome,
    turno: null,
    espaco: null,
    clienteNome: 'Mariana',
    observacoes: null,
  };
  return { v, pacote, escolhidos: opcionais.slice(0, 2) };
}

describe('fotos dos opcionais e do cardápio na proposta', () => {
  it('congela a foto e a descrição de cada opcional escolhido e liga à linha pelo nome', () => {
    const base = versao({});
    const [a, b] = base.escolhidos;
    const { v } = versao({ opcionais: { [a!.id]: { foto: URL('a') }, [b!.id]: { foto: null } } });
    expect(v.conteudo!.opcionais).toEqual([
      { nome: a!.nome, descricao: a!.descricao, foto: URL('a') },
      { nome: b!.nome, descricao: b!.descricao, foto: null },
    ]);
    const m = montarConteudo(v, BUFFET);
    const linhaA = m.investimento.linhas.find((l) => l.descricao === a!.nome)!;
    const linhaB = m.investimento.linhas.find((l) => l.descricao === b!.nome)!;
    expect(linhaA.foto).toBe(URL('a'));
    expect(linhaA.texto).toBe(a!.descricao);
    expect(linhaB.foto).toBeNull();
    expect(linhaB.texto).toBe(b!.descricao);
  });

  it('congela a foto de cada seção do cardápio (por ordem e nome)', () => {
    const { pacote } = versao({});
    const secoes = pacote.secoes.map((s, i) => ({
      nome: s.nome,
      ordem: s.ordem,
      foto: i === 0 ? URL('s0') : null,
    }));
    const { v } = versao({
      pacotes: { [pacote.id]: { descricao: null, foto: null, secoes } },
    });
    const m = montarConteudo(v, BUFFET);
    expect(m.cardapio!.secoes[0]!.foto).toBe(URL('s0'));
    expect(m.cardapio!.secoes.slice(1).every((s) => s.foto === null)).toBe(true);
  });

  it('versão de antes das fotos do catálogo (sem opcionais nem foto nas seções) monta sem foto', () => {
    const { v } = versao({});
    const antigo = structuredClone(v.conteudo!) as ConteudoCongelado;
    delete antigo.opcionais;
    antigo.pacote!.secoes = antigo.pacote!.secoes.map(({ nome, itens }) => ({ nome, itens }));
    const m = montarConteudo({ ...v, conteudo: antigo }, BUFFET);
    expect(m.investimento.linhas.every((l) => l.foto === null)).toBe(true);
    expect(m.cardapio!.secoes.every((s) => s.foto === null)).toBe(true);
    // a linha do opcional continua sem texto extra
    expect(m.investimento.linhas.filter((l) => l.tipo === 'opcional').every((l) => !l.texto)).toBe(
      true,
    );
  });

  it('URL estranha numa seção ou opcional vira "sem foto"', () => {
    const { pacote, escolhidos } = versao({});
    const { v } = versao({
      pacotes: {
        [pacote.id]: {
          descricao: null,
          foto: 'javascript:x',
          secoes: pacote.secoes.map((s) => ({ nome: s.nome, ordem: s.ordem, foto: 'a b' })),
        },
      },
      opcionais: { [escolhidos[0]!.id]: { foto: '"><img>' } },
    });
    const m = montarConteudo(v, BUFFET);
    expect(m.investimento.linhas.every((l) => l.foto === null)).toBe(true);
    expect(m.cardapio!.secoes.every((s) => s.foto === null)).toBe(true);
  });
});

describe('validação das fotos do catálogo', () => {
  it('seção do cardápio aceita foto opcional', () => {
    const r = cardapioSchema.safeParse({
      secoes: [
        { nome: 'Entrada', itens: ['Salada'], foto: 'e/pacotes/x.webp' },
        { nome: 'Doces', itens: ['Pudim'], foto: null },
        { nome: 'Bebidas', itens: ['Suco'] },
      ],
    });
    expect(r.success).toBe(true);
  });

  it(`opcional: no máximo ${MAX_FOTOS_OPCIONAL} foto`, () => {
    expect(fotosOpcionalSchema.safeParse({ caminhos: ['a'] }).success).toBe(true);
    expect(fotosOpcionalSchema.safeParse({ caminhos: [] }).success).toBe(true);
    expect(fotosOpcionalSchema.safeParse({ caminhos: ['a', 'b'] }).success).toBe(false);
  });
});
