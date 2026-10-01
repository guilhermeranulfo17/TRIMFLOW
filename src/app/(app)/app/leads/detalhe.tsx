'use client';

import { useRouter } from 'next/navigation';
import { Folha } from '@/components/app/agenda/folha';
import { formatData, formatDataHora } from '@/domain/dates';
import { COR_STATUS_LEAD, descreverAtividade, resumoDaFesta } from '@/domain/leads';
import { formatBRL } from '@/domain/money';
import { formatPhoneBR } from '@/domain/phone';
import { ROTULO_ORIGEM } from '@/domain/publico/origem';
import { ROTULO_STATUS_LEAD } from '@/domain/publico/status-lead';
import type { DetalheLead } from '@/server/leads/carregar';

const STATUS_ORCAMENTO: Record<string, string> = {
  em_montagem: 'Em montagem',
  enviado: 'Enviado',
  visualizado: 'Visualizado',
  aceito: 'Pré-reservado',
  expirado: 'Expirado',
  substituido: 'Substituído',
};
const PERIODO: Record<string, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const TEMPERATURA: Record<string, string> = { frio: 'Frio', morno: 'Morno', quente: 'Quente' };

/** Detalhe do lead (sheet no celular): dados, propostas congeladas, visitas e linha do tempo. */
export function DetalheDoLead({ lead, fecharHref }: { lead: DetalheLead; fecharHref: string }) {
  const router = useRouter();
  return (
    <Folha
      aberto
      onAbertoChange={(aberto) => !aberto && router.push(fecharHref, { scroll: false })}
      titulo={lead.nome}
      descricao={`${ROTULO_STATUS_LEAD[lead.status]} · ${TEMPERATURA[lead.temperatura]} · veio de ${ROTULO_ORIGEM[lead.origem]}`}
    >
      <div className="flex flex-col gap-5 text-sm" data-testid="detalhe-lead">
        <section className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_STATUS_LEAD[lead.status]}`}
          >
            {ROTULO_STATUS_LEAD[lead.status]}
          </span>
          {lead.ehTeste && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Teste
            </span>
          )}
          <a
            href={`https://wa.me/${lead.whatsappE164.replace('+', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-semibold underline-offset-2 hover:underline"
          >
            {formatPhoneBR(lead.whatsappE164)}
          </a>
        </section>
        {lead.consentimentoEm && (
          <p className="text-muted-foreground -mt-3">
            Aceitou a política de privacidade em {formatData(lead.consentimentoEm)}.
          </p>
        )}

        {lead.orcamentos.length > 0 && (
          <section>
            <h3 className="font-bold">Propostas</h3>
            <div className="mt-2 flex flex-col gap-3">
              {lead.orcamentos.map((o) => (
                <div key={o.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Nº {o.numero}</span>
                    <span className="text-muted-foreground text-xs">
                      {STATUS_ORCAMENTO[o.status] ?? o.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{resumoDaFesta(o)}</p>
                  {o.itens.length > 0 && (
                    <ul className="mt-2 divide-y">
                      {o.itens.map((i, n) => (
                        <li key={n} className="flex justify-between gap-2 py-1">
                          <span className="min-w-0">
                            {i.descricao}
                            {i.detalhe && (
                              <span className="text-muted-foreground block text-xs">
                                {i.detalhe}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatBRL(i.subtotalCentavos)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {o.totalCentavos != null && (
                    <p className="mt-2 flex justify-between font-bold">
                      <span>Total</span>
                      <span className="tabular-nums">{formatBRL(o.totalCentavos)}</span>
                    </p>
                  )}
                  {o.validadeAte && (
                    <p className="text-muted-foreground text-xs">
                      Válida até {formatData(o.validadeAte)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {lead.visitas.length > 0 && (
          <section>
            <h3 className="font-bold">Visitas pedidas</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {lead.visitas.map((v) => (
                <li key={v.id}>
                  {formatData(v.dataPreferida)} · {PERIODO[v.periodo] ?? v.periodo}
                  {v.observacoes && (
                    <span className="text-muted-foreground"> · {v.observacoes}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="font-bold">Linha do tempo</h3>
          <ol className="mt-2 flex flex-col gap-2 border-l pl-4" data-testid="linha-do-tempo">
            {lead.atividades.map((a) => (
              <li key={a.id} className="relative">
                <span
                  className="bg-primary absolute top-1.5 -left-[21px] size-2 rounded-full"
                  aria-hidden
                />
                <span className="block">{descreverAtividade(a.tipo, a.dados)}</span>
                <span className="text-muted-foreground text-xs">{formatDataHora(a.criadoEm)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Folha>
  );
}
