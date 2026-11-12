// Agenda, menu's
// Het keuzemenu onder de plusknop en het weergavemenu in de kop.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

/* ------------------------------------------------------------------ */
/*  Keuzemenu onder de plusknop: nieuwe afspraak, tijden uit een mail of een notitie */
/* ------------------------------------------------------------------ */

// Op telefoon en tablet klapt het menu boven de plusknop open (zoals een zwevende knop); op de desktop onder Nieuw.
let KEUZEMENU = null;
function sluitKeuzemenu() {
  if (!KEUZEMENU) return;
  const { laag, menu, knop } = KEUZEMENU;
  KEUZEMENU = null;
  knop.classList.remove('open');
  knop.setAttribute('aria-expanded', 'false');
  $('#tabbalk').classList.remove('menuopen');
  menu.classList.remove('open'); laag.classList.remove('open');
  setTimeout(() => { menu.remove(); laag.remove(); }, 200);
}
function wisselKeuzemenu(knop) {
  if (KEUZEMENU) { sluitKeuzemenu(); return; }
  const fab = knop.classList.contains('plusknop');
  const laag = document.createElement('div');
  laag.className = `keuzelaag${fab ? ' fab' : ''}`;
  const menu = document.createElement('div');
  menu.className = `keuzemenu${fab ? ' fab' : ''}`;
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `<button role="menuitem" data-keuze="notitie">${I.notitie}<span>Notitie</span></button>
    <button role="menuitem" data-keuze="mail">${I.mail}<span>Tijden uit een mail</span></button>
    <button role="menuitem" data-keuze="nieuw">${I.kalender}<span>Nieuwe afspraak</span></button>`;
  const notitieKeuze = menu.querySelector('[data-keuze="notitie"]');
  if (!fab) { // onder Nieuw: nieuwe afspraak bovenaan, notitie onderaan
    menu.insertBefore(menu.lastElementChild, menu.firstElementChild);
    menu.append(notitieKeuze);
  }
  // In de tab Notities: Notitie het dichtst bij de duim, of op de desktop bovenaan
  if (ST.tab === 'notities') { if (fab) menu.append(notitieKeuze); else menu.prepend(notitieKeuze); }
  document.body.append(laag, menu);
  const r = knop.getBoundingClientRect();
  if (fab) { menu.style.right = `${Math.max(8, innerWidth - r.right)}px`; menu.style.bottom = `${innerHeight - r.top + 12}px`; }
  else { menu.style.right = `${Math.max(8, innerWidth - r.right)}px`; menu.style.top = `${r.bottom + 8}px`; }
  KEUZEMENU = { laag, menu, knop };
  knop.classList.add('open');
  knop.setAttribute('aria-expanded', 'true');
  if (fab) $('#tabbalk').classList.add('menuopen');
  requestAnimationFrame(() => { menu.classList.add('open'); laag.classList.add('open'); });
  if (!fab || !IOS) menu.querySelector('button').focus({ preventScroll: true });
  laag.addEventListener('click', sluitKeuzemenu);
  menu.addEventListener('click', (ev) => {
    const k = ev.target.closest('[data-keuze]');
    if (!k) return;
    sluitKeuzemenu();
    if (k.dataset.keuze === 'nieuw') openNieuw(); else if (k.dataset.keuze === 'notitie') nieuweNotitie(); else openMailTijden();
  });
  menu.addEventListener('keydown', (ev) => {
    const knoppen = [...menu.querySelectorAll('button')];
    const i = knoppen.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); sluitKeuzemenu(); knop.focus(); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); knoppen[(i + (ev.key === 'ArrowDown' ? 1 : -1) + knoppen.length) % knoppen.length].focus(); }
  });
}

/* ------------------------------------------------------------------ */
/*  Weergavemenu in de kop: Week of Vooruitblik                        */
/* ------------------------------------------------------------------ */

// Zoals in Outlook: het knopje toont de huidige weergave, het menu klapt eronder open met een vinkje bij de keuze
function wisselWeergavemenu(knop) {
  if (KEUZEMENU) { sluitKeuzemenu(); return; }
  const laag = document.createElement('div');
  laag.className = 'keuzelaag';
  const menu = document.createElement('div');
  menu.className = 'keuzemenu weergavemenu';
  menu.setAttribute('role', 'menu');
  const item = (t, icoon, tekst) => `<button role="menuitemradio" aria-checked="${ST.tab === t}" data-weergave="${t}"><span class="wvink">${ST.tab === t ? I.vink : ''}</span>${icoon}<span>${tekst}</span></button>`;
  menu.innerHTML = item('week', I.week, 'Week') + item('forecast', I.vooruit, 'Vooruitblik');
  document.body.append(laag, menu);
  const r = knop.getBoundingClientRect();
  menu.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  menu.style.top = `${r.bottom + 8}px`;
  KEUZEMENU = { laag, menu, knop };
  knop.classList.add('open');
  knop.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => { menu.classList.add('open'); laag.classList.add('open'); });
  if (!IOS) menu.querySelector('[aria-checked="true"]').focus({ preventScroll: true });
  laag.addEventListener('click', sluitKeuzemenu);
  menu.addEventListener('click', (ev) => {
    const k = ev.target.closest('[data-weergave]');
    if (!k) return;
    sluitKeuzemenu();
    kiesTab(k.dataset.weergave);
  });
  menu.addEventListener('keydown', (ev) => {
    const knoppen = [...menu.querySelectorAll('button')];
    const i = knoppen.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); sluitKeuzemenu(); knop.focus(); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); knoppen[(i + (ev.key === 'ArrowDown' ? 1 : -1) + knoppen.length) % knoppen.length].focus(); }
  });
}
