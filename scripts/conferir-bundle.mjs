// Etapa 9B (B.2): nenhum chunk do navegador leva os metadados "max" do libphonenumber-js
// (≈ 170 kB; o domínio usa os "min", com a regra do Brasil explícita). Roda depois do build.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// padrão do celular brasileiro que só existe nos metadados max (os min não têm os tipos)
const SO_NO_MAX = '(?:[14689][1-9]|2[12478]|3[1-578]|5[13-5]|7[13-579])[2-5]\\\\d{7}';

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.js') ? [p] : [];
  });
}

const comMax = arquivos('.next/static/chunks').filter((f) =>
  readFileSync(f, 'utf8').includes(SO_NO_MAX),
);
if (comMax.length) {
  console.error('Metadados "max" do libphonenumber-js no navegador:', comMax);
  process.exit(1);
}
console.log('Bundle do navegador sem libphonenumber-js/max.');
