import { eq, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { QrCodigo } from '@/components/app/divulgacao/qr-codigo';
import { CabecalhoPasso } from '@/components/app/onboarding/comecar/navegacao';
import { PassoAgenda } from '@/components/app/onboarding/comecar/passo-agenda';
import { PassoIdentidade } from '@/components/app/onboarding/comecar/passo-identidade';
import { PassoModelo } from '@/components/app/onboarding/comecar/passo-modelo';
import { PassoPrecos } from '@/components/app/onboarding/comecar/passo-precos';
import { PassoPronto } from '@/components/app/onboarding/comecar/passo-pronto';
import { bioInstagram, respostaAutomaticaWhatsApp } from '@/domain/divulgacao/textos';
import { passoValido, podeIrPara } from '@/domain/onboarding/passos';
import { linkComOrigem } from '@/domain/publico/origem';
import { ROTULO_SEGMENTO } from '@/domain/segmento';
import { exigirSessao } from '@/server/auth/sessao';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { siteUrl } from '@/server/env';
import {
  carregarAgendaRapida,
  carregarEstadoOnboarding,
  carregarPrecos,
  carregarResumoModelo,
} from '@/server/onboarding/carregar';

export const metadata: Metadata = { title: 'Configure seu link' };

type Props = { searchParams: Promise<{ passo?: string }> };

/**
 * Onboarding guiado: modelo → identidade → preços → agenda → pronto. O passo fica salvo no
 * servidor (empresas.onboarding_passo): fechar e voltar continua de onde parou.
 */
export default async function PaginaComecar({ searchParams }: Props) {
  const usuario = await exigirSessao();
  if (usuario.perfil !== 'dono') redirect('/app/leads');
  const busca = await searchParams;
  const estado = await carregarEstadoOnboarding(usuario);
  if (!estado.iniciadoEm) {
    // marca o início (mede o tempo do onboarding) sem mudar o passo
    await comUsuario(usuario.id, (tx) =>
      tx.execute(sql`select public.avancar_onboarding(${estado.passo}::smallint)`),
    );
  }
  const pedido = busca.passo ? passoValido(busca.passo) : estado.passo;
  const passo = podeIrPara(pedido, estado.temPacoteConfirmado) ? pedido : 3;

  const [empresa] = await comUsuario(usuario.id, (tx) =>
    tx.select().from(empresas).where(eq(empresas.id, usuario.empresa.id)),
  );
  if (!empresa) redirect('/app/leads');
  const link = `${siteUrl()}/b/${empresa.slug}`;

  let conteudo: React.ReactNode;
  switch (passo) {
    case 1:
      conteudo = (
        <PassoModelo
          resumo={await carregarResumoModelo(usuario)}
          vazio={estado.catalogoVazio}
          segmento={ROTULO_SEGMENTO[empresa.segmento].toLowerCase()}
        />
      );
      break;
    case 2:
      conteudo = (
        <PassoIdentidade
          empresaId={empresa.id}
          logoPath={empresa.logoPath}
          inicial={{
            nome: empresa.nome,
            whatsappE164: empresa.whatsappE164 ?? '',
            email: empresa.email ?? '',
            cidade: empresa.cidade ?? '',
            uf: (empresa.uf ?? '') as '',
            fuso: empresa.fuso,
            corMarca: empresa.corMarca,
            sobre: empresa.sobre ?? '',
          }}
        />
      );
      break;
    case 3: {
      const precos = await carregarPrecos(usuario);
      conteudo = <PassoPrecos pacotes={precos.pacotes} opcionais={precos.opcionais} />;
      break;
    }
    case 4:
      conteudo = <PassoAgenda inicial={await carregarAgendaRapida(usuario)} />;
      break;
    default: {
      const dados = { nome: empresa.nome, link, cidade: empresa.cidade };
      conteudo = (
        <PassoPronto
          link={link}
          slug={empresa.slug}
          qr={<QrCodigo link={linkComOrigem(link, 'qrcode')} />}
          textos={[
            { chave: 'bio', titulo: 'Bio do Instagram', texto: bioInstagram(dados) },
            {
              chave: 'resposta',
              titulo: 'Resposta automática do WhatsApp Business',
              texto: respostaAutomaticaWhatsApp(dados),
            },
          ]}
        />
      );
    }
  }

  return (
    <>
      <CabecalhoPasso passo={passo} />
      {conteudo}
    </>
  );
}
