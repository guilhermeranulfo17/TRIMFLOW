import 'server-only';
import path from 'node:path';
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import sharp from 'sharp';
import type { LinhaInvestimento, ModeloProposta } from '@/domain/proposta';

/*
 * PDF da proposta, gerado no servidor a partir do MESMO ModeloProposta da web (nenhuma regra
 * aqui: só desenho). A4, fontes embutidas, cor do buffet com contraste AA.
 *
 * Dois modelos visuais (m.visual, domain/proposta/visual):
 * - elegante: capa na primeira página, muito branco, títulos serifados (Cormorant Garamond) e
 *   finos, fios na cor da marca, sem blocos coloridos pesados;
 * - alegre: faixa e blocos na cor da marca, cantos arredondados, títulos fortes (Manrope 800).
 * Nos dois: logo como marca d'água no fundo das páginas (6%) e a foto congelada do pacote ao
 * lado do item. Imagem que falha ou demora some sem quebrar o PDF.
 */

const FONTES = path.join(process.cwd(), 'src/server/proposta/fontes');
Font.register({
  family: 'Manrope',
  fonts: [
    { src: path.join(FONTES, 'Manrope-400.ttf'), fontWeight: 400 },
    { src: path.join(FONTES, 'Manrope-600.ttf'), fontWeight: 600 },
    { src: path.join(FONTES, 'Manrope-800.ttf'), fontWeight: 800 },
  ],
});
Font.register({
  family: 'Cormorant',
  fonts: [
    { src: path.join(FONTES, 'CormorantGaramond-500.ttf'), fontWeight: 500 },
    { src: path.join(FONTES, 'CormorantGaramond-600.ttf'), fontWeight: 600 },
    {
      src: path.join(FONTES, 'CormorantGaramond-500-italico.ttf'),
      fontWeight: 500,
      fontStyle: 'italic',
    },
  ],
});
// Sem hifenização automática (quebra palavras em português de forma estranha).
Font.registerHyphenationCallback((palavra) => [palavra]);

const CINZA = '#575B57';
const BORDA = '#E3E5E3';
const TEXTO = '#161616';
const MARGEM = 48;

/** Imagens já convertidas para o react-pdf (que não lê WEBP). */
export type ImagensProposta = {
  /** logo quadrado (240 px, recortado), para o círculo do modelo alegre */
  logo: Buffer | null;
  /** logo inteiro (até 512 px, sem recorte), para a capa do elegante */
  logoInteiro: Buffer | null;
  /**
   * marca d'água: logo inteiro pequeno e com paleta (o react-pdf embute a imagem de novo em
   * cada página; a 6% de opacidade ninguém nota a resolução menor)
   */
  marcaDagua: Buffer | null;
  /** fotos dos itens por URL (JPEG até 600 px) */
  fotos: Record<string, Buffer>;
};

const SEM_IMAGENS: ImagensProposta = { logo: null, logoInteiro: null, marcaDagua: null, fotos: {} };

// ---------------------------------------------------------------------------
// Estilos dos dois modelos (mesmas chaves: o conteúdo é desenhado por um componente só)
// ---------------------------------------------------------------------------

