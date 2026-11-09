// Locaties bij een nieuwe afspraak: je eigen ruimtes, en (met een Google-sleutel) adressen en plaatsen.
// Ruimtes en sleutel geef je op onder Instellingen. De sleutel blijft op dit toestel (localStorage); de ruimtes
// gaan ook via je Worker naar je andere toestellen.

// Ruimtes: een lijst met per ruimte een naam en (optioneel) een e-mailadres.
// Met een adres zet de app de ruimte ook als deelnemer in de uitnodiging, zodat Outlook hem reserveert.
const RUIMTES_SLEUTEL = 'ag_ruimtes2';
const GOOGLE_SLEUTEL = 'ag_google';

const googleSleutel = () => String(LS.get(GOOGLE_SLEUTEL) || '').trim();
const zetGoogleSleutel = (k) => { const s = String(k || '').trim(); if (s) LS.set(GOOGLE_SLEUTEL, s); else LS.del(GOOGLE_SLEUTEL); };

// Alles wat je hebt ingevuld, ook regels die nog niet af zijn (voor het scherm Instellingen)
function ruimteLijst() {
  const lijst = LS.get(RUIMTES_SLEUTEL);
  if (Array.isArray(lijst)) return lijst.map((r) => ({ naam: String(r.naam || ''), email: String(r.email || '') }));
  // Eerdere vorm: één ruimte per regel en een maildomein. Eenmalig omzetten.
  const oud = LS.get('ag_ruimtes');
  if (oud && typeof oud.tekst === 'string') {
    const domein = String(oud.domein || '').trim().replace(/^@/, '');
    const uit = oud.tekst.split('\n').map((x) => x.trim()).filter(Boolean).map((regel) => {
      const na = naamEnAdres(regel);
      if (na) return { naam: na.naam || na.email, email: na.email };
      const deel = zonderAccent(regel).replace(/[^a-z0-9._-]+/g, '');
      return { naam: regel, email: deel && domein ? `${deel}@${domein}` : '' };
    });
    zetRuimteLijst(uit);
    LS.del('ag_ruimtes');
    return uit;
  }
  return [];
}
// Een wijziging hier krijgt een tijdstip en gaat via je Worker naar je andere toestellen (synchroniseren.js)
const RUIMTES_GEWIJZIGD = 'ag_ruimtes_gewijzigd';
function zetRuimteLijst(lijst) {
  LS.set(RUIMTES_SLEUTEL, lijst.map((r) => ({ naam: String(r.naam || '').trim(), email: String(r.email || '').trim() })));
  // Altijd later dan de lijst die we kennen, ook als de klok van dit toestel iets achterloopt
  LS.set(RUIMTES_GEWIJZIGD, Math.max(Date.now(), (Number(LS.get(RUIMTES_GEWIJZIGD)) || 0) + 1));
  if (typeof synchroniseerStraks === 'function') synchroniseerStraks();
}

// De bruikbare ruimtes: met een naam, zonder dubbele, en alleen een geldig adres
function ruimtes() {
  const gezien = new Set();
  const uit = [];
  for (const r of ruimteLijst()) {
    const naam = r.naam.trim();
    if (!naam || gezien.has(naam.toLowerCase())) continue;
    gezien.add(naam.toLowerCase());
    const email = r.email.trim();
    uit.push({ naam, email: IS_ADRES.test(email) ? email : '' });
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

// Klopt de sleutel? Na het bewaren onder Instellingen.
async function testGoogleSleutel(sleutel) {
  try {
    const r = await zoekPlaatsen('Amsterdam Centraal', nieuweSessie(), sleutel);
    return { ok: true, tekst: 'De sleutel werkt.' };
  } catch (e) {
    if (e.status === 400 || e.status === 403) return { ok: false, tekst: `Google accepteert deze sleutel niet. Controleer de sleutel en de beperkingen in Google Cloud.${e.message ? ` (${e.message.replace(/\.$/, '')}.)` : ''}` };
    if (e.status) return { ok: false, tekst: `Testen lukte niet: ${e.message}` };
    return { ok: false, tekst: 'Google is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.' };
  }
}
