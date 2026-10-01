import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Política de Privacidade' };

export default function Privacidade() {
  return (
    <>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Política de Privacidade</h1>
      <p className="text-muted-foreground text-sm">Versão 2026-10-v1</p>

      <h2>Quem somos</h2>
      <p>
        O Orkestra é a plataforma que o buffet usa para montar orçamentos pela internet. O buffet é
        o responsável (controlador) pelos dados que você informa no orçamento dele; o Orkestra trata
        esses dados em nome do buffet (operador), conforme a Lei Geral de Proteção de Dados (Lei
        13.709/2018).
      </p>

      <h2>Quais dados coletamos</h2>
      <ul>
        <li>Nome e WhatsApp, informados por você ao pedir o orçamento.</li>
        <li>As escolhas da festa: tipo, data, horário, convidados, pacote e extras.</li>
        <li>Pedidos de pré-reserva e de visita.</li>
        <li>
          Dados técnicos mínimos para evitar abuso: guardamos apenas um código irreversível (hash)
          derivado do endereço IP, nunca o IP em si.
        </li>
        <li>
          Métricas de uso do formulário (em qual passo a pessoa parou), sem nenhum dado que
          identifique você.
        </li>
      </ul>

      <h2>Para que usamos</h2>
      <ul>
        <li>Calcular e enviar o orçamento da sua festa.</li>
        <li>Permitir que o buffet fale com você sobre esse orçamento, a reserva e a visita.</li>
        <li>Proteger o serviço contra uso abusivo.</li>
      </ul>
      <p>
        A base legal é o seu consentimento, dado ao marcar a caixa de autorização, e a execução de
        procedimentos preliminares ao contrato que você pediu.
      </p>

      <h2>Com quem compartilhamos</h2>
      <p>
        Só com o buffet do orçamento. Usamos provedores de hospedagem e banco de dados para operar o
        serviço. Não vendemos seus dados.
      </p>

      <h2>Por quanto tempo guardamos</h2>
      <p>
        Enquanto o buffet precisar deles para atender você ou cumprir obrigações legais. Você pode
        pedir a exclusão a qualquer momento.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção ou exclusão dos seus dados e retirar o consentimento. Fale
        diretamente com o buffet pelo WhatsApp informado na página dele.
      </p>
    </>
  );
}