function estilosBase(m: ModeloProposta) {
  return {
    pagina: {
      fontFamily: 'Manrope',
      fontSize: 10,
      color: TEXTO,
      paddingTop: 40,
      paddingBottom: 64,
      paddingHorizontal: MARGEM,
      lineHeight: 1.45,
    },
    paragrafo: { marginBottom: 4 },
    rotulo: { color: CINZA },
    detalhe: { color: CINZA, fontSize: 8.5 },
    aviso: {
      marginTop: 12,
      padding: 8,
      borderRadius: 6,
      backgroundColor: '#FEF3C7',
      color: '#78350F',
      fontWeight: 600,
    },
    lista: { marginBottom: 2, flexDirection: 'row' as const },
    marcador: { width: 10, color: m.cores.destaque },
    itemDescricao: { flex: 1, paddingRight: 12 },
    itemValor: { width: 90, textAlign: 'right' as const, fontWeight: 600 },
    itemNome: { fontWeight: 600 },
    itemTexto: { color: CINZA, fontSize: 9, marginTop: 2 },
    porConvidado: { textAlign: 'right' as const, color: CINZA, marginTop: 4 },
    marcaDagua: {
      position: 'absolute' as const,
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    marcaDaguaImagem: { width: 360, height: 360, objectFit: 'contain' as const, opacity: 0.06 },
    rodape: {
      position: 'absolute' as const,
      bottom: 24,
      left: MARGEM,
      right: MARGEM,
      borderTopWidth: 0.5,
      borderTopColor: BORDA,
      paddingTop: 6,
      fontSize: 7.5,
      color: CINZA,
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
    },
  };
}

function estilosElegante(m: ModeloProposta) {
  const fio = m.cores.destaque;
  return StyleSheet.create({
    ...estilosBase(m),
    pagina: { ...estilosBase(m).pagina, paddingTop: 64, paddingHorizontal: 56 },
    cabecalhoFixo: {
      position: 'absolute',
      top: 26,
      left: 56,
      right: 56,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      borderBottomWidth: 0.5,
      borderBottomColor: fio,
      paddingBottom: 5,
    },
    cabecalhoBuffet: { fontFamily: 'Cormorant', fontWeight: 600, fontSize: 12, color: TEXTO },
    cabecalhoNumero: { fontSize: 7.5, color: CINZA, letterSpacing: 1, textTransform: 'uppercase' },
    abertura: {
      fontFamily: 'Cormorant',
      fontStyle: 'italic',
      fontWeight: 500,
      fontSize: 14,
      lineHeight: 1.4,
      marginTop: 8,
    },
    secao: { marginTop: 26 },
    tituloSecao: {
      fontFamily: 'Cormorant',
      fontWeight: 600,
      fontSize: 19,
      color: m.cores.destaque,
      paddingBottom: 4,
      marginBottom: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: fio,
    },
    linhaEvento: {
      flexDirection: 'row',
      paddingVertical: 4,
      borderBottomWidth: 0.4,
      borderBottomColor: BORDA,
    },
    colRotulo: {
      width: 130,
      color: CINZA,
      fontSize: 7.5,
      letterSpacing: 1,
      textTransform: 'uppercase',
      paddingTop: 1.5,
    },
    colValor: { flex: 1 },
    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 9,
      borderBottomWidth: 0.4,
      borderBottomColor: BORDA,
    },
    foto: { width: 150, height: 100, objectFit: 'cover', marginRight: 14 },
    total: {
      flexDirection: 'row',
      marginTop: 14,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: fio,
      borderBottomWidth: 0.5,
      borderBottomColor: fio,
      alignItems: 'center',
    },
    totalRotulo: {
      flex: 1,
      fontSize: 8,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: CINZA,
    },
    totalValor: {
      fontFamily: 'Cormorant',
      fontWeight: 600,
      fontSize: 28,
      lineHeight: 1.2,
      color: m.cores.destaque,
    },
    cardapioSecao: { marginBottom: 8, alignItems: 'flex-start' },
    fotoSecao: { width: 96, height: 64, objectFit: 'cover', marginRight: 12 },
    cardapioNome: {
      fontSize: 7.5,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: CINZA,
      marginBottom: 1,
    },
    // capa
    capa: {
      fontFamily: 'Manrope',
      color: TEXTO,
      paddingHorizontal: 64,
      paddingTop: 96,
      paddingBottom: 64,
    },
    capaCentro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    capaLogo: { width: 130, height: 130, objectFit: 'contain', marginBottom: 26 },
    capaBuffet: {
      fontFamily: 'Cormorant',
      fontWeight: 600,
      fontSize: 30,
      textAlign: 'center',
      letterSpacing: 0.5,
    },
    capaFio: { width: 64, borderBottomWidth: 0.75, borderBottomColor: fio, marginVertical: 26 },
    capaPara: {
      fontFamily: 'Cormorant',
      fontStyle: 'italic',
      fontWeight: 500,
      fontSize: 15,
      color: CINZA,
    },
    capaCliente: {
      fontFamily: 'Cormorant',
      fontWeight: 500,
      fontSize: 38,
      textAlign: 'center',
      color: m.cores.destaque,
      marginTop: 4,
      lineHeight: 1.15,
    },
    capaEvento: {
      fontSize: 8.5,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: CINZA,
      marginTop: 18,
      textAlign: 'center',
    },
    capaRodape: {
      alignItems: 'center',
      fontSize: 8,
      color: CINZA,
      letterSpacing: 0.5,
    },
  });
}

