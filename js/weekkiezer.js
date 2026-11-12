// Agenda, weekkiezer en zijbalk
// De weekkiezer met de maandkalender (heatmap), en de zijbalk op iPad en Mac die dezelfde kalender toont.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

/* ------------------------------------------------------------------ */
/*  Weekkiezer                                                         */
/* ------------------------------------------------------------------ */

// Maandraster met weekrijen. Bezetting als heatmap in drie stappen: grijs (rustig), geel (vanaf MID_HOURS)
// en rood (vanaf FULL_HOURS); binnen elke stap wordt de tint voller naarmate de dag drukker is.
// Gebruikt in het paneel (telefoon, tablet) en in de zijbalk (desktop).
const niveau = (h) => (h >= FULL_HOURS ? 'vol' : h >= MID_HOURS ? 'mid' : '');
function tint(h) {
  if (!h) return 0;
  if (h >= FULL_HOURS) return 0.18 + 0.12 * Math.min(1, (h - FULL_HOURS) / 2);
  if (h >= MID_HOURS) return 0.2 + 0.12 * ((h - MID_HOURS) / (FULL_HOURS - MID_HOURS));
  return 0.05 + 0.07 * (h / MID_HOURS);
}
function maandRasterHtml(maand, gekozen, soort = 'paneel') {
  const rasterStart = startOfWeek(maand);
  const uren = busyHoursByDay(afsprakenTussen(rasterStart, addDays(rasterStart, 42)));
  const t = vandaag();
  let rijen = '';
  for (let r = 0; r < 6; r++) {
    const ma = addDays(rasterStart, r * 7);
    let cellen = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ma, i);
      const weekend = i >= 5;
      const anders = d.getMonth() !== maand.getMonth();
      const voorbij = d < t;
      // Dagen die al voorbij zijn: alleen het cijfer, gedempt. Hoe druk een dag was, doet er niet meer toe.
      // Dagen van de volgende maand die al in beeld zijn, krijgen wel hun kleur.
      const h = weekend || voorbij ? 0 : uren[d.getTime()] || 0;
      const klasse = ['dagcel', weekend ? 'weekend' : '', anders ? 'anders' : '', voorbij ? 'voorbij' : '', sameDay(d, t) ? 'vandaag' : '', niveau(h), h ? 'gevuld' : ''].join(' ');
      cellen += `<span class="cel"><span class="${klasse}" style="--a:${tint(h).toFixed(3)}"><span>${d.getDate()}</span></span></span>`;
    }
    rijen += `<button class="weekrij${sameDay(ma, gekozen) ? ' gekozen' : ''}" data-ma="${ma.getTime()}" aria-label="Week ${isoWeek(ma)}"><span class="wk">${isoWeek(ma)}</span>${cellen}</button>`;
  }
  const knoppen = soort === 'paneel'
    ? `<div class="capsule glas maandcapsule"><button data-maand="-1" aria-label="Vorige maand">${I.terug}</button><button data-maand="1" aria-label="Volgende maand">${I.verder}</button></div>`
    : `<div class="maandpijlen"><button data-maand="-1" aria-label="Vorige maand">${I.terug}</button><button data-maand="1" aria-label="Volgende maand">${I.verder}</button></div>`;
  return `<div class="kiezerkop"><h2>${cap(MONTHS_LONG[maand.getMonth()])} ${maand.getFullYear()}</h2>${knoppen}</div>
    <div class="rasterkop"><span></span>${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d) => `<span>${d}</span>`).join('')}</div>
    ${rijen}
    <div class="kiezerlegenda"><span><i class="rustig"></i>tot ${MID_HOURS} uur</span><span><i class="gemiddeld"></i>${MID_HOURS}–${FULL_HOURS} uur</span><span><i class="druk"></i>${FULL_HOURS} uur of meer</span></div>`;
}
const gekozenMaandag = () => startOfWeek(ST.tab === 'week' ? ST.anker : ST.fcStart);
function kiesWeek(ma) {
  ST.anker = ma;
  ST.tab = 'week';
  LS.set('ag_tab', ST.tab);
  LS.set('ag_weergave', ST.tab);
  window.scrollTo(0, 0);
  ST.naarVandaag = true;
  laad();
}

