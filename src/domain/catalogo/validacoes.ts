/**
 * Regras de negócio do catálogo que o banco não cobre (ou cobre sem mensagem boa).
 * Cada função devolve a lista de problemas; vazia = válido.
 */

export type Problema = { campo: string; mensagem: string };

export type FaixaPrecoEntrada = { ateConvidados: number; valorCentavos: number };

/** Faixas de preço: ao menos uma, `ateConvidados` crescente e sem repetição. */
export function validarFaixasPreco(faixas: FaixaPrecoEntrada[]): Problema[] {
  if (faixas.length === 0) {
    return [{ campo: 'faixas', mensagem: 'Cadastre pelo menos uma faixa de convidados.' }];
  }
  const problemas: Problema[] = [];
  faixas.forEach((f, i) => {
    const anterior = faixas[i - 1];
    if (anterior && f.ateConvidados === anterior.ateConvidados) {
      problemas.push({ campo: `faixas.${i}.ateConvidados`, mensagem: 'Faixa repetida.' });
    } else if (anterior && f.ateConvidados < anterior.ateConvidados) {
      problemas.push({
        campo: `faixas.${i}.ateConvidados`,
        mensagem: 'As faixas precisam estar em ordem crescente de convidados.',
      });
    }
  });
  return problemas;
}

export type PrecoPacoteEntrada = {
  modeloPreco: 'por_pessoa' | 'por_faixa';
  precoPessoaCentavos: number | null;
  valorExcedenteCentavos: number | null;
  faixas: FaixaPrecoEntrada[];
  minConvidados: number;
  maxConvidados: number | null;
};

/** Por pessoa exige preço por pessoa; por faixa exige faixas e excedente. Mín ≤ máx. */
export function validarPrecoPacote(p: PrecoPacoteEntrada): Problema[] {
  const problemas: Problema[] = [];
  if (p.modeloPreco === 'por_pessoa' && p.precoPessoaCentavos === null) {
    problemas.push({ campo: 'precoPessoaCentavos', mensagem: 'Informe o preço por convidado.' });
  }
  if (p.modeloPreco === 'por_faixa') {
    problemas.push(...validarFaixasPreco(p.faixas));
    if (p.valorExcedenteCentavos === null) {
      problemas.push({
        campo: 'valorExcedenteCentavos',
        mensagem: 'Informe o valor por convidado acima da maior faixa.',
      });
    }
  }
  if (p.maxConvidados !== null && p.maxConvidados < p.minConvidados) {
    problemas.push({
      campo: 'maxConvidados',
      mensagem: 'O máximo não pode ser menor que o mínimo.',
    });
  }
  return problemas;
}

export type FaixaIdadeEntrada = {
  rotulo: string;
  idadeMin: number;
  idadeMax: number | null;
  fatorBp: number;
};

/**
 * Faixas de idade: começam em 0, sem sobreposição e sem buracos (cada faixa começa logo
 * depois da anterior). Só a última pode ficar sem idade máxima ("11 anos ou mais").
 * Lista vazia é válida (sem política de crianças).
 */
export function validarFaixasIdade(faixas: FaixaIdadeEntrada[]): Problema[] {
  const problemas: Problema[] = [];
  const ordenadas = faixas.map((f, i) => ({ ...f, i })).sort((a, b) => a.idadeMin - b.idadeMin);
  ordenadas.forEach((f, pos) => {
    const campo = `faixas.${f.i}`;
    if (f.idadeMax !== null && f.idadeMax < f.idadeMin) {
      problemas.push({
        campo: `${campo}.idadeMax`,
        mensagem: 'A idade máxima é menor que a mínima.',
      });
      return;
    }
    if (pos === 0 && f.idadeMin !== 0) {
      problemas.push({
        campo: `${campo}.idadeMin`,
        mensagem: 'A primeira faixa precisa começar em 0 ano.',
      });
    }
    const anterior = ordenadas[pos - 1];
    if (anterior) {
      if (anterior.idadeMax === null) {
        problemas.push({
          campo: `${campo}.idadeMin`,
          mensagem: 'Só a última faixa pode ficar sem idade máxima.',
        });
      } else if (f.idadeMin <= anterior.idadeMax) {
        problemas.push({
          campo: `${campo}.idadeMin`,
          mensagem: 'Essa faixa se sobrepõe à anterior.',
        });
      } else if (f.idadeMin > anterior.idadeMax + 1) {
        problemas.push({
          campo: `${campo}.idadeMin`,
          mensagem: `Falta cobrir de ${anterior.idadeMax + 1} a ${f.idadeMin - 1} anos.`,
        });
      }
    }
  });
  return problemas;
}

export type FaixaDeslocamentoEntrada = { ateKm: number; valorCentavos: number };

/** Faixas de deslocamento em ordem crescente de km, sem repetição. */
export function validarFaixasDeslocamento(faixas: FaixaDeslocamentoEntrada[]): Problema[] {
  const problemas: Problema[] = [];
  faixas.forEach((f, i) => {
    const anterior = faixas[i - 1];
    if (anterior && f.ateKm <= anterior.ateKm) {
      problemas.push({
        campo: `faixas.${i}.ateKm`,
        mensagem: 'As faixas precisam estar em ordem crescente de distância, sem repetir.',
      });
    }
  });
  return problemas;
}

/** Turno: duração maior que zero e pelo menos um dia da semana. */
export function validarTurno(t: { duracaoMin: number; diasSemana: number[] }): Problema[] {
  const problemas: Problema[] = [];
  if (!(t.duracaoMin > 0))
    problemas.push({ campo: 'duracaoMin', mensagem: 'Informe a duração do turno.' });
  if (t.diasSemana.length === 0) {
    problemas.push({ campo: 'diasSemana', mensagem: 'Escolha pelo menos um dia da semana.' });
  }
  return problemas;
}

/** Um opcional não pode ser compatível e incluso no mesmo pacote. */
export function validarVinculosOpcional(v: {
  compativeis: string[];
  inclusos: string[];
}): Problema[] {
  const inclusos = new Set(v.inclusos);
  return v.compativeis.some((id) => inclusos.has(id))
    ? [
        {
          campo: 'pacotes',
          mensagem: 'O opcional não pode ser compatível e incluso no mesmo pacote.',
        },
      ]
    : [];
}
