import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contextoDoModelo, MODELOS } from '@/domain/modelos';
import { calcularOrcamento } from '@/domain/preco';
import {
  congelarConteudo,
  montarConteudo,
  type BuffetProposta,
  type ModeloProposta,
  type ModeloVisual,
  type VersaoProposta,
} from '@/domain/proposta';
import { entradaDoMotor, ESCOLHAS_VAZIAS, type Escolhas } from '@/domain/publico';
import {
  carregarImagensProposta,
  fotoEmJpeg,
  gerarPdfProposta,
  logoInteiroEmPng,
} from '@/server/proposta/pdf';

/*
 * PDF premium: os dois modelos visuais, com e sem foto, com e sem logo, e o fallback de
 * imagem que falha ou demora. Com GERAR_PDF_EXEMPLOS=1, grava os 4 PDFs de exemplo em
 * docs/capturas/pdf-premium/ (para revisão visual).
 */

const HOJE = '2026-11-12';
const SABADO = '2027-05-15';
const TEXTOS = {
  condicoes: 'Sinal por Pix para garantir a data. O saldo pode ser parcelado sem juros.',
  formasPagamento: ['Pix', 'Cartão de crédito', 'Boleto'],
  naoIncluso: 'Decoração floral, DJ e bolo cenográfico.',
  cancelamento: 'Até 90 dias antes do evento, devolvemos o valor pago menos o sinal.',
  alteracaoConvidados: 'Até 15 dias antes, sem custo.',
};

/** Ilustração abstrata (nada de foto de terceiros), em WEBP como no Storage. */
async function ilustracao(cores: [string, string, string], largura = 1600, altura = 1066) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${cores[0]}"/><stop offset="1" stop-color="${cores[1]}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${largura * 0.3}" cy="${altura * 0.4}" r="${altura * 0.28}" fill="${cores[2]}" opacity="0.35"/>
    <circle cx="${largura * 0.72}" cy="${altura * 0.62}" r="${altura * 0.18}" fill="#FFFFFF" opacity="0.25"/>
    <rect x="${largura * 0.18}" y="${altura * 0.74}" width="${largura * 0.64}" height="${altura * 0.06}" rx="${altura * 0.03}" fill="#FFFFFF" opacity="0.5"/>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

async function logoExemplo(cor: string, letra: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <circle cx="256" cy="256" r="236" fill="none" stroke="${cor}" stroke-width="18"/>
    <text x="256" y="320" font-family="Georgia, serif" font-size="210" text-anchor="middle" fill="${cor}">${letra}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
}

let servidor: Server;
let base = '';
const arquivos = new Map<string, Buffer>();

