// Tijden uit een mail: "Kun je op maandag 9 november tussen 13:00 en 16:00?" → dagen met tijdvakken.
// Een vaste lezer met regels voor Nederlandse datums en tijden; hij draait op het toestel en stuurt niets weg.
// Uitkomst: { opties: [{ dag, van, tot, heleDag, tekst, waarschuwing }], duur, online, zonderDag }
//   dag: Date (begin van de dag), van/tot: minuten na middernacht.

const MT_MAANDEN = { jan: 0, januari: 0, feb: 1, februari: 1, mrt: 2, maart: 2, apr: 3, april: 3, mei: 4, jun: 5, juni: 5, jul: 6, juli: 6, aug: 7, augustus: 7, sep: 8, sept: 8, september: 8, okt: 9, oktober: 9, nov: 10, november: 10, dec: 11, december: 11 };
const MT_WEEKDAGEN = { zondag: 0, zo: 0, maandag: 1, ma: 1, dinsdag: 2, di: 2, woensdag: 3, wo: 3, donderdag: 4, do: 4, vrijdag: 5, vr: 5, zaterdag: 6, za: 6 };
const MT_MAAND = '(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|sept|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec)\\.?';
const MT_DAG = '(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\\.?';
const MT_DAG_LANG = '(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)';
// Een tijd: 13:00, 13.00, 13u, 13 uur, 9, half 3, kwart over 2, kwart voor 4
const MT_TIJD = '(?:half\\s+\\d{1,2}|kwart\\s+(?:over|voor)\\s+\\d{1,2}|\\d{1,2}(?:[:.]\\d{2})?(?:\\s*(?:uur|u)(?![a-z]))?)';

const mtWis = (s, i, n) => s.slice(0, i) + ' '.repeat(n) + s.slice(i + n); // gelezen stuk wegpoetsen, posities blijven gelijk

// '13:30' → 810, 'half 3' → 870 (half drie is 14:30), '2' → 840 (zonder minuten en vóór 7 uur: 's middags)
function mtMinuten(t) {
  const s = t.trim();
  let m = s.match(/^half\s+(\d{1,2})/);
  if (m) return mtMiddag(Number(m[1]) - 1, 30, true);
  m = s.match(/^kwart\s+over\s+(\d{1,2})/);
  if (m) return mtMiddag(Number(m[1]), 15, true);
  m = s.match(/^kwart\s+voor\s+(\d{1,2})/);
  if (m) return mtMiddag(Number(m[1]) - 1, 45, true);
  m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]), min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min > 59) return null;
  return mtMiddag(h, min, !m[2] || h < 7);
}
// Werktijden: 1 tot en met 6 uur bedoelt bijna altijd de middag
const mtMiddag = (h, min, magDraaien) => ((magDraaien && h >= 1 && h <= 6 ? h + 12 : h) % 25) * 60 + min;

function mtJaar(dag, maand, jaar, ref) {
  if (jaar) return new Date(jaar < 100 ? 2000 + jaar : jaar, maand, dag);
  let d = new Date(ref.getFullYear(), maand, dag);
  if (d < addDays(startOfDay(ref), -7)) d = new Date(ref.getFullYear() + 1, maand, dag); // in december over januari
  return d;
}

