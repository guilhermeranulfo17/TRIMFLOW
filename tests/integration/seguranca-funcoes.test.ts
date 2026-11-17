import { afterAll, describe, expect, it } from 'vitest';
import { conectar } from '../support/db';

/*
 * Item 3 da análise de 17/11/2026 (§99, docs/SEGURANCA_FUNCOES.md). O advisor do Supabase lista as
 * funções SECURITY DEFINER do schema public executáveis por authenticated (eram 87). Todas foram
 * revisadas e classificadas abaixo. Este teste garante que:
 *   1. função nova executável por authenticated não passa sem entrar na lista (com classe);
 *   2. toda função da lista verifica quem chama: auth.uid() direto ou um guard que verifica;
 *   3. as da classe "dono" recusam o vendedor no próprio corpo ou no guard;
 *   4. nenhuma SECURITY DEFINER do public é executável por anon;
 *   5. as tabelas com RLS e sem policy são só do servidor (sem GRANT) e documentadas.
 */

const sql = conectar();
afterAll(() => sql.end());

/**
 * dono: só o dono. usuario: dono ou vendedor ativo, só a própria empresa. proprio: só o próprio
 * usuário (avisos, push, preferências, aceite). rls: helpers usados pelas policies.
 * cadastro: sessão ainda sem empresa (completar o cadastro do Google).
 */
type Classe = 'dono' | 'usuario' | 'proprio' | 'rls' | 'cadastro';

export const FUNCOES_AUTHENTICATED: Record<string, Classe> = {
  adiar_tarefa: 'usuario',
  adicionar_nota: 'usuario',
  agendar_mensagem: 'usuario',
  agendar_visita: 'usuario',
  alterar_slug: 'dono',
  apagar_nota: 'usuario',
  ativar_whatsapp: 'proprio',
  atribuir_responsavel: 'usuario',
  atualizar_dados_lead: 'usuario',
  avancar_onboarding: 'dono',
  avisar_boas_vindas: 'dono',
  cancelar_contrato: 'dono',
  cancelar_reserva: 'usuario',
  cancelar_tarefa: 'usuario',
  cancelar_visita: 'usuario',
  catalogo_em_uso: 'usuario',
  completar_conta_dono: 'cadastro',
  concluir_tarefa: 'usuario',
  confirmar_precos: 'dono',
  confirmar_reserva: 'usuario',
  confirmar_visita: 'usuario',
  contrato_comprovante: 'dono',
  contrato_marcar_pdf: 'dono',
  criar_aviso_teste: 'proprio',
  criar_bloqueio: 'dono',
  criar_reserva: 'usuario',
  criar_tarefa: 'usuario',
  definir_proximo_contato: 'usuario',
  desativar_whatsapp: 'proprio',
  desistir_exclusao_conta: 'dono',
  dispensar_checklist: 'usuario',
  disponibilidade: 'usuario',
  editar_nota: 'usuario',
  emitir_contrato: 'dono',
  empresa_do_usuario: 'rls',
  estender_pre_reserva: 'usuario',
  estornar_recebimento: 'dono',
  inscrever_push: 'proprio',
  ler_cpf_contrato: 'dono',
  lgpd_apagar_lead: 'dono',
  lgpd_exportar_lead: 'dono',
  lgpd_registrar_exportacao: 'dono',
  marcar_avisos_lidos: 'proprio',
  marcar_link_na_bio: 'dono',
  marcar_link_testado: 'usuario',
  marcar_orcamento_enviado: 'usuario',
  marcar_perdido: 'usuario',
  marcar_visita_realizada: 'usuario',
  margem_fechar_festa: 'dono',
  margem_preparar_festa: 'dono',
  margem_reabrir_festa: 'dono',
  margem_salvar_custos_festa: 'dono',
  margem_salvar_custos_pacote: 'dono',
  modulo_acesso: 'usuario',
  modulos_da_empresa: 'usuario',
  novo_link_contrato: 'dono',
  numeros: 'usuario',
  numeros_contratos: 'dono',
  numeros_ocupacao: 'usuario',
  perfil_do_usuario: 'rls',
  permitir_suporte: 'dono',
  plano_vigente_da_empresa: 'usuario',
  pre_reservar_orcamento: 'usuario',
  reabrir_lead: 'usuario',
  reabrir_tarefa: 'usuario',
  registrar_aceite: 'usuario',
  registrar_contato: 'usuario',
  registrar_mensagem: 'usuario',
  registrar_origem_cadastro: 'dono',
  registrar_recebimento: 'dono',
  registrar_uso: 'usuario',
  remarcar_visita: 'usuario',
  remover_bloqueio: 'dono',
  remover_push: 'proprio',
  revogar_suporte: 'dono',
  salvar_contrato_modelo: 'dono',
  salvar_depoimentos: 'dono',
  salvar_galeria: 'dono',
  salvar_orcamento_interno: 'usuario',
  salvar_pagina_publica: 'dono',
  salvar_perguntas: 'dono',
  salvar_plano_pagamento: 'dono',
  salvar_preferencias_avisos: 'proprio',
  salvar_regra_follow_up: 'dono',
  salvar_retencao_leads: 'dono',
  solicitar_exclusao_conta: 'dono',
  status_contrato_da_reserva: 'usuario',
};

