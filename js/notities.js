// Agenda, notities
// Eigen notities: bij een afspraak of los, met labels. Ze staan op het toestel in IndexedDB ('notities').
// Elke notitie draagt een eigen id, een tijdstip van wijzigen en bij verwijderen een markering (weg), zodat ze
// via de Worker tussen toestellen worden gesynchroniseerd (js/synchroniseren.js): per notitie wint de laatste wijziging.
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
  synchroniseerStraks(); // kort daarna naar de Worker
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
// Een nieuwe notitie komt pas in de lijst als er iets in staat; een lege notitie verdwijnt weer. Stond hij al in de
// Worker, dan wordt hij gemarkeerd als verwijderd, zodat hij ook op de andere toestellen verdwijnt.
function wijzigNotitie(n, velden) {
  Object.assign(n, velden, { gewijzigd: Date.now() });
  const i = NOTITIES.indexOf(n);
  if (notitieLeeg(n)) {
    if (i >= 0 && n.gesynct) n.weg = true;
    else if (i >= 0) NOTITIES.splice(i, 1);
  } else {
    n.weg = false;
    if (i < 0) NOTITIES.push(n);
  }
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
// doel: op iPad en Mac staat de notitie in de tab Notities naast de lijst, in dit vak, zonder paneel.
// bijWijziging: wordt aangeroepen bij elke wijziging, zodat de lijst ernaast meeloopt.
async function openNotitie({ notitie = null, e = null, klaar = null, doel = null, bijWijziging = null } = {}) {
  await laadNotities();
  const n = notitie || (e && notitieBij(e.id)) || maakNotitie(e);
  const voorstelOrgs = e && e.external ? e.orgs || [] : [];

  const el = doel || document.createElement('div');
  if (!doel) {
    el.className = 'paneel detail nieuw notitie' + (isDesktop() ? ' dialoog' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Notitie');
  }
  const kop = n.afspraak
    ? `<div class="dmeta"><div>${esc(n.afspraak.titel || 'Zonder titel')}</div><div class="num">${notitieDatum(n)}</div></div>`
    : '';
  el.innerHTML = `${doel ? '' : `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>`}
    <div class="detailinhoud">
      <div class="dkop"><div class="dkopinhoud"><h2 class="dtitel">${doel && n.afspraak ? esc(n.afspraak.titel || 'Zonder titel') : 'Notitie'}</h2>${doel && n.afspraak ? `<div class="dmeta"><div class="num">${notitieDatum(n)}</div></div>` : kop}</div></div>
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
    if (bijWijziging) bijWijziging();
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
    if (bijWijziging) bijWijziging();
  });

  const p = doel ? null : openPaneel(el, { greepSelector: '.detailgreep', naSluiten: () => { bewaarNotities({ meteen: true }); tekenNotities(); if (klaar) klaar(); } });
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]') && p) { p.sluit(); return; }
    if (t.closest('[data-actie="verwijder"]')) {
      if (!confirm('Deze notitie verwijderen?')) return;
      verwijderNotitie(n);
      if (p) p.sluit(); else if (klaar) klaar();
      return;
    }
    const weg = t.closest('[data-weg]');
    if (weg) { wijzigNotitie(n, { labels: n.labels.filter((_, i) => i !== Number(weg.dataset.weg)) }); tekenLabels(); if (bijWijziging) bijWijziging(); return; }
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
/*  Tab Notities: zoeken op tekst (in de kop), filteren op label       */
/* ------------------------------------------------------------------ */

let notZoek = '';
let notLabel = null;
let notGekozen = null; // iPad en Mac: de notitie rechts naast de lijst
let notNieuw = null; // een nieuwe notitie rechts die nog leeg is (en dus nog niet in de lijst staat)
const isLabel = (a, b) => !!a && !!b && labelSleutel(a) === labelSleutel(b);
const naastElkaar = () => isDesktop();

function zichtbareNotities() {
  const woorden = labelSleutel(notZoek).split(/\s+/).filter(Boolean);
  return levendeNotities()
    .filter((n) => !notLabel || n.labels.some((l) => isLabel(l, notLabel)))
    .filter((n) => {
      if (!woorden.length) return true;
      const hooi = labelSleutel([n.tekst, n.labels.join(' '), n.afspraak ? n.afspraak.titel : ''].join(' '));
      return woorden.every((w) => hooi.includes(w));
    })
    .sort((a, b) => (b.afspraak ? b.afspraak.start : b.gemaakt) - (a.afspraak ? a.afspraak.start : a.gemaakt));
}
// De notitie rechts: een nieuwe, de gekozen, of anders de bovenste uit de lijst
function gekozenNotitie() {
  if (notNieuw && NOTITIES.includes(notNieuw) && !notNieuw.weg) { notGekozen = notNieuw.id; notNieuw = null; }
  if (notNieuw) return notNieuw;
  const lijst = zichtbareNotities();
  const n = lijst.find((x) => x.id === notGekozen) || lijst[0] || null;
  notGekozen = n ? n.id : null;
  return n;
}
function filterHtml() {
  const labels = alleLabels();
  if (notLabel && !labels.some((l) => isLabel(l, notLabel))) notLabel = null;
  return labels.map((l) => `<button type="button" class="chip label${isLabel(l, notLabel) ? ' aan' : ''}" data-label="${esc(l)}" aria-pressed="${isLabel(l, notLabel)}">${esc(l)}</button>`).join('');
}
function notitiesHtml() {
  const filter = `<div class="chips nfilter" id="notfilter">${filterHtml()}</div>`;
  if (!naastElkaar()) return `<div class="notitab">${filter}<div id="notlijst">${notitieLijstHtml()}</div></div>`;
  return `<div class="notitab notisplit"><div class="notilinks">${filter}<div id="notlijst">${notitieLijstHtml()}</div></div><div class="notipaneel" id="notipaneel"></div></div>`;
}
function notitieLijstHtml() {
  const lijst = zichtbareNotities();
  const gekozen = naastElkaar() ? gekozenNotitie() : null;
  if (!lijst.length) return `<p class="nleeg nlijstleeg">${levendeNotities().length ? 'Niets gevonden' : 'Nog geen notities'}</p>`;
  return `<div class="kaart">${lijst.map((n) => `<button class="drij notitierij${gekozen && gekozen.id === n.id ? ' aan' : ''}" data-notitie="${n.id}"${naastElkaar() ? ` aria-pressed="${!!gekozen && gekozen.id === n.id}"` : ''}>
      <span class="tekst"><div class="t1">${esc(eersteRegel(n.tekst) || 'Zonder tekst')}</div>
      <div class="t2 num">${esc(notitieDatum(n))}${n.afspraak ? ` · ${esc(n.afspraak.titel || 'Zonder titel')}` : ''}</div>${labelChips(n.labels)}</span>${I.verder}</button>`).join('')}</div>`;
}
// Het vak rechts opnieuw vullen (een nieuw element, zodat er geen oude luisteraars blijven hangen)
function vulNotitiepaneel() {
  const oud = $('#notipaneel');
  if (!oud) return;
  const vak = oud.cloneNode(false);
  oud.replaceWith(vak);
  const n = gekozenNotitie();
  vak.dataset.id = n ? n.id : '';
  if (!n) { vak.innerHTML = `<p class="nleeg nlijstleeg">${levendeNotities().length ? 'Niets gevonden' : 'Nog geen notities'}</p>`; return; }
  openNotitie({ notitie: n, doel: vak, bijWijziging: () => tekenNotities(), klaar: () => { notGekozen = null; notNieuw = null; tekenNotities(); } });
}
// Opnieuw tekenen als de tab Notities in beeld is. Staat de lijst er al, dan alleen de lijst en de labels: zo blijft
// de notitie rechts staan terwijl je typt (ook als er intussen iets via de Worker binnenkomt).
function tekenNotities(volledig = false) {
  if (ST.tab !== 'notities') return;
  const main = $('#inhoud');
  if (volledig || !$('#notlijst', main) || !!$('#notipaneel', main) !== naastElkaar()) {
    main.innerHTML = notitiesHtml();
    if (naastElkaar()) vulNotitiepaneel();
    return;
  }
  $('#notfilter', main).innerHTML = filterHtml();
  $('#notlijst', main).innerHTML = notitieLijstHtml();
  if (!naastElkaar()) return;
  const vak = $('#notipaneel', main);
  const n = gekozenNotitie();
  const bezig = vak.contains(document.activeElement);
  const tekst = $('#nottekst', vak);
  if (vak.dataset.id !== (n ? n.id : '') || (n && !bezig && tekst && tekst.value !== n.tekst)) vulNotitiepaneel();
}
// Een nieuwe notitie: op iPad en Mac in de tab Notities meteen rechts, anders als paneel
function nieuweNotitie() {
  if (ST.tab === 'notities' && naastElkaar()) {
    bewaarNotities({ meteen: true });
    notNieuw = maakNotitie();
    tekenNotities();
    const t = $('#notipaneel #nottekst');
    if (t) t.focus();
    return;
  }
  openNotitie();
}
$('#notzoek').addEventListener('input', (ev) => {
  notZoek = ev.target.value;
  const l = $('#notlijst');
  if (l) l.innerHTML = notitieLijstHtml();
});
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#inhoud .notitab') || ev.target.closest('#notipaneel')) return;
  const f = ev.target.closest('[data-label]');
  if (f) { notLabel = isLabel(notLabel, f.dataset.label) ? null : f.dataset.label; tekenNotities(); return; }
  const r = ev.target.closest('[data-notitie]');
  if (!r) return;
  if (naastElkaar()) { bewaarNotities({ meteen: true }); notGekozen = r.dataset.notitie; notNieuw = null; tekenNotities(); }
  else openNotitie({ notitie: NOTITIES.find((n) => n.id === r.dataset.notitie) });
});
