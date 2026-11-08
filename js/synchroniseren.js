// Agenda, synchroniseren
// Notities gelijk houden op iPhone, iPad en Mac via je Cloudflare Worker. De app gebruikt de agenda-link die je
// al hebt opgegeven, met /notities erachter; de sleutel in die link geeft toegang. Zonder agenda-link, of zolang de
// Worker nog geen database heeft, blijven de notities alleen op het toestel.
// Werkwijze: eerst sturen wat hier is veranderd, dan ophalen wat elders is veranderd. Per notitie wint de laatste
// wijziging (het tijdstip 'gewijzigd'). De Worker nummert elke wijziging; de app onthoudt tot welk nummer hij bij is.
// Elke notitie onthoudt welke wijziging al in de Worker staat (gesynct); wat daarna verandert, gaat de volgende keer mee.
// Gewoon script (geen module): het gebruikt NOTITIES, BESTAND en LS uit de andere bestanden.
'use strict';

const SYNC = { bezig: false, fout: null, geenDatabase: false, oud: false, laatst: 0 };
const SYNC_ELKE_MS = 5 * 60 * 1000; // ook als er niets gebeurt, elke vijf minuten even kijken
let _syncTimer = null;

function notitieAdres() {
  if (!BESTAND || !BESTAND.link) return null;
  try {
    const u = new URL(BESTAND.link);
    u.pathname = '/notities';
    return u;
  } catch (e) { return null; }
}
// Tot welk versienummer dit toestel bij is. Hoort de stand bij een andere Worker, dan begint het opnieuw en gaan
// alle notities van dit toestel nog een keer mee.
function syncStand(adres) {
  let s = null;
  try { s = JSON.parse(LS.get('ag_notsync') || 'null'); } catch (e) { s = null; }
  if (s && s.adres === adres.origin) return s;
  NOTITIES.forEach((n) => { delete n.gesynct; });
  return { adres: adres.origin, versie: 0 };
}
const zonderStand = (n) => { const { gesynct, ...rest } = n; return rest; };
const bewaarSyncStand = (s) => LS.set('ag_notsync', JSON.stringify(s));

async function vraag(adres, opties) {
  let r;
  try { r = await fetch(adres, { cache: 'no-store', ...opties }); } catch (e) { throw new Error('Geen verbinding met je Worker'); }
  if (r.status === 501) { const f = new Error('De Worker heeft nog geen database'); f.geenDatabase = true; throw f; }
  if (r.status === 403) throw new Error('Geen toegang. Klopt de sleutel in je agenda-link?');
  // Een Worker van vóór de notities geeft op elk adres de agenda terug (of 'Alleen GET' bij versturen)
  const oud = r.status === 405 || !(r.headers.get('Content-Type') || '').includes('json');
  if (oud) { const f = new Error('Je Worker is nog niet bijgewerkt'); f.oud = true; if (r.body) r.body.cancel().catch(() => {}); throw f; }
  if (!r.ok) throw new Error(`De Worker gaf fout ${r.status}`);
  return r.json();
}

// vanzelf: automatisch (na een wijziging, elke paar minuten). Bij een oude Worker alleen nog als je er zelf om vraagt.
async function synchroniseer({ vanzelf = false } = {}) {
  const adres = notitieAdres();
  if (!adres || SYNC.bezig || document.visibilityState === 'hidden' || (vanzelf && SYNC.oud)) return;
  await laadNotities();
  SYNC.bezig = true;
  tekenSyncStatus();
  let veranderd = false;
  try {
    const stand = syncStand(adres);
    // 1. Versturen wat op dit toestel is veranderd: een momentopname, want je kunt intussen verder typen
    const sturen = NOTITIES.filter((n) => n.gesynct !== n.gewijzigd).map(zonderStand);
    for (let i = 0; i < sturen.length; i += 500) {
      const deel = sturen.slice(i, i + 500);
      await vraag(adres, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ notities: deel }) });
      deel.forEach((v) => { const n = NOTITIES.find((x) => x.id === v.id); if (n && n.gewijzigd === v.gewijzigd) n.gesynct = v.gewijzigd; });
      veranderd = true;
    }
    // 2. Ophalen wat elders is veranderd (ook wat dit toestel net zelf stuurde: dat verandert hier niets)
    for (let meer = true; meer;) {
      const u = new URL(adres);
      u.searchParams.set('sinds', stand.versie);
      const antwoord = await vraag(u);
      antwoord.notities.forEach((ander) => {
        const hier = NOTITIES.find((n) => n.id === ander.id);
        if (!hier) { NOTITIES.push({ ...ander, gesynct: ander.gewijzigd }); veranderd = true; }
        else if (ander.gewijzigd > hier.gewijzigd) { Object.assign(hier, ander, { gesynct: ander.gewijzigd }); veranderd = true; }
      });
      stand.versie = antwoord.versie;
      meer = antwoord.meer;
    }
    bewaarSyncStand(stand);
    if (veranderd) await IDB.set('notities', NOTITIES).catch(() => {});
    Object.assign(SYNC, { fout: null, geenDatabase: false, oud: false, laatst: Date.now() });
  } catch (e) {
    Object.assign(SYNC, { fout: e.message, geenDatabase: !!e.geenDatabase, oud: !!e.oud });
  } finally {
    SYNC.bezig = false;
    tekenSyncStatus();
    if (veranderd) tekenNotities();
  }
}

// Kort na een wijziging versturen (bewaarNotities roept dit aan), zodat een ander toestel het snel ziet
function synchroniseerStraks(ms = 2500) {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => synchroniseer({ vanzelf: true }), ms);
}
setInterval(() => synchroniseer({ vanzelf: true }), SYNC_ELKE_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') synchroniseerStraks(300); });
window.addEventListener('online', () => synchroniseerStraks(300));

// Onder Instellingen: hoe het ervoor staat
function syncStatusHtml() {
  const knop = `<button class="frij instknop" data-actie="sync-nu"${SYNC.bezig ? ' disabled' : ''}>${I.herhaal}<span>Nu synchroniseren</span></button>`;
  const regel = (t1, t2) => `<div class="frij inststatus">${I.notitie}<span class="tekst"><span class="t1">${t1}</span><span class="t2">${t2}</span></span></div>`;
  if (!notitieAdres()) return regel('Alleen op dit toestel', 'Synchroniseren werkt met je agenda-link');
  if (SYNC.bezig) return regel('Synchroniseren…', 'Via je Worker') + knop;
  if (SYNC.geenDatabase) return regel('Alleen op dit toestel', 'Je Worker heeft nog geen database') + knop;
  if (SYNC.fout) return regel('Synchroniseren lukte niet', esc(SYNC.fout)) + knop;
  if (SYNC.laatst) return regel('Gesynchroniseerd', `Om ${hhmm(new Date(SYNC.laatst))}, via je Worker`) + knop;
  return regel('Nog niet gesynchroniseerd', 'Via je Worker') + knop;
}
function tekenSyncStatus() {
  document.querySelectorAll('#isync').forEach((el) => { el.innerHTML = syncStatusHtml(); });
}
