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
// Actiepunten staan in de notitie zelf: { id, tekst, klaar, deadline ('jjjj-mm-dd' of null) }. Een los actiepunt is een
// notitie met alleen dat punt. Zo blijven de koppelingen met de notitie, het overleg en de labels vanzelf bewaard.
const punten = (n) => (Array.isArray(n.punten) ? n.punten : []);
const openPunten = (n) => punten(n).filter((p) => !p.klaar && p.tekst.trim());
const notitieLeeg = (n) => !n.tekst.trim() && !n.labels.length && !punten(n).some((p) => p.tekst.trim());
const maakPunt = (tekst = '') => ({ id: nieuwId(), tekst, klaar: false, deadline: null });

function maakNotitie(e = null) {
  const nu = Date.now();
  return {
    id: nieuwId(), tekst: '', labels: [], punten: [],
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
  Object.assign(n, { tekst: '', labels: [], punten: [], weg: true, gewijzigd: Date.now() });
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

// Het moment waar een notitie bij hoort: de afspraak, of bij een losse notitie de laatste wijziging. De lijst en de
// notitie zelf tonen allebei dit moment, zodat je een terugkerend overleg aan de datum herkent.
const notitieMoment = (n) => new Date(n.afspraak ? n.afspraak.start : (n.gewijzigd || n.gemaakt));
function notitieDatum(n) {
  const d = notitieMoment(n);
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()} om ${hhmm(d)}`;
}
// iPad en Mac: de lijst zoals in Notities van Apple, in groepen naar de laatste wijziging
const dagenGeleden = (ms) => Math.round((vandaag() - startOfDay(new Date(ms))) / 864e5);
function wijzigGroep(ms) {
  const dagen = dagenGeleden(ms), d = new Date(ms);
  if (dagen < 0) return 'Binnenkort'; // een notitie bij een afspraak die nog moet komen
  if (dagen === 0) return 'Vandaag';
  if (dagen === 1) return 'Gisteren';
  if (dagen < 7) return 'Afgelopen 7 dagen';
  if (dagen < 30) return 'Afgelopen 30 dagen';
  return d.getFullYear() === vandaag().getFullYear() ? cap(MONTHS_LONG[d.getMonth()]) : String(d.getFullYear());
}
function wijzigDatum(ms, plat = false) {
  const dagen = dagenGeleden(ms), d = new Date(ms);
  if (dagen === 0 || (dagen === 1 && !plat)) return hhmm(d); // het kopje zegt al Vandaag of Gisteren
  if (dagen === 1) return 'Gisteren'; // in één lijst zonder kopjes
  if (dagen === -1) return 'Morgen'; // een notitie bij een afspraak die nog moet komen
  if (Math.abs(dagen) < 7) return cap(DAYS_LONG[d.getDay()]);
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}
// De titel van een notitie: bij een afspraak de titel van de afspraak, anders de eerste regel (zoals in Notities van
// Apple). Daarnaast een voorproef: de eerste regel tekst bij een afspraak, anders de tweede regel.
function notitieKop(n) {
  const regels = n.tekst.split('\n').map((r) => r.trim()).filter(Boolean);
  const open = openPunten(n).length;
  const metPunten = (t) => t || (open ? (open === 1 ? '1 open actiepunt' : `${open} open actiepunten`) : '');
  if (n.afspraak) return [n.afspraak.titel || 'Zonder titel', metPunten(regels[0])];
  if (!regels.length && punten(n).some((p) => p.tekst.trim())) return [punten(n).find((p) => p.tekst.trim()).tekst.trim(), open > 1 ? `${open} open actiepunten` : ''];
  return [regels[0] || 'Nieuwe notitie', metPunten(regels[1])];
}
// Wat er op het scherm staat: bij een losse notitie de titel (groot, bovenaan) en daaronder de rest
function schermTekst(el) {
  const t = $('#nottitel', el), r = $('#nottekst', el);
  if (!r) return null;
  return t && t.value ? t.value + (r.value ? `\n${r.value}` : '') : r.value;
}
// Een deadline kort: vandaag, morgen, de dag van de week, of de datum
const deadlineDag = (d) => { const [j, m, g] = d.split('-').map(Number); return new Date(j, m - 1, g); };
function deadlineTekst(d) {
  const dag = deadlineDag(d), dagen = Math.round((dag - vandaag()) / 864e5);
  if (dagen === 0) return 'Vandaag';
  if (dagen === 1) return 'Morgen';
  if (dagen === -1) return 'Gisteren';
  if (dagen > 1 && dagen < 7) return cap(DAYS_LONG[dag.getDay()]);
  return `${dag.getDate()} ${MONTHS_SHORT[dag.getMonth()]}${dag.getFullYear() !== vandaag().getFullYear() ? ` ${dag.getFullYear()}` : ''}`;
}
const teLaat = (d) => !!d && deadlineDag(d) < vandaag();
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

  // Drie vormen: in de tab Notities op iPad en Mac rechts naast de lijst (doel), op iPad en Mac verder als venster,
  // en op de iPhone als eigen scherm dat van rechts inschuift (zoals Notities van iOS): omlaag vegen sluit dan niets.
  const pagina = !doel && (!isDesktop() || ST.tab === 'notities');
  const el = doel || document.createElement('div');
  if (!doel) {
    el.className = pagina ? 'notpagina notitie' : 'paneel detail nieuw notitie dialoog';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Notitie');
  }
  const meta = notitieDatum(n);
  // De titel groot bovenaan: van de afspraak, of bij een losse notitie de eerste regel, die je daar ook typt.
  // Labels en actiepunten verschijnen pas als er iets in staat; tot die tijd staan er alleen twee knopjes.
  // Labels en actiepunten typ je in de notitie zelf (#label, ! actiepunt); hun regels verschijnen pas als ze er zijn
  const labelHtml = '<div class="tags" id="notlabels"></div>';
  const titelHtml = n.afspraak
    ? `<h2 class="dtitel">${esc(n.afspraak.titel || 'Zonder titel')}</h2>`
    : '<input id="nottitel" class="dtitel nottitel" placeholder="Titel" aria-label="Titel" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">';
  const blad = `<div class="notblad">
      ${doel ? `<div class="notbovenbalk"><span></span><div class="notmeta num">${meta}</div><div id="notvoet"></div></div>` : `<div class="notmeta num">${meta}</div>`}
      ${titelHtml}
      <div class="notsectie" id="notlabelsectie">${labelHtml}</div>
      <div class="notsectie" id="notpuntsectie"><div class="punten" id="notpunten"></div></div>
      <textarea id="nottekst" placeholder="Notitie, #label of ! actiepunt" aria-label="Notitie"></textarea>
    </div>`;
  const menuKnop = (klasse) => `<button class="rond ${klasse}" data-actie="notmenu" aria-label="Meer" aria-haspopup="menu">${I.meer}</button>`;
  if (doel) el.innerHTML = blad;
  else if (pagina) el.innerHTML = `<div class="notpaginabalk"><button type="button" class="rond glas terugknop" data-actie="sluit" aria-label="Terug">${I.terug}</button>${menuKnop('glas')}</div>${blad}`;
  else el.innerHTML = `<div class="detailgreep"><div class="greep"></div><div class="detailnav">${menuKnop('glas')}<button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">${blad}</div>`;
  const tekst = $('#nottekst', el), titelVeld = $('#nottitel', el);
  if (titelVeld) {
    const i = n.tekst.indexOf('\n');
    titelVeld.value = i < 0 ? n.tekst : n.tekst.slice(0, i);
    tekst.value = i < 0 ? '' : n.tekst.slice(i + 1);
  } else tekst.value = n.tekst;

  // Labels als tags: typ een woord en een spatie (of Enter), dan wordt het een tag in kleine letters.
  // Een tik op een tag kiest hem (met een kruisje), nog een tik haalt hem weg; Backspace in een leeg veld ook.
  let gekozenTag = -1;
  const tekenLabels = () => {
    $('#notlabelsectie', el).hidden = !n.labels.length;
    $('#notlabels', el).innerHTML = n.labels.map((l, i) => (i === gekozenTag
      ? `<button type="button" class="tag aan" data-tag="${i}" aria-label="${esc(toonLabel(l))} weghalen">${esc(toonLabel(l))}${I.kruis}</button>`
      : `<button type="button" class="tag" data-tag="${i}">${esc(toonLabel(l))}</button>`)).join('');
    // Verwijderen: overal onder de knop met drie puntjes, op iPad en Mac rechts naast de datum
    if (doel) $('#notvoet', el).innerHTML = NOTITIES.includes(n) ? `<button class="notweg" data-actie="notmenu" aria-label="Meer" aria-haspopup="menu">${I.meer}</button>` : '';
    el.querySelectorAll('[data-actie="notmenu"]').forEach((b) => { b.hidden = !NOTITIES.includes(n); });
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

  // Een gekozen tag haal je ook weg met Backspace (op de Mac)
  el.addEventListener('keydown', (ev) => {
    if (gekozenTag >= 0 && (ev.key === 'Backspace' || ev.key === 'Delete') && ev.target.closest('[data-tag]')) { ev.preventDefault(); haalWeg(gekozenTag); }
  });

  // Meteen bewaren tijdens het typen; het tekstvak vult de ruimte van het scherm
  const bijTypen = () => {
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { tekst: schermTekst(el) });
    if (was !== NOTITIES.includes(n)) tekenLabels(); // de knop Verwijderen verschijnt of verdwijnt
    if (bijWijziging) bijWijziging();
  };
  // Een woord met een hekje in de tekst (of in een actiepunt) wordt een label, net als ! voor een actiepunt: na een
  // spatie, komma of Enter verdwijnt #woord uit de tekst en staat het bij de labels. Alleen als het met een letter
  // begint, zodat bijvoorbeeld 'melding #123' gewoon tekst blijft.
  const HEKJE = /(^|\s)#(\p{L}[\p{L}\p{N}_-]*)([\s,])$/u;
  const hekjeNaarLabel = (veld) => {
    const pos = veld.selectionStart, voor = veld.value.slice(0, pos), m = voor.match(HEKJE);
    if (!m) return;
    const ervoor = voor.slice(0, pos - m[0].length + m[1].length) + (m[3] === '\n' ? '\n' : '');
    veld.value = ervoor + veld.value.slice(pos);
    veld.setSelectionRange(ervoor.length, ervoor.length);
    voegTag(m[2]);
  };
  // Het tekstveld groeit mee met de tekst, zodat alleen het scherm scrolt en niet ook het veld zelf
  const scroller = () => { for (let p = tekst.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p; return document.scrollingElement; };
  const groei = () => {
    const sc = scroller(), top = sc.scrollTop;
    tekst.style.minHeight = '';
    tekst.style.minHeight = `${tekst.scrollHeight + tekst.offsetHeight - tekst.clientHeight}px`; // met de streep erboven
    sc.scrollTop = top;
  };
  tekst.addEventListener('input', () => { hekjeNaarLabel(tekst); groei(); caretInBeeld(tekst); bijTypen(); });
  requestAnimationFrame(groei);
  if (typeof ResizeObserver === 'function') { let breedte = 0; new ResizeObserver(() => { if (tekst.clientWidth !== breedte) { breedte = tekst.clientWidth; groei(); } }).observe(tekst); }

  // Actiepunten: een rondje om af te vinken, de tekst, en een deadline. Enter maakt een nieuw punt eronder;
  // Backspace in een leeg punt haalt het weg. Een regel in de tekst die begint met ! wordt bij Enter een actiepunt.
  const puntenEl = $('#notpunten', el);
  const tekenPunten = (focusId = null) => {
    puntenEl.innerHTML = punten(n).map((p) => `<div class="punt${p.klaar ? ' klaar' : ''}" data-punt="${p.id}">
        <button type="button" class="puntvink" data-actie="vink" aria-label="${p.klaar ? 'Niet afgevinkt maken' : 'Afvinken'}" aria-pressed="${p.klaar}">${I.vink}</button>
        <input class="punttekst" value="${esc(p.tekst)}" placeholder="Actiepunt" aria-label="Actiepunt" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">
        <span class="puntdatumvak"><button type="button" class="puntdatum${p.deadline ? ' aan' : ''}${!p.klaar && teLaat(p.deadline) ? ' laat' : ''}" data-actie="deadline" aria-label="${p.deadline ? `Deadline ${deadlineTekst(p.deadline)}` : 'Deadline'}">${p.deadline ? esc(deadlineTekst(p.deadline)) : I.kalender}</button><input type="date" class="puntkiezer" data-deadline="${p.deadline || ''}" tabindex="-1" aria-label="Deadline"></span>
        <button type="button" class="puntweg" data-actie="punt-weg" aria-label="Actiepunt weghalen">${I.kruis}</button>
      </div>`).join('');
    $('#notpuntsectie', el).hidden = !punten(n).length;
    // De deadline als waarde, niet als beginwaarde: Herstel in de datumkiezer van iOS gaat terug naar de beginwaarde,
    // en die is dan leeg. Zo haalt Herstel de deadline weg.
    puntenEl.querySelectorAll('.puntkiezer').forEach((k) => { k.value = k.dataset.deadline; });
    if (focusId) { const i = puntenEl.querySelector(`[data-punt="${focusId}"] .punttekst`); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  };
  const zetPunten = (lijst, focusId = null) => {
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { punten: lijst });
    if (doel) el.dataset.punten = JSON.stringify(punten(n));
    tekenPunten(focusId);
    if (was !== NOTITIES.includes(n)) tekenLabels();
    if (bijWijziging) bijWijziging();
  };
  const voegPunt = (tekstPunt = '', na = null) => {
    const p = maakPunt(tekstPunt), lijst = [...punten(n)];
    const i = na ? lijst.findIndex((x) => x.id === na) : -1;
    lijst.splice(i >= 0 ? i + 1 : lijst.length, 0, p);
    zetPunten(lijst, tekstPunt ? null : p.id);
    return p;
  };
  const puntVan = (t) => { const r = t.closest('[data-punt]'); return r ? punten(n).find((p) => p.id === r.dataset.punt) : null; };
  tekenPunten();
  if (doel) el.dataset.punten = JSON.stringify(punten(n));
  puntenEl.addEventListener('input', (ev) => {
    const p = ev.target.classList.contains('punttekst') && puntVan(ev.target);
    if (!p) return;
    hekjeNaarLabel(ev.target);
    p.tekst = ev.target.value;
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { punten: punten(n) });
    if (doel) el.dataset.punten = JSON.stringify(punten(n));
    if (was !== NOTITIES.includes(n)) tekenLabels();
    if (bijWijziging) bijWijziging();
  });
  // De deadline bijwerken zonder de actiepunten opnieuw te tekenen: iOS kiest bij het openen van een lege datumkiezer
  // meteen vandaag, en opnieuw tekenen zou de kiezer dan direct weer sluiten. Nu blijft hij open en kies je verder.
  const zetDeadline = (k) => {
    const p = puntVan(k), d = k.value || null;
    if (!p || p.deadline === d) return;
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { punten: punten(n).map((x) => (x === p ? { ...x, deadline: d } : x)) });
    if (doel) el.dataset.punten = JSON.stringify(punten(n));
    const knop = k.parentElement.querySelector('.puntdatum');
    knop.className = `puntdatum${d ? ' aan' : ''}${!p.klaar && teLaat(d) ? ' laat' : ''}`;
    knop.setAttribute('aria-label', d ? `Deadline ${deadlineTekst(d)}` : 'Deadline');
    knop.innerHTML = d ? esc(deadlineTekst(d)) : I.kalender;
    k.dataset.deadline = d || '';
    if (was !== NOTITIES.includes(n)) tekenLabels();
    if (bijWijziging) bijWijziging();
  };
  puntenEl.addEventListener('change', (ev) => { if (ev.target.classList.contains('puntkiezer')) zetDeadline(ev.target); });
  // Herstel in iOS geeft soms alleen een input-gebeurtenis; een lege waarde verwerken we daarom meteen
  puntenEl.addEventListener('input', (ev) => { if (ev.target.classList.contains('puntkiezer') && !ev.target.value) zetDeadline(ev.target); });
  puntenEl.addEventListener('keydown', (ev) => {
    const p = ev.target.classList.contains('punttekst') && puntVan(ev.target);
    if (!p || ev.isComposing) return;
    if (ev.key === 'Enter') { ev.preventDefault(); if (p.tekst.trim()) voegPunt('', p.id); else tekst.focus(); }
    else if (ev.key === 'Backspace' && !ev.target.value) {
      ev.preventDefault();
      const lijst = punten(n), i = lijst.indexOf(p);
      zetPunten(lijst.filter((x) => x !== p), i > 0 ? lijst[i - 1].id : null);
    }
  });
  tekst.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.isComposing) return;
    const v = tekst.value, pos = tekst.selectionStart, begin = v.lastIndexOf('\n', pos - 1) + 1;
    let eind = v.indexOf('\n', pos); if (eind < 0) eind = v.length;
    const m = v.slice(begin, eind).match(/^\s*!\s*(\S.*)$/);
    if (!m) return;
    ev.preventDefault();
    tekst.value = v.slice(0, begin) + v.slice(v[eind] === '\n' ? eind + 1 : eind);
    tekst.setSelectionRange(begin, begin);
    bijTypen();
    [...m[1].matchAll(/(?:^|\s)#(\p{L}[\p{L}\p{N}_-]*)/gu)].forEach((x) => voegTag(x[1])); // labels in het punt
    voegPunt(m[1].replace(/(^|\s)#\p{L}[\p{L}\p{N}_-]*/gu, '$1').replace(/\s+/g, ' ').trim());
    tekst.focus();
  });
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

  const verwijder = () => {
    if (!confirm('Deze notitie verwijderen?')) return;
    verwijderNotitie(n);
    if (p) p.sluit(); else if (klaar) klaar();
  };
  const naSluiten = () => { bewaarNotities({ meteen: true }); tekenNotities(); if (klaar) klaar(); };
  const p = doel ? null : pagina ? openPagina(el, naSluiten) : openPaneel(el, { greepSelector: '.detailgreep', naSluiten });
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]') && p) { p.sluit(); return; }
    if (t.closest('[data-actie="verwijder"]')) { verwijder(); return; }
    const menuKnop = t.closest('[data-actie="notmenu"]');
    if (menuKnop) { openNotitiemenu(menuKnop, verwijder); return; }
    const pa = t.closest('#notpunten [data-actie]');
    if (pa) {
      const p = puntVan(pa);
      if (pa.dataset.actie === 'vink' && p) zetPunten(punten(n).map((x) => (x === p ? { ...x, klaar: !x.klaar } : x)));
      else if (pa.dataset.actie === 'punt-weg' && p) zetPunten(punten(n).filter((x) => x !== p));
      else if (pa.dataset.actie === 'deadline' && p) {
        const k = pa.parentElement.querySelector('.puntkiezer');
        try { k.showPicker(); } catch (e) { k.focus(); k.click(); }
      }
      return;
    }
    const tag = t.closest('[data-tag]');
    if (tag) {
      const i = Number(tag.dataset.tag);
      if (gekozenTag === i) haalWeg(i);
      else { gekozenTag = i; tekenLabels(); el.querySelector(`[data-tag="${i}"]`)?.focus({ preventScroll: true }); }
      return;
    }
    if (gekozenTag >= 0) { gekozenTag = -1; tekenLabels(); } // ergens anders tikken: de tag is niet meer gekozen
  });
  const eerst = titelVeld || tekst;
  if (!n.tekst && pagina) setTimeout(() => eerst.focus(), 350);
  else if (!n.tekst) eerst.focus();
}

