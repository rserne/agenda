// Agenda, de app
// Toont je agenda (uit een .ics-bestand, via je agenda-link of als voorbeeld) in Week, Vooruitblik en de weekkiezer.
// Geen bouwstap: de bestanden draaien zoals ze zijn op GitHub Pages.
// Hoog APP_VERSIE hier en VERSION in sw.js samen op bij elke uitgave.
'use strict';
const APP_VERSIE = '2026-11-07-7';

/* ------------------------------------------------------------------ */
/*  Instellingen                                                       */
/* ------------------------------------------------------------------ */

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
// Op iPhone en iPad openen de Outlook-knoppen de Outlook-app (ms-outlook://), elders Outlook op het web.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const PARAMS = new URLSearchParams(location.search);
// Formaat: telefoon (smal), tablet (vanaf 768) en desktop (vanaf 1200, met zijbalk en dagkolommen)
const DESKTOP = window.matchMedia('(min-width: 1200px)');
const isDesktop = () => DESKTOP.matches;
// De afspraken komen uit een .ics-bestand of je agenda-link (BESTAND), en anders uit voorbeeld.js.
// Met ?demo achter het adres toont de app altijd de voorbeeldgegevens.
let BESTAND = null; // { naam, datum, link, lezer, klaar, gelezen } als je zelf een .ics of een agenda-link gebruikt

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
  vink: lijn('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
  instellingen: lijn('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 1.8),
  kopieer: lijn('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>', 2),
  koppel: lijn('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>', 2),
};
