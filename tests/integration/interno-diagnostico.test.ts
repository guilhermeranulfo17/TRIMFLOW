import { afterAll, describe, expect, it } from 'vitest';
import { contaForaDasMetricas } from '@/domain/interno/contas';
import { assumirUsuario, conectar, emTransacao, IDS } from '../support/db';

/*
 * Itens 7 e 8 da análise de 17/11/2026 (§99): contas de teste fora das métricas do /interno
 * (_empresa_fora_das_metricas = contaForaDasMetricas), diagnóstico só para a conexão
 * administrativa, e o "teste acabando" que agora chega também a quem tem assinatura pendente.
 */

const sql = conectar();
afterAll(() => sql.end());

const INTERNAS = [
  'public.interno_aceitos_sem_reserva(boolean)',
  'public.interno_entregas_resumo(integer, boolean)',
  'public.interno_canais_retrato(boolean)',
  'public.interno_metricas_plataforma(boolean)',
  'public.interno_sinal_pendente(boolean)',
  'public.interno_cobrancas_sandbox()',
  'public.interno_trials_terminando(integer, boolean)',
  'public._empresa_fora_das_metricas(uuid)',
];

describe('contas fora das métricas (item 7)', () => {
  it('_empresa_fora_das_metricas = contaForaDasMetricas (as 8 combinações)', async () => {
    for (const ehDemo of [false, true])
      for (const ehApresentacao of [false, true])
        for (const isenta of [false, true])
          await emTransacao(sql, async (tx) => {
            await tx`update public.empresas set eh_demo = ${ehDemo},
              eh_apresentacao = ${ehApresentacao}, isenta = ${isenta} where id = ${IDS.empresaB}`;
            const [r] = await tx`select public._empresa_fora_das_metricas(${IDS.empresaB}) as f`;
            expect(r!.f, JSON.stringify({ ehDemo, ehApresentacao, isenta })).toBe(
              contaForaDasMetricas({ ehDemo, ehApresentacao, isenta }),
            );
          });
  });

  it('métricas da plataforma tiram a conta de teste; com p_incluir_teste ela volta', async () => {
    await emTransacao(sql, async (tx) => {
      const [antes] = await tx`select public.interno_metricas_plataforma(false) as m`;
      await tx`update public.empresas set isenta = true where id = ${IDS.empresaA}`;
      const [sem] = await tx`select public.interno_metricas_plataforma(false) as m`;
      const [com] = await tx`select public.interno_metricas_plataforma(true) as m`;
      expect(sem!.m.empresas).toBe(antes!.m.empresas - 1);
      expect(sem!.m.leads).toBeLessThan(antes!.m.leads);
      expect(sem!.m.contas_de_teste_fora).toBe(1);
      expect(com!.m.empresas).toBe(antes!.m.empresas);
      expect(com!.m.leads).toBe(antes!.m.leads);
    });
  });

  it('funções do diagnóstico: nem anon nem authenticated executam', async () => {
    for (const f of INTERNAS) {
      const [p] = await sql`select has_function_privilege('authenticated', ${f}, 'execute') as a,
        has_function_privilege('anon', ${f}, 'execute') as n`;
      expect(p, f).toEqual({ a: false, n: false });
    }
    // e todas respondem (sem erro de SQL) para o /interno
    await sql`select public.interno_metricas_plataforma(true)`;
    await sql`select * from public.interno_sinal_pendente(true)`;
    await sql`select * from public.interno_cobrancas_sandbox()`;
    await sql`select * from public.interno_trials_terminando(30, true)`;
  });
});

describe('fim do teste grátis (item 8)', () => {
  it('assinatura pendente (não paga) também recebe "teste acabando", com e-mail', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`delete from public.assinaturas where empresa_id = ${IDS.empresaB}`;
      await tx`delete from public.avisos where empresa_id = ${IDS.empresaB}`;
      await tx`update public.empresas set plano = 'trial', isenta = false, suspensa_manual_em = null,
        trial_ate = now() + interval '2 days' where id = ${IDS.empresaB}`;
      await tx`insert into public.assinaturas (empresa_id, plano_codigo, ciclo, valor_centavos, status)
        values (${IDS.empresaB}, 'profissional', 'mensal', 9700, 'pendente')`;
      await tx`select public.atualizar_situacoes()`;
      const avisos = await tx`select a.id, a.dados, a.usuario_id from public.avisos a
        where a.empresa_id = ${IDS.empresaB} and a.tipo = 'teste_acabando'`;
      expect(avisos).toHaveLength(1);
      expect(avisos[0]!.usuario_id).toBe(IDS.donoB);
      expect(avisos[0]!.dados).toEqual({ dias: 2, fatura_pendente: true });
      const [email] = await tx`select status from public.avisos_entregas
        where aviso_id = ${avisos[0]!.id} and canal = 'email'`;
      expect(email!.status).toBe('pendente');
      // rodar de novo (job de hora em hora) não duplica
      await tx`select public.atualizar_situacoes()`;
      const [n] = await tx`select count(*)::int as n from public.avisos
        where empresa_id = ${IDS.empresaB} and tipo = 'teste_acabando'`;
      expect(n!.n).toBe(1);
    });
  });

  it('teste vencido: suspensa, o dono lê tudo e recebe "conta suspensa" com o caminho do Plano', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`delete from public.assinaturas where empresa_id = ${IDS.empresaB}`;
      await tx`update public.empresas set plano = 'trial', isenta = false, suspensa_manual_em = null,
        trial_ate = now() - interval '1 hour' where id = ${IDS.empresaB}`;
      await tx`select public.atualizar_situacoes()`;
      const [e] = await tx`select plano from public.empresas where id = ${IDS.empresaB}`;
      expect(e!.plano).toBe('suspenso');
      const [aviso] = await tx`select id from public.avisos
        where empresa_id = ${IDS.empresaB} and tipo = 'conta_suspensa'`;
      expect(aviso).toBeDefined();
      const [email] = await tx`select status from public.avisos_entregas
        where aviso_id = ${aviso!.id} and canal = 'email'`;
      expect(email!.status).toBe('pendente');

      // somente leitura: o dono continua lendo empresa, catálogo e plano vigente
      await assumirUsuario(tx, IDS.donoB);
      const [emp] = await tx`select count(*)::int as n from public.empresas`;
      expect(emp!.n).toBe(1);
      const [plano] = await tx`select public.plano_vigente_da_empresa() as p`;
      expect(plano!.p).not.toBeNull();
      await tx`reset role`;
    });
  });
});
