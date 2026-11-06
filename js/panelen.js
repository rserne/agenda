// Agenda, panelen
// Panelen die over de app heen komen: weekkiezer, zijbalk, detailscherm, nieuwe afspraak, visitekaartje en agenda kiezen.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

/* ------------------------------------------------------------------ */
/*  Panelen: openen, sluiten en omlaag vegen                           */
/* ------------------------------------------------------------------ */

const panelen = [];
function openPaneel(el, { greepSelector, boven = false } = {}) {
  const achter = document.createElement('div');
  achter.className = 'achtergrond' + (boven ? ' boven' : '');
  const lagen = $('#lagen');
  lagen.append(achter, el);
  const p = { el, achter, sluit: null };
  p.sluit = () => {
    el.classList.remove('open');
    achter.classList.remove('open');
    const weg = () => { el.remove(); achter.remove(); };
    setTimeout(weg, 340);
    const i = panelen.indexOf(p);
    if (i >= 0) panelen.splice(i, 1);
    if (!panelen.length) document.body.style.overflow = '';
  };
  achter.addEventListener('click', p.sluit);
  panelen.push(p);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('open'); achter.classList.add('open'); }));
  if (greepSelector) maakVeegbaar(el, el.querySelector(greepSelector), p.sluit);
  return p;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelen.length) panelen[panelen.length - 1].sluit(); });

// Omlaag vegen sluit een paneel. Met de vinger kan dat overal op het paneel en op de achtergrond erboven (zoals een iOS-sheet),
// zolang de inhoud bovenaan staat; met muis of pen alleen aan de greep.
function maakVeegbaar(paneel, greep, sluit) {
  veegMetVinger(paneel, sluit);
  if (!greep) return;
  let y0 = null, dy = 0, t0 = 0;
  greep.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.target.closest('button') && e.pointerType === 'mouse') return;
    y0 = e.clientY; dy = 0; t0 = Date.now();
    paneel.classList.add('sleept');
    greep.setPointerCapture(e.pointerId);
  });
  greep.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    paneel.style.transform = `translate(-50%, ${dy}px)`;
  });
  const los = () => {
    if (y0 === null) return;
    paneel.classList.remove('sleept');
    paneel.style.transform = '';
    const snel = dy / Math.max(1, Date.now() - t0) > 0.6;
    if (dy > 110 || (snel && dy > 30)) sluit();
    y0 = null;
  };
  greep.addEventListener('pointerup', los);
  greep.addEventListener('pointercancel', los);
}

// Vegen kan op het paneel zelf en op de donkere achtergrond erboven.
function veegMetVinger(paneel, sluit) {
  if (paneel.dataset.veeg) return; // één keer per paneel, ook als de inhoud opnieuw getekend wordt
  paneel.dataset.veeg = '1';
  luisterNaarVeeg(paneel, paneel, sluit);
  const achter = (panelen.find((x) => x.el === paneel) || {}).achter;
  if (achter) luisterNaarVeeg(achter, paneel, sluit);
}

// Omhoog trekken aan een paneel dat al zijn volle hoogte heeft: het rekt een stukje mee en veert terug (zoals iOS).
const REK_MAX = 28;
const rek = (d) => REK_MAX * (1 - 1 / (1 + d / (REK_MAX * 2.2)));

