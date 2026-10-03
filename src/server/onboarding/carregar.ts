import 'server-only';
import { sql } from 'drizzle-orm';
import { cache } from 'react';
import { calcularChecklist, type Checklist } from '@/domain/onboarding/checklist';
import type { PassoOnboarding } from '@/domain/onboarding/passos';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { comUsuario, naTransacao, type Tx } from '@/server/db/tenant';
import { configWhatsapp } from '@/server/env';

/*
 * Leituras do onboarding e do checklist, sempre sob o RLS do usuário (comUsuario). O estado do
 * checklist vem do banco real (catálogo, regras, agenda, push…), nunca de marcações soltas.
 */

export type EstadoOnboarding = {
  passo: PassoOnboarding;
  concluido: boolean;
  iniciadoEm: Date | null;
  concluidoEm: Date | null;
  temPacoteConfirmado: boolean;
  catalogoVazio: boolean;
};

const linha = <T>(r: unknown) => (r as unknown as T[])[0]!;

export const carregarEstadoOnboarding = cache(
  async (usuario: UsuarioAtual): Promise<EstadoOnboarding> =>
    comUsuario(usuario.id, async (tx) => {
      const r = linha<{
        passo: number;
        iniciado_em: Date | string | null;
        concluido_em: Date | string | null;
        confirmado: boolean;
        vazio: boolean;
      }>(
        await tx.execute(sql`
          select e.onboarding_passo as passo, e.onboarding_iniciado_em as iniciado_em,
                 e.onboarding_concluido_em as concluido_em,
                 exists (select 1 from public.pacotes p
                         where p.ativo and p.preco_confirmado_em is not null) as confirmado,
                 not exists (select 1 from public.pacotes) as vazio
          from public.empresas e where e.id = ${usuario.empresa.id}`),
      );
      return {
        passo: r.passo as PassoOnboarding,
        concluido: r.concluido_em !== null,
        // execute devolve timestamptz como texto (parser do Drizzle): normaliza para Date
        iniciadoEm: r.iniciado_em === null ? null : new Date(r.iniciado_em),
        concluidoEm: r.concluido_em === null ? null : new Date(r.concluido_em),
        temPacoteConfirmado: r.confirmado,
        catalogoVazio: r.vazio,
      };
    }),
);

export type ResumoModelo = {
  tiposEvento: string[];
  turnos: string[];
  espacos: string[];
  pacotes: string[];
  opcionais: number;
  faixasIdade: number;
  ajustesDia: number;
};

/** O que veio pronto do modelo (passo 1). */
export async function carregarResumoModelo(usuario: UsuarioAtual): Promise<ResumoModelo> {
  return comUsuario(usuario.id, async (tx) => {
    const r = linha<ResumoModelo>(
      await tx.execute(sql`
        select
          coalesce((select array_agg(nome order by ordem, nome) from public.tipos_evento where ativo), '{}') as "tiposEvento",
          coalesce((select array_agg(nome order by ordem, hora_inicio) from public.turnos where ativo), '{}') as turnos,
          coalesce((select array_agg(nome order by ordem, nome) from public.espacos where ativo), '{}') as espacos,
          coalesce((select array_agg(nome order by ordem, nome) from public.pacotes where ativo), '{}') as pacotes,
          (select count(*)::int from public.opcionais where ativo) as opcionais,
          (select count(*)::int from public.faixas_idade) as "faixasIdade",
          (select count(*)::int from public.ajustes_dia) as "ajustesDia"`),
    );
    return r;
  });
}

export type PacotePreco = {
  id: string;
  nome: string;
  modeloPreco: 'por_pessoa' | 'por_faixa';
  confirmado: boolean;
  /** preço atual (de exemplo, enquanto não confirmado) */
  precoPessoaCentavos: number | null;
  valorExcedenteCentavos: number | null;
  faixas: { ateConvidados: number; valorCentavos: number }[];
};

export type OpcionalPreco = {
  id: string;
  nome: string;
  cobranca: string;
  confirmado: boolean;
  precoCentavos: number;
};

/** Pacotes e opcionais ativos com o preço atual (passo 3). */
export async function carregarPrecos(
  usuario: UsuarioAtual,
): Promise<{ pacotes: PacotePreco[]; opcionais: OpcionalPreco[] }> {
  return comUsuario(usuario.id, async (tx) => {
    const pacotes = (await tx.execute(sql`
      select p.id, p.nome, p.modelo_preco as "modeloPreco", p.preco_confirmado_em is not null as confirmado,
             p.preco_pessoa_centavos as "precoPessoaCentavos",
             p.valor_excedente_centavos as "valorExcedenteCentavos",
             coalesce((select jsonb_agg(jsonb_build_object('ateConvidados', f.ate_convidados,
                                                           'valorCentavos', f.valor_centavos)
                                        order by f.ate_convidados)
                       from public.faixas_preco f where f.pacote_id = p.id), '[]') as faixas
      from public.pacotes p where p.ativo order by p.ordem, p.nome`)) as unknown as PacotePreco[];
    const opcionais = (await tx.execute(sql`
      select o.id, o.nome, o.cobranca, o.preco_confirmado_em is not null as confirmado,
             o.preco_centavos as "precoCentavos"
      from public.opcionais o where o.ativo order by o.ordem, o.nome`)) as unknown as OpcionalPreco[];
    return { pacotes: [...pacotes], opcionais: [...opcionais] };
  });
}