function estilosAlegre(m: ModeloProposta) {
  return StyleSheet.create({
    ...estilosBase(m),
    faixa: {
      backgroundColor: m.cores.base,
      color: m.cores.texto,
      marginHorizontal: -MARGEM,
      marginTop: -40,
      paddingHorizontal: MARGEM,
      paddingTop: 26,
      paddingBottom: 30,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    logo: {
      width: 60,
      height: 60,
      borderRadius: 30,
      objectFit: 'cover',
      backgroundColor: '#FFFFFF',
    },
    buffet: { fontSize: 18, fontWeight: 800, lineHeight: 1.3 },
    titulo: { fontSize: 11, fontWeight: 600, marginTop: 2 },
    datas: { fontSize: 9, marginTop: 2 },
    abertura: { marginTop: 18, fontSize: 10.5 },
    secao: { marginTop: 18 },
    tituloSecao: {
      alignSelf: 'flex-start',
      backgroundColor: m.cores.base,
      color: m.cores.texto,
      fontSize: 11,
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingVertical: 4,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginBottom: 8,
    },
    cartaoEvento: {
      backgroundColor: m.cores.suave,
      borderRadius: 14,
      padding: 12,
    },
    linhaEvento: { flexDirection: 'row', marginBottom: 2 },
    colRotulo: { width: 110, color: CINZA },
    colValor: { flex: 1, fontWeight: 600 },
    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 10,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: BORDA,
      borderRadius: 12,
    },
    foto: { width: 132, height: 92, objectFit: 'cover', borderRadius: 10, marginRight: 12 },
    total: {
      flexDirection: 'row',
      marginTop: 6,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: m.cores.base,
      color: m.cores.texto,
      borderRadius: 14,
      alignItems: 'center',
    },
    totalRotulo: { flex: 1, fontWeight: 800, fontSize: 13 },
    totalValor: { fontWeight: 800, fontSize: 20, lineHeight: 1.2 },
    cardapioSecao: {
      marginBottom: 6,
      backgroundColor: m.cores.suave,
      borderRadius: 10,
      padding: 8,
    },
    cardapioNome: { fontWeight: 800 },
    fotoSecao: { width: 86, height: 58, objectFit: 'cover', borderRadius: 8, marginRight: 10 },
  });
}

type EstilosElegante = ReturnType<typeof estilosElegante>;
type EstilosAlegre = ReturnType<typeof estilosAlegre>;
type Estilos = EstilosElegante | EstilosAlegre;

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

