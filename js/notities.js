// Agenda, notities
// Eigen notities: bij een afspraak of los, met labels. Ze staan op het toestel in IndexedDB ('notities').
// Elke notitie draagt een eigen id, een tijdstip van wijzigen en bij verwijderen een markering (weg), zodat ze
// later via de Worker tussen toestellen kunnen worden gesynchroniseerd: per notitie wint de laatste wijziging.
// Gewoon script (geen module): het gebruikt openPaneel, esc en de iconen uit de andere bestanden.
'use strict';

/* ------------------------------------------------------------------ */
/*  Opslag                                                             */
/* ------------------------------------------------------------------ */

// { id, tekst, labels: [], afspraak: { id, titel, start, end } | null, gemaakt, gewijzigd, weg }
let NOTITIES = [];
let notitiesGeladen = null;
function laadNotities() {
  if (!notitiesGeladen) {
    notitiesGeladen = IDB.get('notities')
      .then((l) => { NOTITIES = Array.isArray(l) ? l : []; })
      .catch(() => { NOTITIES = []; });
  }
  return notitiesGeladen;
}
let _notitieTimer = null;
function bewaarNotities({ meteen = false } = {}) {
  clearTimeout(_notitieTimer);
  const doe = () => IDB.set('notities', NOTITIES).catch(() => { /* privévenster: alleen voor deze sessie */ });
  if (meteen) doe(); else _notitieTimer = setTimeout(doe, 400);
  if (isDesktop()) renderZijbalk(); // het aantal onder Notities
}
const nieuwId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const levendeNotities = () => NOTITIES.filter((n) => !n.weg);
const notitieBij = (afspraakId) => levendeNotities().find((n) => n.afspraak && n.afspraak.id === afspraakId) || null;
const notitieLeeg = (n) => !n.tekst.trim() && !n.labels.length;

function maakNotitie(e = null) {
  const nu = Date.now();
  return {
    id: nieuwId(), tekst: '', labels: [],
    afspraak: e ? { id: e.id, titel: e.title || '', start: +e.start, end: +e.end } : null,
    gemaakt: nu, gewijzigd: nu, weg: false,
  };
}
// Een nieuwe notitie komt pas in de lijst als er iets in staat; een lege notitie verdwijnt weer
function wijzigNotitie(n, velden) {
  Object.assign(n, velden, { gewijzigd: Date.now() });
  const i = NOTITIES.indexOf(n);
  if (notitieLeeg(n)) { if (i >= 0) NOTITIES.splice(i, 1); }
  else if (i < 0) NOTITIES.push(n);
  bewaarNotities();
}
function verwijderNotitie(n) {
  // Niet echt weghalen: de markering gaat straks mee naar de andere toestellen
  Object.assign(n, { tekst: '', labels: [], weg: true, gewijzigd: Date.now() });
  if (!NOTITIES.includes(n)) return;
  bewaarNotities({ meteen: true });
}

/* ------------------------------------------------------------------ */
/*  Labels                                                             */
/* ------------------------------------------------------------------ */

const labelSleutel = (l) => l.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const netLabel = (l) => l.replace(/\s+/g, ' ').trim();
// Alle labels, de meest gebruikte eerst
function alleLabels() {
  const tel = new Map();
  levendeNotities().forEach((n) => n.labels.forEach((l) => {
    const k = labelSleutel(l);
    const t = tel.get(k) || { label: l, n: 0 };
    t.n++; tel.set(k, t);
  }));
  return [...tel.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'nl')).map((t) => t.label);
}
// Een label dat al bestaat (ook met andere hoofdletters of accenten) houdt zijn bestaande schrijfwijze
function bestaandLabel(l) {
  const k = labelSleutel(l);
  return alleLabels().find((x) => labelSleutel(x) === k) || netLabel(l);
}

/* ------------------------------------------------------------------ */
/*  Tekst en datum                                                     */
/* ------------------------------------------------------------------ */

