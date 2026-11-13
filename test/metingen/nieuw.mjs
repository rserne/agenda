// Meting: nieuwe afspraak
// Zeven beginsituaties (plusknop, een dag, een vrij blok, een tijd die botst, een zaterdag), en per situatie een vaste
// reeks handelingen: duur, begintijden, andere tijd, dag wisselen, invullen, suggesties voor deelnemers en locatie,
// Google-plaatsen met en zonder fout, .ics en Outlook. Na elke handeling de HTML, de velden, de Outlook-link en de focus.
// Alle namen, adressen en sleutels hierin zijn verzonnen. inPagina draait in de browser, binnen de app.

export const titel = 'Nieuwe afspraak';
export const samenvatting = (u) => `${u.res.length} situaties, ${u.res.reduce((t, x) => t + x.log.length, 0)} stappen`;

export async function inPagina() {
  const slaap = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const plat = (h) => h.replace(/\s+/g, ' ');
  // Verzonnen contacten, ruimtes en een nep-Google
  CONTACTEN = [['Persoon Een', 'persoon.een@voorbeeld-a.example'], ['Petra Twee', 'petra@voorbeeld-a.example'], ['Jan Drie', 'jan.drie@voorbeeld-b.example'], ['', 'peter@voorbeeld-b.example']].map(([n, e], i) => ({ naam: n, email: e, gewicht: 10 - i }));
  LS.set('ag_ruimtes2', [{ naam: 'Zaal Een', email: 'zaal.een@voorbeeld-a.example' }, { naam: 'Zaal Twee', email: '' }, { naam: 'Stationskamer', email: 'kamer@voorbeeld-a.example' }]);
  let google = 'goed'; const sessies = [];
  window.zoekPlaatsen = async (vraag, sessie) => {
    sessies.push(sessie);
    if (google !== 'goed') throw { status: Number(google) };
    return [{ naam: `${vraag} Plein`, sub: 'Plaats', tekst: `${vraag} Plein, Plaats` }, { naam: `${vraag}sweg 1`, sub: '', tekst: '' }];
  };
  const ics = [];
  window.downloadIcs = (v) => ics.push(JSON.stringify(v));
  let klik = null;
  document.addEventListener('click', (ev) => { if (ev.target.closest && ev.target.closest('#noutlook')) { klik = ev.defaultPrevented; ev.preventDefault(); } });

  // Beginsituaties: een dag met afspraken, een vrij blok daarop, en een tijd die botst
  const druk = [...zichtbaar.values()].filter((e) => !e.allDay).sort((a, b) => a.start - b.start);
  const dag = startOfDay(druk[Math.floor(druk.length / 2)].start);
  const opDag = druk.filter((e) => sameDay(e.start, dag));
  const vrij = freeSlots(afsprakenTussen(dag, addDays(dag, 1)), dag).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  const blok = { start: vrij.start.getTime(), end: vrij.end.getTime() };
  const zaterdag = addDays(dag, (6 - dag.getDay() + 7) % 7);
  const situaties = [
    ['standaard', {}],
    ['dag', { dag }],
    ['blok', { blok }],
    ['blok met tijd', { blok, start: blok.start + 30 * 6e4, duur: 45, locatie: 'Zaal Een' }],
    ['dag met botsende tijd', { dag, start: opDag[0].start.getTime() + 15 * 6e4, duur: 30 }],
    ['dag met vrije tijd', { dag, start: blok.start, duur: 30, locatie: 'Ergens' }],
    ['zaterdag', { dag: zaterdag, duur: 90 }],
  ];
  const res = [];
  for (const [titel, opties] of situaties) {
    const log = [];
    await openNieuw(opties);
    const el = [...document.querySelectorAll('.paneel.nieuw')].pop();
    const q = (s) => el.querySelector(s);
    const snap = async (stap, ms = 60) => {
      await slaap(ms);
      const a = document.activeElement;
      log.push({ stap, html: plat(el.innerHTML), velden: [...el.querySelectorAll('input,textarea')].map((i) => `${i.name || i.id}=${i.value}`).join(' | '),
        href: q('#noutlook').getAttribute('href'), focus: a ? (a.name || a.id || a.tagName) : '', open: el.classList.contains('open'), ics: ics.length, sessies: new Set(sessies).size, klik });
    };
    const klikOp = async (s, stap, n = 0) => { const k = el.querySelectorAll(s)[n]; if (!k || k.disabled) { log.push({ stap: `${stap}: niet mogelijk` }); return false; } k.click(); await snap(stap); return true; };
    const typ = async (veld, waarde, stap, ms) => { veld.focus(); veld.value = waarde; veld.dispatchEvent(new Event('input', { bubbles: true })); await snap(stap, ms); };
    const toets = async (veld, key, stap) => { veld.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); await snap(stap); };
    await snap('open', 200);
    // Duur
    for (const s of ['15', '15', '15', '-15']) await klikOp(`[data-stap="${s}"]`, `duur ${s}`);
    // Begintijden
    await klikOp('[data-start]', 'tweede begintijd', 1);
    await klikOp('[data-start]', 'laatste begintijd', el.querySelectorAll('[data-start]').length - 1);
    // De balk en de lijst eronder
    await klikOp('#ntijdlijn', 'balk open');
    await toets(q('#ntijdlijn'), 'Enter', 'balk dicht met Enter');
    await toets(q('#ntijdlijn'), ' ', 'balk open met spatie');
    // Andere tijd
    if (await klikOp('[data-actie="eigen"]', 'andere tijd aan')) {
      const i = q('#neigen'); if (i) { i.value = '13:15'; i.dispatchEvent(new Event('input', { bubbles: true })); await snap('andere tijd 13:15'); }
      await klikOp('[data-dag="1"]', 'dag later met andere tijd');
      await klikOp('[data-stap="15"]', 'duur langer met andere tijd');
      await klikOp('[data-actie="eigen"]', 'andere tijd uit');
    }
    // Dag
    await klikOp('[data-dag="-1"]', 'dag eerder'); await klikOp('[data-dag="-1"]', 'nog een dag eerder');
    const di = q('#ndatuminvoer');
    if (di) { const d = addDays(dag, 2); di.value = ymd(d); di.dispatchEvent(new Event('change', { bubbles: true })); await snap('datum gekozen', 150); }
    // Zo lang dat er geen vrij blok meer is
    // Eerst net zo lang dat deze dag niet meer past (dan is er een knop naar de volgende dag met ruimte)
    let n = 0; while (!q('.ngeen') && q('[data-stap="15"]') && !q('[data-stap="15"]').disabled && n++ < 40) { q('[data-stap="15"]').click(); await slaap(120); }
    await snap('past niet meer op deze dag', 300);
    await klikOp('[data-naar]', 'naar de volgende dag met ruimte');
    n = 0; while (q('[data-stap="15"]') && !q('[data-stap="15"]').disabled && n++ < 40) q('[data-stap="15"]').click();
    await snap('langste duur', 300);
    await klikOp('#noutlook', 'Outlook zonder of met begintijd');
    n = 0; while (q('[data-stap="-15"]') && !q('[data-stap="-15"]').disabled && n++ < 40) q('[data-stap="-15"]').click();
    await snap('kortste duur', 300);
    for (let i = 0; i < 3; i++) q('[data-stap="15"]').click();
    await snap('een uur', 300);
    // Velden
    await typ(q('[name="titel"]'), 'Overleg & <test>', 'onderwerp');
    await typ(q('[name="notitie"]'), 'Regel 1\nRegel 2; met, tekens', 'notitie');
    // Deelnemers: suggesties
    const dv = q('[name="deelnemers"]');
    await typ(dv, 'pe', 'deelnemers: pe');
    await toets(dv, 'ArrowDown', 'pijl omlaag'); await toets(dv, 'ArrowDown', 'pijl omlaag 2'); await toets(dv, 'ArrowUp', 'pijl omhoog');
    await toets(dv, 'Enter', 'Enter kiest');
    await typ(dv, `${dv.value}ja`, 'tweede deelnemer: ja');
    await klikOp('#naanvul [data-aanvul]', 'klik op suggestie');
    await typ(dv, `${dv.value}pet`, 'derde: pet'); await toets(dv, 'Escape', 'Escape sluit de lijst');
    await typ(dv, `${dv.value.replace(/pet$/, '')}zzz`, 'geen suggesties');
    await toets(dv, 'Tab', 'Tab zonder lijst');
    await typ(dv, 'los@voorbeeld-c.example, pe', 'komma en pe');
    dv.blur(); await snap('deelnemers verlaten', 250);
    // Locatie: ruimtes
    const lv = q('[name="locatie"]');
    lv.focus(); await snap('locatie: tik in het veld', 100);
    await typ(lv, 'za', 'locatie: za');
    await toets(lv, 'ArrowDown', 'locatie pijl omlaag'); await toets(lv, 'Enter', 'locatie Enter');
    if (!el.querySelector('#nlocaties').hidden) await klikOp('#nlocaties [data-aanvul]', 'klik op ruimte');
    await typ(lv, 'Zaal Een ', 'spatie achter de ruimte'); await typ(lv, 'Zaal Eenx', 'iets anders getypt');
    // Locatie: Google
    LS.set('ag_google', 'nep');
    await typ(lv, 'st', 'google: twee letters'); await typ(lv, 'sta', 'google: sta, meteen'); await snap('google: sta, later', 450);
    await typ(lv, 'stat', 'google: stat, meteen (vorige plaatsen blijven)'); await snap('google: stat, later', 450);
    await klikOp('#nlocaties [data-aanvul]', 'klik op plaats', el.querySelectorAll('#nlocaties [data-aanvul]').length - 2);
    await typ(lv, 'stati', 'google: nieuwe sessie', 450);
    await klikOp('#nlocaties [data-aanvul]', 'klik op plaats zonder tekst', el.querySelectorAll('#nlocaties [data-aanvul]').length - 1);
    for (const fout of ['403', '429', '500']) { google = fout; await typ(lv, `plein${fout}`, `google fout ${fout}`, 450); }
    google = 'goed'; await typ(lv, 'zaal', 'google goed na fout', 450);
    await typ(lv, '', 'locatie leeg');
    lv.blur(); await snap('locatie verlaten', 250);
    LS.del('ag_google');
    // Afmaken
    await klikOp('#nics', '.ics');
    await klikOp('#noutlook', 'Outlook'); await snap('na Outlook', 600);
    if (el.classList.contains('open')) { q('[data-actie="sluit"]').click(); await snap('gesloten', 100); }
    res.push({ titel, klasse: el.className, log });
  }
  return { res, ics };
}