/** Guards que leem auth.uid() e recusam quem não é usuário ativo (ou dono). */
const GUARDS = [
  'empresa_do_usuario',
  'perfil_do_usuario',
  '_leads_exigir_usuario',
  '_agenda_exigir_usuario',
  '_avisos_usuario',
  '_contrato_dono',
  '_onboarding_dono',
  '_pagina_dono',
  '_lgpd_exigir_dono',
  '_financeiro_dono',
  '_margem_dono',
];
const GUARDS_DE_DONO = [
  '_contrato_dono',
  '_onboarding_dono',
  '_pagina_dono',
  '_lgpd_exigir_dono',
  '_financeiro_dono',
  '_margem_dono',
];

const TABELAS_SEM_POLICY = [
  'public.auditoria_interna',
  'public.cobranca_eventos',
  'public.contrato_codigos',
  'public.cupons',
  'public.cupons_usos',
  'public.landing_contagem',
  'public.uso_painel',
  'publico.tentativas',
];

async function corpo(nome: string): Promise<string> {
  const [r] = await sql`select string_agg(pg_get_functiondef(p.oid), ' ') as d from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = ${nome}`;
  return (r?.d as string) ?? '';
}

describe('funções SECURITY DEFINER executáveis por authenticated (item 3)', () => {
  it('toda função exposta a authenticated está revisada e classificada', async () => {
    const fs = await sql`select distinct p.proname as nome from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and has_function_privilege('authenticated', p.oid, 'execute') order by 1`;
    expect(fs.map((f) => f.nome).sort()).toEqual(Object.keys(FUNCOES_AUTHENTICATED).sort());
  });

  it('os guards leem auth.uid() (direto ou por empresa_do_usuario/perfil_do_usuario)', async () => {
    for (const g of GUARDS) {
      const d = await corpo(g);
      expect(d, g).toMatch(/auth\.uid\(\)|public\.(empresa_do_usuario|perfil_do_usuario)\(/);
    }
    for (const g of GUARDS_DE_DONO) {
      expect(await corpo(g), g).toMatch(/'dono'/);
    }
  });

  it('toda função da lista verifica quem chama', async () => {
    const sem: string[] = [];
    for (const nome of Object.keys(FUNCOES_AUTHENTICATED)) {
      const d = await corpo(nome);
      const chamaGuard = GUARDS.some((g) => d.includes(`public.${g}(`));
      if (!chamaGuard && !/auth\.uid\(\)/.test(d)) sem.push(nome);
    }
    expect(sem).toEqual([]);
  });

  it('classe "dono": o corpo ou o guard recusa quem não é dono', async () => {
    const sem: string[] = [];
    for (const [nome, classe] of Object.entries(FUNCOES_AUTHENTICATED)) {
      if (classe !== 'dono') continue;
      const d = await corpo(nome);
      const ok =
        GUARDS_DE_DONO.some((g) => d.includes(`public.${g}(`)) ||
        d.includes('_agenda_exigir_usuario(true)') ||
        /perfil(_do_usuario\(\))?\s*(<>|is distinct from)\s*'dono'/.test(d);
      if (!ok) sem.push(nome);
    }
    expect(sem).toEqual([]);
  });

  it('nenhuma SECURITY DEFINER do public é executável por anon', async () => {
    const fs = await sql`select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and has_function_privilege('anon', p.oid, 'execute')`;
    expect(fs).toEqual([]);
  });
});

describe('tabelas com RLS e sem policy (item 3)', () => {
  it('são exatamente as revisadas, sem GRANT para anon/authenticated e com o motivo no comentário', async () => {
    const ts = await sql`select n.nspname || '.' || c.relname as t,
        obj_description(c.oid, 'pg_class') as comentario,
        has_table_privilege('anon', c.oid, 'select, insert, update, delete') as anon,
        has_table_privilege('authenticated', c.oid, 'select, insert, update, delete') as auth
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public', 'publico') and c.relrowsecurity
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
      order by 1`;
    expect(ts.map((t) => t.t)).toEqual(TABELAS_SEM_POLICY);
    for (const t of ts) {
      expect(t.anon, t.t).toBe(false);
      expect(t.auth, t.t).toBe(false);
      expect(t.comentario, t.t).toContain('RLS sem policy de propósito');
    }
  });
});