function leesMailTijden(tekst, ref = nu()) {
  const vandaagD = startOfDay(ref);
  const heel = String(tekst || '').toLowerCase().replace(/[–—]/g, '-').replace(/[’`]/g, "'").replace(/ /g, ' ');
  const volgendeWeek = /\b(volgende|komende)\s+week\b/.test(heel);
  const werk = [WORK_START * 60, WORK_END * 60];
  const opties = [];
  const zonderDag = [];
  let laatste = []; // de dagen van de vorige regel, voor een regel met alleen tijden ("of tussen 14 en 17")
  const waarschuwingen = new Map();
  let anker = null; // de laatst genoemde datum: 'woensdag' na 'dinsdag 17 nov' is woensdag 18 nov

  const regels = heel.split(/\n|;|•|(?<=\d)\s*,\s*(?=(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b)/);
  for (const ruw of regels) {
    let r = ` ${ruw.replace(/\s+/g, ' ')} `;
    // Groepen dagen met hun plek in de regel: '9 en 10 november' is één groep. Elk tijdvak hoort bij de groep ervoor.
    const groepen = [];
    const groep = (pos, eind) => { const g = { pos, eind, dagen: [], vakken: [] }; groepen.push(g); return g; };
    const voeg = (g, d, wd) => {
      if (!d || Number.isNaN(d.getTime())) return;
      d = startOfDay(d);
      if (wd != null && d.getDay() !== wd) waarschuwingen.set(ymd(d), `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} is een ${DAYS_LONG[d.getDay()]}, geen ${DAYS_LONG[wd]}`);
      if (!g.dagen.some((x) => sameDay(x, d))) g.dagen.push(d);
    };

    // 1. '9 november', 'ma 9 nov', '9 en 10 november 2026'
    r = r.replace(new RegExp(`(?:\\b${MT_DAG}\\s*,?\\s*)?\\b((?:\\d{1,2}\\s*(?:,|en|of|&|\\/)\\s*)*\\d{1,2})\\s+${MT_MAAND}(?:\\s+(\\d{4}))?(?![a-z])`, 'g'), (stuk, wd, nummers, maand, jaar, pos) => {
      const g = groep(pos, pos + stuk.length);
      const m = MT_MAANDEN[maand];
      nummers.split(/\s*(?:,|en|of|&|\/)\s*/).map(Number).forEach((n, k) => { const d = mtJaar(n, m, jaar && Number(jaar), ref); voeg(g, d, k === 0 && wd ? MT_WEEKDAGEN[wd] : null); anker = startOfDay(d); });
      return ' '.repeat(stuk.length);
    });
    // 2. '9-11', '9/11/2026', 'woensdag 11-11'. Kan het na een weekdag ook een tijdvak zijn ('woensdag 9-12'),
    //    en ligt die datum ver weg of past de weekdag niet, dan is het een tijd.
    r = r.replace(new RegExp(`(?:\\b${MT_DAG}\\s*,?\\s*)?(?<![\\d:.])(\\d{1,2})([-/])(\\d{1,2})(?:[-/](\\d{2,4}))?(?![\\d:.]|\\s*(?:uur|u)(?![a-z]))`, 'g'), (stuk, wd, a, teken, b, j, pos, alles) => {
      const dag = Number(a), maand = Number(b) - 1;
      if (/(tussen|van|vanaf|om|tot)\s*$/.test(alles.slice(Math.max(0, pos - 8), pos)) || maand > 11 || dag > 31 || dag < 1) return stuk;
      const d = mtJaar(dag, maand, j && Number(j), ref);
      const tijdvak = teken === '-' && !j && Number(a) >= 7 && Number(b) > Number(a) && Number(b) <= 20;
      if (wd && tijdvak && (d.getDay() !== MT_WEEKDAGEN[wd] || d - vandaagD > 31 * 864e5)) {
        // De weekdag blijft staan; het getal is een tijdvak (dat leest stap 4 en daarna de tijden)
        return stuk.replace(/\d{1,2}-\d{1,2}$/, (t) => `${t.split('-')[0]}:00-${t.split('-')[1]}:00`);
      }
      const g = groep(pos, pos + stuk.length);
      voeg(g, d, wd ? MT_WEEKDAGEN[wd] : null);
      anker = startOfDay(d);
      return ' '.repeat(stuk.length);
    });
    // 3. vandaag, morgen, overmorgen (niet 's morgens)
    r = r.replace(/(?<!'s\s?)\b(vandaag|overmorgen|morgen)(?=ochtend|middag|\b)/g, (stuk, w, pos) => {
      voeg(groep(pos, pos + stuk.length), addDays(vandaagD, w === 'vandaag' ? 0 : w === 'morgen' ? 1 : 2));
      return ' '.repeat(stuk.length);
    });
    // 4. een weekdag zonder datum: 'dinsdag', 'volgende week dinsdag', 'woensdagmiddag'; 'ma' alleen vooraan
    r = r.replace(new RegExp(`\\b(?:(volgende|komende|aanstaande|deze)\\s+(?:week\\s+)?)?(?:${MT_DAG_LANG}|^\\s*${MT_DAG}(?=\\s|:|$))(?=middag|ochtend|\\b)`, 'g'), (stuk, wanneer, lang, kort, pos) => {
      const wd = MT_WEEKDAGEN[lang || kort];
      let d;
      if (wanneer === 'volgende' || wanneer === 'komende' || (!wanneer && volgendeWeek)) d = addDays(startOfWeek(addDays(vandaagD, 7)), (wd + 6) % 7);
      else if (wanneer === 'deze') d = addDays(startOfWeek(vandaagD), (wd + 6) % 7);
      else { d = new Date(anker && anker > vandaagD ? anker : vandaagD); while (d.getDay() !== wd) d = addDays(d, 1); }
      voeg(groep(pos, pos + stuk.length), d);
      return ' '.repeat(stuk.length);
    });

    // Tijdvakken in wat er over is, elk met zijn plek in de regel
    const vakken = [];
    const vak = (pos, a, b) => { if (a == null) return; if (b != null && b <= a && b + 720 > a && b < 720) b += 720; if (b == null || b > a) vakken.push({ pos, a, b: b == null ? null : Math.min(b, 24 * 60) }); };
    const poets = (re, f) => { r = r.replace(re, (...x) => { const stuk = x[0], pos = x[x.length - 2] + (stuk.length - stuk.trimStart().length); return f(pos, ...x) === false ? stuk : ' '.repeat(stuk.length); }); }; // plek = waar de tijd echt begint
    // 'tussen 13:00 en 16:00', 'van 11 tot 12', '13.00-16.00', '9-12 uur', 'van 11:00 en 12:00' (zo staat het soms in een mail)
    poets(new RegExp(`(tussen|vanaf|van)?\\s*(${MT_TIJD})\\s*(tot en met|t\\/m|tot|en|-)\\s*(${MT_TIJD})`, 'g'), (pos, stuk, woord, t1, sep, t2) => {
      const metMinuten = /[:.]\d{2}|uur|u\b|half|kwart/.test(t1 + t2);
      if (!woord && !metMinuten && sep !== '-') return false; // '2 en 3' zonder meer is geen tijdvak
      vak(pos, mtMinuten(t1), mtMinuten(t2));
    });
    // 'na 14:00', 'vanaf 15 uur', 'voor 11:00', 'tot 12', 'om 10:30' (dan alleen dat moment, met de duur erbij)
    poets(new RegExp(`\\b(na|vanaf|voor|tot|om)\\s+(${MT_TIJD})`, 'g'), (pos, stuk, woord, t) => {
      const m = mtMinuten(t);
      if (m == null) return false;
      if (woord === 'na' || woord === 'vanaf') vak(pos, m, Math.max(werk[1], m + 60));
      else if (woord === 'om') vak(pos, m, null); // eind volgt uit de duur
      else vak(pos, Math.min(werk[0], m - 60), m);
    });
    // Dagdelen
    poets(/\b(ge)?hele\s+dag\b/g, (pos) => vak(pos, werk[0], werk[1]));
    poets(/eind(e)?\s+(van\s+de\s+)?middag/g, (pos) => vak(pos, 15 * 60, 17 * 60));
    poets(/\bna\s+de\s+lunch\b/g, (pos) => vak(pos, 13 * 60, 17 * 60));
    poets(/'s\s?(ochtends|morgens)|ochtend|\bmorgens\b|voormiddag/g, (pos) => vak(pos, 9 * 60, 12 * 60));
    poets(/'s\s?middags|namiddag|middag/g, (pos) => vak(pos, 13 * 60, 17 * 60));

    if (groepen.length) {
      groepen.sort((x, y) => x.pos - y.pos);
      // Een tijdvak hoort bij de groep dagen ervoor; staat het vooraan, dan bij de eerste
      for (const v of vakken) (groepen.filter((g) => g.pos <= v.pos).pop() || groepen[0]).vakken.push(v);
      // 'maandag 9 of dinsdag 10 november tussen 13 en 15': een groep zonder tijden, met alleen 'of' of 'en' tot de volgende, deelt die tijden
      for (let k = groepen.length - 2; k >= 0; k--) {
        const g = groepen[k], volg = groepen[k + 1];
        if (!g.vakken.length && volg.vakken.length && /^[\s,]*(of|en|&|\/)?[\s,]*$/.test(` ${ruw.replace(/\s+/g, ' ')} `.slice(g.eind, volg.pos))) g.vakken = volg.vakken;
      }
      laatste = groepen.flatMap((g) => g.dagen);
      for (const g of groepen) {
        const lijst = g.vakken.length ? g.vakken : [{ a: werk[0], b: werk[1], heleDag: true }];
        for (const d of g.dagen) for (const v of lijst) opties.push({ dag: d, van: v.a, tot: v.b, heleDag: !!v.heleDag });
      }
    } else if (vakken.length) {
      if (!laatste.length) { zonderDag.push(ruw.trim()); continue; }
      // Een regel met alleen tijden hoort bij de dagen erboven; stond daar nog 'de hele dag', dan vervangen
      for (const d of laatste) {
        for (let k = opties.length - 1; k >= 0; k--) if (opties[k].heleDag && sameDay(opties[k].dag, d)) opties.splice(k, 1);
        for (const v of vakken) opties.push({ dag: d, van: v.a, tot: v.b, heleDag: false });
      }
    }
  }

  // Duur: 'uurtje', 'half uur', 'anderhalf uur', '45 minuten', '2 uur' (maar niet 'om 2 uur')
  let duur = null;
  const dm = [
    [/\banderhalf\s*uur|\banderhalve\s+uur/, () => 90],
    [/\bhalf\s*uur(tje)?\b|\bhalfuur(tje)?\b/, () => 30],
    [/\bkwartier(tje)?\b/, () => 15],
    [/\b(\d{2,3})\s*(minuten|min)\b/, (m) => Number(m[1])],
    [/(?:^|[^\w:.])(een|1|twee|2|drie|3)\s+uur(tje)?\b/, (m, stuk, pos) => (/(om|tot|van|tussen|vanaf|na|voor|en|-)\s*$/.test(heel.slice(Math.max(0, pos - 9), pos + 1)) ? null : ({ een: 1, 1: 1, twee: 2, 2: 2, drie: 3, 3: 3 }[m[1]] * 60))],
    [/\buurtje\b/, () => 60],
  ];
  for (const [re, f] of dm) {
    const m = heel.match(re);
    if (m) { const w = f(m, m[0], m.index); if (w) { duur = w; break; } }
  }
  const online = /\b(online|teams|videobellen|videogesprek|videocall|digitaal|op afstand)\b/.test(heel);
  const eind = duur || 60;
  const uit = opties
    .map((o) => ({ ...o, tot: o.tot == null ? o.van + eind : o.tot, waarschuwing: waarschuwingen.get(ymd(o.dag)) || '' }))
    .filter((o, i, l) => l.findIndex((x) => sameDay(x.dag, o.dag) && x.van === o.van && x.tot === o.tot) === i)
    .sort((a, b) => a.dag - b.dag || a.van - b.van);
  return { opties: uit, duur, online, zonderDag };
}
