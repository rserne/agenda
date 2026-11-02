// Agenda, de app
// Leest je agenda via de Nhost-functie /v1/agenda (die de iCal-feed van Outlook ophaalt) en toont
// Week, Vooruitblik en de weekkiezer. Geen bouwstap: dit bestand draait zoals het is op GitHub Pages.
// Hoog APP_VERSIE hier en VERSION in sw.js samen op bij elke uitgave.
'use strict';
const APP_VERSIE = '2026-11-02-4';

/* ------------------------------------------------------------------ */
/*  Instellingen                                                       */
/* ------------------------------------------------------------------ */

// Bron van de afspraken: 'voorbeeld' (verzonnen gegevens, zie voorbeeld.js) of 'nhost' (je echte agenda).
// Met ?echt of ?demo achter het adres kies je de andere bron.
const BRON = 'voorbeeld';
// Nhost-project (Settings, General). Voorlopig het project van de AustralieApp (Frankfurt).
const NHOST_SUB = 'gjqqtpteurwdbealgmqh';
const NHOST_REG = 'eu-central-1';

const OWN_ORG_NAME = 'CACI'; // naam van je eigen organisatie bij de deelnemers
const OWN_DOMAINS_EXTRA = []; // extra eigen maildomeinen, bijvoorbeeld ['caci.nl']
const LOOK_AROUND_WEEKS = 4; // zoveel weken terug en vooruit zoeken naar vaste overleggen zonder reeks
const WORK_START = 8; // werkdag voor bezetting en vrije tijd: 08:00–18:00
const WORK_END = 18;
const FREE_MIN = 30; // vrije blokken vanaf een half uur
const MID_HOURS = 3; // heatmap: geel vanaf zoveel uur afspraken
const FULL_HOURS = 6; // heatmap: rood vanaf zoveel uur afspraken
const RING_HOURS = 8; // zoveel uur is een volle ring
const PEOPLE_LIMIT = 6; // zoveel deelnemers eerst, daarna 'Alle … tonen'
const MAX_ORGS = 2; // organisaties per afspraak in Week
const OUTLOOK_URL = 'https://outlook.office.com/calendar/';
const VERS_MS = 5 * 60 * 1000; // gegevens ouder dan vijf minuten opnieuw ophalen

const NH_AUTH = `https://${NHOST_SUB}.auth.${NHOST_REG}.nhost.run/v1`;
const API = `https://${NHOST_SUB}.functions.${NHOST_REG}.nhost.run/v1/agenda`;
const PARAMS = new URLSearchParams(location.search);
// Formaat: telefoon (smal), tablet (vanaf 768) en desktop (vanaf 1200, met zijbalk en dagkolommen)
const DESKTOP = window.matchMedia('(min-width: 1200px)');
const isDesktop = () => DESKTOP.matches;
// LOKAAL: geen inloggen; de afspraken komen uit voorbeeld.js of uit een .ics-bestand op dit toestel
const DEMO = !NHOST_SUB || (BRON === 'voorbeeld' ? !PARAMS.has('echt') : PARAMS.has('demo'));
let BESTAND = null; // { naam, datum, reeksen, kennis, omzetter, hintVoor } als je zelf een .ics hebt geopend
const lokaal = () => DEMO || !!BESTAND;

/* ------------------------------------------------------------------ */
/*  Hulpjes                                                            */
/* ------------------------------------------------------------------ */

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* vol of geblokkeerd */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* niets */ } },
};

const DAYS_LONG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const DAYS_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => { const x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 864e5 + 1) / 7);
}

