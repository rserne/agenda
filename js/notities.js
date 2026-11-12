// Agenda, notities
// Eigen notities: bij een afspraak of los, met labels. Ze staan op het toestel in IndexedDB ('notities').
// Elke notitie draagt een eigen id, een tijdstip van wijzigen en bij verwijderen een markering (weg), zodat ze
// via de Worker tussen toestellen worden gesynchroniseerd (js/synchroniseren.js): per notitie wint de laatste wijziging.
// Dit bestand: opslag, labels, datums en deadlines. Bewerken staat in js/notitieblad.js, de actiepunten in de agenda in
// js/notitieagenda.js en de tab Notities in js/notitielijst.js.
// Gewoon script (geen module): het gebruikt openPaneel, esc en de iconen uit de andere bestanden.
'use strict';

/* ------------------------------------------------------------------ */
/*  Opslag                                                             */
/* ------------------------------------------------------------------ */

// { id, tekst, labels: [], afspraak: { id, titel, start, end } | null, gemaakt, gewijzigd, weg }
let NOTITIES = [];
let notitiesGeladen = null;
let notitiesKlaar = false;
function laadNotities() {
  if (!notitiesGeladen) {
    notitiesGeladen = IDB.get('notities')
      .then((l) => { NOTITIES = Array.isArray(l) ? l : []; })
      .catch(() => { NOTITIES = []; })
      .finally(() => { notitiesKlaar = true; });
  }
  return notitiesGeladen;
}
let _notitieTimer = null;
function bewaarNotities({ meteen = false } = {}) {
  clearTimeout(_notitieTimer);
  const doe = () => IDB.set('notities', NOTITIES).catch(() => { /* privévenster: alleen voor deze sessie */ });
  if (meteen) doe(); else _notitieTimer = setTimeout(doe, 400);
  synchroniseerStraks(); // kort daarna naar de Worker
}
const nieuwId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const levendeNotities = () => NOTITIES.filter((n) => !n.weg);
const notitieBij = (afspraakId) => levendeNotities().find((n) => n.afspraak && n.afspraak.id === afspraakId) || null;
// Actiepunten staan in de notitie zelf: { id, tekst, klaar, deadline ('jjjj-mm-dd' of null) }. Een los actiepunt is een
// notitie met alleen dat punt. Zo blijven de koppelingen met de notitie, het overleg en de labels vanzelf bewaard.
const punten = (n) => (Array.isArray(n.punten) ? n.punten : []);
const openPunten = (n) => punten(n).filter((p) => !p.klaar && p.tekst.trim());
const notitieLeeg = (n) => !n.tekst.trim() && !n.labels.length && !punten(n).some((p) => p.tekst.trim());
const maakPunt = (tekst = '') => ({ id: nieuwId(), tekst, klaar: false, deadline: null });

function maakNotitie(e = null) {
  const nu = Date.now();
  return {
    id: nieuwId(), tekst: '', labels: [], punten: [],
    afspraak: e ? { id: e.id, titel: e.title || '', start: +e.start, end: +e.end } : null,
    gemaakt: nu, gewijzigd: nu, weg: false,
  };
}
// Een nieuwe notitie komt pas in de lijst als er iets in staat; een lege notitie verdwijnt weer. Stond hij al in de
// Worker, dan wordt hij gemarkeerd als verwijderd, zodat hij ook op de andere toestellen verdwijnt.
function wijzigNotitie(n, velden) {
  Object.assign(n, velden, { gewijzigd: Date.now() });
  const i = NOTITIES.indexOf(n);
  if (notitieLeeg(n)) {
    if (i >= 0 && n.gesynct) n.weg = true;
    else if (i >= 0) NOTITIES.splice(i, 1);
  } else {
    n.weg = false;
    if (i < 0) NOTITIES.push(n);
  }
  bewaarNotities();
}
function verwijderNotitie(n) {
  // Niet echt weghalen: de markering gaat straks mee naar de andere toestellen
  Object.assign(n, { tekst: '', labels: [], punten: [], weg: true, gewijzigd: Date.now() });
  if (!NOTITIES.includes(n)) return;
  bewaarNotities({ meteen: true });
}

/* ------------------------------------------------------------------ */
/*  Labels                                                             */
/* ------------------------------------------------------------------ */