function luisterNaarVeeg(bron, paneel, sluit) {
  let x0 = 0, y0 = null, dy = 0, t0 = 0, sleept = false, omhoog = false;
  // Kan de inhoud onder de vinger nog verder naar beneden scrollen? Dan scrolt die, in plaats van te rekken.
  const kanVerder = (doel) => {
    for (let n = doel; n && n !== paneel.parentNode; n = n.parentNode) {
      if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true;
    }
    return false;
  };
  // Staat de vinger in iets dat al omlaag gescrold is? Dan scrollt de inhoud eerst terug.
  const gescrold = (doel) => {
    for (let n = doel; n && n !== paneel.parentNode; n = n.parentNode) if (n.scrollTop > 0) return true;
    return false;
  };
  bron.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || paneel.classList.contains('dialoog') || e.target.closest('input, textarea, select')) { y0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dy = 0; sleept = false; omhoog = false;
    if (bron === paneel && gescrold(e.target)) y0 = null;
  }, { passive: true });
  bron.addEventListener('touchmove', (e) => {
    if (bron !== paneel) e.preventDefault(); // op de achtergrond nooit de pagina eronder laten bewegen
    if (y0 === null) return;
    const t = e.touches[0], d = t.clientY - y0;
    if (!sleept) {
      if (Math.abs(t.clientX - x0) > Math.abs(d)) { y0 = null; return; } // horizontaal vegen (tijdchips) laten we met rust
      if (d < 0) {
        // Omhoog: scrollen als dat kan, anders rekt het paneel een stukje mee
        if (bron !== paneel || kanVerder(e.target)) { y0 = null; return; }
        if (d > -8) return;
        omhoog = true;
      } else if (d < 8) return;
      sleept = true; y0 = t.clientY; t0 = Date.now();
      paneel.classList.add('sleept');
    }
    e.preventDefault();
    if (omhoog) {
      paneel.style.transform = `translate(-50%, ${-rek(Math.max(0, y0 - t.clientY))}px)`;
      return;
    }
    dy = Math.max(0, t.clientY - y0);
    paneel.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: false });
  const los = () => {
    if (sleept) {
      paneel.classList.remove('sleept');
      paneel.style.transform = '';
      const snel = dy / Math.max(1, Date.now() - t0) > 0.6;
      if (!omhoog && (dy > 110 || (snel && dy > 30))) sluit();
    }
    y0 = null; sleept = false; omhoog = false;
  };
  bron.addEventListener('touchend', los);
  bron.addEventListener('touchcancel', los);
}

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
    // Onder de kalender: naar Instellingen (agenda, contacten, ruimtes), zoals in de zijbalk op de desktop
    el.insertAdjacentHTML('beforeend', instellingenRijHtml());
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
    if (ev.target.closest('[data-actie="instellingen"]')) { p.sluit(); setTimeout(openInstellingen, 250); }
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
    const d = new Date(BESTAND.gecontroleerd || BESTAND.datum);
    const wanneer = sameDay(d, vandaag()) ? `Bijgewerkt om ${hhmm(d)}` : `Bijgewerkt ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${hhmm(d)}`;
    return ['Outlook-agenda', LINK_BEZIG ? 'Bijwerken…' : BESTAND.linkFout ? 'Bijwerken lukte niet' : `${wanneer} · via je agenda-link`];
  }
  if (BESTAND) {
    const d = new Date(BESTAND.datum);
    return [esc(BESTAND.naam), `Ingeladen op ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} · alleen op dit toestel`];
  }
  return ['Voorbeeldgegevens', 'Verzonnen afspraken en namen'];
}
// Onder de kalender (weekkiezer en zijbalk): één regel naar Instellingen, met welke agenda je ziet
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
    <nav class="zblijst zbweergave" aria-label="Weergave"><h3>Weergave</h3>${item('week', I.week, 'Week')}${item('forecast', I.vooruit, 'Vooruitblik')}</nav>
    ${instellingenRijHtml()}
  </div>`;
  const rasterStart = startOfWeek(zijMaand);
  const ditMaand = zijMaand;
  Promise.resolve(zorgVoor(rasterStart, addDays(rasterStart, 42))).then(() => { if (ditMaand === zijMaand) tekenRingen(z, zijMaand); }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/*  Detailscherm                                                       */
/* ------------------------------------------------------------------ */

const ROLE_LABEL = { 'req-participant': 'Verplicht', 'opt-participant': 'Optioneel', chair: 'Voorzitter' };
function statusOf(s) {
  if (s === 'accepted') return { text: 'Geaccepteerd', kleur: 'var(--statusYes)' };
  if (s === 'declined') return { text: 'Afgewezen', kleur: 'var(--statusNo)' };
  if (s === 'tentative') return { text: 'Misschien', kleur: 'var(--statusMaybe)' };
  return { text: 'Geen reactie', kleur: 'var(--secondary)' };
}
function initialsOf(name, email) {
  const src = (name || '').replace(/\(.*?\)/g, '').trim();
  if (src && !src.includes('@')) {
    const words = src.split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ]/.test(w));
    const first = words[0] ? words[0][0] : '';
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return (first + last).toUpperCase() || '?';
  }
  return (email || '?')[0].toUpperCase();
}
function cleanNotes(raw) {
  if (!raw) return '';
  let t = String(raw).replace(/\r/g, '');
  const cut = t.search(/_{10,}|Microsoft Teams[- ]?(meeting|vergadering)|Neem deel aan de vergadering|Deelnemen aan de vergadering|Join the meeting|Join Zoom Meeting/i);
  if (cut >= 0) t = t.slice(0, cut);
  return t.replace(/<https?:[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function recurrenceText(e) {
  const r = e.repeat;
  if (!r) return e.regular ? 'terugkerend' : null;
  const n = r.interval || 1;
  const unit = { daily: ['dag', 'dagen'], weekly: ['week', 'weken'], monthly: ['maand', 'maanden'], yearly: ['jaar', 'jaar'] }[r.freq];
  if (!unit) return 'terugkerend';
  return n === 1 ? `elke ${unit[0]}` : `elke ${n} ${unit[1]}`;
}
const mailLink = (adressen, onderwerp) => `mailto:${adressen.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(onderwerp || '')}`;

function openDetail(e) {
  const own = eigenDomeinen();
  const kindLabel = e.kind === 'ext' ? 'Extern' : e.kind === 'int' ? 'Intern, ad hoc' : 'Intern, vast';
  const rec = recurrenceText(e);
  const dateLine = cap(`${DAYS_LONG[e.start.getDay()]} ${e.start.getDate()} ${MONTHS_LONG[e.start.getMonth()]}`);
  // Overlap: dezelfde regel als in de lijst, maar hier met alle afspraken erbij
  const ov = overlapVan(eventsForDay([...zichtbaar.values()], e.start));
  const o = ov.get(e);
  const ovNamen = o ? o.andere.map((x) => `${x.title || 'een afspraak'}${x.start > e.start ? ` om ${hhmm(x.start)}` : ''}`) : [];
  const ovLine = o ? `Overlap met ${ovNamen.length > 1 ? `${ovNamen.slice(0, -1).join(', ')} en ${ovNamen[ovNamen.length - 1]}` : ovNamen[0]}` : '';
  const timeLine = e.allDay
    ? (Math.round((e.end - e.start) / 864e5) > 1 ? `Hele dag, t/m ${addDays(e.end, -1).getDate()} ${MONTHS_LONG[addDays(e.end, -1).getMonth()]}` : 'Hele dag')
    : `${hhmm(e.start)} – ${hhmm(e.end)} · ${durationText(e.start, e.end)}`;

  // Organisator en deelnemers, gegroepeerd per organisatie (externen eerst)
  const org = e.organizer;
  const orgDomain = org ? domainOf(org.email) : null;
  const orgExternal = !!orgDomain && own.size > 0 && !isOwnDomain(orgDomain, own);
  const people = e.attendees.filter((a) => !isRoom(a) && !(org && org.email && a.email === org.email));
  const mailTo = [...new Set([org, ...people].filter((p) => p && !isMe(p)).map((p) => p.email).filter(Boolean))];
  const groups = {};
  people.forEach((a) => {
    const d = domainOf(a.email);
    const external = !!d && own.size > 0 && !isOwnDomain(d, own);
    const key = !d ? 'Overig' : external ? orgLabel(d) : OWN_ORG_NAME;
    (groups[key] = groups[key] || { name: key, external, people: [] }).people.push(a);
  });
  const groupList = Object.values(groups).sort((a, b) => {
    if (a.external !== b.external) return a.external ? -1 : 1;
    if (a.name === 'Overig') return 1;
    if (b.name === 'Overig') return -1;
    return b.people.length - a.people.length;
  });

  // Locatie: plekken en de online vergadering
  const plekken = e.places.map((p) => {
    const ruimte = e.roomNames.includes(p) || !isAddressLike(p);
    return `<div class="drij"><span class="dicoon">${I.speld}</span><span class="tekst"><div class="t1">${esc(p)}</div><div class="t2">${ruimte ? (e.mode === 'hybrid' ? 'Vergaderruimte' : 'Vergaderruimte, fysiek overleg') : 'Fysiek overleg'}</div></span>${ruimte ? '' : `<a class="actie zacht" href="https://maps.apple.com/?q=${encodeURIComponent(p)}" target="_blank" rel="noopener">Route</a>`}</div>`;
  });
  if (e.mode === 'physical' && !plekken.length) plekken.push(`<div class="drij"><span class="dicoon">${I.speld}</span><span class="tekst"><div class="t1">Op locatie</div><div class="t2">Geen plek opgegeven</div></span></div>`);
  if (e.link) plekken.push(`<div class="drij"><span class="dicoon online">${I.video}</span><span class="tekst"><div class="t1">${esc(e.link.provider)}</div><div class="t2">${e.mode === 'hybrid' ? 'Ook online te volgen' : 'Online vergadering'}</div></span><a class="actie" href="${esc(e.link.url)}" target="_blank" rel="noopener">Deelnemen</a></div>`);

  const persoonRij = (p, opts) => {
    const st = opts.status ? statusOf(p.status) : null;
    const naam = isMe(p) ? `${p.name || 'Jij'} (jij)` : p.name || p.email || 'Onbekend';
    return `<button class="drij persoon" data-persoon="${opts.idx}">
      <span class="avatar${opts.external ? ' ext' : ''}">${esc(initialsOf(p.name, p.email))}</span>
      <span class="tekst"><div class="t1">${esc(naam)}</div></span>
      ${opts.badge ? `<span class="badge">${esc(opts.badge)}</span>` : ''}
      ${st ? `<span class="status" style="color:${st.kleur}">${st.text}</span>` : ''}
    </button>`;
  };

  // Gegevens per persoon voor het visitekaartje
  const kaartjes = [];
  const kaartje = (p, extra) => { kaartjes.push({ ...extra, name: p.name, email: p.email, self: isMe(p), initials: initialsOf(p.name, p.email), subject: e.title }); return kaartjes.length - 1; };

  const notes = cleanNotes(e.notes);
  const el = document.createElement('div');
  el.className = 'paneel detail' + (isDesktop() ? ' dialoog' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', e.title || 'Afspraak');
  let allen = false;
  let meerNotities = false;

  const teken = () => {
    kaartjes.length = 0;
    let budget = allen ? Infinity : PEOPLE_LIMIT;
    const groepen = groupList.map((g) => {
      const take = Math.max(0, Math.min(g.people.length, budget));
      budget -= take;
      return { ...g, shown: g.people.slice(0, take) };
    }).filter((g) => g.shown.length);

    // Afgeleide organisatie (gepubliceerde agenda zonder organisator): geen apart kopje, het label bovenaan zegt genoeg
    const orgHtml = org ? `<section class="sectie"><h3>Organisator</h3><div class="kaart">${persoonRij(org, {
      idx: kaartje(org, { org: orgDomain ? (orgExternal ? orgLabel(orgDomain) : OWN_ORG_NAME) : null, external: orgExternal, role: 'Organisator' }),
      external: orgExternal, badge: orgExternal ? orgLabel(orgDomain) : null,
    })}</div></section>` : '';

    const deelnHtml = people.length ? `<section class="sectie"><h3>Deelnemers · ${people.length}</h3><div class="kaart">
      ${groepen.map((g) => `<div class="groep${g.external ? ' ext' : ''}">${esc(g.people.length > 1 ? `${g.name} · ${g.people.length}` : g.name)}</div>
        ${g.shown.map((a) => persoonRij(a, {
          idx: kaartje(a, { org: g.name === 'Overig' ? null : g.name, external: g.external, role: ROLE_LABEL[a.role], status: statusOf(a.status) }),
          external: g.external, status: true,
        })).join('')}`).join('')}
      ${people.length > PEOPLE_LIMIT ? `<button class="meerknop" data-actie="allen">${allen ? 'Minder tonen' : `Alle ${people.length} deelnemers tonen`}</button>` : ''}
    </div></section>` : '';

    const lang = notes.split('\n').length > 6 || notes.length > 280;
    el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
      <div class="detailinhoud">
        <div class="dkop">
          <span class="stip ${e.kind}" role="img" aria-label="${kindLabel}" title="${kindLabel}"></span>
          <div class="dkopinhoud">
          <h2 class="dtitel">${esc(e.title || 'Zonder titel')}</h2>
          <div class="dmeta">
            <div>${dateLine}</div>
            <div class="num">${timeLine}${rec ? `<span class="dher" role="img" aria-label="${esc(cap(rec))}" title="${esc(cap(rec))}">${I.herhaal}</span>` : ''}</div>
            ${e.mode !== 'none' ? `<div>${MODE_LABEL[e.mode]}</div>` : ''}
            ${ovLine ? `<div class="doverlap">${esc(ovLine)}</div>` : ''}
          </div>
          ${e.external ? `<div class="dbadges">${e.orgs.map((o) => `<span>${esc(o)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        ${plekken.length ? `<section class="sectie"><h3>Locatie</h3><div class="kaart">${plekken.join('')}</div></section>` : ''}
        ${orgHtml}
        ${deelnHtml}
        ${notes ? `<section class="sectie"><h3>Notities</h3><div class="kaart"><div class="notities"><p class="${lang && !meerNotities ? 'kort' : ''}">${esc(notes)}</p>${lang ? `<button data-actie="notities">${meerNotities ? 'Minder tonen' : 'Meer tonen'}</button>` : ''}</div></div></section>` : ''}
        <div class="dvoet">
          ${mailTo.length ? `<a class="groteknop" href="${mailLink(mailTo, e.title)}">${I.mail}${mailTo.length === 1 ? 'Mail de deelnemer' : `Mail alle deelnemers (${mailTo.length})`}</a>` : ''}
          <a class="groteknop" ${outlookOpenAttr(e)}>${I.extern}Openen in Outlook</a>
          <p class="voetnoot">Accepteren, misschien of weigeren doe je in Outlook.</p>
        </div>
      </div>`;
  };
  teken();
  const p = openPaneel(el, { greepSelector: '.detailgreep' });

  el.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-actie]');
    if (a) {
      if (a.dataset.actie === 'sluit') p.sluit();
      if (a.dataset.actie === 'allen') { allen = !allen; teken(); maakVeegbaar(el, el.querySelector('.detailgreep'), p.sluit); }
      if (a.dataset.actie === 'notities') { meerNotities = !meerNotities; teken(); maakVeegbaar(el, el.querySelector('.detailgreep'), p.sluit); }
      return;
    }
    const pers = ev.target.closest('[data-persoon]');
    if (pers) openVisitekaartje(kaartjes[Number(pers.dataset.persoon)]);
  });
}

