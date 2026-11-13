// Agenda, panelen
// De basis voor alles wat over de app heen komt: een paneel openen, sluiten en omlaag vegen. De panelen zelf staan in
// js/weekkiezer.js, js/detail.js, js/nieuw.js, js/instellingen.js, js/mailpaneel.js en js/menus.js.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

// De greep bovenaan een paneel (om het omlaag te vegen), met rechts de sluitknop. knoppen: wat daar nog voor staat.
function paneelGreepHtml(knoppen = '') {
  return `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav">${knoppen}<button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>`;
}

/* ------------------------------------------------------------------ */
/*  Panelen: openen, sluiten en omlaag vegen                           */
/* ------------------------------------------------------------------ */

const panelen = [];
// Nieuwe gegevens terwijl er een scherm open is (bijvoorbeeld Instellingen > Nu bijwerken): dan tekenen we de agenda
// zodra het laatste scherm dicht is, anders zie je bij terugkomst nog de oude afspraken
let tekenNaSluiten = false;
function tekenNaBijwerken() {
  if (panelen.length) tekenNaSluiten = true;
  else behoudDag(render);
}
// magSluiten: voor een paneel met invoer. Het wordt gevraagd bij elke manier van sluiten (knop, Escape, vegen, een tik
// ernaast); geeft het false terug, dan blijft het paneel open.
function openPaneel(el, { greepSelector, boven = false, naSluiten = null, magSluiten = null } = {}) {
  const achter = document.createElement('div');
  achter.className = 'achtergrond' + (boven ? ' boven' : '');
  const lagen = $('#lagen');
  lagen.append(achter, el);
  const p = { el, achter, sluit: null };
  const dicht = () => {
    el.classList.remove('open');
    achter.classList.remove('open');
    const weg = () => { el.remove(); achter.remove(); };
    setTimeout(weg, 340);
    const i = panelen.indexOf(p);
    if (i < 0) return; // al dicht
    panelen.splice(i, 1);
    if (!panelen.length) {
      document.body.style.overflow = '';
      if (tekenNaSluiten) { tekenNaSluiten = false; behoudDag(render); }
    }
    if (naSluiten) naSluiten();
  };
  p.sluit = () => { if (magSluiten && panelen.includes(p) && !magSluiten()) return; dicht(); };
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