// "2–8 november", "27 oktober – 2 november"
function rangeLong(a, b) {
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS_LONG[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS_LONG[a.getMonth()]} – ${b.getDate()} ${MONTHS_LONG[b.getMonth()]}`;
}

// Testen op een andere dag: ?datum=2026-11-02
function nu() {
  const p = PARAMS.get('datum');
  if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) {
    const d = parseYmd(p);
    const n = new Date();
    d.setHours(n.getHours(), n.getMinutes(), 0, 0);
    return d;
  }
  return new Date();
}
const vandaag = () => startOfDay(nu());

// Op zaterdag en zondag is de werkweek voorbij: dan opent Week op de komende week
const defaultWeekAnchor = (t) => (t.getDay() === 0 || t.getDay() === 6 ? addDays(startOfWeek(t), 7) : t);

// '30 min', '1 uur', '1½ uur', '1 uur 10 min'
function freeText(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  const frac = { 0: '', 15: '¼', 30: '½', 45: '¾' }[rest];
  return frac !== undefined ? `${h}${frac} uur` : `${h} uur ${rest} min`;
}
function durationText(start, end) {
  const m = Math.round((end - start) / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!r) return `${h} uur`;
  if (r === 30) return `${h},5 uur`;
  return `${h} uur ${r} min`;
}
const vastText = (n) => (n === 1 ? '1 vast overleg' : `${n} vaste overleggen`);

/* ------------------------------------------------------------------ */
/*  Iconen (in de stijl van SF Symbols)                                */
/* ------------------------------------------------------------------ */

const lijn = (d, w = 2.2) => `<svg class="icoon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const vol = (d) => `<svg class="icoon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;
const I = {
  inladen: lijn('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/>', 2),
  wissen: lijn('<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7"/>', 2),
  min: lijn('<path d="M5 12h14"/>', 2.4),
  plus: lijn('<path d="M12 5v14M5 12h14"/>', 2.4),
  terug: lijn('<path d="M15 18l-6-6 6-6"/>', 2.6),
  verder: lijn('<path d="M9 18l6-6-6-6"/>', 2.6),
  kalender: lijn('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" stroke-width="2.6"/>', 1.8),
  speld: vol('<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"/>'),
  herhaal: lijn('<path d="M17 2.5l3.5 3.5L17 9.5"/><path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5"/><path d="M7 21.5L3.5 18 7 14.5"/><path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5"/>', 2),
  video: vol('<rect x="2" y="6" width="14" height="12" rx="3"/><path d="M17.5 10.2l4.5-2.7v9l-4.5-2.7z"/>'),
  kruis: lijn('<path d="M18 6L6 18M6 6l12 12"/>', 2.4),
  mail: lijn('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>', 1.9),
  mailVol: vol('<path d="M5 5h14a3 3 0 0 1 3 3v.4l-10 6.3L2 8.4V8a3 3 0 0 1 3-3z"/><path d="M2 10.7l9.5 6a1 1 0 0 0 1 0l9.5-6V16a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z"/>'),
  persoon: vol('<circle cx="12" cy="8" r="4.2"/><path d="M3.5 20.5c.8-4.2 4.3-6.8 8.5-6.8s7.7 2.6 8.5 6.8z"/>'),
  week: lijn('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17M9.2 9v10.5M14.8 9v10.5"/>', 1.8),
  vooruit: lijn('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17M7.5 13h9M7.5 16.5h6"/>', 1.8),
  extern: lijn('<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>', 2),
};

/* ------------------------------------------------------------------ */
/*  Inloggen bij Nhost                                                 */
/* ------------------------------------------------------------------ */

const SES = { access: null, exp: 0, refresh: null, user: null };
function zetSessie(s) {
  if (!s) {
    Object.assign(SES, { access: null, exp: 0, refresh: null, user: null });
    LS.del('ag_sessie');
    return;
  }
  SES.access = s.accessToken;
  SES.exp = Date.now() + (s.accessTokenExpiresIn || 900) * 1000;
  SES.refresh = s.refreshToken;
  SES.user = s.user ? { id: s.user.id, email: s.user.email, displayName: s.user.displayName } : SES.user;
  LS.set('ag_sessie', { refreshToken: SES.refresh, user: SES.user });
}
(function laadSessie() {
  const s = LS.get('ag_sessie');
  if (s && s.refreshToken) { SES.refresh = s.refreshToken; SES.user = s.user || null; }
})();

async function inloggen(email, wachtwoord) {
  const r = await fetch(`${NH_AUTH}/signin/email-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: wachtwoord }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.session) throw new Error(r.status === 401 ? 'E-mailadres of wachtwoord klopt niet.' : (data.message || 'Inloggen lukt nu niet.'));
  zetSessie(data.session);
}

// Nhost geeft bij elke vernieuwing een nieuwe refresh token uit; twee tegelijk zou de tweede laten mislukken
let _vernieuwing = null;
function vernieuw() {
  if (!_vernieuwing) {
    _vernieuwing = (async () => {
      if (!SES.refresh) return false;
      const r = await fetch(`${NH_AUTH}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: SES.refresh }),
      });
      if (r.status === 401 || r.status === 400) { zetSessie(null); return false; }
      if (!r.ok) throw new Error('Geen verbinding met Nhost');
      const s = await r.json();
      zetSessie(s.session || s);
      return true;
    })().finally(() => { _vernieuwing = null; });
  }
  return _vernieuwing;
}
async function toegangssleutel() {
  if (SES.access && Date.now() < SES.exp - 60000) return SES.access;
  const ok = await vernieuw();
  return ok ? SES.access : null;
}
async function uitloggen() {
  try {
    await fetch(`${NH_AUTH}/signout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: SES.refresh }) });
  } catch (e) { /* offline: lokaal toch uitloggen */ }
  zetSessie(null);
  LS.del('ag_data');
  location.reload();
}

/* ------------------------------------------------------------------ */
/*  Gegevens: ophalen, bewaren en bijhouden welke weken er zijn        */
/* ------------------------------------------------------------------ */

const DATA = { ruw: new Map(), weken: new Set(), me: null, ownDomains: [], opgehaald: 0 };
const BEWAAR_WEKEN = 26;

function bewaar() {
  const t = startOfWeek(vandaag()).getTime();
  const grens = BEWAAR_WEKEN * 7 * 864e5;
  const events = [...DATA.ruw.values()].filter((e) => Math.abs(new Date(e.start).getTime() - t) < grens);
  LS.set('ag_data', { v: 1, events, weken: [...DATA.weken].filter((w) => Math.abs(w - t) < grens), me: DATA.me, ownDomains: DATA.ownDomains, opgehaald: DATA.opgehaald });
}
(function laadBewaard() {
  if (DEMO) return;
  const b = LS.get('ag_data');
  if (!b || b.v !== 1) return;
  b.events.forEach((e) => DATA.ruw.set(e.id, e));
  b.weken.forEach((w) => DATA.weken.add(w));
  DATA.me = b.me; DATA.ownDomains = b.ownDomains || []; DATA.opgehaald = b.opgehaald || 0;
})();

// Voorbeeldgegevens: per ontbrekende week maken (voorbeeld.js)
function laadVoorbeeld(van, tot) {
  DATA.me = VOORBEELD_IK;
  DATA.ownDomains = VOORBEELD_DOMEINEN;
  DATA.opgehaald = Date.now();
  for (let w = startOfWeek(van); w < tot; w = addDays(w, 7)) {
    if (DATA.weken.has(w.getTime())) continue;
    voorbeeldAfspraken(w, addDays(w, 7)).forEach((e) => DATA.ruw.set(e.id, e));
    DATA.weken.add(w.getTime());
  }
}

/* ------------------------------------------------------------------ */
/*  Eigen .ics-bestand (blijft op dit toestel, in IndexedDB)           */
/* ------------------------------------------------------------------ */

const IDB = {
  open() {
    return new Promise((ok, fout) => {
      const r = indexedDB.open('agenda', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('bestand');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fout(r.error);
    });
  },
  async get(k) {
    const db = await IDB.open();
    return new Promise((ok, fout) => { const r = db.transaction('bestand').objectStore('bestand').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => fout(r.error); });
  },
  async set(k, v) {
    const db = await IDB.open();
    return new Promise((ok, fout) => { const t = db.transaction('bestand', 'readwrite'); t.objectStore('bestand').put(v, k); t.oncomplete = () => ok(); t.onerror = () => fout(t.error); });
  },
  async del(k) {
    const db = await IDB.open();
    return new Promise((ok) => { const t = db.transaction('bestand', 'readwrite'); t.objectStore('bestand').delete(k); t.oncomplete = () => ok(); t.onerror = () => ok(); });
  },
};

// ical.js en de omzetcode pas laden als je een bestand opent
let _icalKlaar = null;
function laadIcalCode() {
  if (!_icalKlaar) {
    _icalKlaar = (async () => {
      if (!window.ICAL) {
        await new Promise((ok, fout) => { const s = document.createElement('script'); s.src = 'vendor/ical.min.js'; s.onload = ok; s.onerror = () => fout(new Error('ical.js niet geladen')); document.head.appendChild(s); });
      }
      const [{ maakOmzetter }, { leerUitIcal, hintVoor }] = await Promise.all([import('./functions/_ical.js'), import('./functions/_verrijk.js')]);
      return { omzetter: maakOmzetter(window.ICAL), leerUitIcal, hintVoor };
    })();
  }
  return _icalKlaar;
}

// Het bestand inlezen kost op een telefoon enkele seconden (1 à 2 MB tekst met herhaalreeksen). Daarom bewaren we
// de uitgerolde weken in IndexedDB ('icsweken'). Bij het opstarten staan die meteen in beeld; het bestand zelf
// lezen we pas daarna op de achtergrond in, voor weken die nog niet bewaard zijn.
async function leesBestand(b) {
  const code = await laadIcalCode();
  return { hintVoor: code.hintVoor, omzetter: code.omzetter, reeksen: code.omzetter.voorbereid(b.tekst), kennis: code.leerUitIcal(b.tekst, OWN_DOMAINS_EXTRA) };
}
async function gebruikBestand(b) {
  BESTAND = { naam: b.naam, datum: b.datum, ...(await leesBestand(b)) };
  BESTAND.klaar = Promise.resolve();
  DATA.ruw.clear(); DATA.weken.clear();
  DATA.me = null; DATA.ownDomains = BESTAND.kennis.eigenDomeinen; DATA.opgehaald = Date.now();
}
// Snelle start: weken uit de bewaarde kopie, het bestand later
function startUitBewaard(b, kopie) {
  BESTAND = { naam: b.naam, datum: b.datum };
  kopie.events.forEach((e) => DATA.ruw.set(e.id, e));
  kopie.weken.forEach((w) => DATA.weken.add(w));
  DATA.me = null; DATA.ownDomains = kopie.eigenDomeinen || []; DATA.opgehaald = Date.now();
  const doel = BESTAND;
  BESTAND.klaar = new Promise((ok) => setTimeout(ok, 1500)) // eerst tekenen, dan pas het zware werk
    .then(() => leesBestand(b))
    .then((r) => { if (BESTAND === doel) Object.assign(BESTAND, r); })
    .catch(() => {});
}
let _bewaarTimer = null;
function bewaarWeken() {
  clearTimeout(_bewaarTimer);
  _bewaarTimer = setTimeout(() => {
    if (!BESTAND) return;
    const t = startOfWeek(vandaag()).getTime();
    const grens = BEWAAR_WEKEN * 7 * 864e5;
    const weken = [...DATA.weken].filter((w) => Math.abs(w - t) < grens);
    const events = [...DATA.ruw.values()].filter((e) => Math.abs(new Date(e.start).getTime() - t) < grens);
    IDB.set('icsweken', { datum: BESTAND.datum, weken, events, eigenDomeinen: DATA.ownDomains }).catch(() => {});
  }, 800);
}
async function laadUitBestand(van, tot) {
  const nodig = [];
  for (let w = startOfWeek(van); w < tot; w = addDays(w, 7)) if (!DATA.weken.has(w.getTime())) nodig.push(w);
  if (!nodig.length) return;
  await BESTAND.klaar;
  if (!BESTAND.reeksen) return; // inlezen mislukt: houden wat er is
  nodig.forEach((w) => {
    if (DATA.weken.has(w.getTime())) return;
    BESTAND.omzetter.uitrollen(BESTAND.reeksen, w, addDays(w, 7)).forEach((e) => {
      const hint = e.organizer || e.attendees.length ? null : BESTAND.hintVoor(e, BESTAND.kennis, OWN_ORG_NAME);
      DATA.ruw.set(e.id, hint ? { ...e, hint } : e);
    });
    DATA.weken.add(w.getTime());
  });
  bewaarWeken();
}
async function openBestand(file) {
  if (!file) return;
  const tekst = await file.text();
  if (!/BEGIN:VCALENDAR/.test(tekst)) { alert('Dit is geen agenda-bestand (.ics).'); return; }
  const b = { naam: file.name, datum: Date.now(), tekst };
  try { await IDB.set('ics', b); } catch (e) { /* privévenster: dan alleen voor deze sessie */ }
  await gebruikBestand(b);
  laad();
}
async function vergeetBestand() {
  await IDB.del('ics').catch(() => {});
  await IDB.del('icsweken').catch(() => {});
  BESTAND = null;
  DATA.ruw.clear(); DATA.weken.clear();
  laad();
}
class NietIngelogd extends Error {}

async function haalOp(van, tot) {
  const sleutel = await toegangssleutel();
  if (!sleutel) throw new NietIngelogd();
  const url = `${API}?van=${ymd(van)}&tot=${ymd(tot)}`;
  let r = await fetch(url, { headers: { Authorization: `Bearer ${sleutel}` } });
  if (r.status === 401) {
    if (!(await vernieuw())) throw new NietIngelogd();
    r = await fetch(url, { headers: { Authorization: `Bearer ${SES.access}` } });
  }
  if (r.status === 401 || r.status === 403) throw new NietIngelogd();
  if (!r.ok) {
    const fout = await r.json().catch(() => ({}));
    throw new Error(fout.error || `De agenda gaf fout ${r.status}`);
  }
  const d = await r.json();
  // Alles wat in deze weken lag vervangen door de nieuwe stand (ook verwijderde afspraken verdwijnen zo)
  const a = van.getTime(), b = tot.getTime();
  for (const [id, e] of DATA.ruw) {
    const s = new Date(e.allDay ? parseYmd(e.start) : e.start).getTime();
    if (s >= a && s < b) DATA.ruw.delete(id);
  }
  d.events.forEach((e) => DATA.ruw.set(e.id, e));
  for (let w = startOfWeek(van); w < tot; w = addDays(w, 7)) DATA.weken.add(w.getTime());
  DATA.me = d.me || DATA.me;
  DATA.ownDomains = d.ownDomains || DATA.ownDomains;
  DATA.opgehaald = Date.now();
  bewaar();
}

// Zorg dat de weken van van t/m tot er zijn. Ontbreekt er iets, dan halen we meteen een flink blok op.
const _bezig = new Map();
async function zorgVoor(van, tot, { vers = false } = {}) {
  if (BESTAND) return laadUitBestand(van, tot);
  if (DEMO) return laadVoorbeeld(van, tot);
  const wekenNodig = [];
  for (let w = startOfWeek(van); w < tot; w = addDays(w, 7)) wekenNodig.push(w.getTime());
  const missen = wekenNodig.filter((w) => !DATA.weken.has(w));
  if (!vers && !missen.length) return;
  const blokVan = new Date(vers ? wekenNodig[0] : missen[0]);
  const laatste = new Date((vers ? wekenNodig : missen)[(vers ? wekenNodig : missen).length - 1]);
  const blokTot = new Date(Math.max(addDays(laatste, 7).getTime(), addDays(blokVan, 7 * 12).getTime()));
  const sleutel = `${blokVan.getTime()}-${blokTot.getTime()}`;
  if (!_bezig.has(sleutel)) _bezig.set(sleutel, haalOp(blokVan, blokTot).finally(() => _bezig.delete(sleutel)));
  return _bezig.get(sleutel);
}

/* ------------------------------------------------------------------ */
/*  Indeling: extern, intern ad hoc, intern vast                       */
/* ------------------------------------------------------------------ */

const domainOf = (email) => (email ? email.split('@')[1] : null);
const isRoom = (p) => p && (p.type === 'room' || p.type === 'resource');
const isOwnDomain = (domain, own) => [...own].some((o) => domain === o || domain.endsWith('.' + o));
function orgLabel(domain) {
  const parts = domain.split('.');
  const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return core.length <= 4 ? core.toUpperCase() : cap(core);
}
const titleKey = (t) => String(t || '').toLowerCase().replace(/^(re|fw|fwd|antw|doorst):\s*/i, '').replace(/\s+/g, ' ').trim();

// Eigen domeinen: uit de instellingen van de functie, je eigen adres en OWN_DOMAINS_EXTRA. Is er niets bekend,
// dan nemen we het domein dat het vaakst onder de deelnemers voorkomt (dat ben jij met je collega's).
let _eigenCache = { n: -1, set: null };
function eigenDomeinen() {
  if (_eigenCache.n === DATA.ruw.size) return _eigenCache.set;
  const own = new Set([...(DATA.ownDomains || []), ...OWN_DOMAINS_EXTRA].map((d) => d.toLowerCase()));
  if (DATA.me) own.add(domainOf(DATA.me));
  if (!own.size) {
    const tel = {};
    DATA.ruw.forEach((e) => (e.attendees || []).forEach((a) => { const d = domainOf(a.email); if (d && !isRoom(a)) tel[d] = (tel[d] || 0) + 1; }));
    const top = Object.keys(tel).sort((a, b) => tel[b] - tel[a])[0];
    if (top) own.add(top);
  }
  _eigenCache = { n: DATA.ruw.size, set: own };
  return own;
}
const isMe = (p) => !!(p && p.email && DATA.me && p.email.toLowerCase() === DATA.me);

function pickOrgs(organizerDomain, attendeeDomains, own) {
  if (!own.size) return [];
  if (organizerDomain && !isOwnDomain(organizerDomain, own)) return [orgLabel(organizerDomain)];
  const counts = {};
  attendeeDomains.forEach((d) => {
    if (!d || isOwnDomain(d, own)) return;
    const label = orgLabel(d);
    counts[label] = (counts[label] || 0) + 1;
  });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
}

const LINK_RE = /https?:\/\/[^\s<>"]*?(teams\.microsoft\.com|teams\.live\.com|zoom\.us|meet\.google\.com|webex\.com)[^\s<>"]*/i;
const ONLINE_WORDS = /(microsoft teams|teams[- ]?(meeting|vergadering)|^teams$|zoom|google meet|webex|^online$|online vergadering)/i;
function findMeetingLink(...texts) {
  for (const t of texts) {
    const m = LINK_RE.exec(String(t || ''));
    if (m) {
      const host = m[1].toLowerCase();
      const provider = host.includes('zoom') ? 'Zoom' : host.includes('google') ? 'Google Meet' : host.includes('webex') ? 'Webex' : 'Microsoft Teams';
      return { url: m[0].replace(/[>)\].,]+$/, ''), provider };
    }
  }
  return null;
}
function physicalPlaces(location, roomNames) {
  const parts = String(location || '').split(/[;\n]/).map((s) => s.trim()).filter((p) => p && !/https?:\/\//i.test(p) && !ONLINE_WORDS.test(p));
  const seen = new Set(parts.map((p) => p.toLowerCase()));
  roomNames.forEach((r) => { if (r && !seen.has(r.toLowerCase())) parts.push(r); });
  return parts;
}
const isAddressLike = (p) => /,/.test(p) || (/\d/.test(p) && /[a-z]{3,}/i.test(p));
const MODE_LABEL = { online: 'Online', physical: 'Op locatie', hybrid: 'Hybride' };

// Van de ruwe gegevens uit de functie naar een afspraak met soort, organisaties en vorm
function verrijk(r, wekenPerTitel) {
  const start = r.allDay ? parseYmd(r.start) : new Date(r.start);
  const end = r.allDay ? parseYmd(r.end) : new Date(r.end);
  const own = eigenDomeinen();
  const attendees = r.attendees || [];
  const org = r.organizer && (r.organizer.email || r.organizer.name) ? r.organizer : null;
  const organizerDomain = org && !isMe(org) ? domainOf(org.email) : null;
  const attendeeDomains = attendees.filter((a) => !isMe(a) && !isRoom(a)).map((a) => domainOf(a.email));
  let orgs = pickOrgs(organizerDomain, attendeeDomains, own);
  // Gepubliceerde agenda zonder organisator en deelnemers: de afgeleide organisatie (zie functions/_verrijk.js)
  const afgeleid = !org && !attendees.length && r.hint && r.hint.orgs ? r.hint : null;
  if (afgeleid) orgs = afgeleid.orgs;
  const weken = wekenPerTitel[titleKey(r.title)];
  const regular = !!(r.recurring || r.detached || (weken && weken.size >= 2));
  const external = orgs.length > 0;
  const link = findMeetingLink(r.location, r.url, r.notes);
  const roomNames = attendees.filter(isRoom).map((a) => a.name).filter(Boolean);
  const places = physicalPlaces(r.location, roomNames);
  const physical = places.length > 0 || /fysiek|op locatie/i.test(r.title || '');
  const mode = physical && link ? 'hybrid' : physical ? 'physical' : link ? 'online' : 'none';
  return {
    ...r, start, end, organizer: org, attendees, orgs, external, regular, afgeleid,
    notable: external || !regular,
    kind: external ? 'ext' : regular ? 'reg' : 'int',
    link, places, roomNames, mode,
  };
}

function wekenPerTitel(lijst) {
  const map = {};
  lijst.forEach((r) => {
    if (r.allDay) return;
    const k = titleKey(r.title);
    if (!k) return;
    (map[k] = map[k] || new Set()).add(startOfWeek(new Date(r.start)).getTime());
  });
  return map;
}

// Afspraken in een periode, verrijkt. Voor 'vast' kijken we ook een paar weken eromheen.
function afsprakenTussen(van, tot) {
  const rondVan = addDays(van, -7 * LOOK_AROUND_WEEKS).getTime();
  const rondTot = addDays(tot, 7 * LOOK_AROUND_WEEKS).getTime();
  const rond = [];
  const binnen = [];
  DATA.ruw.forEach((r) => {
    if (r.canceled) return;
    const s = (r.allDay ? parseYmd(r.start) : new Date(r.start)).getTime();
    const e = (r.allDay ? parseYmd(r.end) : new Date(r.end)).getTime();
    if (s < rondTot && e > rondVan) rond.push(r);
    if (s < tot.getTime() && (e > van.getTime() || s >= van.getTime())) binnen.push(r);
  });
  const wpt = wekenPerTitel(rond);
  const gezien = new Set();
  return binnen
    .filter((r) => { const k = `${titleKey(r.title)}|${r.start}|${r.end}`; if (gezien.has(k)) return false; gezien.add(k); return true; })
    .map((r) => verrijk(r, wpt)).sort((a, b) => a.start - b.start || b.end - a.end);
}

function eventsForDay(events, day) {
  const a = startOfDay(day), b = addDays(a, 1);
  return events.filter((e) => e.start < b && (e.end > a || e.start >= a));
}

// Vrije blokken op een werkdag, vanaf FREE_MIN minuten. Voor vandaag alleen wat nog komt.
function freeSlots(list, day) {
  const ws = new Date(day); ws.setHours(WORK_START, 0, 0, 0);
  const we = new Date(day); we.setHours(WORK_END, 0, 0, 0);
  let from = ws.getTime();
  const n = nu();
  if (sameDay(day, n)) from = Math.max(from, Math.ceil(n.getTime() / 9e5) * 9e5);
  if (from >= we.getTime()) return [];
  const busy = list.filter((e) => !e.allDay && !e.free)
    .map((e) => [Math.max(e.start.getTime(), from), Math.min(e.end.getTime(), we.getTime())])
    .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const slots = [];
  let cursor = from;
  busy.forEach(([a, b]) => { if (a > cursor) slots.push([cursor, a]); cursor = Math.max(cursor, b); });
  if (we.getTime() > cursor) slots.push([cursor, we.getTime()]);
  return slots.map(([a, b]) => ({ start: new Date(a), end: new Date(b), min: Math.round((b - a) / 60000) })).filter((f) => f.min >= FREE_MIN);
}

// Uren met afspraken per dag binnen werktijd; overlap telt één keer
function busyHoursByDay(list) {
  const perDag = {};
  list.forEach((e) => {
    if (e.allDay || e.free) return;
    for (let d = startOfDay(e.start); d < e.end; d = addDays(d, 1)) {
      const ws = new Date(d); ws.setHours(WORK_START, 0, 0, 0);
      const we = new Date(d); we.setHours(WORK_END, 0, 0, 0);
      const a = Math.max(e.start.getTime(), ws.getTime());
      const b = Math.min(e.end.getTime(), we.getTime());
      if (b > a) (perDag[d.getTime()] = perDag[d.getTime()] || []).push([a, b]);
    }
  });
  const uren = {};
  Object.keys(perDag).forEach((k) => {
    const iv = perDag[k].sort((x, y) => x[0] - y[0]);
    let tot = 0;
    let [cs, ce] = iv[0];
    for (let i = 1; i < iv.length; i++) {
      if (iv[i][0] <= ce) ce = Math.max(ce, iv[i][1]);
      else { tot += ce - cs; [cs, ce] = iv[i]; }
    }
    tot += ce - cs;
    uren[k] = tot / 36e5;
  });
  return uren;
}

// Overlap: alleen de afspraak die je als eerste ingaat krijgt een waarschuwing, want daar moet je misschien
// eerder weg. De afspraak die later begint, noemen we niet. Beginnen er meer tegelijk, dan noemt alleen de
// bovenste in de lijst de overlap; in het detailscherm staat hij wel bij elk van die afspraken.
// Hele dagen en afspraken op 'vrij' tellen niet mee; vaste overleggen die bij Opvallend verborgen zijn wel.
function overlapVan(lijst) {
  const t = lijst.filter((e) => !e.allDay && !e.free && e.end > e.start).sort((a, b) => a.start - b.start || b.end - a.end);
  const tekst = new Map(); // afspraak → waarschuwing
  const naam = (x) => x.title || 'een afspraak';
  t.forEach((e, i) => {
    const tegelijk = t.filter((x) => x !== e && x.start.getTime() === e.start.getTime());
    const inLijst = !t.slice(0, i).some((x) => x.start.getTime() === e.start.getTime());
    const later = t.filter((x) => x.start > e.start && x.start < e.end);
    // Eerst wat tegelijk begint, dan wat later begint (met de tijd erbij: dan moet je misschien eerder weg)
    const andere = [...tegelijk, ...later];
    if (!andere.length) return;
    const eerste = andere[0];
    const tijd = eerste.start > e.start ? ` om ${hhmm(eerste.start)}` : '';
    tekst.set(e, { lang: `Overlap met ${naam(eerste)}${tijd}${andere.length > 1 ? ` en nog ${andere.length - 1}` : ''}`, tijd: tijd ? hhmm(eerste.start) : '', andere, start: e.start, inLijst });
  });
  return tekst;
}
const overlapt = (e, ov) => !!(ov && ov.has(e) && ov.get(e).inLijst);
const overlapLabel = (e, ov) => (overlapt(e, ov) ? `<span class="overlaplabel">${esc(ov.get(e).lang)}</span>` : '');

/* ------------------------------------------------------------------ */
/*  Toestand                                                           */
/* ------------------------------------------------------------------ */

const ST = {
  tab: 'week', // week | forecast
  filter: 'notable', // notable | all | free
  anker: defaultWeekAnchor(vandaag()),
  fcStart: vandaag(),
  dag: vandaag(),
  laden: false,
  fout: null,
  login: false,
};
const zichtbaar = new Map(); // id → verrijkte afspraak, voor het detailscherm

const periode = () => {
  const start = ST.tab === 'week' ? startOfWeek(ST.anker) : ST.fcStart;
  return { start, eind: addDays(start, 7) };
};

/* ------------------------------------------------------------------ */
/*  Weergave: Week                                                     */
/* ------------------------------------------------------------------ */

function badgesHtml(e, max = MAX_ORGS) {
  if (!e.external) return '';
  const shown = e.orgs.slice(0, max);
  const rest = e.orgs.length - shown.length;
  return `<div class="badges">${e.regular ? `<span class="herhaal" title="Terugkerend">${I.herhaal}</span>` : ''}${shown.map((o) => `<span class="badge">${esc(o)}</span>`).join('')}${rest > 0 ? `<span class="meer">+${rest}</span>` : ''}</div>`;
}

function weekRij(e, ov) {
  const onSite = e.mode === 'physical' || e.mode === 'hybrid';
  return `<button class="rij${e.notable ? '' : ' vast'}${overlapt(e, ov) ? ' overlapt' : ''}" data-id="${esc(e.id)}">
    <span class="stip ${e.kind}"></span>
    <span class="tijdkolom"><div class="tijd">${hhmm(e.start)}</div><div class="eind">${hhmm(e.end)}</div></span>
    <span class="rijtekst">
      <span class="titelregel"><span class="rijtitel">${esc(e.title || '(geen titel)')}</span>${onSite ? `<span class="speld" aria-label="op locatie">${I.speld}</span>` : ''}</span>
      ${overlapLabel(e, ov)}${badgesHtml(e)}
    </span>
  </button>`;
}

function vrijRij(f) {
  return `<button class="rij vrij" style="--uren:${(f.min / 60).toFixed(2)}" data-vrij="${f.start.getTime()}-${f.end.getTime()}" aria-label="Vrij van ${hhmm(f.start)} tot ${hhmm(f.end)}, ${freeText(f.min)}. Afspraak toevoegen">
    <span class="stip"></span>
    <span class="tijdkolom"><div class="tijd">${hhmm(f.start)}</div><div class="eind">${hhmm(f.end)}</div></span>
    <span class="rijtekst"><span class="rijtitel"><b>Vrij</b><span> · ${freeText(f.min)}</span></span></span>
    <span class="plus" aria-hidden="true">${I.plus}</span>
  </button>`;
}

// Desktop: de werkdagen naast elkaar in kolommen, weekenddagen alleen als er iets staat
function kolomRij(e, ov) {
  const onSite = e.mode === 'physical' || e.mode === 'hybrid';
  return `<button class="krij${e.notable ? '' : ' vast'}${overlapt(e, ov) ? ' overlapt' : ''}" data-id="${esc(e.id)}">
    <span class="stip ${e.kind}"></span>
    <span class="rijtekst">
      <span class="ktijd num">${hhmm(e.start)} – ${hhmm(e.end)}${onSite ? `<span class="speld" aria-label="op locatie">${I.speld}</span>` : ''}</span>
      <span class="rijtitel">${esc(e.title || '(geen titel)')}</span>
      ${overlapLabel(e, ov)}${badgesHtml(e)}
    </span>
  </button>`;
}
function kolomVrij(f) {
  return `<button class="krij vrij" style="--uren:${(f.min / 60).toFixed(2)}" data-vrij="${f.start.getTime()}-${f.end.getTime()}" aria-label="Vrij van ${hhmm(f.start)} tot ${hhmm(f.end)}, ${freeText(f.min)}. Afspraak toevoegen">
    <span class="stip"></span>
    <span class="rijtekst"><span class="ktijd num">${hhmm(f.start)} – ${hhmm(f.end)}</span><span class="rijtitel"><b>Vrij</b><span> · ${freeText(f.min)}</span></span></span>
    <span class="plus" aria-hidden="true">${I.plus}</span>
  </button>`;
}
function weekKolommenHtml(events) {
  const { start } = periode();
  const t = vandaag();
  const kolommen = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const lijst = eventsForDay(events, d);
    const heleDag = lijst.filter((e) => e.allDay);
    const getimed = lijst.filter((e) => !e.allDay);
    const getoond = ST.filter === 'notable' ? getimed.filter((e) => e.notable) : getimed;
    const verborgen = getimed.length - getoond.length;
    const vrij = ST.filter === 'free' && i < 5 && d >= t ? freeSlots(lijst, d) : [];
    const items = [...getoond.map((e) => ({ t: e.start.getTime(), e })), ...vrij.map((f) => ({ t: f.start.getTime(), f }))].sort((a, b) => a.t - b.t);
    // Hele dagen als smalle balk bovenaan de kolom, zoals in Agenda op de Mac
    let rijen = heleDag.map((e) => `<button class="heledagbalk" data-id="${esc(e.id)}"><span>${esc(e.title)}</span></button>`).join('');
    const ov = overlapVan(lijst);
    rijen += items.map((it) => (it.e ? kolomRij(it.e, ov) : kolomVrij(it.f))).join('');
    if (verborgen > 0) rijen += `<div class="krij rest"><span class="stip"></span><span>${vastText(verborgen)}</span></div>`;
    if (!rijen) rijen = '<div class="krij rest leeg">Geen afspraken</div>';
    const isVandaag = sameDay(d, t);
    kolommen.push(`<section class="dagkolom${isVandaag ? ' vandaag' : ''}${d < t ? ' voorbij' : ''}${i >= 5 ? ' weekend' : ''}">
      <h2 class="kolomkop" aria-label="${isVandaag ? 'Vandaag, ' : ''}${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}"><span class="nr num">${d.getDate()}</span><span class="dow">${cap(DAYS_LONG[d.getDay()])}</span>${d.getDate() === 1 && i > 0 ? `<span class="mnd">${MONTHS_SHORT[d.getMonth()]}</span>` : ''}</h2>
      <div class="kaart">${rijen}</div>
    </section>`);
  }
  return `<div class="weekraster">${kolommen.join('')}</div>${legendaWeek()}`;
}

function weekHtml(events) {
  if (isDesktop()) return weekKolommenHtml(events);
  const { start } = periode();
  const t = vandaag();
  let html = '';
  let eerste = true;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const lijst = eventsForDay(events, d);
    if (i >= 5 && !lijst.length) continue; // lege weekenddagen weglaten
    const heleDag = lijst.filter((e) => e.allDay);
    const getimed = lijst.filter((e) => !e.allDay);
    const getoond = ST.filter === 'notable' ? getimed.filter((e) => e.notable) : getimed;
    const verborgen = getimed.length - getoond.length;
    const vrij = ST.filter === 'free' && i < 5 && d >= t ? freeSlots(lijst, d) : [];
    const items = [...getoond.map((e) => ({ t: e.start.getTime(), e })), ...vrij.map((f) => ({ t: f.start.getTime(), f }))].sort((a, b) => a.t - b.t);
    let rijen = heleDag.map((e) => `<button class="rij heledag" data-id="${esc(e.id)}"><span class="rijtitel">${esc(e.title)}</span><span class="hint">hele dag</span></button>`).join('');
    const ov = overlapVan(lijst);
    rijen += items.map((it) => (it.e ? weekRij(it.e, ov) : vrijRij(it.f))).join('');
    if (verborgen > 0) rijen += `<div class="rij rest"><span class="stip"></span><span>${vastText(verborgen)}</span></div>`;
    if (!rijen) rijen = '<div class="rij rest"><span>Geen afspraken</span></div>';
    // Zoals op de desktop: eerst het dagnummer, dan de dag; vandaag in de accentkleur, voorbije dagen grijs
    const isVandaag = sameDay(d, t);
    const kop = `<span class="nr num">${d.getDate()}</span><span class="dow">${cap(DAYS_LONG[d.getDay()])}</span>${d.getDate() === 1 && !eerste ? `<span class="mnd">${MONTHS_LONG[d.getMonth()]}</span>` : ''}`;
    html += `<h2 class="dagkop${eerste ? ' eerste' : ''}${isVandaag ? ' vandaag' : ''}${d < t ? ' voorbij' : ''}" aria-label="${isVandaag ? 'Vandaag, ' : ''}${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}">${kop}</h2><div class="kaart">${rijen}</div>`;
    eerste = false;
  }
  return html + legendaWeek();
}
// Legenda onderaan bij de afspraken zelf: streepjes in de week, de tegelkleuren in de Vooruitblik
const legendaWeek = () => `<div class="legenda">
    <span><i class="stip ext" style="margin:0"></i>Extern</span>
    <span><i class="stip int" style="margin:0"></i>Intern, ad hoc</span>
    <span><i class="stip" style="margin:0"></i>Intern, vast</span>
  </div>`;
const legendaVooruitblik = () => `<div class="legenda">
    <span><i class="vlak" style="background:var(--externTile)"></i>Extern</span>
    <span><i class="vlak" style="background:var(--internTile)"></i>Intern, ad hoc</span>
    <span><i class="vlak" style="background:var(--regularTile)"></i>Intern, vast</span>
  </div>`;

/* ------------------------------------------------------------------ */
/*  Weergave: Vooruitblik                                              */
/* ------------------------------------------------------------------ */

function tegel(e, dag, ov) {
  const onSite = e.mode === 'physical' || e.mode === 'hybrid';
  const vervolg = e.start < startOfDay(dag);
  const o = overlapt(e, ov) ? ov.get(e) : null;
  return `<button class="tegel ${e.kind}${o ? ' overlapt' : ''}" data-id="${esc(e.id)}"${o ? ` title="${esc(o.lang)}"` : ''}>
    <span class="tegelkop"><span class="tt">${vervolg ? 'vervolg' : hhmm(e.start)}</span><span class="iconen">${onSite ? I.speld : ''}${e.external && e.regular ? I.herhaal : ''}</span></span>
    <span class="tit">${esc(e.title || '(geen titel)')}</span>
    ${e.external ? `<span class="orgregel"><span class="b">${esc(e.orgs[0])}</span>${e.orgs.length > 1 ? `<span class="m">+${e.orgs.length - 1}</span>` : ''}</span>` : ''}
    <span class="tegelvoet">${o ? `<span class="ovbadge">Overlap${o.tijd ? `<span class="ovtijd"> ${o.tijd}</span>` : ''}</span>` : ''}<span class="tt te">${hhmm(e.end)}</span></span>
  </button>`;
}
function vrijeTegel(f) {
  return `<button class="tegel vrij" data-vrij="${f.start.getTime()}-${f.end.getTime()}" aria-label="Vrij van ${hhmm(f.start)} tot ${hhmm(f.end)}, ${freeText(f.min)}. Afspraak toevoegen">
    <span class="tegelkop"><span class="tt">${hhmm(f.start)}</span><span class="plus" aria-hidden="true">${I.plus}</span></span><span class="tit">Vrij</span><span class="duur">${freeText(f.min)}</span><span class="tt te">${hhmm(f.end)}</span>
  </button>`;
}

function vooruitblikHtml(events) {
  const { start } = periode();
  const t = vandaag();
  let html = '<div class="vb">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const lijst = eventsForDay(events, d);
    const heleDag = lijst.filter((e) => e.allDay);
    const getimed = lijst.filter((e) => !e.allDay);
    const tegels = ST.filter === 'notable' ? getimed.filter((e) => e.notable) : getimed;
    const verborgen = getimed.length - tegels.length;
    const werkdag = d.getDay() >= 1 && d.getDay() <= 5;
    const vrij = ST.filter === 'free' && werkdag && d >= t ? freeSlots(lijst, d) : [];
    const items = [...tegels.map((e) => ({ t: e.start.getTime(), e })), ...vrij.map((f) => ({ t: f.start.getTime(), f }))].sort((a, b) => a.t - b.t);
    const isVandaag = sameDay(d, t);
    const ov = overlapVan(lijst);
    html += `<section class="vbdag">
      <div class="vbdatum${isVandaag ? ' vandaag' : ''}"><span class="dow">${DAYS_SHORT[d.getDay()].toUpperCase()}</span><span class="nr">${d.getDate()}</span>${i === 0 || d.getDate() === 1 ? `<span class="mnd">${MONTHS_SHORT[d.getMonth()]}</span>` : ''}</div>
      <div class="vbinhoud">
        ${!lijst.length && !vrij.length ? `<div class="vbleeg">${isVandaag ? 'Geen afspraken vandaag' : 'Geen afspraken'}</div>` : ''}
        ${heleDag.map((e) => `<button class="vbheledag" data-id="${esc(e.id)}"><span class="t">${esc(e.title)}</span><span class="h">hele dag</span></button>`).join('')}
        ${items.length ? `<div class="tegels">${items.map((it) => (it.e ? tegel(it.e, d, ov) : vrijeTegel(it.f))).join('')}</div>` : ''}
        ${verborgen > 0 ? `<div class="vbrest">+ ${vastText(verborgen)}</div>` : ''}
      </div>
    </section>`;
  }
  return html + '</div>' + legendaVooruitblik();
}

/* ------------------------------------------------------------------ */
/*  Kop, schakelaar en tabbalk                                         */
/* ------------------------------------------------------------------ */

function capsuleHtml(vorigeLabel, volgendeLabel) {
  return `<button data-nav="-1" aria-label="${vorigeLabel}">${I.terug}</button><button data-nav="0" aria-label="Naar vandaag">${I.kalender}<span class="vandaagtekst">Vandaag</span></button><button data-nav="1" aria-label="${volgendeLabel}">${I.verder}</button>`;
}

function renderKop() {
  const { start } = periode();
  $('#titel').textContent = ST.tab === 'week' ? `Week ${isoWeek(start)}` : 'Vooruitblik';
  $('#datumregel').textContent = rangeLong(start, addDays(start, 6));
  document.body.classList.toggle('vooruitblik', ST.tab === 'forecast');
  document.querySelectorAll('#schakelaar button').forEach((b) => {
    const aan = b.dataset.filter === ST.filter;
    b.classList.toggle('aan', aan);
    b.setAttribute('aria-selected', aan);
  });
  document.querySelectorAll('#tabbalk button').forEach((b) => {
    const aan = b.dataset.tab === ST.tab;
    b.classList.toggle('aan', aan);
    b.setAttribute('aria-selected', aan);
  });
}

function render() {
  document.body.classList.toggle('desktop', isDesktop());
  renderKop();
  renderZijbalk();
  const main = $('#inhoud');
  if (ST.login) { main.innerHTML = loginHtml(); koppelLogin(); return; }
  const { start, eind } = periode();
  const events = afsprakenTussen(start, eind);
  zichtbaar.clear();
  events.forEach((e) => zichtbaar.set(e.id, e));
  // Eigen bestand nog op de achtergrond aan het inlezen en deze week nog niet bewaard: ook 'laden' tonen
  const geenData = (!lokaal() || (BESTAND && !BESTAND.reeksen)) && !DATA.weken.has(startOfWeek(start).getTime());
  if (geenData && ST.laden) { main.innerHTML = '<div class="laden">Agenda laden…</div>'; return; }
  if (geenData && ST.fout) { main.innerHTML = meldingHtml('Agenda niet beschikbaar', ST.fout, 'Opnieuw proberen'); $('#inhoud .knop').onclick = () => laad({ vers: true }); return; }
  // De agenda kies je in de weekkiezer (tik op de titel) of op de desktop in de zijbalk
  main.innerHTML = ST.tab === 'week' ? weekHtml(events) : vooruitblikHtml(events);
}

function meldingHtml(titel, tekst, knop) {
  return `<div class="melding"><div class="doos"><h2>${esc(titel)}</h2><p>${esc(tekst)}</p>${knop ? `<button class="knop" style="padding:0 20px">${esc(knop)}</button>` : ''}</div></div>`;
}
function loginHtml() {
  return `<div class="melding"><div class="doos">
    <h2>Inloggen</h2>
    <p>Log in met hetzelfde account als in de AustralieApp.</p>
    <form id="loginform" autocomplete="on">
      <input type="email" name="email" placeholder="E-mailadres" autocomplete="username" required value="${esc((SES.user && SES.user.email) || '')}">
      <input type="password" name="wachtwoord" placeholder="Wachtwoord" autocomplete="current-password" required>
      <div class="fout" id="loginfout" hidden></div>
      <button class="knop" type="submit">Inloggen</button>
    </form>
  </div></div>`;
}
function koppelLogin() {
  $('#loginform').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const knop = f.querySelector('button');
    knop.disabled = true; knop.textContent = 'Bezig…';
    try {
      await inloggen(f.email.value.trim(), f.wachtwoord.value);
      ST.login = false;
      laad({ vers: true });
    } catch (e) {
      const fout = $('#loginfout');
      fout.textContent = e.message; fout.hidden = false;
      knop.disabled = false; knop.textContent = 'Inloggen';
    }
  });
}

// Gegevens voor de zichtbare periode ophalen (met de weken eromheen voor 'vast') en opnieuw tekenen
async function laad({ vers = false } = {}) {
  const { start, eind } = periode();
  ST.laden = true;
  ST.fout = null;
  render();
  try {
    await zorgVoor(addDays(start, -7 * LOOK_AROUND_WEEKS), addDays(eind, 7 * LOOK_AROUND_WEEKS), { vers });
  } catch (e) {
    if (e instanceof NietIngelogd) ST.login = true;
    else ST.fout = navigator.onLine === false ? 'Je bent offline. Zodra er verbinding is, wordt je agenda bijgewerkt.' : e.message;
  }
  ST.laden = false;
  render();
}

/* ------------------------------------------------------------------ */
/*  Panelen: openen, sluiten en omlaag vegen                           */
/* ------------------------------------------------------------------ */

const panelen = [];
function openPaneel(el, { greepSelector, boven = false } = {}) {
  const achter = document.createElement('div');
  achter.className = 'achtergrond' + (boven ? ' boven' : '');
  const lagen = $('#lagen');
  lagen.append(achter, el);
  const p = { el, achter, sluit: null };
  p.sluit = () => {
    el.classList.remove('open');
    achter.classList.remove('open');
    const weg = () => { el.remove(); achter.remove(); };
    setTimeout(weg, 340);
    const i = panelen.indexOf(p);
    if (i >= 0) panelen.splice(i, 1);
    if (!panelen.length) document.body.style.overflow = '';
  };
  achter.addEventListener('click', p.sluit);
  panelen.push(p);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('open'); achter.classList.add('open'); }));
  if (greepSelector) maakVeegbaar(el, el.querySelector(greepSelector), p.sluit);
  return p;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelen.length) panelen[panelen.length - 1].sluit(); });

// Omlaag vegen aan de greep of de kop van een paneel sluit het
function maakVeegbaar(paneel, greep, sluit) {
  if (!greep) return;
  let y0 = null, dy = 0, t0 = 0;
  greep.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') && e.pointerType === 'mouse') return;
    y0 = e.clientY; dy = 0; t0 = Date.now();
    paneel.classList.add('sleept');
    greep.setPointerCapture(e.pointerId);
  });
  greep.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    paneel.style.transform = `translate(-50%, ${dy}px)`;
  });
  const los = () => {
    if (y0 === null) return;
    paneel.classList.remove('sleept');
    paneel.style.transform = '';
    const snel = dy / Math.max(1, Date.now() - t0) > 0.6;
    if (dy > 110 || (snel && dy > 30)) sluit();
    y0 = null;
  };
  greep.addEventListener('pointerup', los);
  greep.addEventListener('pointercancel', los);
}

/* ------------------------------------------------------------------ */
/*  Weekkiezer                                                         */
/* ------------------------------------------------------------------ */

// Maandraster met weekrijen. Bezetting als heatmap in drie stappen: grijs (rustig), geel (vanaf MID_HOURS)
// en rood (vanaf FULL_HOURS); binnen elke stap wordt de tint voller naarmate de dag drukker is.
// Gebruikt in het paneel (telefoon, tablet) en in de zijbalk (desktop).
const niveau = (h) => (h >= FULL_HOURS ? 'vol' : h >= MID_HOURS ? 'mid' : '');
function tint(h) {
  if (!h) return 0;
  if (h >= FULL_HOURS) return 0.18 + 0.12 * Math.min(1, (h - FULL_HOURS) / 2);
  if (h >= MID_HOURS) return 0.2 + 0.12 * ((h - MID_HOURS) / (FULL_HOURS - MID_HOURS));
  return 0.05 + 0.07 * (h / MID_HOURS);
}
function maandRasterHtml(maand, gekozen, soort = 'paneel') {
  const rasterStart = startOfWeek(maand);
  const uren = busyHoursByDay(afsprakenTussen(rasterStart, addDays(rasterStart, 42)));
  const t = vandaag();
  let rijen = '';
  for (let r = 0; r < 6; r++) {
    const ma = addDays(rasterStart, r * 7);
    let cellen = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ma, i);
      const weekend = i >= 5;
      const anders = d.getMonth() !== maand.getMonth();
      const voorbij = d < t;
      // Dagen die al voorbij zijn: alleen het cijfer, gedempt. Hoe druk een dag was, doet er niet meer toe.
      // Dagen van de volgende maand die al in beeld zijn, krijgen wel hun kleur.
      const h = weekend || voorbij ? 0 : uren[d.getTime()] || 0;
      const klasse = ['dagcel', weekend ? 'weekend' : '', anders ? 'anders' : '', voorbij ? 'voorbij' : '', sameDay(d, t) ? 'vandaag' : '', niveau(h), h ? 'gevuld' : ''].join(' ');
      cellen += `<span class="cel"><span class="${klasse}" style="--a:${tint(h).toFixed(3)}"><span>${d.getDate()}</span></span></span>`;
    }
    rijen += `<button class="weekrij${sameDay(ma, gekozen) ? ' gekozen' : ''}" data-ma="${ma.getTime()}" aria-label="Week ${isoWeek(ma)}"><span class="wk">${isoWeek(ma)}</span>${cellen}</button>`;
  }
  const knoppen = soort === 'paneel'
    ? `<div class="capsule glas maandcapsule"><button data-maand="-1" aria-label="Vorige maand">${I.terug}</button><button data-maand="1" aria-label="Volgende maand">${I.verder}</button></div>`
    : `<div class="maandpijlen"><button data-maand="-1" aria-label="Vorige maand">${I.terug}</button><button data-maand="1" aria-label="Volgende maand">${I.verder}</button></div>`;
  return `<div class="kiezerkop"><h2>${cap(MONTHS_LONG[maand.getMonth()])} ${maand.getFullYear()}</h2>${knoppen}</div>
    <div class="rasterkop"><span></span>${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d) => `<span>${d}</span>`).join('')}</div>
    ${rijen}
    <div class="kiezerlegenda"><span><i class="rustig"></i>rustig</span><span><i class="gemiddeld"></i>${MID_HOURS}–${FULL_HOURS} uur</span><span><i class="druk"></i>${FULL_HOURS} uur of meer</span></div>`;
}
const gekozenMaandag = () => startOfWeek(ST.tab === 'week' ? ST.anker : ST.fcStart);
function kiesWeek(ma) {
  ST.anker = ma;
  ST.tab = 'week';
  LS.set('ag_tab', ST.tab);
  window.scrollTo(0, 0);
  laad();
}

function openWeekkiezer() {
  if (isDesktop()) return; // op de desktop staat de kalender al in de zijbalk
  let maand = firstOfMonth(addDays(gekozenMaandag(), 3));
  const el = document.createElement('div');
  el.className = 'paneel kiezer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Kies een week');
  const p = openPaneel(el);
  const teken = () => {
    el.innerHTML = `<div class="kiezergreep"><div class="greep"></div>${maandRasterHtml(maand, gekozenMaandag())}</div>`;
    // Verplaats raster en legenda uit de greep, zodat alleen de kop veegbaar is
    const greep = el.querySelector('.kiezergreep');
    [...greep.children].slice(2).forEach((n) => el.appendChild(n));
    // Onder de kalender: welke agenda je ziet, en een eigen agenda inladen (zoals in de zijbalk op de desktop)
    el.insertAdjacentHTML('beforeend', agendaSectieHtml());
    maakVeegbaar(el, greep, p.sluit);
    const rasterStart = startOfWeek(maand);
    const ditMaand = maand;
    Promise.resolve(zorgVoor(rasterStart, addDays(rasterStart, 42))).then(() => { if (el.isConnected && ditMaand === maand) tekenRingen(el, maand); }).catch(() => {});
  };
  teken();
  el.addEventListener('click', (ev) => {
    const m = ev.target.closest('[data-maand]');
    if (m) {
      const n = Number(m.dataset.maand);
      if (n === 0) { p.sluit(); verschuif(0, 'week'); return; }
      maand = new Date(maand.getFullYear(), maand.getMonth() + n, 1);
      teken();
      return;
    }
    const rij = ev.target.closest('.weekrij');
    if (rij) { p.sluit(); kiesWeek(new Date(Number(rij.dataset.ma))); return; }
    const ics = ev.target.closest('[data-actie^="ics-"]');
    if (ics) {
      if (ics.dataset.actie === 'ics-openen') { $('#icsinvoer').click(); p.sluit(); }
      else if (confirm('Het agenda-bestand van dit toestel wissen? De app toont dan weer voorbeeldgegevens.')) { p.sluit(); vergeetBestand(); }
    }
  });
}
// Tinten bijwerken zodra de gegevens binnen zijn, zonder het raster te laten verspringen
function tekenRingen(el, maand) {
  const rasterStart = startOfWeek(maand);
  const uren = busyHoursByDay(afsprakenTussen(rasterStart, addDays(rasterStart, 42)));
  el.querySelectorAll('.weekrij').forEach((rij) => {
    const ma = new Date(Number(rij.dataset.ma));
    rij.querySelectorAll('.dagcel').forEach((cel, i) => {
      if (i >= 5 || cel.classList.contains('voorbij')) return;
      const h = uren[addDays(ma, i).getTime()] || 0;
      cel.style.setProperty('--a', tint(h).toFixed(3));
      cel.classList.toggle('vol', niveau(h) === 'vol');
      cel.classList.toggle('mid', niveau(h) === 'mid');
      cel.classList.toggle('gevuld', h > 0);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Zijbalk (desktop)                                                  */
/* ------------------------------------------------------------------ */

let zijMaand = null;
// Zijbalk: waar de afspraken vandaan komen, en een eigen .ics inladen of wissen
function agendaSectieHtml() {
  let bron;
  if (BESTAND) {
    const d = new Date(BESTAND.datum);
    bron = [esc(BESTAND.naam), `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} · alleen op dit toestel`];
  } else if (DEMO) bron = ['Voorbeeldgegevens', 'Verzonnen afspraken en namen'];
  else bron = ['Outlook', DATA.opgehaald ? `Bijgewerkt om ${hhmm(new Date(DATA.opgehaald))}` : 'Via Nhost'];
  const knoppen = DEMO || BESTAND
    ? `<button data-actie="ics-openen">${I.inladen}<span>${BESTAND ? 'Ander bestand inladen' : 'Eigen agenda inladen'}</span></button>${BESTAND ? `<button data-actie="ics-wissen">${I.wissen}<span>Wissen</span></button>` : ''}`
    : '';
  return `<nav class="zblijst zbagenda" aria-label="Agenda"><h3>Agenda</h3>
    <div class="zbbron">${I.kalender}<span><span class="t1">${bron[0]}</span><span class="t2">${bron[1]}</span></span></div>
    ${knoppen}
  </nav>`;
}
function renderZijbalk() {
  const z = $('#zijbalk');
  if (!isDesktop()) { z.innerHTML = ''; return; }
  if (!zijMaand) zijMaand = firstOfMonth(addDays(gekozenMaandag(), 3));
  const item = (tab, icoon, tekst) => `<button data-tab="${tab}" class="${ST.tab === tab ? 'aan' : ''}" aria-selected="${ST.tab === tab}">${icoon}<span>${tekst}</span></button>`;
  z.innerHTML = `<div class="zbbinnen">
    <div class="minikal">${maandRasterHtml(zijMaand, gekozenMaandag(), 'zijbalk')}</div>
    <nav class="zblijst zbweergave" aria-label="Weergave"><h3>Weergave</h3>${item('week', I.week, 'Week')}${item('forecast', I.vooruit, 'Vooruitblik')}</nav>
    ${agendaSectieHtml()}
  </div>`;
  const rasterStart = startOfWeek(zijMaand);
  const ditMaand = zijMaand;
  Promise.resolve(zorgVoor(rasterStart, addDays(rasterStart, 42))).then(() => { if (ditMaand === zijMaand) tekenRingen(z, zijMaand); }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/*  Detailscherm                                                       */
/* ------------------------------------------------------------------ */

const ROLE_LABEL = { 'req-participant': 'Verplicht', 'opt-participant': 'Optioneel', chair: 'Voorzitter' };
function statusOf(s) {
  if (s === 'accepted') return { text: 'Geaccepteerd', kleur: 'var(--statusYes)' };
  if (s === 'declined') return { text: 'Afgewezen', kleur: 'var(--statusNo)' };
  if (s === 'tentative') return { text: 'Misschien', kleur: 'var(--statusMaybe)' };
  return { text: 'Geen reactie', kleur: 'var(--secondary)' };
}
function initialsOf(name, email) {
  const src = (name || '').replace(/\(.*?\)/g, '').trim();
  if (src && !src.includes('@')) {
    const words = src.split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ]/.test(w));
    const first = words[0] ? words[0][0] : '';
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return (first + last).toUpperCase() || '?';
  }
  return (email || '?')[0].toUpperCase();
}
function cleanNotes(raw) {
  if (!raw) return '';
  let t = String(raw).replace(/\r/g, '');
  const cut = t.search(/_{10,}|Microsoft Teams[- ]?(meeting|vergadering)|Neem deel aan de vergadering|Deelnemen aan de vergadering|Join the meeting|Join Zoom Meeting/i);
  if (cut >= 0) t = t.slice(0, cut);
  return t.replace(/<https?:[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function recurrenceText(e) {
  const r = e.repeat;
  if (!r) return e.regular ? 'terugkerend' : null;
  const n = r.interval || 1;
  const unit = { daily: ['dag', 'dagen'], weekly: ['week', 'weken'], monthly: ['maand', 'maanden'], yearly: ['jaar', 'jaar'] }[r.freq];
  if (!unit) return 'terugkerend';
  return n === 1 ? `elke ${unit[0]}` : `elke ${n} ${unit[1]}`;
}
const mailLink = (adressen, onderwerp) => `mailto:${adressen.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(onderwerp || '')}`;

function openDetail(e) {
  const own = eigenDomeinen();
  const kindLabel = e.kind === 'ext' ? 'Extern' : e.kind === 'int' ? 'Intern, ad hoc' : 'Intern, vast';
  const rec = recurrenceText(e);
  const dateLine = cap(`${DAYS_LONG[e.start.getDay()]} ${e.start.getDate()} ${MONTHS_LONG[e.start.getMonth()]}`);
  // Overlap: dezelfde regel als in de lijst, maar hier met alle afspraken erbij
  const ov = overlapVan(eventsForDay([...zichtbaar.values()], e.start));
  const o = ov.get(e);
  const ovNamen = o ? o.andere.map((x) => `${x.title || 'een afspraak'}${x.start > e.start ? ` om ${hhmm(x.start)}` : ''}`) : [];
  const ovLine = o ? `Overlap met ${ovNamen.length > 1 ? `${ovNamen.slice(0, -1).join(', ')} en ${ovNamen[ovNamen.length - 1]}` : ovNamen[0]}` : '';
  const timeLine = e.allDay
    ? (Math.round((e.end - e.start) / 864e5) > 1 ? `Hele dag, t/m ${addDays(e.end, -1).getDate()} ${MONTHS_LONG[addDays(e.end, -1).getMonth()]}` : 'Hele dag')
    : `${hhmm(e.start)} – ${hhmm(e.end)} · ${durationText(e.start, e.end)}`;

  // Organisator en deelnemers, gegroepeerd per organisatie (externen eerst)
  const org = e.organizer;
  const orgDomain = org ? domainOf(org.email) : null;
  const orgExternal = !!orgDomain && own.size > 0 && !isOwnDomain(orgDomain, own);
  const people = e.attendees.filter((a) => !isRoom(a) && !(org && org.email && a.email === org.email));
  const mailTo = [...new Set([org, ...people].filter((p) => p && !isMe(p)).map((p) => p.email).filter(Boolean))];
  const groups = {};
  people.forEach((a) => {
    const d = domainOf(a.email);
    const external = !!d && own.size > 0 && !isOwnDomain(d, own);
    const key = !d ? 'Overig' : external ? orgLabel(d) : OWN_ORG_NAME;
    (groups[key] = groups[key] || { name: key, external, people: [] }).people.push(a);
  });
  const groupList = Object.values(groups).sort((a, b) => {
    if (a.external !== b.external) return a.external ? -1 : 1;
    if (a.name === 'Overig') return 1;
    if (b.name === 'Overig') return -1;
    return b.people.length - a.people.length;
  });

  // Locatie: plekken en de online vergadering
  const plekken = e.places.map((p) => {
    const ruimte = e.roomNames.includes(p) || !isAddressLike(p);
    return `<div class="drij"><span class="dicoon">${I.speld}</span><span class="tekst"><div class="t1">${esc(p)}</div><div class="t2">${ruimte ? (e.mode === 'hybrid' ? 'Vergaderruimte' : 'Vergaderruimte, fysiek overleg') : 'Fysiek overleg'}</div></span>${ruimte ? '' : `<a class="actie zacht" href="https://maps.apple.com/?q=${encodeURIComponent(p)}" target="_blank" rel="noopener">Route</a>`}</div>`;
  });
  if (e.mode === 'physical' && !plekken.length) plekken.push(`<div class="drij"><span class="dicoon">${I.speld}</span><span class="tekst"><div class="t1">Op locatie</div><div class="t2">Geen plek opgegeven</div></span></div>`);
  if (e.link) plekken.push(`<div class="drij"><span class="dicoon online">${I.video}</span><span class="tekst"><div class="t1">${esc(e.link.provider)}</div><div class="t2">${e.mode === 'hybrid' ? 'Ook online te volgen' : 'Online vergadering'}</div></span><a class="actie" href="${esc(e.link.url)}" target="_blank" rel="noopener">Deelnemen</a></div>`);

  const persoonRij = (p, opts) => {
    const st = opts.status ? statusOf(p.status) : null;
    const naam = isMe(p) ? `${p.name || 'Jij'} (jij)` : p.name || p.email || 'Onbekend';
    return `<button class="drij persoon" data-persoon="${opts.idx}">
      <span class="avatar${opts.external ? ' ext' : ''}">${esc(initialsOf(p.name, p.email))}</span>
      <span class="tekst"><div class="t1">${esc(naam)}</div></span>
      ${opts.badge ? `<span class="badge">${esc(opts.badge)}</span>` : ''}
      ${st ? `<span class="status" style="color:${st.kleur}">${st.text}</span>` : ''}
    </button>`;
  };

  // Gegevens per persoon voor het visitekaartje
  const kaartjes = [];
  const kaartje = (p, extra) => { kaartjes.push({ ...extra, name: p.name, email: p.email, self: isMe(p), initials: initialsOf(p.name, p.email), subject: e.title }); return kaartjes.length - 1; };

  const notes = cleanNotes(e.notes);
  const el = document.createElement('div');
  el.className = 'paneel detail' + (isDesktop() ? ' dialoog' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', e.title || 'Afspraak');
  let allen = false;
  let meerNotities = false;

  const teken = () => {
    kaartjes.length = 0;
    let budget = allen ? Infinity : PEOPLE_LIMIT;
    const groepen = groupList.map((g) => {
      const take = Math.max(0, Math.min(g.people.length, budget));
      budget -= take;
      return { ...g, shown: g.people.slice(0, take) };
    }).filter((g) => g.shown.length);

    const afgeleidHtml = !org && e.afgeleid ? `<section class="sectie"><h3>Organisator</h3><div class="kaart"><div class="drij persoon">
      <span class="avatar ext">${esc(initialsOf(e.afgeleid.orgs[0]))}</span>
      <span class="tekst"><div class="t1">${esc(e.afgeleid.orgs[0] === 'Extern' ? 'Externe organisatie' : e.afgeleid.orgs[0])}</div><div class="t2">${e.afgeleid.bron === 'teams' ? 'Afgeleid uit de Teams-uitnodiging' : 'Afgeleid uit de titel'}</div></span>
    </div></div></section>` : '';
    const orgHtml = org ? `<section class="sectie"><h3>Organisator</h3><div class="kaart">${persoonRij(org, {
      idx: kaartje(org, { org: orgDomain ? (orgExternal ? orgLabel(orgDomain) : OWN_ORG_NAME) : null, external: orgExternal, role: 'Organisator' }),
      external: orgExternal, badge: orgExternal ? orgLabel(orgDomain) : null,
    })}</div></section>` : '';

    const deelnHtml = people.length ? `<section class="sectie"><h3>Deelnemers · ${people.length}</h3><div class="kaart">
      ${groepen.map((g) => `<div class="groep${g.external ? ' ext' : ''}">${esc(g.people.length > 1 ? `${g.name} · ${g.people.length}` : g.name)}</div>
        ${g.shown.map((a) => persoonRij(a, {
          idx: kaartje(a, { org: g.name === 'Overig' ? null : g.name, external: g.external, role: ROLE_LABEL[a.role], status: statusOf(a.status) }),
          external: g.external, status: true,
        })).join('')}`).join('')}
      ${people.length > PEOPLE_LIMIT ? `<button class="meerknop" data-actie="allen">${allen ? 'Minder tonen' : `Alle ${people.length} deelnemers tonen`}</button>` : ''}
    </div></section>` : '';

    const lang = notes.split('\n').length > 6 || notes.length > 280;
    el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
      <div class="detailinhoud">
        <div class="dkop">
          <span class="stip ${e.kind}" role="img" aria-label="${kindLabel}" title="${kindLabel}"></span>
          <div class="dkopinhoud">
          <h2 class="dtitel">${esc(e.title || '(geen titel)')}</h2>
          <div class="dmeta">
            <div>${dateLine}</div>
            <div class="num">${timeLine}${rec ? `<span class="dher" role="img" aria-label="${esc(cap(rec))}" title="${esc(cap(rec))}">${I.herhaal}</span>` : ''}</div>
            ${e.mode !== 'none' ? `<div>${MODE_LABEL[e.mode]}</div>` : ''}
            ${ovLine ? `<div class="doverlap">${esc(ovLine)}</div>` : ''}
          </div>
          ${e.external ? `<div class="dbadges">${e.orgs.map((o) => `<span>${esc(o)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        ${plekken.length ? `<section class="sectie"><h3>Locatie</h3><div class="kaart">${plekken.join('')}</div></section>` : ''}
        ${orgHtml || afgeleidHtml}
        ${deelnHtml}
        ${notes ? `<section class="sectie"><h3>Notities</h3><div class="kaart"><div class="notities"><p class="${lang && !meerNotities ? 'kort' : ''}">${esc(notes)}</p>${lang ? `<button data-actie="notities">${meerNotities ? 'Minder tonen' : 'Meer tonen'}</button>` : ''}</div></div></section>` : ''}
        <div class="dvoet">
          ${mailTo.length ? `<a class="groteknop" href="${mailLink(mailTo, e.title)}">${I.mail}${mailTo.length === 1 ? 'Mail de deelnemer' : `Mail alle deelnemers (${mailTo.length})`}</a>` : ''}
          <a class="groteknop" href="${OUTLOOK_URL}" target="_blank" rel="noopener">${I.extern}Openen in Outlook</a>
          <p class="voetnoot">Accepteren, misschien of weigeren doe je in Outlook.</p>
        </div>
      </div>`;
  };
  teken();
  const p = openPaneel(el, { greepSelector: '.detailgreep' });

  el.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-actie]');
    if (a) {
      if (a.dataset.actie === 'sluit') p.sluit();
      if (a.dataset.actie === 'allen') { allen = !allen; teken(); maakVeegbaar(el, el.querySelector('.detailgreep'), p.sluit); }
      if (a.dataset.actie === 'notities') { meerNotities = !meerNotities; teken(); maakVeegbaar(el, el.querySelector('.detailgreep'), p.sluit); }
      return;
    }
    const pers = ev.target.closest('[data-persoon]');
    if (pers) openVisitekaartje(kaartjes[Number(pers.dataset.persoon)]);
  });
}