/* ------------------------------------------------------------------ */
/*  Nieuwe afspraak                                                    */
/* ------------------------------------------------------------------ */

// De app leest de agenda alleen. Dit scherm zoekt een geschikt moment en opent daarna Outlook met alles
// ingevuld (of geeft een .ics-bestand); opslaan en uitnodigen gebeurt in Outlook.
const duurKort = (m) => (m < 60 ? `${m} min` : freeText(m));

async function afsprakenOp(dag) {
  const a = startOfDay(dag);
  try { await zorgVoor(startOfWeek(a), addDays(startOfWeek(a), 7)); } catch (e) { /* zonder verbinding: wat er al is */ }
  return afsprakenTussen(a, addDays(a, 1));
}

// Begintijden in een vrij blok: aansluitend in stappen van de gekozen duur, vanaf het begin van het blok
// (op een kwartier), plus het laatste moment waarop de afspraak nog past. Een uur in 16:00 – 18:00 geeft 16:00 en 17:00.
function tijdenInBlok(a, b, duur) {
  const ms = duur * 6e4;
  const kwartier = 15 * 6e4;
  const zet = new Set();
  const eerste = Math.ceil(a / kwartier) * kwartier;
  for (let t = eerste; t + ms <= b; t += ms) zet.add(t);
  const laatste = Math.floor((b - ms) / kwartier) * kwartier;
  if (laatste >= eerste) zet.add(laatste);
  return [...zet].sort((x, y) => x - y);
}
function startTijden(lijst, dag, duur) {
  return freeSlots(lijst, dag).map((f) => ({ blok: f, tijden: tijdenInBlok(f.start.getTime(), f.end.getTime(), duur) })).filter((x) => x.tijden.length);
}

