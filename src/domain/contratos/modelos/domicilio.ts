/*
 * Modelo de apoio (versão enxuta): festa na casa do cliente ou em local escolhido por ele.
 * NÃO é aconselhamento jurídico: o dono deve pedir a um advogado para revisar.
 */

export const TEXTO_DOMICILIO = `# Contrato de prestação de serviços para festa em domicílio

## 1. Partes

CONTRATADO: {{buffet_razao_social}}, nome fantasia {{buffet_nome}}, CNPJ {{buffet_cnpj}}, com endereço em {{buffet_endereco}}.

CONTRATANTE: {{cliente_nome}}, CPF {{cliente_cpf}}, WhatsApp {{cliente_whatsapp}}.

## 2. Serviço

O CONTRATADO vai atender a festa abaixo no local indicado pelo CONTRATANTE, com a comida, as bebidas, os equipamentos e a equipe do pacote escolhido.

- Tipo de festa: {{tipo_evento}}
- Data: {{data_evento}}
- Horário de atendimento: {{horario}}
- Local: {{espaco}}
- Convidados: {{convidados}}
- Pacote: {{pacote}}

Está incluso:

{{itens}}

## 3. Valor e pagamento

Valor total: {{valor_total}}. Sinal para reservar a data: {{sinal}}. Saldo de {{saldo}}, pago {{prazo_saldo}}. Formas de pagamento: {{forma_pagamento}}.

A data só fica reservada depois do pagamento do sinal.

## 4. Local da festa

O CONTRATANTE garante o acesso da equipe ao local pelo menos 2 horas antes do início, com ponto de energia, água e espaço adequado para montar a estrutura. Problemas no local que impeçam o serviço não geram devolução de valores.

## 5. Cancelamento e remarcação

{{regras_cancelamento}}

Remarcação: uma vez, sem multa, pedindo com pelo menos {{prazo_remarcacao}} de antecedência, conforme a agenda do CONTRATADO.

## 6. Horas extras e convidados a mais

Hora extra, se houver disponibilidade: {{hora_extra}} por hora. Convidados a mais são cobrados pelo valor do pacote, combinados até 7 dias antes.

## 7. Responsabilidades

O CONTRATANTE informa alergias e restrições alimentares até 7 dias antes, cuida dos menores de idade convidados e responde por danos causados pelos convidados aos equipamentos do CONTRATADO. O CONTRATADO entrega o serviço combinado, segue as normas de higiene e mantém a equipe necessária durante a festa.

## 8. Força maior

Se a festa não puder acontecer por motivo que nenhuma das partes pode evitar, as partes combinam nova data em até 12 meses, sem multa.

{{#uso_imagem}}
## 9. Uso de imagem

O CONTRATANTE autoriza o uso de fotos da montagem e da festa na divulgação do CONTRATADO, sem identificar convidados pelo nome. A autorização pode ser cancelada a qualquer momento, por mensagem.
{{/uso_imagem}}

## Dados pessoais, assinatura eletrônica e foro

Os dados pessoais do CONTRATANTE são usados só para cumprir este contrato e as obrigações legais (LGPD). As partes aceitam a assinatura eletrônica por aceite no link, registrada com nome, CPF, data, hora e a impressão digital do documento (SHA-256), como prova de autoria e de que o texto não foi alterado. Foro da cidade de {{buffet_cidade}}.

{{buffet_cidade}}, {{data_contrato}}.
`;
