// Contacten: een lijst met namen en e-mailadressen, alleen op dit toestel (IndexedDB).
// Gebruikt bij een nieuwe afspraak: typ een naam en de app vult het adres aan.
// Leest drie soorten bestanden:
//  - een export van de Outlook-adrescache met NK2Edit (csv, zonder kopregel; met gewicht per adres);
//  - een csv met kopregel, zoals een export uit Outlook of Gmail (kolommen voor naam en e-mail);
//  - een vCard-bestand (.vcf), bijvoorbeeld uit Contacten op de iPhone of Mac.

let CONTACTEN = []; // [{ naam, email, gewicht }], zwaarste eerst
let CONTACTEN_INFO = null; // { naam, datum, aantal }

const IS_ADRES = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

// Csv in rijen en cellen, met aanhalingstekens ("a, b" en "" binnen een cel). Het scheidingsteken bepalen we zelf.
function csvRijen(tekst) {
  const eerste = tekst.slice(0, tekst.indexOf('\n') >>> 0).replace(/"[^"]*"/g, '');
  const sep = [',', ';', '\t'].map((s) => [s, eerste.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rijen = [];
  let rij = [], cel = '', tussen = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (tussen) {
      if (c === '"' && tekst[i + 1] === '"') { cel += '"'; i++; }
      else if (c === '"') tussen = false;
      else cel += c;
    } else if (c === '"' && cel === '') tussen = true;
    else if (c === sep) { rij.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && tekst[i + 1] === '\n') i++;
      rij.push(cel); cel = '';
      if (rij.some((x) => x.trim())) rijen.push(rij);
      rij = [];
    } else cel += c;
  }
  rij.push(cel);
  if (rij.some((x) => x.trim())) rijen.push(rij);
  return rijen;
}

// 'Jan Jansen <jan@x.nl>' → { naam: 'Jan Jansen', email: 'jan@x.nl' }
function naamEnAdres(s) {
  const m = String(s || '').match(/^\s*"?([^"<]*?)"?\s*<([^>\s]+@[^>\s]+)>\s*$/);
  return m ? { naam: m[1].trim(), email: m[2] } : null;
}

const schoneNaam = (naam, email) => {
  let n = String(naam || '').replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ');
  // 'Bakker, Kees' → 'Kees Bakker', 'Aken, Ricardo van' → 'Ricardo van Aken'
  const m = n.match(/^([^,()]+),\s*([^,()]+)$/);
  if (m) n = `${m[2].trim()} ${m[1].trim()}`;
  return n && n.toLowerCase() !== String(email).toLowerCase() && !IS_ADRES.test(n) ? n : '';
};

function uitVcard(tekst) {
  const uit = [];
  const regels = tekst.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n'); // vervolgregels plakken
  let naam = '', adressen = [];
  const waarde = (r) => r.slice(r.indexOf(':') + 1).replace(/\\([,;\\])/g, '$1').trim();
  for (const r of regels) {
    if (/^BEGIN:VCARD/i.test(r)) { naam = ''; adressen = []; }
    else if (/^FN[;:]/i.test(r)) naam = waarde(r);
    else if (/^N[;:]/i.test(r) && !naam) { const [achter, voor, midden] = waarde(r).split(';'); naam = [voor, midden, achter].filter(Boolean).join(' '); }
    else if (/^(item\d+\.)?EMAIL[;:]/i.test(r)) adressen.push(waarde(r));
    else if (/^END:VCARD/i.test(r)) for (const a of adressen) if (IS_ADRES.test(a)) uit.push({ naam, email: a, gewicht: 0 });
  }
  return uit;
}

function uitCsvMetKop(rijen) {
  const kop = rijen[0].map((k) => k.trim().toLowerCase());
  const zoek = (re) => kop.findIndex((k) => re.test(k));
  const mails = kop.map((k, i) => (/e-?mail|emailadres/.test(k) && !/type|label|soort/.test(k) ? i : -1)).filter((i) => i >= 0);
  const kNaam = zoek(/^(naam|name|display ?name|weergavenaam|volledige naam|full name)$/);
  const kVoor = zoek(/^(first name|voornaam|given name)$/);
  const kMidden = zoek(/^(middle name|tussenvoegsel|additional name|middelste naam)$/);
  const kAchter = zoek(/^(last name|achternaam|family name|surname)$/);
  const uit = [];
  for (const r of rijen.slice(1)) {
    const naam = kNaam >= 0 && r[kNaam] ? r[kNaam] : [kVoor, kMidden, kAchter].filter((i) => i >= 0).map((i) => (r[i] || '').trim()).filter(Boolean).join(' ');
    for (const i of mails) {
      const w = (r[i] || '').trim();
      const na = naamEnAdres(w);
      if (na) uit.push({ naam: naam || na.naam, email: na.email, gewicht: 0 });
      else for (const a of w.split(/\s*:::\s*|[\s,;]+/)) if (IS_ADRES.test(a)) uit.push({ naam, email: a, gewicht: 0 });
    }
  }
  return uit;
}

