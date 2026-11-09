// Cloudflare Worker: tussenstap tussen de app en je gepubliceerde Outlook-agenda, en opslag voor je notities
// Outlook staat niet toe dat een andere website de agenda rechtstreeks ophaalt (CORS). Deze Worker haalt hem op
// en geeft hem door aan de app, met die toestemming erbij. De agenda bewaart hij niet.
// Op /notities bewaart hij je notities in een D1-database, zodat iPhone, iPad en Mac dezelfde notities hebben.
// Op /ruimtes bewaart hij in dezelfde database je lijst met vergaderruimtes (naam en e-mailadres).
//
// Geheimen (Worker, Settings, Variables and Secrets, type Secret):
//   ICS_URL  de ICS-link van je gepubliceerde agenda (webcal:// of https://)
//   SLEUTEL  een lange willekeurige tekst; zonder die sleutel geeft de Worker niets terug
// Database (Worker, Settings, Bindings, D1 database): variabele DB. Zonder database werkt de agenda gewoon;
// de notities blijven dan op het toestel.
//
// In de app, bij Agenda-link opgeven: https://<worker>.<account>.workers.dev/?sleutel=<SLEUTEL>
// Notities gebruiken dezelfde link, met /notities erachter; dat regelt de app zelf.
const HERKOMSTEN = ['https://rserne.github.io', 'http://localhost:8080'];
const MAX_NOTITIE = 200 * 1024; // tekens per notitie
const MAX_PER_KEER = 500; // notities per verzending
const PER_PAGINA = 500; // notities per keer ophalen
const MAX_RUIMTES = 300; // ruimtes in de lijst
const MAX_VELD = 200; // tekens per naam of adres

// Twee teksten vergelijken zonder dat de tijd verraadt hoeveel tekens kloppen
function gelijk(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}

// De tabel één keer per database aanmaken. Elke wijziging krijgt een oplopend versienummer; een toestel vraagt
// alleen op wat na zijn laatste versienummer is veranderd.
const tabelKlaar = new WeakSet();
async function zorgVoorTabel(db) {
  if (tabelKlaar.has(db)) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS notities (id TEXT PRIMARY KEY, gewijzigd INTEGER NOT NULL, versie INTEGER NOT NULL, data TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS notities_versie ON notities (versie)'),
    // Lijsten die als geheel worden bewaard, zoals de ruimtes: per sleutel de laatste wijziging
    db.prepare('CREATE TABLE IF NOT EXISTS lijsten (sleutel TEXT PRIMARY KEY, gewijzigd INTEGER NOT NULL, data TEXT NOT NULL)'),
  ]);
  tabelKlaar.add(db);
}

