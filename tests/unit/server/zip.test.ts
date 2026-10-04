import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { montarZip } from '@/server/lgpd/zip';

function temPython(): boolean {
  try {
    execFileSync('python3', ['--version']);
    return true;
  } catch {
    return false;
  }
}

describe('montarZip', () => {
  it('começa e termina com as assinaturas do ZIP', () => {
    const zip = montarZip([{ nome: 'a.csv', conteudo: 'x;y\r\n1;2' }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(1);
  });

  it.runIf(temPython())('abre num leitor de ZIP de verdade, com acentos no nome', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'zip-'));
    const caminho = join(pasta, 'teste.zip');
    const grande = 'linha;com;dados\r\n'.repeat(5000);
    writeFileSync(
      caminho,
      montarZip([
        { nome: 'orçamentos.csv', conteudo: '﻿número;total\r\n1;1000' },
        { nome: 'leads.csv', conteudo: grande },
      ]),
    );
    const saida = execFileSync('python3', [
      '-c',
      `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(z.namelist())
print(len(z.read('leads.csv')))
print(z.read('orçamentos.csv').decode('utf-8-sig'))`,
      caminho,
    ]).toString();
    expect(saida).toContain("['orçamentos.csv', 'leads.csv']");
    expect(saida).toContain(String(Buffer.byteLength(grande)));
    expect(saida).toContain('número;total');
  });
});
