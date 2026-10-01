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
import type { ModeloProposta } from '@/domain/proposta';

/*
 * PDF da proposta, gerado no servidor a partir do MESMO ModeloProposta da web (nenhuma regra
 * aqui: só desenho). A4, Manrope embutida, cor do buffet com contraste AA.
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
// Sem hifenização automática (quebra palavras em português de forma estranha).
Font.registerHyphenationCallback((palavra) => [palavra]);

const CINZA = '#5F5B6E';
const BORDA = '#E6E4EE';
const TEXTO = '#16141F';

function estilos(m: ModeloProposta) {
  return StyleSheet.create({
    pagina: {
      fontFamily: 'Manrope',
      fontSize: 10,
      color: TEXTO,
      paddingTop: 36,
      paddingBottom: 64,
      paddingHorizontal: 44,
      lineHeight: 1.45,
    },
    faixa: {
      backgroundColor: m.cores.base,
      color: m.cores.texto,
      marginHorizontal: -44,
      marginTop: -36,
      paddingHorizontal: 44,
      paddingVertical: 22,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    logo: {
      width: 52,
      height: 52,
      borderRadius: 26,
      objectFit: 'cover',
      backgroundColor: '#FFFFFF',
    },
    buffet: { fontSize: 15, fontWeight: 800 },
    titulo: { fontSize: 11, fontWeight: 600, marginTop: 2 },
    datas: { fontSize: 9, marginTop: 2 },
    secao: { marginTop: 18 },
    tituloSecao: {
      fontSize: 11.5,
      fontWeight: 800,
      color: m.cores.destaque,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    paragrafo: { marginBottom: 4 },
    rotulo: { color: CINZA },
    linhaEvento: { flexDirection: 'row', marginBottom: 2 },
    colRotulo: { width: 110, color: CINZA },
    colValor: { flex: 1, fontWeight: 600 },
    tabelaCabecalho: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: BORDA,
      paddingBottom: 4,
      marginBottom: 2,
      color: CINZA,
      fontSize: 8.5,
      textTransform: 'uppercase',
    },
    item: {
      flexDirection: 'row',
      paddingVertical: 5,
      borderBottomWidth: 0.5,
      borderBottomColor: BORDA,
    },
    itemDescricao: { flex: 1, paddingRight: 12 },
    itemValor: { width: 90, textAlign: 'right', fontWeight: 600 },
    detalhe: { color: CINZA, fontSize: 8.5 },
    total: {
      flexDirection: 'row',
      marginTop: 8,
      padding: 10,
      backgroundColor: m.cores.suave,
      borderRadius: 6,
      alignItems: 'center',
    },
    totalRotulo: { flex: 1, fontWeight: 800, fontSize: 12 },
    totalValor: { fontWeight: 800, fontSize: 16 },
    porConvidado: { textAlign: 'right', color: CINZA, marginTop: 4 },
    aviso: {
      marginTop: 12,
      padding: 8,
      borderRadius: 6,
      backgroundColor: '#FEF3C7',
      color: '#78350F',
      fontWeight: 600,
    },
    lista: { marginBottom: 2, flexDirection: 'row' },
    marcador: { width: 10, color: m.cores.destaque },
    rodape: {
      position: 'absolute',
      bottom: 22,
      left: 44,
      right: 44,
      borderTopWidth: 0.5,
      borderTopColor: BORDA,
      paddingTop: 6,
      fontSize: 7.5,
      color: CINZA,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  });
}

type Estilos = ReturnType<typeof estilos>;

function Secao({ titulo, s, children }: { titulo: string; s: Estilos; children: React.ReactNode }) {
  return (
    <View style={s.secao}>
      {/* minPresenceAhead: o título nunca fica sozinho no fim da página */}
      <Text style={s.tituloSecao} minPresenceAhead={48}>
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

export function DocumentoProposta({
  modelo: m,
  logo,
}: {
  modelo: ModeloProposta;
  logo: Buffer | null;
}) {
  const s = estilos(m);
  return (
    <Document
      title={`${m.cabecalho.titulo} - ${m.cabecalho.buffet}`}
      author={m.cabecalho.buffet}
      creator="Orkestra"
      producer="Orkestra"
      language="pt-BR"
    >
      <Page size="A4" style={s.pagina}>
        <View style={s.faixa}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
          {logo && <Image src={logo} style={s.logo} />}
          <View style={{ flex: 1 }}>
            <Text style={s.buffet}>{m.cabecalho.buffet}</Text>
            <Text style={s.titulo}>{m.cabecalho.titulo}</Text>
            <Text style={s.datas}>
              {m.cabecalho.emitidaEm ? `Emitida em ${m.cabecalho.emitidaEm} · ` : ''}
              {m.cabecalho.validade}
            </Text>
          </View>
        </View>

        {m.validade.expirada && (
          <Text style={s.aviso}>{m.validade.texto}. Esta proposta não vale mais.</Text>
        )}

        {m.abertura && (
          <View style={s.secao}>
            <Text>{m.abertura}</Text>
          </View>
        )}

        <Secao titulo="Evento" s={s}>
          {[
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
            ))}
          {m.evento.avisoDeslocamento && (
            <Text style={[s.detalhe, { marginTop: 4 }]}>{m.evento.avisoDeslocamento}</Text>
          )}
        </Secao>

        <Secao titulo="Investimento" s={s}>
          <View>
            <View style={s.tabelaCabecalho} fixed>
              <Text style={s.itemDescricao}>Item</Text>
              <Text style={s.itemValor}>Valor</Text>
            </View>
            {m.investimento.linhas.map((l, i) => (
              <View key={i} style={s.item} wrap={false}>
                <View style={s.itemDescricao}>
                  <Text style={{ fontWeight: 600 }}>{l.descricao}</Text>
                  {l.detalhe && <Text style={s.detalhe}>{l.detalhe}</Text>}
                </View>
                <Text style={s.itemValor}>{l.valor}</Text>
              </View>
            ))}
            <View style={s.total} wrap={false}>
              <Text style={s.totalRotulo}>Total</Text>
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
            {m.cardapio.secoes.map((sec) => (
              <View key={sec.nome} style={{ marginBottom: 6 }} wrap={false}>
                <Text style={{ fontWeight: 600 }}>{sec.nome}</Text>
                <Text style={s.rotulo}>{sec.itens.join(', ')}</Text>
              </View>
            ))}
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

        <View style={s.rodape} fixed>
          <Text style={{ flex: 1 }}>{m.rodape.linhas.join(' · ')}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${m.rodape.orkestra ? 'feito com Orkestra · ' : ''}${pageNumber}/${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/** Logo do Storage (WEBP) → PNG para o PDF. Falhou ou demorou: o PDF sai sem logo. */
async function logoEmPng(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!resposta.ok) return null;
    const original = Buffer.from(await resposta.arrayBuffer());
    return await sharp(original).resize(240, 240, { fit: 'cover' }).png().toBuffer();
  } catch {
    return null;
  }
}

export async function gerarPdfProposta(modelo: ModeloProposta): Promise<Buffer> {
  const logo = await logoEmPng(modelo.cabecalho.logoUrl);
  return renderToBuffer(<DocumentoProposta modelo={modelo} logo={logo} />);
}
