import type { Metadata } from 'next';
import Link from 'next/link';
import { dataDaVersao, VERSAO_DOCUMENTOS } from '@/domain/legal/versao';

export const metadata: Metadata = { title: 'Política de Privacidade' };

/*
 * MODELO (Etapa 9B): precisa de revisão de advogado antes do uso comercial. Mudou o texto? Suba
 * VERSAO_DOCUMENTOS em src/domain/legal/versao.ts.
 */
export default function Privacidade() {
  return (
    <>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Política de Privacidade</h1>
      <p className="text-muted-foreground text-sm">
        Versão {VERSAO_DOCUMENTOS}, publicada em {dataDaVersao()}
      </p>

      <h2>Quem somos</h2>
      <p>
        O Orkestra é a plataforma que buffets usam para montar orçamentos pela internet. Esta
        política explica dois tratamentos diferentes, conforme a Lei Geral de Proteção de Dados (Lei
        13.709/2018):
      </p>
      <ul>
        <li>
          <strong>Dados de quem pede orçamento a um buffet</strong> (o lead): o buffet é o
          controlador e o Orkestra é o operador, tratando esses dados em nome do buffet.
        </li>
        <li>
          <strong>Dados dos buffets e das suas equipes</strong> (quem usa o painel): o Orkestra é o
          controlador.
        </li>
      </ul>

      <h2>Se você pediu um orçamento a um buffet</h2>
      <p>Coletamos, em nome do buffet:</p>
      <ul>
        <li>Nome e WhatsApp (e e-mail, se o buffet pedir), informados por você.</li>
        <li>As escolhas da festa: tipo, data, horário, convidados, pacote e extras.</li>
        <li>Pedidos de pré-reserva e de visita, e o histórico do atendimento feito pelo buffet.</li>
        <li>
          Dados técnicos mínimos contra abuso: só um código irreversível (hash) derivado do endereço
          IP, nunca o IP em si. Métricas de uso do formulário, sem nada que identifique você.
        </li>
      </ul>
      <p>
        Usamos para calcular e enviar o orçamento e para o buffet falar com você sobre ele, a
        reserva e a visita. A base legal é o seu consentimento (marcado no formulário, com versão e
        data) e os procedimentos preliminares ao contrato que você pediu. Os dados ficam com o
        buffet e com os provedores que operam o serviço (veja{' '}
        <Link href="/subprocessadores">subprocessadores</Link>); não vendemos dados.
      </p>
      <p>
        <strong>Por quanto tempo:</strong> enquanto o buffet precisar para atender você ou cumprir
        obrigações legais. Se não houver reserva nem contato pelo prazo escolhido pelo buffet (24
        meses, se ele não mudou), nome, WhatsApp, e-mail e anotações são apagados automaticamente.
      </p>
      <p>
        <strong>Seus direitos:</strong> acesso, correção, exclusão e revogação do consentimento.
        Peça ao buffet pelo WhatsApp da página dele: o painel permite que ele envie uma cópia dos
        seus dados ou apague tudo. Se escrever para o Orkestra, encaminhamos ao buffet.
      </p>

      <h2>Se você assinar um contrato pelo link do buffet</h2>
      <p>
        Quando o buffet manda o contrato da festa por um link, registramos, em nome do buffet, o que
        comprova a sua assinatura eletrônica: nome completo e CPF informados por você, data e hora,
        um código irreversível (hash) derivado do endereço IP, o tipo de aparelho e navegador e a
        impressão digital (SHA-256) do texto assinado. Se o buffet pedir o código por e-mail, usamos
        o seu e-mail só para enviar esse código.
      </p>
      <p>
        O CPF fica guardado de forma cifrada e aparece mascarado no comprovante (por exemplo,
        ***.456.789-**). A base legal é a execução do contrato e o exercício de direitos em caso de
        discussão sobre ele. O contrato assinado fica guardado enquanto o buffet precisar comprovar
        o que foi combinado: em regra, até 5 anos depois da data da festa, e depois os dados
        pessoais são apagados. Contrato que não foi assinado segue o mesmo prazo dos dados do
        orçamento.
      </p>

      <h2>Se você usa o painel do Orkestra (buffets e equipes)</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail, WhatsApp, nome e cidade do buffet, e a senha
          (guardada só como código irreversível pelo provedor de login). Com o login do Google,
          recebemos nome e e-mail da sua conta Google.
        </li>
        <li>
          <strong>Cobrança:</strong> nome ou razão social, CPF ou CNPJ e e-mail de cobrança,
          enviados ao Asaas para emitir as faturas.
        </li>
        <li>
          <strong>Origem do cadastro:</strong> se você chegou por um anúncio ou link de divulgação,
          guardamos os parâmetros da campanha (utm_source, utm_medium, utm_campaign, ref). É um dado
          da empresa, usado para saber quais campanhas funcionam; nunca é ligado aos clientes do
          buffet.
        </li>
        <li>
          <strong>Uso e segurança:</strong> registros técnicos (horário, ações no painel, auditoria
          de quem alterou o quê) e relatórios de erro sem dados pessoais (Sentry). Aceites destes
          termos com versão e data.
        </li>
        <li>
          <strong>Avisos:</strong> notificações no navegador e, se você ligar, mensagens no WhatsApp
          da equipe pela API oficial da Meta. E-mails do serviço (boas-vindas, faturas, avisos da
          conta).
        </li>
      </ul>
      <p>
        Bases legais: execução do contrato (prestar o serviço e cobrar), legítimo interesse
        (segurança, prevenção de fraude e melhoria do produto) e obrigação legal (registros
        fiscais). Guardamos enquanto a conta existir; com a exclusão da conta, os dados são apagados
        em 30 dias, salvo o que a lei obriga a manter (por exemplo, dados fiscais das faturas, que o
        Asaas guarda).
      </p>

      <h2>Transferência internacional</h2>
      <p>
        Alguns provedores ficam fora do Brasil (veja{' '}
        <Link href="/subprocessadores">subprocessadores</Link>). O banco de dados fica em São Paulo.
        As transferências seguem o art. 33 da LGPD, com provedores que adotam cláusulas contratuais
        e medidas de segurança compatíveis.
      </p>

      <h2>Segurança</h2>
      <p>
        Conexão criptografada, isolamento dos dados de cada buffet no banco, verificação em duas
        etapas disponível no painel, limite de tentativas no login e acesso do suporte só com o
        consentimento do dono e com registro de cada ação.
      </p>

      <h2>Contato</h2>
      <p>
        Pedidos sobre dados pessoais: pelo e-mail de contato no rodapé da página inicial. Leia
        também os <Link href="/termos">Termos de uso</Link>, que incluem o acordo de tratamento de
        dados entre o buffet e o Orkestra.
      </p>
    </>
  );
}
