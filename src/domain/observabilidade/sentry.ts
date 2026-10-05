import { CHAVE_PESSOAL, mascararTexto } from './log';

/*
 * Limpeza dos eventos do Sentry (Etapa 9B, B.3), aplicada no `beforeSend` do servidor e do
 * navegador. Nada pessoal sai: sem usuário (nome, e-mail, IP), sem cookies, cabeçalhos, corpo
 * nem query da requisição, sem token de proposta no caminho, sem nenhuma chave com cara de dado
 * pessoal ou de lead, e textos com e-mail ou telefone mascarados. Ids (uuid) ficam.
 */

type Json = unknown;

const CONTEXTOS_TECNICOS = new Set([
  'browser',
  'os',
  'runtime',
  'device',
  'trace',
  'app',
  'culture',
]);
type Objeto = Record<string, Json>;

const ehObjeto = (v: Json): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Caminho sem segredos: token da proposta, do contrato (Etapa 10) e query string somem. */
export function limparUrl(url: string): string {
  const semQuery = url.split(/[?#]/)[0] ?? '';
  return semQuery
    .replace(/\/proposta\/[^/]+/g, '/proposta/[token]')
    .replace(/\/contrato\/[^/]+/g, '/contrato/[token]');
}

/** Remove, em qualquer profundidade, as chaves pessoais; mascara textos. */
export function limparValor(v: Json, profundidade = 0): Json {
  if (profundidade > 8) return '[...]';
  if (typeof v === 'string') return mascararTexto(v);
  if (Array.isArray(v)) return v.map((x) => limparValor(x, profundidade + 1));
  if (ehObjeto(v)) {
    const saida: Objeto = {};
    for (const [k, x] of Object.entries(v)) {
      if (CHAVE_PESSOAL.test(k) || /^(lead|leads|usuario|user|email|ip_address)$/i.test(k))
        continue;
      saida[k] = limparValor(x, profundidade + 1);
    }
    return saida;
  }
  return v;
}

export function limparEvento<T>(evento: T): T {
  if (!ehObjeto(evento)) return evento;
  const e: Objeto = { ...evento };
  delete e.user;
  delete e.server_name;
  if (ehObjeto(e.request)) {
    const r = e.request;
    e.request = {
      ...(typeof r.method === 'string' ? { method: r.method } : {}),
      ...(typeof r.url === 'string' ? { url: limparUrl(r.url) } : {}),
    };
  }
  if (typeof e.transaction === 'string') e.transaction = limparUrl(e.transaction);
  if (typeof e.message === 'string') e.message = mascararTexto(e.message);
  if (ehObjeto(e.logentry) && typeof e.logentry.message === 'string') {
    e.logentry = { message: mascararTexto(e.logentry.message) };
  }
  if (ehObjeto(e.exception) && Array.isArray(e.exception.values)) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((x) =>
        ehObjeto(x)
          ? { ...x, value: typeof x.value === 'string' ? mascararTexto(x.value) : x.value }
          : x,
      ),
    };
  }
  for (const campo of ['extra', 'tags']) {
    if (ehObjeto(e[campo])) e[campo] = limparValor(e[campo]);
  }
  if (ehObjeto(e.contexts)) {
    // contextos técnicos do SDK (navegador, sistema, runtime, trace) ficam; o resto é filtrado
    const c: Objeto = {};
    for (const [k, v] of Object.entries(e.contexts)) {
      if (CONTEXTOS_TECNICOS.has(k) && ehObjeto(v)) {
        c[k] = Object.fromEntries(
          Object.entries(v).map(([kk, vv]) => [
            kk,
            typeof vv === 'string' ? mascararTexto(vv) : vv,
          ]),
        );
      } else if (!CHAVE_PESSOAL.test(k) && !/^(usuario|user|lead)$/i.test(k)) {
        c[k] = limparValor(v);
      }
    }
    e.contexts = c;
  }
  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = e.breadcrumbs.map(limparBreadcrumb);
  return e as T;
}

export function limparBreadcrumb<T>(b: T): T {
  if (!ehObjeto(b)) return b;
  const c: Objeto = { ...b };
  if (typeof c.message === 'string') c.message = mascararTexto(c.message);
  if (ehObjeto(c.data)) {
    const d = limparValor(c.data) as Objeto;
    if (typeof d.url === 'string') d.url = limparUrl(d.url);
    if (typeof d.from === 'string') d.from = limparUrl(d.from);
    if (typeof d.to === 'string') d.to = limparUrl(d.to);
    c.data = d;
  }
  return c as T;
}
