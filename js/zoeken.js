// Agenda, zoeken
// Zoeken in de afspraken: op titel en locatie, zonder op hoofdletters of accenten te letten.
// iPhone en iPad staand: het vergrootglas in de kop opent een zoekveld op de plek van de schakelaar, met de resultaten
// in plaats van de week. iPad liggend en Mac: het zoekveld staat in de werkbalk, de resultaten in een lijst er direct
// onder; een tik op een resultaat sluit de lijst en zet de week op die afspraak, met een rand eromheen.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

const ZOEK = {
  open: false, // telefoon en tablet: het zoekveld staat open
  q: '',
  gekozen: null, // desktop: de afspraak die in de week een rand krijgt
  lijst: false, // desktop: de lijst onder het zoekveld staat open
  uitgeklapt: new Set(), // reeksen die je hebt uitgeklapt, per groep ('komend|…' of 'geweest|…')
  geladen: null,
  cache: null,
};
const ZOEK_WEKEN = BEWAAR_WEKEN; // zo ver terug en vooruit zoeken we; de gepubliceerde agenda reikt meestal minder ver terug

// Zoeken we nu? Op de desktop zodra er iets in het veld staat, elders zolang het zoekveld open is
const zoekt = () => (ST.tab === 'week' || ST.tab === 'forecast') && (isDesktop() ? !!ZOEK.q.trim() : ZOEK.open);

/* ------------------------------------------------------------------ */
/*  Vinden                                                             */
/* ------------------------------------------------------------------ */

// Kleine letters en geen accenten: 'Coupé' vind je met 'coupe'
const vouw = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const zoekWoorden = (q) => vouw(q).split(/\s+/).filter(Boolean);

// De titel met de gevonden woorden gemarkeerd. Per teken gevouwen, zodat de plekken kloppen met de echte titel.
function markeer(tekst, woorden) {
  if (!woorden.length) return esc(tekst);
  let plat = '';
  const plek = [];
  for (let i = 0; i < tekst.length; i++) for (const c of vouw(tekst[i])) { plat += c; plek.push(i); }
  plek.push(tekst.length);
  const stukken = [];
  woorden.forEach((w) => {
    for (let i = plat.indexOf(w); i >= 0; i = plat.indexOf(w, i + 1)) stukken.push([plek[i], plek[i + w.length - 1] + 1]);
  });
  if (!stukken.length) return esc(tekst);
  stukken.sort((a, b) => a[0] - b[0]);
  const samen = [stukken[0]];
  stukken.slice(1).forEach(([a, b]) => { const l = samen[samen.length - 1]; if (a <= l[1]) l[1] = Math.max(l[1], b); else samen.push([a, b]); });
  let html = '', vanaf = 0;
  samen.forEach(([a, b]) => { html += `${esc(tekst.slice(vanaf, a))}<mark>${esc(tekst.slice(a, b))}</mark>`; vanaf = b; });
  return html + esc(tekst.slice(vanaf));
}

function zoekBereik() {
  const t = startOfWeek(vandaag());
  return { van: addDays(t, -7 * ZOEK_WEKEN), tot: addDays(t, 7 * (ZOEK_WEKEN + 1)) };
}

// De weken om in te zoeken klaarzetten; daarna opnieuw tekenen
function zoekLaden() {
  if (!BRON_BEKEND) return;
  const { van, tot } = zoekBereik();
  const sleutel = `${BESTAND ? BESTAND.datum : 'voorbeeld'}|${van.getTime()}`;
  if (ZOEK.geladen === sleutel) return;
  ZOEK.geladen = sleutel;
  Promise.resolve(zorgVoor(addDays(van, -7 * LOOK_AROUND_WEEKS), addDays(tot, 7 * LOOK_AROUND_WEEKS)))
    .then(() => { ZOEK.cache = null; if (zoekt()) render(); })
    .catch(() => { ZOEK.geladen = null; });
}

// Alle afspraken in het bereik, verrijkt. Even bewaard, zodat typen vlot blijft.
function zoekAlle() {
  const { van, tot } = zoekBereik();
  const sleutel = `${DATA.ruw.size}|${DATA.weken.size}|${BESTAND ? BESTAND.datum : 'voorbeeld'}|${van.getTime()}|${Math.floor(Date.now() / 5000)}`;
  if (!ZOEK.cache || ZOEK.cache.sleutel !== sleutel) ZOEK.cache = { sleutel, lijst: afsprakenTussen(van, tot) };
  return ZOEK.cache.lijst;
}

