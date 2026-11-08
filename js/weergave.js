// Agenda, weergave
// De toestand van de app en de schermen Week en Vooruitblik, met de kop, het filter en de tabbalk.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

/* ------------------------------------------------------------------ */
/*  Toestand                                                           */
/* ------------------------------------------------------------------ */

const ST = {
  tab: 'week', // week | forecast
  filter: 'notable', // notable | all | free
  anker: defaultWeekAnchor(vandaag()),
  fcStart: vandaag(),
  dag: vandaag(),
  laden: false,
  fout: null,
  naarVandaag: true, // telefoon: bij het openen van de week direct naar vandaag scrollen
};
const zichtbaar = new Map(); // id → verrijkte afspraak, voor het detailscherm

const periode = () => {
  const start = ST.tab === 'week' ? startOfWeek(ST.anker) : ST.fcStart;
  return { start, eind: addDays(start, 7) };
};

/* ------------------------------------------------------------------ */
/*  Weergave: Week                                                     */
/* ------------------------------------------------------------------ */

function badgesHtml(e, max = MAX_ORGS) {
  if (!e.external) return '';
  const shown = e.orgs.slice(0, max);
  const rest = e.orgs.length - shown.length;
  return `<div class="badges">${e.regular ? `<span class="herhaal" title="Terugkerend">${I.herhaal}</span>` : ''}${shown.map((o) => `<span class="badge">${esc(o)}</span>`).join('')}${rest > 0 ? `<span class="meer">+${rest}</span>` : ''}</div>`;
}

function weekRij(e, ov) {
  const onSite = e.mode === 'physical' || e.mode === 'hybrid';
  return `<button class="rij${e.notable ? '' : ' vast'}${overlapt(e, ov) ? ' overlapt' : ''}" data-id="${esc(e.id)}">
    <span class="stip ${e.kind}"></span>
    <span class="tijdkolom"><div class="tijd">${hhmm(e.start)}</div><div class="eind">${hhmm(e.end)}</div></span>
    <span class="rijtekst">
      <span class="titelregel"><span class="rijtitel">${esc(e.title || 'Zonder titel')}</span>${onSite ? `<span class="speld" aria-label="op locatie">${I.speld}</span>` : ''}</span>
      ${overlapLabel(e, ov)}${badgesHtml(e)}
    </span>
  </button>`;
}

function vrijRij(f) {
  return `<button class="rij vrij" style="--uren:${(f.min / 60).toFixed(2)}" data-vrij="${f.start.getTime()}-${f.end.getTime()}" aria-label="Vrij van ${hhmm(f.start)} tot ${hhmm(f.end)}, ${freeText(f.min)}. Afspraak toevoegen">
    <span class="stip"></span>
    <span class="tijdkolom"><div class="tijd">${hhmm(f.start)}</div><div class="eind">${hhmm(f.end)}</div></span>
    <span class="rijtekst"><span class="rijtitel"><b>Vrij</b><span> · ${freeText(f.min)}</span></span></span>
    <span class="plus" aria-hidden="true">${I.plus}</span>
  </button>`;
}

