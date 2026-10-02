import type { Metadata } from 'next';
import { PreferenciasAvisos } from '@/components/app/avisos/preferencias';
import { PushAparelho } from '@/components/app/avisos/push-aparelho';
import { TesteAviso } from '@/components/app/avisos/teste-aviso';
import { WhatsappAvisos } from '@/components/app/avisos/whatsapp-avisos';
import { ReativarChecklist } from '@/components/app/onboarding/reativar-checklist';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarPreferencias } from '@/server/avisos/carregar';
import { carregarChecklist } from '@/server/onboarding/carregar';
import { configVapid, configWhatsapp } from '@/server/env';

export const metadata: Metadata = { title: 'Avisos' };

function Bloco({
  titulo,
  descricao,
  children,
  id,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section aria-labelledby={id} className="bg-card rounded-card flex flex-col gap-3 p-4 md:p-5">
      <div>
        <h2 id={id} className="text-lg font-semibold">
          {titulo}
        </h2>
        {descricao && <p className="text-muted-foreground text-sm">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

/** Minha conta → Avisos: cada usuário escolhe onde e quando quer ser avisado. */
export default async function ContaAvisosPage() {
  const usuario = await exigirSessao();
  const [p, checklist] = await Promise.all([
    carregarPreferencias(usuario),
    carregarChecklist(usuario),
  ]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <TituloPagina>Avisos</TituloPagina>
      <p className="text-muted-foreground -mt-4 text-sm">
        Você só é avisado quando há algo a fazer. Todo aviso fica no sino do painel; celular e
        WhatsApp são opcionais.
      </p>
      <Bloco
        id="avisos-aparelho"
        titulo="Avisos neste celular"
        descricao="Notificação mesmo com o painel fechado."
      >
        <PushAparelho chavePublica={configVapid()?.publica ?? null} aparelhos={p.aparelhos} />
      </Bloco>
      <Bloco id="avisos-tipos" titulo="O que você quer receber">
        <PreferenciasAvisos
          dono={usuario.perfil === 'dono'}
          inicial={{
            canais: p.canais,
            disponiveis: p.disponiveis,
            silencioInicio: p.silencioInicio,
            silencioFim: p.silencioFim,
            receberDeVendedores: p.receberDeVendedores,
          }}
        />
      </Bloco>
      <Bloco
        id="avisos-whatsapp"
        titulo="WhatsApp"
        descricao="Pela conta oficial do Orkestra no WhatsApp, só para você (nunca para o cliente)."
      >
        <WhatsappAvisos
          ativo={p.whatsappAtivo}
          numero={p.whatsappNumero}
          aceiteEm={p.whatsappAceiteEm}
          configurado={configWhatsapp() !== null}
        />
      </Bloco>
      <Bloco
        id="avisos-teste"
        titulo="Testar"
        descricao="Sai em todos os canais ligados, sem esperar o silêncio."
      >
        <TesteAviso />
      </Bloco>
      <Bloco
        id="conta-checklist"
        titulo="Checklist do link"
        descricao={`O checklist "Seu link está ${checklist.percentual}% pronto" aparece no topo da caixa de leads.`}
      >
        <ReativarChecklist dispensado={checklist.dispensado} />
      </Bloco>
    </div>
  );
}
