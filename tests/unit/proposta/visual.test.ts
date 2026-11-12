import { describe, expect, it } from 'vitest';
import { contextoDoModelo, MODELOS } from '@/domain/modelos';
import { calcularOrcamento } from '@/domain/preco';
import {
  congelarConteudo,
  fotoValida,
  modeloVisualDoSegmento,
  modeloVisualEfetivo,
  modeloVisualValido,
  montarConteudo,
  ROTULO_MODELO_VISUAL,
  type BuffetProposta,
  type ConteudoCongelado,
  type VersaoProposta,
} from '@/domain/proposta';
import { entradaDoMotor, ESCOLHAS_VAZIAS, type Escolhas } from '@/domain/publico';

describe('modelo visual da proposta', () => {
  it('padrão pelo tipo de buffet: infantil = alegre; eventos e domicílio = elegante', () => {
    expect(modeloVisualDoSegmento('infantil')).toBe('alegre');
    expect(modeloVisualDoSegmento('eventos')).toBe('elegante');
    expect(modeloVisualDoSegmento('domicilio')).toBe('elegante');
    expect(modeloVisualDoSegmento(null)).toBe('elegante');
    expect(modeloVisualDoSegmento('outro')).toBe('elegante');
  });

  it('a escolha do dono vale sobre o padrão', () => {
    expect(modeloVisualEfetivo('elegante', 'infantil')).toBe('elegante');
    expect(modeloVisualEfetivo('alegre', 'eventos')).toBe('alegre');
    expect(modeloVisualEfetivo(null, 'infantil')).toBe('alegre');
    expect(modeloVisualEfetivo(undefined, 'eventos')).toBe('elegante');
  });

  it('valor inválido volta para o padrão do segmento', () => {
    expect(modeloVisualValido('festivo')).toBe(false);
    expect(modeloVisualEfetivo('festivo', 'infantil')).toBe('alegre');
    expect(modeloVisualEfetivo('', 'domicilio')).toBe('elegante');
  });

  it('textos da escolha sem travessão', () => {
    for (const r of Object.values(ROTULO_MODELO_VISUAL)) {
      expect(r.nome + r.descricao).not.toMatch(/[—–]/);
    }
  });
});

// ---------------------------------------------------------------------------
// Foto do pacote no conteúdo congelado
// ---------------------------------------------------------------------------

const HOJE = '2026-11-12';
const SABADO = '2027-05-15';
const TEXTOS = {
  condicoes: '',
  formasPagamento: ['Pix'],
  naoIncluso: '',
  cancelamento: '',
  alteracaoConvidados: '',
};
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
const FOTO = 'https://exemplo.supabase.co/storage/v1/object/public/midia/e/pacotes/a.webp';

function versao(vitrine?: Record<string, { descricao: string | null; foto: string | null }>) {
  const ctx = contextoDoModelo(MODELOS.eventos);
  const tipo = ctx.tiposEvento[0]!;
  const pacote = ctx.pacotes.find(
    (p) => p.tiposEventoIds.length === 0 || p.tiposEventoIds.includes(tipo.id),
  )!;
  const escolhas: Escolhas = {
    ...ESCOLHAS_VAZIAS,
    tipoEventoId: tipo.id,
    data: SABADO,
    turnoId: ctx.turnos.find((t) => t.diasSemana.includes(6))!.id,
    espacoId: ctx.espacos[0]!.id,
    adultos: 120,
    pacoteId: pacote.id,
  };
  const r = calcularOrcamento(ctx, entradaDoMotor(ctx, escolhas, HOJE)!);
  expect(r.ok).toBe(true);
  const conteudo = congelarConteudo({
    ctx,
    escolhas,
    textos: TEXTOS,
    aberturaModelo: null,
    clienteNome: 'Mariana',
    buffetNome: 'Stillus',
    vitrinePacotes: vitrine?.['*'] ? { [pacote.id]: vitrine['*'] } : vitrine,
  });
  const v: VersaoProposta = {
    numero: 1,
    versao: 1,
    status: 'enviado',
    emitidaEm: null,
    validadeAte: '2026-11-27',
    hoje: HOJE,
    resultado: r,
    conteudo,
    itens: r.linhas.map((l) => ({
      tipo: l.tipo,
      descricao: l.descricao,
      quantidade: l.quantidade,
      subtotalCentavos: l.subtotalCentavos,
      detalhe: l.detalhe,
    })),
    totalCentavos: r.totalCentavos,
    data: SABADO,
    convidados: r.pessoasFisicas,
    tipoEvento: tipo.nome,
    turno: null,
    espaco: null,
    clienteNome: 'Mariana',
    observacoes: null,
  };
  return v;
}

describe('foto do pacote congelada na versão', () => {
  it('congela a descrição e a URL da foto; a linha do pacote leva as duas', () => {
    const v = versao({ '*': { descricao: '  Jantar completo.  ', foto: FOTO } });
    expect(v.conteudo!.pacote!.foto).toBe(FOTO);
    expect(v.conteudo!.pacote!.descricao).toBe('Jantar completo.');
    const m = montarConteudo(v, BUFFET);
    expect(m.visual).toBe('elegante');
    const linhaPacote = m.investimento.linhas.find((l) => l.tipo === 'pacote')!;
    expect(linhaPacote.foto).toBe(FOTO);
    expect(linhaPacote.texto).toBe('Jantar completo.');
    // só o pacote tem foto
    expect(m.investimento.linhas.filter((l) => l.foto)).toHaveLength(1);
  });

  it('sem vitrine (ou pacote sem foto): sai sem foto e sem descrição', () => {
    for (const vitrine of [undefined, { '*': { descricao: null, foto: null } }]) {
      const m = montarConteudo(versao(vitrine), BUFFET);
      expect(m.investimento.linhas.every((l) => l.foto === null && l.texto === null)).toBe(true);
    }
  });

  it('versão antiga (sem os campos novos no conteúdo) continua montando, sem foto', () => {
    const v = versao({ '*': { descricao: 'x', foto: FOTO } });
    const { descricao: _d, foto: _f, ...pacoteAntigo } = v.conteudo!.pacote!;
    const antigo: ConteudoCongelado = { ...v.conteudo!, pacote: pacoteAntigo };
    const m = montarConteudo({ ...v, conteudo: antigo }, BUFFET);
    expect(m.investimento.linhas.every((l) => l.foto === null)).toBe(true);
    expect(m.cardapio?.secoes.length).toBeGreaterThan(0);
  });

  it('versão da Etapa 4 (conteúdo nulo) continua montando, sem foto', () => {
    const m = montarConteudo(
      { ...versao(), conteudo: null },
      { ...BUFFET, modeloVisual: 'alegre' },
    );
    expect(m.visual).toBe('alegre');
    expect(m.investimento.linhas.every((l) => l.foto === null && l.texto === null)).toBe(true);
  });

  it('URL estranha no JSON congelado vira "sem foto"', () => {
    expect(fotoValida(FOTO)).toBe(FOTO);
    expect(
      fotoValida('http://127.0.0.1:54321/storage/v1/object/public/midia/a.webp'),
    ).not.toBeNull();
    expect(fotoValida('javascript:alert(1)')).toBeNull();
    expect(fotoValida('https://x.com/a b.webp')).toBeNull();
    expect(fotoValida('https://x.com/"onerror=x')).toBeNull();
    expect(fotoValida('')).toBeNull();
    expect(fotoValida(null)).toBeNull();
    expect(fotoValida(undefined)).toBeNull();
  });
});
