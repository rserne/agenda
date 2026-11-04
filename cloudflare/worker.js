// Cloudflare Worker: tussenstap tussen de app en je gepubliceerde Outlook-agenda
// Outlook staat niet toe dat een andere website de agenda rechtstreeks ophaalt (CORS). Deze Worker haalt hem op
// en geeft hem door aan de app, met die toestemming erbij. Hij bewaart niets.
//
// Geheimen (Worker, Settings, Variables and Secrets, type Secret):
//   ICS_URL  de ICS-link van je gepubliceerde agenda (webcal:// of https://)
//   SLEUTEL  een lange willekeurige tekst; zonder die sleutel geeft de Worker niets terug
//
// In de app, bij Agenda-link opgeven: https://<worker>.<account>.workers.dev/?sleutel=<SLEUTEL>
const HERKOMSTEN = ['https://rserne.github.io', 'http://localhost:8080'];

// Twee teksten vergelijken zonder dat de tijd verraadt hoeveel tekens kloppen
function gelijk(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = HERKOMSTEN.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET') return new Response('Alleen GET', { status: 405, headers: cors });
    if (!env.SLEUTEL || !env.ICS_URL) return new Response('De Worker mist ICS_URL of SLEUTEL', { status: 500, headers: cors });
    const sleutel = new URL(request.url).searchParams.get('sleutel');
    if (!gelijk(sleutel, env.SLEUTEL)) return new Response('Geen toegang', { status: 403, headers: cors });
    const r = await fetch(env.ICS_URL.trim().replace(/^webcals?:\/\//i, 'https://'), { headers: { Accept: 'text/calendar' } });
    if (!r.ok) return new Response(`Outlook gaf fout ${r.status}`, { status: 502, headers: cors });
    return new Response(r.body, { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
  },
};