// NK2Edit: index, type (EX/SMTP), weergavenaam, adres, 'Naam <mail>', e-mail, domein, SMTP-adres, soort, gewicht, …
// Andere csv zonder kopregel: het eerste e-mailadres in de rij, met een naam uit 'Naam <mail>' als die er is.
function uitCsvZonderKop(rijen) {
  const uit = [];
  for (const r of rijen) {
    const nk2 = r.length >= 10 && /^\d+$/.test(r[0].trim()) && /^(EX|SMTP)$/i.test(r[1].trim());
    if (nk2) {
      const email = [r[7], r[5], r[2]].map((x) => (x || '').trim()).find((x) => IS_ADRES.test(x));
      if (!email) continue;
      const na = naamEnAdres(r[4]);
      uit.push({ naam: schoneNaam(r[2], email) || (na && na.naam) || '', email, gewicht: parseFloat(String(r[9]).replace(',', '.')) || 0 });
      continue;
    }
    let naam = '', email = '';
    for (const c of r) {
      const na = naamEnAdres(c);
      if (na) { naam = naam || na.naam; email = email || na.email; }
      else if (!email && IS_ADRES.test(c.trim())) email = c.trim();
    }
    if (!email) continue;
    if (!naam) naam = r.map((c) => c.trim()).find((c) => c && !/@/.test(c) && /\p{L}/u.test(c) && !/^\d+$/.test(c)) || '';
    uit.push({ naam, email, gewicht: 0 });
  }
  return uit;
}

// Tekst van een bestand → contacten, zonder dubbele adressen, zwaarste en daarna op naam
function leesContacten(tekst) {
  tekst = String(tekst || '').replace(/^﻿/, '');
  let ruw;
  if (/BEGIN:VCARD/i.test(tekst)) ruw = uitVcard(tekst);
  else {
    const rijen = csvRijen(tekst);
    if (!rijen.length) return [];
    const kopregel = rijen[0].some((k) => /e-?mail/i.test(k)) && !rijen[0].some((k) => IS_ADRES.test(k.trim()));
    ruw = kopregel ? uitCsvMetKop(rijen) : uitCsvZonderKop(rijen);
  }
  const per = new Map();
  ruw.forEach((c, i) => {
    const email = c.email.trim();
    const sleutel = email.toLowerCase();
    const naam = schoneNaam(c.naam, email);
    const oud = per.get(sleutel);
    if (!oud) per.set(sleutel, { naam, email, gewicht: c.gewicht || 0, volg: i });
    else { if (!oud.naam && naam) oud.naam = naam; oud.gewicht = Math.max(oud.gewicht, c.gewicht || 0); }
  });
  return [...per.values()]
    .sort((a, b) => b.gewicht - a.gewicht || a.volg - b.volg)
    .map(({ naam, email, gewicht }) => ({ naam, email, gewicht }));
}

async function laadContacten() {
  try {
    const b = await IDB.get('contacten');
    if (b && Array.isArray(b.lijst)) { CONTACTEN = b.lijst; CONTACTEN_INFO = { naam: b.naam, datum: b.datum, aantal: b.lijst.length }; }
  } catch (e) { /* geen opslag: dan zonder contacten */ }
}

async function openContacten(bestand) {
  if (!bestand) return;
  const lijst = leesContacten(await bestand.text());
  if (!lijst.length) throw new Error('geen contacten');
  const b = { naam: bestand.name, datum: Date.now(), lijst };
  CONTACTEN = lijst;
  CONTACTEN_INFO = { naam: b.naam, datum: b.datum, aantal: lijst.length };
  await IDB.set('contacten', b).catch(() => {});
  return lijst.length;
}

// Knoppen onder Contacten (weekkiezer en zijbalk)
function contactActie(actie) {
  // Het bestandsvenster moet direct bij de tik openen (iOS)
  if (actie === 'contacten-inladen') $('#contactinvoer').click();
  else if (actie === 'contacten-wis' && confirm('Contacten wissen? Ze verdwijnen alleen van dit toestel; je bestand blijft gewoon bestaan.')) vergeetContacten().then(() => { render(); renderZijbalk(); });
}

