// Agenda, notities in de agenda
// De open actiepunten bij een dag in de agenda (en het overzicht van die dag), en de notitie in het
// detailscherm van een afspraak.
// Gewoon script (geen module): het gebruikt NOTITIES en de hulpjes uit js/notities.js, openPaneel, esc en de iconen.
'use strict';

/* ------------------------------------------------------------------ */
/*  Actiepunten in de agenda                                           */
/* ------------------------------------------------------------------ */

// De open actiepunten met hun deadline op deze dag. Vandaag ook wat te laat is; voorbije dagen niets (dat staat
// dan bij vandaag).
function agendaPunten(d) {
  const t = vandaag();
  if (startOfDay(d) < t) return [];
  const dag = ymd(d), isVandaag = sameDay(d, t);
  const uit = [];
  levendeNotities().forEach((n) => openPunten(n).forEach((p) => {
    if (!p.deadline) return;
    if (p.deadline === dag) uit.push({ n, p, laat: false });
    else if (isVandaag && teLaat(p.deadline)) uit.push({ n, p, laat: true });
  }));
  return uit.sort((a, b) => Number(b.laat) - Number(a.laat) || String(a.p.deadline).localeCompare(String(b.p.deadline)) || a.n.gemaakt - b.n.gemaakt);
}
// De punten van een dag per notitie, in de volgorde van de lijst (wat te laat is eerst)
function puntGroepen(lijst) {
  const m = new Map();
  lijst.forEach((x) => { if (!m.has(x.n.id)) m.set(x.n.id, { n: x.n, items: [] }); m.get(x.n.id).items.push(x); });
  return [...m.values()];
}
// Een los actiepunt: een notitie met alleen dat punt, die naar het punt heet. Dan is de tekst zelf de beste naam.
const losPunt = (g) => g.items.length === 1 && notitieKop(g.n)[0] === g.items[0].p.tekst.trim();