/* ------------------------------------------------------------------ */
/*  Nieuwe afspraak                                                    */
/* ------------------------------------------------------------------ */

// De app leest de agenda alleen. Dit scherm zoekt een geschikt moment en opent daarna Outlook met alles
// ingevuld (of geeft een .ics-bestand); opslaan en uitnodigen gebeurt in Outlook.
const duurKort = (m) => (m < 60 ? `${m} min` : freeText(m));

async function afsprakenOp(dag) {
  const a = startOfDay(dag);
  try { await zorgVoor(startOfWeek(a), addDays(startOfWeek(a), 7)); } catch (e) { /* zonder verbinding: wat er al is */ }
  return afsprakenTussen(a, addDays(a, 1));
}

// Begintijden in een vrij blok: aansluitend in stappen van de gekozen duur, vanaf het begin van het blok
// (op een kwartier), plus het laatste moment waarop de afspraak nog past. Een uur in 16:00 – 18:00 geeft 16:00 en 17:00.
function tijdenInBlok(a, b, duur) {
  const ms = duur * 6e4;
  const kwartier = 15 * 6e4;
  const zet = new Set();
  const eerste = Math.ceil(a / kwartier) * kwartier;
  for (let t = eerste; t + ms <= b; t += ms) zet.add(t);
  const laatste = Math.floor((b - ms) / kwartier) * kwartier;
  if (laatste >= eerste) zet.add(laatste);
  return [...zet].sort((x, y) => x - y);
}
function startTijden(lijst, dag, duur) {
  return freeSlots(lijst, dag).map((f) => ({ blok: f, tijden: tijdenInBlok(f.start.getTime(), f.end.getTime(), duur) })).filter((x) => x.tijden.length);
}

