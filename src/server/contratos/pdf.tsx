import 'server-only';
import { Document, Page, StyleSheet, Text, View, renderToBuffer, Image } from '@react-pdf/renderer';
import {
  FRASE_COMPROVANTE,
  ROTULO_METODO,
  blocosDoTexto,
  hashEmBlocos,
  instanteComprovante,
} from '@/domain/contratos';
import { coresDaMarca } from '@/domain/publico/cor';
// importar o PDF da proposta registra a Manrope e desliga a hifenização (mesmo desenho)
import { logoEmPng } from '@/server/proposta/pdf';
import type { Comprovante } from './carregar';

/*
 * PDF final do contrato (Etapa 10): cabeçalho do buffet, texto completo (o mesmo que foi
 * assinado, desenhado a partir dos blocos), bloco de assinaturas e a página de comprovante.
 * Gerado só depois da assinatura do cliente. Só desenho: nenhuma regra aqui.
 */

export type IdentidadePdf = { nome: string; logoUrl: string | null; corMarca: string | null };

const CINZA = '#575B57';
const BORDA = '#E3E5E3';
const TEXTO = '#161616';

function estilos(cor: string | null) {
  const c = coresDaMarca(cor);
  return StyleSheet.create({
    pagina: {
      fontFamily: 'Manrope',
      fontSize: 10,
      color: TEXTO,
      paddingTop: 36,
      paddingBottom: 64,
      paddingHorizontal: 48,
      lineHeight: 1.5,
    },
    faixa: {
      backgroundColor: c.base,
      color: c.texto,
      marginHorizontal: -48,
      marginTop: -36,
      marginBottom: 18,
      paddingHorizontal: 48,
      paddingVertical: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    logo: { width: 44, height: 44, borderRadius: 22, objectFit: 'cover', backgroundColor: '#FFF' },
    buffet: { fontSize: 14, fontWeight: 800 },
    sub: { fontSize: 9, marginTop: 2 },
    titulo: { fontSize: 14, fontWeight: 800, marginBottom: 8, textAlign: 'center' },
    clausula: {
      fontSize: 10.5,
      fontWeight: 800,
      color: c.destaque,
      marginTop: 10,
      marginBottom: 3,
    },
    paragrafo: { marginBottom: 5, textAlign: 'justify' },
    item: { flexDirection: 'row', marginBottom: 2, paddingLeft: 6 },
    marcador: { width: 10, color: c.destaque },
    assinaturas: { marginTop: 22, flexDirection: 'row', gap: 16 },
    caixa: { flex: 1, borderTopWidth: 1, borderTopColor: TEXTO, paddingTop: 6 },
    rotulo: { color: CINZA, fontSize: 8.5 },
    forte: { fontWeight: 600 },
    tituloComprovante: { fontSize: 13, fontWeight: 800, marginBottom: 4 },
    quadro: { borderWidth: 1, borderColor: BORDA, borderRadius: 6, padding: 10, marginTop: 10 },
    linha: { flexDirection: 'row', marginBottom: 3 },
    colRotulo: { width: 120, color: CINZA },
    colValor: { flex: 1 },
    hash: { fontSize: 9, letterSpacing: 0.4 },
    frase: { marginTop: 14, fontSize: 9, color: CINZA },
    rodape: {
      position: 'absolute',
      bottom: 28,
      left: 48,
      right: 48,
      fontSize: 8,
      color: CINZA,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  });
}

type Estilos = ReturnType<typeof estilos>;

function Linha({ r, v, s }: { r: string; v: string; s: Estilos }) {
  return (
    <View style={s.linha} wrap={false}>
      <Text style={s.colRotulo}>{r}</Text>
      <Text style={s.colValor}>{v}</Text>
    </View>
  );
}

export function DocumentoContrato({
  c,
  buffet,
  logo,
}: {
  c: Comprovante;
  buffet: IdentidadePdf;
  logo: Buffer | null;
}) {
  const s = estilos(buffet.corMarca);
  const blocos = blocosDoTexto(c.texto);
  const doBuffet = c.assinaturas.find((a) => a.parte === 'buffet');
  const doCliente = c.assinaturas.find((a) => a.parte === 'cliente');
  const rodape = (
    <View style={s.rodape} fixed>
      <Text>
        Contrato {c.codigo} · versão {c.versao}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
  return (
    <Document
      title={`Contrato ${c.codigo} - ${buffet.nome}`}
      author={buffet.nome}
      creator="Orkestra"
      producer="Orkestra"
      language="pt-BR"
    >
      <Page size="A4" style={s.pagina}>
        <View style={s.faixa}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
          {logo && <Image src={logo} style={s.logo} />}
          <View style={{ flex: 1 }}>
            <Text style={s.buffet}>{buffet.nome}</Text>
            <Text style={s.sub}>
              {[doBuffet?.representa, doBuffet?.documento].filter(Boolean).join(' · ')}
            </Text>
            <Text style={s.sub}>
              Contrato nº {c.codigo}
              {c.versao > 1 ? ` (versão ${c.versao})` : ''}
            </Text>
          </View>
        </View>

        {blocos.map((b, i) => {
          if (b.tipo === 'titulo')
            return (
              <Text key={i} style={s.titulo}>
                {b.texto}
              </Text>
            );
          if (b.tipo === 'clausula')
            return (
              <Text key={i} style={s.clausula} minPresenceAhead={40}>
                {b.texto}
              </Text>
            );
          if (b.tipo === 'lista')
            return (
              <View key={i} style={{ marginBottom: 5 }}>
                {b.itens.map((it, j) => (
                  <View key={j} style={s.item} wrap={false}>
                    <Text style={s.marcador}>•</Text>
                    <Text style={{ flex: 1 }}>{it}</Text>
                  </View>
                ))}
              </View>
            );
          return (
            <Text key={i} style={s.paragrafo}>
              {b.texto}
            </Text>
          );
        })}

        <View style={s.assinaturas} wrap={false}>
          {[doBuffet, doCliente].map((a, i) => (
            <View key={i} style={s.caixa}>
              <Text style={s.forte}>{a?.nome ?? ''}</Text>
              <Text style={s.rotulo}>
                {i === 0 ? `CONTRATADO · ${a?.representa ?? buffet.nome}` : 'CONTRATANTE'}
              </Text>
              <Text style={s.rotulo}>
                {a ? `Assinado eletronicamente em ${instanteComprovante(a.assinadoEm)}` : ''}
              </Text>
            </View>
          ))}
        </View>
        {rodape}
      </Page>

      <Page size="A4" style={s.pagina}>
        <Text style={s.tituloComprovante}>Comprovante de assinatura eletrônica</Text>
        <Text style={s.rotulo}>
          Registro feito pelo Orkestra no momento de cada assinatura.
          {c.ehTeste ? ' Contrato de teste: sem valor.' : ''}
        </Text>

        <View style={s.quadro} wrap={false}>
          <Linha r="Contrato" v={`${c.codigo} · versão ${c.versao}`} s={s} />
          <Linha r="Título" v={c.titulo} s={s} />
          <Linha r="Enviado em" v={instanteComprovante(c.enviadoEm)} s={s} />
          <Linha r="Concluído em" v={instanteComprovante(c.concluidoEm)} s={s} />
          <View style={s.linha} wrap={false}>
            <Text style={s.colRotulo}>Impressão digital (SHA-256)</Text>
            <Text style={[s.colValor, s.hash]}>{hashEmBlocos(c.hash)}</Text>
          </View>
        </View>

        {c.assinaturas.map((a) => (
          <View key={a.parte} style={s.quadro} wrap={false}>
            <Text style={[s.forte, { marginBottom: 4 }]}>
              {a.parte === 'buffet' ? 'CONTRATADO (buffet)' : 'CONTRATANTE (cliente)'}
            </Text>
            <Linha r="Nome" v={a.nome} s={s} />
            {a.representa && <Linha r="Representando" v={a.representa} s={s} />}
            {a.documento && (
              <Linha r={a.parte === 'cliente' ? 'CPF' : 'Documento'} v={a.documento} s={s} />
            )}
            <Linha r="Data e hora" v={instanteComprovante(a.assinadoEm)} s={s} />
            <Linha r="IP (identificador)" v={a.ip ? `${a.ip}…` : 'não registrado'} s={s} />
            <Linha r="Forma de aceite" v={ROTULO_METODO[a.metodo]} s={s} />
            <Linha
              r="Texto assinado confere"
              v={a.hashDocumento === c.hash ? 'Sim (mesma impressão digital)' : 'Não'}
              s={s}
            />
          </View>
        ))}

        <Text style={s.frase}>{FRASE_COMPROVANTE}</Text>
        <Text style={[s.frase, { marginTop: 6 }]}>
          Para conferir: a impressão digital acima é o código SHA-256 do texto do contrato. Qualquer
          mudança no texto, mesmo de uma vírgula, gera outro código.
        </Text>
        {rodape}
      </Page>
    </Document>
  );
}

export async function gerarPdfContrato(c: Comprovante, buffet: IdentidadePdf): Promise<Buffer> {
  const logo = await logoEmPng(buffet.logoUrl);
  return renderToBuffer(<DocumentoContrato c={c} buffet={buffet} logo={logo} />);
}
