// Agenda, indeling
// Wat een afspraak is (extern, intern ad hoc, intern vast), overlap, bezetting en vrije tijd.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

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

// Eigen domeinen: wat de omzetter uit de Teams-links heeft geleerd en OWN_DOMAINS_EXTRA. Is er niets bekend,
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
  // Gepubliceerde agenda zonder organisator en deelnemers: de afgeleide organisatie (zie js/verrijk.js)
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
    tekst.set(e, { lang: `Overlap met ${naam(eerste)}${tijd}${andere.length > 1 ? ` en ${andere.length - 1} andere` : ''}`, tijd: tijd ? hhmm(eerste.start) : '', andere, start: e.start, inLijst });
  });
  return tekst;
}
const overlapt = (e, ov) => !!(ov && ov.has(e) && ov.get(e).inLijst);
const overlapLabel = (e, ov) => (overlapt(e, ov) ? `<span class="overlaplabel">${esc(ov.get(e).lang)}</span>` : '');
