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
// Labels zijn tags, zoals in Herinneringen van iOS: één woord in kleine letters (spaties worden streepjes), getoond met
// een hekje. Oudere labels met hoofdletters of spaties tonen we zo ook; bij vergelijken tellen hoofdletters en accenten niet.
const tagVan = (l) => String(l).replace(/[#,]/g, ' ').trim().toLowerCase().replace(/\s+/g, '-');
const tagSleutel = (l) => labelSleutel(tagVan(l));
const toonLabel = (l) => `#${tagVan(l)}`;
// Alle labels, de meest gebruikte eerst
function alleLabels() {
  const tel = new Map();
  levendeNotities().forEach((n) => n.labels.forEach((l) => {
    const k = tagSleutel(l);
    const t = tel.get(k) || { label: tagVan(l), n: 0 };
    t.n++; tel.set(k, t);
  }));
  return [...tel.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'nl')).map((t) => t.label);
}
// Een label dat al bestaat (ook met andere hoofdletters of accenten) houdt zijn bestaande schrijfwijze
function bestaandLabel(l) {
  const k = tagSleutel(l);
  return alleLabels().find((x) => tagSleutel(x) === k) || tagVan(l);
}

/* ------------------------------------------------------------------ */
/*  Tekst en datum                                                     */
/* ------------------------------------------------------------------ */

function notitieDatum(n) {
  const d = new Date(n.afspraak ? n.afspraak.start : n.gemaakt);
  const dag = `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${d.getFullYear() !== vandaag().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
  return n.afspraak ? `${dag}, ${hhmm(d)}` : dag;
}
// iPad en Mac: de lijst zoals in Notities van Apple, in groepen naar de laatste wijziging
const dagenGeleden = (ms) => Math.round((vandaag() - startOfDay(new Date(ms))) / 864e5);
function wijzigGroep(ms) {
  const dagen = dagenGeleden(ms), d = new Date(ms);
  if (dagen <= 0) return 'Vandaag';
  if (dagen === 1) return 'Gisteren';
  if (dagen < 7) return 'Afgelopen 7 dagen';
  if (dagen < 30) return 'Afgelopen 30 dagen';
  return d.getFullYear() === vandaag().getFullYear() ? cap(MONTHS_LONG[d.getMonth()]) : String(d.getFullYear());
}
function wijzigDatum(ms) {
  const dagen = dagenGeleden(ms), d = new Date(ms);
  if (dagen <= 0) return hhmm(d);
  if (dagen === 1) return 'Gisteren';
  if (dagen < 7) return cap(DAYS_LONG[d.getDay()]);
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}
// De titel van een notitie: bij een afspraak de titel van de afspraak, anders de eerste regel (zoals in Notities van
// Apple). Daarnaast een voorproef: de eerste regel tekst bij een afspraak, anders de tweede regel.
function notitieKop(n) {
  const regels = n.tekst.split('\n').map((r) => r.trim()).filter(Boolean);
  return n.afspraak ? [n.afspraak.titel || 'Zonder titel', regels[0] || ''] : [regels[0] || 'Nieuwe notitie', regels[1] || ''];
}
// Wat er op het scherm staat: bij een losse notitie de titel (groot, bovenaan) en daaronder de rest
function schermTekst(el) {
  const t = $('#nottitel', el), r = $('#nottekst', el);
  if (!r) return null;
  return t && t.value ? t.value + (r.value ? `\n${r.value}` : '') : r.value;
}
const labelChips = (labels) => (labels.length ? `<span class="nlabels">${labels.map((l) => `<span class="nlabel">${esc(toonLabel(l))}</span>`).join('')}</span>` : '');

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
  const meta = n.afspraak
    ? notitieDatum(n)
    : (() => { const d = new Date(n.gewijzigd || n.gemaakt); return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()} om ${hhmm(d)}`; })();
  // De titel groot bovenaan: van de afspraak, of bij een losse notitie de eerste regel, die je daar ook typt
  const labelHtml = `<div class="taglijn"><span class="tags" id="notlabels"></span><input id="notlabel" class="taginvoer" placeholder="Labels" aria-label="Labels" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"><div class="aanvullijst" id="notaanvul" hidden></div></div>`;
  const titelHtml = n.afspraak
    ? `<h2 class="dtitel">${esc(n.afspraak.titel || 'Zonder titel')}</h2>`
    : '<input id="nottitel" class="dtitel nottitel" placeholder="Titel" aria-label="Titel" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">';
  if (doel) el.innerHTML = `<div class="notblad">
      <div class="notbovenbalk"><span></span><div class="notmeta num">${meta}</div><div id="notvoet"></div></div>
      ${titelHtml}
      ${labelHtml}
      <textarea id="nottekst" placeholder="Notitie" aria-label="Notitie"></textarea>
    </div>`;
  else el.innerHTML = `${doel ? '' : `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>`}
    <div class="detailinhoud">
      <div class="dkop"><div class="dkopinhoud">${titelHtml}${n.afspraak ? `<div class="dmeta"><div class="num">${notitieDatum(n)}</div></div>` : ''}</div></div>
      ${labelHtml}
      <div class="formkaart tekstkaart">
        <label class="frij boven"><textarea id="nottekst" rows="8" placeholder="Notitie" aria-label="Notitie"></textarea></label>
      </div>
      <div class="dvoet" id="notvoet"></div>
    </div>`;
  const tekst = $('#nottekst', el), titelVeld = $('#nottitel', el), invoer = $('#notlabel', el);
  if (titelVeld) {
    const i = n.tekst.indexOf('\n');
    titelVeld.value = i < 0 ? n.tekst : n.tekst.slice(0, i);
    tekst.value = i < 0 ? '' : n.tekst.slice(i + 1);
  } else tekst.value = n.tekst;

  // Labels als tags op één regel: typ een woord en een spatie (of Enter), dan wordt het een tag in kleine letters.
  // Een tik op een tag kiest hem (met een kruisje), nog een tik haalt hem weg; Backspace in een leeg veld ook.
  let gekozenTag = -1;
  const tekenLabels = () => {
    $('#notlabels', el).innerHTML = n.labels.map((l, i) => (i === gekozenTag
      ? `<button type="button" class="tag aan" data-tag="${i}" aria-label="${esc(toonLabel(l))} weghalen">${esc(toonLabel(l))}${I.kruis}</button>`
      : `<button type="button" class="tag" data-tag="${i}">${esc(toonLabel(l))}</button>`)).join('');
    $('#notvoet', el).innerHTML = !NOTITIES.includes(n) ? ''
      : doel ? `<button class="notweg" data-actie="verwijder" aria-label="Notitie verwijderen">${I.wissen}</button>`
        : `<button class="groteknop rood" data-actie="verwijder">${I.wissen}Notitie verwijderen</button>`;
  };
  const zetLabels = (labels) => {
    gekozenTag = -1;
    wijzigNotitie(n, { labels });
    tekenLabels();
    if (bijWijziging) bijWijziging();
  };
  const voegTag = (t) => {
    if (!tagVan(t)) return;
    const tag = bestaandLabel(t);
    if (!n.labels.some((x) => tagSleutel(x) === tagSleutel(tag))) zetLabels([...n.labels, tag]);
  };
  const haalWeg = (i) => zetLabels(n.labels.filter((_, j) => j !== i));
  tekenLabels();

  // Een spatie of komma maakt van het woord ervoor een tag (vóór de voorstellen, zodat die het nette woord zien)
  invoer.addEventListener('input', () => {
    if (gekozenTag >= 0) { gekozenTag = -1; tekenLabels(); }
    if (!/[\s,]/.test(invoer.value)) return;
    const delen = invoer.value.split(/[\s,]+/);
    invoer.value = delen.pop();
    delen.forEach(voegTag);
  });
  // Voorstellen tijdens het typen: wat je typt bovenaan, daaronder bestaande labels; leeg: de organisatie en de meest gebruikte
  koppelSuggesties(invoer, $('#notaanvul', el), {
    vraagVan: (w) => tagVan(w),
    leegTonen: true,
    zoek: (vraag) => {
      const k = tagSleutel(vraag), gekozen = new Set(n.labels.map(tagSleutel));
      const bestaand = [...voorstelOrgs, ...alleLabels()].map(tagVan).filter((l, i, a) => a.findIndex((x) => tagSleutel(x) === tagSleutel(l)) === i)
        .filter((l) => !gekozen.has(tagSleutel(l)) && (!k || tagSleutel(l).includes(k)));
      const precies = bestaand.find((l) => tagSleutel(l) === k);
      const eerst = !k || gekozen.has(k) ? [] : [precies ? { t1: toonLabel(precies), label: precies } : { t1: toonLabel(vraag), t2: 'Nieuw label', label: vraag }];
      return { nu: [...eerst, ...bestaand.filter((l) => l !== precies).slice(0, 6).map((l) => ({ t1: toonLabel(l), label: l }))] };
    },
    kies: (c) => { voegTag(c.label); invoer.value = ''; },
  });
  invoer.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented || ev.isComposing) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (!invoer.value.trim()) { tekst.focus(); return; }
      voegTag(invoer.value);
      invoer.value = '';
      invoer.dispatchEvent(new Event('input')); // de voorstellen opnieuw
    } else if (ev.key === 'Backspace' && !invoer.value && n.labels.length) {
      ev.preventDefault();
      if (gekozenTag >= 0) haalWeg(gekozenTag); else { gekozenTag = n.labels.length - 1; tekenLabels(); }
    }
  });
  invoer.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement === invoer) return;
    if (invoer.value.trim()) { voegTag(invoer.value); invoer.value = ''; }
    else if (gekozenTag >= 0 && !el.contains(document.activeElement)) { gekozenTag = -1; tekenLabels(); }
  }, 160));

  // Meteen bewaren tijdens het typen; het tekstvak vult de ruimte van het scherm
  const bijTypen = () => {
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { tekst: schermTekst(el) });
    if (was !== NOTITIES.includes(n)) tekenLabels(); // de knop Verwijderen verschijnt of verdwijnt
    if (bijWijziging) bijWijziging();
  };
  tekst.addEventListener('input', bijTypen);
  if (titelVeld) {
    titelVeld.addEventListener('input', bijTypen);
    // Enter in de titel: verder in de tekst eronder. Backspace vooraan in de tekst: de eerste regel terug in de titel.
    titelVeld.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || ev.isComposing) return;
      ev.preventDefault();
      tekst.focus(); tekst.setSelectionRange(0, 0);
    });
    tekst.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Backspace' || tekst.selectionStart !== 0 || tekst.selectionEnd !== 0) return;
      ev.preventDefault();
      const i = tekst.value.indexOf('\n'), pos = titelVeld.value.length;
      titelVeld.value += i < 0 ? tekst.value : tekst.value.slice(0, i);
      tekst.value = i < 0 ? '' : tekst.value.slice(i + 1);
      titelVeld.focus(); titelVeld.setSelectionRange(pos, pos);
      bijTypen();
    });
  }

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
    const tag = t.closest('[data-tag]');
    if (tag) {
      const i = Number(tag.dataset.tag);
      if (gekozenTag === i) haalWeg(i);
      else { gekozenTag = i; tekenLabels(); if (isDesktop()) invoer.focus(); }
      return;
    }
    if (t.closest('.taglijn') && !t.closest('button')) invoer.focus(); // een tik naast de tags: verder typen
  });
  const eerst = titelVeld || tekst;
  if (!n.tekst && !isDesktop()) setTimeout(() => eerst.focus(), 350);
  else if (!n.tekst) eerst.focus();
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
const isLabel = (a, b) => !!a && !!b && tagSleutel(a) === tagSleutel(b);
const naastElkaar = () => isDesktop();

