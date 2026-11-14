import { describe, expect, it } from 'vitest';
import { canaisDoTipo, ROTULO_TIPO_AVISO, TIPOS_CONFIGURAVEIS } from '@/domain/avisos/canais';
import { textoAviso } from '@/domain/avisos/textos';

/* §93: aviso da mensagem programada (só push e painel; leva ao lead, onde o envio é um toque). */

describe('aviso de mensagem programada', () => {
  it('texto e caminho do lead', () => {
    expect(textoAviso('mensagem_programada', { lead_nome: 'Ana Lima' }, { leadId: 'l1' })).toEqual({
      titulo: 'Hora de mandar a mensagem para Ana Lima',
      corpo: 'A mensagem está pronta. Abra o lead e envie pelo WhatsApp com um toque.',
      caminho: '/app/leads/l1',
    });
  });

  it('push por padrão, sem WhatsApp, configurável em Minha conta', () => {
    expect(canaisDoTipo('mensagem_programada', null)).toEqual(['push']);
    expect(
      canaisDoTipo('mensagem_programada', { mensagem_programada: ['push', 'whatsapp'] }),
    ).toEqual(['push']);
    expect(canaisDoTipo('mensagem_programada', { mensagem_programada: [] })).toEqual([]);
    expect(TIPOS_CONFIGURAVEIS).toContain('mensagem_programada');
    expect(ROTULO_TIPO_AVISO.mensagem_programada).toBe('Mensagem programada na hora');
  });
});