// Desktop: de werkdagen naast elkaar in kolommen, weekenddagen alleen als er iets staat
function kolomRij(e, ov) {
  const onSite = e.mode === 'physical' || e.mode === 'hybrid';
  return `<button class="krij${e.notable ? '' : ' vast'}${overlapt(e, ov) ? ' overlapt' : ''}" data-id="${esc(e.id)}">
    <span class="stip ${e.kind}"></span>
    <span class="rijtekst">
      <span class="ktijd num">${hhmm(e.start)} – ${hhmm(e.end)}${onSite ? `<span class="speld" aria-label="op locatie">${I.speld}</span>` : ''}</span>
      <span class="rijtitel">${esc(e.title || 'Zonder titel')}</span>
      ${overlapLabel(e, ov)}${badgesHtml(e)}
    </span>
  </button>`;
}
function kolomVrij(f) {
  return `<button class="krij vrij" style="--uren:${(f.min / 60).toFixed(2)}" data-vrij="${f.start.getTime()}-${f.end.getTime()}" aria-label="Vrij van ${hhmm(f.start)} tot ${hhmm(f.end)}, ${freeText(f.min)}. Afspraak toevoegen">
    <span class="stip"></span>
    <span class="rijtekst"><span class="ktijd num">${hhmm(f.start)} – ${hhmm(f.end)}</span><span class="rijtitel"><b>Vrij</b><span> · ${freeText(f.min)}</span></span></span>
    <span class="plus" aria-hidden="true">${I.plus}</span>
  </button>`;
}
function weekKolommenHtml(events) {
  const { start } = periode();
  const t = vandaag();
  const kolommen = [];
  const breedtes = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const lijst = eventsForDay(events, d);
    // Een leeg weekend krijgt een smalle kolom: de werkdagen hebben de ruimte harder nodig
    const smal = i >= 5 && !lijst.length;
    breedtes.push(smal ? 'minmax(64px, 0.35fr)' : 'minmax(0, 1fr)');
    const heleDag = lijst.filter((e) => e.allDay);
    const getimed = lijst.filter((e) => !e.allDay);
    const getoond = ST.filter === 'notable' ? getimed.filter((e) => e.notable) : getimed;
    const verborgen = getimed.length - getoond.length;
    const vrij = ST.filter === 'free' && i < 5 && d >= t ? freeSlots(lijst, d) : [];
    const items = [...getoond.map((e) => ({ t: e.start.getTime(), e })), ...vrij.map((f) => ({ t: f.start.getTime(), f }))].sort((a, b) => a.t - b.t);
    // Hele dagen als smalle balk bovenaan de kolom, zoals in Agenda op de Mac
    let rijen = heleDag.map((e) => `<button class="heledagbalk" data-id="${esc(e.id)}"><span>${esc(e.title)}</span></button>`).join('');
    const ov = overlapVan(lijst);
    rijen += items.map((it) => (it.e ? kolomRij(it.e, ov) : kolomVrij(it.f))).join('');
    if (verborgen > 0) rijen += `<div class="krij rest"><span class="stip"></span><span>${vastText(verborgen)}</span></div>`;
    if (!rijen) rijen = smal ? '' : '<div class="krij rest leeg">Geen afspraken</div>';
    const isVandaag = sameDay(d, t);
    kolommen.push(`<section class="dagkolom${isVandaag ? ' vandaag' : ''}${d < t ? ' voorbij' : ''}${i >= 5 ? ' weekend' : ''}${smal ? ' smal' : ''}">
      <h2 class="kolomkop" aria-label="${isVandaag ? 'Vandaag, ' : ''}${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}"><span class="nr num">${d.getDate()}</span><span class="dow">${smal ? cap(DAYS_SHORT[d.getDay()]) : cap(DAYS_LONG[d.getDay()])}</span>${d.getDate() === 1 && i > 0 ? `<span class="mnd">${MONTHS_SHORT[d.getMonth()]}</span>` : ''}</h2>
      ${rijen ? `<div class="kaart">${rijen}</div>` : ''}
    </section>`);
  }
  return `<div class="weekraster" style="grid-template-columns:${breedtes.join(' ')}">${kolommen.join('')}</div>${legendaWeek()}`;
}

