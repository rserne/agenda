// Agenda, bediening
// Knoppen, vegen en doortrekken, navigeren, opstarten, de melding voor een nieuwe versie en de service worker.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

/* ------------------------------------------------------------------ */
/*  Bediening                                                          */
/* ------------------------------------------------------------------ */

// Telefoon, Week en Vooruitblik: onderaan de lijst verder omhoog trekken en loslaten gaat naar de volgende week,
// of naar de volgende zeven dagen, net als de pijl › (het omgekeerde van 'trek om te verversen'). De lijst schuift mee met weerstand; onderin verschijnt een pijl
// met tekst, en zodra je ver genoeg bent, kleurt de pijl blauw en staat er dat je kunt loslaten.
const TREK_DREMPEL = 70;
function koppelDoortrekken() {
  let y0 = null, trek = 0;
  const ind = $('#doortrek'), tekst = $('#doortrek .dttekst');
  const kan = () => (ST.tab === 'week' || ST.tab === 'forecast') && !isDesktop() && !panelen.length;
  const onderaan = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
  const volgende = () => {
    const s = addDays(periode().start, 7);
    return ST.tab === 'week' ? `week ${isoWeek(s)}` : rangeLong(s, addDays(s, 6));
  };
  const zet = (px) => {
    trek = px;
    $('#inhoud').style.transform = px ? `translateY(${-px}px)` : '';
    const klaar = px >= TREK_DREMPEL;
    ind.style.opacity = String(Math.min(1, px / 35));
    ind.style.transform = `translate(-50%, ${Math.round(18 * (1 - Math.min(1, px / TREK_DREMPEL)))}px)`;
    ind.classList.toggle('klaar', klaar);
    if (px) tekst.textContent = klaar ? `Loslaten voor ${volgende()}` : `Trek verder voor ${volgende()}`;
  };
  window.addEventListener('touchstart', (e) => {
    y0 = e.touches.length === 1 && kan() && onderaan() ? e.touches[0].clientY : null;
    trek = 0;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    const d = y0 - e.touches[0].clientY; // positief: vinger gaat omhoog
    if (d <= 0 || !onderaan()) {
      if (trek) zet(0); else y0 = null; // gewoon terug omlaag scrollen
      return;
    }
    e.preventDefault(); // niet het gewone verende scrollen van iOS
    $('#inhoud').classList.add('trekt');
    zet(Math.min(140, d * 0.45));
  }, { passive: false });
  const los = () => {
    if (y0 === null) return;
    y0 = null;
    const main = $('#inhoud');
    main.classList.remove('trekt');
    if (trek < TREK_DREMPEL) { zet(0); return; }
    // De lijst schuift omhoog weg, de volgende week of zeven dagen komen van onderen binnen
    const weg = main.animate([{ transform: `translateY(${-trek}px)`, opacity: 1 }, { transform: 'translateY(-160px)', opacity: 0 }], { duration: 160, easing: 'ease-in' });
    weg.onfinish = () => {
      zet(0);
      verschuif(1);
      main.animate([{ transform: 'translateY(60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
    };
  };
  window.addEventListener('touchend', los, { passive: true });
  window.addEventListener('touchcancel', los, { passive: true });
}

// Een tab kiezen. Agenda opent de weergave die je het laatst gebruikte: Week of Vooruitblik.
// Tik je op Agenda terwijl je al in de agenda bent, dan ga je naar vandaag (zoals in Outlook).
// iPad: in de agenda de maandkalender, in Notities de filters, in Instellingen niets. In de agenda standaard dicht, zodat
// de dagkolommen de breedte krijgen; bij Notities standaard open. Je keuze onthoudt de app per tab.
const zijbalkSleutel = () => (ST.tab === 'notities' ? 'ag_notfilters' : 'ag_zijbalk2');
function zetZijbalk() {
  const dicht = ST.tab === 'instellingen' || (LS.get(zijbalkSleutel()) || (ST.tab === 'notities' ? 'open' : 'dicht')) === 'dicht';
  document.body.classList.toggle('zbdicht', dicht);
  $('#zijbalkknop').setAttribute('aria-expanded', String(!dicht));
}

function kiesTab(t) {
  if (t === 'agenda' && (ST.tab === 'week' || ST.tab === 'forecast')) { verschuif(0); return; }
  if (t === 'agenda') t = LS.get('ag_weergave') || 'week';
  if (t === 'week' || t === 'forecast') LS.set('ag_weergave', t);
  if (t === ST.tab) return;
  ST.tab = t;
  LS.set('ag_tab', t);
  window.scrollTo(0, 0);
  ST.naarVandaag = true;
  laad();
}

function verschuif(n, tab) {
  if (tab) { ST.tab = tab; LS.set('ag_tab', tab); LS.set('ag_weergave', tab); }
  if (n === 0) {
    const t = vandaag();
    ST.anker = defaultWeekAnchor(t);
    ST.fcStart = t;
    zijMaand = null;
  } else if (ST.tab === 'week') ST.anker = addDays(ST.anker, 7 * n);
  else ST.fcStart = addDays(ST.fcStart, 7 * n);
  // De kalender in de zijbalk loopt mee naar de maand van de gekozen week
  if (zijMaand && firstOfMonth(addDays(gekozenMaandag(), 3)).getTime() !== zijMaand.getTime()) zijMaand = firstOfMonth(addDays(gekozenMaandag(), 3));
  window.scrollTo(0, 0);
  ST.naarVandaag = true;
  laad();
}

function koppel() {
  $('#capsule').innerHTML = capsuleHtml('Week terug', 'Week verder');
  $('#titelknop').addEventListener('click', () => { if (ST.tab !== 'notities') openWeekkiezer(); });
  $('#weergaveknop').addEventListener('click', (ev) => wisselWeergavemenu(ev.currentTarget));
  $('#tabbalk .tabtandwiel').innerHTML = I.instellingen;
  $('#icsinvoer').addEventListener('change', (ev) => { openBestand(ev.target.files[0]).catch((e) => alert('Dit bestand kan de app niet lezen. Kies een agenda-bestand (.ics) uit Outlook.')); ev.target.value = ''; });
  $('#contactinvoer').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    openContacten(f).then((n) => { if (n) { render(); renderZijbalk(); toonStatus(n === 1 ? '1 contact ingeladen.' : `${n} contacten ingeladen.`, { soort: 'klaar', duur: 2500 }); } })
      .catch(() => alert('In dit bestand vindt de app geen contacten. Kies een csv uit NK2Edit of Outlook, of een vCard (.vcf).'));
  });
  $('#datumregel').addEventListener('click', () => verschuif(0));
  // iPad: de zijbalk in- en uitklappen; de keuze blijft bewaard, per tab (zie zetZijbalk)
  zetZijbalk();
  $('#zijbalkknop').addEventListener('click', () => {
    LS.set(zijbalkSleutel(), document.body.classList.contains('zbdicht') ? 'open' : 'dicht');
    zetZijbalk();
    if (ST.tab === 'notities') tekenZoek(); // ingeklapt staan de gekozen filters als blokjes in het zoekveld
  });

  // Eén luisteraar voor alle knoppen in kop, zijbalk, tabbalk en inhoud
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#lagen, #instscherm')) return; // panelen en het scherm Instellingen regelen hun eigen knoppen
    const nav = ev.target.closest('[data-nav]');
    if (nav) { verschuif(Number(nav.dataset.nav)); return; }
    if (ev.target.closest('[data-actie="instellingen"]')) { openInstellingen(); return; }
    const actie = ev.target.closest('[data-actie^="ics-"]');
    if (actie) {
      if (actie.dataset.actie === 'ics-openen') $('#icsinvoer').click();
      else if (actie.dataset.actie === 'ics-kies') openBronPaneel();
      else if (actie.dataset.actie === 'ics-nu') nuBijwerken();
      return;
    }
    const f = ev.target.closest('[data-filter]');
    if (f) {
      if (f.dataset.filter !== ST.filter) { ST.filter = f.dataset.filter; LS.set('ag_filter', ST.filter); behoudDag(render); }
      return;
    }
    const tab = ev.target.closest('[data-tab]');
    if (tab) { kiesTab(tab.dataset.tab); return; }
    const maand = ev.target.closest('#zijbalk [data-maand]');
    if (maand) {
      const n = Number(maand.dataset.maand);
      if (n === 0) { verschuif(0, 'week'); return; }
      zijMaand = new Date(zijMaand.getFullYear(), zijMaand.getMonth() + n, 1);
      renderZijbalk();
      return;
    }
    const rij = ev.target.closest('#zijbalk .weekrij');
    if (rij) { kiesWeek(new Date(Number(rij.dataset.ma))); return; }
    const vrij = ev.target.closest('#inhoud [data-vrij]');
    if (vrij) { const [a, b] = vrij.dataset.vrij.split('-').map(Number); openNieuw({ blok: { start: a, end: b } }); return; }
    const plus = ev.target.closest('[data-nieuw]');
    if (plus) { wisselKeuzemenu(plus); return; }
    const b = ev.target.closest('#inhoud [data-id]');
    if (b && zichtbaar.has(b.dataset.id)) openDetail(zichtbaar.get(b.dataset.id));
  });

  koppelDoortrekken();

  // Agenda via een link: elke minuut kijken of het kwartier om is (alleen als de app in beeld is)
  $('#statussluit').addEventListener('click', verbergStatus);
  setInterval(() => vernieuwLink(), 60 * 1000);

  // Zelf scrollen of tikken: vandaag niet meer bovenaan vasthouden
  for (const t of ['touchstart', 'wheel', 'keydown', 'mousedown']) window.addEventListener(t, () => { ST.naarVandaag = false; }, { passive: true, capture: true });

  // Hoogte van de kop doorgeven, zodat de dagkoppen er precies onder blijven plakken
  const kop = $('#kop');
  const zetKop = () => document.documentElement.style.setProperty('--kopH', `${kop.offsetHeight}px`);
  if ('ResizeObserver' in window) new ResizeObserver(zetKop).observe(kop);
  zetKop();

  // Van telefoon- naar desktopopmaak (venster groter of kleiner): opnieuw tekenen
  DESKTOP.addEventListener('change', () => { panelen.slice().forEach((p) => p.sluit()); render(); });

  // Terug in de app: nieuwe dag? Dan terug naar vandaag. Agenda via een link: na een kwartier opnieuw kijken.
  // Vooruitblik: afgelopen afspraken van vandaag verdwijnen vanzelf, ook als de app open blijft staan
  setInterval(() => {
    if (ST.tab === 'forecast' && document.visibilityState === 'visible' && !panelen.length) render();
  }, 60 * 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = vandaag();
    if (!sameDay(t, ST.dag)) { ST.dag = t; ST.anker = defaultWeekAnchor(t); ST.fcStart = t; zijMaand = null; ST.naarVandaag = true; }
    render();
    vernieuwLink();
  });
  window.addEventListener('online', () => vernieuwLink({ ookAlsVers: true }));
}