// De cursor in het tekstveld in beeld houden. Het veld groeit mee met de tekst, dus het scherm eromheen moet scrollen;
// iOS doet dat niet altijd zelf, bijvoorbeeld als het toetsenbord net opengaat. De hoogte van de cursor meten we met
// een onzichtbare kopie van het veld.
function caretInBeeld(t) {
  if (!t || document.activeElement !== t) return;
  let sc = t.parentElement;
  while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
  if (!sc) return;
  const cs = getComputedStyle(t), kopie = document.createElement('div');
  ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'boxSizing', 'textIndent', 'tabSize']
    .forEach((k) => { kopie.style[k] = cs[k]; });
  Object.assign(kopie.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', width: `${t.offsetWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
  kopie.textContent = t.value.slice(0, t.selectionEnd);
  const merk = document.createElement('span');
  merk.textContent = '\u200b';
  kopie.append(merk);
  document.body.append(kopie);
  const y = merk.offsetTop, h = merk.offsetHeight || parseFloat(cs.lineHeight) || 24;
  kopie.remove();
  const boven = t.getBoundingClientRect().top - sc.getBoundingClientRect().top + y; // ten opzichte van het zichtbare deel
  const ruimte = 24;
  if (boven + h + ruimte > sc.clientHeight) sc.scrollTop += boven + h + ruimte - sc.clientHeight;
  else if (boven < ruimte) sc.scrollTop += boven - ruimte;
}