function zichtbareNotities() {
  const woorden = labelSleutel(notZoek).split(/\s+/).filter(Boolean);
  return levendeNotities()
    .filter((n) => !notLabel || n.labels.some((l) => isLabel(l, notLabel)))
    .filter((n) => {
      if (!woorden.length) return true;
      const hooi = labelSleutel([n.tekst, n.labels.map(toonLabel).join(' '), n.afspraak ? n.afspraak.titel : ''].join(' '));
      return woorden.every((w) => hooi.includes(w));
    })
    .sort((a, b) => b.gewijzigd - a.gewijzigd); // zoals Notities van Apple: de laatst gewijzigde bovenaan
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
  return labels.map((l) => `<button type="button" class="chip label${isLabel(l, notLabel) ? ' aan' : ''}" data-label="${esc(l)}" aria-pressed="${isLabel(l, notLabel)}">${esc(toonLabel(l))}</button>`).join('');
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
  // In groepen naar de laatste wijziging (Vandaag, Gisteren, ...), zoals in Notities van Apple. Op iPad en Mac een lijst
  // met strepen naast de notitie; op de iPhone een kaart per groep, met een pijltje naar de notitie.
  const groepen = [];
  for (const n of lijst) {
    const g = wijzigGroep(n.gewijzigd);
    if (!groepen.length || groepen[groepen.length - 1].naam !== g) groepen.push({ naam: g, notities: [] });
    groepen[groepen.length - 1].notities.push(n);
  }
  const rij = (n) => {
    const [titel, voorproef] = notitieKop(n);
    const inhoud = `<span class="t1">${esc(titel)}</span>
        <span class="t2"><span class="ndatum">${esc(wijzigDatum(n.gewijzigd))}</span>${esc(voorproef || 'Geen extra tekst')}</span>${labelChips(n.labels)}`;
    if (!naastElkaar()) return `<button class="drij notitierij" data-notitie="${n.id}"><span class="tekst">${inhoud}</span>${I.verder}</button>`;
    const aan = !!gekozen && gekozen.id === n.id;
    return `<button class="notitierij${aan ? ' aan' : ''}" data-notitie="${n.id}" aria-pressed="${aan}">${inhoud}</button>`;
  };
  return groepen.map((g) => `<h3 class="ngroep">${g.naam}</h3><div class="${naastElkaar() ? 'ngroeplijst' : 'kaart'}">${g.notities.map(rij).join('')}</div>`).join('');
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
  const opScherm = schermTekst(vak);
  if (vak.dataset.id !== (n ? n.id : '') || (n && !bezig && opScherm !== null && opScherm !== n.tekst)) vulNotitiepaneel();
}
// Een nieuwe notitie: op iPad en Mac in de tab Notities meteen rechts, anders als paneel
function nieuweNotitie() {
  if (ST.tab === 'notities' && naastElkaar()) {
    bewaarNotities({ meteen: true });
    notNieuw = maakNotitie();
    tekenNotities();
    const t = $('#notipaneel #nottitel') || $('#notipaneel #nottekst');
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