const eersteRegel = (t) => (t.split('\n').find((r) => r.trim()) || '').trim();
function notitieDatum(n) {
  const d = new Date(n.afspraak ? n.afspraak.start : n.gemaakt);
  const dag = `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${d.getFullYear() !== vandaag().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
  return n.afspraak ? `${dag}, ${hhmm(d)}` : dag;
}
const labelChips = (labels) => (labels.length ? `<span class="nlabels">${labels.map((l) => `<span class="nlabel">${esc(l)}</span>`).join('')}</span>` : '');

/* ------------------------------------------------------------------ */
/*  Notitie bewerken                                                   */
/* ------------------------------------------------------------------ */

// e: de afspraak (bij een nieuwe notitie bij een afspraak). klaar: wordt aangeroepen als het scherm dichtgaat.
async function openNotitie({ notitie = null, e = null, klaar = null } = {}) {
  await laadNotities();
  const n = notitie || (e && notitieBij(e.id)) || maakNotitie(e);
  const voorstelOrgs = e && e.external ? e.orgs || [] : [];

  const el = document.createElement('div');
  el.className = 'paneel detail nieuw notitie' + (isDesktop() ? ' dialoog' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Notitie');
  const kop = n.afspraak
    ? `<div class="dmeta"><div>${esc(n.afspraak.titel || 'Zonder titel')}</div><div class="num">${notitieDatum(n)}</div></div>`
    : '';
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><div class="dkopinhoud"><h2 class="dtitel">Notitie</h2>${kop}</div></div>
      <div class="formkaart tekstkaart">
        <label class="frij boven"><textarea id="nottekst" rows="8" placeholder="Notitie" aria-label="Notitie"></textarea></label>
      </div>
      <div class="formkaart">
        <label class="frij"><span class="flabel">Labels</span><input id="notlabel" placeholder="Label toevoegen" autocomplete="off" autocapitalize="sentences" enterkeyhint="done"></label>
        <div class="aanvullijst" id="notaanvul" hidden></div>
        <div class="frij kolom" id="notlabelrij" hidden><div class="chips" id="notlabels"></div></div>
      </div>
      <div class="dvoet" id="notvoet"></div>
    </div>`;
  const tekst = $('#nottekst', el), invoer = $('#notlabel', el);
  tekst.value = n.tekst;

  // Gekozen labels als chips met een kruisje; daarachter voorstellen: de organisatie van het overleg en de meest gebruikte labels
  const tekenLabels = () => {
    const gekozen = new Set(n.labels.map(labelSleutel));
    const voorstel = [...voorstelOrgs, ...alleLabels()].filter((l, i, a) => !gekozen.has(labelSleutel(l)) && a.findIndex((x) => labelSleutel(x) === labelSleutel(l)) === i).slice(0, 6);
    $('#notlabels', el).innerHTML = n.labels.map((l, i) => `<button type="button" class="chip label aan" data-weg="${i}" aria-label="Label ${esc(l)} weghalen">${esc(l)}${I.kruis}</button>`).join('')
      + voorstel.map((l) => `<button type="button" class="chip label voorstel" data-voeg="${esc(l)}" aria-label="Label ${esc(l)} toevoegen">${I.plus}${esc(l)}</button>`).join('');
    $('#notlabelrij', el).hidden = !n.labels.length && !voorstel.length;
    $('#notvoet', el).innerHTML = NOTITIES.includes(n) ? `<button class="groteknop rood" data-actie="verwijder">${I.wissen}Notitie verwijderen</button>` : '';
  };
  const voegLabel = (l) => {
    const label = bestaandLabel(l);
    if (!label || n.labels.some((x) => labelSleutel(x) === labelSleutel(label))) return;
    wijzigNotitie(n, { labels: [...n.labels, label] });
    tekenLabels();
  };
  tekenLabels();

  // Typen in het labelveld: eerst bestaande labels; bestaat het nog niet, dan als nieuw label
  koppelSuggesties(invoer, $('#notaanvul', el), {
    zoek: (vraag) => {
      const k = labelSleutel(vraag);
      const gekozen = new Set(n.labels.map(labelSleutel));
      const bestaand = [...voorstelOrgs, ...alleLabels()].filter((l, i, a) => a.findIndex((x) => labelSleutel(x) === labelSleutel(l)) === i)
        .filter((l) => !gekozen.has(labelSleutel(l)) && labelSleutel(l).includes(k)).slice(0, 6)
        .map((l) => ({ t1: l, label: l }));
      const nieuw = !bestaand.some((c) => labelSleutel(c.label) === k) && !gekozen.has(k) ? [{ t1: netLabel(vraag), t2: 'Nieuw label', label: netLabel(vraag) }] : [];
      return { nu: [...bestaand, ...nieuw] };
    },
    kies: (c) => { voegLabel(c.label); invoer.value = ''; },
  });
  invoer.addEventListener('keydown', (ev) => {
    // Enter zonder gekozen voorstel: het getypte label toevoegen
    if (ev.key === 'Enter' && !ev.defaultPrevented && invoer.value.trim()) {
      ev.preventDefault();
      voegLabel(invoer.value);
      invoer.value = '';
      invoer.dispatchEvent(new Event('input')); // de voorstellen sluiten
    }
  });

  // Meteen bewaren tijdens het typen; het tekstvak vult de ruimte van het scherm
  tekst.addEventListener('input', () => {
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { tekst: tekst.value });
    if (was !== NOTITIES.includes(n)) tekenLabels(); // de knop Verwijderen verschijnt of verdwijnt
  });

  const p = openPaneel(el, { greepSelector: '.detailgreep', naSluiten: () => { bewaarNotities({ meteen: true }); if (klaar) klaar(); } });
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    if (t.closest('[data-actie="verwijder"]')) {
      if (!confirm('Deze notitie verwijderen?')) return;
      verwijderNotitie(n);
      p.sluit();
      return;
    }
    const weg = t.closest('[data-weg]');
    if (weg) { wijzigNotitie(n, { labels: n.labels.filter((_, i) => i !== Number(weg.dataset.weg)) }); tekenLabels(); return; }
    const voeg = t.closest('[data-voeg]');
    if (voeg) voegLabel(voeg.dataset.voeg);
  });
  if (!n.tekst && !isDesktop()) setTimeout(() => tekst.focus(), 350);
  else if (!n.tekst) tekst.focus();
}

