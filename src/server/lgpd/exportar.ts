import 'server-only';
import { sql } from 'drizzle-orm';
import { VERSAO_DOCUMENTOS } from '@/domain/legal/versao';
import { arquivoCsv, csvDoLead, type Linha } from '@/domain/lgpd/csv';
import type { Tx } from '@/server/db/tenant';
import type { ArquivoZip } from './zip';

/*
 * Exportações da LGPD (Etapa 9B, B.1). Tudo pela transação do dono (comUsuario): o RLS garante
 * que nada de outra empresa entra. Fica de fora só o que é segredo técnico (chaves do push).
 */

/** Tabelas da exportação completa da empresa, com as colunas que não saem. */
export const TABELAS_EXPORTACAO: { tabela: string; sem?: string[] }[] = [
  { tabela: 'empresas' },
  { tabela: 'usuarios' },
  { tabela: 'aceites_termos' },
  { tabela: 'regras_comerciais' },
  { tabela: 'espacos' },
  { tabela: 'turnos' },
  { tabela: 'tipos_evento' },
  { tabela: 'pacotes' },
  { tabela: 'pacote_tipos_evento' },
  { tabela: 'faixas_preco' },
  { tabela: 'faixas_idade' },
  { tabela: 'secoes_cardapio' },
  { tabela: 'opcionais' },
  { tabela: 'opcional_pacotes' },
  { tabela: 'opcional_tipos_evento' },
  { tabela: 'ajustes_dia' },
  { tabela: 'feriados' },
  { tabela: 'faixas_deslocamento' },
  { tabela: 'regras_follow_up' },
  { tabela: 'galeria_fotos', sem: ['blur'] },
  { tabela: 'depoimentos' },
  { tabela: 'perguntas_frequentes' },
  { tabela: 'slugs_antigos' },
  { tabela: 'leads', sem: ['titular_hash'] },
  { tabela: 'orcamentos', sem: ['rascunho'] },
  { tabela: 'orcamento_itens' },
  { tabela: 'atividades' },
  { tabela: 'notas' },
  { tabela: 'tarefas' },
  { tabela: 'visitas' },
  { tabela: 'reservas' },
  { tabela: 'bloqueios' },
  { tabela: 'funil_eventos' },
  { tabela: 'avisos' },
  { tabela: 'preferencias_avisos' },
  { tabela: 'assinaturas' },
  { tabela: 'cobrancas' },
  { tabela: 'empresas_cobranca' },
  { tabela: 'acessos_suporte' },
  { tabela: 'auditoria' },
];

const LEIA_ME = `Exportação dos dados do seu buffet no Orkestra
================================================

Cada arquivo .csv é uma tabela (separador ";", UTF-8). Abra no Excel ou no Google Planilhas.
Valores em dinheiro estão em centavos (ex.: 150000 = R$ 1.500,00). Datas e horas em UTC.

Principais arquivos:
- leads.csv: pessoas que pediram orçamento pelo seu link ou pela equipe
- orcamentos.csv e orcamento_itens.csv: orçamentos e propostas (todas as versões)
- reservas.csv: pré-reservas e reservas da agenda
- atividades.csv, notas.csv, tarefas.csv, visitas.csv: histórico do atendimento
- pacotes.csv, opcionais.csv, faixas_preco.csv...: seu catálogo
- auditoria.csv: quem fez o quê e quando

Os dados dos leads pertencem ao seu buffet (você é o controlador, pela LGPD); o Orkestra é o
operador. Política de Privacidade (versão ${VERSAO_DOCUMENTOS}): /privacidade
`;

/** Arquivos do ZIP da empresa (um CSV por tabela + LEIA-ME). */
export async function arquivosDaEmpresa(tx: Tx): Promise<ArquivoZip[]> {
  const consultas = TABELAS_EXPORTACAO.map(async ({ tabela, sem = [] }) => {
    const linhas = (await tx.execute(
      sql.raw(`select * from public.${tabela} order by 1`),
    )) as unknown as Linha[];
    const limpas = linhas.map((l) => {
      const c = { ...l };
      for (const k of sem) delete c[k];
      return c;
    });
    return { nome: `${tabela}.csv`, conteudo: arquivoCsv(limpas) };
  });
  const arquivos = await Promise.all(consultas);
  return [{ nome: 'LEIA-ME.txt', conteudo: LEIA_ME }, ...arquivos];
}

/** Dados de um lead (só o dono; a função grava "lead.exportado" na auditoria). */
export async function exportacaoDoLead(tx: Tx, leadId: string): Promise<Record<string, unknown>> {
  const [linha] = await tx.execute<{ j: Record<string, unknown> }>(
    sql`select public.lgpd_exportar_lead(${leadId}::uuid) as j`,
  );
  return linha?.j ?? {};
}

export { csvDoLead };
