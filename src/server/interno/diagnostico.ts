import 'server-only';
import { sql } from 'drizzle-orm';
import { asaasSandboxEmProducao, configAsaas } from '@/server/cobranca/config';
import { obterDb } from '@/server/db/client';

/*
 * /interno → Diagnóstico (análise de 17/11/2026, §99). Só leituras, pela conexão administrativa,
 * das funções interno_* (fora do alcance de anon e authenticated). Nenhum dado do cliente final:
 * só empresa, contagens, códigos e datas. Contas de teste fora por padrão (?teste=1 inclui).
 */

type Linha = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const texto = (v: unknown) => (v == null ? null : String(v));
const data = (v: unknown) => (v ? new Date(v as string) : null);

export type Diagnostico = {
  metricas: Record<string, unknown>;
  aceitosSemReserva: {
    empresa: string;
    contaTeste: boolean;
    numero: number;
    versao: number;
    aceitoEm: Date | null;
    dataFesta: string | null;
    situacao: string;
  }[];
  entregas: { canal: string; status: string; motivo: string; total: number; ultima: Date | null }[];
  canais: Record<string, number>;
  sinalPendente: {
    empresa: string;
    reservas: number;
    valorTotalCentavos: number;
    proximaFesta: string | null;
  }[];
  cobrancasSandbox: { origem: string; status: string; total: number }[];
  trials: {
    empresa: string;
    trialAte: Date | null;
    situacao: string;
    assinatura: string | null;
    avisos: number;
    emailsEnviados: number;
    emailsPendentes: number;
  }[];
  asaas: { ambiente: string | null; sandboxEmProducao: boolean };
};

export async function carregarDiagnostico(incluirTeste: boolean): Promise<Diagnostico> {
  const db = obterDb();
  const [m, aceitos, entregas, canais, sinal, sandbox, trials] = await Promise.all([
    db.execute<Linha>(sql`select public.interno_metricas_plataforma(${incluirTeste}) as m`),
    db.execute<Linha>(sql`select * from public.interno_aceitos_sem_reserva(${incluirTeste})`),
    db.execute<Linha>(sql`select * from public.interno_entregas_resumo(30, ${incluirTeste})`),
    db.execute<Linha>(sql`select public.interno_canais_retrato(${incluirTeste}) as c`),
    db.execute<Linha>(sql`select * from public.interno_sinal_pendente(${incluirTeste})`),
    db.execute<Linha>(sql`select * from public.interno_cobrancas_sandbox()`),
    db.execute<Linha>(sql`select * from public.interno_trials_terminando(14, ${incluirTeste})`),
  ]);
  const config = configAsaas();
  return {
    metricas: ([...m][0]?.m as Record<string, unknown>) ?? {},
    aceitosSemReserva: [...aceitos].map((l) => ({
      empresa: String(l.empresa),
      contaTeste: Boolean(l.conta_teste),
      numero: num(l.numero),
      versao: num(l.versao),
      aceitoEm: data(l.aceito_em),
      dataFesta: texto(l.data_festa),
      situacao: String(l.situacao),
    })),
    entregas: [...entregas].map((l) => ({
      canal: String(l.canal),
      status: String(l.status),
      motivo: String(l.motivo ?? ''),
      total: num(l.total),
      ultima: data(l.ultima),
    })),
    canais: Object.fromEntries(
      Object.entries(([...canais][0]?.c as Record<string, unknown>) ?? {}).map(([k, v]) => [
        k,
        num(v),
      ]),
    ),
    sinalPendente: [...sinal].map((l) => ({
      empresa: String(l.empresa),
      reservas: num(l.reservas),
      valorTotalCentavos: num(l.valor_total_centavos),
      proximaFesta: texto(l.proxima_festa),
    })),
    cobrancasSandbox: [...sandbox].map((l) => ({
      origem: String(l.origem),
      status: String(l.status),
      total: num(l.total),
    })),
    trials: [...trials].map((l) => ({
      empresa: String(l.empresa),
      trialAte: data(l.trial_ate),
      situacao: String(l.situacao),
      assinatura: texto(l.assinatura),
      avisos: num(l.avisos_teste_acabando),
      emailsEnviados: num(l.emails_enviados),
      emailsPendentes: num(l.emails_pendentes),
    })),
    asaas: {
      ambiente: config?.ambiente ?? null,
      sandboxEmProducao: asaasSandboxEmProducao(config),
    },
  };
}
