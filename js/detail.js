// Agenda, detailscherm
// Het detailscherm van een afspraak: tijd, plek, deelnemers en de knoppen naar Outlook. En het visitekaartje van een
// deelnemer.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

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

// Het detailscherm in vier delen: eerst de gegevens (detailKop, detailPersonen), dan de HTML per sectie (...Html), en
// in openDetail alleen nog de toestand (alle deelnemers, lange notities) en de tikken.

// De regels onder de titel: soort, datum, tijd, herhaling en overlap
function detailKop(e) {
  const rec = recurrenceText(e);
  // Overlap: dezelfde regel als in de lijst, maar hier met alle afspraken erbij
  const o = overlapVan(eventsForDay([...zichtbaar.values()], e.start)).get(e);
  const namen = o ? o.andere.map((x) => `${x.title || 'een afspraak'}${x.start > e.start ? ` om ${hhmm(x.start)}` : ''}`) : [];
  const laatsteDag = addDays(e.end, -1);
  return {
    soort: e.kind === 'ext' ? 'Extern' : e.kind === 'int' ? 'Intern, ad hoc' : 'Intern, vast',
    datum: cap(`${DAYS_LONG[e.start.getDay()]} ${e.start.getDate()} ${MONTHS_LONG[e.start.getMonth()]}`),
    tijd: e.allDay
      ? (Math.round((e.end - e.start) / 864e5) > 1 ? `Hele dag, t/m ${laatsteDag.getDate()} ${MONTHS_LONG[laatsteDag.getMonth()]}` : 'Hele dag')
      : `${hhmm(e.start)} – ${hhmm(e.end)} · ${durationText(e.start, e.end)}`,
    herhaling: rec ? cap(rec) : '',
    overlap: o ? `Overlap met ${namen.length > 1 ? `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}` : namen[0]}` : '',
  };
}

// Organisator en deelnemers, gegroepeerd per organisatie: externen eerst, dan de grootste groep, Overig achteraan
function detailPersonen(e) {
  const own = eigenDomeinen();
  const isExtern = (d) => !!d && own.size > 0 && !isOwnDomain(d, own);
  const org = e.organizer;
  const orgDomein = org ? domainOf(org.email) : null;
  const orgExtern = isExtern(orgDomein);
  const mensen = e.attendees.filter((a) => !isRoom(a) && !(org && org.email && a.email === org.email));
  const groepen = {};
  mensen.forEach((a) => {
    const d = domainOf(a.email);
    const external = isExtern(d);
    const naam = !d ? 'Overig' : external ? orgLabel(d) : OWN_ORG_NAME;
    (groepen[naam] = groepen[naam] || { name: naam, external, people: [] }).people.push(a);
  });
  return {
    org, orgExtern,
    orgNaam: orgDomein ? (orgExtern ? orgLabel(orgDomein) : OWN_ORG_NAME) : null,
    mensen,
    mailTo: [...new Set([org, ...mensen].filter((p) => p && !isMe(p)).map((p) => p.email).filter(Boolean))],
    groepen: Object.values(groepen).sort((a, b) => {
      if (a.external !== b.external) return a.external ? -1 : 1;
      if (a.name === 'Overig') return 1;
      if (b.name === 'Overig') return -1;
      return b.people.length - a.people.length;
    }),
  };
}

// De greep bovenaan (iPhone) met rechts het notitieknopje en sluiten
function detailGreepHtml(e) {
  return paneelGreepHtml(`<button class="rond glas${notitieBij(e.id) ? ' aan' : ''}" data-actie="eigennotitie" aria-label="Notitie">${I.notitie}</button>`);
}

