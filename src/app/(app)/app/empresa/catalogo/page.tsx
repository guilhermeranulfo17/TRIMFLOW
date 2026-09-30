import { asc } from 'drizzle-orm';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkTestarPrecos } from '@/components/app/empresa/link-testar-precos';
import { Button } from '@/components/ui/button';
import { resumirPrecoOpcional, resumirPrecoPacote } from '@/domain/catalogo/resumo';
import { urlPublicaMidia } from '@/lib/midia';
import { exigirSessao } from '@/server/auth/sessao';
import { faixasPreco, opcionais, pacotes, tiposEvento } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { BotaoCarregarModelo } from '../simulador/botao-carregar-modelo';
import { CardsOpcionais, CardsPacotes, ListaTipos } from './listas';

export const metadata: Metadata = { title: 'Catálogo' };

function Cabecalho({
  id,
  titulo,
  descricao,
  acao,
}: {
  id: string;
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-bold">
          {titulo}
        </h2>
        <p className="text-muted-foreground text-sm">{descricao}</p>
      </div>
      {acao}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card text-muted-foreground border border-dashed px-4 py-6 text-center text-sm">
      {children}
    </div>
  );
}

export default async function CatalogoPage() {
  const usuario = await exigirSessao();
  const somenteLeitura = usuario.perfil !== 'dono';
  const dados = await comUsuario(usuario.id, async (tx) => ({
    tipos: await tx
      .select({
        id: tiposEvento.id,
        nome: tiposEvento.nome,
        icone: tiposEvento.icone,
        ativo: tiposEvento.ativo,
      })
      .from(tiposEvento)
      .orderBy(asc(tiposEvento.ordem), asc(tiposEvento.nome)),
    pacotes: await tx.select().from(pacotes).orderBy(asc(pacotes.ordem), asc(pacotes.nome)),
    faixas: await tx.select().from(faixasPreco),
    opcionais: await tx.select().from(opcionais).orderBy(asc(opcionais.ordem), asc(opcionais.nome)),
  }));

  const cardsPacotes = dados.pacotes.map((p) => {
    const resumo = resumirPrecoPacote({
      ...p,
      faixas: dados.faixas.filter((f) => f.pacoteId === p.id),
    });
    return {
      id: p.id,
      nome: p.nome,
      ativo: p.ativo,
      destaque: p.destaque,
      imagemUrl: urlPublicaMidia(p.fotos[0]),
      resumo: resumo === 'Sem preço' ? (p.subtitulo ?? '') : resumo,
      alerta: resumo === 'Sem preço' ? 'Sem preço: defina o preço para vender este pacote.' : null,
    };
  });
  const cardsOpcionais = dados.opcionais.map((o) => ({
    id: o.id,
    nome: o.nome,
    ativo: o.ativo,
    resumo: resumirPrecoOpcional(o),
  }));
  const catalogoVazio = dados.pacotes.length === 0 && dados.opcionais.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Pacotes, opcionais e tipos de festa que o cliente vê no link.
        </p>
        <LinkTestarPrecos />
      </div>

      {catalogoVazio && !somenteLeitura && (
        <section className="rounded-card bg-accent/40 space-y-3 border p-4">
          <h2 className="font-bold">Comece mais rápido</h2>
          <p className="text-muted-foreground text-sm">
            Carregue um catálogo de exemplo do seu segmento (pacotes, opcionais, turnos e regras) e
            depois ajuste nomes e preços. Ou crie seu primeiro pacote do zero.
          </p>
          <BotaoCarregarModelo />
        </section>
      )}

      <section aria-labelledby="titulo-pacotes" className="space-y-3">
        <Cabecalho
          id="titulo-pacotes"
          titulo="Pacotes"
          descricao="O que o cliente escolhe primeiro. A primeira foto é a capa."
          acao={
            !somenteLeitura && (
              <Button asChild size="sm">
                <Link href="/app/empresa/catalogo/pacotes/novo">
                  <Plus aria-hidden />
                  Novo pacote
                </Link>
              </Button>
            )
          }
        />
        {cardsPacotes.length === 0 ? (
          <Vazio>
            Nenhum pacote cadastrado. Sem pacote com preço, o link público não funciona.
          </Vazio>
        ) : (
          <CardsPacotes pacotes={cardsPacotes} somenteLeitura={somenteLeitura} />
        )}
      </section>

      <section aria-labelledby="titulo-opcionais" className="space-y-3">
        <Cabecalho
          id="titulo-opcionais"
          titulo="Opcionais"
          descricao="Extras que o cliente pode adicionar ao pacote."
          acao={
            !somenteLeitura && (
              <Button asChild size="sm" variant="outline">
                <Link href="/app/empresa/catalogo/opcionais/novo">
                  <Plus aria-hidden />
                  Novo opcional
                </Link>
              </Button>
            )
          }
        />
        {cardsOpcionais.length === 0 ? (
          <Vazio>Nenhum opcional cadastrado. Ex.: mesa temática, garçom extra, DJ.</Vazio>
        ) : (
          <CardsOpcionais opcionais={cardsOpcionais} somenteLeitura={somenteLeitura} />
        )}
      </section>

      <section aria-labelledby="titulo-tipos" className="space-y-3">
        <Cabecalho
          id="titulo-tipos"
          titulo="Tipos de festa"
          descricao="Pacotes e opcionais podem valer só para alguns tipos."
        />
        <ListaTipos
          tipos={dados.tipos.map((t) => ({ ...t, icone: t.icone ?? '' }))}
          somenteLeitura={somenteLeitura}
        />
      </section>
    </div>
  );
}
