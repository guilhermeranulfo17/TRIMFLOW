import { describe, expect, it } from 'vitest';
import {
  PASSO_DO_TRECHO,
  perguntaDaCapacidade,
  perguntaDoPacote,
  resumoTurnos,
  rotuloDoCatalogo,
  trechoDoPasso,
} from '@/domain/onboarding/conversa';

/* §91: textos e ordem do onboarding em conversa (a tela usa as mesmas ações dos passos). */

describe('onboarding em conversa', () => {
  it('recomeça no trecho do passo salvo e grava o passo de cada trecho', () => {
    expect([1, 2, 3, 4, 5].map(trechoDoPasso)).toEqual([
      'boas_vindas',
      'cidade',
      'precos',
      'agenda',
      'pronto',
    ]);
    expect(trechoDoPasso(0)).toBe('boas_vindas');
    for (const p of [1, 2, 3, 4, 5]) expect(PASSO_DO_TRECHO[trechoDoPasso(p)]).toBe(p);
  });

  it('pergunta o preço por convidado ou da primeira faixa, com o exemplo só como dica', () => {
    expect(
      perguntaDoPacote({
        nome: 'Premium',
        modeloPreco: 'por_pessoa',
        precoPessoaCentavos: 19500,
        faixas: [],
      }),
    ).toEqual({
      texto: 'Quanto você cobra por convidado no pacote Premium?',
      dica: 'No exemplo está R$ 195,00 por convidado.',
    });
    const faixa = perguntaDoPacote({
      nome: 'Alegria',
      modeloPreco: 'por_faixa',
      precoPessoaCentavos: null,
      faixas: [{ ateConvidados: 30, valorCentavos: 300000 }],
    });
    expect(faixa.texto).toBe('Quanto custa o pacote Alegria para até 30 convidados?');
    expect(faixa.dica).toContain('R$ 3.000,00');
    expect(
      perguntaDoPacote({
        nome: 'X',
        modeloPreco: 'por_faixa',
        precoPessoaCentavos: null,
        faixas: [],
      }).texto,
    ).toBe('Quanto custa o pacote X?');
    expect(
      perguntaDoPacote({
        nome: 'Y',
        modeloPreco: 'por_pessoa',
        precoPessoaCentavos: null,
        faixas: [],
      }).dica,
    ).toBeNull();
  });

  it('resume os turnos ativos em português (dias de segunda a domingo e hora de término)', () => {
    expect(
      resumoTurnos([
        { nome: 'Tarde', horaInicio: '13:00', duracaoMin: 300, diasSemana: [0, 6], ativo: true },
        { nome: 'Noite', horaInicio: '20:00', duracaoMin: 360, diasSemana: [5], ativo: true },
        { nome: 'Velho', horaInicio: '10:00', duracaoMin: 60, diasSemana: [1], ativo: false },
        {
          nome: 'Sempre',
          horaInicio: '09:00',
          duracaoMin: 60,
          diasSemana: [0, 1, 2, 3, 4, 5, 6],
          ativo: true,
        },
        { nome: 'Nunca', horaInicio: '09:00', duracaoMin: 60, diasSemana: [], ativo: true },
      ]),
    ).toEqual([
      'Tarde: sábado e domingo, das 13:00 às 18:00',
      'Noite: sexta, das 20:00 às 02:00',
      'Sempre: todos os dias, das 09:00 às 10:00',
      'Nunca: nenhum dia, das 09:00 às 10:00',
    ]);
  });

  it('pergunta a capacidade do salão ou o limite na casa do cliente', () => {
    expect(perguntaDaCapacidade({ nome: 'Salão principal', noLocalDoCliente: false })).toBe(
      'Quantos convidados cabem no Salão principal?',
    );
    expect(perguntaDaCapacidade({ nome: 'Casa', noLocalDoCliente: true })).toContain(
      'casa do cliente',
    );
  });

  it('nomeia o tipo do catálogo (eventos serve a dois modelos)', () => {
    expect(rotuloDoCatalogo('infantil', [])).toBe('Buffet infantil');
    expect(rotuloDoCatalogo('domicilio', [])).toBe('Buffet em domicílio');
    expect(rotuloDoCatalogo('eventos', ['Casamento', 'Formatura'])).toBe('Espaço de eventos');
    expect(rotuloDoCatalogo('eventos', ['Casamento', '15 anos', 'Bodas'])).toBe(
      'Casamento e 15 anos',
    );
  });
});
