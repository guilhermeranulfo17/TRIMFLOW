import { crc32, deflateRawSync } from 'node:zlib';

/*
 * ZIP mínimo (Etapa 9B, B.1) para a exportação da empresa: deflate do próprio Node, nomes em
 * UTF-8, sem ZIP64 (cada arquivo e o total ficam bem abaixo de 4 GB). Sem dependência nova.
 */

export type ArquivoZip = { nome: string; conteudo: Buffer | string };

function horaDos(d: Date) {
  return (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
}
function dataDos(d: Date) {
  return ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
}

export function montarZip(arquivos: ArquivoZip[], quando = new Date()): Buffer {
  const UTF8 = 0x0800;
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  const hora = horaDos(quando);
  const data = dataDos(quando);

  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, 'utf8');
    const bruto = typeof a.conteudo === 'string' ? Buffer.from(a.conteudo, 'utf8') : a.conteudo;
    const comprimido = deflateRawSync(bruto);
    const crc = crc32(bruto) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(bruto.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, nome, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(data, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(bruto.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nome);

    deslocamento += local.length + nome.length + comprimido.length;
  }

  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}
