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
// Eén blok met de actiepunten van de dag, als eerste in de dag: een rondje en de tekst, hooguit drie, daarna '+ 2'.
// soort: rij (week op de telefoon), krij (week op iPad en Mac) of tegel (Vooruitblik). Een tik opent het overzicht van
// die dag, waar je afvinkt; in de agenda zelf zijn de rondjes te klein om precies te tikken.
const AGENDA_MAX = 3;
// De actiepunten van een dag als rustige balk boven de afspraken, in Week en Vooruitblik op elk scherm
function puntenBlokHtml(d) {
  const lijst = agendaPunten(d);
  if (!lijst.length) return '';
  const items = lijst.slice(0, AGENDA_MAX).map(({ p, laat }) => `<span class="agpunt${laat ? ' laat' : ''}"><span class="agvink"></span>
      <span class="agtekst">${esc(p.tekst.trim())}</span>${laat ? `<span class="aglaat">${esc(deadlineTekst(p.deadline))}</span>` : ''}</span>`).join('') // te laat: los erachter, zodat afkappen het niet wegneemt
    + (lijst.length > AGENDA_MAX ? `<span class="agmeer">+ ${lijst.length - AGENDA_MAX}</span>` : '');
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
    const lijst = agendaPunten(d);
    const rijen = lijst.map(({ n, p, laat }) => {
      const [titel] = notitieKop(n);
      const bron = titel === p.tekst.trim() ? '' : titel;
      return `<div class="punt dagpunt${laat ? ' laat' : ''}">
        <button type="button" class="puntvink" data-dagvink="${n.id}|${p.id}" aria-label="${esc(p.tekst.trim())} afvinken">${I.vink}</button>
        <button type="button" class="dagtekst" data-dagnotitie="${n.id}"><span class="t1">${esc(p.tekst.trim())}</span>${laat || bron ? `<span class="t2">${laat ? `<span class="tddatum laat">${esc(deadlineTekst(p.deadline))}</span>` : ''}${esc(bron)}</span>` : ''}</button>
      </div>`;
    }).join('');
    $('.formkaart', el).innerHTML = rijen || '<p class="nleeg dagleeg">Alles afgevinkt</p>';
  };
  el.innerHTML = `${paneelGreepHtml()}
    <div class="detailinhoud">
      <div class="dkop"><div class="dkopinhoud"><h2 class="dtitel">Actiepunten</h2><div class="dmeta"><div>${datum}</div></div></div></div>
      <div class="formkaart puntenkaart"></div>
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
