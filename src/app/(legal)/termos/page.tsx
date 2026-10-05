import type { Metadata } from 'next';
import Link from 'next/link';
import { dataDaVersao, VERSAO_DOCUMENTOS } from '@/domain/legal/versao';

export const metadata: Metadata = { title: 'Termos de uso' };

/*
 * MODELO (Etapa 9B): precisa de revisão de advogado antes do uso comercial. Mudou o texto? Suba
 * VERSAO_DOCUMENTOS em src/domain/legal/versao.ts: os donos aceitam de novo no próximo acesso.
 */
export default function Termos() {
  return (
    <>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Termos de uso</h1>
      <p className="text-muted-foreground text-sm">
        Versão {VERSAO_DOCUMENTOS}, publicada em {dataDaVersao()}
      </p>

      <h2>1. Quem somos e a quem estes termos se aplicam</h2>
      <p>
        O Orkestra é um software, vendido por assinatura, para buffets de festas montarem orçamentos
        pela internet, organizarem os pedidos e a agenda. Estes termos valem para (a) o buffet que
        cria uma conta e usa o painel (o <strong>Cliente</strong>, representado pelo dono da conta)
        e (b) a pessoa que monta um orçamento no link de um buffet (o <strong>Visitante</strong>).
      </p>

      <h2>2. Conta, teste grátis e assinatura (para buffets)</h2>
      <ul>
        <li>
          A conta é criada pelo dono do buffet, que responde pelas informações cadastradas e pelos
          acessos que libera para a equipe.
        </li>
        <li>
          O teste grátis dura 14 dias, sem cartão. Depois dele, o uso depende de uma assinatura
          (mensal ou anual), cobrada pelo Asaas por boleto, Pix ou cartão.
        </li>
        <li>
          Fatura vencida há mais de 7 dias deixa a conta em modo somente leitura: nada é apagado, e
          o acesso volta ao confirmar o pagamento.
        </li>
        <li>
          O cancelamento pode ser feito a qualquer momento em Minha empresa → Plano. O acesso
          continua até o fim do período já pago.
        </li>
        <li>
          Preços e limites dos planos estão na página inicial e podem mudar com aviso prévio de 30
          dias; o novo valor só vale a partir da fatura seguinte ao aviso.
        </li>
      </ul>

      <h2>3. Uso adequado</h2>
      <ul>
        <li>
          Não use o Orkestra para enviar mensagens não solicitadas, dados de terceiros sem base
          legal, conteúdo ilegal ou para tentar burlar a segurança do sistema.
        </li>
        <li>
          O Visitante não deve informar dados de outras pessoas sem autorização nem fazer pedidos
          falsos. Pedidos em excesso podem ser bloqueados temporariamente.
        </li>
      </ul>

      <h2>4. O orçamento online e a pré-reserva (para quem pede orçamento)</h2>
      <p>
        Os valores mostrados são calculados com as regras e preços cadastrados pelo buffet no dia em
        que o orçamento foi montado e valem até a data de validade indicada na proposta. A
        pré-reserva segura a data por um prazo definido pelo buffet e só vira reserva quando o
        buffet confirma o pagamento do sinal. O contrato da festa é feito entre o Visitante e o
        buffet: o Orkestra fornece a ferramenta e não participa da prestação do serviço do buffet.
      </p>
      <p>
        <strong>Contrato digital.</strong> O buffet pode enviar o contrato da festa por um link para
        o Visitante assinar. É uma assinatura eletrônica simples: as duas partes aceitam o texto, e
        o Orkestra registra nome, CPF, data, hora, um código do IP e a impressão digital (SHA-256)
        do documento. Não é certificado digital ICP-Brasil. O Orkestra não é parte do contrato: é a
        ferramenta de registro. Os modelos de contrato oferecidos são sugestões; o buffet é
        responsável pelo texto que envia e deve revisá-lo com um advogado.
      </p>

      <h2>5. Dados, exportação e exclusão da conta</h2>
      <ul>
        <li>
          Os dados cadastrados pelo buffet e os dados dos seus clientes pertencem ao buffet. A
          qualquer momento o dono pode baixar tudo em Minha empresa → Privacidade e dados.
        </li>
        <li>
          O dono pode pedir a exclusão da conta. Ela fica 30 dias em modo somente leitura (para
          exportar ou desistir) e depois é apagada de vez, com as fotos e os acessos da equipe.
        </li>
      </ul>

      <h2>6. Disponibilidade e responsabilidade</h2>
      <p>
        Trabalhamos para manter o Orkestra no ar e com backups, mas o serviço pode ter interrupções
        para manutenção ou por falhas de terceiros (hospedagem, internet, provedores de pagamento).
        O Orkestra não responde por negócios que o buffet faz ou deixa de fazer com seus clientes,
        nem por preços cadastrados errado.
      </p>

      <h2 id="acordo-de-tratamento">7. Acordo de tratamento de dados (LGPD)</h2>
      <p>
        Esta seção é o acordo entre o buffet (<strong>controlador</strong>) e o Orkestra (
        <strong>operador</strong>) sobre os dados pessoais dos clientes do buffet (leads), nos
        termos da Lei 13.709/2018.
      </p>
      <ul>
        <li>
          <strong>Objeto e instruções:</strong> o Orkestra trata os dados só para prestar o serviço
          contratado (orçamentos, propostas, agenda, avisos à equipe) e segundo as configurações
          feitas pelo buffet no painel, que são as instruções do controlador.
        </li>
        <li>
          <strong>Finalidade e base legal:</strong> cabe ao buffet definir e garantir a base legal
          do tratamento; o link público coleta o consentimento do Visitante com versão e data.
        </li>
        <li>
          <strong>Confidencialidade e acesso:</strong> só a equipe do buffet acessa os dados. A
          equipe do Orkestra só entra na conta com o consentimento do dono (válido por 7 dias), com
          registro de cada ação.
        </li>
        <li>
          <strong>Segurança:</strong> dados criptografados em trânsito, isolamento entre buffets no
          banco (RLS), senhas nunca guardadas em texto, IP guardado só como código irreversível,
          registros de erro sem dados pessoais e verificação em duas etapas disponível.
        </li>
        <li>
          <strong>Subprocessadores:</strong> o Orkestra usa os provedores listados em{' '}
          <Link href="/subprocessadores">/subprocessadores</Link>, com obrigações de proteção
          equivalentes, e avisa os donos antes de incluir um novo.
        </li>
        <li>
          <strong>Incidentes:</strong> em caso de incidente de segurança que afete os dados, o
          Orkestra avisa o dono da conta sem demora injustificada, com o que se sabe e o que foi
          feito, para que o buffet cumpra suas obrigações com a ANPD e os titulares.
        </li>
        <li>
          <strong>Direitos dos titulares:</strong> o painel permite ao buffet exportar e apagar os
          dados de um lead a pedido dele. Pedidos que chegarem ao Orkestra são encaminhados ao
          buffet.
        </li>
        <li>
          <strong>Retenção:</strong> leads sem reserva e sem atividade pelo prazo escolhido pelo
          buffet (padrão de 24 meses) são anonimizados automaticamente. Contratos assinados ficam
          guardados (inclusive se o lead pedir a exclusão dos dados) até 5 anos depois da data da
          festa, para o buffet comprovar o que foi combinado; contratos não assinados seguem a regra
          do lead.
        </li>
        <li>
          <strong>Fim do contrato:</strong> o buffet pode exportar os dados a qualquer momento; com
          a exclusão da conta, tudo é apagado em 30 dias, inclusive os contratos assinados e os PDFs
          (baixe antes os que precisar guardar). Backups do provedor expiram no ciclo deles.
        </li>
      </ul>

      <h2>8. Mudanças nestes termos</h2>
      <p>
        Quando estes termos ou a Política de Privacidade mudarem, o dono da conta verá a nova versão
        e precisará aceitá-la no próximo acesso.
      </p>

      <h2>9. Contato e foro</h2>
      <p>
        Dúvidas: pelo e-mail informado no rodapé da página inicial. Fica eleito o foro do domicílio
        do Cliente para questões destes termos.
      </p>
    </>
  );
}
