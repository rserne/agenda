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
      <div class="detailnav"><button class="rond glas${notitieBij(e.id) ? ' aan' : ''}" data-actie="eigennotitie" aria-label="Notitie">${I.notitie}</button><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
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
          <button class="rond kopknop${notitieBij(e.id) ? ' aan' : ''}" data-actie="eigennotitie" aria-label="Notitie">${I.notitie}</button>
        </div>
        ${notitieSectieHtml(e)}
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
      if (a.dataset.actie === 'eigennotitie') {
        if (isDesktop()) { p.sluit(); toonInNotities({ e }); } // iPad en Mac: in de tab Notities
        else openNotitie({ e, klaar: () => { teken(); maakVeegbaar(el, el.querySelector('.detailgreep'), p.sluit); } });
      }
      return;
    }
    const pers = ev.target.closest('[data-persoon]');
    if (pers) openVisitekaartje(kaartjes[Number(pers.dataset.persoon)]);
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