function weekHtml(events) {
  if (isDesktop()) return weekKolommenHtml(events);
  const { start } = periode();
  const t = vandaag();
  let html = '';
  let eerste = true;
  // Lege weekenddagen: samen onder één kop ('21–22 Weekend'), met 'Geen afspraken' eronder, net als een lege werkdag
  const leegWeekend = [5, 6].filter((i) => !eventsForDay(events, addDays(start, i)).length);
  const weekendBlok = (dagen) => {
    const [a, b] = dagen.map((i) => addDays(start, i));
    const nr = b ? `${a.getDate()}–${b.getDate()}` : `${a.getDate()}`;
    const naam = b ? 'Weekend' : cap(DAYS_LONG[a.getDay()]);
    const voluit = b ? `Weekend, zaterdag ${a.getDate()} en zondag ${b.getDate()} ${MONTHS_LONG[b.getMonth()]}` : `${DAYS_LONG[a.getDay()]} ${a.getDate()} ${MONTHS_LONG[a.getMonth()]}`;
    const voorbij = (b || a) < t;
    const blok = `<h2 data-dag="${a.getTime()}" class="dagkop${eerste ? ' eerste' : ''}${voorbij ? ' voorbij' : ''}" aria-label="${voluit}"><span class="nr num">${nr}</span><span class="dow">${naam}</span></h2><div class="kaart"><div class="rij rest"><span>Geen afspraken</span></div></div>`;
    eerste = false;
    return blok;
  };
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const lijst = eventsForDay(events, d);
    if (i >= 5 && !lijst.length) {
      // Beide dagen leeg: één regel bij zaterdag. Alleen deze dag leeg: een regel voor deze dag.
      if (leegWeekend.length === 2) { if (i === 5) html += weekendBlok([5, 6]); } else html += weekendBlok([i]);
      continue;
    }
    const heleDag = lijst.filter((e) => e.allDay);
    const getimed = lijst.filter((e) => !e.allDay);
    const getoond = ST.filter === 'notable' ? getimed.filter((e) => e.notable) : getimed;
    const verborgen = getimed.length - getoond.length;
    const vrij = ST.filter === 'free' && i < 5 && d >= t ? freeSlots(lijst, d) : [];
    const items = [...getoond.map((e) => ({ t: e.start.getTime(), e })), ...vrij.map((f) => ({ t: f.start.getTime(), f }))].sort((a, b) => a.t - b.t);
    let rijen = heleDag.map((e) => `<button class="rij heledag" data-id="${esc(e.id)}"><span class="rijtitel">${esc(e.title)}</span><span class="hint">hele dag</span></button>`).join('');
    const ov = overlapVan(lijst);
    rijen += items.map((it) => (it.e ? weekRij(it.e, ov) : vrijRij(it.f))).join('');
    if (verborgen > 0) rijen += `<div class="rij rest"><span class="stip"></span><span>${vastText(verborgen)}</span></div>`;
    if (!rijen) rijen = '<div class="rij rest"><span>Geen afspraken</span></div>';
    // Zoals op de desktop: eerst het dagnummer, dan de dag; vandaag in de accentkleur, voorbije dagen grijs
    const isVandaag = sameDay(d, t);
    const kop = `<span class="nr num">${d.getDate()}</span><span class="dow">${cap(DAYS_LONG[d.getDay()])}</span>${d.getDate() === 1 && !eerste ? `<span class="mnd">${MONTHS_LONG[d.getMonth()]}</span>` : ''}`;
    html += `<h2 data-dag="${d.getTime()}" class="dagkop${eerste ? ' eerste' : ''}${isVandaag ? ' vandaag' : ''}${d < t ? ' voorbij' : ''}" aria-label="${isVandaag ? 'Vandaag, ' : ''}${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}">${kop}</h2><div class="kaart">${rijen}</div>`;
    eerste = false;
  }
  return html + legendaWeek();
}
// Legenda onderaan bij de afspraken zelf: streepjes in de week, de tegelkleuren in de Vooruitblik
const legendaWeek = () => `<div class="legenda">
    <span><i class="stip ext" style="margin:0"></i>Extern</span>
    <span><i class="stip int" style="margin:0"></i>Intern, ad hoc</span>
    <span><i class="stip" style="margin:0"></i>Intern, vast</span>
  </div>`;
const legendaVooruitblik = () => `<div class="legenda">
    <span><i class="vlak" style="background:var(--externTile)"></i>Extern</span>
    <span><i class="vlak" style="background:var(--internTile)"></i>Intern, ad hoc</span>
    <span><i class="vlak" style="background:var(--regularTile)"></i>Intern, vast</span>
  </div>`;

/* ------------------------------------------------------------------ */
/*  Weergave: Vooruitblik                                              */
/* ------------------------------------------------------------------ */