const json = (data, headers, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function notities(request, env, cors, url) {
  if (!env.DB) return new Response('De Worker heeft nog geen database', { status: 501, headers: cors });
  await zorgVoorTabel(env.DB);
  if (request.method === 'GET') {
    // Alles wat na versie 'sinds' is veranderd, ook verwijderde notities (die gaan mee als markering)
    const sinds = Math.max(0, Number(url.searchParams.get('sinds')) || 0);
    const { results } = await env.DB.prepare('SELECT data, versie FROM notities WHERE versie > ?1 ORDER BY versie LIMIT ?2').bind(sinds, PER_PAGINA).all();
    return json({ notities: results.map((r) => JSON.parse(r.data)), versie: results.length ? results[results.length - 1].versie : sinds, meer: results.length === PER_PAGINA }, cors);
  }
  // POST: de app stuurt de notities die op het toestel zijn veranderd. Per notitie wint de laatste wijziging.
  // De app stuurt platte tekst, zodat de browser geen extra vraag vooraf stuurt (CORS).
  let invoer;
  try { invoer = JSON.parse(await request.text()); } catch (e) { return new Response('Geen geldige gegevens', { status: 400, headers: cors }); }
  const lijst = Array.isArray(invoer && invoer.notities) ? invoer.notities : null;
  if (!lijst || lijst.length > MAX_PER_KEER) return new Response('Geen geldige gegevens', { status: 400, headers: cors });
  const goed = lijst.filter((n) => n && typeof n.id === 'string' && n.id.length <= 64 && Number.isFinite(n.gewijzigd));
  const opdrachten = [];
  for (const n of goed) {
    const data = JSON.stringify(n);
    if (data.length > MAX_NOTITIE) continue;
    opdrachten.push(env.DB.prepare(`INSERT INTO notities (id, gewijzigd, versie, data)
      VALUES (?1, ?2, (SELECT COALESCE(MAX(versie), 0) + 1 FROM notities), ?3)
      ON CONFLICT(id) DO UPDATE SET gewijzigd = excluded.gewijzigd, versie = excluded.versie, data = excluded.data
      WHERE excluded.gewijzigd > notities.gewijzigd`).bind(n.id, n.gewijzigd, data));
  }
  if (opdrachten.length) await env.DB.batch(opdrachten);
  return json({ ontvangen: opdrachten.length }, cors);
}

// De ruimtes: één lijst voor al je toestellen. GET geeft de lijst en het tijdstip van de laatste wijziging; POST
// bewaart een lijst, maar alleen als die nieuwer is dan wat er staat. Het antwoord is steeds de lijst die nu geldt.
async function ruimtes(request, env, cors) {
  if (!env.DB) return new Response('De Worker heeft nog geen database', { status: 501, headers: cors });
  await zorgVoorTabel(env.DB);
  const huidig = async () => {
    const r = await env.DB.prepare("SELECT gewijzigd, data FROM lijsten WHERE sleutel = 'ruimtes'").first();
    return r ? { ruimtes: JSON.parse(r.data), gewijzigd: r.gewijzigd } : { ruimtes: null, gewijzigd: 0 };
  };
  if (request.method === 'GET') return json(await huidig(), cors);
  let invoer;
  try { invoer = JSON.parse(await request.text()); } catch (e) { return new Response('Geen geldige gegevens', { status: 400, headers: cors }); }
  const lijst = Array.isArray(invoer && invoer.ruimtes) ? invoer.ruimtes : null;
  const veld = (v) => typeof v === 'string' && v.length <= MAX_VELD;
  if (!lijst || lijst.length > MAX_RUIMTES || !Number.isFinite(invoer.gewijzigd) || !lijst.every((r) => r && veld(r.naam) && veld(r.email))) {
    return new Response('Geen geldige gegevens', { status: 400, headers: cors });
  }
  const data = JSON.stringify(lijst.map((r) => ({ naam: r.naam, email: r.email })));
  await env.DB.prepare(`INSERT INTO lijsten (sleutel, gewijzigd, data) VALUES ('ruimtes', ?1, ?2)
    ON CONFLICT(sleutel) DO UPDATE SET gewijzigd = excluded.gewijzigd, data = excluded.data
    WHERE excluded.gewijzigd > lijsten.gewijzigd`).bind(invoer.gewijzigd, data).run();
  return json(await huidig(), cors);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = HERKOMSTEN.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    const url = new URL(request.url);
    const pad = url.pathname.replace(/\/+$/, '');
    const notitieAdres = pad === '/notities', ruimteAdres = pad === '/ruimtes';
    if (request.method !== 'GET' && !((notitieAdres || ruimteAdres) && request.method === 'POST')) return new Response('Alleen GET', { status: 405, headers: cors });
    if (!env.SLEUTEL) return new Response('De Worker mist SLEUTEL', { status: 500, headers: cors });
    if (!gelijk(url.searchParams.get('sleutel'), env.SLEUTEL)) return new Response('Geen toegang', { status: 403, headers: cors });
    if (notitieAdres) return notities(request, env, cors, url);
    if (ruimteAdres) return ruimtes(request, env, cors);
    if (!env.ICS_URL) return new Response('De Worker mist ICS_URL', { status: 500, headers: cors });
    const r = await fetch(env.ICS_URL.trim().replace(/^webcals?:\/\//i, 'https://'), { headers: { Accept: 'text/calendar' } });
    if (!r.ok) return new Response(`Outlook gaf fout ${r.status}`, { status: 502, headers: cors });
    return new Response(r.body, { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
  },
};