// iPhone: een notitie als eigen scherm dat van rechts inschuift. Terug met de knop, Escape, of vanaf de linkerrand
// naar rechts vegen. Omlaag vegen doet niets: zo kun je vrij scrollen.
function openPagina(el, naSluiten) {
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  let dicht = false;
  // Het scherm eronder verbergen zodra de notitie er staat: anders schemert het door het toetsenbord van iOS heen.
  // Bij het terugvegen en sluiten komt het weer tevoorschijn.
  const verberg = (aan) => document.documentElement.classList.toggle('paginaopen', aan);
  setTimeout(() => { if (!dicht) verberg(true); }, 320);
  const bovenste = () => { const l = document.querySelectorAll('.notpagina'); return l[l.length - 1] === el; };
  const toets = (ev) => { if (ev.key === 'Escape' && !KEUZEMENU && bovenste()) { ev.stopPropagation(); ev.preventDefault(); sluit(); } };
  window.addEventListener('keydown', toets, true);
  const sluit = () => {
    if (dicht) return;
    dicht = true;
    window.removeEventListener('keydown', toets, true);
    el.style.transform = '';
    el.classList.remove('open');
    if (!document.querySelector('.notpagina.open')) verberg(false);
    setTimeout(() => el.remove(), 320);
    document.body.style.overflow = panelen.length ? 'hidden' : '';
    naSluiten();
  };
  // Vanaf de linkerrand vegen
  let x0 = null, dx = 0;
  el.addEventListener('touchstart', (ev) => { const t = ev.touches[0]; x0 = t.clientX < 28 ? t.clientX : null; dx = 0; if (x0 !== null) verberg(false); }, { passive: true });
  el.addEventListener('touchmove', (ev) => {
    if (x0 === null) return;
    dx = Math.max(0, ev.touches[0].clientX - x0);
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (x0 === null) return;
    el.style.transition = '';
    if (dx > 90) sluit(); else { el.style.transform = ''; verberg(true); }
    x0 = null;
  });
  return { sluit };
}