function tegel(e, dag, ov) {
  const onSite = e.mode === 'physical' || e.mode === 'hybrid';
  const vervolg = e.start < startOfDay(dag);
  const o = overlapt(e, ov) ? ov.get(e) : null;
  return `<button class="tegel ${e.kind}${o ? ' overlapt' : ''}" data-id="${esc(e.id)}"${o ? ` title="${esc(o.lang)}"` : ''}>
    <span class="tegelkop"><span class="tt">${vervolg ? 'vervolg' : hhmm(e.start)}</span><span class="iconen">${onSite ? I.speld : ''}${e.external && e.regular ? I.herhaal : ''}</span></span>
    <span class="tit">${esc(e.title || 'Zonder titel')}</span>
    ${e.external ? `<span class="orgregel"><span class="b">${esc(e.orgs[0])}</span>${e.orgs.length > 1 ? `<span class="m">+${e.orgs.length - 1}</span>` : ''}</span>` : ''}
    <span class="tegelvoet">${o ? `<span class="ovbadge">Overlap${o.tijd ? `<span class="ovtijd"> ${o.tijd}</span>` : ''}</span>` : ''}<span class="tt te">${hhmm(e.end)}</span></span>
  </button>`;
}
function vrijeTegel(f) {
  return `<button class="tegel vrij" data-vrij="${f.start.getTime()}-${f.end.getTime()}" aria-label="Vrij van ${hhmm(f.start)} tot ${hhmm(f.end)}, ${freeText(f.min)}. Afspraak toevoegen">
    <span class="tegelkop"><span class="tt">${hhmm(f.start)}</span><span class="plus" aria-hidden="true">${I.plus}</span></span><span class="tit">Vrij</span><span class="duur">${freeText(f.min)}</span><span class="tt te">${hhmm(f.end)}</span>
  </button>`;
}

function vooruitblikHtml(events) {
  const { start } = periode();
  const t = vandaag();
  let html = '<div class="vb">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const lijst = eventsForDay(events, d);
    const isVandaag = sameDay(d, t);
    // Vandaag: alleen wat nog komt of nu bezig is; afgelopen afspraken vallen weg
    const nuMs = nu().getTime();
    const heleDag = lijst.filter((e) => e.allDay);
    const getimed = lijst.filter((e) => !e.allDay && (!isVandaag || e.end.getTime() > nuMs));
    const afgelopen = isVandaag && lijst.some((e) => !e.allDay && e.end.getTime() <= nuMs);
    const tegels = ST.filter === 'notable' ? getimed.filter((e) => e.notable) : getimed;
    const verborgen = getimed.length - tegels.length;
    const werkdag = d.getDay() >= 1 && d.getDay() <= 5;
    const vrij = ST.filter === 'free' && werkdag && d >= t ? freeSlots(lijst, d) : [];
    const items = [...tegels.map((e) => ({ t: e.start.getTime(), e })), ...vrij.map((f) => ({ t: f.start.getTime(), f }))].sort((a, b) => a.t - b.t);
    const ov = overlapVan(lijst);
    html += `<section class="vbdag">
      <div class="vbdatum${isVandaag ? ' vandaag' : ''}"><span class="dow">${DAYS_SHORT[d.getDay()].toUpperCase()}</span><span class="nr">${d.getDate()}</span>${i === 0 || d.getDate() === 1 ? `<span class="mnd">${MONTHS_SHORT[d.getMonth()]}</span>` : ''}</div>
      <div class="vbinhoud">
        ${!heleDag.length && !getimed.length && !vrij.length ? `<div class="vbleeg">${isVandaag ? (afgelopen ? 'Geen afspraken meer vandaag' : 'Geen afspraken vandaag') : 'Geen afspraken'}</div>` : ''}
        ${heleDag.map((e) => `<button class="vbheledag" data-id="${esc(e.id)}"><span class="t">${esc(e.title)}</span><span class="h">hele dag</span></button>`).join('')}
        ${items.length ? `<div class="tegels">${items.map((it) => (it.e ? tegel(it.e, d, ov) : vrijeTegel(it.f))).join('')}</div>` : ''}
        ${verborgen > 0 ? `<div class="vbrest">+ ${vastText(verborgen)}</div>` : ''}
      </div>
    </section>`;
  }
  return html + '</div>' + legendaVooruitblik();
}

