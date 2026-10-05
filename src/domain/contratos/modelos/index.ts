import type { Segmento } from '../../segmento';
import { OPCOES_PADRAO, type OpcoesContrato } from '../opcoes';
import { TEXTO_DOMICILIO } from './domicilio';
import { TEXTO_EVENTOS } from './eventos';
import { TEXTO_INFANTIL } from './infantil';

/*
 * Modelos de contrato do sistema, um por segmento, com versão. Ficam no código (somente
 * leitura); o dono copia para a empresa e edita a cópia. Subir a versão aqui não muda nenhum
 * contrato enviado (o texto de cada contrato é congelado no envio).
 */

export type ModeloPadrao = {
  codigo: string;
  versao: number;
  segmento: Segmento;
  titulo: string;
  texto: string;
  opcoes: OpcoesContrato;
};

export const AVISO_MODELO =
  'Este é um modelo de apoio. Peça a um advogado para revisar antes de usar.';

export const MODELOS_PADRAO: Record<Segmento, ModeloPadrao> = {
  infantil: {
    codigo: 'infantil',
    versao: 1,
    segmento: 'infantil',
    titulo: 'Festa infantil (modelo Orkestra)',
    texto: TEXTO_INFANTIL,
    opcoes: OPCOES_PADRAO,
  },
  domicilio: {
    codigo: 'domicilio',
    versao: 1,
    segmento: 'domicilio',
    titulo: 'Festa em domicílio (modelo Orkestra)',
    texto: TEXTO_DOMICILIO,
    opcoes: OPCOES_PADRAO,
  },
  eventos: {
    codigo: 'eventos',
    versao: 1,
    segmento: 'eventos',
    titulo: 'Casamentos e eventos (modelo Orkestra)',
    texto: TEXTO_EVENTOS,
    opcoes: OPCOES_PADRAO,
  },
};

/** "infantil@1": de qual modelo do sistema a cópia da empresa saiu. */
export const origemModelo = (m: ModeloPadrao) => `${m.codigo}@${m.versao}`;