function Secao({ titulo, s, children }: { titulo: string; s: Estilos; children: React.ReactNode }) {
  return (
    <View style={s.secao}>
      {/* minPresenceAhead: o título nunca fica sozinho no fim da página */}
      <Text style={s.tituloSecao} minPresenceAhead={60} wrap={false}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

function Item({ texto, s }: { texto: string; s: Estilos }) {
  return (
    <View style={s.lista} wrap={false}>
      <Text style={s.marcador}>•</Text>
      <Text style={{ flex: 1 }}>{texto}</Text>
    </View>
  );
}

/** Logo grande e bem claro no fundo da página (repetido em todas por `fixed`). */
function MarcaDagua({ logo, s }: { logo: Buffer | null; s: Estilos }) {
  if (!logo) return null;
  return (
    <View style={s.marcaDagua} fixed>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
      <Image src={logo} style={s.marcaDaguaImagem} />
    </View>
  );
}

function Rodape({ m, s }: { m: ModeloProposta; s: Estilos }) {
  return (
    <View style={s.rodape} fixed>
      <Text style={{ flex: 1 }}>{m.rodape.linhas.join(' · ')}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${m.rodape.orkestra ? 'feito com Orkestra · ' : ''}${pageNumber}/${totalPages}`
        }
      />
    </View>
  );
}

function LinhaItem({ l, s, foto }: { l: LinhaInvestimento; s: Estilos; foto: Buffer | null }) {
  return (
    <View style={s.item} wrap={false}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
      {foto && <Image src={foto} style={s.foto} />}
      <View style={s.itemDescricao}>
        <Text style={s.itemNome}>{l.descricao}</Text>
        {l.texto && <Text style={s.itemTexto}>{l.texto}</Text>}
        {l.detalhe && <Text style={[s.detalhe, { marginTop: 2 }]}>{l.detalhe}</Text>}
      </View>
      <Text style={s.itemValor}>{l.valor}</Text>
    </View>
  );
}

/** Do aviso de validade até as observações: a mesma ordem de seções da web. */
function Corpo({ m, s, imagens }: { m: ModeloProposta; s: Estilos; imagens: ImagensProposta }) {
  const linhasEvento = [
    ['Cliente', m.evento.cliente],
    ['Tipo de festa', m.evento.tipo],
    ['Data', m.evento.data],
    ['Horário', m.evento.horario],
    ['Espaço', m.evento.espaco],
    ...m.evento.convidados.map((c) => [c.rotulo, String(c.quantidade)] as const),
  ]
    .filter((l): l is [string, string] => !!l[1])
    .map(([r, v]) => (
      <View key={r} style={s.linhaEvento} wrap={false}>
        <Text style={s.colRotulo}>{r}</Text>
        <Text style={s.colValor}>{v}</Text>
      </View>
    ));

  return (
    <>
      {m.validade.expirada && (
        <Text style={s.aviso}>{m.validade.texto}. Esta proposta não vale mais.</Text>
      )}

      {m.abertura && <Text style={s.abertura}>{m.abertura}</Text>}

      <Secao titulo="Evento" s={s}>
        {'cartaoEvento' in s ? (
          <View style={s.cartaoEvento}>{linhasEvento}</View>
        ) : (
          <View>{linhasEvento}</View>
        )}
        {m.evento.avisoDeslocamento && (
          <Text style={[s.detalhe, { marginTop: 4 }]}>{m.evento.avisoDeslocamento}</Text>
        )}
      </Secao>

      <Secao titulo="Investimento" s={s}>
        <View>
          {m.investimento.linhas.map((l, i) => (
            <LinhaItem key={i} l={l} s={s} foto={l.foto ? (imagens.fotos[l.foto] ?? null) : null} />
          ))}
          <View style={s.total} wrap={false}>
            <Text style={s.totalRotulo}>
              {m.visual === 'elegante' ? 'Investimento total' : 'Total'}
            </Text>
            <Text style={s.totalValor}>{m.investimento.total}</Text>
          </View>
          {m.investimento.porConvidado && (
            <Text style={s.porConvidado}>{m.investimento.porConvidado} por convidado</Text>
          )}
        </View>
      </Secao>

      <Secao titulo="Condições" s={s}>
        {m.condicoes.sinal && <Item texto={`Sinal de ${m.condicoes.sinal}`} s={s} />}
        {m.condicoes.parcelas.map((p) => (
          <Item key={p} texto={p} s={s} />
        ))}
        {m.condicoes.formasPagamento && (
          <Item texto={`Formas de pagamento: ${m.condicoes.formasPagamento}`} s={s} />
        )}
        {m.condicoes.ultimaParcela && <Item texto={m.condicoes.ultimaParcela} s={s} />}
        {m.condicoes.texto && (
          <Text style={[s.paragrafo, { marginTop: 4 }]}>{m.condicoes.texto}</Text>
        )}
      </Secao>

      {m.cardapio && (
        <Secao titulo={`Cardápio · ${m.cardapio.pacote}`} s={s}>
          {m.cardapio.secoes.map((sec) => {
            const foto = sec.foto ? (imagens.fotos[sec.foto] ?? null) : null;
            return (
              <View
                key={sec.nome}
                style={[s.cardapioSecao, foto ? { flexDirection: 'row' } : {}]}
                wrap={false}
              >
                {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
                {foto && <Image src={foto} style={s.fotoSecao} />}
                <View style={{ flex: 1 }}>
                  <Text style={s.cardapioNome}>{sec.nome}</Text>
                  <Text style={s.rotulo}>{sec.itens.join(', ')}</Text>
                </View>
              </View>
            );
          })}
        </Secao>
      )}

      {m.incluso && (m.incluso.duracao || m.incluso.naoIncluso) && (
        <Secao titulo="Incluso e não incluso" s={s}>
          {m.incluso.duracao && <Item texto={`Incluso: ${m.incluso.duracao}`} s={s} />}
          {m.incluso.naoIncluso && <Item texto={`Não incluso: ${m.incluso.naoIncluso}`} s={s} />}
        </Secao>
      )}

      {m.politicas && (m.politicas.cancelamento || m.politicas.alteracaoConvidados) && (
        <Secao titulo="Políticas" s={s}>
          {m.politicas.cancelamento && (
            <Item texto={`Cancelamento: ${m.politicas.cancelamento}`} s={s} />
          )}
          {m.politicas.alteracaoConvidados && (
            <Item texto={`Alteração de convidados: ${m.politicas.alteracaoConvidados}`} s={s} />
          )}
        </Secao>
      )}

      {m.observacoes && (
        <Secao titulo="Observações" s={s}>
          <Text>{m.observacoes}</Text>
        </Secao>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

function PaginasElegante({ m, imagens }: { m: ModeloProposta; imagens: ImagensProposta }) {
  const s = estilosElegante(m);
  const evento = [m.evento.tipo, m.evento.data].filter(Boolean).join('  ·  ');
  return (
    <>
      {/* Capa: identidade, para quem e para quando. O logo já é o destaque (sem marca d'água). */}
      <Page size="A4" style={s.capa}>
        <View style={s.capaCentro}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
          {imagens.logoInteiro && <Image src={imagens.logoInteiro} style={s.capaLogo} />}
          <Text style={s.capaBuffet}>{m.cabecalho.buffet}</Text>
          <View style={s.capaFio} />
          {m.evento.cliente && (
            <>
              <Text style={s.capaPara}>Proposta para</Text>
              <Text style={s.capaCliente}>{m.evento.cliente}</Text>
            </>
          )}
          {evento && <Text style={s.capaEvento}>{evento}</Text>}
        </View>
        <View style={s.capaRodape}>
          <Text>{m.cabecalho.titulo}</Text>
          <Text>
            {m.cabecalho.emitidaEm ? `Emitida em ${m.cabecalho.emitidaEm} · ` : ''}
            {m.cabecalho.validade}
          </Text>
        </View>
      </Page>

      <Page size="A4" style={s.pagina}>
        <MarcaDagua logo={imagens.marcaDagua} s={s} />
        <View style={s.cabecalhoFixo} fixed>
          <Text style={s.cabecalhoBuffet}>{m.cabecalho.buffet}</Text>
          <Text style={s.cabecalhoNumero}>
            Proposta nº {m.cabecalho.numero} · versão {m.cabecalho.versao}
          </Text>
        </View>
        <Corpo m={m} s={s} imagens={imagens} />
        <Rodape m={m} s={s} />
      </Page>
    </>
  );
}

function PaginasAlegre({ m, imagens }: { m: ModeloProposta; imagens: ImagensProposta }) {
  const s = estilosAlegre(m);
  return (
    <Page size="A4" style={s.pagina}>
      <MarcaDagua logo={imagens.marcaDagua} s={s} />
      <View style={s.faixa}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
        {imagens.logo && <Image src={imagens.logo} style={s.logo} />}
        <View style={{ flex: 1 }}>
          <Text style={s.buffet}>{m.cabecalho.buffet}</Text>
          <Text style={s.titulo}>{m.cabecalho.titulo}</Text>
          <Text style={s.datas}>
            {m.cabecalho.emitidaEm ? `Emitida em ${m.cabecalho.emitidaEm} · ` : ''}
            {m.cabecalho.validade}
          </Text>
        </View>
      </View>
      <Corpo m={m} s={s} imagens={imagens} />
      <Rodape m={m} s={s} />
    </Page>
  );
}

export function DocumentoProposta({
  modelo: m,
  imagens = SEM_IMAGENS,
}: {
  modelo: ModeloProposta;
  imagens?: ImagensProposta;
}) {
  return (
    <Document
      title={`${m.cabecalho.titulo} - ${m.cabecalho.buffet}`}
      author={m.cabecalho.buffet}
      creator="Orkestra"
      producer="Orkestra"
      language="pt-BR"
    >
      {m.visual === 'elegante' ? (
        <PaginasElegante m={m} imagens={imagens} />
      ) : (
        <PaginasAlegre m={m} imagens={imagens} />
      )}
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Imagens do Storage (WEBP) → PNG/JPEG
// ---------------------------------------------------------------------------

/** Executa com prazo total (download + conversão): estourou ou falhou, null. */
async function comPrazo<T>(prazoMs: number, fn: (sinal: AbortSignal) => Promise<T | null>) {
  const sinal = AbortSignal.timeout(prazoMs);
  const tarefa = fn(sinal);
  let relogio: NodeJS.Timeout | undefined;
  const prazo = new Promise<null>((ok) => {
    relogio = setTimeout(() => ok(null), prazoMs);
  });
  try {
    return await Promise.race([tarefa, prazo]);
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
    tarefa.catch(() => {});
  }
}

async function baixar(url: string, sinal: AbortSignal): Promise<Buffer | null> {
  const resposta = await fetch(url, { signal: sinal });
  if (!resposta.ok) return null;
  return Buffer.from(await resposta.arrayBuffer());
}

const quadrado = (b: Buffer) => sharp(b).resize(240, 240, { fit: 'cover' }).png().toBuffer();
const inteiro = (b: Buffer, lado: number) =>
  sharp(b)
    .resize(lado, lado, { fit: 'inside', withoutEnlargement: true })
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();

/** Logo do Storage (WEBP) → PNG quadrado de 240 px. Falhou ou demorou: sem logo. */
export async function logoEmPng(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  return comPrazo(2500, async (sinal) => {
    const original = await baixar(url, sinal);
    return original ? quadrado(original) : null;
  });
}

/** Logo inteiro (sem recorte, até 512 px) em PNG com transparência. */
export async function logoInteiroEmPng(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  return comPrazo(2500, async (sinal) => {
    const original = await baixar(url, sinal);
    return original ? inteiro(original, 512) : null;
  });
}

/** Foto de item → JPEG de até 600 px de largura. Falhou ou passou de 3 s: item sem foto. */
export async function fotoEmJpeg(url: string | null, prazoMs = 3000): Promise<Buffer | null> {
  if (!url) return null;
  return comPrazo(prazoMs, async (sinal) => {
    const original = await baixar(url, sinal);
    if (!original) return null;
    return sharp(original)
      .resize({ width: 600, withoutEnlargement: true })
      .flatten({ background: '#FFFFFF' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  });
}

/** Logo nas três formas usadas pelo PDF, com um download só. */
async function logosDaProposta(m: ModeloProposta) {
  const url = m.cabecalho.logoUrl;
  const vazio = { logo: null, logoInteiro: null, marcaDagua: null };
  if (!url) return vazio;
  return (
    (await comPrazo(2500, async (sinal) => {
      const original = await baixar(url, sinal);
      if (!original) return null;
      const [logo, logoInteiro, marcaDagua] = await Promise.all([
        m.visual === 'alegre' ? quadrado(original) : null,
        m.visual === 'elegante' ? inteiro(original, 512) : null,
        inteiro(original, 280),
      ]);
      return { logo, logoInteiro, marcaDagua };
    })) ?? vazio
  );
}

/** Todas as imagens da proposta, em paralelo. */
export async function carregarImagensProposta(m: ModeloProposta): Promise<ImagensProposta> {
  const urls = [
    ...new Set(
      [
        ...m.investimento.linhas.map((l) => l.foto),
        ...(m.cardapio?.secoes.map((sec) => sec.foto) ?? []),
      ].filter((u): u is string => !!u),
    ),
  ];
  const [logos, ...fotos] = await Promise.all([
    logosDaProposta(m),
    ...urls.map((u) => fotoEmJpeg(u)),
  ]);
  return {
    ...logos,
    fotos: Object.fromEntries(urls.flatMap((u, i) => (fotos[i] ? [[u, fotos[i]] as const] : []))),
  };
}

export async function gerarPdfProposta(modelo: ModeloProposta): Promise<Buffer> {
  const imagens = await carregarImagensProposta(modelo);
  return renderToBuffer(<DocumentoProposta modelo={modelo} imagens={imagens} />);
}
