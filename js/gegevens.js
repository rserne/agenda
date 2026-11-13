// Agenda, gegevens
// Waar de afspraken vandaan komen: voorbeeldgegevens, een eigen .ics-bestand (IndexedDB, Web Worker) of je agenda-link.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

/* ------------------------------------------------------------------ */
/*  Gegevens: bijhouden welke weken er zijn                            */
/* ------------------------------------------------------------------ */

const DATA = { ruw: new Map(), weken: new Set(), me: null, ownDomains: [] };
const BEWAAR_WEKEN = 26;

// Pas weken laden als bij het opstarten bekend is waar de afspraken vandaan komen. Anders vult de zijbalk op de
// iPad en de Mac al voorbeeldweken in voordat je eigen agenda uit de opslag komt, en raken die twee vermengd.
let BRON_BEKEND = false;
// De bewaarde kopie van de weken: een kopie zonder deze stempel kan nog voorbeeldafspraken bevatten (tot v163)
const KOPIE_SOORT = 2;

// Voorbeeldgegevens: per ontbrekende week maken (voorbeeld.js)
function laadVoorbeeld(van, tot) {
  DATA.me = VOORBEELD_IK;
  DATA.ownDomains = VOORBEELD_DOMEINEN;
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

// ical.js en de omzetcode pas laden als je een bestand opent (alleen nodig als er geen Web Worker kan)
let _icalKlaar = null;
function laadIcalCode() {
  if (!_icalKlaar) {
    _icalKlaar = (async () => {
      if (!window.ICAL) {
        await new Promise((ok, fout) => { const s = document.createElement('script'); s.src = 'vendor/ical.min.js'; s.onload = ok; s.onerror = () => fout(new Error('ical.js niet geladen')); document.head.appendChild(s); });
      }
      const [{ maakOmzetter }, { leerUitIcal, hintVoor }] = await Promise.all([import('./ical.js'), import('./verrijk.js')]);
      return { omzetter: maakOmzetter(window.ICAL), leerUitIcal, hintVoor };
    })();
  }
  return _icalKlaar;
}

// Het bestand inlezen kost op een telefoon enkele seconden (1 à 2 MB tekst met herhaalreeksen). Dat gebeurt daarom
// in een Web Worker (js/ics-werker.js), naast de app: scrollen en tikken gaan gewoon door. Lukt een worker niet, dan
// doen we het hier, zoals vroeger. Daarnaast bewaren we de uitgerolde weken in IndexedDB ('icsweken'): bij het
// opstarten staan die meteen in beeld en lezen we het bestand pas daarna in.
function maakLezer() {
  const hier = lezerHier();
  let werker = null;
  try { werker = new Worker('js/ics-werker.js', { type: 'module' }); } catch (e) { return hier; }
  let teller = 0, kapot = false, laatsteTekst = null;
  const wacht = new Map();
  werker.onmessage = ({ data }) => {
    const w = wacht.get(data.id);
    if (!w) return;
    wacht.delete(data.id);
    if (data.ok) w.ok(data.uit); else w.fout(new Error(data.fout));
  };
  // Kan de worker niet starten (een oude browser zonder module-workers), dan alsnog hier inlezen
  werker.onerror = (e) => { kapot = true; wacht.forEach((w) => w.fout(Object.assign(new Error(e.message || 'Worker mislukt'), { werker: true }))); wacht.clear(); };
  const vraag = (bericht) => new Promise((ok, fout) => { const id = ++teller; wacht.set(id, { ok, fout }); werker.postMessage({ id, ...bericht }); });
  const metReserve = async (opWerker, opHier) => {
    if (!kapot) {
      try { return await opWerker(); } catch (e) { if (!e.werker) throw e; }
    }
    werker.terminate();
    return opHier();
  };
  return {
    lees: (tekst) => { laatsteTekst = tekst; return metReserve(() => vraag({ soort: 'lees', tekst, eigenDomeinen: OWN_DOMAINS_EXTRA, eigenOrg: OWN_ORG_NAME }), () => hier.lees(tekst)); },
    weken: (reeks) => metReserve(() => vraag({ soort: 'weken', weken: reeks }).then((u) => u.weken), async () => { if (!hier.gelezen()) await hier.lees(laatsteTekst); return hier.weken(reeks); }),
    stop: () => { werker.terminate(); hier.stop(); },
  };
}
// Reserve: inlezen in de app zelf (blokkeert even, maar werkt overal)
function lezerHier() {
  let stand = null;
  return {
    gelezen: () => !!stand,
    async lees(tekst) {
      const code = await laadIcalCode();
      stand = { code, reeksen: code.omzetter.voorbereid(tekst), kennis: code.leerUitIcal(tekst, OWN_DOMAINS_EXTRA) };
      return { eigenDomeinen: stand.kennis.eigenDomeinen };
    },
    async weken(reeks) {
      const uit = {};
      reeks.forEach(([van, tot]) => {
        uit[van] = stand.code.omzetter.uitrollen(stand.reeksen, new Date(van), new Date(tot)).map((e) => {
          const hint = e.organizer || e.attendees.length ? null : stand.code.hintVoor(e, stand.kennis, OWN_ORG_NAME);
          return hint ? { ...e, hint } : e;
        });
      });
      return uit;
    },
    stop() { stand = null; },
  };
}
// Een bestand (of de agenda achter een link) klaarzetten: { naam, datum, link, gecontroleerd, lezer, klaar, gelezen }
function nieuwBestand(b, { wachtEerst = 0 } = {}) {
  const best = { naam: b.naam, datum: b.datum, link: b.link || null, gecontroleerd: b.gecontroleerd || b.datum, lezer: maakLezer(), gelezen: false, eigenDomeinen: [] };
  best.klaar = new Promise((ok) => setTimeout(ok, wachtEerst))
    .then(() => best.lezer.lees(b.tekst))
    .then((r) => { best.gelezen = true; best.eigenDomeinen = r.eigenDomeinen || []; });
  return best;
}
function vervangBestand(best) {
  if (BESTAND && BESTAND !== best && BESTAND.lezer) BESTAND.lezer.stop();
  BESTAND = best;
}
async function gebruikBestand(b) {
  const best = nieuwBestand(b);
  await best.klaar;
  vervangBestand(best);
  DATA.ruw.clear(); DATA.weken.clear();
  DATA.me = null; DATA.ownDomains = best.eigenDomeinen;
}
// Snelle start: weken uit de bewaarde kopie, het bestand later
// Hoort de kopie bij een ouder bestand (de app werd gesloten vlak na het bijwerken), dan tonen we hem toch meteen
// en rollen we de weken na het inlezen opnieuw uit. Liever even de vorige stand dan een leeg scherm.
function startUitBewaard(b, kopie) {
  const verouderd = kopie.datum !== b.datum;
  const doel = nieuwBestand(b, { wachtEerst: verouderd ? 300 : 1500 }); // eerst tekenen, dan pas het zware werk
  vervangBestand(doel);
  kopie.events.forEach((e) => DATA.ruw.set(e.id, e));
  kopie.weken.forEach((w) => DATA.weken.add(w));
  DATA.me = null; DATA.ownDomains = kopie.eigenDomeinen || [];
  doel.klaar.then(async () => {
    if (!verouderd || BESTAND !== doel) return;
    const weken = [...DATA.weken].sort((x, y) => x - y);
    const uit = await doel.lezer.weken(weken.map((w) => [w, addDays(new Date(w), 7).getTime()]));
    if (BESTAND !== doel) return;
    DATA.ruw.clear();
    weken.forEach((w) => (uit[w] || []).forEach((e) => DATA.ruw.set(e.id, e)));
    DATA.ownDomains = doel.eigenDomeinen;
    bewaarWeken({ meteen: true });
    tekenNaBijwerken();
  }).catch(() => {});
}
let _bewaarTimer = null;
function bewaarWeken({ meteen = false } = {}) {
  clearTimeout(_bewaarTimer);
  _bewaarTimer = setTimeout(() => {
    if (!BESTAND) return;
    const t = startOfWeek(vandaag()).getTime();
    const grens = BEWAAR_WEKEN * 7 * 864e5;
    const weken = [...DATA.weken].filter((w) => Math.abs(w - t) < grens);
    const events = [...DATA.ruw.values()].filter((e) => Math.abs(new Date(e.start).getTime() - t) < grens);
    IDB.set('icsweken', { soort: KOPIE_SOORT, datum: BESTAND.datum, weken, events, eigenDomeinen: DATA.ownDomains }).catch(() => {});
  }, meteen ? 0 : 800);
}
async function laadUitBestand(van, tot) {
  const nodig = [];
  for (let w = startOfWeek(van); w < tot; w = addDays(w, 7)) if (!DATA.weken.has(w.getTime())) nodig.push(w);
  if (!nodig.length) return;
  const best = BESTAND;
  try { await best.klaar; } catch (e) { return; } // inlezen mislukt: houden wat er is
  if (best !== BESTAND) return; // intussen een ander bestand
  const uit = await best.lezer.weken(nodig.map((w) => [w.getTime(), addDays(w, 7).getTime()]));
  if (best !== BESTAND) return;
  nodig.forEach((w) => {
    if (DATA.weken.has(w.getTime())) return;
    (uit[w.getTime()] || []).forEach((e) => DATA.ruw.set(e.id, e));
    DATA.weken.add(w.getTime());
  });
  bewaarWeken();
}
async function openBestand(file) {
  if (!file) return;
  const tekst = await file.text();
  if (!/BEGIN:VCALENDAR/.test(tekst)) { alert('Dit is geen agenda-bestand. Kies een .ics-bestand.'); return; }
  const b = { naam: file.name, datum: Date.now(), tekst };
  try { await IDB.set('ics', b); } catch (e) { /* privévenster: dan alleen voor deze sessie */ }
  await gebruikBestand(b);
  laad();
}
/* Agenda-link (webcal) ------------------------------------------------ */
// De gepubliceerde agenda uit Outlook rechtstreeks ophalen. De link is geheim (wie hem heeft, ziet je agenda) en
// blijft daarom alleen op dit toestel, in IndexedDB bij het bestand. Nooit in de code of de repo.
const LINK_VERS_MS = 15 * 60 * 1000; // zo vaak kijken we of er iets is veranderd, zolang de app open is
const LINK_TIJD_MS = 90 * 1000; // Outlook kan traag zijn; langer dan dit wachten we niet
let LINK_BEZIG = false;
const httpsVan = (link) => link.trim().replace(/^webcals?:\/\//i, 'https://');
// Outlook zet bij elke keer ophalen een nieuwe DTSTAMP; die tellen we niet mee als wijziging
const zonderStempel = (t) => String(t || '').replace(/^DTSTAMP:.*$/gm, '');
async function haalLinkTekst(link) {
  const stop = new AbortController();
  const klok = setTimeout(() => stop.abort(), LINK_TIJD_MS);
  let r;
  try {
    r = await fetch(httpsVan(link), { cache: 'no-store', credentials: 'omit', signal: stop.signal });
  } catch (e) {
    clearTimeout(klok);
    if (navigator.onLine === false) throw new Error('Je bent offline. De app werkt je agenda bij zodra er weer verbinding is.');
    if (e.name === 'AbortError') throw new Error('Outlook reageert niet. De app probeert het over een kwartier opnieuw.');
    throw new Error('De app kan deze link niet ophalen. Klopt de link van je Cloudflare Worker?');
  }
  try {
    if (!r.ok) {
      // De Cloudflare Worker (cloudflare/worker.js) geeft een korte uitleg mee
      const uitleg = (await r.text().catch(() => '')).trim().slice(0, 120);
      if (r.status === 403) throw new Error('Geen toegang. Klopt de sleutel in de link?');
      if (r.status === 404 || /Outlook gaf fout 40[34]/.test(uitleg)) throw new Error('Outlook kent je agenda niet meer. Staat de publicatie in Outlook nog aan?');
      if (/Outlook gaf fout/.test(uitleg)) throw new Error('Outlook reageert niet goed. De app probeert het over een kwartier opnieuw.');
      throw new Error(uitleg && !/^</.test(uitleg) ? `${uitleg} (fout ${r.status}).` : `De link gaf fout ${r.status}.`);
    }
    const tekst = await r.text();
    if (!/BEGIN:VCALENDAR/.test(tekst)) throw new Error('Op deze link staat geen agenda (.ics).');
    return tekst;
  } finally {
    clearTimeout(klok);
  }
}

// Melding onderin: voortgang, klaar of een fout (met eventueel een knop)
let _statusTimer = null;
function toonStatus(tekst, { soort = 'bezig', actie = null, duur = 0 } = {}) {
  const m = $('#statusmelding');
  clearTimeout(_statusTimer);
  $('#statustekst').textContent = tekst;
  m.classList.toggle('bezig', soort === 'bezig');
  m.classList.toggle('fout', soort === 'fout');
  const knop = $('#statusactie');
  knop.hidden = !actie;
  if (actie) { knop.textContent = actie[0]; knop.onclick = () => { verbergStatus(); actie[1](); }; }
  m.hidden = false;
  requestAnimationFrame(() => m.classList.add('open'));
  if (duur) _statusTimer = setTimeout(verbergStatus, duur);
}
function verbergStatus() {
  const m = $('#statusmelding');
  clearTimeout(_statusTimer);
  m.classList.remove('open');
  setTimeout(() => { if (!m.classList.contains('open')) m.hidden = true; }, 250);
}

// Een nieuwe link: ophalen en inlezen gebeuren op de achtergrond; de app blijft bruikbaar
// De koppeling met je Cloudflare Worker (link met sleutel): voor je Outlook-agenda en om notities en ruimtes op al je
// toestellen te hebben. Hij staat los van de agenda: ook met een .ics-bestand synchroniseren notities en ruimtes.
// Alleen op dit toestel (localStorage). Een eerder opgegeven agenda-link neemt de app vanzelf over.
const KOPPELING_SLEUTEL = 'ag_koppeling';
function koppeling() {
  const l = LS.get(KOPPELING_SLEUTEL);
  if (l) return l;
  if (BESTAND && BESTAND.link) { LS.set(KOPPELING_SLEUTEL, BESTAND.link); return BESTAND.link; }
  return null;
}
const zetKoppeling = (l) => LS.set(KOPPELING_SLEUTEL, l.trim());
const vergeetKoppeling = () => LS.del(KOPPELING_SLEUTEL);

async function gebruikLink(link) {
  if (LINK_BEZIG) return;
  LINK_BEZIG = true;
  renderZijbalk();
  tekenSyncStatus(); // het ophalen staat bij Cloudflare
  toonStatus('Agenda ophalen… Dit kan even duren.');
  try {
    const tekst = await haalLinkTekst(link);
    toonStatus('Agenda inlezen…');
    const nu = Date.now();
    const b = { naam: 'Outlook-agenda', datum: nu, tekst, link: link.trim(), gecontroleerd: nu };
    zetKoppeling(link);
    try { await IDB.set('ics', b); } catch (e) { /* privévenster: dan alleen voor deze sessie */ }
    await IDB.del('icsweken').catch(() => {});
    await gebruikBestand(b);
    ST.naarVandaag = true;
    LINK_BEZIG = false;
    await laad();
    toonStatus('Je agenda is ingeladen.', { soort: 'klaar', duur: 2500 });
    synchroniseerStraks(500); // met de link kunnen ook de notities mee
  } catch (e) {
    toonStatus(e.message, { soort: 'fout', actie: ['Koppeling aanpassen', () => openLinkPaneel(link)] });
  } finally {
    LINK_BEZIG = false;
    renderZijbalk();
    tekenSyncStatus(); // het ophalen staat bij Cloudflare
  }
}

// Kijken of er iets is veranderd: bij het opstarten, elk kwartier zolang de app open is, bij terugkeer in de app
// en als de verbinding terugkomt. Is er iets veranderd, dan lezen we het nieuwe bestand naast het oude in en
// wisselen we pas als alles klaar is. Zo blijft de agenda in beeld en verspringt er niets.
async function vernieuwLink({ ookAlsVers = false } = {}) {
  if (LINK_BEZIG || !BESTAND || !BESTAND.link || document.visibilityState === 'hidden') return;
  if (!ookAlsVers && Date.now() - (BESTAND.gecontroleerd || 0) < LINK_VERS_MS) return;
  const oudBestand = BESTAND;
  LINK_BEZIG = true;
  renderZijbalk();
  tekenSyncStatus(); // het ophalen staat bij Cloudflare
  try {
    const oud = await IDB.get('ics').catch(() => null);
    if (!oud || oud.link !== oudBestand.link) return;
    const tekst = await haalLinkTekst(oud.link);
    const nu = Date.now();
    oudBestand.linkFout = null;
    if (zonderStempel(tekst) === zonderStempel(oud.tekst)) {
      // Niets veranderd: alleen het tijdstip bijwerken (het bewaarde bestand en de uitgerolde weken blijven geldig)
      oudBestand.gecontroleerd = nu;
      await IDB.set('ics', { ...oud, gecontroleerd: nu }).catch(() => {});
      return;
    }
    const b = { ...oud, tekst, datum: nu, gecontroleerd: nu };
    const nieuw = nieuwBestand(b);
    await nieuw.klaar;
    const weken = [...DATA.weken].sort((x, y) => x - y);
    const uit = await nieuw.lezer.weken(weken.map((w) => [w, addDays(new Date(w), 7).getTime()]));
    if (BESTAND !== oudBestand) { nieuw.lezer.stop(); return; } // intussen een ander bestand gekozen
    await IDB.set('ics', b).catch(() => {});
    vervangBestand(nieuw);
    DATA.ruw.clear();
    weken.forEach((w) => (uit[w] || []).forEach((e) => DATA.ruw.set(e.id, e)));
    DATA.ownDomains = nieuw.eigenDomeinen;
    bewaarWeken({ meteen: true }); // meteen: sluit je de app direct daarna, dan past de kopie toch bij het bestand
    tekenNaBijwerken();
  } catch (e) {
    oudBestand.linkFout = e.message;
  } finally {
    LINK_BEZIG = false;
    renderZijbalk();
    tekenSyncStatus(); // het ophalen staat bij Cloudflare
  }
}
// 'Nu bijwerken': hetzelfde als op de achtergrond, maar met een melding onderin
async function nuBijwerken() {
  if (LINK_BEZIG) return;
  toonStatus('Agenda bijwerken…');
  await vernieuwLink({ ookAlsVers: true });
  if (BESTAND && BESTAND.linkFout) toonStatus(BESTAND.linkFout, { soort: 'fout', actie: ['Koppeling aanpassen', () => openLinkPaneel()] });
  else toonStatus('Je agenda is bijgewerkt.', { soort: 'klaar', duur: 2000 });
}
const wisVraag = () => (BESTAND && BESTAND.link
  ? 'Je Outlook-agenda van dit toestel wissen? De app toont dan weer voorbeeldgegevens. In Outlook verandert er niets.'
  : 'Het agenda-bestand van dit toestel wissen? De app toont dan weer voorbeeldgegevens.');
async function vergeetBestand() {
  await IDB.del('ics').catch(() => {});
  await IDB.del('icsweken').catch(() => {});
  if (BESTAND && BESTAND.lezer) BESTAND.lezer.stop();
  BESTAND = null;
  DATA.ruw.clear(); DATA.weken.clear();
  laad();
}
// Zorg dat de weken van van t/m tot er zijn: uit je eigen agenda, of anders de voorbeeldgegevens
function zorgVoor(van, tot) {
  if (!BRON_BEKEND) return Promise.resolve();
  return BESTAND ? laadUitBestand(van, tot) : laadVoorbeeld(van, tot);
}
