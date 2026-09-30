'use server';

import { eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { faixasIdadeSchema, type FaixasIdadeEntrada } from '@/domain/validacao/catalogo';
import {
  ajustesDiaSchema,
  condicoesSchema,
  deslocamentoSchema,
  feriadosSchema,
  type AjustesDiaEntrada,
  type CondicoesEntrada,
  type DeslocamentoEntrada,
  type FeriadosEntrada,
} from '@/domain/validacao/regras';
import {
  ajustesDia,
  faixasDeslocamento,
  faixasIdade,
  feriados,
  regrasComerciais,
} from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { acaoDoDono, auditar, diferencas, validar, type ResultadoAcao } from './comum';

function revalidar() {
  revalidatePath('/app/empresa', 'layout');
}

export async function salvarCondicoes(entrada: CondicoesEntrada): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(condicoesSchema, entrada);
    if (!v.ok) return v.resultado;
    const novos = { ...v.dados, formasPagamento: [...new Set(v.dados.formasPagamento)] };
    const ok = await comUsuario(dono.id, async (tx) => {
      const [antes] = await tx.select().from(regrasComerciais);
      if (!antes) return false;
      await tx
        .update(regrasComerciais)
        .set(novos)
        .where(eq(regrasComerciais.empresaId, dono.empresa.id));
      await auditar(
        tx,
        dono,
        'regras.condicoes_alteradas',
        'regras',
        dono.empresa.id,
        diferencas(antes, novos),
      );
      return true;
    });
    if (!ok) return { ok: false, erro: 'Regras da empresa não encontradas. Recarregue a página.' };
    revalidar();
    return { ok: true, mensagem: 'Condições salvas.' };
  });
}

/** Substitui todos os ajustes de dia (semana e feriado, gerais e por turno). */
export async function salvarAjustesDia(entrada: AjustesDiaEntrada): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(ajustesDiaSchema, entrada);
    if (!v.ok) return v.resultado;
    const novos = v.dados.ajustes;
    await comUsuario(dono.id, async (tx) => {
      const antes = await tx
        .select({
          tipo: ajustesDia.tipo,
          diaSemana: ajustesDia.diaSemana,
          turnoId: ajustesDia.turnoId,
          ajusteBp: ajustesDia.ajusteBp,
        })
        .from(ajustesDia);
      await tx.delete(ajustesDia).where(eq(ajustesDia.empresaId, dono.empresa.id));
      if (novos.length)
        await tx
          .insert(ajustesDia)
          .values(novos.map((a) => ({ ...a, empresaId: dono.empresa.id })));
      await auditar(tx, dono, 'regras.ajustes_alterados', 'regras', dono.empresa.id, {
        antes,
        depois: novos,
      });
    });
    revalidar();
    return { ok: true, mensagem: 'Ajustes por dia salvos.' };
  });
}

export async function salvarFeriados(entrada: FeriadosEntrada): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(feriadosSchema, entrada);
    if (!v.ok) return v.resultado;
    const novos = [...v.dados.feriados].sort((a, b) => a.data.localeCompare(b.data));
    await comUsuario(dono.id, async (tx) => {
      const antes = await tx.select({ data: feriados.data, nome: feriados.nome }).from(feriados);
      await tx.delete(feriados).where(eq(feriados.empresaId, dono.empresa.id));
      if (novos.length)
        await tx.insert(feriados).values(novos.map((f) => ({ ...f, empresaId: dono.empresa.id })));
      await auditar(tx, dono, 'regras.feriados_alterados', 'regras', dono.empresa.id, {
        antes,
        depois: novos,
      });
    });
    revalidar();
    return { ok: true, mensagem: 'Feriados salvos.' };
  });
}

/** Política de crianças da empresa (faixas sem pacote). */
export async function salvarFaixasIdadeEmpresa(
  entrada: FaixasIdadeEntrada,
): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(faixasIdadeSchema, entrada);
    if (!v.ok) return v.resultado;
    const novas = [...v.dados.faixas].sort((a, b) => a.idadeMin - b.idadeMin);
    await comUsuario(dono.id, async (tx) => {
      const antes = await tx
        .select({
          rotulo: faixasIdade.rotulo,
          idadeMin: faixasIdade.idadeMin,
          idadeMax: faixasIdade.idadeMax,
          fatorBp: faixasIdade.fatorBp,
        })
        .from(faixasIdade)
        .where(isNull(faixasIdade.pacoteId));
      await tx.delete(faixasIdade).where(isNull(faixasIdade.pacoteId));
      if (novas.length)
        await tx
          .insert(faixasIdade)
          .values(novas.map((f, ordem) => ({ ...f, empresaId: dono.empresa.id, ordem })));
      await auditar(tx, dono, 'regras.criancas_alteradas', 'regras', dono.empresa.id, {
        antes,
        depois: novas,
      });
    });
    revalidar();
    return { ok: true, mensagem: 'Política de crianças salva.' };
  });
}

export async function salvarDeslocamento(entrada: DeslocamentoEntrada): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(deslocamentoSchema, entrada);
    if (!v.ok) return v.resultado;
    const d = v.dados;
    const faixas = d.modelo === 'por_faixa' ? [...d.faixas].sort((a, b) => a.ateKm - b.ateKm) : [];
    const novos = {
      deslocamentoModelo: d.modelo,
      deslocamentoKmGratis: d.kmGratis,
      deslocamentoValorKmCentavos: d.valorKmCentavos,
    };
    await comUsuario(dono.id, async (tx) => {
      const [antes] = await tx.select().from(regrasComerciais);
      const faixasAntes = await tx
        .select({
          ateKm: faixasDeslocamento.ateKm,
          valorCentavos: faixasDeslocamento.valorCentavos,
        })
        .from(faixasDeslocamento);
      await tx
        .update(regrasComerciais)
        .set(novos)
        .where(eq(regrasComerciais.empresaId, dono.empresa.id));
      await tx.delete(faixasDeslocamento).where(eq(faixasDeslocamento.empresaId, dono.empresa.id));
      if (faixas.length)
        await tx
          .insert(faixasDeslocamento)
          .values(faixas.map((f) => ({ ...f, empresaId: dono.empresa.id })));
      await auditar(
        tx,
        dono,
        'regras.deslocamento_alterado',
        'regras',
        dono.empresa.id,
        diferencas({ ...(antes ?? {}), faixas: faixasAntes }, { ...novos, faixas }),
      );
    });
    revalidar();
    return { ok: true, mensagem: 'Deslocamento salvo.' };
  });
}
