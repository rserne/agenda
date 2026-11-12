// Agenda, tijden uit een mail
// Het paneel dat de tijden uit een geplakte mail naast je agenda legt. Het lezen van de mail zelf staat in
// js/mailtijden.js.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

/* ------------------------------------------------------------------ */
/*  Tijden uit een mail                                                */
/* ------------------------------------------------------------------ */

let MAILTEKST = ''; // de geplakte tekst, zolang de app open is

// Een tijdvak uit de mail naast de agenda: wat is er vrij, waar past de duur, en wat zit in de weg
function toetsVak(lijst, o, duur) {
  const a = new Date(o.dag); a.setHours(0, o.van, 0, 0);
  const b = new Date(o.dag); b.setHours(0, o.tot, 0, 0);
  const n = nu().getTime();
  const tot = b.getTime();
  if (tot <= n) return { status: 'voorbij', vrij: [], tijden: [], botst: [] };
  const van = Math.max(a.getTime(), Math.ceil(n / 9e5) * 9e5);
  const botst = lijst.filter((e) => !e.allDay && !e.free && e.start.getTime() < tot && e.end.getTime() > van);
  const vrij = [];
  let c = van;
  botst.map((e) => [Math.max(e.start.getTime(), van), Math.min(e.end.getTime(), tot)]).sort((x, y) => x[0] - y[0])
    .forEach(([x, y]) => { if (x > c) vrij.push([c, x]); c = Math.max(c, y); });
  if (tot > c) vrij.push([c, tot]);
  const ms = duur * 6e4;
  // Vrije begintijden per half uur (bij een kwartier per kwartier)
  const vrijeTijden = vrij.filter(([x, y]) => y - x >= ms).flatMap(([x, y]) => tijdenInBlok(x, y, duur, Math.min(duur, 30)));
  // Ook tijden die overlappen kun je kiezen: je beslist zelf of die andere afspraak voor kan gaan
  // Daarnaast het begin van het tijdvak en elk begin en einde van een overleg erin: daar kun je een overleg overslaan
  const grenzen = tot - van <= ms ? [van] // 'om 10:30': alleen dat moment
    : [van, ...botst.flatMap((e) => [e.start.getTime(), e.end.getTime()])].filter((t) => t >= van && t < tot);
  const alle = [...new Set([...vrijeTijden, ...grenzen])].sort((x, y) => x - y);
  const tijden = alle.map((t) => metOverlap(t, ms, vrij, botst));
  return { status: vrijeTijden.length ? 'vrij' : vrij.length ? 'kort' : 'bezet', vrij, tijden, botst, heel: !botst.length && van === a.getTime(), van, tot };
}
// Een begintijd met wat erin zit: het vrije blok (als hij past), de afspraken die overlappen, en of hij helemaal bezet is
function metOverlap(t, ms, vrij, botst) {
  const b = botst.filter((e) => e.start.getTime() < t + ms && e.end.getTime() > t);
  let bezet = 0, c = t;
  b.map((e) => [Math.max(e.start.getTime(), t), Math.min(e.end.getTime(), t + ms)]).sort((x, y) => x[0] - y[0])
    .forEach(([x, y]) => { if (y > c) { bezet += y - Math.max(x, c); c = y; } });
  return { t, blok: vrij.find(([x, y]) => t >= x && t + ms <= y) || null, botst: b, vol: bezet >= ms };
}
// Een tijdlijntje van een uur voor tot een uur na het tijdvak: elk overleg, de vrije tijd binnen het tijdvak
// en de gekozen tijden. Zo zie je of een tijd aansluit op een overleg ervoor of erna.
// marge: hoeveel minuten voor en na het tijdvak; stap: om de hoeveel uur een tijd onder de balk
function tijdlijn(lijst, o, gekozenT, ms, { marge = 60, stap = 1 } = {}) {
  if (o.heleDag) return '';
  const d0 = new Date(o.dag); d0.setHours(0, 0, 0, 0);
  const ws = Math.max(0, o.van - marge), we = Math.min(24 * 60, o.tot + marge);
  const pos = (m) => `${((Math.min(we, Math.max(ws, m)) - ws) / (we - ws)) * 100}%`;
  const breed = (a, b) => `${((Math.min(we, b) - Math.max(ws, a)) / (we - ws)) * 100}%`;
  const min = (x) => (x - d0.getTime()) / 6e4;
  const blok = (a, b, cls) => `<span class="${cls}" style="left:${pos(a)};width:${breed(a, b)}"></span>`;
  // Bezet: overleggen die overlappen of aansluiten samen; de rest van het tijdvak is vrij
  const bezet = [];
  lijst.filter((e) => !e.allDay && !e.free).map((e) => [Math.max(ws, min(e.start.getTime())), Math.min(we, min(e.end.getTime()))])
    .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
    .forEach(([a, b]) => { const l = bezet.at(-1); if (l && a <= l[1]) l[1] = Math.max(l[1], b); else bezet.push([a, b]); });
  const vrij = [];
  let c = o.van;
  bezet.forEach(([a, b]) => { if (a > c && c < o.tot) vrij.push([c, Math.min(a, o.tot)]); c = Math.max(c, b); });
  if (c < o.tot) vrij.push([c, o.tot]);
  let html = '<div class="mtijdlijn" aria-hidden="true"><div class="mbalk">';
  vrij.forEach(([a, b]) => { html += blok(a, b, 'mvrij'); });
  lijst.filter((e) => !e.allDay && !e.free && min(e.end.getTime()) > ws && min(e.start.getTime()) < we)
    .forEach((e) => { html += blok(min(e.start.getTime()), min(e.end.getTime()), 'moverleg'); });
  // Het kader om het tijdvak: links en rechts net zoveel marge als boven en onder
  // (2 punten breder, want elk blokje heeft aan de zijkant al een scheidingslijn van 1 punt)
  if (marge) html += `<span class="mvakband" style="left:calc(${pos(o.van)} - 2px);width:calc(${breed(o.van, o.tot)} + 4px)"></span>`;
  // De gekozen tijd: net als het kader om het tijdvak met marge links en rechts
  gekozenT.forEach((t) => {
    // Aan de rand van de balk geen marge, anders valt het kader er half buiten
    const l = min(t) > ws ? 2 : 0, r = min(t + ms) < we ? 2 : 0;
    html += `<span class="mkeus" style="left:calc(${pos(min(t))} - ${l}px);width:calc(${breed(min(t), min(t + ms))} + ${l + r}px)"></span>`;
  });
  html += '</div><div class="muren">';
  for (let h = Math.ceil(ws / 60); h <= Math.floor(we / 60); h += stap) html += `<span style="left:${pos(h * 60)}">${h}:00</span>`;
  return html + '</div></div>';
}
// 'Overlap met A (09:00 – 17:00), B (13:00 – 14:00) en C (14:00 – 15:00)': altijd allemaal
function overlapZin(botst) {
  if (!botst.length) return '';
  const namen = botst.map((e) => `${e.title || 'een afspraak'} (${hhmm(e.start)} – ${hhmm(e.end)})`);
  return `Overlap met ${namen.length > 1 ? `${namen.slice(0, -1).join(', ')} en ${namen.at(-1)}` : namen[0]}`;
}