// Het menu onder de knop met drie puntjes, boven het paneel van de notitie
function openNotitiemenu(knop, verwijder) {
  if (KEUZEMENU) { sluitKeuzemenu(); return; }
  const laag = document.createElement('div');
  laag.className = 'keuzelaag notmenulaag';
  const menu = document.createElement('div');
  menu.className = 'keuzemenu notmenu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `<button role="menuitem" class="rood" data-menu="verwijder">${I.wissen}<span>Verwijderen</span></button>`;
  document.body.append(laag, menu);
  const r = knop.getBoundingClientRect();
  menu.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  menu.style.top = `${r.bottom + 8}px`;
  KEUZEMENU = { laag, menu, knop };
  knop.classList.add('open');
  knop.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => { menu.classList.add('open'); laag.classList.add('open'); });
  if (!IOS) menu.querySelector('button').focus({ preventScroll: true });
  laag.addEventListener('click', sluitKeuzemenu);
  menu.addEventListener('click', (ev) => { if (ev.target.closest('[data-menu="verwijder"]')) { sluitKeuzemenu(); verwijder(); } });
  menu.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); sluitKeuzemenu(); knop.focus(); } });
}

/* ------------------------------------------------------------------ */
/*  Actiepunten in de agenda                                           */
/* ------------------------------------------------------------------ */

