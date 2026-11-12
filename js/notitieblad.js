// Agenda, notitie bewerken
// Een notitie openen en bewerken: als eigen scherm (iPhone), als venster, of rechts naast de lijst in de tab
// Notities (iPad en Mac). Titel, labels, actiepunten met deadline en de tekst; de app bewaart tijdens het typen.
// Gewoon script (geen module): het gebruikt NOTITIES en de hulpjes uit js/notities.js, openPaneel, esc en de iconen.
'use strict';

/* ------------------------------------------------------------------ */
/*  Notitie bewerken                                                   */
/* ------------------------------------------------------------------ */

// e: de afspraak (bij een nieuwe notitie bij een afspraak). klaar: wordt aangeroepen als het scherm dichtgaat.
// doel: op iPad en Mac staat de notitie in de tab Notities naast de lijst, in dit vak, zonder paneel.
// bijWijziging: wordt aangeroepen bij elke wijziging, zodat de lijst ernaast meeloopt.
async function openNotitie({ notitie = null, e = null, klaar = null, doel = null, bijWijziging = null } = {}) {
  if (!notitiesKlaar) await laadNotities(); // al geladen: meteen opbouwen, zodat je het veld binnen de tik kunt kiezen
  const n = notitie || (e && notitieBij(e.id)) || maakNotitie(e);

  // Drie vormen: in de tab Notities op iPad en Mac rechts naast de lijst (doel), op iPad en Mac verder als venster,
  // en op de iPhone als eigen scherm dat van rechts inschuift (zoals Notities van iOS): omlaag vegen sluit dan niets.
  const pagina = !doel && !isDesktop();
  const el = doel || document.createElement('div');
  if (!doel) {
    el.className = pagina ? 'notpagina notitie' : 'paneel detail nieuw notitie dialoog';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Notitie');
  }
  const meta = notitieDatum(n);
  // De titel groot bovenaan: van de afspraak, of bij een losse notitie de eerste regel, die je daar ook typt.
  // Labels en actiepunten verschijnen pas als er iets in staat; tot die tijd staan er alleen twee knopjes.
  // Labels en actiepunten typ je in de notitie zelf (#label, ! actiepunt); hun regels verschijnen pas als ze er zijn
  const labelHtml = '<div class="tags" id="notlabels"></div>';
  const titelHtml = n.afspraak
    ? `<h2 class="dtitel">${esc(n.afspraak.titel || 'Zonder titel')}</h2>`
    : '<input id="nottitel" class="dtitel nottitel" placeholder="Titel" aria-label="Titel" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">';
  const blad = `<div class="notblad">
      ${doel ? `<div class="notbovenbalk"><span></span><div class="notmeta num">${meta}</div><div id="notvoet"></div></div>` : `<div class="notmeta num">${meta}</div>`}
      ${titelHtml}
      <div class="notsectie" id="notlabelsectie">${labelHtml}</div>
      <div class="notsectie" id="notpuntsectie"><div class="punten" id="notpunten"></div></div>
      <textarea id="nottekst" placeholder="Notitie, #label of ! actiepunt" aria-label="Notitie"></textarea>
    </div>`;
  const menuKnop = (klasse) => `<button class="rond ${klasse}" data-actie="notmenu" aria-label="Meer" aria-haspopup="menu">${I.meer}</button>`;
  if (doel) el.innerHTML = blad;
  else if (pagina) el.innerHTML = `<div class="notpaginabalk"><button type="button" class="rond glas terugknop" data-actie="sluit" aria-label="Terug">${I.terug}</button>${menuKnop('glas')}</div>${blad}`;
  else el.innerHTML = `<div class="detailgreep"><div class="greep"></div><div class="detailnav">${menuKnop('glas')}<button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">${blad}</div>`;
  const tekst = $('#nottekst', el), titelVeld = $('#nottitel', el);
  if (titelVeld) {
    const i = n.tekst.indexOf('\n');
    titelVeld.value = i < 0 ? n.tekst : n.tekst.slice(0, i);
    tekst.value = i < 0 ? '' : n.tekst.slice(i + 1);
  } else tekst.value = n.tekst;

  // Labels als tags: typ een woord en een spatie (of Enter), dan wordt het een tag in kleine letters.
  // Een tik op een tag kiest hem (met een kruisje), nog een tik haalt hem weg; Backspace in een leeg veld ook.
  let gekozenTag = -1;
  const tekenLabels = () => {
    $('#notlabelsectie', el).hidden = !n.labels.length;
    $('#notlabels', el).innerHTML = n.labels.map((l, i) => (i === gekozenTag
      ? `<button type="button" class="tag aan" data-tag="${i}" aria-label="${esc(toonLabel(l))} weghalen">${esc(toonLabel(l))}${I.kruis}</button>`
      : `<button type="button" class="tag" data-tag="${i}">${esc(toonLabel(l))}</button>`)).join('');
    // Verwijderen: overal onder de knop met drie puntjes, op iPad en Mac rechts naast de datum
    if (doel) $('#notvoet', el).innerHTML = NOTITIES.includes(n) ? `<button class="notweg" data-actie="notmenu" aria-label="Meer" aria-haspopup="menu">${I.meer}</button>` : '';
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

  // Een gekozen tag haal je ook weg met Backspace (op de Mac)
  el.addEventListener('keydown', (ev) => {
    if (gekozenTag >= 0 && (ev.key === 'Backspace' || ev.key === 'Delete') && ev.target.closest('[data-tag]')) { ev.preventDefault(); haalWeg(gekozenTag); }
  });

  // Meteen bewaren tijdens het typen; het tekstvak vult de ruimte van het scherm
  const bijTypen = () => {
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { tekst: schermTekst(el) });
    if (was !== NOTITIES.includes(n)) tekenLabels(); // de knop Verwijderen verschijnt of verdwijnt
    if (bijWijziging) bijWijziging();
  };
  // Een woord met een hekje in de tekst (of in een actiepunt) wordt een label, net als ! voor een actiepunt: na een
  // spatie, komma of Enter verdwijnt #woord uit de tekst en staat het bij de labels. Alleen als het met een letter
  // begint, zodat bijvoorbeeld 'melding #123' gewoon tekst blijft.
  const HEKJE = /(^|\s)#(\p{L}[\p{L}\p{N}_-]*)([\s,])$/u;
  const hekjeNaarLabel = (veld) => {
    const pos = veld.selectionStart, voor = veld.value.slice(0, pos), m = voor.match(HEKJE);
    if (!m) return;
    const ervoor = voor.slice(0, pos - m[0].length + m[1].length) + (m[3] === '\n' ? '\n' : '');
    veld.value = ervoor + veld.value.slice(pos);
    veld.setSelectionRange(ervoor.length, ervoor.length);
    voegTag(m[2]);
  };
  // Het tekstveld groeit mee met de tekst, zodat alleen het scherm scrolt en niet ook het veld zelf
  const scroller = () => { for (let p = tekst.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p; return document.scrollingElement; };
  const groei = () => {
    const sc = scroller(), top = sc.scrollTop;
    tekst.style.minHeight = '';
    tekst.style.minHeight = `${tekst.scrollHeight + tekst.offsetHeight - tekst.clientHeight}px`; // met de streep erboven
    sc.scrollTop = top;
  };
  tekst.addEventListener('input', () => { hekjeNaarLabel(tekst); groei(); caretInBeeld(tekst); bijTypen(); });
  requestAnimationFrame(groei);
  if (typeof ResizeObserver === 'function') { let breedte = 0; new ResizeObserver(() => { if (tekst.clientWidth !== breedte) { breedte = tekst.clientWidth; groei(); } }).observe(tekst); }

  // Actiepunten: een rondje om af te vinken, de tekst, en een deadline. Enter maakt een nieuw punt eronder;
  // Backspace in een leeg punt haalt het weg. Een regel in de tekst die begint met ! wordt bij Enter een actiepunt;
  // een deadline aan het eind ("eind maart", "vrijdag", "12-3") wordt de deadline van het punt.
  const puntenEl = $('#notpunten', el);
  const tekenPunten = (focusId = null) => {
    puntenEl.innerHTML = punten(n).map((p) => `<div class="punt${p.klaar ? ' klaar' : ''}" data-punt="${p.id}">
        <button type="button" class="puntvink" data-actie="vink" aria-label="${p.klaar ? 'Niet afgevinkt maken' : 'Afvinken'}" aria-pressed="${p.klaar}">${I.vink}</button>
        <input class="punttekst" value="${esc(p.tekst)}" placeholder="Actiepunt" aria-label="Actiepunt" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">
        <span class="puntdatumvak"><button type="button" class="puntdatum${p.deadline ? ' aan' : ''}${!p.klaar && teLaat(p.deadline) ? ' laat' : ''}" data-actie="deadline" aria-label="${p.deadline ? `Deadline ${deadlineTekst(p.deadline)}` : 'Deadline'}">${p.deadline ? esc(deadlineTekst(p.deadline)) : I.kalender}</button><input type="date" class="puntkiezer" data-deadline="${p.deadline || ''}" tabindex="-1" aria-label="Deadline"></span>
        <button type="button" class="puntweg" data-actie="punt-weg" aria-label="Actiepunt weghalen">${I.kruis}</button>
      </div>`).join('');
    $('#notpuntsectie', el).hidden = !punten(n).length;
    // De deadline als waarde, niet als beginwaarde: Herstel in de datumkiezer van iOS gaat terug naar de beginwaarde,
    // en die is dan leeg. Zo haalt Herstel de deadline weg.
    puntenEl.querySelectorAll('.puntkiezer').forEach((k) => { k.value = k.dataset.deadline; });
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
  const voegPunt = (tekstPunt = '', na = null, deadline = null) => {
    const p = { ...maakPunt(tekstPunt), deadline }, lijst = [...punten(n)];
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
    hekjeNaarLabel(ev.target);
    p.tekst = ev.target.value;
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { punten: punten(n) });
    if (doel) el.dataset.punten = JSON.stringify(punten(n));
    if (was !== NOTITIES.includes(n)) tekenLabels();
    if (bijWijziging) bijWijziging();
  });
  // De deadline bijwerken zonder de actiepunten opnieuw te tekenen: iOS kiest bij het openen van een lege datumkiezer
  // meteen vandaag, en opnieuw tekenen zou de kiezer dan direct weer sluiten. Nu blijft hij open en kies je verder.
  const zetDeadline = (k) => {
    const p = puntVan(k), d = k.value || null;
    if (!p || p.deadline === d) return;
    const was = NOTITIES.includes(n);
    wijzigNotitie(n, { punten: punten(n).map((x) => (x === p ? { ...x, deadline: d } : x)) });
    if (doel) el.dataset.punten = JSON.stringify(punten(n));
    const knop = k.parentElement.querySelector('.puntdatum');
    knop.className = `puntdatum${d ? ' aan' : ''}${!p.klaar && teLaat(d) ? ' laat' : ''}`;
    knop.setAttribute('aria-label', d ? `Deadline ${deadlineTekst(d)}` : 'Deadline');
    knop.innerHTML = d ? esc(deadlineTekst(d)) : I.kalender;
    k.dataset.deadline = d || '';
    if (was !== NOTITIES.includes(n)) tekenLabels();
    if (bijWijziging) bijWijziging();
  };
  puntenEl.addEventListener('change', (ev) => { if (ev.target.classList.contains('puntkiezer')) zetDeadline(ev.target); });
  // Herstel in iOS geeft soms alleen een input-gebeurtenis; een lege waarde verwerken we daarom meteen
  puntenEl.addEventListener('input', (ev) => { if (ev.target.classList.contains('puntkiezer') && !ev.target.value) zetDeadline(ev.target); });
  puntenEl.addEventListener('keydown', (ev) => {
    const p = ev.target.classList.contains('punttekst') && puntVan(ev.target);
    if (!p || ev.isComposing) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (!p.tekst.trim()) { tekst.focus(); return; }
      // Een deadline aan het eind ("eind maart") wordt de deadline van het punt
      const dl = !p.deadline && leesDeadline(p.tekst);
      if (dl) Object.assign(p, dl);
      voegPunt('', p.id);
    }
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
    [...m[1].matchAll(/(?:^|\s)#(\p{L}[\p{L}\p{N}_-]*)/gu)].forEach((x) => voegTag(x[1])); // labels in het punt
    const schoon = m[1].replace(/(^|\s)#\p{L}[\p{L}\p{N}_-]*/gu, '$1').replace(/\s+/g, ' ').trim();
    const dl = leesDeadline(schoon); // "! Offerte sturen eind volgende week": de deadline gaat in het datumveld
    voegPunt(dl ? dl.tekst : schoon, null, dl ? dl.deadline : null);
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
  const naSluiten = () => { bewaarNotities({ meteen: true }); tekenNotities(); if (klaar) klaar(); };
  const p = doel ? null : pagina ? openPagina(el, naSluiten) : openPaneel(el, { greepSelector: '.detailgreep', naSluiten });
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]') && p) { p.sluit(); return; }
    if (t.closest('[data-actie="verwijder"]')) { verwijder(); return; }
    const menuKnop = t.closest('[data-actie="notmenu"]');
    if (menuKnop) { openNotitiemenu(menuKnop, verwijder); return; }
    const pa = t.closest('#notpunten [data-actie]');
    if (pa) {
      const p = puntVan(pa);
      if (pa.dataset.actie === 'vink' && p) zetPunten(punten(n).map((x) => (x === p ? { ...x, klaar: !x.klaar } : x)));
      else if (pa.dataset.actie === 'punt-weg' && p) zetPunten(punten(n).filter((x) => x !== p));
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
      else { gekozenTag = i; tekenLabels(); el.querySelector(`[data-tag="${i}"]`)?.focus({ preventScroll: true }); }
      return;
    }
    if (gekozenTag >= 0) { gekozenTag = -1; tekenLabels(); } // ergens anders tikken: de tag is niet meer gekozen
  });
  const eerst = titelVeld || tekst;
  if (!n.tekst && pagina) setTimeout(() => eerst.focus(), 350);
  else if (!n.tekst) eerst.focus();
}

// De cursor in het tekstveld in beeld houden. Het veld groeit mee met de tekst, dus het scherm eromheen moet scrollen;
// iOS doet dat niet altijd zelf, bijvoorbeeld als het toetsenbord net opengaat. De hoogte van de cursor meten we met
// een onzichtbare kopie van het veld.
function caretInBeeld(t) {
  if (!t || document.activeElement !== t) return;
  let sc = t.parentElement;
  while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
  if (!sc) return;
  const cs = getComputedStyle(t), kopie = document.createElement('div');
  ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'boxSizing', 'textIndent', 'tabSize']
    .forEach((k) => { kopie.style[k] = cs[k]; });
  Object.assign(kopie.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', width: `${t.offsetWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
  kopie.textContent = t.value.slice(0, t.selectionEnd);
  const merk = document.createElement('span');
  merk.textContent = '\u200b';
  kopie.append(merk);
  document.body.append(kopie);
  const y = merk.offsetTop, h = merk.offsetHeight || parseFloat(cs.lineHeight) || 24;
  kopie.remove();
  const boven = t.getBoundingClientRect().top - sc.getBoundingClientRect().top + y; // ten opzichte van het zichtbare deel
  const ruimte = 24;
  if (boven + h + ruimte > sc.clientHeight) sc.scrollTop += boven + h + ruimte - sc.clientHeight;
  else if (boven < ruimte) sc.scrollTop += boven - ruimte;
}

// iPhone: een notitie als eigen scherm dat van rechts inschuift. Terug met de knop, Escape, of vanaf de linkerrand
// naar rechts vegen. Omlaag vegen doet niets: zo kun je vrij scrollen.
function openPagina(el, naSluiten) {
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  let dicht = false;
  // Het scherm eronder verbergen zodra de notitie er staat: anders schemert het door het toetsenbord van iOS heen.
  // Bij het terugvegen en sluiten komt het weer tevoorschijn.
  const verberg = (aan) => document.documentElement.classList.toggle('paginaopen', aan);
  setTimeout(() => { if (!dicht) verberg(true); }, 320);
  const bovenste = () => { const l = document.querySelectorAll('.notpagina'); return l[l.length - 1] === el; };
  const toets = (ev) => { if (ev.key === 'Escape' && !KEUZEMENU && bovenste()) { ev.stopPropagation(); ev.preventDefault(); sluit(); } };
  window.addEventListener('keydown', toets, true);
  const sluit = () => {
    if (dicht) return;
    dicht = true;
    window.removeEventListener('keydown', toets, true);
    el.style.transform = '';
    el.classList.remove('open');
    if (!document.querySelector('.notpagina.open')) verberg(false);
    setTimeout(() => el.remove(), 320);
    document.body.style.overflow = panelen.length ? 'hidden' : '';
    naSluiten();
  };
  // Vanaf de linkerrand vegen
  let x0 = null, dx = 0;
  el.addEventListener('touchstart', (ev) => { const t = ev.touches[0]; x0 = t.clientX < 28 ? t.clientX : null; dx = 0; if (x0 !== null) verberg(false); }, { passive: true });
  el.addEventListener('touchmove', (ev) => {
    if (x0 === null) return;
    dx = Math.max(0, ev.touches[0].clientX - x0);
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (x0 === null) return;
    el.style.transition = '';
    if (dx > 90) sluit(); else { el.style.transform = ''; verberg(true); }
    x0 = null;
  });
  return { sluit };
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
