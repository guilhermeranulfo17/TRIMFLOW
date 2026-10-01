import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Termos de uso' };

export default function Termos() {
  return (
    <>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Termos de uso</h1>
      <p className="text-muted-foreground text-sm">Versão 2026-10-v1</p>

      <h2>O orçamento online</h2>
      <p>
        Os valores mostrados são calculados com as regras e preços cadastrados pelo buffet no dia em
        que você montou o orçamento, e valem até a data de validade indicada na proposta.
      </p>

      <h2>Pré-reserva</h2>
      <p>
        A pré-reserva segura a data por um prazo definido pelo buffet. Ela só vira reserva quando o
        buffet confirma o pagamento do sinal. Se o prazo vencer, a data fica livre de novo.
      </p>

      <h2>Responsabilidades</h2>
      <p>
        O contrato da festa é feito entre você e o buffet. O Orkestra fornece a ferramenta de
        orçamento e não participa da prestação do serviço do buffet.
      </p>

      <h2>Uso adequado</h2>
      <p>
        Não use o formulário para enviar dados de outras pessoas sem autorização nem para pedidos
        falsos. Pedidos em excesso podem ser bloqueados temporariamente.
      </p>
    </>
  );
}