// De open actiepunten met hun deadline op deze dag. Vandaag ook wat te laat is; voorbije dagen niets (dat staat
// dan bij vandaag).
function agendaPunten(d) {
  const t = vandaag();
  if (startOfDay(d) < t) return [];
  const dag = ymd(d), isVandaag = sameDay(d, t);
  const uit = [];
  levendeNotities().forEach((n) => openPunten(n).forEach((p) => {
    if (!p.deadline) return;
    if (p.deadline === dag) uit.push({ n, p, laat: false });
    else if (isVandaag && teLaat(p.deadline)) uit.push({ n, p, laat: true });
  }));
  return uit.sort((a, b) => Number(b.laat) - Number(a.laat) || String(a.p.deadline).localeCompare(String(b.p.deadline)) || a.n.gemaakt - b.n.gemaakt);
}
// Eén blok met de actiepunten van de dag, als eerste in de dag: een rondje en de tekst, hooguit drie, daarna '+ 2'.
// soort: rij (week op de telefoon), krij (week op iPad en Mac) of tegel (Vooruitblik). Een tik opent het overzicht van
// die dag, waar je afvinkt; in de agenda zelf zijn de rondjes te klein om precies te tikken.
const AGENDA_MAX = 3;
// De actiepunten van een dag als rustige balk boven de afspraken, in Week en Vooruitblik op elk scherm
function puntenBlokHtml(d) {
  const lijst = agendaPunten(d);
  if (!lijst.length) return '';
  const items = lijst.slice(0, AGENDA_MAX).map(({ p, laat }) => `<span class="agpunt${laat ? ' laat' : ''}"><span class="agvink"></span>
      <span class="agtekst">${esc(p.tekst.trim())}</span>${laat ? `<span class="aglaat">${esc(deadlineTekst(p.deadline))}</span>` : ''}</span>`).join('') // te laat: los erachter, zodat afkappen het niet wegneemt
    + (lijst.length > AGENDA_MAX ? `<span class="agmeer">+ ${lijst.length - AGENDA_MAX}</span>` : '');
  const label = `${lijst.length === 1 ? '1 actiepunt' : `${lijst.length} actiepunten`}${sameDay(d, vandaag()) ? ' vandaag' : ''}`;
  return `<button class="vbpunten" data-agdag="${ymd(d)}" aria-label="${label}"><span class="agpunten">${items}</span></button>`;
}
// Het overzicht van één dag: grote rondjes om af te vinken, de deadline als die voorbij is, en de notitie of het
// overleg waar het punt bij hoort. Een tik op de tekst opent de notitie.
function openDagPunten(d) {
  const el = document.createElement('div');
  el.className = 'paneel detail nieuw dagpunten' + (isDesktop() ? ' dialoog' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Actiepunten');
  const datum = cap(`${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`);
  let gedaan = new Set();
  const teken = () => {
    const lijst = agendaPunten(d);
    const rijen = lijst.map(({ n, p, laat }) => {
      const [titel] = notitieKop(n);
      const bron = titel === p.tekst.trim() ? '' : titel;
      return `<div class="punt dagpunt${laat ? ' laat' : ''}">
        <button type="button" class="puntvink" data-dagvink="${n.id}|${p.id}" aria-label="${esc(p.tekst.trim())} afvinken">${I.vink}</button>
        <button type="button" class="dagtekst" data-dagnotitie="${n.id}"><span class="t1">${esc(p.tekst.trim())}</span>${laat || bron ? `<span class="t2">${laat ? `<span class="tddatum laat">${esc(deadlineTekst(p.deadline))}</span>` : ''}${esc(bron)}</span>` : ''}</button>
      </div>`;
    }).join('');
    $('.formkaart', el).innerHTML = rijen || '<p class="nleeg dagleeg">Alles afgevinkt</p>';
  };
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><div class="dkopinhoud"><h2 class="dtitel">Actiepunten</h2><div class="dmeta"><div>${datum}</div></div></div></div>
      <div class="formkaart puntenkaart"></div>
    </div>`;
  teken();
  const p = openPaneel(el, { greepSelector: '.detailgreep', naSluiten: () => behoudDag(render) });
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    const v = ev.target.closest('[data-dagvink]');
    if (v) {
      const [nid, pid] = v.dataset.dagvink.split('|');
      const n = NOTITIES.find((x) => x.id === nid);
      if (!n) return;
      // Eerst het vinkje laten zien, dan pas uit de lijst
      v.closest('.punt').classList.add('klaar');
      wijzigNotitie(n, { punten: punten(n).map((x) => (x.id === pid ? { ...x, klaar: true } : x)) });
      setTimeout(teken, 450);
      return;
    }
    const o = ev.target.closest('[data-dagnotitie]');
    if (o) { const n = NOTITIES.find((x) => x.id === o.dataset.dagnotitie); if (n) openNotitie({ notitie: n, klaar: teken }); }
  });
}
// Vóór de algemene klikken in de agenda (capture): het blok opent het overzicht van de dag
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('#inhoud [data-agdag]');
  if (!b) return;
  ev.stopPropagation();
  openDagPunten(deadlineDag(b.dataset.agdag));
}, true);

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
let notLabels = []; // de gekozen labels (blokjes in het zoekveld): het eerste, en eventueel labels daarbinnen
// iPad en Mac: filters zoals in een webwinkel. Periode bij de notities (naar de afspraak of de laatste wijziging),
// Deadline bij Te doen; de vakken zijn dezelfde als de kopjes in de lijst. Meerdere tegelijk mag.
let notPeriodes = [];
let notSorteer = ''; // leeg: de standaard (notities: nieuwste eerst; actiepunten: op deadline)
const BAKKEN_NOTITIES = [['binnenkort', 'Binnenkort'], ['vandaag', 'Vandaag'], ['week', 'Afgelopen 7 dagen'], ['maand', 'Afgelopen 30 dagen']];
const BAKKEN_TEDOEN = [['laat', 'Te laat'], ['vandaag', 'Vandaag'], ['week', 'Komende 7 dagen'], ['maand', 'Komende 30 dagen'], ['zonder', 'Zonder deadline']];
const bakken = () => (notTeDoen ? BAKKEN_TEDOEN : BAKKEN_NOTITIES);
function deadlineGroep(d) {
  if (!d) return 'Zonder deadline';
  const dagen = Math.round((deadlineDag(d) - vandaag()) / 864e5);
  return dagen < 0 ? 'Te laat' : dagen === 0 ? 'Vandaag' : dagen === 1 ? 'Morgen' : dagen < 7 ? 'Deze week' : 'Later';
}
// De vakken overlappen (Vandaag valt ook in Komende 7 dagen); aangevinkte vakken tellen samen (of-of)
function inNotitieBak(n, k) {
  const d = dagenGeleden(notitieMoment(n).getTime());
  return k === 'binnenkort' ? d < 0 : k === 'vandaag' ? d === 0 : k === 'week' ? d >= 0 && d < 7 : d >= 0 && d < 30;
}
function inDeadlineBak(pu, k) {
  if (!pu.deadline) return k === 'zonder';
  const d = Math.round((deadlineDag(pu.deadline) - vandaag()) / 864e5);
  return k === 'laat' ? d < 0 : k === 'vandaag' ? d === 0 : k === 'week' ? d >= 0 && d < 7 : k === 'maand' ? d >= 0 && d < 30 : false;
}
const inPeriode = (n) => notTeDoen || !notPeriodes.length || notPeriodes.some((k) => inNotitieBak(n, k));
const puntInPeriode = (pu) => !notTeDoen || !notPeriodes.length || notPeriodes.some((k) => inDeadlineBak(pu, k));
const SORTEER_NOTITIES = [['nieuw', 'Nieuwste eerst'], ['oud', 'Oudste eerst'], ['titel', 'Titel (A–Z)']];
const SORTEER_TEDOEN = [['deadline', 'Deadline'], ['nieuw', 'Nieuwste notitie eerst'], ['titel', 'Actiepunt (A–Z)']];
let notTeDoen = false; // het overzicht van open actiepunten in plaats van de notities
let notGekozen = null; // iPad en Mac: de notitie rechts naast de lijst
let notNieuw = null; // een nieuwe notitie rechts die nog leeg is (en dus nog niet in de lijst staat)
const isLabel = (a, b) => !!a && !!b && tagSleutel(a) === tagSleutel(b);
// Voorheen op iPad en Mac de lijst en de notitie naast elkaar. Nu overal de lijst, met op iPad en Mac links in de
// zijbalk de criteria; een notitie opent als eigen scherm, net als op de iPhone.
const naastElkaar = () => false;

function zichtbareNotities() {
  const woorden = labelSleutel(notZoek).split(/\s+/).filter(Boolean);
  return levendeNotities()
    .filter((n) => notLabels.every((k) => n.labels.some((l) => isLabel(l, k))) && inPeriode(n))
    .filter((n) => {
      if (!woorden.length) return true;
      const hooi = labelSleutel([n.tekst, punten(n).map((p) => p.tekst).join(' '), n.labels.map(toonLabel).join(' '), n.afspraak ? n.afspraak.titel : ''].join(' '));
      return woorden.every((w) => hooi.includes(w));
    })
    .sort((a, b) => notitieMoment(b) - notitieMoment(a)); // de nieuwste bovenaan: de afspraak, of de laatste wijziging
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
// Op iPad en Mac staat het zoekveld boven de lijst, niet in de werkbalk. Het is hetzelfde veld: we verplaatsen het, en
// zetten het terug voordat de inhoud opnieuw wordt opgebouwd.
const zoekbalkEl = $('#zoekbalk');
const zoekThuis = { ouder: zoekbalkEl.parentNode, na: zoekbalkEl.nextSibling };
function zoekbalkThuis() { if (zoekbalkEl.parentNode !== zoekThuis.ouder) zoekThuis.ouder.insertBefore(zoekbalkEl, zoekThuis.na); }
function notitiesHtml() {
  if (isDesktop()) return `<div class="notitab notizoek"><aside class="nfilters" id="nfilters" aria-label="Filters"></aside><div class="nresultaten"><div class="nresultkop" id="nresultkop"></div><div id="notlijst">${notitieLijstHtml()}</div></div></div>`;
  if (!naastElkaar()) return `<div class="notitab"><div id="notlijst">${notitieLijstHtml()}</div></div>`;
  return `<div class="notitab notisplit"><div class="notilinks"><div id="notlijst">${notitieLijstHtml()}</div></div><div class="notipaneel" id="notipaneel"></div></div>`;
}
// Te doen: alle open actiepunten uit de zichtbare notities, geordend op deadline. Onder elk punt de notitie of het
// overleg waar het bij hoort; een tik opent die notitie.
function teDoenHtml() {
  const volgorde = ['Te laat', 'Vandaag', 'Morgen', 'Deze week', 'Later', 'Zonder deadline'];
  const items = [];
  zichtbareNotities().forEach((n) => openPunten(n).filter((p) => puntInPeriode(p)).forEach((p) => items.push({ n, p, groep: deadlineGroep(p.deadline) })));
  if (!items.length) return `<p class="nleeg nlijstleeg">Geen open actiepunten</p>`;
  const opDeadline = (a, b) => volgorde.indexOf(a.groep) - volgorde.indexOf(b.groep) || String(a.p.deadline || '').localeCompare(String(b.p.deadline || '')) || b.n.gemaakt - a.n.gemaakt; // vast: afvinken laat niets verspringen
  const plat = isDesktop();
  items.sort(plat && notSorteer === 'nieuw' ? (a, b) => notitieMoment(b.n) - notitieMoment(a.n) || opDeadline(a, b)
    : plat && notSorteer === 'titel' ? (a, b) => a.p.tekst.localeCompare(b.p.tekst, 'nl', { sensitivity: 'base' }) || opDeadline(a, b) : opDeadline);
  const rij = ({ n, p }) => {
    const [titel] = notitieKop(n);
    const bron = titel === p.tekst.trim() ? '' : titel;
    const dl = p.deadline ? `<span class="tddatum${teLaat(p.deadline) ? ' laat' : ''}">${esc(deadlineTekst(p.deadline))}</span>` : '';
    return `<div class="${naastElkaar() ? '' : 'drij '}notitierij tdrij" data-notitie="${n.id}" role="button" tabindex="0">
      <button type="button" class="puntvink" data-tdvink="${n.id}|${p.id}" aria-label="Afvinken"></button>
      <span class="tekst"><span class="t1">${esc(p.tekst.trim())}</span>${dl || bron ? `<span class="t2">${dl}${esc(bron)}</span>` : ''}</span></div>`;
  };
  if (plat) return `<div class="kaart">${items.map(rij).join('')}</div>`; // iPad en Mac: één lijst
  return volgorde.filter((g) => items.some((i) => i.groep === g))
    .map((g) => `<h3 class="ngroep${g === 'Te laat' ? ' laat' : ''}">${g}</h3><div class="${naastElkaar() ? 'ngroeplijst' : 'kaart'}">${items.filter((i) => i.groep === g).map(rij).join('')}</div>`).join('');
}
function notitieLijstHtml() {
  if (notTeDoen) return teDoenHtml();
  const lijst = zichtbareNotities();
  const gekozen = naastElkaar() ? gekozenNotitie() : null;
  if (!lijst.length) return `<p class="nleeg nlijstleeg">${levendeNotities().length ? 'Niets gevonden' : 'Nog geen notities'}</p>`;
  // In groepen (Vandaag, Gisteren, ...) zoals in Notities van Apple, naar hetzelfde moment als de datum in de regel:
  // de afspraak, of bij een losse notitie de laatste wijziging. Op iPad en Mac een lijst
  // met strepen naast de notitie; op de iPhone een kaart per groep, met een pijltje naar de notitie.
  const groepen = [];
  for (const n of lijst) {
    const g = wijzigGroep(notitieMoment(n).getTime());
    if (!groepen.length || groepen[groepen.length - 1].naam !== g) groepen.push({ naam: g, notities: [] });
    groepen[groepen.length - 1].notities.push(n);
  }
  const rij = (n) => {
    const [titel, voorproef] = notitieKop(n);
    const inhoud = `<span class="t1">${esc(titel)}</span>
        <span class="t2"><span class="ndatum">${esc(wijzigDatum(notitieMoment(n).getTime(), isDesktop()))}</span>${esc(voorproef || 'Geen extra tekst')}</span>`; // de labels staan in de notitie zelf en bij het zoeken
    if (!naastElkaar()) return `<button class="drij notitierij" data-notitie="${n.id}"><span class="tekst">${inhoud}</span>${I.verder}</button>`;
    const aan = !!gekozen && gekozen.id === n.id;
    return `<button class="notitierij${aan ? ' aan' : ''}" data-notitie="${n.id}" aria-pressed="${aan}">${inhoud}</button>`;
  };
  if (isDesktop()) { // iPad en Mac: één lijst, gesorteerd zoals gekozen
    const op = notSorteer === 'oud' ? (a, b) => notitieMoment(a) - notitieMoment(b)
      : notSorteer === 'titel' ? (a, b) => notitieKop(a)[0].localeCompare(notitieKop(b)[0], 'nl', { sensitivity: 'base' }) : null;
    return `<div class="kaart">${(op ? [...lijst].sort(op) : lijst).map(rij).join('')}</div>`;
  }
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
  if (volledig || !$('#notlijst', main) || !!$('#notipaneel', main) !== naastElkaar() || !!$('#nfilters', main) !== isDesktop()) {
    const bezig = document.activeElement === zoekVeld;
    zoekbalkThuis();
    main.innerHTML = notitiesHtml();
    if (isDesktop()) { $('.nresultaten', main).prepend(zoekbalkEl); if (bezig) zoekVeld.focus(); } // het zoekveld boven de resultaten
    if (naastElkaar()) { $('.notilinks', main).prepend(zoekbalkEl); if (bezig) zoekVeld.focus(); }
    tekenZoek();
    if (naastElkaar()) vulNotitiepaneel();
    return;
  }
  tekenZoek();
  $('#notlijst', main).innerHTML = notitieLijstHtml();
  if (!naastElkaar()) return;
  const vak = $('#notipaneel', main);
  const n = gekozenNotitie();
  const bezig = vak.contains(document.activeElement);
  const opScherm = schermTekst(vak);
  const anderePunten = n && vak.dataset.punten !== undefined && vak.dataset.punten !== JSON.stringify(punten(n));
  if (vak.dataset.id !== (n ? n.id : '') || (n && !bezig && ((opScherm !== null && opScherm !== n.tekst) || anderePunten))) vulNotitiepaneel();
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
/* ------------------------------------------------------------------ */
/*  Zoeken: tekst, en labels en Te doen als blokjes in het zoekveld    */
/* ------------------------------------------------------------------ */

// Zoals in iOS: tik je in het zoekveld, dan staan eronder Te doen en je labels. Kies je er een, dan komt die als blokje
// in het zoekveld. Na een label staan er de labels die daarbinnen voorkomen: zo verfijn je naar een subonderwerp.
// Typ je #h, dan alleen de labels die zo beginnen. Backspace in een leeg zoekveld haalt het laatste blokje weg.
const zoekVeld = $('#notzoek');
const voorstelEl = document.createElement('div');
voorstelEl.className = 'zoekvoorstel';
voorstelEl.id = 'zoekvoorstel';
voorstelEl.hidden = true;
document.body.append(voorstelEl);
const binnenSelectie = (n) => notLabels.every((k) => n.labels.some((l) => isLabel(l, k))) && inPeriode(n);
// De labels om uit te kiezen: zonder keuze alle labels, anders de labels in de notities met de gekozen labels
function kiesbareLabels() {
  if (!notLabels.length) return alleLabels();
  const tel = new Map();
  levendeNotities().filter(binnenSelectie).forEach((n) => n.labels.forEach((l) => {
    if (notLabels.some((k) => isLabel(l, k))) return;
    const t = tel.get(tagSleutel(l)) || { label: tagVan(l), n: 0 };
    t.n++; tel.set(tagSleutel(l), t);
  }));
  return [...tel.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'nl')).map((t) => t.label);
}
const hekjeWoord = () => { const m = zoekVeld.value.match(/(?:^|\s)#(\S*)$/); return m ? m[1] : null; };
// iPad en Mac: zoeken zoals in een webwinkel. Links de filters (Soort, Periode of Deadline, Labels) met aantallen;
// boven de lijst het zoekveld, de gekozen filters als badges, het aantal resultaten en de sortering.
let nfAlleLabels = false;
function tekenFilters() {
  const kolom = $('#nfilters'), kop = $('#nresultkop');
  if (!kolom || !kop) return;
  const zoek = labelSleutel(notZoek).split(/\s+/).filter(Boolean);
  const vindbaar = (n) => !zoek.length || zoek.every((w) => labelSleutel([n.tekst, punten(n).map((p) => p.tekst).join(' '), n.labels.map(toonLabel).join(' '), n.afspraak ? n.afspraak.titel : ''].join(' ')).includes(w));
  const metLabels = (n, extra) => [...notLabels, ...(extra ? [extra] : [])].every((k) => n.labels.some((l) => isLabel(l, k)));
  const levend = levendeNotities().filter(vindbaar);
  // Tellen: notities, of bij actiepunten de open punten. Bij een vak van Periode of Deadline: hoeveel er in dat vak
  // zelf vallen (los van de andere aangevinkte vakken, zoals in een webwinkel); bij een label: wat er overblijft.
  const tel = (n, { bak = null, label = null, soort = notTeDoen } = {}) => {
    if (!metLabels(n, label)) return 0;
    const bakken2 = bak ? [bak] : (soort === notTeDoen ? notPeriodes : []);
    if (soort) return openPunten(n).filter((p) => !bakken2.length || bakken2.some((k) => inDeadlineBak(p, k))).length;
    return !bakken2.length || bakken2.some((k) => inNotitieBak(n, k)) ? 1 : 0;
  };
  const som = (opties) => levend.reduce((t, n) => t + tel(n, opties), 0);
  const keus = (soort, attr, aan, tekst, aantal) => `<button type="button" ${attr} class="nfvak${aan ? ' aan' : ''}" role="${soort}" aria-checked="${aan}"><span class="zbkeus${soort === 'radio' ? ' rond' : ''}${aan ? ' aan' : ''}" aria-hidden="true">${aan && soort !== 'radio' ? I.vink : ''}</span><span class="nftekst">${esc(tekst)}</span><span class="aantal">${aantal}</span></button>`;
  const perioden = bakken().map(([k, t]) => [k, t, som({ bak: k })]).filter(([k, , a]) => a || notPeriodes.includes(k));
  const labels = alleLabels().map((l) => [l, som({ label: l })]).filter(([l, a]) => a || notLabels.some((k) => isLabel(l, k)));
  const MAX = 8, zichtbaar = nfAlleLabels ? labels : labels.slice(0, MAX);
  kolom.innerHTML = `<section class="nfgroep"><h3>Soort</h3>
      ${keus('radio', 'data-nf-soort="notities"', !notTeDoen, 'Notities', levend.filter((n) => metLabels(n)).length)}
      ${keus('radio', 'data-nf-soort="tedoen"', notTeDoen, 'Actiepunten', levend.reduce((t, n) => t + (metLabels(n) ? openPunten(n).length : 0), 0))}</section>
    <section class="nfgroep"><h3>${notTeDoen ? 'Deadline' : 'Periode'}</h3>
      ${perioden.map(([k, t, a]) => keus('checkbox', `data-nf-periode="${k}"`, notPeriodes.includes(k), t, a)).join('') || '<p class="nfleeg">Geen</p>'}</section>
    <section class="nfgroep"><h3>Labels</h3>
      ${zichtbaar.map(([l, a]) => keus('checkbox', `data-nf-label="${esc(l)}"`, notLabels.some((k) => isLabel(l, k)), toonLabel(l), a)).join('') || '<p class="nfleeg">Geen</p>'}
      ${labels.length > MAX ? `<button type="button" class="nfmeer" data-nf-meer>${nfAlleLabels ? 'Minder labels' : `Alle labels (${labels.length})`}</button>` : ''}</section>`;
  const aantal = notTeDoen ? som({}) : levend.filter((n) => tel(n)).length;
  const badges = [...bakken().filter(([k]) => notPeriodes.includes(k)).map(([k, t]) => [`§${k}`, t]), ...notLabels.map((l) => [l, toonLabel(l)])];
  const opties = notTeDoen ? SORTEER_TEDOEN : SORTEER_NOTITIES;
  const sorteer = opties.some(([k]) => k === notSorteer) ? notSorteer : opties[0][0];
  kop.innerHTML = `${badges.length ? `<div class="nbadges">${badges.map(([k, t]) => `<button type="button" class="nbadge" data-nf-weg="${esc(k)}" aria-label="${esc(t)} weghalen">${esc(t)}${I.kruis}</button>`).join('')}<button type="button" class="nwis" data-nf-wis>Wis alles</button></div>` : ''}
    <div class="nresultregel"><span class="naantal">${aantal} ${notTeDoen ? (aantal === 1 ? 'actiepunt' : 'actiepunten') : (aantal === 1 ? 'notitie' : 'notities')}</span>
      <label class="nsorteer">Sorteren op <select data-nf-sorteer>${opties.map(([k, t]) => `<option value="${k}"${k === sorteer ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>`;
}
document.addEventListener('click', (ev) => {
  const k = ev.target.closest('#nfilters button, #nresultkop button');
  if (!k) return;
  if (k.dataset.nfSoort) { const td = k.dataset.nfSoort === 'tedoen'; if (td !== notTeDoen) { notTeDoen = td; notSorteer = ''; } }
  else if (k.dataset.nfPeriode) notPeriodes = notPeriodes.includes(k.dataset.nfPeriode) ? notPeriodes.filter((x) => x !== k.dataset.nfPeriode) : [...notPeriodes, k.dataset.nfPeriode];
  else if (k.dataset.nfLabel) { const l = k.dataset.nfLabel; notLabels = notLabels.some((x) => isLabel(x, l)) ? notLabels.filter((x) => !isLabel(x, l)) : [...notLabels, l]; }
  else if (k.dataset.nfWeg) { const w = k.dataset.nfWeg; if (w.startsWith('§')) notPeriodes = notPeriodes.filter((x) => `§${x}` !== w); else notLabels = notLabels.filter((x) => !isLabel(x, w)); }
  else if (k.dataset.nfMeer !== undefined) { nfAlleLabels = !nfAlleLabels; tekenFilters(); return; }
  else if (k.dataset.nfWis !== undefined) { notLabels = []; notPeriodes = []; notZoek = ''; zoekVeld.value = ''; }
  tekenZoek(); nieuwZoeken();
});
document.addEventListener('change', (ev) => {
  if (!ev.target.matches('[data-nf-sorteer]')) return;
  notSorteer = ev.target.value;
  tekenZoek(); nieuwZoeken();
});
let vorigeTeDoen = false;
function tekenZoek() {
  notLabels = notLabels.filter((k) => alleLabels().some((l) => isLabel(l, k)));
  if (notTeDoen !== vorigeTeDoen) { notPeriodes = []; vorigeTeDoen = notTeDoen; } // Periode hoort bij de notities, Deadline bij Te doen
  tekenFilters();
  const blokje = (tekst, sleutel) => `<button type="button" class="zoektoken" data-token="${esc(sleutel)}" aria-label="${esc(tekst)} weghalen">${esc(tekst)}${I.kruis}</button>`;
  const tokens = $('#zoektokens');
  // Op iPad en Mac staan de filters als badges boven de lijst, niet in het zoekveld
  tokens.innerHTML = isDesktop() ? '' : (notTeDoen ? blokje('Te doen', '') : '') + bakken().filter(([k]) => notPeriodes.includes(k)).map(([k, t]) => blokje(t, `§${k}`)).join('') + notLabels.map((l) => blokje(toonLabel(l), l)).join('');
  tokens.scrollLeft = tokens.scrollWidth; // het laatste blokje in beeld; de rest door zijwaarts te vegen
  zoekVeld.placeholder = !isDesktop() && (notTeDoen || notPeriodes.length || notLabels.length) ? '' : 'Zoeken';
  if (!voorstelEl.hidden) toonVoorstel();
}
function toonVoorstel() {
  if (ST.tab !== 'notities') { voorstelEl.hidden = true; return; }
  const hekje = hekjeWoord(), k = hekje ? tagSleutel(hekje) : '';
  const open = levendeNotities().filter(binnenSelectie).reduce((t, n) => t + openPunten(n).length, 0);
  const labels = kiesbareLabels().filter((l) => !k || tagSleutel(l).startsWith(k));
  const teDoen = !notTeDoen && open && hekje === null
    ? `<button type="button" class="zvtedoen" data-zv="tedoen">${I.vink}<span>Te doen</span><span class="aantal">${open}</span></button>` : '';
  const kop = notLabels.length ? `Binnen ${esc(toonLabel(notLabels[notLabels.length - 1]))}` : 'Labels';
  const html = teDoen + (labels.length ? `<div class="zvkop">${kop}</div><div class="chips zvlabels">${labels.map((l) => `<button type="button" class="chip label" data-zv="${esc(l)}">${esc(toonLabel(l))}</button>`).join('')}</div>` : '');
  if (!html) { voorstelEl.hidden = true; return; }
  voorstelEl.innerHTML = html;
  const r = $('#zoekbalk').getBoundingClientRect(), breed = Math.max(r.width, Math.min(360, innerWidth - 24));
  voorstelEl.style.left = `${Math.max(12, Math.min(r.left, innerWidth - breed - 12))}px`;
  voorstelEl.style.top = `${r.bottom + 8}px`;
  voorstelEl.style.width = `${breed}px`;
  voorstelEl.hidden = false;
}
const nieuwZoeken = () => tekenNotities();
zoekVeld.addEventListener('focus', toonVoorstel);
zoekVeld.addEventListener('input', () => { notZoek = zoekVeld.value; nieuwZoeken(); toonVoorstel(); });
zoekVeld.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== zoekVeld) voorstelEl.hidden = true; }, 150));
zoekVeld.addEventListener('keydown', (ev) => {
  if (ev.key === 'Backspace' && zoekVeld.selectionStart === 0 && zoekVeld.selectionEnd === 0 && (notLabels.length || notPeriodes.length || notTeDoen) && !isDesktop()) {
    ev.preventDefault();
    if (notLabels.length) notLabels.pop(); else if (notPeriodes.length) notPeriodes.pop(); else notTeDoen = false;
    tekenZoek(); nieuwZoeken();
  } else if (ev.key === 'Escape' || ev.key === 'Enter') { voorstelEl.hidden = true; if (ev.key === 'Enter') zoekVeld.blur(); }
});
// Een keuze houdt het zoekveld actief (geen blur), zodat je verder kunt verfijnen
voorstelEl.addEventListener('pointerdown', (ev) => ev.preventDefault());
voorstelEl.addEventListener('mousedown', (ev) => ev.preventDefault());
voorstelEl.addEventListener('click', (ev) => {
  const k = ev.target.closest('[data-zv]');
  if (!k) return;
  if (k.dataset.zv === 'tedoen') notTeDoen = true;
  else {
    notLabels.push(k.dataset.zv);
    if (hekjeWoord() !== null) { zoekVeld.value = zoekVeld.value.replace(/(?:^|\s)#\S*$/, '').trimEnd(); notZoek = zoekVeld.value; }
  }
  tekenZoek(); nieuwZoeken(); toonVoorstel();
});
$('#zoektokens').addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-token]');
  if (!t) return;
  ev.preventDefault();
  if (t.dataset.token === '') notTeDoen = false; else if (t.dataset.token.startsWith('§')) notPeriodes = notPeriodes.filter((k) => `§${k}` !== t.dataset.token); else notLabels = notLabels.filter((k) => !isLabel(k, t.dataset.token));
  tekenZoek(); nieuwZoeken();
});
window.addEventListener('resize', () => { if (!voorstelEl.hidden) toonVoorstel(); });

document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#inhoud .notitab') || ev.target.closest('#notipaneel')) return;
  const vink = ev.target.closest('[data-tdvink]');
  if (vink) {
    const [nid, pid] = vink.dataset.tdvink.split('|');
    const n = NOTITIES.find((x) => x.id === nid);
    if (n) { wijzigNotitie(n, { punten: punten(n).map((p) => (p.id === pid ? { ...p, klaar: true } : p)) }); tekenNotities(); }
    return;
  }
  const r = ev.target.closest('[data-notitie]');
  if (!r) return;
  if (naastElkaar()) { bewaarNotities({ meteen: true }); notGekozen = r.dataset.notitie; notNieuw = null; tekenNotities(); }
  else openNotitie({ notitie: NOTITIES.find((n) => n.id === r.dataset.notitie) });
});
