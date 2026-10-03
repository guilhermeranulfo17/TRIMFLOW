/*
 * Parâmetros "inline" para o protocolo simples do Postgres (Etapa 9.5, A.3).
 *
 * Com `prepare: false` (exigido pelo pooler do Supabase em modo transação), o driver `postgres`
 * faz uma ida extra ao banco (Describe) para CADA consulta com parâmetro e para de enfileirar
 * consultas em pipeline. Trocando `$1…$n` por literais escapados e usando o protocolo simples,
 * cada consulta custa uma ida e várias seguem juntas.
 *
 * Segurança: strings viram literal de escape `E'…'` com aspas simples dobradas e barras
 * invertidas dobradas, o que vale com qualquer `standard_conforming_strings` (não dependemos de
 * configuração da sessão nem do pooler). NUL é recusado. Números só se finitos.
 * Os marcadores `$n` dentro de strings, identificadores entre aspas e blocos `$$…$$` do texto
 * original são preservados.
 */

export class ParametroInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Parâmetro inválido para consulta inline: ${motivo}`);
    this.name = 'ParametroInvalidoError';
  }
}

/** Literal SQL seguro para um valor (o que o driver mandaria como parâmetro). */
export function literal(valor: unknown): string {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new ParametroInvalidoError('número não finito');
    // negativo entre parênteses: `x-$1` nunca vira comentário `--`
    return valor < 0 || Object.is(valor, -0) ? `(${valor})` : String(valor);
  }
  if (typeof valor === 'bigint') return valor < 0n ? `(${valor})` : valor.toString();
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new ParametroInvalidoError('data inválida');
    return texto(valor.toISOString());
  }
  if (typeof valor === 'string') return texto(valor);
  if (Buffer.isBuffer(valor)) return `E'\\\\x${valor.toString('hex')}'::bytea`;
  if (Array.isArray(valor)) {
    // array do Postgres em texto ({"a","b"}); o contexto da consulta dá o tipo
    const itens = valor.map((v) => {
      if (v === null || v === undefined) return 'NULL';
      const s = String(v);
      return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    });
    return texto(`{${itens.join(',')}}`);
  }
  if (typeof valor === 'object') return texto(JSON.stringify(valor));
  throw new ParametroInvalidoError(typeof valor);
}

function texto(s: string): string {
  if (s.includes('\u0000')) throw new ParametroInvalidoError('caractere NUL');
  return `E'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

/**
 * Troca `$1…$n` pelos literais. Ignora o que estiver dentro de '…', "…", comentários e
 * blocos $tag$…$tag$.
 */
export function inlineParametros(sql: string, parametros: readonly unknown[]): string {
  if (parametros.length === 0) return sql;
  const lits = parametros.map(literal);
  let saida = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i]!;
    // string ou identificador entre aspas
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      saida += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // comentário de linha
    if (c === '-' && sql[i + 1] === '-') {
      const j = sql.indexOf('\n', i);
      const fim = j === -1 ? n : j;
      saida += sql.slice(i, fim);
      i = fim;
      continue;
    }
    // comentário de bloco
    if (c === '/' && sql[i + 1] === '*') {
      const j = sql.indexOf('*/', i + 2);
      const fim = j === -1 ? n : j + 2;
      saida += sql.slice(i, fim);
      i = fim;
      continue;
    }
    if (c === '$') {
      // parâmetro $n
      const num = /^\$(\d+)/.exec(sql.slice(i, i + 8));
      if (num) {
        const idx = Number(num[1]) - 1;
        if (idx < 0 || idx >= lits.length) {
          throw new ParametroInvalidoError(`marcador $${num[1]} sem valor`);
        }
        saida += lits[idx];
        i += num[0].length;
        continue;
      }
      // bloco $tag$…$tag$
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64));
      if (tag) {
        const fim = sql.indexOf(tag[0], i + tag[0].length);
        const ate = fim === -1 ? n : fim + tag[0].length;
        saida += sql.slice(i, ate);
        i = ate;
        continue;
      }
    }
    saida += c;
    i++;
  }
  return saida;
}
