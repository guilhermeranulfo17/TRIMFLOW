/*
 * Modelo de apoio (versão enxuta): casamentos, aniversários adultos e eventos sociais ou de
 * empresa. NÃO é aconselhamento jurídico: o dono deve pedir a um advogado para revisar.
 */

export const TEXTO_EVENTOS = `# Contrato de prestação de serviços para evento

## 1. Partes

CONTRATADO: {{buffet_razao_social}}, nome fantasia {{buffet_nome}}, CNPJ {{buffet_cnpj}}, com endereço em {{buffet_endereco}}.

CONTRATANTE: {{cliente_nome}}, CPF {{cliente_cpf}}, WhatsApp {{cliente_whatsapp}}.

## 2. Evento

- Tipo de evento: {{tipo_evento}}
- Data: {{data_evento}}
- Horário: {{horario}} (duração de {{duracao}})
- Local: {{espaco}}
- Convidados: {{convidados}}
- Pacote: {{pacote}}

Está incluso:

{{itens}}

Não está incluso: {{nao_incluso}}

## 3. Valor e pagamento

Valor total: {{valor_total}}. Sinal para reservar a data: {{sinal}}. Saldo de {{saldo}}, pago {{prazo_saldo}}. Formas de pagamento: {{forma_pagamento}}.

A data só fica reservada depois do pagamento do sinal. Atraso gera multa de 2% e juros de 1% ao mês.

## 4. Cancelamento e remarcação

{{regras_cancelamento}}

Remarcação: uma vez, sem multa, pedindo com pelo menos {{prazo_remarcacao}} de antecedência, para data livre em até 12 meses.

## 5. Convidados e horas extras

Número final de convidados confirmado até 10 dias antes. {{convidados_extras}} Hora extra, se houver disponibilidade: {{hora_extra}} por hora.

## 6. Responsabilidades

O CONTRATANTE informa alergias e restrições alimentares até 10 dias antes, responde pelos danos causados pelos convidados e só traz itens de fora (bolo, doces, bebidas, decoração ou fornecedores) com autorização prévia do CONTRATADO, que não responde por eles. O CONTRATADO entrega o serviço combinado com a equipe necessária, seguindo as normas de higiene e segurança. Bebida alcoólica não é servida a menores de 18 anos.

## 7. Força maior

Se o evento não puder acontecer por motivo que nenhuma das partes pode evitar, as partes combinam nova data em até 12 meses, sem multa.

{{#uso_imagem}}
## 8. Uso de imagem

O CONTRATANTE autoriza o uso de fotos e vídeos do espaço decorado e do evento na divulgação do CONTRATADO, sem identificar convidados pelo nome. A autorização pode ser cancelada a qualquer momento, por mensagem.
{{/uso_imagem}}

## Dados pessoais, assinatura eletrônica e foro

Os dados pessoais do CONTRATANTE são usados só para cumprir este contrato e as obrigações legais (LGPD). As partes aceitam a assinatura eletrônica por aceite no link, registrada com nome, CPF, data, hora e a impressão digital do documento (SHA-256), como prova de autoria e de que o texto não foi alterado. Foro da cidade de {{buffet_cidade}}.

{{buffet_cidade}}, {{data_contrato}}.
`;