async function eersteDagMetRuimte(vanaf, duur, max = 21) {
  for (let i = 0; i < max; i++) {
    const d = addDays(startOfDay(vanaf), i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    if (startTijden(await afsprakenOp(d), d, duur).length) return d;
  }
  return null;
}

const icsTekst = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsTijd = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const adressen = (s) => String(s || '').split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /@/.test(x));

// Op iOS de Outlook-app: openen op de dag van de afspraak. Elders Outlook op het web.
function outlookOpenAttr(e) {
  return IOS ? `href="ms-outlook://events?date=${ymd(e.start)}"` : `href="${OUTLOOK_URL}" target="_blank" rel="noopener"`;
}

const lokaleTijd = (t) => { const d = new Date(t); return `${ymd(d)}T${hhmm(d)}:00`; };

function outlookNieuwLink(v) {
  if (IOS) {
    // Precies de vorm die op de iPhone werkte: tijden en de komma tussen adressen niet gecodeerd.
    const enc = encodeURIComponent;
    const q = [
      ['title', v.titel && enc(v.titel)], ['start', lokaleTijd(v.start)], ['end', lokaleTijd(v.start + v.duur * 6e4)],
      ['location', v.locatie && enc(v.locatie)], ['attendees', alleAdressen(v).map(enc).join(',')], ['description', v.notitie && enc(v.notitie)],
    ].filter(([, w]) => w).map(([k, w]) => `${k}=${w}`).join('&');
    return `ms-outlook://events/new?${q}`;
  }
  const q = [
    ['rru', 'addevent'],
    ['subject', v.titel], ['startdt', new Date(v.start).toISOString()], ['enddt', new Date(v.start + v.duur * 6e4).toISOString()],
    ['location', v.locatie], ['body', v.notitie], ['to', alleAdressen(v).join(',')],
  ].filter(([, w]) => w).map(([k, w]) => `${k}=${encodeURIComponent(w)}`).join('&');
  return `https://outlook.office.com/calendar/deeplink/compose?path=/calendar/action/compose&${q}`;
}