function openWeekkiezer() {
  if (isDesktop()) return; // op de desktop staat de kalender al in de zijbalk
  let maand = firstOfMonth(addDays(gekozenMaandag(), 3));
  const el = document.createElement('div');
  el.className = 'paneel kiezer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Kies een week');
  const p = openPaneel(el);
  const teken = () => {
    el.innerHTML = `<div class="kiezergreep"><div class="greep"></div>${maandRasterHtml(maand, gekozenMaandag())}</div>`;
    // Verplaats raster en legenda uit de greep, zodat alleen de kop veegbaar is
    const greep = el.querySelector('.kiezergreep');
    [...greep.children].slice(2).forEach((n) => el.appendChild(n));
    maakVeegbaar(el, greep, p.sluit);
    const rasterStart = startOfWeek(maand);
    const ditMaand = maand;
    Promise.resolve(zorgVoor(rasterStart, addDays(rasterStart, 42))).then(() => { if (el.isConnected && ditMaand === maand) tekenRingen(el, maand); }).catch(() => {});
  };
  teken();
  el.addEventListener('click', (ev) => {
    const m = ev.target.closest('[data-maand]');
    if (m) {
      const n = Number(m.dataset.maand);
      if (n === 0) { p.sluit(); verschuif(0, 'week'); return; }
      maand = new Date(maand.getFullYear(), maand.getMonth() + n, 1);
      teken();
      return;
    }
    const rij = ev.target.closest('.weekrij');
    if (rij) { p.sluit(); kiesWeek(new Date(Number(rij.dataset.ma))); return; }
  });
}
// Tinten bijwerken zodra de gegevens binnen zijn, zonder het raster te laten verspringen
function tekenRingen(el, maand) {
  const rasterStart = startOfWeek(maand);
  const uren = busyHoursByDay(afsprakenTussen(rasterStart, addDays(rasterStart, 42)));
  el.querySelectorAll('.weekrij').forEach((rij) => {
    const ma = new Date(Number(rij.dataset.ma));
    rij.querySelectorAll('.dagcel').forEach((cel, i) => {
      if (i >= 5 || cel.classList.contains('voorbij')) return;
      const h = uren[addDays(ma, i).getTime()] || 0;
      cel.style.setProperty('--a', tint(h).toFixed(3));
      cel.classList.toggle('vol', niveau(h) === 'vol');
      cel.classList.toggle('mid', niveau(h) === 'mid');
      cel.classList.toggle('gevuld', h > 0);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Zijbalk (desktop)                                                  */
/* ------------------------------------------------------------------ */

let zijMaand = null;
// Waar de afspraken vandaan komen: [titel, toelichting]
function agendaBron() {
  if (BESTAND && BESTAND.link) {
    // Wanneer hij is bijgewerkt, staat bij Cloudflare; hier alleen als het bezig is of niet lukte
    return ['Outlook-agenda', LINK_BEZIG ? 'Bijwerken…' : BESTAND.linkFout ? 'Bijwerken lukte niet' : ''];
  }
  if (BESTAND) {
    const d = new Date(BESTAND.datum);
    return [esc(BESTAND.naam), `Ingeladen op ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`];
  }
  return ['Voorbeeldgegevens', 'Verzonnen afspraken en namen'];
}
// Onderaan de zijbalk (desktop): één regel naar Instellingen, met welke agenda je ziet
function instellingenRijHtml() {
  // Kort: welke agenda je ziet, en bij de agenda-link wanneer die is bijgewerkt
  let kort = 'Voorbeeldgegevens';
  if (BESTAND && BESTAND.link) {
    const d = new Date(BESTAND.gecontroleerd || BESTAND.datum);
    kort = `Outlook-agenda · ${LINK_BEZIG ? 'bijwerken…' : BESTAND.linkFout ? 'bijwerken lukte niet' : sameDay(d, vandaag()) ? `bijgewerkt om ${hhmm(d)}` : `bijgewerkt ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`}`;
  } else if (BESTAND) kort = esc(BESTAND.naam);
  return `<nav class="zblijst zbagenda zbinstellingen" aria-label="Instellingen">
    <button class="instrij" data-actie="instellingen">${I.instellingen}<span class="tekst"><span class="t1">Instellingen</span><span class="t2">${kort}</span></span>${I.verder}</button>
  </nav>`;
}
function renderZijbalk() {
  const z = $('#zijbalk');
  if (!isDesktop()) { z.innerHTML = ''; return; }
  if (!zijMaand) zijMaand = firstOfMonth(addDays(gekozenMaandag(), 3));
  const item = (tab, icoon, tekst) => `<button data-tab="${tab}" class="${ST.tab === tab ? 'aan' : ''}" aria-selected="${ST.tab === tab}">${icoon}<span>${tekst}</span></button>`;
  z.innerHTML = `<div class="zbbinnen">
    <div class="minikal">${maandRasterHtml(zijMaand, gekozenMaandag(), 'zijbalk')}</div>
    <nav class="zblijst zbweergave" aria-label="Agenda"><h3>Agenda</h3>${item('week', I.week, 'Week')}${item('forecast', I.vooruit, 'Vooruitblik')}</nav>
    <div class="zbnotfilters" id="zbnotfilters">${notFiltersHtml()}</div>
    ${instellingenRijHtml()}
  </div>`;
  const rasterStart = startOfWeek(zijMaand);
  const ditMaand = zijMaand;
  Promise.resolve(zorgVoor(rasterStart, addDays(rasterStart, 42))).then(() => { if (ditMaand === zijMaand) tekenRingen(z, zijMaand); }).catch(() => {});
}
