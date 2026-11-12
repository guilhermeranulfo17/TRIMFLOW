import 'server-only';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { FichaCozinha } from '@/domain/ficha/cozinha';
// registra as fontes (Manrope) e a hifenização do motor de PDF da proposta
import '@/server/proposta/pdf';

/*
 * PDF da ficha da cozinha (Fase 4): o mesmo motor da proposta, sem preço nenhum. Letra grande e
 * listas de um item por linha, para ler de longe na cozinha.
 */

const CINZA = '#575B57';
const BORDA = '#D9DCD9';

const s = StyleSheet.create({
  pagina: {
    fontFamily: 'Manrope',
    fontSize: 11,
    color: '#161616',
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    lineHeight: 1.4,
  },
  topo: { borderBottomWidth: 2, borderBottomColor: '#161616', paddingBottom: 8, marginBottom: 6 },
  rotuloTopo: { fontSize: 9, color: CINZA, textTransform: 'uppercase', letterSpacing: 1 },
  titulo: { fontSize: 20, fontWeight: 800, marginTop: 2 },
  secao: { marginTop: 16 },
  tituloSecao: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    borderBottomWidth: 1,
    borderBottomColor: BORDA,
    paddingBottom: 3,
    marginBottom: 6,
  },
  linha: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDA,
  },
  colRotulo: { width: 130, color: CINZA },
  colValor: { flex: 1, fontWeight: 600 },
  item: { flex: 1 },
  qtd: { width: 170, textAlign: 'right', fontWeight: 600 },
  secaoCardapio: { marginTop: 6, fontWeight: 800 },
  marcador: { width: 12 },
  total: { flexDirection: 'row', paddingTop: 4, fontWeight: 800 },
  obs: { borderWidth: 1, borderColor: '#161616', borderRadius: 4, padding: 8, marginBottom: 4 },
  rodape: {
    position: 'absolute',
    bottom: 22,
    left: 40,
    right: 40,
    fontSize: 8,
    color: CINZA,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={s.secao}>
      <Text style={s.tituloSecao} minPresenceAhead={40} wrap={false}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

export function DocumentoFicha({ ficha: f }: { ficha: FichaCozinha }) {
  return (
    <Document
      title={f.titulo}
      author={f.buffet}
      creator="Orkestra"
      producer="Orkestra"
      language="pt-BR"
    >
      <Page size="A4" style={s.pagina}>
        <View style={s.topo}>
          <Text style={s.rotuloTopo}>{f.buffet} · Ficha da cozinha</Text>
          <Text style={s.titulo}>{f.evento.find((e) => e.rotulo === 'Cliente')?.valor}</Text>
        </View>

        <Secao titulo="Evento">
          {f.evento
            .filter((e) => e.rotulo !== 'Cliente')
            .map((e) => (
              <View key={e.rotulo} style={s.linha} wrap={false}>
                <Text style={s.colRotulo}>{e.rotulo}</Text>
                <Text style={s.colValor}>{e.valor}</Text>
              </View>
            ))}
        </Secao>

        <Secao titulo="Convidados">
          {f.convidados.map((c) => (
            <View key={c.rotulo} style={s.linha} wrap={false}>
              <Text style={s.item}>{c.rotulo}</Text>
              <Text style={s.qtd}>{c.quantidade}</Text>
            </View>
          ))}
          <View style={s.total} wrap={false}>
            <Text style={s.item}>Total</Text>
            <Text style={s.qtd}>{f.totalConvidados}</Text>
          </View>
        </Secao>

        {(f.pacote || f.cardapio.length > 0) && (
          <Secao titulo={f.pacote ? `Pacote ${f.pacote.item}` : 'Cardápio'}>
            {f.pacote?.quantidade && <Text style={{ color: CINZA }}>{f.pacote.quantidade}</Text>}
            {f.cardapio.map((sec) => (
              <View key={sec.secao} wrap={false}>
                <Text style={s.secaoCardapio}>{sec.secao}</Text>
                {sec.itens.map((i) => (
                  <View key={i} style={{ flexDirection: 'row' }}>
                    <Text style={s.marcador}>•</Text>
                    <Text style={s.item}>{i}</Text>
                  </View>
                ))}
              </View>
            ))}
          </Secao>
        )}

        {f.retirados.length > 0 && (
          <Secao titulo="Retirado do pacote (não servir)">
            {f.retirados.map((r) => (
              <View key={r} style={{ flexDirection: 'row' }} wrap={false}>
                <Text style={s.marcador}>×</Text>
                <Text style={s.item}>{r}</Text>
              </View>
            ))}
          </Secao>
        )}

        {f.opcionais.length > 0 && (
          <Secao titulo="Opcionais">
            {f.opcionais.map((o) => (
              <View key={o.item} style={s.linha} wrap={false}>
                <Text style={s.item}>{o.item}</Text>
                <Text style={s.qtd}>{o.quantidade ?? ''}</Text>
              </View>
            ))}
          </Secao>
        )}

        {f.observacoes.length > 0 && (
          <Secao titulo="Observações">
            {f.observacoes.map((o) => (
              <Text key={o} style={s.obs}>
                {o}
              </Text>
            ))}
          </Secao>
        )}

        <View style={s.rodape} fixed>
          <Text>{f.titulo}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function gerarPdfFicha(ficha: FichaCozinha): Promise<Buffer> {
  return renderToBuffer(<DocumentoFicha ficha={ficha} />);
}