function downloadIcs(v) {
  const regels = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//rserne//Agenda//NL', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@agenda`, `DTSTAMP:${icsTijd(Date.now())}`,
    `DTSTART:${icsTijd(v.start)}`, `DTEND:${icsTijd(v.start + v.duur * 6e4)}`, `SUMMARY:${icsTekst(v.titel || 'Nieuwe afspraak')}`,
    ...(v.locatie ? [`LOCATION:${icsTekst(v.locatie)}`] : []),
    ...(v.notitie ? [`DESCRIPTION:${icsTekst(v.notitie)}`] : []),
    ...alleAdressen(v).map((a) => `ATTENDEE;RSVP=TRUE:mailto:${a}`),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const url = URL.createObjectURL(new Blob([regels.join('\r\n')], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${(v.titel || 'afspraak').replace(/[^\w\- ]+/g, '').trim() || 'afspraak'}.ics`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Suggesties in een zwevende lijst onder een invoerveld (deelnemers en locatie). De lijst ligt over het formulier heen,
// zodat er niets verspringt terwijl je typt.
// zoek(vraag) geeft { nu: [items], later?: Promise<[items]> }; later vervangt de hele lijst zodra het binnen is.
// Een item is { t1, t2, kop? }. kies(item) vult het veld.
// leegTonen: ook zonder tekst suggesties tonen, zodra je in het veld tikt (de ruimtes bij Locatie).
function koppelSuggesties(veld, lijstEl, { vraagVan = (w) => w.trim(), zoek, kies, leegTonen = false }) {
  let items = [], actief = -1, beurt = 0, stil = false, getekend = '';
  const sluit = () => { items = []; actief = -1; getekend = ''; lijstEl.innerHTML = ''; lijstEl.hidden = true; veld.setAttribute('aria-expanded', 'false'); veld.removeAttribute('aria-activedescendant'); };
  const teken = () => {
    if (!items.length) { sluit(); return; }
    const html = items.map((c, i) => `${c.kop ? `<div class="aanvulkop" role="presentation">${esc(c.kop)}</div>` : ''}<button type="button" role="option" id="${lijstEl.id}-${i}" class="aanvuloptie${i === actief ? ' actief' : ''}" aria-selected="${i === actief}" data-aanvul="${i}" tabindex="-1">
        <span class="t1">${esc(c.t1)}</span>${c.t2 ? `<span class="t2">${esc(c.t2)}</span>` : ''}</button>`).join('');
    // Net onder de rij met het veld, over de rest van het formulier heen
    const rij = veld.closest('.frij');
    if (rij) lijstEl.style.top = `${rij.offsetTop + rij.offsetHeight - 4}px`;
    if (html !== getekend) { lijstEl.innerHTML = html; getekend = html; } // alleen tekenen als er iets veranderd is
    lijstEl.hidden = false;
    veld.setAttribute('aria-expanded', 'true');
    if (actief >= 0) veld.setAttribute('aria-activedescendant', `${lijstEl.id}-${actief}`); else veld.removeAttribute('aria-activedescendant');
  };
  const zoekNu = () => {
    const mijn = ++beurt;
    const vraag = vraagVan(veld.value);
    if (!vraag && !leegTonen) { sluit(); return; }
    const { nu = [], later = null } = zoek(vraag) || {};
    items = nu; actief = items.length && !IOS ? 0 : -1; teken();
    if (later) later.then((nieuw) => {
      if (mijn !== beurt || document.activeElement !== veld || !nieuw) return;
      const was = items[actief];
      items = nieuw;
      actief = was ? Math.max(0, items.findIndex((c) => c.t1 === was.t1 && c.t2 === was.t2)) : (items.length && !IOS ? 0 : -1);
      if (actief >= items.length) actief = items.length - 1;
      teken();
    }).catch(() => { /* geen extra suggesties */ });
  };
  const neem = (i) => {
    const c = items[i];
    if (!c) return;
    stil = true;
    kies(c);
    veld.dispatchEvent(new Event('input', { bubbles: true }));
    sluit();
    veld.focus();
  };
  veld.setAttribute('role', 'combobox');
  veld.setAttribute('aria-autocomplete', 'list');
  veld.setAttribute('aria-controls', lijstEl.id);
  lijstEl.setAttribute('role', 'listbox');
  sluit();
  veld.addEventListener('input', () => { if (stil) { stil = false; beurt++; return; } zoekNu(); });
  if (leegTonen) veld.addEventListener('focus', () => { if (lijstEl.hidden) zoekNu(); });
  veld.addEventListener('keydown', (ev) => {
    if (lijstEl.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const n = items.length;
      actief = ev.key === 'ArrowDown' ? (actief + 1) % n : (actief - 1 + n) % n;
      teken();
    } else if ((ev.key === 'Enter' || ev.key === 'Tab') && actief >= 0) { ev.preventDefault(); neem(actief); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); beurt++; sluit(); }
  });
  // Het toetsenbord open houden: niet laten blurren bij een tik op een suggestie
  lijstEl.addEventListener('pointerdown', (ev) => ev.preventDefault());
  lijstEl.addEventListener('mousedown', (ev) => ev.preventDefault());
  lijstEl.addEventListener('click', (ev) => { const o = ev.target.closest('[data-aanvul]'); if (o) { ev.stopPropagation(); neem(Number(o.dataset.aanvul)); } });
  veld.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== veld) { beurt++; sluit(); } }, 150));
}

// Deelnemers: alle adressen uit het veld, plus de gekozen ruimte (zo reserveert Outlook hem)
function alleAdressen(v) {
  const uit = adressen(v.deelnemers);
  if (v.ruimte && v.ruimte.email && !uit.some((a) => a.toLowerCase() === v.ruimte.email.toLowerCase())) uit.push(v.ruimte.email);
  return uit;
}

// dag: de gekozen dag (of null: eerste werkdag met ruimte).
// blok: het vrije blok waarop is geklikt ({ start, end } in ms). Dan blijven dag en tijd binnen dat blok.
async function openNieuw({ dag = null, blok = null } = {}) {
  const v = { titel: '', locatie: '', deelnemers: '', notitie: '', ruimte: null, duur: 60, start: null, eigen: false, dag: null, blok };
  if (blok) {
    v.dag = startOfDay(new Date(blok.start));
    v.max = Math.floor((blok.end - blok.start) / 9e5) * 15; // duur hoogstens het hele blok, in kwartieren
    v.duur = Math.min(60, v.max);
  } else if (dag) v.dag = startOfDay(dag);
  else {
    const t = vandaag();
    const week = ST.tab === 'week' ? startOfWeek(ST.anker) : ST.fcStart;
    v.dag = (await eersteDagMetRuimte(week > t ? week : nu(), v.duur)) || t;
  }
  if (!v.max) v.max = 8 * 60;
  const dagTekst = (d) => (sameDay(d, vandaag()) ? `Vandaag, ${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}` : cap(`${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`));

  const el = document.createElement('div');
  el.className = 'paneel detail nieuw' + (isDesktop() ? ' dialoog' : '');
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><h2 class="dtitel">Nieuwe afspraak</h2></div>
      <div class="formkaart">
        <label class="frij"><span class="flabel">Onderwerp</span><input name="titel" placeholder="Waar gaat het over?" autocomplete="off" enterkeyhint="next"></label>
        <label class="frij"><span class="flabel">Locatie</span><input name="locatie" placeholder="Ruimte, adres of Teams" autocomplete="off" enterkeyhint="next"></label>
        <div class="aanvullijst" id="nlocaties" hidden></div>
      </div>
      <div class="formkaart">
        <div class="frij"><span class="flabel">Dag</span>${blok
          ? `<span class="fwaarde"><span>${dagTekst(v.dag)}</span><span class="fsub num">Vrij ${hhmm(new Date(blok.start))} – ${hhmm(new Date(blok.end))}</span></span>`
          : `<span class="fwaarde dagkeuze">
              <button class="mini" data-dag="-1" aria-label="Dag eerder">${I.terug}</button>
              <label class="datumlabel"><span id="ndatum"></span><input type="date" id="ndatuminvoer" aria-label="Kies een dag"></label>
              <button class="mini" data-dag="1" aria-label="Dag later">${I.verder}</button>
            </span>`}</div>
        <div class="frij"><span class="flabel">Duur</span><span class="fwaarde stapper">
          <button class="mini" data-stap="-15" aria-label="Korter">${I.min}</button><span id="nduur" class="num" aria-live="polite"></span><button class="mini" data-stap="15" aria-label="Langer">${I.plus}</button>
        </span></div>
        <div class="frij kolom"><span class="flabel">Begintijd</span><div id="ntijden"></div></div>
      </div>
      <div class="formkaart">
        <label class="frij"><span class="flabel">Deelnemers</span><input name="deelnemers" type="text" inputmode="email" placeholder="${CONTACTEN.length ? 'Naam of e-mailadres' : 'E-mailadressen'}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <div class="aanvullijst" id="naanvul" hidden></div>
        <label class="frij boven"><span class="flabel">Notitie</span><textarea name="notitie" rows="3" placeholder="Optioneel"></textarea></label>
      </div>
      <div class="nvast">
        <div class="nsamenvatting" id="nsamen"></div>
        <a class="groteknop vol" id="noutlook"${IOS ? '' : ' target="_blank" rel="noopener"'}>${I.extern}Afmaken in Outlook</a>
        <button class="tekstknop" id="nics">of download als .ics-bestand</button>
      </div>
      <div class="dvoet">
        <p class="voetnoot">Deze app kan je agenda alleen lezen. Outlook opent met alles al ingevuld. Daar sla je de afspraak op en verstuur je de uitnodiging.</p>
      </div>
    </div>`;

  let lijst = [];
  const tekenDuur = () => {
    $('#nduur', el).textContent = duurKort(v.duur);
    $('[data-stap="-15"]', el).disabled = v.duur <= 15;
    $('[data-stap="15"]', el).disabled = v.duur >= v.max;
  };
  const tekenSamen = () => {
    const ok = v.start != null;
    const link = $('#noutlook', el);
    link.classList.toggle('uit', !ok);
    if (ok) link.href = outlookNieuwLink(v); else link.removeAttribute('href');
    $('#nics', el).disabled = !ok;
    const tekst = ok ? `${dagTekst(v.dag)}, ${hhmm(new Date(v.start))} – ${hhmm(new Date(v.start + v.duur * 6e4))}` : 'Kies een begintijd';
    let ov = '';
    if (ok) {
      const a = v.start, b = v.start + v.duur * 6e4;
      const botst = lijst.filter((e) => !e.allDay && !e.free && e.start.getTime() < b && e.end.getTime() > a);
      if (botst.length) ov = `<div class="doverlap">Overlap met ${esc(botst[0].title || 'een afspraak')} (${hhmm(botst[0].start)} – ${hhmm(botst[0].end)})${botst.length > 1 ? ` en ${botst.length - 1} andere` : ''}</div>`;
    }
    const ruimte = v.ruimte && v.ruimte.email ? `<div class="nruimte">${esc(v.ruimte.naam)} staat bij de deelnemers, zodat Outlook de ruimte reserveert</div>` : '';
    $('#nsamen', el).innerHTML = `<div class="${ok ? '' : 'leeg'}">${esc(tekst)}</div>${ov}${ruimte}`;
  };
  const chip = (t) => `<button class="chip num${!v.eigen && t === v.start ? ' aan' : ''}" data-start="${t}">${hhmm(new Date(t))}</button>`;
  const tekenTijden = async () => {
    const d = v.dag;
    if (!blok) {
      // Op een smal scherm de korte vorm, anders past hij niet tussen de pijltjes
      $('#ndatum', el).innerHTML = `<span class="lang">${esc(dagTekst(d))}</span><span class="kort">${sameDay(d, vandaag()) ? 'Vandaag' : cap(DAYS_SHORT[d.getDay()])} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}</span>`;
      $('#ndatuminvoer', el).value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    lijst = await afsprakenOp(d);
    if (d !== v.dag) return; // intussen een andere dag gekozen
    let html;
    if (blok) {
      // Alleen begintijden binnen het aangeklikte blok
      const tijden = tijdenInBlok(blok.start, blok.end, v.duur);
      if (!tijden.includes(v.start)) v.start = tijden[0] ?? null;
      html = `<div class="chips">${tijden.map(chip).join('')}</div>`;
    } else {
      const blokken = startTijden(lijst, d, v.duur);
      const alle = blokken.flatMap((b) => b.tijden);
      if (!v.eigen && !alle.includes(v.start)) v.start = alle.length ? alle[0] : null;
      // Alle begintijden in één rij; de vrije blokken zelf hoeven niet apart genoemd
      html = '';
      if (!blokken.length) {
        const volgende = await eersteDagMetRuimte(addDays(d, 1), v.duur);
        html = `<div class="ngeen">Geen vrij blok van ${duurKort(v.duur)} tussen ${WORK_START}:00 en ${WORK_END}:00.${volgende ? ` <button class="link" data-naar="${volgende.getTime()}">Naar ${DAYS_LONG[volgende.getDay()]} ${volgende.getDate()} ${MONTHS_LONG[volgende.getMonth()]}</button>` : ''}</div>`;
      }
      const eigenWaarde = v.eigen && v.start != null ? hhmm(new Date(v.start)) : '';
      // Andere tijd staat gewoon achteraan in dezelfde rij
      html += `<div class="chips${blokken.length ? '' : ' na'}">${alle.map(chip).join('')}<button class="chip${v.eigen ? ' aan' : ''}" data-actie="eigen">Andere tijd</button>${v.eigen ? `<input class="eigeninvoer" type="time" step="900" id="neigen" value="${eigenWaarde}" aria-label="Begintijd">` : ''}</div>`;
    }
    $('#ntijden', el).innerHTML = html;
    tekenSamen();
  };
  const zetDag = (d) => {
    v.dag = startOfDay(d);
    if (!v.eigen) v.start = null;
    else if (v.start != null) { const t = new Date(v.start); v.start = new Date(v.dag.getFullYear(), v.dag.getMonth(), v.dag.getDate(), t.getHours(), t.getMinutes()).getTime(); }
    tekenTijden();
  };

  tekenDuur();
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  tekenTijden();
  // Deelnemers: namen aanvullen uit je contacten. Het adres komt in het veld, met '; ' erachter.
  const deelVeld = $('input[name="deelnemers"]', el);
  const deelVraag = () => { const w = deelVeld.value; const i = Math.max(w.lastIndexOf(','), w.lastIndexOf(';')); return { voor: w.slice(0, i + 1), vraag: w.slice(i + 1).trim() }; };
  koppelSuggesties(deelVeld, $('#naanvul', el), {
    vraagVan: () => deelVraag().vraag,
    zoek: (vraag) => ({ nu: zoekContacten(vraag, adressen(deelVeld.value)).map((c) => ({ t1: c.naam || c.email, t2: c.naam ? c.email : '', email: c.email })) }),
    kies: (c) => { const { voor } = deelVraag(); deelVeld.value = `${voor ? `${voor.trim()} ` : ''}${c.email}; `; },
  });
  // Locatie: je ruimtes (direct bij een tik), en met een Google-sleutel ook adressen en plaatsen
  const locVeld = $('input[name="locatie"]', el);
  let sessie = nieuweSessie(), googleWacht = null, plaatsen = [];
  // Ruimtes eerst, dan plaatsen; koppen alleen als er van allebei iets is
  const metKoppen = (rs, ps) => {
    const r = rs.map((x, i) => ({ ...x, kop: i === 0 && ps.length ? 'Ruimtes' : '' }));
    const p2 = ps.map((x, i) => ({ ...x, kop: i === 0 && rs.length ? 'Plaatsen' : '' }));
    return [...r, ...p2];
  };
  koppelSuggesties(locVeld, $('#nlocaties', el), {
    leegTonen: true,
    zoek: (vraag) => {
      const rs = zoekRuimtes(vraag).map((r) => ({ t1: r.naam, t2: r.email ? `Ruimte · ${r.email}` : 'Ruimte', ruimte: r }));
      clearTimeout(googleWacht);
      if (!googleSleutel() || vraag.length < 3) { plaatsen = []; return { nu: rs }; }
      // De vorige plaatsen blijven staan tot de nieuwe binnen zijn: zo verspringt de lijst niet bij elke letter
      const later = new Promise((ok) => { googleWacht = setTimeout(ok, 300); })
        .then(() => zoekPlaatsen(vraag, sessie))
        .then((ps) => { plaatsen = ps.map((pl) => ({ t1: pl.naam, t2: pl.sub, tekst: pl.tekst })); return metKoppen(rs, plaatsen); });
      return { nu: metKoppen(rs, plaatsen), later };
    },
    kies: (c) => {
      if (c.ruimte) { locVeld.value = c.ruimte.naam; v.ruimte = c.ruimte; }
      else { locVeld.value = c.tekst || c.t1; v.ruimte = null; sessie = nieuweSessie(); plaatsen = []; }
    },
  });

  el.addEventListener('input', (ev) => {
    const n = ev.target.name;
    if (n === 'locatie' && v.ruimte && ev.target.value.trim() !== v.ruimte.naam) v.ruimte = null; // zelf iets anders getypt: geen ruimte meer
    if (n) { v[n] = ev.target.value; tekenSamen(); }
    if (ev.target.id === 'neigen' && ev.target.value) {
      const [h, m] = ev.target.value.split(':').map(Number);
      v.start = new Date(v.dag.getFullYear(), v.dag.getMonth(), v.dag.getDate(), h, m).getTime();
      tekenSamen();
    }
  });
  el.addEventListener('change', (ev) => {
    if (ev.target.id === 'ndatuminvoer' && ev.target.value) { const [j, mnd, dd] = ev.target.value.split('-').map(Number); zetDag(new Date(j, mnd - 1, dd)); }
  });
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    const stapper = t.closest('[data-stap]');
    if (stapper) { v.duur = Math.min(v.max, Math.max(15, v.duur + Number(stapper.dataset.stap))); tekenDuur(); tekenTijden(); return; }
    const st = t.closest('[data-start]');
    if (st) { v.start = Number(st.dataset.start); v.eigen = false; tekenTijden(); return; }
    if (t.closest('[data-actie="eigen"]')) { v.eigen = !v.eigen; if (!v.eigen) v.start = null; tekenTijden().then(() => { const i = $('#neigen', el); if (i) i.focus(); }); return; }
    const stap = t.closest('[data-dag]');
    if (stap) { zetDag(addDays(v.dag, Number(stap.dataset.dag))); return; }
    const naar = t.closest('[data-naar]');
    if (naar) { zetDag(new Date(Number(naar.dataset.naar))); return; }
    const lbl = t.closest('.datumlabel');
    if (lbl) { const i = $('#ndatuminvoer', el); if (i.showPicker) { ev.preventDefault(); try { i.showPicker(); } catch (e) { /* niet overal toegestaan */ } } return; }
    if (t.closest('#nics') && v.start != null) { downloadIcs(v); return; }
    if (t.closest('#noutlook')) {
      if (v.start == null) { ev.preventDefault(); return; }
      // Outlook neemt het over: het paneel gaat dicht, net nadat de link is gevolgd.
      setTimeout(p.sluit, 400);
    }
  });
  if (isDesktop()) setTimeout(() => { const i = $('input[name="titel"]', el); if (i) i.focus(); }, 60);
}

/* ------------------------------------------------------------------ */
/*  Visitekaartje van een deelnemer                                    */
/* ------------------------------------------------------------------ */

function openVisitekaartje(k) {
  if (!k) return;
  const heeftNaam = !!k.name && !k.name.includes('@');
  const el = document.createElement('div');
  el.className = 'visite';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', heeftNaam ? k.name : k.email || 'Deelnemer');
  const rol = [k.role, k.status && k.status.text].filter(Boolean);
  el.innerHTML = `
    <span class="avatar groot${k.external ? ' ext' : ''}">${heeftNaam ? esc(k.initials) : I.persoon}</span>
    ${heeftNaam ? `<div class="naam">${esc(k.name)}</div>` : `<div class="mailkop">${esc(k.email || 'Onbekend')}</div>`}
    ${k.org ? `<span class="org${k.external ? ' ext' : ''}">${esc(k.org)}</span>` : ''}
    ${rol.length ? `<div class="rol">${esc(k.role || '')}${k.role && k.status ? ' · ' : ''}${k.status ? `<span style="color:${k.status.kleur}">${esc(k.status.text)}</span>` : ''}</div>` : ''}
    ${k.email && heeftNaam ? `<div class="adres">${esc(k.email)}</div>` : ''}
    ${k.email && !k.self ? `<a class="mailknop" href="${mailLink([k.email], k.subject)}">${I.mailVol}E-mail sturen</a>` : ''}`;
  openPaneel(el, { boven: true });
}


/* ------------------------------------------------------------------ */
/*  Agenda-link en agenda kiezen                                       */
/* ------------------------------------------------------------------ */

function openLinkPaneel(voorstel = '') {
  const el = document.createElement('div');
  el.className = 'paneel detail nieuw linkpaneel' + (isDesktop() ? ' dialoog' : '');
  const huidig = voorstel || (BESTAND && BESTAND.link ? BESTAND.link : '');
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><h2 class="dtitel">Agenda-link</h2></div>
      <p class="linkuitleg">Plak de link van je Cloudflare Worker, met de sleutel erin.</p>
      <div class="formkaart">
        <label class="frij kolom"><span class="flabel">Link</span><input id="linkinvoer" type="url" inputmode="url" placeholder="https://agenda.rserne.workers.dev/?sleutel=…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" value="${esc(huidig)}"></label>
      </div>
      <p class="linkfout" id="linkfout" hidden></p>
      <div class="dvoet">
        <button class="groteknop hoofd" id="linkknop">Agenda ophalen</button>
        <p class="voetnoot">De link blijft op dit toestel. Wie de link heeft, ziet je agenda: deel hem dus niet.</p>
      </div>
    </div>`;
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  const invoer = $('#linkinvoer', el), fout = $('#linkfout', el);
  const haal = () => {
    const link = invoer.value.trim();
    const melding = /^webcals?:|outlook\.(office365|office|live)\.com/i.test(link)
      ? 'Een Outlook-link kan de app niet rechtstreeks ophalen. Gebruik de link van je Cloudflare Worker.'
      : !/^https:\/\/\S+$/i.test(link) ? 'Dit is geen geldige link. Hij begint met https://.' : null;
    if (melding) { fout.textContent = melding; fout.hidden = false; return; }
    p.sluit();
    gebruikLink(link);
  };
  $('#linkknop', el).addEventListener('click', haal);
  invoer.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') haal(); });
  el.addEventListener('click', (ev) => { if (ev.target.closest('[data-actie="sluit"]')) p.sluit(); });
  if (!huidig) setTimeout(() => invoer.focus(), 350);
}

// Kiezen waar de afspraken vandaan komen: de Cloudflare-link (werkt zichzelf bij), een .ics-bestand of de voorbeeldgegevens
function openBronPaneel() {
  const nu = BESTAND && BESTAND.link ? 'link' : BESTAND ? 'bestand' : 'voorbeeld';
  const optie = (id, icoon, titel, sub) => `<button class="bronoptie${nu === id ? ' aan' : ''}" data-bron="${id}" aria-pressed="${nu === id}">
      <span class="bronicoon">${icoon}</span><span class="tekst"><span class="t1">${titel}</span><span class="t2">${sub}</span></span>${nu === id ? `<span class="bronvink">${I.vink}</span>` : ''}</button>`;
  const el = document.createElement('div');
  el.className = 'paneel detail nieuw bronpaneel' + (isDesktop() ? ' dialoog' : '');
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><h2 class="dtitel">Agenda kiezen</h2></div>
      <div class="formkaart bronlijst">
        ${optie('link', I.koppel, 'Via je agenda-link', 'Wordt vanzelf bijgewerkt')}
        ${optie('bestand', I.inladen, 'Uit een .ics-bestand', 'Bijwerken doe je zelf')}
        ${optie('voorbeeld', I.kalender, 'Voorbeeldgegevens', 'Verzonnen afspraken en namen')}
      </div>
      <p class="voetnoot">Je agenda blijft alleen op dit toestel. In Outlook verandert er niets.</p>
    </div>`;
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    const k = ev.target.closest('[data-bron]');
    if (!k) return;
    const keuze = k.dataset.bron;
    // Het bestandsvenster moet direct bij de tik openen (iOS), dus vóór het sluiten van het paneel
    if (keuze === 'bestand') { $('#icsinvoer').click(); p.sluit(); return; }
    p.sluit();
    if (keuze === 'link') setTimeout(() => openLinkPaneel(), 250);
    else if (keuze === 'voorbeeld' && nu !== 'voorbeeld' && confirm(wisVraag())) vergeetBestand();
  });
}

