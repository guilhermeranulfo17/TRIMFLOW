/*
 * Modelo de apoio: festa infantil em espaço próprio do buffet. Linguagem simples, cláusulas
 * curtas. NÃO é aconselhamento jurídico: o dono deve pedir a um advogado para revisar.
 */

export const TEXTO_INFANTIL = `# Contrato de prestação de serviços de festa infantil

## 1. Quem são as partes

CONTRATADO: {{buffet_razao_social}}, nome fantasia {{buffet_nome}}, CNPJ {{buffet_cnpj}}, com endereço em {{buffet_endereco}}, WhatsApp {{buffet_whatsapp}}.

CONTRATANTE: {{cliente_nome}}, CPF {{cliente_cpf}}, WhatsApp {{cliente_whatsapp}}.

## 2. O que está sendo contratado

O CONTRATADO vai realizar a festa descrita abaixo, com a estrutura, a comida, as bebidas e a equipe do pacote escolhido.

- Tipo de festa: {{tipo_evento}}
- Data: {{data_evento}}
- Horário: {{horario}} (duração de {{duracao}})
- Local: {{espaco}}, no endereço do CONTRATADO
- Número de convidados: {{convidados}}
- Pacote: {{pacote}}

Está incluso:

{{itens}}

Não está incluso: {{nao_incluso}}

## 3. Valor e forma de pagamento

O valor total da festa é {{valor_total}}.

Para reservar a data, o CONTRATANTE paga um sinal de {{sinal}}. O saldo de {{saldo}} deve ser pago {{prazo_saldo}}.

Formas de pagamento aceitas: {{forma_pagamento}}.

Atraso no pagamento do saldo gera multa de 2% e juros de 1% ao mês sobre o valor em atraso. Se o saldo não for pago até o dia da festa, o CONTRATADO pode não realizar a festa, aplicando as regras de cancelamento da cláusula 5.

## 4. Reserva da data

A data só fica reservada depois que o sinal for pago. Enquanto o sinal não for pago, o CONTRATADO pode oferecer a data para outro cliente, sem nenhuma multa para as duas partes.

## 5. Cancelamento e remarcação

Se o CONTRATANTE cancelar a festa, a multa depende de quantos dias faltam para a data:

{{regras_cancelamento}}

O valor já pago que passar da multa é devolvido em até 30 dias. Se o valor pago for menor que a multa, o CONTRATANTE paga a diferença.

O CONTRATANTE pode remarcar a festa uma vez, sem multa, pedindo com pelo menos {{prazo_remarcacao}} de antecedência, para uma data livre em até 12 meses. Os valores podem ser atualizados pela tabela vigente na data da remarcação.

Se o CONTRATADO cancelar a festa por um motivo que dependa dele, devolve tudo o que recebeu, em até 10 dias, mais uma multa igual ao valor do sinal.

## 6. Convidados a mais ou a menos

O número final de convidados deve ser confirmado até 7 dias antes da festa. {{convidados_extras}}

Convidados acima do contratado só entram se houver capacidade no espaço e são cobrados pelo valor do pacote. Diminuir o número de convidados não reduz o valor abaixo do mínimo do pacote.

Crianças de colo (até 2 anos) não contam como convidados, salvo regra diferente no pacote.

## 7. Horas extras

A festa termina no horário combinado. Se o CONTRATANTE quiser estender, e o CONTRATADO puder, cada hora extra custa {{hora_extra}}, pagos no dia.

## 8. Responsabilidades do CONTRATANTE

- Informar até 7 dias antes da festa qualquer alergia ou restrição alimentar dos convidados. O CONTRATADO não se responsabiliza por reações de alergia que não foram avisadas.
- Cuidar das crianças convidadas. Os menores de idade ficam sob a responsabilidade dos pais ou de quem os trouxe, mesmo com a equipe de monitores do CONTRATADO.
- Pagar os danos causados ao espaço, aos móveis ou aos equipamentos pelos convidados.
- Respeitar as regras do espaço, o horário e a lei sobre bebida alcoólica, que não pode ser servida a menores de 18 anos.

## 9. Responsabilidades do CONTRATADO

- Entregar o cardápio, a decoração e os serviços do pacote, com a qualidade combinada.
- Manter a equipe necessária durante toda a festa, uniformizada e treinada.
- Seguir as normas de higiene e de segurança de alimentos e manter o espaço limpo, seguro e com as licenças em dia.
- Avisar o CONTRATANTE o quanto antes sobre qualquer problema que possa afetar a festa.

## 10. Itens trazidos de fora

Comida, bebida, bolo, doces ou decoração trazidos pelo CONTRATANTE só podem entrar com autorização do CONTRATADO, combinada antes da festa. O CONTRATADO não responde pela qualidade, pela conservação nem pelos danos de itens trazidos de fora, e pode recusar itens sem nota fiscal ou sem condições de higiene.

## 11. Caso fortuito e força maior

Se a festa não puder acontecer por motivo que nenhuma das partes pode evitar (por exemplo: enchente, falta de energia geral, ordem das autoridades ou pandemia), as partes combinam uma nova data em até 12 meses, sem multa. Se não houver acordo, o valor pago é devolvido, descontadas as despesas já feitas e comprovadas.

{{#uso_imagem}}
## 12. Uso de imagem

O CONTRATANTE autoriza o CONTRATADO a usar fotos e vídeos do espaço decorado e da festa nas redes sociais e no material de divulgação do buffet, sem pagamento. Imagens de crianças só são publicadas sem identificar o nome. O CONTRATANTE pode cancelar esta autorização a qualquer momento, por mensagem, e as imagens são retiradas em até 30 dias.
{{/uso_imagem}}

## Proteção de dados (LGPD)

O CONTRATADO usa os dados pessoais do CONTRATANTE (nome, CPF, telefone e e-mail) só para cumprir este contrato, fazer a cobrança e cumprir obrigações legais. Os dados ficam guardados enquanto a lei exigir e não são vendidos nem compartilhados para outros fins. O CONTRATANTE pode pedir acesso, correção ou exclusão dos dados pelo WhatsApp do CONTRATADO, respeitados os prazos legais de guarda.

## Assinatura eletrônica

As partes concordam em assinar este contrato de forma eletrônica, pelo aceite no link enviado pelo CONTRATADO. A assinatura fica registrada com nome, CPF, data, hora e identificação do aparelho, e a impressão digital do documento (código SHA-256) garante que o texto não foi alterado depois da assinatura. As partes reconhecem esta forma de assinatura como válida para comprovar a autoria e a integridade do contrato.

## Foro

Fica escolhido o foro da cidade de {{buffet_cidade}} para resolver qualquer questão sobre este contrato.

{{buffet_cidade}}, {{data_contrato}}.
`;