async function eersteDagMetRuimte(vanaf, duur, max = 21) {
  for (let i = 0; i < max; i++) {
    const d = addDays(startOfDay(vanaf), i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    if (startTijden(await afsprakenOp(d), d, duur).length) return d;
  }
  return null;
}

const icsTekst = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsTijd = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const adressen = (s) => String(s || '').split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /@/.test(x));

function outlookNieuwLink(v) {
  const q = [
    ['rru', 'addevent'],
    ['subject', v.titel], ['startdt', new Date(v.start).toISOString()], ['enddt', new Date(v.start + v.duur * 6e4).toISOString()],
    ['location', v.locatie], ['body', v.notitie], ['to', adressen(v.deelnemers).join(',')],
  ].filter(([, w]) => w).map(([k, w]) => `${k}=${encodeURIComponent(w)}`).join('&');
  return `https://outlook.office.com/calendar/deeplink/compose?path=/calendar/action/compose&${q}`;
}

function downloadIcs(v) {
  const regels = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//rserne//Agenda//NL', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@agenda`, `DTSTAMP:${icsTijd(Date.now())}`,
    `DTSTART:${icsTijd(v.start)}`, `DTEND:${icsTijd(v.start + v.duur * 6e4)}`, `SUMMARY:${icsTekst(v.titel || 'Nieuwe afspraak')}`,
    ...(v.locatie ? [`LOCATION:${icsTekst(v.locatie)}`] : []),
    ...(v.notitie ? [`DESCRIPTION:${icsTekst(v.notitie)}`] : []),
    ...adressen(v.deelnemers).map((a) => `ATTENDEE;RSVP=TRUE:mailto:${a}`),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const url = URL.createObjectURL(new Blob([regels.join('\r\n')], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${(v.titel || 'afspraak').replace(/[^\w\- ]+/g, '').trim() || 'afspraak'}.ics`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// dag: de gekozen dag (of null: eerste werkdag met ruimte).
// blok: het vrije blok waarop is geklikt ({ start, end } in ms). Dan blijven dag en tijd binnen dat blok.
async function openNieuw({ dag = null, blok = null } = {}) {
  const v = { titel: '', locatie: '', deelnemers: '', notitie: '', duur: 60, start: null, eigen: false, dag: null, blok };
  if (blok) {
    v.dag = startOfDay(new Date(blok.start));
    v.max = Math.floor((blok.end - blok.start) / 9e5) * 15; // duur hoogstens het hele blok, in kwartieren
    v.duur = Math.min(60, v.max);
  } else if (dag) v.dag = startOfDay(dag);
  else {
    const t = vandaag();
    const week = ST.tab === 'week' ? startOfWeek(ST.anker) : ST.fcStart;
    v.dag = (await eersteDagMetRuimte(week > t ? week : nu(), v.duur)) || t;
  }
  if (!v.max) v.max = 8 * 60;
  const dagTekst = (d) => (sameDay(d, vandaag()) ? `Vandaag, ${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}` : cap(`${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`));

  const el = document.createElement('div');
  el.className = 'paneel detail nieuw' + (isDesktop() ? ' dialoog' : '');
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><h2 class="dtitel">Nieuwe afspraak</h2></div>
      <div class="formkaart">
        <label class="frij"><span class="flabel">Onderwerp</span><input name="titel" placeholder="Waar gaat het over?" autocomplete="off" enterkeyhint="next"></label>
        <label class="frij"><span class="flabel">Locatie</span><input name="locatie" placeholder="Ruimte, adres of Teams" autocomplete="off" enterkeyhint="next"></label>
      </div>
      <div class="formkaart">
        <div class="frij"><span class="flabel">Dag</span>${blok
          ? `<span class="fwaarde"><span>${dagTekst(v.dag)}</span><span class="fsub num">Vrij ${hhmm(new Date(blok.start))} – ${hhmm(new Date(blok.end))}</span></span>`
          : `<span class="fwaarde dagkeuze">
              <button class="mini" data-dag="-1" aria-label="Dag eerder">${I.terug}</button>
              <label class="datumlabel"><span id="ndatum"></span><input type="date" id="ndatuminvoer" aria-label="Kies een dag"></label>
              <button class="mini" data-dag="1" aria-label="Dag later">${I.verder}</button>
            </span>`}</div>
        <div class="frij"><span class="flabel">Duur</span><span class="fwaarde stapper">
          <button class="mini" data-stap="-15" aria-label="Korter">${I.min}</button><span id="nduur" class="num" aria-live="polite"></span><button class="mini" data-stap="15" aria-label="Langer">${I.plus}</button>
        </span></div>
        <div class="frij kolom"><span class="flabel">Begintijd</span><div id="ntijden"></div></div>
      </div>
      <div class="formkaart">
        <label class="frij"><span class="flabel">Deelnemers</span><input name="deelnemers" type="text" inputmode="email" placeholder="E-mailadressen" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <label class="frij boven"><span class="flabel">Notitie</span><textarea name="notitie" rows="3" placeholder="Optioneel"></textarea></label>
      </div>
      <div class="dvoet">
        <div class="nsamenvatting" id="nsamen"></div>
        <a class="groteknop vol" id="noutlook" target="_blank" rel="noopener">${I.extern}Verder in Outlook</a>
        <button class="groteknop" id="nics">${I.kalender}Downloaden als .ics</button>
        <p class="voetnoot">Deze app leest je agenda alleen. Outlook opent met alles ingevuld; daar sla je de afspraak op en verstuur je de uitnodiging.</p>
      </div>
    </div>`;

  let lijst = [];
  const tekenDuur = () => {
    $('#nduur', el).textContent = duurKort(v.duur);
    $('[data-stap="-15"]', el).disabled = v.duur <= 15;
    $('[data-stap="15"]', el).disabled = v.duur >= v.max;
  };
  const tekenSamen = () => {
    const ok = v.start != null;
    const link = $('#noutlook', el);
    link.classList.toggle('uit', !ok);
    if (ok) link.href = outlookNieuwLink(v); else link.removeAttribute('href');
    $('#nics', el).disabled = !ok;
    const tekst = ok ? `${dagTekst(v.dag)}, ${hhmm(new Date(v.start))} – ${hhmm(new Date(v.start + v.duur * 6e4))}` : 'Kies een begintijd';
    let ov = '';
    if (ok) {
      const a = v.start, b = v.start + v.duur * 6e4;
      const botst = lijst.filter((e) => !e.allDay && !e.free && e.start.getTime() < b && e.end.getTime() > a);
      if (botst.length) ov = `<div class="doverlap">Overlap met ${esc(botst[0].title || 'een afspraak')} (${hhmm(botst[0].start)} – ${hhmm(botst[0].end)})${botst.length > 1 ? ` en nog ${botst.length - 1}` : ''}</div>`;
    }
    $('#nsamen', el).innerHTML = `<div class="${ok ? '' : 'leeg'}">${esc(tekst)}</div>${ov}`;
  };
  const chip = (t) => `<button class="chip num${!v.eigen && t === v.start ? ' aan' : ''}" data-start="${t}">${hhmm(new Date(t))}</button>`;
  const tekenTijden = async () => {
    const d = v.dag;
    if (!blok) {
      // Op een smal scherm de korte vorm, anders past hij niet tussen de pijltjes
      $('#ndatum', el).innerHTML = `<span class="lang">${esc(dagTekst(d))}</span><span class="kort">${sameDay(d, vandaag()) ? 'Vandaag' : cap(DAYS_SHORT[d.getDay()])} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}</span>`;
      $('#ndatuminvoer', el).value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    lijst = await afsprakenOp(d);
    if (d !== v.dag) return; // intussen een andere dag gekozen
    let html;
    if (blok) {
      // Alleen begintijden binnen het aangeklikte blok
      const tijden = tijdenInBlok(blok.start, blok.end, v.duur);
      if (!tijden.includes(v.start)) v.start = tijden[0] ?? null;
      html = `<div class="chips">${tijden.map(chip).join('')}</div>`;
    } else {
      const blokken = startTijden(lijst, d, v.duur);
      const alle = blokken.flatMap((b) => b.tijden);
      if (!v.eigen && !alle.includes(v.start)) v.start = alle.length ? alle[0] : null;
      // Alle begintijden in één rij; de vrije blokken zelf hoeven niet apart genoemd
      html = '';
      if (!blokken.length) {
        const volgende = await eersteDagMetRuimte(addDays(d, 1), v.duur);
        html = `<div class="ngeen">Geen vrij blok van ${duurKort(v.duur)} tussen ${WORK_START}:00 en ${WORK_END}:00.${volgende ? ` <button class="link" data-naar="${volgende.getTime()}">Naar ${DAYS_LONG[volgende.getDay()]} ${volgende.getDate()} ${MONTHS_LONG[volgende.getMonth()]}</button>` : ''}</div>`;
      }
      const eigenWaarde = v.eigen && v.start != null ? hhmm(new Date(v.start)) : '';
      // Andere tijd staat gewoon achteraan in dezelfde rij
      html += `<div class="chips${blokken.length ? '' : ' na'}">${alle.map(chip).join('')}<button class="chip${v.eigen ? ' aan' : ''}" data-actie="eigen">Andere tijd</button>${v.eigen ? `<input class="eigeninvoer" type="time" step="900" id="neigen" value="${eigenWaarde}" aria-label="Begintijd">` : ''}</div>`;
    }
    $('#ntijden', el).innerHTML = html;
    tekenSamen();
  };
  const zetDag = (d) => {
    v.dag = startOfDay(d);
    if (!v.eigen) v.start = null;
    else if (v.start != null) { const t = new Date(v.start); v.start = new Date(v.dag.getFullYear(), v.dag.getMonth(), v.dag.getDate(), t.getHours(), t.getMinutes()).getTime(); }
    tekenTijden();
  };

  tekenDuur();
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  tekenTijden();

  el.addEventListener('input', (ev) => {
    const n = ev.target.name;
    if (n) { v[n] = ev.target.value; tekenSamen(); }
    if (ev.target.id === 'neigen' && ev.target.value) {
      const [h, m] = ev.target.value.split(':').map(Number);
      v.start = new Date(v.dag.getFullYear(), v.dag.getMonth(), v.dag.getDate(), h, m).getTime();
      tekenSamen();
    }
  });
  el.addEventListener('change', (ev) => {
    if (ev.target.id === 'ndatuminvoer' && ev.target.value) { const [j, mnd, dd] = ev.target.value.split('-').map(Number); zetDag(new Date(j, mnd - 1, dd)); }
  });
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    const stapper = t.closest('[data-stap]');
    if (stapper) { v.duur = Math.min(v.max, Math.max(15, v.duur + Number(stapper.dataset.stap))); tekenDuur(); tekenTijden(); return; }
    const st = t.closest('[data-start]');
    if (st) { v.start = Number(st.dataset.start); v.eigen = false; tekenTijden(); return; }
    if (t.closest('[data-actie="eigen"]')) { v.eigen = !v.eigen; if (!v.eigen) v.start = null; tekenTijden().then(() => { const i = $('#neigen', el); if (i) i.focus(); }); return; }
    const stap = t.closest('[data-dag]');
    if (stap) { zetDag(addDays(v.dag, Number(stap.dataset.dag))); return; }
    const naar = t.closest('[data-naar]');
    if (naar) { zetDag(new Date(Number(naar.dataset.naar))); return; }
    const lbl = t.closest('.datumlabel');
    if (lbl) { const i = $('#ndatuminvoer', el); if (i.showPicker) { ev.preventDefault(); try { i.showPicker(); } catch (e) { /* niet overal toegestaan */ } } return; }
    if (t.closest('#nics') && v.start != null) { downloadIcs(v); return; }
    if (t.closest('#noutlook') && v.start == null) ev.preventDefault();
  });
  if (isDesktop()) setTimeout(() => { const i = $('input[name="titel"]', el); if (i) i.focus(); }, 60);
}

/* ------------------------------------------------------------------ */
/*  Visitekaartje van een deelnemer                                    */
/* ------------------------------------------------------------------ */

function openVisitekaartje(k) {
  if (!k) return;
  const heeftNaam = !!k.name && !k.name.includes('@');
  const el = document.createElement('div');
  el.className = 'visite';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', heeftNaam ? k.name : k.email || 'Deelnemer');
  const rol = [k.role, k.status && k.status.text].filter(Boolean);
  el.innerHTML = `
    <span class="avatar groot${k.external ? ' ext' : ''}">${heeftNaam ? esc(k.initials) : I.persoon}</span>
    ${heeftNaam ? `<div class="naam">${esc(k.name)}</div>` : `<div class="mailkop">${esc(k.email || 'Onbekend')}</div>`}
    ${k.org ? `<span class="org${k.external ? ' ext' : ''}">${esc(k.org)}</span>` : ''}
    ${rol.length ? `<div class="rol">${esc(k.role || '')}${k.role && k.status ? ' · ' : ''}${k.status ? `<span style="color:${k.status.kleur}">${esc(k.status.text)}</span>` : ''}</div>` : ''}
    ${k.email && heeftNaam ? `<div class="adres">${esc(k.email)}</div>` : ''}
    ${k.email && !k.self ? `<a class="mailknop" href="${mailLink([k.email], k.subject)}">${I.mailVol}E-mail sturen</a>` : ''}`;
  openPaneel(el, { boven: true });
}

/* ------------------------------------------------------------------ */
/*  Bediening                                                          */
/* ------------------------------------------------------------------ */

function verschuif(n, tab) {
  if (tab) { ST.tab = tab; LS.set('ag_tab', tab); }
  if (n === 0) {
    const t = vandaag();
    ST.anker = defaultWeekAnchor(t);
    ST.fcStart = t;
    zijMaand = null;
  } else if (ST.tab === 'week') ST.anker = addDays(ST.anker, 7 * n);
  else ST.fcStart = addDays(ST.fcStart, 7 * n);
  // De kalender in de zijbalk loopt mee naar de maand van de gekozen week
  if (zijMaand && firstOfMonth(addDays(gekozenMaandag(), 3)).getTime() !== zijMaand.getTime()) zijMaand = firstOfMonth(addDays(gekozenMaandag(), 3));
  window.scrollTo(0, 0);
  laad();
}

function koppel() {
  $('#capsule').innerHTML = capsuleHtml('Week terug', 'Week verder');
  $('#titelknop').addEventListener('click', openWeekkiezer);
  $('#icsinvoer').addEventListener('change', (ev) => { openBestand(ev.target.files[0]).catch((e) => alert(`Inlezen mislukt: ${e.message}`)); ev.target.value = ''; });
  $('#datumregel').addEventListener('click', () => verschuif(0));
  // iPad: de zijbalk in- en uitklappen; de keuze blijft bewaard
  const zetZijbalk = (dicht) => { document.body.classList.toggle('zbdicht', dicht); $('#zijbalkknop').setAttribute('aria-expanded', String(!dicht)); };
  zetZijbalk(LS.get('ag_zijbalk') === 'dicht');
  $('#zijbalkknop').addEventListener('click', () => { const dicht = !document.body.classList.contains('zbdicht'); zetZijbalk(dicht); LS.set('ag_zijbalk', dicht ? 'dicht' : 'open'); });

  // Eén luisteraar voor alle knoppen in kop, zijbalk, tabbalk en inhoud
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#lagen')) return; // panelen regelen hun eigen knoppen
    const nav = ev.target.closest('[data-nav]');
    if (nav) { verschuif(Number(nav.dataset.nav)); return; }
    const actie = ev.target.closest('[data-actie^="ics-"]');
    if (actie) {
      if (actie.dataset.actie === 'ics-openen') $('#icsinvoer').click();
      else if (confirm('Het agenda-bestand van dit toestel wissen? De app toont dan weer voorbeeldgegevens.')) vergeetBestand();
      return;
    }
    const f = ev.target.closest('[data-filter]');
    if (f) {
      if (f.dataset.filter !== ST.filter) { ST.filter = f.dataset.filter; LS.set('ag_filter', ST.filter); render(); }
      return;
    }
    const tab = ev.target.closest('[data-tab]');
    if (tab) {
      if (tab.dataset.tab !== ST.tab) { ST.tab = tab.dataset.tab; LS.set('ag_tab', ST.tab); window.scrollTo(0, 0); laad(); }
      return;
    }
    const maand = ev.target.closest('#zijbalk [data-maand]');
    if (maand) {
      const n = Number(maand.dataset.maand);
      if (n === 0) { verschuif(0, 'week'); return; }
      zijMaand = new Date(zijMaand.getFullYear(), zijMaand.getMonth() + n, 1);
      renderZijbalk();
      return;
    }
    const rij = ev.target.closest('#zijbalk .weekrij');
    if (rij) { kiesWeek(new Date(Number(rij.dataset.ma))); return; }
    const vrij = ev.target.closest('#inhoud [data-vrij]');
    if (vrij) { const [a, b] = vrij.dataset.vrij.split('-').map(Number); openNieuw({ blok: { start: a, end: b } }); return; }
    if (ev.target.closest('[data-nieuw]')) { openNieuw(); return; }
    const b = ev.target.closest('#inhoud [data-id]');
    if (b && zichtbaar.has(b.dataset.id)) openDetail(zichtbaar.get(b.dataset.id));
  });

  // Hoogte van de kop doorgeven, zodat de dagkoppen er precies onder blijven plakken
  const kop = $('#kop');
  const zetKop = () => document.documentElement.style.setProperty('--kopH', `${kop.offsetHeight}px`);
  if ('ResizeObserver' in window) new ResizeObserver(zetKop).observe(kop);
  zetKop();

  // Van telefoon- naar desktopopmaak (venster groter of kleiner): opnieuw tekenen
  DESKTOP.addEventListener('change', () => { panelen.slice().forEach((p) => p.sluit()); render(); });

  // Terug in de app: nieuwe dag? Dan terug naar vandaag. Gegevens ouder dan vijf minuten: opnieuw ophalen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = vandaag();
    if (!sameDay(t, ST.dag)) { ST.dag = t; ST.anker = defaultWeekAnchor(t); ST.fcStart = t; zijMaand = null; }
    if (!lokaal() && Date.now() - DATA.opgehaald > VERS_MS) laad({ vers: true });
    else render();
  });
  window.addEventListener('online', () => { if (!lokaal()) laad({ vers: true }); });
}

