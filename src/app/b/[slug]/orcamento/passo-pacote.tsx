'use client';

import { Check, Users } from 'lucide-react';
import { formatBRL } from '@/domain/money';
import { resumoCardapio } from '@/domain/publico/cardapio';
import { pessoas } from '@/domain/publico/passos';
import { linkWhatsApp, mensagemSemPacote } from '@/domain/publico/whatsapp';
import { formatData } from '@/domain/dates';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { BOTAO_PRINCIPAL } from '@/components/publico/marca';
import { urlPublicaMidia } from '@/lib/midia';
import { classeOpcao } from '@/components/orcamento/contador';
import PassoItens from './passo-itens';
import type { PropsPasso } from './tipos';

/** §96, jeito "os dois": o cliente escolhe entre um pacote pronto e montar do jeito dele. */
function EscolhaJeito({
  semPacote,
  alterar,
}: {
  semPacote: boolean;
  alterar: PropsPasso['alterar'];
}) {
  const opcoes = [
    {
      chave: 'pacote',
      titulo: 'Pacote pronto',
      texto: 'Tudo incluso, é só escolher',
      marcado: !semPacote,
      escolher: () => alterar({ semPacote: false, opcionais: [], horasExtras: 0 }),
    },
    {
      chave: 'itens',
      titulo: 'Montar do meu jeito',
      texto: 'Escolha só o que você quer',
      marcado: semPacote,
      escolher: () =>
        alterar({
          semPacote: true,
          pacoteId: undefined,
          opcionais: [],
          retirados: [],
          horasExtras: 0,
        }),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como montar a festa">
      {opcoes.map((o) => (
        <button
          key={o.chave}
          type="button"
          role="radio"
          aria-checked={o.marcado}
          onClick={o.escolher}
          className={classeOpcao(o.marcado)}
          data-testid={`jeito-${o.chave}`}
        >
          <span className="min-w-0">
            <span className="block font-bold">{o.titulo}</span>
            <span className="text-muted-foreground block text-sm">{o.texto}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Passo 4: pacote, com o total de cada um calculado no servidor para a festa escolhida. */
export default function PassoPacote(props: PropsPasso) {
  const { vitrine, escolhas, alterar, previa, buffet } = props;
  // §96: sem pacote, este passo é "Monte sua festa"; no "os dois", o cliente escolhe o jeito
  const semPacote = vitrine.modoVenda === 'itens' || !!escolhas.semPacote;
  const jeito =
    vitrine.modoVenda === 'ambos' ? <EscolhaJeito semPacote={semPacote} alterar={alterar} /> : null;
  if (semPacote) {
    return (
      <div className="flex flex-col gap-6">
        {jeito}
        <PassoItens {...props} />
      </div>
    );
  }
  const doTipo = vitrine.pacotes.filter(
    (p) => p.tiposEventoIds.length === 0 || p.tiposEventoIds.includes(escolhas.tipoEventoId ?? ''),
  );
  const porId = new Map((previa?.pacotes ?? []).map((p) => [p.id, p]));
  const carregado = previa !== null && previa.pacotes.length > 0;
  const algumServe = (previa?.pacotes ?? []).some((p) => p.disponivel);

  if (carregado && !algumServe) {
    const tipo = vitrine.tiposEvento.find((t) => t.id === escolhas.tipoEventoId);
    const turno = vitrine.turnos.find((t) => t.id === escolhas.turnoId);
    return (
      <div className="flex flex-col gap-4">
        {jeito}
        <div className="rounded-card border p-5 text-center">
          <h2 className="text-lg font-bold">Nenhum pacote serve para essa festa</h2>
          <p className="text-muted-foreground mt-2">
            Para {pessoas(escolhas)} convidados, fale com a gente: o buffet monta uma proposta para
            você.
          </p>
          {buffet.whatsappE164 && (
            <a
              href={linkWhatsApp(
                buffet.whatsappE164,
                mensagemSemPacote(buffet.nome, {
                  tipoEvento: tipo?.nome,
                  data: escolhas.data,
                  turno: turno?.nome,
                  convidados: pessoas(escolhas),
                }),
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BOTAO_PRINCIPAL} mt-4 w-full`}
            >
              <IconeWhatsApp />
              Fale com a gente
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {jeito}
      <div className="flex flex-col gap-3" role="radiogroup" aria-label="Pacotes">
        {escolhas.data && (
          <p className="text-muted-foreground -mt-2 text-sm">
            Valores para {pessoas(escolhas)} convidados em {formatData(escolhas.data)}.
          </p>
        )}
        {doTipo.map((p) => {
          const calc = porId.get(p.id);
          const disponivel = calc?.disponivel ?? false;
          const marcado = escolhas.pacoteId === p.id;
          const foto = urlPublicaMidia(p.fotos[0]);
          const cardapio = resumoCardapio(p.secoes);
          return (
            <div key={p.id} className="flex flex-col">
              <button
                type="button"
                role="radio"
                aria-checked={marcado}
                aria-disabled={!disponivel}
                disabled={!disponivel}
                onClick={() =>
                  alterar({ pacoteId: p.id, opcionais: [], retirados: [], horasExtras: 0 })
                }
                className={classeOpcao(marcado, !disponivel)}
                data-testid="opcao-pacote"
              >
                {foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={foto}
                    alt=""
                    loading="lazy"
                    className="rounded-control size-16 shrink-0 object-cover"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-base font-bold">
                    {p.nome}
                    {p.destaque && (
                      <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                        Mais pedido
                      </span>
                    )}
                  </span>
                  {p.subtitulo && (
                    <span className="text-muted-foreground block text-sm">{p.subtitulo}</span>
                  )}
                  {!disponivel && calc?.motivo ? (
                    <span className="mt-1 flex items-center gap-1 text-sm font-semibold">
                      <Users className="size-4" aria-hidden />
                      {calc.motivo}
                    </span>
                  ) : (
                    <span className="mt-1 block text-lg font-extrabold text-[var(--marca-destaque)]">
                      {calc?.totalCentavos != null ? formatBRL(calc.totalCentavos) : '…'}
                    </span>
                  )}
                </span>
                {marcado && <Check className="size-5 text-[var(--marca-destaque)]" aria-hidden />}
              </button>
              {(cardapio || p.descricao) && (
                <details className="px-4 pt-1 text-sm">
                  <summary className="text-muted-foreground min-h-11 cursor-pointer py-2 font-semibold">
                    O que está incluso
                  </summary>
                  {p.descricao && <p className="whitespace-pre-line">{p.descricao}</p>}
                  {p.secoes.map((s) =>
                    s.itens.length > 0 ? (
                      <p key={s.nome} className="mt-1">
                        <strong>{s.nome}:</strong> {s.itens.join(', ')}
                      </p>
                    ) : null,
                  )}
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