// Keren van dezelfde reeks horen bij elkaar: een herhaalreeks aan zijn UID, een vast overleg zonder reeks aan zijn titel
const reeksVan = (e) => (e.recurring || e.detached ? `u|${e.uid}` : e.regular ? `t|${titleKey(e.title)}` : null);
function ritmeVan(e) {
  const r = e.repeat;
  if (!r) return '';
  const n = r.interval || 1;
  if (r.freq === 'daily') return n === 1 ? 'Elke dag' : `Elke ${n} dagen`;
  if (r.freq === 'weekly') return n === 1 ? 'Elke week' : n === 2 ? 'Om de week' : `Elke ${n} weken`;
  if (r.freq === 'monthly') return n === 1 ? 'Elke maand' : `Elke ${n} maanden`;
  if (r.freq === 'yearly') return 'Elk jaar';
  return '';
}
function groepeer(lijst) {
  const groepen = [];
  const per = new Map();
  lijst.forEach((e) => {
    const k = reeksVan(e);
    if (k && per.has(k)) { per.get(k).rest.push(e); return; }
    const g = { e, rest: [], sleutel: k };
    if (k) per.set(k, g);
    groepen.push(g);
  });
  return groepen;
}

function zoekResultaten() {
  const woorden = zoekWoorden(ZOEK.q);
  if (!woorden.length) return null;
  const alle = zoekAlle();
  const nuMs = nu().getTime();
  const treffers = alle.filter((e) => { const h = vouw(`${e.title} ${e.location || ''}`); return woorden.every((w) => h.includes(w)); });
  ZOEK.treffers = new Map(treffers.map((e) => [e.id, e]));
  // Tot waar de agenda teruggaat: de vroegste losse afspraak (een reeks rolt de app uit vanaf het begin)
  const los = alle.filter((e) => !e.recurring && !e.detached);
  const grens = (los.length ? los : alle).reduce((m, e) => (e.start < m ? e.start : m), zoekBereik().tot);
  return {
    woorden,
    aantal: treffers.length,
    komend: groepeer(treffers.filter((e) => e.end.getTime() > nuMs)),
    geweest: groepeer(treffers.filter((e) => e.end.getTime() <= nuMs).reverse()),
    grens,
  };
}

/* ------------------------------------------------------------------ */
/*  Tekenen                                                            */
/* ------------------------------------------------------------------ */

const PIJL_OMLAAG = lijn('<path d="M6 9l6 6 6-6"/>', 2.6);
const PIJL_OMHOOG = lijn('<path d="M6 15l6-6 6 6"/>', 2.6);
const WIS = vol('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.5 12.1-1.4 1.4L12 13.4l-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1z"/>');

const datumMetJaar = (d) => `${d.getDate()} ${MONTHS_LONG[d.getMonth()]}${d.getFullYear() !== vandaag().getFullYear() ? ` ${d.getFullYear()}` : ''}`;

function zoekRij(e, woorden) {
  const d = e.start;
  const jaar = d.getFullYear() !== vandaag().getFullYear() ? ` ’${String(d.getFullYear()).slice(2)}` : '';
  const tijd = e.allDay ? 'hele dag' : `${hhmm(e.start)} – ${hhmm(e.end)}`;
  return `<button class="zrij${ZOEK.gekozen === e.id && isDesktop() ? ' aan' : ''}" data-zoek="${esc(e.id)}" aria-label="${esc(`${e.title || 'Zonder titel'}, ${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}${jaar}, ${tijd}`)}">
    <span class="zdatum" aria-hidden="true"><span class="zdow">${DAYS_SHORT[d.getDay()]}</span><span class="znr num">${d.getDate()}</span><span class="zmnd">${MONTHS_SHORT[d.getMonth()]}${jaar}</span></span>
    <span class="stip ${e.kind}"></span>
    <span class="rijtekst" aria-hidden="true">
      <span class="rijtitel">${markeer(e.title || 'Zonder titel', woorden)}</span>
      <span class="zmeta"><span class="num">${tijd}</span>${e.location ? `<span class="zplek">${I.speld}<span>${esc(e.location)}</span></span>` : ''}</span>
      ${badgesHtml(e)}
    </span>
  </button>`;
}

