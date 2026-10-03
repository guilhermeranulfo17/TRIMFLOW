import 'server-only';
import { cache } from 'react';

/*
 * Contexto da requisição quando a equipe Orkestra está no modo suporte. usuarioAtual() preenche;
 * comUsuario() lê e liga a GUC orkestra.suporte_admin na transação (a auditoria marca
 * dados.suporte). Fora de uma requisição o cache não memoiza: volta sempre vazio.
 */
export const contextoSuporte = cache((): { admin: string | null } => ({ admin: null }));
