// Agenda, nieuwe afspraak
// Een nieuwe afspraak voorbereiden: een vrij moment kiezen, deelnemers en een plek aanvullen, en daarna afmaken in
// Outlook (de app schrijft zelf nooit in de agenda).
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

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

// Begintijden in een vrij blok: in stappen van de gekozen duur (of van stap minuten), vanaf het begin van het blok
// (op een kwartier), plus het laatste moment waarop de afspraak nog past. Een uur in 16:00 – 18:00 geeft 16:00 en 17:00,
// met stappen van een half uur 16:00, 16:30 en 17:00.
function tijdenInBlok(a, b, duur, stap = duur) {
  const ms = duur * 6e4;
  const kwartier = 15 * 6e4;
  const zet = new Set();
  const eerste = Math.ceil(a / kwartier) * kwartier;
  for (let t = eerste; t + ms <= b; t += stap * 6e4) zet.add(t);
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
// Een item is { t1, t2, kop? }. kies(item) vult het veld. Een lijst kan een .melding hebben (onderaan, niet te kiezen).
// leegTonen: ook zonder tekst suggesties tonen, zodra je in het veld tikt (de ruimtes bij Locatie).
function koppelSuggesties(veld, lijstEl, { vraagVan = (w) => w.trim(), zoek, kies, leegTonen = false }) {
  let items = [], melding = '', actief = -1, beurt = 0, stil = false, getekend = '';
  const sluit = () => { items = []; melding = ''; actief = -1; getekend = ''; lijstEl.innerHTML = ''; lijstEl.hidden = true; veld.setAttribute('aria-expanded', 'false'); veld.removeAttribute('aria-activedescendant'); };
  const teken = () => {
    if (!items.length && !melding) { sluit(); return; }
    const html = items.map((c, i) => `${c.kop ? `<div class="aanvulkop" role="presentation">${esc(c.kop)}</div>` : ''}<button type="button" role="option" id="${lijstEl.id}-${i}" class="aanvuloptie${i === actief ? ' actief' : ''}" aria-selected="${i === actief}" data-aanvul="${i}" tabindex="-1">
        <span class="t1">${esc(c.t1)}</span>${c.t2 ? `<span class="t2">${esc(c.t2)}</span>` : ''}</button>`).join('')
      + (melding ? `<div class="aanvulmelding" role="status">${esc(melding)}</div>` : '');
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
    items = nu; melding = nu.melding || ''; actief = items.length && !IOS ? 0 : -1; teken();
    if (later) later.then((nieuw) => {
      if (mijn !== beurt || document.activeElement !== veld || !nieuw) return;
      const was = items[actief];
      items = nieuw; melding = nieuw.melding || '';
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
async function openNieuw({ dag = null, blok = null, start = null, duur = null, locatie = '' } = {}) {
  const v = { titel: '', locatie: '', deelnemers: '', notitie: '', ruimte: null, duur: 60, start: null, eigen: false, dag: null, blok };
  if (blok) {
    v.dag = startOfDay(new Date(blok.start));
    v.max = Math.floor((blok.end - blok.start) / 9e5) * 15; // duur hoogstens het hele blok, in kwartieren
    v.duur = Math.min(duur || 60, v.max);
    if (start != null) v.start = start; // gekozen in Tijden uit een mail
  } else if (dag) {
    v.dag = startOfDay(dag);
    if (duur) v.duur = duur;
    if (start != null) { v.start = start; v.vast = true; } // gekozen tijd houden, ook als hij overlapt
  }
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
        <div class="frij kolom"><span class="flabel">Begintijd</span><div id="ntijdlijn" role="button" tabindex="0" aria-expanded="false" aria-label="Afspraken van deze dag"></div><div id="nafspraken" hidden></div><div id="ntijden"></div></div>
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
  // De balk: de werkdag, of het aangeklikte vrije blok met een uur ervoor en erna
  // Tik op de balk: daaronder de afspraken uit de balk, vet als ze botsen met de gekozen tijd of er direct op aansluiten
  let lijstOpen = false;
  const tekenLijn = () => {
    const d0 = startOfDay(v.dag).getTime();
    const o = blok ? { dag: v.dag, van: (+blok.start - d0) / 6e4, tot: (+blok.end - d0) / 6e4 } : { dag: v.dag, van: WORK_START * 60, tot: WORK_END * 60 };
    const marge = blok ? 60 : 0;
    const balk = $('#ntijdlijn', el), lijstEl = $('#nafspraken', el);
    balk.innerHTML = tijdlijn(lijst, o, v.start != null ? [v.start] : [], v.duur * 6e4, blok ? {} : { marge: 0, stap: 2 });
    balk.setAttribute('aria-expanded', String(lijstOpen));
    lijstEl.hidden = !lijstOpen;
    if (!lijstOpen) return;
    const ws = d0 + (o.van - marge) * 6e4, we = d0 + (o.tot + marge) * 6e4;
    const a = v.start, b = v.start != null ? v.start + v.duur * 6e4 : null;
    const items = lijst.filter((e) => !e.allDay && !e.free && e.end.getTime() > ws && e.start.getTime() < we).sort((x, y) => x.start - y.start);
    const raakt = (e) => a != null && e.start.getTime() <= b && e.end.getTime() >= a;
    lijstEl.innerHTML = items.length
      ? `<ul class="moverlap">${items.map((e) => `<li${raakt(e) ? ' class="raakt"' : ''}><span class="num">${hhmm(e.start)} – ${hhmm(e.end)}</span><span>${esc(e.title || 'Een afspraak')}</span></li>`).join('')}</ul>`
      : '<p class="nleeg">Geen afspraken</p>';
  };
  const wisselLijst = () => { lijstOpen = !lijstOpen; tekenLijn(); };
  $('#ntijdlijn', el).addEventListener('click', wisselLijst);
  $('#ntijdlijn', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wisselLijst(); } });
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
      if (v.vast) { v.vast = false; if (!alle.includes(v.start)) v.eigen = true; } // de gekozen tijd staat dan bij Andere tijd
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
    tekenLijn();
    tekenSamen();
  };
  const zetDag = (d) => {
    v.dag = startOfDay(d);
    if (!v.eigen) v.start = null;
    else if (v.start != null) { const t = new Date(v.start); v.start = new Date(v.dag.getFullYear(), v.dag.getMonth(), v.dag.getDate(), t.getHours(), t.getMinutes()).getTime(); }
    tekenTijden();
  };

  if (locatie) { v.locatie = locatie; $('input[name="locatie"]', el).value = locatie; }
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
  let sessie = nieuweSessie(), googleWacht = null, plaatsen = [], googleMelding = '';
  // Ruimtes eerst, dan plaatsen; koppen alleen als er van allebei iets is
  const metKoppen = (rs, ps) => {
    const r = rs.map((x, i) => ({ ...x, kop: i === 0 && ps.length ? 'Ruimtes' : '' }));
    const p2 = ps.map((x, i) => ({ ...x, kop: i === 0 && rs.length ? 'Plaatsen' : '' }));
    const lijst = [...r, ...p2];
    lijst.melding = googleMelding;
    return lijst;
  };
  koppelSuggesties(locVeld, $('#nlocaties', el), {
    leegTonen: true,
    zoek: (vraag) => {
      const rs = zoekRuimtes(vraag).map((r) => ({ t1: r.naam, t2: r.email ? `Ruimte · ${r.email}` : 'Ruimte', ruimte: r }));
      clearTimeout(googleWacht);
      if (!googleSleutel() || vraag.length < 3) { plaatsen = []; return { nu: rs }; }
      // Weigert Google de sleutel (of is het tegoed op), dan zeggen we dat onderaan de lijst. Zonder verbinding: gewoon geen plaatsen.
      const fout = (e) => {
        plaatsen = [];
        googleMelding = e.status === 400 || e.status === 403 ? 'Google accepteert je sleutel niet meer. Controleer hem onder Instellingen.'
          : e.status === 429 ? 'Google geeft even geen plaatsen: de limiet van je sleutel is bereikt.' : '';
        return metKoppen(rs, []);
      };
      // De vorige plaatsen blijven staan tot de nieuwe binnen zijn: zo verspringt de lijst niet bij elke letter
      const later = new Promise((ok) => { googleWacht = setTimeout(ok, 300); })
        .then(() => zoekPlaatsen(vraag, sessie))
        .then((ps) => { googleMelding = ''; plaatsen = ps.map((pl) => ({ t1: pl.naam, t2: pl.sub, tekst: pl.tekst })); return metKoppen(rs, plaatsen); }, fout);
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
      tekenLijn();
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