// 'maandag 9 november van 14:00 tot 15:00'
const mtUur = (d) => `${d.getHours()}:${pad(d.getMinutes())}`; // in een zin: 9:00, niet 09:00
const mtMoment = (t, duur) => { const d = new Date(t); return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} van ${mtUur(d)} tot ${mtUur(new Date(t + duur * 6e4))}`; };
// Het antwoord: bij één tijd een zin, bij meer eerst de zin en dan de tijden als opsomming.
// tekst: wat op het klembord komt (platte tekst met •), html: hoe het in de app staat
function mtAntwoord(tijden, duur) {
  const momenten = [...tijden].sort((x, y) => x - y).map((t) => mtMoment(t, duur));
  if (!momenten.length) return { tekst: '', html: '' };
  if (momenten.length === 1) { const z = `Ik kan op ${momenten[0]}.`; return { tekst: z, html: `<p>${esc(z)}</p>` }; }
  const kop = 'Ik kan op de volgende tijdstippen:';
  return {
    tekst: `${kop}\n${momenten.map((m) => `• ${cap(m)}`).join('\n')}`,
    html: `<p>${kop}</p><ul>${momenten.map((m) => `<li>${esc(cap(m))}</li>`).join('')}</ul>`,
  };
}

function openMailTijden() {
  const el = document.createElement('div');
  el.className = 'paneel detail nieuw mailtijden' + (isDesktop() ? ' dialoog' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Tijden uit een mail');
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><h2 class="dtitel">Tijden uit een mail</h2></div>
      <div class="formkaart">
        <label class="frij volbreed"><textarea id="mtekst" rows="5" name="vrijetekst" placeholder="Plak hier de dagen en tijden, bijvoorbeeld: maandag 9 november tussen 13:00 en 16:00" aria-label="Dagen en tijden" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text"></textarea></label>
        <button class="frij instknop" id="mtoon" hidden>Hele tekst tonen</button>
      </div>
      <div class="formkaart">
        <div class="frij"><span class="flabel">Duur</span><span class="fwaarde stapper">
          <button class="mini" data-stap="-15" aria-label="Korter">${I.min}</button><span id="mduur" class="num" aria-live="polite"></span><button class="mini" data-stap="15" aria-label="Langer">${I.plus}</button>
        </span></div>
      </div>
      <div id="muitslag" aria-live="polite"></div>
      <div class="nvast">
        <div class="nsamenvatting" id="msamen"></div>
        <button class="groteknop vol" id="mkopieer">${I.kopieer}Antwoord kopiëren</button>
        <button class="tekstknop" id="minplannen">Inplannen</button>
      </div>
    </div>`;
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  const veld = $('#mtekst', el);
  veld.value = MAILTEKST;
  let duur = 60, duurZelf = false, gelezen = { opties: [], duur: null, online: false, zonderDag: [] }, beurt = 0, wacht = null;
  const tijdInfo = new Map(); // per getekende begintijd: vrij blok en overlap
  const gekozen = new Map(); // begintijd → { blok: het vrije blok (of null), botst: afspraken die overlappen }
  const tekenDuur = () => {
    $('#mduur', el).textContent = duurKort(duur);
    $('[data-stap="-15"]', el).disabled = duur <= 15;
    $('[data-stap="15"]', el).disabled = duur >= 8 * 60;
  };
  const tekenSamen = () => {
    const n = gekozen.size;
    $('#minplannen', el).hidden = n !== 1; // inplannen kan met precies één tijd; anders is de knop er niet
    $('#mkopieer', el).disabled = !n;
    // Zo komt het antwoord in je mail (alleen de tijden, nooit een reden)
    $('#msamen', el).innerHTML = n ? `<div class="mantwoord">${mtAntwoord(gekozen.keys(), duur).html}</div>` : `<div class="leeg">${gelezen.opties.length ? 'Tik op een tijd om hem te kiezen' : 'Nog geen tijden'}</div>`;
  };
  // Eerst hoe het ervoor staat (in kleur), daaronder altijd waarmee het overlapt
  // De kleuren van de tijden zeggen genoeg; eronder alleen elk overleg dat in het tijdvak valt, op een eigen regel
  const statusTekst = (u) => {
    if (u.status === 'voorbij') return '<span class="mstatus grijs">Al voorbij</span>';
    return (u.botst.length ? `<span class="mstatus sub">Overlap met</span><ul class="moverlap">${u.botst.map((e) => `<li><span class="num">${hhmm(e.start)} – ${hhmm(e.end)}</span><span>${esc(e.title || 'Een afspraak')}</span></li>`).join('')}</ul>` : '');
  };
  const teken = async () => {
    const mijn = ++beurt;
    const uit = $('#muitslag', el);
    if (!veld.value.trim()) { uit.innerHTML = ''; gekozen.clear(); tekenSamen(); return; }
    const per = new Map();
    for (const o of gelezen.opties) { const k = ymd(o.dag); if (!per.has(k)) per.set(k, []); per.get(k).push(o); }
    const lijsten = new Map();
    for (const k of per.keys()) lijsten.set(k, await afsprakenOp(parseYmd(k)));
    if (mijn !== beurt) return;
    const bestaand = new Set();
    tijdInfo.clear();
    let html = '';
    if (!gelezen.opties.length) html = `<p class="insttoelichting fout">Geen dagen en tijden gevonden. Staat er bij elke dag een datum of weekdag, zoals "maandag 9 november tussen 13:00 en 16:00"?</p>`;
    for (const [k, os] of per) {
      const d = parseYmd(k);
      const waarschuwing = os.find((o) => o.waarschuwing);
      html += `<section class="instsectie"><h3>${esc(cap(`${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`))}</h3><div class="formkaart">`;
      for (const o of os) {
        const u = toetsVak(lijsten.get(k), o, duur);
        // Een gekozen tijd blijft staan zolang hij in het tijdvak valt, ook als hij bij deze duur geen voorstel is
        const ms = duur * 6e4;
        for (const t of gekozen.keys()) {
          if (t >= u.van && t + ms <= Math.max(u.tot, u.van + ms) && !u.tijden.some((x) => x.t === t)) {
            u.tijden.push(metOverlap(t, ms, u.vrij, u.botst));
          }
        }
        u.tijden.sort((x, y) => x.t - y.t);
        u.tijden.forEach((x) => { bestaand.add(x.t); tijdInfo.set(x.t, { blok: x.blok, botst: x.botst, vol: x.vol }); if (gekozen.has(x.t)) gekozen.set(x.t, { blok: x.blok, botst: x.botst, vol: x.vol }); });
        const van = `${pad(Math.floor(o.van / 60))}:${pad(o.van % 60)}`, tot = `${pad(Math.floor(o.tot / 60))}:${pad(o.tot % 60)}`;
        html += `<div class="frij kolom mvak"><span class="mkop"><span class="t1 num">${o.heleDag ? 'Hele dag' : `${van} – ${tot}`}</span>${statusTekst(u)}</span>
          ${tijdlijn(lijsten.get(k), o, [...gekozen.keys()].filter((t) => t >= u.van && t < u.tot), ms)}
          ${u.tijden.length ? `<div class="chips">${u.tijden.map((x) => `<button class="chip num${gekozen.has(x.t) ? ' aan' : ''}${x.vol ? ' vol' : x.botst.length ? ' botst' : ' vrij'}" data-t="${x.t}" aria-pressed="${gekozen.has(x.t)}" aria-label="${hhmm(new Date(x.t))}, ${x.vol ? `helemaal bezet: ${esc(overlapZin(x.botst).replace(/^Overlap met /, ''))}` : x.botst.length ? esc(overlapZin(x.botst).toLowerCase()) : 'vrij'}">${hhmm(new Date(x.t))}</button>`).join('')}</div>` : ''}</div>`;
      }
      html += `</div>${waarschuwing ? `<p class="insttoelichting fout">${esc(cap(waarschuwing.waarschuwing))}. Klopt de datum?</p>` : ''}</section>`;
    }
    if (gelezen.zonderDag.length) html += `<p class="insttoelichting fout">Zonder dag, dus overgeslagen: ${gelezen.zonderDag.map((x) => `"${esc(x)}"`).join(', ')}</p>`;
    uit.innerHTML = html;
    for (const t of [...gekozen.keys()]) if (!bestaand.has(t)) gekozen.delete(t); // past niet meer (andere duur of tekst)
    tekenSamen();
  };
  // Het veld groeit mee met de tekst (tot een grens; daarna scrolt het)
  const groei = () => { if (veld.classList.contains('ingeklapt')) return; veld.style.height = 'auto'; veld.style.height = `${Math.min(Math.max(veld.scrollHeight, 120), 320)}px`; };
  // Na het plakken: het veld klapt in tot drie regels, zodat de gevonden tijden meteen in beeld staan
  const klap = (in_) => {
    veld.classList.toggle('ingeklapt', in_);
    $('#mtoon', el).hidden = !in_;
    if (in_) veld.style.height = ''; else groei();
  };
  let geplakt = false;
  const lees = () => {
    groei();
    MAILTEKST = veld.value;
    gelezen = leesMailTijden(veld.value);
    if (!duurZelf) duur = gelezen.duur || 60;
    tekenDuur();
    teken();
    if (geplakt && gelezen.opties.length) klap(true);
    geplakt = false;
  };
  veld.addEventListener('input', (ev) => {
    if (ev.inputType === 'insertFromPaste' || ev.inputType === 'insertReplacementText' || veld.value.length - MAILTEKST.length > 20) geplakt = true;
    groei(); clearTimeout(wacht); wacht = setTimeout(lees, 200);
  });
  veld.addEventListener('focus', () => { if (veld.classList.contains('ingeklapt')) klap(false); }); // zelf in de tekst tikken: alles tonen
  el.addEventListener('click', async (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    if (t.closest('#mtoon')) { klap(false); return; }
    const stap = t.closest('[data-stap]');
    if (stap) { duur = Math.max(15, Math.min(8 * 60, duur + Number(stap.dataset.stap))); duurZelf = true; tekenDuur(); teken(); return; }
    const c = t.closest('[data-t]');
    if (c) {
      const tijd = Number(c.dataset.t);
      if (gekozen.has(tijd)) gekozen.delete(tijd); else gekozen.set(tijd, tijdInfo.get(tijd) || { blok: null, botst: [] });
      c.classList.toggle('aan', gekozen.has(tijd));
      c.setAttribute('aria-pressed', String(gekozen.has(tijd)));
      tekenSamen();
      teken(); // de gekozen tijd ook in het tijdlijntje
      return;
    }
    if (t.closest('#mkopieer') && gekozen.size) {
      const { tekst } = mtAntwoord(gekozen.keys(), duur);
      try {
        // Alleen platte tekst: in je mail neemt hij het lettertype en de kleur van de mail aan
        await navigator.clipboard.writeText(tekst);
        toonStatus('Antwoord gekopieerd.', { soort: 'klaar', duur: 2000 });
      }
      catch (e) { toonStatus('Kopiëren lukte niet. Selecteer de tekst boven de knop.', { soort: 'fout', duur: 3500 }); }
      return;
    }
    if (t.closest('#minplannen') && gekozen.size === 1) {
      const [[tijd, g]] = [...gekozen];
      const locatie = gelezen.online ? 'Microsoft Teams' : '';
      p.sluit();
      // In een vrij blok: Nieuwe afspraak binnen dat blok. Overlapt de tijd: gewoon die dag en tijd, met de overlap erbij.
      setTimeout(() => (g.blok ? openNieuw({ blok: { start: g.blok[0], end: g.blok[1] }, start: tijd, duur, locatie }) : openNieuw({ dag: new Date(tijd), start: tijd, duur, locatie })), 250);
    }
  });
  tekenDuur();
  if (veld.value.trim()) { geplakt = true; lees(); } else tekenSamen(); // eerder geplakte tekst: meteen ingeklapt
  if (!isDesktop() || !veld.value) setTimeout(() => { if (!veld.value) veld.focus(); }, 350);
}