(function start() {
  // Resten van eerdere versies opruimen: de proef met Microsoft 365 en de Nhost-koppeling
  try { Object.keys(localStorage).filter((k) => /^ag_ms|^msal\.|^ag_sessie$|^ag_data$|^ag_zijbalk$/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* geblokkeerd */ }
  const f = LS.get('ag_filter');
  if (['notable', 'all', 'free'].includes(f)) ST.filter = f;
  const t = LS.get('ag_tab');
  if (['week', 'forecast', 'notities', 'instellingen'].includes(t)) ST.tab = t;
  koppel();
  // Toetsenbord op iOS: het schuift over de pagina heen. Meet hoeveel, zodat je in een paneel tot onderaan kunt scrollen.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const meet = () => {
      const tb = Math.round(window.innerHeight - vv.height);
      const open = tb > 80;
      document.documentElement.style.setProperty('--tb', `${open ? tb : 0}px`);
      document.documentElement.classList.toggle('toetsenbord', open);
      // Het zichtbare deel van het scherm: daarop past de notitie op de iPhone zich aan, ook met het toetsenbord open
      document.documentElement.style.setProperty('--vvtop', `${Math.round(vv.offsetTop)}px`);
      document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
      // iPad: iOS schuift de pagina omhoog als het toetsenbord opent; de lijst en de notitie schuiven mee terug in beeld
      document.documentElement.style.setProperty('--vvpagina', `${open ? Math.round(vv.pageTop) : 0}px`);
    };
    vv.addEventListener('resize', meet);
    // Gaat het toetsenbord open (of verandert het van hoogte), dan de cursor in de notitie in beeld houden
    vv.addEventListener('resize', () => requestAnimationFrame(() => { if (document.activeElement?.id === 'nottekst') caretInBeeld(document.activeElement); }));
    vv.addEventListener('scroll', meet);
  }
  laadContacten().then(() => { if (CONTACTEN_INFO && isDesktop()) renderZijbalk(); });
  laadNotities().then(() => {
    if (ST.tab === 'notities') render();
    else if (levendeNotities().some((n) => openPunten(n).some((p) => p.deadline))) behoudDag(render); // actiepunten in de agenda
    synchroniseerStraks(1500);
  });
  // Een eerder geopend .ics-bestand of je agenda-link gaat voor (behalve met ?demo)
  renderKop(); // de titel en knoppen staan er meteen, ook voordat de afspraken uit de opslag komen
  Promise.all([IDB.get('ics').catch(() => null), IDB.get('icsweken').catch(() => null)]).then(async ([b, kopie]) => {
    if (b && b.tekst && !PARAMS.has('demo')) {
      if (kopie && kopie.soort === KOPIE_SOORT && kopie.weken && kopie.weken.length) startUitBewaard(b, kopie);
      else {
        $('#inhoud').innerHTML = '<div class="laden">Agenda-bestand inlezen…</div>';
        try { await gebruikBestand(b); } catch (e) { BESTAND = null; }
      }
    }
    BRON_BEKEND = true;
    // Eerst tonen wat er bewaard is, daarna de rest van de weken klaarzetten
    render();
    laad();
    // Agenda via een link: na het opstarten op de achtergrond kijken of er iets is veranderd
    if (BESTAND && BESTAND.link) setTimeout(() => vernieuwLink({ ookAlsVers: true }), 2500);
  });
})();