/* ------------------------------------------------------------------ */
/*  Kop, schakelaar en tabbalk                                         */
/* ------------------------------------------------------------------ */

function capsuleHtml(vorigeLabel, volgendeLabel) {
  return `<button data-nav="-1" aria-label="${vorigeLabel}">${I.terug}</button><button data-nav="0" aria-label="Naar vandaag">${I.kalender}<span class="vandaagtekst">Vandaag</span></button><button data-nav="1" aria-label="${volgendeLabel}">${I.verder}</button>`;
}

function renderKop() {
  const { start } = periode();
  const agenda = ST.tab === 'week' || ST.tab === 'forecast';
  $('#titel').textContent = ST.tab === 'week' ? `Week ${isoWeek(start)}` : { forecast: 'Vooruitblik', notities: 'Notities', instellingen: 'Instellingen' }[ST.tab];
  $('#datumregel').textContent = rangeLong(start, addDays(start, 6));
  document.body.classList.toggle('vooruitblik', ST.tab === 'forecast');
  document.body.classList.toggle('agendatab', agenda);
  document.body.classList.toggle('notitietab', ST.tab === 'notities'); // geen weekkeuze, schakelaar en pijlen; wel zoeken
  document.body.classList.toggle('insttab', ST.tab === 'instellingen');
  $('#titelknop').setAttribute('aria-label', agenda ? 'Kies een week' : $('#titel').textContent);
  const wk = $('#weergaveknop');
  wk.innerHTML = ST.tab === 'forecast' ? I.vooruit : I.week;
  wk.setAttribute('aria-label', `Weergave: ${ST.tab === 'forecast' ? 'Vooruitblik' : 'Week'}`);
  document.querySelectorAll('#schakelaar button').forEach((b) => {
    const aan = b.dataset.filter === ST.filter;
    b.classList.toggle('aan', aan);
    b.setAttribute('aria-selected', aan);
  });
  document.querySelectorAll('#tabbalk [data-tab]').forEach((b) => {
    const aan = b.dataset.tab === 'agenda' ? agenda : b.dataset.tab === ST.tab;
    b.classList.toggle('aan', aan);
    b.setAttribute('aria-selected', aan);
  });
}

function render() {
  document.body.classList.toggle('desktop', isDesktop());
  renderKop();
  renderZijbalk();
  const main = $('#inhoud');
  if (ST.tab === 'notities') { main.innerHTML = notitiesHtml(); ST.naarVandaag = false; return; }
  if (ST.tab === 'instellingen') {
    // Staat Instellingen al in beeld, dan alleen de agendaregel bijwerken: zo raak je niets kwijt terwijl je typt
    const scherm = $('#instscherm');
    if (scherm && scherm.tekenAgenda) scherm.tekenAgenda();
    else { main.innerHTML = '<div class="instellingen instscherm" id="instscherm"></div>'; openInstellingen({ doel: $('#instscherm') }); }
    ST.naarVandaag = false;
    return;
  }
  const { start, eind } = periode();
  const events = afsprakenTussen(start, eind);
  zichtbaar.clear();
  events.forEach((e) => zichtbaar.set(e.id, e));
  // Eigen bestand nog op de achtergrond aan het inlezen en deze week nog niet bewaard: ook 'laden' tonen
  const geenData = BESTAND && !BESTAND.gelezen && !DATA.weken.has(startOfWeek(start).getTime());
  if (geenData && ST.laden) { main.innerHTML = '<div class="laden">Agenda laden…</div>'; return; }
  if (geenData && ST.fout) { main.innerHTML = meldingHtml('Agenda niet beschikbaar', ST.fout, 'Opnieuw proberen'); $('#inhoud .knop').onclick = () => laad(); return; }
  // De agenda kies je in de weekkiezer (tik op de titel) of op de desktop in de zijbalk
  main.innerHTML = ST.tab === 'week' ? weekHtml(events) : vooruitblikHtml(events);
  if (ST.naarVandaag) scrollNaarVandaag();
}