// Uitloggen: ?uitloggen achter het adres
if (PARAMS.has('uitloggen')) uitloggen();

(function start() {
  const f = LS.get('ag_filter');
  if (['notable', 'all', 'free'].includes(f)) ST.filter = f;
  const t = LS.get('ag_tab');
  if (['week', 'forecast'].includes(t)) ST.tab = t;
  koppel();
  // Een eerder geopend .ics-bestand gaat voor (behalve met ?echt of ?demo)
  IDB.get('ics').catch(() => null).then(async (b) => {
    if (b && b.tekst && !PARAMS.has('echt') && !PARAMS.has('demo')) {
      const kopie = await IDB.get('icsweken').catch(() => null);
      if (kopie && kopie.datum === b.datum && kopie.weken && kopie.weken.length) startUitBewaard(b, kopie);
      else {
        $('#inhoud').innerHTML = '<div class="laden">Agenda-bestand inlezen…</div>';
        try { await gebruikBestand(b); } catch (e) { BESTAND = null; }
      }
    }
    if (!lokaal() && !SES.refresh) { ST.login = true; render(); return; }
    // Eerst tonen wat er bewaard is, daarna de nieuwe stand ophalen
    render();
    laad({ vers: !lokaal() });
  });
})();

// Melding als er een nieuwe versie klaarstaat. We halen het begin van app.js op, zonder cache, en vergelijken
// APP_VERSIE met de versie die nu draait. Dat werkt los van de service worker: die meldt een update op de iPhone
// niet betrouwbaar, en een app op het beginscherm blijft vaak dagen in het geheugen. We kijken kort na het
// openen, bij elke terugkeer naar de app en elk half uur.
const versieDelen = (v) => String(v).split('-').map(Number);
const nieuwer = (a, b) => { const x = versieDelen(a), y = versieDelen(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
(function versieControle() {
  if (!/^https?:$/.test(location.protocol)) return;
  const melding = $('#updatemelding');
  let gemeld = false, laatst = 0;
  const toon = () => { if (gemeld) return; gemeld = true; melding.hidden = false; requestAnimationFrame(() => melding.classList.add('open')); };
  // Vernieuwen: eerst de bewaarde app-bestanden weg, dan komt alles vers van de server
  $('#vernieuwknop').addEventListener('click', async () => {
    try { const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.startsWith('agenda-')).map((k) => caches.delete(k))); } catch (e) { /* geen cache */ }
    location.reload();
  });
  $('#laterknop').addEventListener('click', () => { melding.classList.remove('open'); setTimeout(() => { melding.hidden = true; }, 250); });
  const kijk = async () => {
    if (gemeld || Date.now() - laatst < 60 * 1000) return;
    laatst = Date.now();
    try {
      const r = await fetch(`app.js?versiecheck=${Date.now()}`, { cache: 'no-store', headers: { Range: 'bytes=0-2047' } });
      if (!r.ok) return;
      const m = (await r.text()).match(/APP_VERSIE = '([^']+)'/);
      if (m && nieuwer(m[1], APP_VERSIE)) toon();
    } catch (e) { /* geen verbinding: later opnieuw */ }
  };
  setTimeout(kijk, 4000);
  setInterval(kijk, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kijk(); });
  window.addEventListener('focus', kijk);
})();

// Service worker: de app zonder verbinding kunnen openen. Bij terugkomen ook de service worker bijwerken.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