beforeAll(async () => {
  arquivos.set('/casamento.webp', await ilustracao(['#F5EBDD', '#C8A27A', '#FFFFFF']));
  arquivos.set('/infantil.webp', await ilustracao(['#FDE68A', '#F472B6', '#38BDF8']));
  const paletas: [string, string, string][] = [
    ['#E8DCCB', '#9C7A54', '#FFFFFF'],
    ['#DDE7E1', '#5E8A72', '#FFFFFF'],
    ['#F1E3E6', '#B07A86', '#FFFFFF'],
    ['#FFF1C2', '#F59E0B', '#FDE68A'],
    ['#DBEAFE', '#38BDF8', '#FFFFFF'],
  ];
  for (let i = 0; i < 8; i++)
    arquivos.set(`/item-${i}.webp`, await ilustracao(paletas[i % paletas.length]!, 960, 640));
  arquivos.set('/logo-elegante.webp', await logoExemplo('#8A6A3F', 'S'));
  arquivos.set('/logo-alegre.webp', await logoExemplo('#DB2777', 'P'));
  servidor = createServer((req, res) => {
    if (req.url === '/lenta.webp') {
      // nunca responde a tempo (o PDF não pode esperar)
      setTimeout(() => res.end(arquivos.get('/casamento.webp')), 5000).unref();
      return;
    }
    const corpo = arquivos.get(req.url ?? '');
    if (!corpo) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('content-type', 'image/webp');
    res.end(corpo);
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.closeAllConnections();
  servidor.close();
});

function versao(
  segmento: 'eventos' | 'infantil',
  foto: string | null,
): { versao: VersaoProposta; cliente: string } {
  // com foto: o pacote, cada opcional escolhido e cada seção do cardápio têm a sua
  let n = 0;
  const outra = () => (foto ? `${base}/item-${n++ % 8}.webp` : null);
  const ctx = contextoDoModelo(MODELOS[segmento]);
  const tipo = ctx.tiposEvento[0]!;
  const pacote = [...ctx.pacotes]
    .filter((p) => p.tiposEventoIds.length === 0 || p.tiposEventoIds.includes(tipo.id))
    .sort((a, b) => Number(b.destaque) - Number(a.destaque))[0]!;
  const turno = ctx.turnos.find((t) => t.diasSemana.includes(6))!;
  const faixa = ctx.faixasIdade.find((f) => f.pacoteId === null);
  const cliente = segmento === 'eventos' ? 'Mariana Alves' : 'Juliana Prado';
  const escolhas: Escolhas = {
    ...ESCOLHAS_VAZIAS,
    tipoEventoId: tipo.id,
    data: SABADO,
    turnoId: turno.id,
    espacoId: ctx.espacos.find((e) => e.ativo)!.id,
    adultos: Math.max(pacote.minConvidados, segmento === 'eventos' ? 150 : 60),
    criancas: faixa ? [{ faixaIdadeId: faixa.id, quantidade: 20 }] : [],
    pacoteId: pacote.id,
    opcionais: ctx.opcionais
      .filter((o) => o.ativo && o.pacotesInclusoIds.length === 0)
      .slice(0, 2)
      .map((o) => ({ opcionalId: o.id, quantidade: Math.max(1, o.qtdMin) })),
  };
  const r = calcularOrcamento(ctx, entradaDoMotor(ctx, escolhas, HOJE)!);
  expect(r.ok).toBe(true);
  const descricao = MODELOS[segmento].pacotes.find((p) => p.nome === pacote.nome)?.descricao;
  return {
    cliente,
    versao: {
      numero: 42,
      versao: 1,
      status: 'enviado',
      emitidaEm: '2026-11-12T15:00:00Z',
      validadeAte: '2026-11-27',
      hoje: HOJE,
      resultado: r,
      conteudo: congelarConteudo({
        ctx,
        escolhas,
        textos: TEXTOS,
        aberturaModelo:
          'Olá, {nome}! Preparamos com carinho esta proposta para o seu {tipo} em {data}, com {convidados} convidados.',
        clienteNome: cliente,
        buffetNome: 'Buffet',
        vitrinePacotes: {
          [pacote.id]: {
            descricao: descricao ?? null,
            foto,
            secoes: pacote.secoes.map((s) => ({ nome: s.nome, ordem: s.ordem, foto: outra() })),
          },
        },
        vitrineOpcionais: Object.fromEntries(
          escolhas.opcionais.map((o) => [o.opcionalId, { foto: outra() }]),
        ),
      }),
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
      turno: { nome: turno.nome, horaInicio: turno.horaInicio },
      espaco: ctx.espacos[0]!.nome,
      clienteNome: cliente,
      observacoes: null,
    },
  };
}

function modelo(visual: ModeloVisual, comFoto: boolean, logo: string | null): ModeloProposta {
  const segmento = visual === 'elegante' ? 'eventos' : 'infantil';
  const foto = comFoto ? `${base}/${segmento === 'eventos' ? 'casamento' : 'infantil'}.webp` : null;
  const buffet: BuffetProposta = {
    nome: visual === 'elegante' ? 'Stillus Eventos' : 'Planeta Kids Buffet',
    logoUrl: logo,
    corMarca: visual === 'elegante' ? '#8A6A3F' : '#DB2777',
    razaoSocial: visual === 'elegante' ? 'Stillus Eventos Ltda' : 'Planeta Kids Festas Ltda',
    cnpj: '11222333000181',
    endereco: 'Av. das Palmeiras, 1200, Jardim Europa, Uberlândia (MG)',
    whatsappE164: '+5534991355450',
    rodapeOrkestra: true,
    modeloVisual: visual,
  };
  return montarConteudo(versao(segmento, foto).versao, buffet);
}

/** Texto e imagens embutidas de um PDF (sem biblioteca: conta os XObjects de imagem). */
function imagensNoPdf(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length;
}

/** Fotos (JPEG = DCTDecode); o logo vai em PNG. */
function fotosJpegNoPdf(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/DCTDecode/g) ?? []).length;
}