function detailKopHtml(e, kop) {
  return `<div class="dkop">
          <span class="stip ${e.kind}" role="img" aria-label="${kop.soort}" title="${kop.soort}"></span>
          <div class="dkopinhoud">
          <h2 class="dtitel">${esc(e.title || 'Zonder titel')}</h2>
          <div class="dmeta">
            <div>${kop.datum}</div>
            <div class="num">${kop.tijd}${kop.herhaling ? `<span class="dher" role="img" aria-label="${esc(kop.herhaling)}" title="${esc(kop.herhaling)}">${I.herhaal}</span>` : ''}</div>
            ${e.mode !== 'none' ? `<div>${MODE_LABEL[e.mode]}</div>` : ''}
            ${kop.overlap ? `<div class="doverlap">${esc(kop.overlap)}</div>` : ''}
          </div>
          ${e.external ? `<div class="dbadges">${e.orgs.map((o) => `<span>${esc(o)}</span>`).join('')}</div>` : ''}
          </div>
          <button class="rond kopknop${notitieBij(e.id) ? ' aan' : ''}" data-actie="eigennotitie" aria-label="Notitie">${I.notitie}</button>
        </div>`;
}

// Locatie: de plekken (een ruimte, of een adres met Route) en de online vergadering
function detailLocatieHtml(e) {
  const rij = (icoon, t1, t2, actie = '', online = false) => `<div class="drij"><span class="dicoon${online ? ' online' : ''}">${icoon}</span><span class="tekst"><div class="t1">${t1}</div><div class="t2">${t2}</div></span>${actie}</div>`;
  const plekken = e.places.map((p) => {
    const ruimte = e.roomNames.includes(p) || !isAddressLike(p);
    return rij(I.speld, esc(p), ruimte ? (e.mode === 'hybrid' ? 'Vergaderruimte' : 'Vergaderruimte, fysiek overleg') : 'Fysiek overleg',
      ruimte ? '' : `<a class="actie zacht" href="https://maps.apple.com/?q=${encodeURIComponent(p)}" target="_blank" rel="noopener">Route</a>`);
  });
  if (e.mode === 'physical' && !plekken.length) plekken.push(rij(I.speld, 'Op locatie', 'Geen plek opgegeven'));
  if (e.link) plekken.push(rij(I.video, esc(e.link.provider), e.mode === 'hybrid' ? 'Ook online te volgen' : 'Online vergadering',
    `<a class="actie" href="${esc(e.link.url)}" target="_blank" rel="noopener">Deelnemen</a>`, true));
  return plekken.length ? `<section class="sectie"><h3>Locatie</h3><div class="kaart">${plekken.join('')}</div></section>` : '';
}

function persoonRijHtml(p, { idx, external = false, badge = null, status = false }) {
  const st = status ? statusOf(p.status) : null;
  const naam = isMe(p) ? `${p.name || 'Jij'} (jij)` : p.name || p.email || 'Onbekend';
  return `<button class="drij persoon" data-persoon="${idx}">
      <span class="avatar${external ? ' ext' : ''}">${esc(initialsOf(p.name, p.email))}</span>
      <span class="tekst"><div class="t1">${esc(naam)}</div></span>
      ${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
      ${st ? `<span class="status" style="color:${st.kleur}">${st.text}</span>` : ''}
    </button>`;
}

// Organisator en deelnemers. Geeft de HTML en per rij de gegevens voor het visitekaartje (data-persoon is het nummer).
// Zonder 'allen' de eerste PEOPLE_LIMIT deelnemers, in de volgorde van de groepen.
function detailMensenHtml(e, pers, allen) {
  const kaartjes = [];
  const kaartje = (p, extra) => kaartjes.push({ ...extra, name: p.name, email: p.email, self: isMe(p), initials: initialsOf(p.name, p.email), subject: e.title }) - 1;
  // Afgeleide organisatie (gepubliceerde agenda zonder organisator): geen apart kopje, het label bovenaan zegt genoeg
  const orgHtml = pers.org ? `<section class="sectie"><h3>Organisator</h3><div class="kaart">${persoonRijHtml(pers.org, {
    idx: kaartje(pers.org, { org: pers.orgNaam, external: pers.orgExtern, role: 'Organisator' }),
    external: pers.orgExtern, badge: pers.orgExtern ? pers.orgNaam : null,
  })}</div></section>` : '';

  let budget = allen ? Infinity : PEOPLE_LIMIT;
  const groepen = pers.groepen.map((g) => {
    const take = Math.max(0, Math.min(g.people.length, budget));
    budget -= take;
    return { ...g, shown: g.people.slice(0, take) };
  }).filter((g) => g.shown.length);
  const aantal = pers.mensen.length;
  const deelnHtml = aantal ? `<section class="sectie"><h3>Deelnemers · ${aantal}</h3><div class="kaart">
      ${groepen.map((g) => `<div class="groep${g.external ? ' ext' : ''}">${esc(g.people.length > 1 ? `${g.name} · ${g.people.length}` : g.name)}</div>
        ${g.shown.map((a) => persoonRijHtml(a, {
          idx: kaartje(a, { org: g.name === 'Overig' ? null : g.name, external: g.external, role: ROLE_LABEL[a.role], status: statusOf(a.status) }),
          external: g.external, status: true,
        })).join('')}`).join('')}
      ${aantal > PEOPLE_LIMIT ? `<button class="meerknop" data-actie="allen">${allen ? 'Minder tonen' : `Alle ${aantal} deelnemers tonen`}</button>` : ''}
    </div></section>` : '';
  return { html: `${orgHtml}\n${deelnHtml}`, kaartjes };
}