// Eén blok met de actiepunten van de dag, als eerste in de dag: één regel per notitie ('3 acties n.a.v. Overleg pilot'),
// een los actiepunt met zijn eigen tekst; hooguit drie regels, daarna '+ 2'. Voorop het pictogram van Actiepunten, geen
// rondje: een rondje belooft dat je kunt afvinken, en deze regel staat voor meer punten. Wat je precies moet doen, staat in het
// overzicht van die dag; een tik opent dat. In de agenda zelf zijn de rondjes te klein om precies te tikken.
const AGENDA_MAX = 3;
function puntenBlokHtml(d) {
  const lijst = agendaPunten(d);
  if (!lijst.length) return '';
  const groepen = puntGroepen(lijst);
  const items = groepen.slice(0, AGENDA_MAX).map((g) => {
    const laat = g.items.find((x) => x.laat);
    const k = g.items.length;
    const tekst = losPunt(g) ? g.items[0].p.tekst.trim() : `${k === 1 ? '1 actie' : `${k} acties`} n.a.v. ${notitieKop(g.n)[0]}`;
    return `<span class="agpunt${laat ? ' laat' : ''}"><span class="agvink">${I.actiepunt}</span>
      <span class="agtekst">${esc(tekst)}</span>${laat ? `<span class="aglaat">${esc(deadlineTekst(laat.p.deadline))}</span>` : ''}</span>`; // te laat: los erachter, zodat afkappen het niet wegneemt
  }).join('') + (groepen.length > AGENDA_MAX ? `<span class="agmeer">+ ${groepen.length - AGENDA_MAX}</span>` : '');
  const label = `${lijst.length === 1 ? '1 actiepunt' : `${lijst.length} actiepunten`}${sameDay(d, vandaag()) ? ' vandaag' : ''}`;
  return `<button class="vbpunten" data-agdag="${ymd(d)}" aria-label="${label}"><span class="agpunten">${items}</span></button>`;
}
// Het overzicht van één dag: grote rondjes om af te vinken, de deadline als die voorbij is, en de notitie of het
// overleg waar het punt bij hoort. Een tik op de tekst opent de notitie.
function openDagPunten(d) {
  const el = document.createElement('div');
  el.className = 'paneel detail nieuw dagpunten' + (isDesktop() ? ' dialoog' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Actiepunten');
  const datum = cap(`${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`);
  let gedaan = new Set();
  const teken = () => {
    const rij = ({ n, p, laat }) => `<div class="punt dagpunt${laat ? ' laat' : ''}">
        <button type="button" class="puntvink" data-dagvink="${n.id}|${p.id}" aria-label="${esc(p.tekst.trim())} afvinken">${I.vink}</button>
        <button type="button" class="dagtekst" data-dagnotitie="${n.id}"><span class="t1">${esc(p.tekst.trim())}</span>${laat ? `<span class="t2"><span class="tddatum laat">${esc(deadlineTekst(p.deadline))}</span></span>` : ''}</button>
      </div>`;
    // Per notitie een kaart met de naam bovenaan; losse actiepunten samen in één kaart zonder naam
    const delen = [];
    puntGroepen(agendaPunten(d)).forEach((g) => {
      if (losPunt(g) && delen.length && !delen[delen.length - 1].n) { delen[delen.length - 1].items.push(...g.items); return; }
      delen.push({ n: losPunt(g) ? null : g.n, items: [...g.items] });
    });
    const kop = (n) => {
      const a = n.afspraak && n.afspraak.start ? new Date(n.afspraak.start) : null;
      return `<button type="button" class="dagbron" data-dagnotitie="${n.id}">${esc(notitieKop(n)[0])}${a ? `<span class="dagbrondatum"> · ${a.getDate()} ${MONTHS_SHORT[a.getMonth()]}</span>` : ''}</button>`;
    };
    // Eén kaart per notitie: bovenaan de naam van de notitie, de acties eronder
    $('.dagdelen', el).innerHTML = delen.map((x) => `<div class="formkaart puntenkaart">${x.n ? kop(x.n) : ''}${x.items.map(rij).join('')}</div>`).join('')
      || '<div class="formkaart puntenkaart"><p class="nleeg dagleeg">Alles afgevinkt</p></div>';
  };
  el.innerHTML = `${paneelGreepHtml()}
    <div class="detailinhoud">
      <div class="dkop"><div class="dkopinhoud"><h2 class="dtitel">Actiepunten</h2><div class="dmeta"><div>${datum}</div></div></div></div>
      <div class="dagdelen"></div>
    </div>`;
  teken();
  const p = openPaneel(el, { greepSelector: '.detailgreep', naSluiten: () => behoudDag(render) });
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    const v = ev.target.closest('[data-dagvink]');
    if (v) {
      const [nid, pid] = v.dataset.dagvink.split('|');
      const n = NOTITIES.find((x) => x.id === nid);
      if (!n) return;
      // Eerst het vinkje laten zien, dan pas uit de lijst
      v.closest('.punt').classList.add('klaar');
      wijzigNotitie(n, { punten: punten(n).map((x) => (x.id === pid ? { ...x, klaar: true } : x)) });
      setTimeout(teken, 450);
      return;
    }
    const o = ev.target.closest('[data-dagnotitie]');
    if (o) {
      const n = NOTITIES.find((x) => x.id === o.dataset.dagnotitie);
      if (n && isDesktop()) { p.sluit(); toonInNotities({ notitie: n }); } else if (n) openNotitie({ notitie: n, klaar: teken });
    }
  });
}
// Vóór de algemene klikken in de agenda (capture): het blok opent het overzicht van de dag
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('#inhoud [data-agdag]');
  if (!b) return;
  ev.stopPropagation();
  openDagPunten(deadlineDag(b.dataset.agdag));
}, true);

/* ------------------------------------------------------------------ */
/*  In het detailscherm van een afspraak                               */
/* ------------------------------------------------------------------ */

function notitieSectieHtml(e) {
  const n = notitieBij(e.id);
  if (!n) return ''; // toevoegen kan met het knopje bovenin
  return `<section class="sectie"><h3>Mijn notitie</h3><div class="kaart"><button class="drij notitierij" data-actie="eigennotitie">
    <span class="tekst"><div class="nkort">${esc(n.tekst.trim())}</div>${labelChips(n.labels)}</span>${I.verder}</button></div></section>`;
}