function paginasNoPdf(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe('PDF premium da proposta', () => {
  const CASOS = [
    ['elegante', true],
    ['elegante', false],
    ['alegre', true],
    ['alegre', false],
  ] as const;

  it.each(CASOS)('%s, com foto = %s: PDF válido, leve e com as imagens certas', async (v, foto) => {
    const logo = `${base}/logo-${v}.webp`;
    const m = modelo(v, foto, logo);
    expect(m.visual).toBe(v);
    expect(m.investimento.linhas[0]!.foto !== null).toBe(foto);
    const pdf = await gerarPdfProposta(m);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeLessThan(300 * 1024);
    // logo (capa ou círculo e marca d'água) sempre; as fotos (pacote, opcionais e seções do
    // cardápio) são os únicos JPEG
    const fotos = new Set(
      [
        ...m.investimento.linhas.map((l) => l.foto),
        ...m.cardapio!.secoes.map((x) => x.foto),
      ].filter(Boolean),
    );
    expect(imagensNoPdf(pdf)).toBeGreaterThan(0);
    expect(fotos.size > 2).toBe(foto);
    expect(fotosJpegNoPdf(pdf)).toBe(fotos.size);
    if (foto) {
      expect(m.investimento.linhas.filter((l) => l.tipo === 'opcional' && l.foto)).toHaveLength(2);
      expect(m.cardapio!.secoes.every((x) => x.foto)).toBe(true);
    }
    // elegante tem capa: o investimento começa na página 2
    expect(paginasNoPdf(pdf)).toBeGreaterThanOrEqual(v === 'elegante' ? 2 : 1);
    if (process.env.GERAR_PDF_EXEMPLOS === '1') {
      const pasta = join(process.cwd(), 'docs/capturas/pdf-premium');
      mkdirSync(pasta, { recursive: true });
      writeFileSync(join(pasta, `${v}-${foto ? 'com' : 'sem'}-fotos.pdf`), pdf);
    }
  });

  it('sem logo: nenhuma marca d’água nem logo, e o PDF sai igual', async () => {
    for (const v of ['elegante', 'alegre'] as const) {
      const m = modelo(v, false, null);
      const imagens = await carregarImagensProposta(m);
      expect(imagens).toEqual({ logo: null, logoInteiro: null, marcaDagua: null, fotos: {} });
      const pdf = await gerarPdfProposta(m);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(imagensNoPdf(pdf)).toBe(0);
    }
  });

  it('logo ou foto que falha (404) some sem quebrar o PDF', async () => {
    const m = modelo('elegante', false, `${base}/nao-existe.webp`);
    const comFotoQuebrada: ModeloProposta = {
      ...m,
      investimento: {
        ...m.investimento,
        linhas: m.investimento.linhas.map((l, i) =>
          i === 0 ? { ...l, foto: `${base}/nao-existe.webp` } : l,
        ),
      },
    };
    const imagens = await carregarImagensProposta(comFotoQuebrada);
    expect(imagens.logoInteiro).toBeNull();
    expect(imagens.marcaDagua).toBeNull();
    expect(imagens.fotos).toEqual({});
    const pdf = await gerarPdfProposta(comFotoQuebrada);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(imagensNoPdf(pdf)).toBe(0);
    expect(fotosJpegNoPdf(pdf)).toBe(0);
  });

  it('foto que demora mais que o prazo: o item sai sem foto, sem esperar', async () => {
    const inicio = performance.now();
    expect(await fotoEmJpeg(`${base}/lenta.webp`, 300)).toBeNull();
    expect(performance.now() - inicio).toBeLessThan(1500);
  });

  it('foto vira JPEG de no máximo 600 px; logo inteiro mantém a proporção', async () => {
    const foto = await fotoEmJpeg(`${base}/casamento.webp`);
    const meta = await sharp(foto!).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(600);
    const logo = await logoInteiroEmPng(`${base}/logo-alegre.webp`);
    const mLogo = await sharp(logo!).metadata();
    expect(mLogo.format).toBe('png');
    expect(mLogo.width).toBeLessThanOrEqual(512);
    expect(mLogo.width).toBe(mLogo.height);
  });

  it('URL vazia ou ausente: nada a baixar', async () => {
    expect(await fotoEmJpeg(null)).toBeNull();
    expect(await logoInteiroEmPng(null)).toBeNull();
  });
});
