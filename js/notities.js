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
  const labelHtml = `<div class="taglijn"><span class="tags" id="notlabels"></span><input id="notlabel" class="taginvoer" placeholder="Labels" aria-label="Labels" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"></div>`;
  const titelHtml = n.afspraak
    ? `<h2 class="dtitel">${esc(n.afspraak.titel || 'Zonder titel')}</h2>`
    : '<input id="nottitel" class="dtitel nottitel" placeholder="Titel" aria-label="Titel" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">';
  if (doel) el.innerHTML = `<div class="notblad">
      <div class="notbovenbalk"><span></span><div class="notmeta num">${meta}</div><div id="notvoet"></div></div>
      ${titelHtml}
      ${labelHtml}
      <div class="punten" id="notpunten"></div>
      <textarea id="nottekst" placeholder="Notitie" aria-label="Notitie"></textarea>
    </div>`;
  else el.innerHTML = `${doel ? '' : `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="notmenu" aria-label="Meer" aria-haspopup="menu">${I.meer}</button><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>`}
    <div class="detailinhoud">
      <div class="dkop"><div class="dkopinhoud">${titelHtml}${n.afspraak ? `<div class="dmeta"><div class="num">${notitieDatum(n)}</div></div>` : ''}</div>
        <button class="rond kopknop" data-actie="notmenu" aria-label="Meer" aria-haspopup="menu">${I.meer}</button></div>
      ${labelHtml}
      <div class="formkaart puntenkaart"><div class="punten" id="notpunten"></div></div>
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
    // Verwijderen: op iPad en Mac een prullenbak naast de notitie, in een paneel onder de knop met drie puntjes
    if (doel) $('#notvoet', el).innerHTML = NOTITIES.includes(n) ? `<button class="notweg" data-actie="verwijder" aria-label="Notitie verwijderen">${I.wissen}</button>` : '';
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

  // Een spatie of komma maakt van het woord ervoor een tag
  invoer.addEventListener('input', () => {
    if (gekozenTag >= 0) { gekozenTag = -1; tekenLabels(); }
    if (!/[\s,]/.test(invoer.value)) return;
    const delen = invoer.value.split(/[\s,]+/);
    invoer.value = delen.pop();
    delen.forEach(voegTag);
  });
  invoer.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented || ev.isComposing) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (!invoer.value.trim()) { tekst.focus(); return; }
      voegTag(invoer.value);
      invoer.value = '';
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

  // Actiepunten: een rondje om af te vinken, de tekst, en een deadline. Enter maakt een nieuw punt eronder;
  // Backspace in een leeg punt haalt het weg. Een regel in de tekst die begint met ! wordt bij Enter een actiepunt.
  const puntenEl = $('#notpunten', el);
  const tekenPunten = (focusId = null) => {
    puntenEl.innerHTML = punten(n).map((p) => `<div class="punt${p.klaar ? ' klaar' : ''}" data-punt="${p.id}">
        <button type="button" class="puntvink" data-actie="vink" aria-label="${p.klaar ? 'Niet afgevinkt maken' : 'Afvinken'}" aria-pressed="${p.klaar}">${I.vink}</button>
        <input class="punttekst" value="${esc(p.tekst)}" placeholder="Actiepunt" aria-label="Actiepunt" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">
        <button type="button" class="puntdatum${p.deadline ? ' aan' : ''}${!p.klaar && teLaat(p.deadline) ? ' laat' : ''}" data-actie="deadline" aria-label="${p.deadline ? `Deadline ${deadlineTekst(p.deadline)}` : 'Deadline'}">${p.deadline ? esc(deadlineTekst(p.deadline)) : I.kalender}</button>
        <input type="date" class="puntkiezer" value="${p.deadline || ''}" tabindex="-1" aria-hidden="true">
      </div>`).join('') + `<button type="button" class="puntnieuw" data-actie="punt-nieuw">${I.plus}<span>Actiepunt</span></button>`;
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
    p.tekst = ev.target.value;
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { punten: punten(n) });
    if (doel) el.dataset.punten = JSON.stringify(punten(n));
    if (was !== NOTITIES.includes(n)) tekenLabels();
    if (bijWijziging) bijWijziging();
  });
  puntenEl.addEventListener('change', (ev) => {
    const p = ev.target.classList.contains('puntkiezer') && puntVan(ev.target);
    if (p) zetPunten(punten(n).map((x) => (x === p ? { ...x, deadline: ev.target.value || null } : x)));
  });
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
    voegPunt(m[1].trim());
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
  const p = doel ? null : openPaneel(el, { greepSelector: '.detailgreep', naSluiten: () => { bewaarNotities({ meteen: true }); tekenNotities(); if (klaar) klaar(); } });
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]') && p) { p.sluit(); return; }
    if (t.closest('[data-actie="verwijder"]')) { verwijder(); return; }
    const menuKnop = t.closest('[data-actie="notmenu"]');
    if (menuKnop) { openNotitiemenu(menuKnop, verwijder); return; }
    const pa = t.closest('#notpunten [data-actie]');
    if (pa) {
      const p = puntVan(pa);
      if (pa.dataset.actie === 'punt-nieuw') voegPunt();
      else if (pa.dataset.actie === 'vink' && p) zetPunten(punten(n).map((x) => (x === p ? { ...x, klaar: !x.klaar } : x)));
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
      else { gekozenTag = i; tekenLabels(); if (isDesktop()) invoer.focus(); }
      return;
    }
    if (t.closest('.taglijn') && !t.closest('button')) invoer.focus(); // een tik naast de tags: verder typen
  });
  const eerst = titelVeld || tekst;
  if (!n.tekst && !isDesktop()) setTimeout(() => eerst.focus(), 350);
  else if (!n.tekst) eerst.focus();
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
let notLabels = [];
let notMeer = false;
let notTeDoen = false; // het overzicht van open actiepunten in plaats van de notities // iPad en Mac: alle labels tonen in plaats van twee regels // het gekozen label, en eventueel labels daarbinnen (de tweede regel)
let notGekozen = null; // iPad en Mac: de notitie rechts naast de lijst
let notNieuw = null; // een nieuwe notitie rechts die nog leeg is (en dus nog niet in de lijst staat)
const isLabel = (a, b) => !!a && !!b && tagSleutel(a) === tagSleutel(b);
const naastElkaar = () => isDesktop();

function zichtbareNotities() {
  const woorden = labelSleutel(notZoek).split(/\s+/).filter(Boolean);
  return levendeNotities()
    .filter((n) => notLabels.every((k) => n.labels.some((l) => isLabel(l, k))))
    .filter((n) => {
      if (!woorden.length) return true;
      const hooi = labelSleutel([n.tekst, punten(n).map((p) => p.tekst).join(' '), n.labels.map(toonLabel).join(' '), n.afspraak ? n.afspraak.titel : ''].join(' '));
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
// Labels om op te filteren: één regel die zijwaarts scrolt, de meest gebruikte voorop. Typ je #woord in de zoekbalk, dan
// alleen de labels die zo beginnen. Kies je een label, dan staan op een tweede regel de labels die in die notities
// voorkomen: zo verfijn je naar een subonderwerp.
function filterHtml() {
  const alle = alleLabels();
  notLabels = notLabels.filter((k) => alle.some((l) => isLabel(l, k)));
  const hekjes = notZoek.split(/\s+/).filter((w) => w.startsWith('#') && w.length > 1).map(tagSleutel);
  const chip = (l, aan, rij) => `<button type="button" class="chip label${aan ? ' aan' : ''}" data-label="${esc(l)}" data-rij="${rij}" aria-pressed="${aan}">${esc(toonLabel(l))}</button>`;
  const hoofd = notLabels[0];
  const rij1 = alle.filter((l) => !hekjes.length || hekjes.some((h) => tagSleutel(l).startsWith(h)));
  const eerste = hoofd ? [hoofd, ...rij1.filter((l) => !isLabel(l, hoofd))] : rij1;
  // Op iPad en Mac lopen de labels door over hooguit twee regels; Meer klapt de rest uit (pasMeerAan)
  // Voorop: Te doen, met het aantal open actiepunten (binnen het gekozen label)
  const open = levendeNotities().filter((n) => notLabels.every((k) => n.labels.some((l) => isLabel(l, k)))).reduce((t, n) => t + openPunten(n).length, 0);
  const teDoen = open || notTeDoen ? `<button type="button" class="chip tedoen${notTeDoen ? ' aan' : ''}" data-tedoen aria-pressed="${notTeDoen}">${I.vink}Te doen<span class="aantal">${open}</span></button>` : '';
  let html = `<div class="chips nfilter nhoofd${notMeer ? ' open' : ''}">${teDoen}${eerste.map((l) => chip(l, isLabel(l, hoofd), 1)).join('')}</div>`
    + (naastElkaar() ? `<button type="button" class="nmeer" hidden>${notMeer ? 'Minder' : 'Meer'}</button>` : '');
  if (!hoofd) return html;
  const sub = notLabels.slice(1);
  const tel = new Map();
  levendeNotities().filter((n) => notLabels.every((k) => n.labels.some((l) => isLabel(l, k)))).forEach((n) => n.labels.forEach((l) => {
    if (notLabels.some((k) => isLabel(l, k))) return;
    const t = tel.get(tagSleutel(l)) || { label: tagVan(l), n: 0 };
    t.n++; tel.set(tagSleutel(l), t);
  }));
  const binnen = [...sub, ...[...tel.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'nl')).map((t) => t.label)];
  if (binnen.length) html += `<div class="chips nfilter nsub" aria-label="Binnen ${esc(toonLabel(hoofd))}">${binnen.map((l) => chip(l, sub.some((k) => isLabel(l, k)), 2)).join('')}</div>`;
  return html;
}
// Meer alleen als de labels niet op twee regels passen (of als ze uitgeklapt zijn)
function pasMeerAan() {
  const rij = $('#notfilter .nhoofd'), knop = $('#notfilter .nmeer');
  if (!rij || !knop) return;
  knop.hidden = !notMeer && rij.scrollHeight <= rij.clientHeight + 1;
}
window.addEventListener('resize', () => { if (ST.tab === 'notities') pasMeerAan(); });
function notitiesHtml() {
  const filter = `<div class="nfilters" id="notfilter">${filterHtml()}</div>`;
  if (!naastElkaar()) return `<div class="notitab">${filter}<div id="notlijst">${notitieLijstHtml()}</div></div>`;
  return `<div class="notitab notisplit"><div class="notilinks">${filter}<div id="notlijst">${notitieLijstHtml()}</div></div><div class="notipaneel" id="notipaneel"></div></div>`;
}
// Te doen: alle open actiepunten uit de zichtbare notities, geordend op deadline. Onder elk punt de notitie of het
// overleg waar het bij hoort; een tik opent die notitie.
function teDoenHtml() {
  const t = vandaag();
  const groepVan = (d) => {
    if (!d) return 'Zonder deadline';
    const dagen = Math.round((deadlineDag(d) - t) / 864e5);
    return dagen < 0 ? 'Te laat' : dagen === 0 ? 'Vandaag' : dagen === 1 ? 'Morgen' : dagen < 7 ? 'Deze week' : 'Later';
  };
  const volgorde = ['Te laat', 'Vandaag', 'Morgen', 'Deze week', 'Later', 'Zonder deadline'];
  const items = [];
  zichtbareNotities().forEach((n) => openPunten(n).forEach((p) => items.push({ n, p, groep: groepVan(p.deadline) })));
  if (!items.length) return `<p class="nleeg nlijstleeg">Geen open actiepunten</p>`;
  items.sort((a, b) => volgorde.indexOf(a.groep) - volgorde.indexOf(b.groep) || String(a.p.deadline || '').localeCompare(String(b.p.deadline || '')) || b.n.gemaakt - a.n.gemaakt); // vast: afvinken laat niets verspringen
  const rij = ({ n, p }) => {
    const [titel] = notitieKop(n);
    const bron = titel === p.tekst.trim() ? '' : titel;
    const dl = p.deadline ? `<span class="tddatum${teLaat(p.deadline) ? ' laat' : ''}">${esc(deadlineTekst(p.deadline))}</span>` : '';
    return `<div class="${naastElkaar() ? '' : 'drij '}notitierij tdrij" data-notitie="${n.id}" role="button" tabindex="0">
      <button type="button" class="puntvink" data-tdvink="${n.id}|${p.id}" aria-label="Afvinken"></button>
      <span class="tekst"><span class="t1">${esc(p.tekst.trim())}</span>${dl || bron ? `<span class="t2">${dl}${esc(bron)}</span>` : ''}</span></div>`;
  };
  return volgorde.filter((g) => items.some((i) => i.groep === g))
    .map((g) => `<h3 class="ngroep${g === 'Te laat' ? ' laat' : ''}">${g}</h3><div class="${naastElkaar() ? 'ngroeplijst' : 'kaart'}">${items.filter((i) => i.groep === g).map(rij).join('')}</div>`).join('');
}
function notitieLijstHtml() {
  if (notTeDoen) return teDoenHtml();
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
    pasMeerAan();
    if (naastElkaar()) vulNotitiepaneel();
    return;
  }
  $('#notfilter', main).innerHTML = filterHtml();
  pasMeerAan();
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
$('#notzoek').addEventListener('input', (ev) => {
  notZoek = ev.target.value;
  const l = $('#notlijst'), f = $('#notfilter');
  if (f) { f.innerHTML = filterHtml(); pasMeerAan(); }
  if (l) l.innerHTML = notitieLijstHtml();
});
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#inhoud .notitab') || ev.target.closest('#notipaneel')) return;
  if (ev.target.closest('.nmeer')) { notMeer = !notMeer; tekenNotities(); return; }
  if (ev.target.closest('[data-tedoen]')) { notTeDoen = !notTeDoen; tekenNotities(); return; }
  const vink = ev.target.closest('[data-tdvink]');
  if (vink) {
    const [nid, pid] = vink.dataset.tdvink.split('|');
    const n = NOTITIES.find((x) => x.id === nid);
    if (n) { wijzigNotitie(n, { punten: punten(n).map((p) => (p.id === pid ? { ...p, klaar: true } : p)) }); tekenNotities(); }
    return;
  }
  const f = ev.target.closest('[data-label]');
  if (f) {
    const l = f.dataset.label;
    if (f.dataset.rij === '1') notLabels = isLabel(notLabels[0], l) ? [] : [l];
    else notLabels = notLabels.some((k) => isLabel(k, l)) ? notLabels.filter((k) => !isLabel(k, l)) : [...notLabels, l];
    tekenNotities();
    return;
  }
  const r = ev.target.closest('[data-notitie]');
  if (!r) return;
  if (naastElkaar()) { bewaarNotities({ meteen: true }); notGekozen = r.dataset.notitie; notNieuw = null; tekenNotities(); }
  else openNotitie({ notitie: NOTITIES.find((n) => n.id === r.dataset.notitie) });
});
