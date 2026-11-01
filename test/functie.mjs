// Test van de Nhost-functie met een nagebootste Nhost Auth en feed
import fs from 'fs';
const ics = fs.readFileSync(new URL('./voorbeeld.ics', import.meta.url), 'utf8');
process.env.ICS_URL = 'webcal://outlook.example/agenda.ics';
process.env.NHOST_SUBDOMAIN = 'test'; process.env.NHOST_REGION = 'eu-central-1';
process.env.MIJN_EMAIL = 'Jan.Jansen@caci.nl'; process.env.EIGEN_DOMEINEN = 'caci.nl';
const aanroepen = [];
globalThis.fetch = async (url, opt = {}) => {
  aanroepen.push(String(url));
  if (String(url).endsWith('/user')) {
    const ok = opt.headers.Authorization === 'Bearer goed';
    return { ok, json: async () => ({ id: 'u1', email: 'jan@voorbeeld.nl' }) };
  }
  return { ok: true, text: async () => ics };
};
const { default: agenda } = await import('../functions/agenda.js');
const roep = async (query, auth, method = 'GET', origin = 'https://rserne.github.io') => {
  const res = { code: 0, body: null, h: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader(k, v) { this.h[k] = v; } };
  await agenda({ method, query, headers: { origin, ...(auth ? { authorization: 'Bearer ' + auth } : {}) } }, res);
  return res;
};
let r = await roep({ van: '2026-11-02', tot: '2026-11-09' }, null); console.log('zonder login:', r.code);
r = await roep({ van: '2026-11-02', tot: '2026-11-09' }, 'fout'); console.log('foute sleutel:', r.code);
r = await roep({}, 'goed', 'OPTIONS'); console.log('preflight:', r.code, r.h['Access-Control-Allow-Origin']);
r = await roep({ van: 'x', tot: '2026-11-09' }, 'goed'); console.log('foute datum:', r.code);
r = await roep({ van: '2026-11-02', tot: '2026-11-09' }, 'goed'); console.log('goed:', r.code, r.body.events.length, 'afspraken, me =', r.body.me, r.body.ownDomains);
r = await roep({ van: '2026-11-02', tot: '2026-11-09' }, 'goed', 'GET', 'https://kwaad.example'); console.log('andere herkomst CORS:', r.h['Access-Control-Allow-Origin'] || 'geen');
console.log('feed opgehaald:', aanroepen.filter((u) => u.startsWith('https://outlook')).length, 'keer (buffer werkt)', aanroepen.find((u) => u.includes('outlook')));
