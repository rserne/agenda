// Agenda, tab Notities
// De lijst met notities, de filters in de zijbalk (iPad en Mac) en het zoeken. Op iPad en Mac staat de
// notitie rechts naast de lijst; op de iPhone opent hij als eigen scherm.
// Gewoon script (geen module): het gebruikt NOTITIES en de hulpjes uit js/notities.js, openPaneel, esc en de iconen.
'use strict';

/* ------------------------------------------------------------------ */
/*  Tab Notities                                                       */
/* ------------------------------------------------------------------ */

// iPhone en iPad staand: de lijst, met boven het zoekveld; labels en Te doen kies je als blokjes in het zoekveld en een
// notitie opent als eigen scherm. iPad liggend en Mac: links de filters (in de zijbalk), dan de lijst en rechts de notitie.
let notZoek = '';
let notLabels = []; // de gekozen labels: het eerste, en eventueel labels daarbinnen
let notTeDoen = false; // de open actiepunten in plaats van de notities
let notGekozen = null; // iPad en Mac: de notitie rechts naast de lijst
let notGekozenPunt = null; // bij Actiepunten: het punt waarop je tikte (een notitie kan er meer hebben)
let notNieuw = null; // een nieuwe notitie rechts die nog leeg is (en dus nog niet in de lijst staat)
const isLabel = (a, b) => !!a && !!b && tagSleutel(a) === tagSleutel(b);
const naastElkaar = () => isDesktop();
const GROF = window.matchMedia('(pointer: coarse)');
// De gekozen filters als blokjes in het zoekveld: op iPhone en iPad staand, en op de iPad liggend als de filters zijn
// ingeklapt. Staan de filters in beeld, dan zie je daar wat je hebt gekozen.
const blokjesInZoekveld = () => !isDesktop() || (GROF.matches && document.body.classList.contains('zbdicht'));

