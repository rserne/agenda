// Agenda, synchroniseren
// Notities gelijk houden op iPhone, iPad en Mac via je Cloudflare Worker. De app gebruikt de agenda-link die je
// al hebt opgegeven, met /notities erachter; de sleutel in die link geeft toegang. Zonder agenda-link, of zolang de
// Worker nog geen database heeft, blijven de notities alleen op het toestel.
// Werkwijze: eerst sturen wat hier is veranderd, dan ophalen wat elders is veranderd. Per notitie wint de laatste
// wijziging (het tijdstip 'gewijzigd'). De Worker nummert elke wijziging; de app onthoudt tot welk nummer hij bij is.
// Elke notitie onthoudt welke wijziging al in de Worker staat (gesynct); wat daarna verandert, gaat de volgende keer mee.
// De ruimtes uit Instellingen gaan op dezelfde manier mee (/ruimtes), als één lijst: de laatste wijziging wint.
// Gewoon script (geen module): het gebruikt NOTITIES, BESTAND en LS uit de andere bestanden.
'use strict';

const SYNC = { bezig: false, fout: null, geenDatabase: false, oud: false, ruimtesOud: false, laatst: 0 };
const SYNC_ELKE_MS = 5 * 60 * 1000; // ook als er niets gebeurt, elke vijf minuten even kijken
let _syncTimer = null;

function notitieAdres() {
  const link = koppeling();
  if (!link) return null;
  try {
    const u = new URL(link);
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

// De ruimtes: eerst kijken wat er in de Worker staat. Is dat nieuwer, dan nemen we het over; is de lijst hier nieuwer
// (of staat er nog niets in de Worker), dan sturen we hem. Ruimtes van vóór het synchroniseren hebben nog geen
// tijdstip: dan wint wat er al in de Worker staat.
function ruimteAdres() {
  const u = notitieAdres();
  if (u) u.pathname = '/ruimtes';
  return u;
}
// Een Worker die de notities al kent maar de ruimtes nog niet: dan alleen de ruimtes overslaan (tot je erom vraagt)
async function synchroniseerRuimtes({ vanzelf = false } = {}) {
  const adres = ruimteAdres();
  if (!adres || (vanzelf && SYNC.ruimtesOud)) return;
  const hier = LS.get(RUIMTES_SLEUTEL), gewijzigd = Number(LS.get(RUIMTES_GEWIJZIGD)) || 0;
  let daar;
  try { daar = await vraag(adres); } catch (e) { if (e.oud) { SYNC.ruimtesOud = true; return; } throw e; }
  SYNC.ruimtesOud = false;
  if (daar.ruimtes && daar.gewijzigd > gewijzigd) {
    LS.set(RUIMTES_SLEUTEL, daar.ruimtes);
    LS.set(RUIMTES_GEWIJZIGD, daar.gewijzigd);
    document.dispatchEvent(new Event('ruimtesbinnen'));
  } else if (Array.isArray(hier) && (gewijzigd > daar.gewijzigd || (!daar.ruimtes && hier.length))) {
    const tijd = gewijzigd || Date.now();
    await vraag(adres, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ruimtes: hier, gewijzigd: tijd }) });
    LS.set(RUIMTES_GEWIJZIGD, tijd);
  }
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
    await synchroniseerRuimtes({ vanzelf });
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

// Onder Instellingen, bij Cloudflare: gekoppeld of niet, wanneer er voor het laatst is gesynchroniseerd, en per onderdeel
// hoe het ervoor staat. De link zelf tonen we niet.
// Wat er via de koppeling gaat: de agenda (als die via Cloudflare komt), notities en ruimtes
function wat() {
  const delen = [...(BESTAND && BESTAND.link ? ['agenda'] : []), 'notities', SYNC.ruimtesOud ? 'ruimtes (werk je Worker bij)' : 'ruimtes'];
  return delen.length === 3 ? `${delen[0]}, ${delen[1]} en ${delen[2]}` : delen.join(' en ');
}
function syncStatusHtml() {
  const knop = (actie, icoon, tekst, uit = false, gevaar = false) => `<button class="frij instknop${gevaar ? ' gevaar' : ''}" data-actie="${actie}"${uit ? ' disabled' : ''}>${icoon}<span>${tekst}</span></button>`;
  const regel = (t1, t2) => `<div class="frij inststatus">${I.koppel}<span class="tekst"><span class="t1">${t1}</span><span class="t2">${t2}</span></span></div>`;
  if (!notitieAdres()) return regel('Niet gekoppeld', 'Voor je Outlook-agenda, en notities en ruimtes op al je toestellen') + knop('koppeling-wijzig', I.plus, 'Koppeling opgeven');
  const [t1, t2] = SYNC.bezig ? ['Synchroniseren…', 'Even geduld']
    : SYNC.geenDatabase ? ['Gekoppeld', 'Je Worker heeft nog geen database']
      : SYNC.fout ? ['Synchroniseren lukte niet', esc(SYNC.fout)]
        : SYNC.laatst ? ['Gesynchroniseerd', `Om ${hhmm(new Date(SYNC.laatst))} · ${wat()}`] : ['Gekoppeld', 'Nog niet gesynchroniseerd'];
  return regel(t1, t2)
    + knop('sync-nu', I.herhaal, 'Nu synchroniseren', SYNC.bezig || LINK_BEZIG)
    + knop('koppeling-wijzig', I.koppel, 'Koppeling wijzigen')
    + knop('koppeling-wis', I.wissen, 'Koppeling verwijderen', false, true);
}
function tekenSyncStatus() {
  document.querySelectorAll('#isync').forEach((el) => { el.innerHTML = syncStatusHtml(); });
}