// De notities uit de uitnodiging; lange notities ingekort met Meer tonen
function detailNotitiesHtml(notes, meer) {
  if (!notes) return '';
  const lang = notes.split('\n').length > 6 || notes.length > 280;
  return `<section class="sectie"><h3>Notities</h3><div class="kaart"><div class="notities"><p class="${lang && !meer ? 'kort' : ''}">${esc(notes)}</p>${lang ? `<button data-actie="notities">${meer ? 'Minder tonen' : 'Meer tonen'}</button>` : ''}</div></div></section>`;
}

function detailVoetHtml(e, mailTo) {
  return `<div class="dvoet">
          ${mailTo.length ? `<a class="groteknop" href="${mailLink(mailTo, e.title)}">${I.mail}${mailTo.length === 1 ? 'Mail de deelnemer' : `Mail alle deelnemers (${mailTo.length})`}</a>` : ''}
          <a class="groteknop" ${outlookOpenAttr(e)}>${I.extern}Openen in Outlook</a>
          <p class="voetnoot">Accepteren, misschien of weigeren doe je in Outlook.</p>
        </div>`;
}

function openDetail(e) {
  // De gegevens één keer, bij het openen; opnieuw tekenen (meer of minder tonen) verandert daar niets aan
  const kop = detailKop(e);
  const pers = detailPersonen(e);
  const notes = cleanNotes(e.notes);
  const el = document.createElement('div');
  el.className = 'paneel detail' + (isDesktop() ? ' dialoog' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', e.title || 'Afspraak');
  let allen = false;
  let meerNotities = false;
  let kaartjes = [];

  const teken = () => {
    const mensen = detailMensenHtml(e, pers, allen);
    kaartjes = mensen.kaartjes;
    el.innerHTML = `${detailGreepHtml(e)}
      <div class="detailinhoud">
        ${detailKopHtml(e, kop)}
        ${notitieSectieHtml(e)}
        ${detailLocatieHtml(e)}
        ${mensen.html}
        ${detailNotitiesHtml(notes, meerNotities)}
        ${detailVoetHtml(e, pers.mailTo)}
      </div>`;
  };
  teken();
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  // Na opnieuw tekenen is de greep een nieuw element: het vegen opnieuw koppelen
  const hertekenen = () => { teken(); maakVeegbaar(el, el.querySelector('.detailgreep'), p.sluit); };
  const acties = {
    sluit: () => p.sluit(),
    allen: () => { allen = !allen; hertekenen(); },
    notities: () => { meerNotities = !meerNotities; hertekenen(); },
    eigennotitie: () => {
      if (isDesktop()) { p.sluit(); toonInNotities({ e }); } // iPad en Mac: in de tab Notities
      else openNotitie({ e, klaar: hertekenen });
    },
  };
  el.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-actie]');
    if (a) { if (Object.hasOwn(acties, a.dataset.actie)) acties[a.dataset.actie](); return; }
    const rij = ev.target.closest('[data-persoon]');
    if (rij) openVisitekaartje(kaartjes[Number(rij.dataset.persoon)]);
  });
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
