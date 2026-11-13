// Meting: tijden uit een mail
// Acht teksten (meerdere dagen, een tijd die voorbij is, een verkeerde weekdag, een regel zonder dag, geen tijden, hele
// dag), en per tekst typen, plakken, in- en uitklappen, duur, tijden kiezen, kopiëren (ook mislukt) en inplannen. Na
// elke handeling de HTML, het tekstveld, de focus en wat er naar het klembord, de statusregel en Nieuwe afspraak ging.
// Alle namen, adressen en sleutels hierin zijn verzonnen. inPagina draait in de browser, binnen de app.

export const titel = 'Tijden uit een mail';
export const samenvatting = (u) => `${u.res.length} teksten, ${u.res.reduce((t, x) => t + x.log.length, 0)} stappen`;

export async function inPagina() {
  const slaap = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const plat = (h) => h.replace(/\s+/g, ' ');
  const klembord = [], meldingen = [], gepland = [];
  let faal = false;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { if (faal) throw new Error('nee'); klembord.push(t); } } });
  window.toonStatus = (...a) => meldingen.push(JSON.stringify(a));
  window.openNieuw = (o) => gepland.push(JSON.stringify(o));

  // De twee drukste dagen na vandaag, zodat de tijdvakken afspraken raken
  const dagNaam = (d) => `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
  const per = new Map();
  [...zichtbaar.values()].filter((e) => !e.allDay && e.start > addDays(vandaag(), 1)).forEach((e) => { const k = ymd(e.start); per.set(k, (per.get(k) || 0) + 1); });
  const [d1, d2] = [...per].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => parseYmd(k)).sort((a, b) => a - b);
  const eerste = [...zichtbaar.values()].filter((e) => !e.allDay && sameDay(e.start, d1)).sort((a, b) => a.start - b.start)[0];
  const teksten = [
    ['twee dagen', `Hoi,\nKun je ${dagNaam(d1)} tussen 9:00 en 17:00, of ${dagNaam(d2)} tussen 13:00 en 16:00?\nGroet`],
    ['half uur via Teams', `${dagNaam(d1)} tussen 9:00 en 12:00 of om ${hhmm(eerste.start)}. Een half uur is genoeg, via Teams.`],
    ['om één tijd', `${dagNaam(d2)} om 10:30`],
    ['vandaag, deels voorbij', 'Vandaag tussen 7:00 en 8:00, vandaag tussen 8:00 en 11:00 of morgen na 14:00'],
    ['verkeerde weekdag', 'maandag 10 november tussen 9 en 12'],
    ['regel zonder dag', `tussen 13:00 en 14:00\n${dagNaam(d1)} 's ochtends`],
    ['geen tijden', 'Hallo, hoe gaat het met je?'],
    ['hele dag en lange tekst', `${dagNaam(d2)} de hele dag\n${'Een lange regel tekst om het veld te laten groeien. '.repeat(12)}\nvolgende week dinsdag tussen 1 en 4`],
  ];
  const res = [];
  for (const [titel, tekst] of teksten) {
    const log = [];
    openMailTijden();
    const el = [...document.querySelectorAll('.paneel.mailtijden')].pop();
    const q = (s) => el.querySelector(s);
    const veld = q('#mtekst');
    const snap = async (stap, ms = 150) => {
      await slaap(ms);
      const a = document.activeElement;
      log.push({ stap, html: plat(el.innerHTML), veld: `${veld.value.length}|${veld.className}|${veld.style.height}`, onthouden: MAILTEKST.length, focus: a ? (a.id || a.name || a.tagName) : '',
        open: el.classList.contains('open'), klembord: klembord.length, meldingen: meldingen.length, gepland: gepland.length });
    };
    const klikOp = async (s, stap, n = 0) => { const k = el.querySelectorAll(s)[n]; if (!k || k.disabled || k.hidden) { log.push({ stap: `${stap}: niet mogelijk` }); return false; } k.click(); await snap(stap); return true; };
    const typ = async (waarde, soort, stap) => { veld.focus(); veld.value = waarde; veld.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: soort })); await snap(stap, 450); };
    await snap('open (met de vorige tekst)', 450);
    await klikOp('#mtoon', 'hele tekst tonen');
    await typ('', 'deleteContentBackward', 'leeg gemaakt');
    await typ(tekst.slice(0, 12), 'insertText', 'eerste letters getypt');
    await typ(tekst, 'insertFromPaste', 'geplakt');
    veld.blur(); await snap('veld verlaten');
    veld.focus(); await snap('in het veld getikt');
    for (const s of ['15', '15', '-15', '-15', '-15']) await klikOp(`[data-stap="${s}"]`, `duur ${s}`);
    for (const soort of ['vrij', 'botst', 'vol']) await klikOp(`.chip.${soort}`, `kies een tijd: ${soort}`);
    await klikOp('.chip', 'laatste tijd', el.querySelectorAll('.chip').length - 1);
    await klikOp('[data-stap="15"]', 'duur langer met gekozen tijden'); await klikOp('[data-stap="15"]', 'nog langer');
    await klikOp('#mkopieer', 'kopieer');
    faal = true; await klikOp('#mkopieer', 'kopieer mislukt'); faal = false;
    await klikOp('#minplannen', 'inplannen met meer dan één tijd');
    // Alles uit, dan één tijd in een vrij blok, en inplannen
    let n = 0; while (q('.chip.aan') && n++ < 12) { q('.chip.aan').click(); await slaap(120); }
    await snap('alles uit');
    await klikOp('#mkopieer', 'kopieer zonder tijd');
    const keus = q('.chip.vrij') ? '.chip.vrij' : '.chip';
    if (await klikOp(keus, 'één tijd')) { await klikOp('#mkopieer', 'kopieer één tijd'); await klikOp('#minplannen', 'inplannen'); await snap('na inplannen', 500); }
    if (el.classList.contains('open')) {
      // Nog een keer, nu met een tijd die overlapt (als die er is)
      if (await klikOp('.chip.botst, .chip.vol', 'tijd met overlap')) { await klikOp('#minplannen', 'inplannen met overlap'); await snap('na inplannen met overlap', 500); }
    }
    if (el.classList.contains('open')) { q('[data-actie="sluit"]').click(); await snap('gesloten', 100); }
    res.push({ titel, klasse: el.className, log });
  }
  return { res, klembord, meldingen, gepland };
}