function zoekGroepenHtml(groepen, soort, woorden) {
  return groepen.map((g) => {
    let html = `<div class="zitem">${zoekRij(g.e, woorden)}`;
    if (g.rest.length) {
      const k = `${soort}|${g.sleutel}`;
      const open = ZOEK.uitgeklapt.has(k);
      const ritme = ritmeVan(g.e);
      const tekst = open ? 'Inklappen' : `${ritme ? `${ritme}, ` : ''}nog ${g.rest.length} keer${soort === 'geweest' ? ' eerder' : ''}`;
      html += `<button class="zreeks" data-reeks="${esc(k)}" aria-expanded="${open}">${I.herhaal}<span>${tekst}</span>${open ? PIJL_OMHOOG : PIJL_OMLAAG}</button>`;
      if (open) html += g.rest.map((e) => `<div class="zitem">${zoekRij(e, woorden)}</div>`).join('');
    }
    return `${html}</div>`;
  }).join('');
}

function zoekHtml() {
  const r = zoekResultaten();
  if (!r) return '<div class="zoekres"></div>';
  const voet = `<p class="zoekvoet">Tot ${datumMetJaar(r.grens)} terug</p>`;
  if (!r.aantal) return `<div class="zoekres"><p class="zoekniets">Niets gevonden</p>${voet}</div>`;
  const sectie = (kop, groepen, soort) => (groepen.length ? `<h2 class="zoekkop">${kop}</h2><div class="kaart zoekkaart">${zoekGroepenHtml(groepen, soort, r.woorden)}</div>` : '');
  return `<div class="zoekres">${sectie('Komend', r.komend, 'komend')}${sectie('Geweest', r.geweest, 'geweest')}${voet}</div>`;
}

// Desktop: de resultaten in een lijst direct onder het zoekveld, zoals de suggesties onder het zoekveld in Notities
const zoeklijstEl = document.createElement('div');
zoeklijstEl.className = 'zoekvoorstel zoeklijst';
zoeklijstEl.id = 'zoeklijst';
zoeklijstEl.setAttribute('role', 'region');
zoeklijstEl.setAttribute('aria-label', 'Zoekresultaten');
zoeklijstEl.hidden = true;
document.body.appendChild(zoeklijstEl);
function tekenZoeklijst() {
  if (!(zoekt() && isDesktop() && ZOEK.lijst)) { zoeklijstEl.hidden = true; return; }
  const y = zoeklijstEl.hidden ? 0 : zoeklijstEl.scrollTop;
  zoeklijstEl.innerHTML = zoekHtml();
  plaatsZoeklijst();
  zoeklijstEl.hidden = false;
  zoeklijstEl.scrollTop = y;
}
function plaatsZoeklijst() {
  const r = $('#agendazoek').getBoundingClientRect();
  const breed = Math.min(Math.max(r.width, matchMedia('(pointer: coarse)').matches ? 420 : 360), innerWidth - 24);
  zoeklijstEl.style.left = `${Math.max(12, Math.min(r.left, innerWidth - breed - 12))}px`;
  zoeklijstEl.style.top = `${r.bottom + 8}px`;
  zoeklijstEl.style.width = `${breed}px`;
  zoeklijstEl.style.maxHeight = `${Math.max(200, innerHeight - r.bottom - 24)}px`;
}

// De kop: het vergrootglas, het zoekveld en Annuleer
function zetZoekKop() {
  const agenda = ST.tab === 'week' || ST.tab === 'forecast';
  const open = agenda && !isDesktop() && ZOEK.open;
  document.body.classList.toggle('zoekt', open);
  $('#zoekknop').setAttribute('aria-pressed', String(open));
  const veld = $('#agzoek');
  if (document.activeElement !== veld && veld.value !== ZOEK.q) veld.value = ZOEK.q;
  $('#zoekwis').hidden = !ZOEK.q;
  tekenZoeklijst();
}

/* ------------------------------------------------------------------ */
/*  Bediening                                                          */
/* ------------------------------------------------------------------ */

let _zoekTimer = null;
function zoekTekenStraks() {
  clearTimeout(_zoekTimer);
  _zoekTimer = setTimeout(render, 120);
}

function zetZoekterm(q) {
  ZOEK.q = q;
  if (!q.trim()) { ZOEK.gekozen = null; ZOEK.uitgeklapt.clear(); }
  $('#zoekwis').hidden = !q;
  if (q.trim()) zoekLaden();
}

