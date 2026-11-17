import type { Metadata } from 'next';
import Link from 'next/link';
import { formatData } from '@/domain/dates';
import { incluirContasDeTeste } from '@/domain/interno/contas';
import { formatBRL } from '@/domain/money';
import { exigirAdmin } from '@/server/interno/guard';
import { carregarDiagnostico } from '@/server/interno/diagnostico';

export const metadata: Metadata = { title: 'Diagnóstico' };
export const dynamic = 'force-dynamic';

const SITUACAO_ACEITE: Record<string, string> = {
  pre_reserva_vencida: 'pré-reserva vencida',
  pre_reserva_vencida_sem_job: 'pré-reserva vencida (job ainda não rodou)',
  pre_reserva_cancelada: 'pré-reserva cancelada',
  reserva_cancelada: 'reserva confirmada cancelada',
  sem_reserva: 'sem reserva',
};

const ROTULO_METRICA: Record<string, string> = {
  empresas: 'Empresas',
  leads: 'Leads',
  leads_30d: 'Leads (30 dias)',
  orcamentos: 'Orçamentos',
  orcamentos_aceitos: 'Aceitos',
  reservas_confirmadas: 'Reservas confirmadas',
  pre_reservas_ativas: 'Pré-reservas ativas',
  contas_de_teste_fora: 'Contas de teste fora',
};