/* ------------------------------------------------------------------ */
/*  Instellingen                                                       */
/* ------------------------------------------------------------------ */

// Alles wat alleen op dit toestel staat: je agenda, je contacten, je ruimtes en de Google-sleutel
function openInstellingen() {
  const el = document.createElement('div');
  el.className = 'paneel detail nieuw instellingen' + (isDesktop() ? ' dialoog' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Instellingen');
  const knop = (actie, icoon, tekst, uit = false) => `<button class="frij instknop" data-actie="${actie}"${uit ? ' disabled' : ''}>${icoon}<span>${tekst}</span></button>`;
  const status = (icoon, t1, t2) => `<div class="frij inststatus">${icoon}<span class="tekst"><span class="t1">${t1}</span><span class="t2">${t2}</span></span></div>`;
  const agendaHtml = () => {
    const [t1, t2] = agendaBron();
    return status(BESTAND && BESTAND.link ? I.koppel : BESTAND ? I.inladen : I.kalender, t1, t2)
      + (BESTAND && BESTAND.link ? knop('ics-nu', I.herhaal, 'Nu bijwerken', LINK_BEZIG) : BESTAND ? knop('ics-openen', I.inladen, 'Nieuwer bestand inladen') : '')
      + knop('ics-kies', I.kalender, BESTAND ? 'Andere agenda kiezen' : 'Je eigen agenda kiezen');
  };
  const contactHtml = () => {
    const c = CONTACTEN_INFO;
    const d = c && new Date(c.datum);
    return (c ? status(I.persoon, c.aantal === 1 ? '1 contact' : `${c.aantal} contacten`, `Ingeladen op ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`)
      : status(I.persoon, 'Geen contacten', 'Om namen aan te vullen bij een nieuwe afspraak'))
      + knop('contacten-inladen', I.inladen, c ? 'Nieuwer bestand inladen' : 'Contacten inladen')
      + (c ? knop('contacten-wis', I.wissen, 'Contacten wissen') : '');
  };
  // Ruimtes: per ruimte een naam en een e-mailadres, met een knop om hem te verwijderen
  const ruimteRij = (r, i) => `<div class="frij ruimterij" data-i="${i}">
      <span class="ruimtevelden">
        <input class="rnaam" type="text" placeholder="Naam" aria-label="Naam van de ruimte" autocomplete="off" autocapitalize="words" spellcheck="false" value="${esc(r.naam)}">
        <input class="rmail${r.email && !IS_ADRES.test(r.email.trim()) ? ' ongeldig' : ''}" type="email" inputmode="email" placeholder="E-mailadres (optioneel)" aria-label="E-mailadres van de ruimte" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(r.email)}">
      </span>
      <button class="ruimteweg" data-actie="ruimte-weg" aria-label="${esc(r.naam ? `${r.naam} verwijderen` : 'Ruimte verwijderen')}">${I.min}</button>
    </div>`;
  const ruimtesHtml = () => ruimteLijst().map(ruimteRij).join('') + `<button class="frij instknop" data-actie="ruimte-erbij">${I.plus}<span>Ruimte toevoegen</span></button>`;
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><h2 class="dtitel">Instellingen</h2></div>
      <section class="instsectie"><h3>Agenda</h3><div class="formkaart" id="iagenda">${agendaHtml()}</div></section>
      <section class="instsectie"><h3>Contacten</h3><div class="formkaart" id="icontacten">${contactHtml()}</div>
        <p class="insttoelichting">Een csv uit NK2Edit of Outlook, of een vCard (.vcf).</p></section>
      <section class="instsectie"><h3>Ruimtes</h3><div class="formkaart" id="iruimtes">${ruimtesHtml()}</div></section>
      <section class="instsectie"><h3>Plaatsen via Google</h3><div class="formkaart">
        <label class="frij"><span class="flabel">Sleutel</span><input id="igoogle" type="text" placeholder="Optioneel" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(googleSleutel())}"></label>
        <button class="frij instknop" id="igoogletest">${I.vink}<span>Sleutel testen</span></button>
      </div><p class="insttoelichting" id="igoogleuitslag" aria-live="polite"></p></section>
      <p class="voetnoot">Alles op dit scherm staat alleen op dit toestel. In Outlook verandert er niets.</p>
    </div>`;
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  const tekenAgenda = () => { const a = $('#iagenda', el); if (a) a.innerHTML = agendaHtml(); };
  const tekenContacten = () => { const a = $('#icontacten', el); if (a) a.innerHTML = contactHtml(); };
  // Wat er in de velden staat, meteen bewaren
  const leesRuimtes = () => [...el.querySelectorAll('.ruimterij')].map((rij) => ({ naam: $('.rnaam', rij).value, email: $('.rmail', rij).value }));
  const tekenRuimtes = (focusRij = -1) => {
    $('#iruimtes', el).innerHTML = ruimtesHtml();
    if (focusRij >= 0) { const i = el.querySelector(`.ruimterij[data-i="${focusRij}"] .rnaam`); if (i) i.focus(); }
  };
  el.addEventListener('input', (ev) => {
    if (ev.target.closest('.ruimterij')) zetRuimteLijst(leesRuimtes());
    if (ev.target.classList.contains('rmail')) { const w = ev.target.value.trim(); ev.target.classList.toggle('ongeldig', !!w && !IS_ADRES.test(w)); }
    if (ev.target.id === 'igoogle') zetGoogleSleutel(ev.target.value);
  });
  el.addEventListener('click', async (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    const a = t.closest('[data-actie]');
    const actie = a && a.dataset.actie;
    // Een bestandsvenster moet direct bij de tik openen (iOS), dus vóór het sluiten van het paneel
    if (actie === 'ics-openen') { $('#icsinvoer').click(); p.sluit(); return; }
    if (actie === 'contacten-inladen') { $('#contactinvoer').click(); p.sluit(); return; }
    if (actie === 'ics-kies') { p.sluit(); setTimeout(openBronPaneel, 250); return; }
    if (actie === 'ruimte-erbij') { const l = leesRuimtes(); l.push({ naam: '', email: '' }); zetRuimteLijst(l); tekenRuimtes(l.length - 1); return; }
    if (actie === 'ruimte-weg') { const l = leesRuimtes(); l.splice(Number(a.closest('.ruimterij').dataset.i), 1); zetRuimteLijst(l); tekenRuimtes(); return; }
    if (actie === 'ics-nu') { Promise.resolve(nuBijwerken()).finally(tekenAgenda); tekenAgenda(); return; }
    if (actie === 'contacten-wis') {
      if (confirm('Contacten wissen? Ze verdwijnen alleen van dit toestel; je bestand blijft gewoon bestaan.')) { await vergeetContacten(); tekenContacten(); render(); renderZijbalk(); }
      return;
    }
    if (t.closest('#igoogletest')) {
      const uit = $('#igoogleuitslag', el);
      const sleutel = $('#igoogle', el).value.trim();
      if (!sleutel) { uit.textContent = 'Vul eerst een sleutel in.'; return; }
      uit.textContent = 'Testen…';
      const r = await testGoogleSleutel(sleutel);
      uit.textContent = r.tekst;
      uit.classList.toggle('fout', !r.ok);
    }
  });
}