async function vergeetContacten() {
  CONTACTEN = []; CONTACTEN_INFO = null;
  await IDB.del('contacten').catch(() => {});
}

// Zoeken op het begin van een woord in de naam of van het adres. 'jan j' vindt Jan Jansen.
const zonderAccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function zoekContacten(vraag, al = [], max = 6) {
  const q = zonderAccent(vraag).trim();
  if (!q) return [];
  const delen = q.split(/\s+/);
  const gekozen = new Set(al.map((a) => a.toLowerCase()));
  const uit = [];
  for (const c of CONTACTEN) {
    if (gekozen.has(c.email.toLowerCase())) continue;
    const naam = zonderAccent(c.naam), mail = zonderAccent(c.email);
    const woorden = [...naam.split(/[\s\-'’.]+/), ...mail.split('@')[0].split(/[._\-+]+/)].filter(Boolean);
    const past = mail.startsWith(q) || naam.startsWith(q) || delen.every((d) => woorden.some((w) => w.startsWith(d)));
    if (!past) continue;
    uit.push({ c, eerst: naam.startsWith(q) || mail.startsWith(q) ? 0 : 1 });
    if (uit.length >= 60) break;
  }
  return uit.sort((a, b) => a.eerst - b.eerst).slice(0, max).map((x) => x.c);
}

// Aanvullen in het deelnemersveld van een nieuwe afspraak.
// veld: het invoerveld; lijstEl: waar de suggesties komen. Bij een keuze: het adres in het veld, met '; ' erachter.
function koppelAanvullen(veld, lijstEl) {
  let gevonden = [], actief = -1;
  const deel = () => { const v = veld.value; const i = Math.max(v.lastIndexOf(','), v.lastIndexOf(';')); return { voor: v.slice(0, i + 1), vraag: v.slice(i + 1).trim() }; };
  const sluit = () => { gevonden = []; actief = -1; lijstEl.innerHTML = ''; lijstEl.hidden = true; veld.setAttribute('aria-expanded', 'false'); veld.removeAttribute('aria-activedescendant'); };
  const teken = () => {
    if (!gevonden.length) { sluit(); return; }
    lijstEl.hidden = false;
    veld.setAttribute('aria-expanded', 'true');
    lijstEl.innerHTML = gevonden.map((c, i) => `<button type="button" role="option" id="aanvul${i}" class="aanvuloptie${i === actief ? ' actief' : ''}" aria-selected="${i === actief}" data-aanvul="${i}">
        <span class="t1">${esc(c.naam || c.email)}</span>${c.naam ? `<span class="t2">${esc(c.email)}</span>` : ''}</button>`).join('');
    if (actief >= 0) veld.setAttribute('aria-activedescendant', `aanvul${actief}`); else veld.removeAttribute('aria-activedescendant');
  };
  const kies = (i) => {
    const c = gevonden[i];
    if (!c) return;
    const { voor } = deel();
    veld.value = `${voor ? `${voor.trim()} ` : ''}${c.email}; `;
    veld.dispatchEvent(new Event('input', { bubbles: true }));
    sluit();
    veld.focus();
  };
  veld.setAttribute('role', 'combobox');
  veld.setAttribute('aria-autocomplete', 'list');
  veld.setAttribute('aria-controls', lijstEl.id);
  lijstEl.setAttribute('role', 'listbox');
  sluit();
  veld.addEventListener('input', (ev) => {
    const { vraag } = deel();
    gevonden = vraag ? zoekContacten(vraag, adressen(veld.value)) : [];
    actief = gevonden.length && !IOS ? 0 : -1;
    teken();
  });
  veld.addEventListener('keydown', (ev) => {
    if (lijstEl.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const n = gevonden.length;
      actief = ev.key === 'ArrowDown' ? (actief + 1) % n : (actief - 1 + n) % n;
      teken();
    } else if ((ev.key === 'Enter' || ev.key === 'Tab') && actief >= 0) { ev.preventDefault(); kies(actief); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); sluit(); }
  });
  // Het toetsenbord open houden: niet laten blurren bij een tik op een suggestie
  lijstEl.addEventListener('pointerdown', (ev) => ev.preventDefault());
  lijstEl.addEventListener('mousedown', (ev) => ev.preventDefault());
  lijstEl.addEventListener('click', (ev) => { const o = ev.target.closest('[data-aanvul]'); if (o) { ev.stopPropagation(); kies(Number(o.dataset.aanvul)); } });
  veld.addEventListener('blur', () => setTimeout(sluit, 150));
}
