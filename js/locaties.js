// Locaties bij een nieuwe afspraak: je eigen ruimtes, en (met een Google-sleutel) adressen en plaatsen.
// Ruimtes en sleutel geef je op onder Instellingen; ze blijven alleen op dit toestel (localStorage).

// Ruimtes: één per regel, 'Naam' of 'Naam <adres@domein>'.
// Met een maildomein krijgt een ruimte zonder adres: naam zonder spaties en accenten @ domein (Glazen Huis → glazenhuis@…).
// Met een adres zet de app de ruimte ook als deelnemer in de uitnodiging, zodat Outlook hem reserveert.
const RUIMTES_SLEUTEL = 'ag_ruimtes';
const GOOGLE_SLEUTEL = 'ag_google';

const ruimteInstelling = () => LS.get(RUIMTES_SLEUTEL) || { tekst: '', domein: '' };
const zetRuimteInstelling = (r) => LS.set(RUIMTES_SLEUTEL, { tekst: String(r.tekst || ''), domein: String(r.domein || '').trim().replace(/^@/, '') });
const googleSleutel = () => String(LS.get(GOOGLE_SLEUTEL) || '').trim();
const zetGoogleSleutel = (k) => { const s = String(k || '').trim(); if (s) LS.set(GOOGLE_SLEUTEL, s); else LS.del(GOOGLE_SLEUTEL); };

const ruimteAdres = (naam, domein) => {
  const deel = zonderAccent(naam).replace(/[^a-z0-9._-]+/g, '');
  return deel && domein ? `${deel}@${domein}` : '';
};

function ruimtes() {
  const { tekst, domein } = ruimteInstelling();
  const gezien = new Set();
  const uit = [];
  for (const regel of String(tekst).split('\n')) {
    const r = regel.trim();
    if (!r) continue;
    const na = naamEnAdres(r);
    const naam = na ? na.naam || na.email : r;
    if (gezien.has(naam.toLowerCase())) continue;
    gezien.add(naam.toLowerCase());
    uit.push({ naam, email: na ? na.email : ruimteAdres(naam, domein) });
  }
  return uit;
}

// Ruimtes die passen bij wat je typt (begin van een woord, zonder accenten). Zonder tekst: alle ruimtes.
function zoekRuimtes(vraag, max = 8) {
  const q = zonderAccent(vraag).trim();
  const alle = ruimtes();
  if (!q) return alle.slice(0, max);
  const delen = q.split(/\s+/);
  return alle.filter((r) => {
    const naam = zonderAccent(r.naam);
    const woorden = naam.split(/[\s\-'’.]+/).filter(Boolean);
    return naam.startsWith(q) || delen.every((d) => woorden.some((w) => w.startsWith(d)));
  }).slice(0, max);
}

// Google Places (Autocomplete, nieuwe versie). Eén sessie per formulier; de sleutel gaat mee in de kop van de vraag.
const nieuweSessie = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
async function zoekPlaatsen(vraag, sessie, sleutel = googleSleutel()) {
  if (!sleutel) return [];
  const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': sleutel },
    body: JSON.stringify({ input: vraag, languageCode: 'nl', regionCode: 'nl', sessionToken: sessie }),
  });
  if (!r.ok) {
    let melding = '';
    try { melding = ((await r.json()).error || {}).message || ''; } catch (e) { /* geen json */ }
    const fout = new Error(melding || `Google gaf status ${r.status}`);
    fout.status = r.status;
    throw fout;
  }
  const d = await r.json();
  return (d.suggestions || []).map((s) => s.placePrediction).filter(Boolean).map((p) => {
    const sf = p.structuredFormat || {};
    const hoofd = (sf.mainText && sf.mainText.text) || (p.text && p.text.text) || '';
    const rest = (sf.secondaryText && sf.secondaryText.text) || '';
    return { naam: hoofd, sub: rest, tekst: (p.text && p.text.text) || [hoofd, rest].filter(Boolean).join(', ') };
  }).filter((p) => p.naam);
}

// Klopt de sleutel? Voor de knop 'Sleutel testen' onder Instellingen.
async function testGoogleSleutel(sleutel) {
  try {
    const r = await zoekPlaatsen('Amsterdam Centraal', nieuweSessie(), sleutel);
    return { ok: true, tekst: r.length ? `De sleutel werkt. Bijvoorbeeld: ${r[0].tekst}.` : 'De sleutel werkt, maar Google gaf geen plaatsen terug.' };
  } catch (e) {
    if (e.status === 400 || e.status === 403) return { ok: false, tekst: `Google weigert de sleutel: ${e.message}` };
    if (e.status) return { ok: false, tekst: `Dat lukte niet: ${e.message}` };
    return { ok: false, tekst: 'Google is niet bereikbaar. Is er verbinding, en staat de Places API (New) aan voor deze sleutel?' };
  }
}