function deadlineGroep(d) {
  if (!d) return 'Zonder deadline';
  const dagen = Math.round((deadlineDag(d) - vandaag()) / 864e5);
  return dagen < 0 ? 'Te laat' : dagen === 0 ? 'Vandaag' : dagen === 1 ? 'Morgen' : dagen < 7 ? 'Deze week' : 'Later';
}
const metLabels = (n, extra = null) => [...notLabels, ...(extra ? [extra] : [])].every((k) => n.labels.some((l) => isLabel(l, k)));
function vindbaar(n) {
  const woorden = labelSleutel(notZoek).split(/\s+/).filter(Boolean);
  if (!woorden.length) return true;
  const hooi = labelSleutel([n.tekst, punten(n).map((p) => p.tekst).join(' '), n.labels.map(toonLabel).join(' '), n.afspraak ? n.afspraak.titel : ''].join(' '));
  return woorden.every((w) => hooi.includes(w));
}
const binnenSelectie = (n) => metLabels(n);
function zichtbareNotities() {
  return levendeNotities()
    .filter((n) => binnenSelectie(n) && vindbaar(n))
    .sort((a, b) => notitieMoment(b) - notitieMoment(a)); // de nieuwste bovenaan: de afspraak, of de laatste wijziging
}
// Te doen: alle open actiepunten uit de zichtbare notities, geordend op deadline
const TEDOEN_GROEPEN = ['Te laat', 'Vandaag', 'Morgen', 'Deze week', 'Later', 'Zonder deadline'];
function teDoenItems() {
  const items = [];
  zichtbareNotities().forEach((n) => openPunten(n).forEach((p) => items.push({ n, p, groep: deadlineGroep(p.deadline) })));
  return items.sort((a, b) => TEDOEN_GROEPEN.indexOf(a.groep) - TEDOEN_GROEPEN.indexOf(b.groep)
    || String(a.p.deadline || '').localeCompare(String(b.p.deadline || '')) || b.n.gemaakt - a.n.gemaakt); // vast: afvinken laat niets verspringen
}
// De notitie rechts: een nieuwe, de gekozen, of anders de bovenste uit de lijst. Bij Actiepunten blijft de gekozen
// notitie staan als je daar het laatste punt afvinkt, ook al valt hij dan uit de lijst.
function gekozenNotitie() {
  if (notNieuw && NOTITIES.includes(notNieuw) && !notNieuw.weg) { notGekozen = notNieuw.id; notNieuw = null; }
  if (notNieuw) return notNieuw;
  const lijst = notTeDoen ? [...new Set(teDoenItems().map((i) => i.n))] : zichtbareNotities();
  const vast = notTeDoen ? levendeNotities().find((x) => x.id === notGekozen) : null;
  const n = lijst.find((x) => x.id === notGekozen) || vast || lijst[0] || null;
  notGekozen = n ? n.id : null;
  return n;
}
// Op iPad en Mac staat het zoekveld boven de lijst, en op de iPad het knopje van de filters naast de titel. Het zijn
// dezelfde elementen als in de kop: we verplaatsen ze, en zetten ze terug voordat de inhoud opnieuw wordt opgebouwd.
const zoekbalkEl = $('#zoekbalk');
const zijbalkknopEl = $('#zijbalkknop');
const kopThuis = [zoekbalkEl, zijbalkknopEl].map((el) => ({ el, ouder: el.parentNode, na: el.nextSibling }));
function zoekbalkThuis() { kopThuis.forEach(({ el, ouder, na }) => { if (el.parentNode !== ouder) ouder.insertBefore(el, na); }); }
function notitiesHtml() {
  if (!naastElkaar()) return `<div class="notitab"><div id="notlijst">${notitieLijstHtml()}</div></div>`;
  return `<div class="notitab notisplit"><div class="notilinks"><div class="notkop"><h1 class="notkoptitel">Notities</h1></div><div id="notlijst">${notitieLijstHtml()}</div></div><div class="notipaneel" id="notipaneel"></div></div>`;
}
// Onder elk actiepunt de notitie of het overleg waar het bij hoort; een tik opent die notitie
function teDoenHtml() {
  const items = teDoenItems();
  if (!items.length) return `<p class="nleeg nlijstleeg">Geen open actiepunten</p>`;
  // Gekleurd is één punt: het punt waarop je tikte, of anders het eerste punt van de notitie die rechts staat
  const gekozen = naastElkaar() ? gekozenNotitie() : null;
  const vanGekozen = gekozen ? items.filter((i) => i.n.id === gekozen.id) : [];
  const aanPunt = (vanGekozen.find((i) => i.p.id === notGekozenPunt) || vanGekozen[0] || {}).p;
  const rij = ({ n, p }) => {
    const [titel] = notitieKop(n);
    const bron = titel === p.tekst.trim() ? '' : titel;
    const dl = p.deadline ? `<span class="tddatum${teLaat(p.deadline) ? ' laat' : ''}">${esc(deadlineTekst(p.deadline))}</span>` : '';
    const aan = !!aanPunt && aanPunt.id === p.id;
    return `<div class="drij notitierij tdrij${aan ? ' aan' : ''}" data-notitie="${n.id}" data-punt="${p.id}" role="button" tabindex="0">
      <button type="button" class="puntvink" data-tdvink="${n.id}|${p.id}" aria-label="Afvinken"></button>
      <span class="tekst"><span class="t1">${esc(p.tekst.trim())}</span>${dl || bron ? `<span class="t2">${dl}${esc(bron)}</span>` : ''}</span></div>`;
  };
  return TEDOEN_GROEPEN.filter((g) => items.some((i) => i.groep === g))
    .map((g) => `<h3 class="ngroep${g === 'Te laat' ? ' laat' : ''}">${g}</h3><div class="${naastElkaar() ? 'nrijen' : 'kaart'}">${items.filter((i) => i.groep === g).map(rij).join('')}</div>`).join('');
}
function notitieLijstHtml() {
  if (notTeDoen) return teDoenHtml();
  const lijst = zichtbareNotities();
  const gekozen = naastElkaar() ? gekozenNotitie() : null;
  if (!lijst.length) return `<p class="nleeg nlijstleeg">${levendeNotities().length ? 'Niets gevonden' : 'Nog geen notities'}</p>`;
  // In groepen (Vandaag, Gisteren, ...) zoals in Notities van Apple, naar hetzelfde moment als de datum in de regel:
  // de afspraak, of bij een losse notitie de laatste wijziging. Op de iPhone een kaart per groep met een pijltje naar
  // de notitie; op iPad en Mac regels met dunne lijnen ertussen, zoals in Notities van Apple, en de notitie die rechts
  // staat als gevuld vlak.
  const groepen = [];
  for (const n of lijst) {
    const g = wijzigGroep(notitieMoment(n).getTime());
    if (!groepen.length || groepen[groepen.length - 1].naam !== g) groepen.push({ naam: g, notities: [] });
    groepen[groepen.length - 1].notities.push(n);
  }
  const rij = (n) => {
    const [titel, voorproef] = notitieKop(n);
    const inhoud = `<span class="t1">${esc(titel)}</span>
        <span class="t2"><span class="ndatum">${esc(wijzigDatum(notitieMoment(n).getTime()))}</span>${esc(voorproef || 'Geen extra tekst')}</span>`; // de labels staan alleen in de notitie zelf
    if (!naastElkaar()) return `<button class="drij notitierij" data-notitie="${n.id}"><span class="tekst">${inhoud}</span>${I.verder}</button>`;
    const aan = !!gekozen && gekozen.id === n.id;
    return `<button class="drij notitierij${aan ? ' aan' : ''}" data-notitie="${n.id}" aria-pressed="${aan}"><span class="tekst">${inhoud}</span></button>`;
  };
  return groepen.map((g) => `<h3 class="ngroep">${g.naam}</h3><div class="${naastElkaar() ? 'nrijen' : 'kaart'}">${g.notities.map(rij).join('')}</div>`).join('');
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
// Opnieuw tekenen als de tab Notities in beeld is. Staat de lijst er al, dan alleen de lijst en de filters: zo blijft
// de notitie rechts staan terwijl je typt (ook als er intussen iets via de Worker binnenkomt).
function tekenNotities(volledig = false) {
  if (ST.tab !== 'notities') return;
  const main = $('#inhoud');
  if (volledig || !$('#notlijst', main) || !!$('#notipaneel', main) !== naastElkaar()) {
    const bezig = document.activeElement === zoekVeld;
    zoekbalkThuis();
    main.innerHTML = notitiesHtml();
    if (naastElkaar()) {
      const kop = $('.notkop', main);
      kop.prepend(zijbalkknopEl); // iPad: de filters in- en uitklappen, naast de titel
      kop.after(zoekbalkEl);
      if (bezig) zoekVeld.focus();
    }
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
// iPad en Mac: een notitie vanuit de agenda (bij een afspraak, of uit het overzicht van de dag) opent in de tab
// Notities, rechts naast de lijst. Zo schrijf je altijd op dezelfde plek. Zoeken en filters gaan uit, zodat de notitie
// in de lijst staat. Alles gebeurt binnen de tik, zodat iOS het toetsenbord meteen toont.
function toonInNotities({ notitie = null, e = null } = {}) {
  if (!notitiesKlaar) { laadNotities().then(() => toonInNotities({ notitie, e })); return; }
  bewaarNotities({ meteen: true });
  const n = notitie || (e && notitieBij(e.id)) || null;
  notTeDoen = false; notLabels = []; notZoek = ''; zoekVeld.value = '';
  if (n) { notGekozen = n.id; notNieuw = null; } else notNieuw = maakNotitie(e);
  if (ST.tab === 'notities') tekenNotities(true); else kiesTab('notities');
  const t = $('#notipaneel #nottekst');
  if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
}
// Een nieuwe notitie: op iPad en Mac in de tab Notities meteen rechts, anders als eigen scherm of venster
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
/*  Filters in de zijbalk (iPad liggend en Mac)                        */
/* ------------------------------------------------------------------ */

// Bovenaan wat je ziet: Alle notities of Actiepunten. Daaronder de labels (zonder #), de meest gebruikte eerst, elk met
// een vinkvakje: vink je er meer aan, dan zie je de notities met al die labels. Achter elke keuze staat hoeveel er
// overblijft als je hem kiest.
let nfAlleLabels = false;
const NF_MAX = 8;
function notFiltersHtml() {
  const inTab = ST.tab === 'notities';
  const levend = levendeNotities().filter(vindbaar);
  const soort = notTeDoen ? 'tedoen' : 'alle';
  const telVan = (n, s) => (s === 'tedoen' ? openPunten(n).length : 1);
  const som = (s, label = null) => levend.reduce((t, n) => t + (metLabels(n, label) ? telVan(n, s) : 0), 0);
  const item = (s, icoon, tekst) => {
    const aan = inTab && soort === s;
    return `<button type="button" data-tab="notities" data-nf-soort="${s}" class="${aan ? 'aan' : ''}" aria-pressed="${aan}">${icoon}<span class="nftekst">${tekst}</span><span class="aantal">${som(s)}</span></button>`;
  };
  const labels = alleLabels().map((l) => [l, som(soort, l)]).filter(([l, a]) => a || notLabels.some((k) => isLabel(l, k)));
  const zichtbaar = nfAlleLabels ? labels : labels.slice(0, NF_MAX);
  const label = ([l, a]) => {
    const aan = notLabels.some((k) => isLabel(l, k));
    return `<button type="button" data-nf-label="${esc(l)}" class="nflabel${aan ? ' aan' : ''}" role="checkbox" aria-checked="${aan}"><span class="zbkeus${aan ? ' aan' : ''}" aria-hidden="true">${aan ? I.vink : ''}</span><span class="nftekst">${esc(tagVan(l))}</span><span class="aantal">${a}</span></button>`;
  };
  return `<nav class="zblijst zbnotities" aria-label="Notities"><h3>Notities</h3>${item('alle', I.notitie, 'Alle notities')}${item('tedoen', I.actiepunt, 'Actiepunten')}</nav>`
    + (labels.length ? `<nav class="zblijst zblabels" aria-label="Labels"><h3>Labels</h3>${zichtbaar.map(label).join('')}
      ${labels.length > NF_MAX ? `<button type="button" class="zbmeer" data-nf-meer>${nfAlleLabels ? 'Minder labels' : `Alle labels (${labels.length})`}</button>` : ''}</nav>` : '');
}
function tekenFilters() { const vak = $('#zbnotfilters'); if (vak) vak.innerHTML = notFiltersHtml(); }
// Vóór de tabknoppen: in de agenda opent een keuze de tab Notities (data-tab), met deze keuze
document.addEventListener('click', (ev) => {
  const k = ev.target.closest('#zbnotfilters button');
  if (!k) return;
  if (k.dataset.nfSoort) {
    const td = k.dataset.nfSoort === 'tedoen';
    if (td !== notTeDoen) { notTeDoen = td; notGekozen = null; notNieuw = null; }
  } else if (k.dataset.nfLabel) {
    const l = k.dataset.nfLabel;
    notLabels = notLabels.some((x) => isLabel(x, l)) ? notLabels.filter((x) => !isLabel(x, l)) : [...notLabels, l];
  } else if (k.dataset.nfMeer !== undefined) { nfAlleLabels = !nfAlleLabels; tekenFilters(); return; }
  tekenNotities();
});

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
function tekenZoek() {
  notLabels = notLabels.filter((k) => alleLabels().some((l) => isLabel(l, k)));
  tekenFilters();
  const blokje = (tekst, sleutel) => `<button type="button" class="zoektoken" data-token="${esc(sleutel)}" aria-label="${esc(tekst)} weghalen">${esc(tekst)}${I.kruis}</button>`;
  const tokens = $('#zoektokens');
  tokens.innerHTML = blokjesInZoekveld()
    ? (notTeDoen ? blokje('Te doen', '') : '') + notLabels.map((l) => blokje(toonLabel(l), l)).join('')
    : '';
  tokens.scrollLeft = tokens.scrollWidth; // het laatste blokje in beeld; de rest door zijwaarts te vegen
  zoekVeld.placeholder = tokens.childElementCount ? '' : 'Zoeken';
  if (!voorstelEl.hidden) toonVoorstel();
}
function toonVoorstel() {
  if (ST.tab !== 'notities' || !blokjesInZoekveld()) { voorstelEl.hidden = true; return; } // anders staat de keuze links
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
  if (ev.key === 'Backspace' && zoekVeld.selectionStart === 0 && zoekVeld.selectionEnd === 0 && blokjesInZoekveld() && (notLabels.length || notTeDoen)) {
    ev.preventDefault();
    if (notLabels.length) notLabels.pop(); else notTeDoen = false;
    nieuwZoeken();
  } else if (ev.key === 'Escape' || ev.key === 'Enter') { voorstelEl.hidden = true; if (ev.key === 'Enter') zoekVeld.blur(); }
});
// Een keuze houdt het zoekveld actief (geen blur), zodat je verder kunt verfijnen
voorstelEl.addEventListener('pointerdown', (ev) => ev.preventDefault());
voorstelEl.addEventListener('mousedown', (ev) => ev.preventDefault());
voorstelEl.addEventListener('click', (ev) => {
  const k = ev.target.closest('[data-zv]');
  if (!k) return;
  if (k.dataset.zv === 'tedoen') { notTeDoen = true; notGekozen = null; }
  else {
    notLabels.push(k.dataset.zv);
    if (hekjeWoord() !== null) { zoekVeld.value = zoekVeld.value.replace(/(?:^|\s)#\S*$/, '').trimEnd(); notZoek = zoekVeld.value; }
  }
  nieuwZoeken(); toonVoorstel();
});
$('#zoektokens').addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-token]');
  if (!t) return;
  ev.preventDefault();
  if (t.dataset.token === '') notTeDoen = false;
  else notLabels = notLabels.filter((k) => !isLabel(k, t.dataset.token));
  nieuwZoeken();
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
  if (naastElkaar()) { bewaarNotities({ meteen: true }); notGekozen = r.dataset.notitie; notGekozenPunt = r.dataset.punt || null; notNieuw = null; tekenNotities(); }
  else openNotitie({ notitie: NOTITIES.find((n) => n.id === r.dataset.notitie) });
});