// Telefoon, weekweergave: vandaag bovenaan zetten, direct onder de kop. Eerdere dagen staan erboven,
// daar kun je naartoe terugscrollen. Op de desktop staan alle dagen naast elkaar, dus daar niet nodig.
// Tot je zelf scrolt of tikt blijft vandaag bovenaan staan, ook als de agenda daarna nog wordt bijgewerkt.
function scrollNaarVandaag() {
  const main = $('#inhoud');
  main.style.minHeight = '';
  if (ST.tab !== 'week' || isDesktop()) { ST.naarVandaag = false; return; }
  const kop = $('#inhoud .dagkop.vandaag');
  if (!kop || kop.classList.contains('eerste')) { window.scrollTo(0, 0); return; }
  scrollNaarDag(kop);
}

// Zet een dagkop direct onder de kop van de app
function scrollNaarDag(kop) {
  const main = $('#inhoud');
  // Gemeten aan de kaart eronder: de dagkop zelf plakt en staat dus niet altijd op zijn eigen plek
  const kaart = kop.nextElementSibling;
  const doel = Math.round(kaart.getBoundingClientRect().top + window.scrollY - kop.offsetHeight - $('#kop').offsetHeight);
  // Genoeg ruimte onderaan, zodat de dag ook in een rustige week helemaal naar boven kan
  const tekort = doel + window.innerHeight - document.documentElement.scrollHeight;
  if (tekort > 0) main.style.minHeight = `${main.offsetHeight + tekort}px`;
  window.scrollTo(0, doel);
}

// Telefoon, weekweergave: wisselen tussen Opvallend, Alles en Vrij laat de dag waar je naar kijkt op dezelfde
// plek op het scherm staan. Anders verschuift de lijst, omdat er boven die dag regels bijkomen of verdwijnen.
// Ankerdag: de eerste dag waarvan de kop zichtbaar onder de kop van de app staat. Vult één dag het hele scherm,
// dan die dag zelf, met dezelfde afstand tot zijn kop.
function behoudDag(teken) {
  const koppen = ST.tab === 'week' && !isDesktop() ? [...document.querySelectorAll('#inhoud .dagkop')] : [];
  if (!koppen.length || window.scrollY <= 0) { teken(); return; }
  const kopH = $('#kop').offsetHeight;
  const blokTop = (k) => k.nextElementSibling.getBoundingClientRect().top - k.offsetHeight; // waar de dag begint, op het scherm
  let anker = koppen.find((k) => blokTop(k) >= kopH - 1 && blokTop(k) < window.innerHeight - 40);
  if (!anker) anker = koppen.filter((k) => blokTop(k) < kopH).pop() || koppen[0];
  const dag = anker.dataset.dag;
  const y0 = blokTop(anker);
  teken();
  const nieuw = document.querySelector(`#inhoud .dagkop[data-dag="${dag}"]`);
  if (!nieuw) return;
  const main = $('#inhoud');
  main.style.minHeight = '';
  // Zat je halverwege een dag en is die korter geworden, dan niet voorbij het einde van die dag
  const y = Math.max(y0, kopH - nieuw.nextElementSibling.offsetHeight);
  const doel = Math.round(window.scrollY + blokTop(nieuw) - y);
  const tekort = doel + window.innerHeight - document.documentElement.scrollHeight;
  if (tekort > 0) main.style.minHeight = `${main.offsetHeight + tekort}px`;
  window.scrollTo(0, Math.max(0, doel));
}

function meldingHtml(titel, tekst, knop) {
  return `<div class="melding"><div class="doos"><h2>${esc(titel)}</h2><p>${esc(tekst)}</p>${knop ? `<button class="knop" style="padding:0 20px">${esc(knop)}</button>` : ''}</div></div>`;
}
// Gegevens voor de zichtbare periode ophalen (met de weken eromheen voor 'vast') en opnieuw tekenen
async function laad() {
  const { start, eind } = periode();
  ST.laden = true;
  ST.fout = null;
  render();
  try {
    await zorgVoor(addDays(start, -7 * LOOK_AROUND_WEEKS), addDays(eind, 7 * LOOK_AROUND_WEEKS));
  } catch (e) {
    ST.fout = e.message;
  }
  ST.laden = false;
  render();
}