// Melding als er een nieuwe versie klaarstaat. We halen het begin van app.js op, zonder cache, en vergelijken
// APP_VERSIE met de versie die nu draait. Dat werkt los van de service worker: die meldt een update op de iPhone
// niet betrouwbaar, en een app op het beginscherm blijft vaak dagen in het geheugen. We kijken kort na het
// openen, bij elke terugkeer naar de app en elk half uur.
const versieDelen = (v) => String(v).split('-').map(Number);
const nieuwer = (a, b) => { const x = versieDelen(a), y = versieDelen(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
(function versieControle() {
  if (!/^https?:$/.test(location.protocol)) return;
  const melding = $('#updatemelding');
  let gemeld = false, laatst = 0;
  const toon = () => { if (gemeld) return; gemeld = true; melding.hidden = false; requestAnimationFrame(() => melding.classList.add('open')); };
  // Vernieuwen: eerst de bewaarde app-bestanden weg, dan komt alles vers van de server
  $('#vernieuwknop').addEventListener('click', async () => {
    try { const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.startsWith('agenda-')).map((k) => caches.delete(k))); } catch (e) { /* geen cache */ }
    location.reload();
  });
  $('#laterknop').addEventListener('click', () => { melding.classList.remove('open'); setTimeout(() => { melding.hidden = true; }, 250); });
  const kijk = async () => {
    if (gemeld || Date.now() - laatst < 60 * 1000) return;
    laatst = Date.now();
    try {
      const r = await fetch(`app.js?versiecheck=${Date.now()}`, { cache: 'no-store', headers: { Range: 'bytes=0-2047' } });
      if (!r.ok) return;
      const m = (await r.text()).match(/APP_VERSIE = '([^']+)'/);
      if (m && nieuwer(m[1], APP_VERSIE)) toon();
    } catch (e) { /* geen verbinding: later opnieuw */ }
  };
  setTimeout(kijk, 4000);
  setInterval(kijk, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kijk(); });
  window.addEventListener('focus', kijk);
})();

// Service worker: de app zonder verbinding kunnen openen. Bij terugkomen ook de service worker bijwerken.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