export type AgendaRapida = {
  espacos: {
    id: string;
    nome: string;
    capacidadeMax: number;
    eventosSimultaneos: number;
    noLocalDoCliente: boolean;
    ativo: boolean;
  }[];
  turnos: {
    id: string;
    nome: string;
    horaInicio: string;
    duracaoMin: number;
    diasSemana: number[];
    ativo: boolean;
  }[];
};

/** Espaços e turnos para a edição rápida (passo 4). */
export async function carregarAgendaRapida(usuario: UsuarioAtual): Promise<AgendaRapida> {
  return comUsuario(usuario.id, async (tx) => {
    const espacos = (await tx.execute(sql`
      select id, nome, capacidade_max as "capacidadeMax", eventos_simultaneos as "eventosSimultaneos",
             no_local_do_cliente as "noLocalDoCliente", ativo
      from public.espacos order by ordem, nome`)) as unknown as AgendaRapida['espacos'];
    const turnos = (await tx.execute(sql`
      select id, nome, to_char(hora_inicio, 'HH24:MI') as "horaInicio", duracao_min as "duracaoMin",
             dias_semana::int[] as "diasSemana", ativo
      from public.turnos order by ordem, hora_inicio`)) as unknown as AgendaRapida['turnos'];
    return { espacos: [...espacos], turnos: [...turnos] };
  });
}

export type ChecklistDoUsuario = Checklist & { dispensado: boolean };

/** Checklist calculado do estado real da empresa (memoizado por requisição). */
export const carregarChecklist = cache(
  async (usuario: UsuarioAtual, tx?: Tx): Promise<ChecklistDoUsuario> =>
    naTransacao(usuario.id, tx, async (tx) => {
      const r = linha<Record<string, boolean | Date | null>>(
        await tx.execute(sql`
          select
            exists (select 1 from public.pacotes p where p.ativo and p.preco_confirmado_em is not null
                    and (p.preco_pessoa_centavos is not null
                         or exists (select 1 from public.faixas_preco f where f.pacote_id = p.id))) as "pacoteConfirmado",
            exists (select 1 from public.tipos_evento where ativo) as "tipoEventoAtivo",
            exists (select 1 from public.espacos where ativo)
              and exists (select 1 from public.turnos where ativo) as "espacoETurnoAtivos",
            e.logo_path is not null as logo,
            e.capa_path is not null as capa,
            coalesce(btrim(e.sobre), '') <> '' as sobre,
            e.pagina_personalizada_em is not null as "paginaPersonalizada",
            exists (select 1 from public.pacotes p where p.ativo and jsonb_array_length(p.fotos) > 0) as "fotoEmPacote",
            exists (select 1 from public.pacotes where ativo)
              and not exists (select 1 from public.pacotes p where p.ativo and not exists (
                select 1 from public.secoes_cardapio s where s.pacote_id = p.id and cardinality(s.itens) > 0)) as "cardapioCompleto",
            exists (select 1 from public.regras_comerciais r where r.sinal_bp > 0 and r.parcelas_max >= 1
                    and cardinality(r.formas_pagamento) > 0) as "condicoesPagamento",
            exists (select 1 from public.regras_comerciais r where btrim(r.cancelamento_texto) <> ''
                    and btrim(r.nao_incluso_texto) <> '') as "textosProposta",
            coalesce(btrim(e.razao_social), '') <> '' and coalesce(e.cnpj, '') <> '' as "dadosEmpresa",
            exists (select 1 from public.reservas r where r.origem = 'manual') as "eventosNaAgenda",
            e.link_testado_em is not null as "linkTestado",
            e.link_na_bio_em is not null as "linkNaBio",
            exists (select 1 from public.push_inscricoes) as "pushAtivo",
            coalesce((select p.whatsapp_ativo from public.preferencias_avisos p
                      where p.usuario_id = ${usuario.id}), false) as "whatsappAvisos",
            (select u.checklist_dispensado_em from public.usuarios u where u.id = ${usuario.id}) as dispensado
          from public.empresas e where e.id = ${usuario.empresa.id}`),
      );
      const b = (k: string) => r[k] === true;
      const checklist = calcularChecklist({
        pacoteConfirmado: b('pacoteConfirmado'),
        tipoEventoAtivo: b('tipoEventoAtivo'),
        espacoETurnoAtivos: b('espacoETurnoAtivos'),
        logo: b('logo'),
        capa: b('capa'),
        sobre: b('sobre'),
        paginaPersonalizada: b('paginaPersonalizada'),
        fotoEmPacote: b('fotoEmPacote'),
        cardapioCompleto: b('cardapioCompleto'),
        condicoesPagamento: b('condicoesPagamento'),
        textosProposta: b('textosProposta'),
        dadosEmpresa: b('dadosEmpresa'),
        eventosNaAgenda: b('eventosNaAgenda'),
        linkTestado: b('linkTestado'),
        linkNaBio: b('linkNaBio'),
        pushAtivo: b('pushAtivo'),
        whatsappAvisos: configWhatsapp() ? b('whatsappAvisos') : null,
      });
      return { ...checklist, dispensado: r.dispensado !== null };
    }),
);