function openZoeken() {
  ZOEK.open = true;
  document.body.classList.add('zoekt');
  $('#agzoek').focus(); // meteen, binnen de tik: anders opent iOS het toetsenbord niet
  zoekLaden();
  window.scrollTo(0, 0);
  render();
}

// Telefoon en tablet: terug naar de week. Op de desktop: het veld leegmaken.
function sluitZoeken({ naarVandaag = true } = {}) {
  if (!ZOEK.open && !ZOEK.q) return;
  clearTimeout(_zoekTimer);
  ZOEK.open = false;
  ZOEK.lijst = false;
  zetZoekterm('');
  $('#agzoek').value = '';
  $('#agzoek').blur();
  if (naarVandaag) { window.scrollTo(0, 0); ST.naarVandaag = true; }
  render();
}

// Telefoon en tablet: naar een andere week of tab sluit het zoeken (zonder zelf te tekenen; dat doet de aanroeper)
function zoekenDichtBijNavigeren() {
  if (isDesktop() || !ZOEK.open) return;
  clearTimeout(_zoekTimer);
  ZOEK.open = false;
  zetZoekterm('');
  $('#agzoek').value = '';
  $('#agzoek').blur();
}

// Desktop: de lijst dicht en de week naar de gekozen afspraak; tik je er nog eens op, dan opent hij
function kiesTreffer(e) {
  if (!isDesktop()) { openDetail(e); return; }
  const week = startOfWeek(e.start).getTime();
  ZOEK.lijst = false;
  $('#agzoek').blur();
  if (ZOEK.gekozen === e.id && ST.tab === 'week' && startOfWeek(ST.anker).getTime() === week) { tekenZoeklijst(); openDetail(e); return; }
  ZOEK.gekozen = e.id;
  ST.tab = 'week';
  LS.set('ag_tab', 'week');
  LS.set('ag_weergave', 'week');
  ST.anker = new Date(week);
  if (zijMaand) zijMaand = firstOfMonth(addDays(ST.anker, 3));
  ST.naarVandaag = false;
  laad();
}

$('#zoekknop').innerHTML = lijn('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>', 2.2);
$('#zoekwis').innerHTML = WIS;
$('#zoekknop').addEventListener('click', () => { if (ZOEK.open) sluitZoeken(); else openZoeken(); });
$('#zoekannuleer').addEventListener('click', () => sluitZoeken());
$('#zoekwis').addEventListener('click', (ev) => {
  ev.preventDefault();
  zetZoekterm('');
  $('#agzoek').value = '';
  $('#agzoek').focus();
  render();
});
$('#agzoek').addEventListener('input', (ev) => { zetZoekterm(ev.target.value); ZOEK.lijst = true; zoekTekenStraks(); });
$('#agzoek').addEventListener('focus', () => { if (isDesktop() && ZOEK.q.trim() && !ZOEK.lijst) { ZOEK.lijst = true; tekenZoeklijst(); } });
window.addEventListener('resize', () => { if (!zoeklijstEl.hidden) plaatsZoeklijst(); });
$('#agzoek').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); if (!isDesktop()) ev.target.blur(); } // het toetsenbord weg, de resultaten in beeld
  else if (ev.key === 'Escape') { ev.preventDefault(); sluitZoeken({ naarVandaag: false }); }
});
document.addEventListener('click', (ev) => {
  // Desktop: een tik buiten het zoekveld en de lijst sluit de lijst; de rand in de week blijft staan
  if (!zoeklijstEl.hidden && !ev.target.closest('#zoeklijst, #agendazoek')) { ZOEK.lijst = false; zoeklijstEl.hidden = true; }
  const reeks = ev.target.closest('#inhoud [data-reeks], #zoeklijst [data-reeks]');
  if (reeks) {
    const k = reeks.dataset.reeks;
    if (ZOEK.uitgeklapt.has(k)) ZOEK.uitgeklapt.delete(k); else ZOEK.uitgeklapt.add(k);
    render();
    return;
  }
  const rij = ev.target.closest('#inhoud [data-zoek], #zoeklijst [data-zoek]');
  if (rij && ZOEK.treffers && ZOEK.treffers.has(rij.dataset.zoek)) kiesTreffer(ZOEK.treffers.get(rij.dataset.zoek));
});