/* ------------------------------------------------------------------ */
/*  In het detailscherm van een afspraak                               */
/* ------------------------------------------------------------------ */

function notitieSectieHtml(e) {
  const n = notitieBij(e.id);
  if (!n) return ''; // toevoegen kan met het knopje bovenin
  return `<section class="sectie"><h3>Mijn notitie</h3><div class="kaart"><button class="drij notitierij" data-actie="eigennotitie">
    <span class="tekst"><div class="nkort">${esc(n.tekst.trim())}</div>${labelChips(n.labels)}</span>${I.verder}</button></div></section>`;
}

/* ------------------------------------------------------------------ */
/*  Overzicht: zoeken op tekst, filteren op label                      */
/* ------------------------------------------------------------------ */

async function openNotitielijst() {
  await laadNotities();
  let label = null;
  const el = document.createElement('div');
  el.className = 'paneel detail nieuw notitielijst' + (isDesktop() ? ' dialoog' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Notities');
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="nieuwe" aria-label="Nieuwe notitie">${I.plus}</button><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><h2 class="dtitel">Notities</h2><button class="rond kopknop" data-actie="nieuwe" aria-label="Nieuwe notitie">${I.plus}</button></div>
      <div class="formkaart"><label class="frij"><input id="notzoek" type="search" placeholder="Zoeken" aria-label="Zoeken in notities" autocomplete="off" enterkeyhint="search"></label></div>
      <div class="chips nfilter" id="notfilter"></div>
      <div id="notlijst"></div>
    </div>`;
  const zoek = $('#notzoek', el);
  const teken = () => {
    const labels = alleLabels();
    if (label && !labels.some((l) => labelSleutel(l) === labelSleutel(label))) label = null;
    $('#notfilter', el).innerHTML = labels.map((l) => `<button type="button" class="chip label${label && labelSleutel(l) === labelSleutel(label) ? ' aan' : ''}" data-filter="${esc(l)}" aria-pressed="${!!label && labelSleutel(l) === labelSleutel(label)}">${esc(l)}</button>`).join('');
    const woorden = labelSleutel(zoek.value).split(/\s+/).filter(Boolean);
    const lijst = levendeNotities()
      .filter((n) => !label || n.labels.some((l) => labelSleutel(l) === labelSleutel(label)))
      .filter((n) => {
        if (!woorden.length) return true;
        const hooi = labelSleutel([n.tekst, n.labels.join(' '), n.afspraak ? n.afspraak.titel : ''].join(' '));
        return woorden.every((w) => hooi.includes(w));
      })
      .sort((a, b) => (b.afspraak ? b.afspraak.start : b.gemaakt) - (a.afspraak ? a.afspraak.start : a.gemaakt));
    $('#notlijst', el).innerHTML = lijst.length
      ? `<div class="kaart">${lijst.map((n) => `<button class="drij notitierij" data-notitie="${n.id}">
          <span class="tekst"><div class="t1">${esc(eersteRegel(n.tekst) || 'Zonder tekst')}</div>
          <div class="t2 num">${esc(notitieDatum(n))}${n.afspraak ? ` · ${esc(n.afspraak.titel || 'Zonder titel')}` : ''}</div>${labelChips(n.labels)}</span>${I.verder}</button>`).join('')}</div>`
      : `<p class="nleeg nlijstleeg">${levendeNotities().length ? 'Niets gevonden' : 'Nog geen notities'}</p>`;
  };
  teken();
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  zoek.addEventListener('input', teken);
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    if (t.closest('[data-actie="nieuwe"]')) { openNotitie({ klaar: teken }); return; }
    const f = t.closest('[data-filter]');
    if (f) { label = label && labelSleutel(label) === labelSleutel(f.dataset.filter) ? null : f.dataset.filter; teken(); return; }
    const r = t.closest('[data-notitie]');
    if (r) openNotitie({ notitie: NOTITIES.find((n) => n.id === r.dataset.notitie), klaar: teken });
  });
}

// De rij onder de kalender (weekkiezer en zijbalk), boven Instellingen
function notitiesRijHtml() {
  const aantal = levendeNotities().length;
  return `<button class="instrij" data-actie="notitielijst">${I.notitie}<span class="tekst"><span class="t1">Notities</span><span class="t2">${aantal === 1 ? '1 notitie' : aantal ? `${aantal} notities` : 'Nog geen notities'}</span></span>${I.verder}</button>`;
}