const labelSleutel = (l) => l.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Labels zijn tags, zoals in Herinneringen van iOS: één woord in kleine letters (spaties worden streepjes), getoond met
// een hekje. Oudere labels met hoofdletters of spaties tonen we zo ook; bij vergelijken tellen hoofdletters en accenten niet.
const tagVan = (l) => String(l).replace(/[#,]/g, ' ').trim().toLowerCase().replace(/\s+/g, '-');
const tagSleutel = (l) => labelSleutel(tagVan(l));
const toonLabel = (l) => `#${tagVan(l)}`;
// Alle labels, de meest gebruikte eerst
function alleLabels() {
  const tel = new Map();
  levendeNotities().forEach((n) => n.labels.forEach((l) => {
    const k = tagSleutel(l);
    const t = tel.get(k) || { label: tagVan(l), n: 0 };
    t.n++; tel.set(k, t);
  }));
  return [...tel.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'nl')).map((t) => t.label);
}
// Een label dat al bestaat (ook met andere hoofdletters of accenten) houdt zijn bestaande schrijfwijze
function bestaandLabel(l) {
  const k = tagSleutel(l);
  return alleLabels().find((x) => tagSleutel(x) === k) || tagVan(l);
}

/* ------------------------------------------------------------------ */
/*  Tekst en datum                                                     */
/* ------------------------------------------------------------------ */

// Het moment waar een notitie bij hoort: de afspraak, of bij een losse notitie de laatste wijziging. De lijst en de
// notitie zelf tonen allebei dit moment, zodat je een terugkerend overleg aan de datum herkent.
const notitieMoment = (n) => new Date(n.afspraak ? n.afspraak.start : (n.gewijzigd || n.gemaakt));
function notitieDatum(n) {
  const d = notitieMoment(n);
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()} om ${hhmm(d)}`;
}
// iPad en Mac: de lijst zoals in Notities van Apple, in groepen naar de laatste wijziging
const dagenGeleden = (ms) => Math.round((vandaag() - startOfDay(new Date(ms))) / 864e5);
function wijzigGroep(ms) {
  const dagen = dagenGeleden(ms), d = new Date(ms);
  if (dagen < 0) return 'Binnenkort'; // een notitie bij een afspraak die nog moet komen
  if (dagen === 0) return 'Vandaag';
  if (dagen === 1) return 'Gisteren';
  if (dagen < 7) return 'Afgelopen 7 dagen';
  if (dagen < 30) return 'Afgelopen 30 dagen';
  return d.getFullYear() === vandaag().getFullYear() ? cap(MONTHS_LONG[d.getMonth()]) : String(d.getFullYear());
}
function wijzigDatum(ms) {
  const dagen = dagenGeleden(ms), d = new Date(ms);
  if (dagen === 0 || dagen === 1) return hhmm(d); // het kopje zegt al Vandaag of Gisteren
  if (dagen === -1) return 'Morgen'; // een notitie bij een afspraak die nog moet komen
  if (Math.abs(dagen) < 7) return cap(DAYS_LONG[d.getDay()]);
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}
// De titel van een notitie: bij een afspraak de titel van de afspraak, anders de eerste regel (zoals in Notities van
// Apple). Daarnaast een voorproef: de eerste regel tekst bij een afspraak, anders de tweede regel.
function notitieKop(n) {
  const regels = n.tekst.split('\n').map((r) => r.trim()).filter(Boolean);
  const open = openPunten(n).length;
  const metPunten = (t) => t || (open ? (open === 1 ? '1 open actiepunt' : `${open} open actiepunten`) : '');
  if (n.afspraak) return [n.afspraak.titel || 'Zonder titel', metPunten(regels[0])];
  if (!regels.length && punten(n).some((p) => p.tekst.trim())) return [punten(n).find((p) => p.tekst.trim()).tekst.trim(), open > 1 ? `${open} open actiepunten` : ''];
  return [regels[0] || 'Nieuwe notitie', metPunten(regels[1])];
}
// Wat er op het scherm staat: bij een losse notitie de titel (groot, bovenaan) en daaronder de rest
function schermTekst(el) {
  const t = $('#nottitel', el), r = $('#nottekst', el);
  if (!r) return null;
  return t && t.value ? t.value + (r.value ? `\n${r.value}` : '') : r.value;
}
// Een deadline kort: vandaag, morgen, de dag van de week, of de datum
const deadlineDag = (d) => { const [j, m, g] = d.split('-').map(Number); return new Date(j, m - 1, g); };
function deadlineTekst(d) {
  const dag = deadlineDag(d), dagen = Math.round((dag - vandaag()) / 864e5);
  if (dagen === 0) return 'Vandaag';
  if (dagen === 1) return 'Morgen';
  if (dagen === -1) return 'Gisteren';
  if (dagen > 1 && dagen < 7) return cap(DAYS_LONG[dag.getDay()]);
  return `${dag.getDate()} ${MONTHS_SHORT[dag.getMonth()]}${dag.getFullYear() !== vandaag().getFullYear() ? ` ${dag.getFullYear()}` : ''}`;
}
const teLaat = (d) => !!d && deadlineDag(d) < vandaag();

// Een deadline aan het eind van een actiepunt, zoals "! Offerte sturen eind volgende week": geeft de tekst zonder de
// deadline en de deadline ('jjjj-mm-dd'), of null. Alleen werkdagen: valt een einde, een midden of een vaste datum in het
// weekend, dan de vrijdag ervoor; vandaag, morgen of "over 3 dagen" in het weekend wordt de maandag erna. Een losse
// maand ("over maart") telt niet: dan alleen met begin, medio of eind ervoor.
function leesDeadline(tekst, ref = vandaag()) {
  const nu = startOfDay(ref);
  const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const terug = (d) => { while (weekend(d)) d = addDays(d, -1); return d; };
  const vooruit = (d) => { while (weekend(d)) d = addDays(d, 1); return d; };
  const maandag = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const maandNr = (w) => MT_MAANDEN[w.toLowerCase().replace('.', '')];
  const jaarVan = (m, jaar) => (jaar ? (+jaar < 100 ? 2000 + +jaar : +jaar) : nu.getFullYear() + (m < nu.getMonth() ? 1 : 0));
  // Een vaste datum zonder jaar die al voorbij is, valt in het jaar erna (in december over januari)
  const datum = (dag, m, jaar) => { let d = new Date(jaarVan(m, jaar), m, +dag); if (!jaar && d < addDays(nu, -7)) d = new Date(d.getFullYear() + 1, m, +dag); return terug(d); };
  const deelVan = (deel, begin, midden, eind) => (/^begin/i.test(deel || '') ? begin() : /^(medio|half|halverwege|midden)/i.test(deel || '') ? midden() : eind());
  const inMaand = (deel, j, m) => deelVan(deel, () => vooruit(new Date(j, m, 1)), () => terug(new Date(j, m, 15)), () => terug(new Date(j, m + 1, 0)));
  const inWeek = (deel, ma) => deelVan(deel, () => ma, () => addDays(ma, 2), () => addDays(ma, 4));
  const WERKDAGEN = { maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5 };
  const TAL = { een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6 };
  const DEEL = '(begin|eind|einde|medio|half|halverwege|midden)(?:\\s+van)?';
  const DAG = '(maandag|dinsdag|woensdag|donderdag|vrijdag)';
  const regels = [
    [`(\\d{1,2})[-/](\\d{1,2})(?:[-/](\\d{2}|\\d{4}))?`, (m) => datum(m[1], +m[2] - 1, m[3])],
    [`(\\d{1,2})\\s+${MT_MAAND}(?:\\s+(\\d{4}))?`, (m) => datum(m[1], maandNr(m[2]), m[3])],
    [`${DEEL}\\s+${MT_MAAND}(?:\\s+(\\d{4}))?`, (m) => inMaand(m[1], jaarVan(maandNr(m[2]), m[3]), maandNr(m[2]))],
    [`(?:${DEEL}\\s+)?(?:de|deze)\\s+maand`, (m) => inMaand(m[1], nu.getFullYear(), nu.getMonth())],
    [`(?:${DEEL}\\s+)?(?:volgende|komende)\\s+maand`, (m) => inMaand(m[1], nu.getFullYear(), nu.getMonth() + 1)],
    [`(?:volgende|komende)\\s+week\\s+${DAG}|${DAG}\\s+(?:volgende|komende)\\s+week`, (m) => addDays(maandag(nu), 7 + WERKDAGEN[(m[1] || m[2]).toLowerCase()] - 1)],
    [`(?:${DEEL}\\s+)?(deze|volgende|komende)\\s+week`, (m) => inWeek(m[1], addDays(maandag(nu), /deze/i.test(m[2]) && !weekend(nu) ? 0 : 7))],
    [`over\\s+(\\d{1,2}|een|twee|drie|vier|vijf|zes)\\s+(werkdagen|werkdag|dagen|dag|weken|week)`, (m) => {
      const n = TAL[m[1].toLowerCase()] || +m[1];
      if (/^werk/i.test(m[2])) { let d = nu; for (let i = 0; i < n; i++) d = vooruit(addDays(d, 1)); return d; }
      return vooruit(addDays(nu, /^we/i.test(m[2]) ? 7 * n : n));
    }],
    [DAG, (m) => addDays(nu, (WERKDAGEN[m[1].toLowerCase()] - nu.getDay() + 7) % 7)],
    ['overmorgen', () => vooruit(addDays(nu, 2))],
    ['morgen', () => vooruit(addDays(nu, 1))],
    ['vandaag', () => vooruit(nu)],
  ];
  for (const [patroon, maak] of regels) {
    const m = tekst.match(new RegExp(`(?:^|\\s)(?:(?:voor|vóór|uiterlijk|op|per|tegen|deadline:?)\\s+)?(?:${patroon})\\s*[.!]?\\s*$`, 'iu'));
    const rest = m ? tekst.slice(0, m.index).trim() : '';
    if (!m || !rest) continue; // alleen een datum, zonder actiepunt ervoor: dan is het geen deadline
    const d = maak(m);
    if (!(d instanceof Date) || isNaN(d)) continue;
    return { tekst: rest, deadline: ymd(d) };
  }
  return null;
}
const labelChips = (labels) => (labels.length ? `<span class="nlabels">${labels.map((l) => `<span class="nlabel">${esc(toonLabel(l))}</span>`).join('')}</span>` : '');