function Secao({
  titulo,
  descricao,
  vazio,
  children,
  id,
}: {
  titulo: string;
  descricao: string;
  vazio: boolean;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section className="bg-card rounded-card flex flex-col gap-3 border p-4" data-testid={id}>
      <div>
        <h2 className="font-bold">{titulo}</h2>
        <p className="text-muted-foreground text-sm">{descricao}</p>
      </div>
      {vazio ? (
        <p className="bg-sucesso/10 text-sucesso border-sucesso/30 rounded-control border px-3 py-2 text-sm">
          Nada a apontar.
        </p>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </section>
  );
}

const th = 'text-muted-foreground px-2 py-1 text-left text-xs font-medium';
const td = 'px-2 py-1 text-sm';

/** /interno/diagnostico: os checks da análise semanal (§99), só leitura. */
export default async function PaginaDiagnostico({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirAdmin();
  const incluir = incluirContasDeTeste((await searchParams).teste);
  const d = await carregarDiagnostico(incluir);
  const problemasEntrega = d.entregas.filter(
    (e) => e.status === 'ignorado' || e.status === 'falhou',
  );

  return (
    <div className="flex flex-col gap-6" data-testid="diagnostico-interno">
      <header className="flex flex-col gap-2">
        <Link href="/interno" className="text-muted-foreground text-sm">
          Voltar para a visão geral
        </Link>
        <h1 className="text-2xl font-bold">Diagnóstico</h1>
        <p className="text-muted-foreground text-sm">
          Os checks da análise semanal, ao vivo. Só contagens, códigos e datas (nada do cliente
          final).{' '}
          {incluir
            ? 'Incluindo demonstração, apresentação e cortesia.'
            : 'Demonstração, apresentação e cortesia ficam fora.'}{' '}
          <Link
            href={incluir ? '/interno/diagnostico' : '/interno/diagnostico?teste=1'}
            className="font-semibold underline"
          >
            {incluir ? 'Tirar contas de teste' : 'Incluir contas de teste'}
          </Link>
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="diagnostico-metricas">
        {Object.entries(ROTULO_METRICA).map(([k, rotulo]) => (
          <div key={k} className="bg-card rounded-card border p-4">
            <p className="text-muted-foreground text-xs">{rotulo}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{String(d.metricas[k] ?? 0)}</p>
          </div>
        ))}
      </section>

      <Secao
        id="diagnostico-aceitos"
        titulo="Orçamentos aceitos sem reserva"
        descricao="Aceito sem pré-reserva no prazo, reserva confirmada ou festa realizada. Desde o §99 a pré-reserva vencida reabre o orçamento sozinha; o que aparece aqui é anterior ou reserva confirmada cancelada."
        vazio={d.aceitosSemReserva.length === 0}
      >
        <table className="w-full min-w-[560px]">
          <thead>
            <tr>
              <th className={th}>Empresa</th>
              <th className={th}>Orçamento</th>
              <th className={th}>Aceito em</th>
              <th className={th}>Festa</th>
              <th className={th}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {d.aceitosSemReserva.map((a) => (
              <tr key={`${a.empresa}-${a.numero}-${a.versao}`}>
                <td className={td}>
                  {a.empresa}
                  {a.contaTeste && <span className="text-muted-foreground"> (teste)</span>}
                </td>
                <td className={td}>
                  nº {a.numero} v{a.versao}
                </td>
                <td className={td}>{a.aceitoEm ? formatData(a.aceitoEm) : '—'}</td>
                <td className={td}>{a.dataFesta ? formatData(a.dataFesta) : '—'}</td>
                <td className={td}>{SITUACAO_ACEITE[a.situacao] ?? a.situacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>

      <Secao
        id="diagnostico-avisos"
        titulo="Avisos fora do painel (30 dias)"
        descricao={`Entregas ignoradas ou que falharam, por canal e motivo. CANAL_DESLIGADO = variáveis do canal ausentes na Vercel. Push: ${d.canais.inscricoes_push ?? 0} inscrições de ${d.canais.usuarios_com_push ?? 0} usuários; WhatsApp ligado por ${d.canais.usuarios_com_whatsapp ?? 0} de ${d.canais.usuarios_ativos ?? 0} usuários ativos.`}
        vazio={problemasEntrega.length === 0}
      >
        <table className="w-full min-w-[480px]">
          <thead>
            <tr>
              <th className={th}>Canal</th>
              <th className={th}>Status</th>
              <th className={th}>Motivo</th>
              <th className={th}>Total</th>
              <th className={th}>Última</th>
            </tr>
          </thead>
          <tbody>
            {problemasEntrega.map((e) => (
              <tr key={`${e.canal}-${e.status}-${e.motivo}`}>
                <td className={td}>{e.canal}</td>
                <td className={td}>{e.status}</td>
                <td className={td}>{e.motivo || '—'}</td>
                <td className={`${td} tabular-nums`}>{e.total}</td>
                <td className={td}>{e.ultima ? formatData(e.ultima) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>

      <Secao
        id="diagnostico-sinal"
        titulo="Reservas confirmadas com sinal pendente"
        descricao="Confirmadas, de hoje em diante, sem sinal, sem recebimento e sem plano de pagamento."
        vazio={d.sinalPendente.length === 0}
      >
        <table className="w-full min-w-[480px]">
          <thead>
            <tr>
              <th className={th}>Empresa</th>
              <th className={th}>Reservas</th>
              <th className={th}>Valor total</th>
              <th className={th}>Próxima festa</th>
            </tr>
          </thead>
          <tbody>
            {d.sinalPendente.map((s) => (
              <tr key={s.empresa}>
                <td className={td}>{s.empresa}</td>
                <td className={`${td} tabular-nums`}>{s.reservas}</td>
                <td className={`${td} tabular-nums`}>{formatBRL(s.valorTotalCentavos)}</td>
                <td className={td}>{s.proximaFesta ? formatData(s.proximaFesta) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>

      <Secao
        id="diagnostico-asaas"
        titulo="Asaas"
        descricao={`Ambiente: ${d.asaas.ambiente ?? 'desligado'}.${d.asaas.sandboxEmProducao ? ' Sandbox na produção: a trava está segurando novas cobranças (veja docs/COBRANCA.md, virada para produção).' : ''} Abaixo, o que veio do sandbox (todas as contas).`}
        vazio={d.cobrancasSandbox.length === 0 && !d.asaas.sandboxEmProducao}
      >
        <table className="w-full min-w-[360px]">
          <thead>
            <tr>
              <th className={th}>Origem</th>
              <th className={th}>Status</th>
              <th className={th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {d.cobrancasSandbox.map((c) => (
              <tr key={`${c.origem}-${c.status}`}>
                <td className={td}>{c.origem}</td>
                <td className={td}>{c.status}</td>
                <td className={`${td} tabular-nums`}>{c.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>

      <Secao
        id="diagnostico-trials"
        titulo="Testes grátis acabando (14 dias)"
        descricao="Aviso “teste acabando” a 3 dias e a 1 dia do fim (painel, push e e-mail do dono)."
        vazio={d.trials.length === 0}
      >
        <table className="w-full min-w-[560px]">
          <thead>
            <tr>
              <th className={th}>Empresa</th>
              <th className={th}>Fim do teste</th>
              <th className={th}>Assinatura</th>
              <th className={th}>Avisos</th>
              <th className={th}>E-mails enviados</th>
              <th className={th}>Na fila</th>
            </tr>
          </thead>
          <tbody>
            {d.trials.map((t) => (
              <tr key={t.empresa}>
                <td className={td}>{t.empresa}</td>
                <td className={td}>{t.trialAte ? formatData(t.trialAte) : '—'}</td>
                <td className={td}>{t.assinatura ?? 'nenhuma'}</td>
                <td className={`${td} tabular-nums`}>{t.avisos}</td>
                <td className={`${td} tabular-nums`}>{t.emailsEnviados}</td>
                <td className={`${td} tabular-nums`}>{t.emailsPendentes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>
    </div>
  );
}
