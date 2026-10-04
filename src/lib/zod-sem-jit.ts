/*
 * Zod no navegador sem o modo JIT (Etapa 9B, B.2). O Zod 4 testa `Function("")` para compilar
 * validadores; com a CSP sem 'unsafe-eval' isso vira uma violação a cada página. O next.config
 * aponta `zod` para este arquivo só no bundle do navegador (no servidor o JIT segue ligado).
 */
import * as z from 'zod/v4';

z.config({ jitless: true });

export * from 'zod/v4';
export { z, z as default };
