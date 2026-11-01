// Nhost-functie /v1/agenda
// Haalt de gepubliceerde agenda (iCal-feed) op en geeft de afspraken in een periode terug als JSON.
// Alleen voor wie is ingelogd bij Nhost: de app stuurt de toegangssleutel mee en we vragen Nhost Auth
// wie dat is. De feed-URL staat als geheim bij Nhost (ICS_URL) en komt nooit in de app of de repository.
//
// Aanroep: GET /v1/agenda?van=2026-10-26&tot=2026-12-31   (tot is exclusief, hoogstens 400 dagen)
// Antwoord: { me, ownDomains, fetchedAt, events: [...] }
import ICAL from 'ical.js';
import { maakOmzetter } from './_ical.js';
import { leerUitIcal, hintVoor } from './_verrijk.js';

const omzetter = maakOmzetter(ICAL);

const BUFFER_MS = 5 * 60 * 1000; // feed maximaal vijf minuten hergebruiken
let buffer = { reeksen: null, kennis: null, tijd: 0 };

// Adressen die de app mogen aanroepen (GitHub Pages en lokaal testen)
const herkomsten = () =>
  (process.env.ALLOWED_ORIGINS || 'https://rserne.github.io,http://localhost:8080,http://127.0.0.1:8080')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && herkomsten().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

// Wie hoort bij deze toegangssleutel? Nhost Auth geeft de gebruiker terug, of een fout als de sleutel
// ongeldig of verlopen is.
function authAdres() {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, '');
  if (process.env.NHOST_AUTH_URL) return process.env.NHOST_AUTH_URL.replace(/\/$/, '');
  const sub = process.env.NHOST_SUBDOMAIN;
  const regio = process.env.NHOST_REGION;
  return sub && regio ? `https://${sub}.auth.${regio}.nhost.run/v1` : null;
}

async function gebruikerVan(req) {
  const kop = req.headers.authorization || '';
  const sleutel = kop.startsWith('Bearer ') ? kop.slice(7) : null;
  const adres = authAdres();
  if (!sleutel || !adres) return null;
  const r = await fetch(`${adres}/user`, { headers: { Authorization: `Bearer ${sleutel}` } });
  if (!r.ok) return null;
  return r.json();
}

async function feed() {
  if (buffer.reeksen && Date.now() - buffer.tijd < BUFFER_MS) return buffer;
  const url = String(process.env.ICS_URL || '').replace(/^webcal:/i, 'https:');
  if (!url) throw new Error('ICS_URL ontbreekt');
  const r = await fetch(url, { headers: { Accept: 'text/calendar' } });
  if (!r.ok) throw new Error(`feed gaf ${r.status}`);
  const tekst = await r.text();
  // Eén keer inlezen en leren, daarna per aanvraag alleen de gevraagde weken uitrollen
  buffer = { reeksen: omzetter.voorbereid(tekst), kennis: leerUitIcal(tekst, eigenDomeinen()), tijd: Date.now() };
  return buffer;
}

const eigenDomeinen = () => (process.env.EIGEN_DOMEINEN || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const datum = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(`${s}T00:00:00Z`) : null);

export default async function agenda(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Alleen GET' });

  try {
    const wie = await gebruikerVan(req);
    if (!wie || !wie.id) return res.status(401).json({ error: 'Niet ingelogd' });
    const toegestaan = (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (toegestaan.length && !toegestaan.includes(String(wie.email || '').toLowerCase())) {
      return res.status(403).json({ error: 'Geen toegang' });
    }

    // Periode, met een dag speling aan beide kanten voor tijdzones
    let van = datum(req.query.van);
    let tot = datum(req.query.tot);
    if (!van || !tot || tot <= van) return res.status(400).json({ error: 'Geef van en tot op als JJJJ-MM-DD' });
    if (tot - van > 400 * 864e5) return res.status(400).json({ error: 'Periode te lang (max. 400 dagen)' });
    van = new Date(van.getTime() - 864e5);
    tot = new Date(tot.getTime() + 864e5);

    const { reeksen, kennis, tijd } = await feed();
    const eigenOrg = process.env.EIGEN_ORGANISATIE || 'CACI';
    // De feed heeft geen organisator en deelnemers; daarom een afgeleide hint (zie _verrijk.js)
    const events = omzetter.uitrollen(reeksen, van, tot).map((e) => (e.organizer || e.attendees.length ? e : { ...e, hint: hintVoor(e, kennis, eigenOrg) }));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      me: (process.env.MIJN_EMAIL || '').toLowerCase() || null,
      ownDomains: eigenDomeinen().length ? eigenDomeinen() : kennis.eigenDomeinen,
      fetchedAt: new Date(tijd).toISOString(),
      events,
    });
  } catch (e) {
    return res.status(502).json({ error: 'Agenda niet op te halen', detail: String(e.message || e) });
  }
}
