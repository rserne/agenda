// Tests van de app in een echte browser (Chromium via Playwright), met een vaste klok en de voorbeeldgegevens.
// Gebruik: npm test   (of: node test/app.test.mjs)
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
import ICAL from 'ical.js';
import { maakOmzetter } from '../js/ical.js';
import { startServer, laadPlaywright, nieuwePagina, wacht, TELEFOON, MAC, MAP } from './hulp.mjs';

const ICS = path.join(MAP, 'test', 'voorbeeld.ics');
const LINK = 'https://agenda.voorbeeld.workers.dev/?sleutel=test';
const tests = [];
const test = (naam, fn) => tests.push({ naam, fn });

// Vingerbeweging op een telefoon (touch), van y1 naar y2
async function veeg(p, x, y1, y2, stappen = 14) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y1 }] });
  for (let i = 1; i <= stappen; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y1 + ((y2 - y1) * i) / stappen }] }); await wacht(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wacht(700);
}
const kopTop = (p, dag) => p.evaluate((dag) => {
  const k = [...document.querySelectorAll('#inhoud .dagkop')].find((x) => x.textContent.includes(dag));
  return k ? Math.round(k.nextElementSibling.getBoundingClientRect().top - k.offsetHeight) : null;
}, dag);
// De plusknop opent een keuze: nieuwe afspraak of tijden uit een mail
async function kies(p, keuze, klik = false) {
  const plus = p.locator('[data-nieuw]:visible').first();
  if (klik) await plus.click(); else await plus.tap();
  await wacht(300);
  const k = p.locator(`.keuzemenu [data-keuze="${keuze}"]`);
  if (klik) await k.click(); else await k.tap();
  await wacht(900);
}
const kopHoogte = (p) => p.evaluate(() => document.getElementById('kop').offsetHeight);

/* -------------------------------------------------------------- inlezen */

test('ics: de voorbeeldagenda geeft in week 45 de verwachte afspraken', async () => {
  const { afsprakenUitIcal } = maakOmzetter(ICAL);
  const ev = afsprakenUitIcal(fs.readFileSync(ICS, 'utf8'), new Date('2026-11-01T00:00:00Z'), new Date('2026-11-09T00:00:00Z'));
  assert.equal(ev.length, 27);
  assert.ok(ev.some((e) => e.canceled), 'een afgezegde afspraak');
  assert.ok(ev.some((e) => e.recurring && e.detached), 'een verplaatste keer uit een reeks');
});

/* -------------------------------------------------------------- telefoon */

test('telefoon: opstarten toont week 45 met afspraken, zonder fouten', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  assert.equal(await p.locator('#titel').innerText(), 'Week 45');
  assert.ok((await p.locator('#inhoud [data-id]').count()) > 3);
  assert.deepEqual(p.fouten, []);
});

test('telefoon: vandaag staat bovenaan, ook na wisselen van filter', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1200);
  const kop = await kopHoogte(p);
  assert.equal(await kopTop(p, 'Woensdag'), kop, 'woensdag direct onder de kop');
  for (const f of ['Alles', 'Vrij', 'Opvallend']) {
    await p.locator('[data-filter]:visible', { hasText: f }).first().tap(); await wacht(400);
    assert.equal(await kopTop(p, 'Woensdag'), kop, `na ${f}`);
  }
});

test('telefoon: onderaan doortrekken gaat naar de volgende week', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1200);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wacht(300);
  await veeg(p, 200, 600, 530);
  assert.equal(await p.locator('#titel').innerText(), 'Week 45', 'een korte trek blijft');
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wacht(300);
  await veeg(p, 200, 650, 300);
  assert.equal(await p.locator('#titel').innerText(), 'Week 46', 'een lange trek gaat door');
});

test('telefoon: detail opent, en omlaag vegen midden op het paneel sluit het', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.locator('#inhoud [data-id]').first().tap(); await wacht(800);
  assert.equal(await p.locator('.paneel.detail.open').count(), 1);
  const r = await p.locator('.paneel.detail').boundingBox();
  await veeg(p, 40, r.y + 120, r.y + 380);
  assert.equal(await p.locator('.paneel.detail').count(), 0);
});

test('telefoon: omlaag vegen op de achtergrond boven het paneel sluit het ook', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.locator('#inhoud [data-id]').first().tap(); await wacht(800);
  const r = await p.locator('.paneel.detail').boundingBox();
  assert.ok(r.y > 60, `ruimte boven het paneel: ${r.y}`);
  const y = Math.round(r.y / 2);
  await veeg(p, 200, y, y + 30); // korte trek: blijft open
  assert.equal(await p.locator('.paneel.detail.open').count(), 1);
  await veeg(p, 200, y, y + 300);
  assert.equal(await p.locator('.paneel').count(), 0);
});

test('telefoon: omhoog trekken aan een paneel rekt een stukje mee en veert terug', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.click('#titelknop'); await wacht(800);
  const r = await p.locator('.paneel.kiezer').boundingBox();
  const cdp = await p.context().newCDPSession(p);
  const y1 = r.y + 40;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: y1 }] });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: y1 - i * 20 }] }); await wacht(16); }
  const omhoog = await p.evaluate(() => document.querySelector('.paneel.kiezer').getBoundingClientRect().y);
  assert.ok(r.y - omhoog > 8 && r.y - omhoog <= 28, `rekt ${Math.round(r.y - omhoog)} px mee`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wacht(600);
  assert.equal(Math.round((await p.locator('.paneel.kiezer').boundingBox()).y), Math.round(r.y), 'veert terug');
  assert.equal(await p.locator('.paneel.kiezer.open').count(), 1, 'blijft open');
});

test('telefoon: in de weekkiezer een week kiezen', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.click('#titelknop'); await wacht(800);
  await p.locator('.paneel .weekrij', { hasText: '47' }).first().tap(); await wacht(800);
  assert.equal(await p.locator('#titel').innerText(), 'Week 47');
});

test('telefoon: nieuwe afspraak opent de Outlook-app met tijd, deelnemers en notitie', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await kies(p, 'nieuw');
  await p.locator('.paneel .chip').first().tap(); await wacht(300);
  await p.fill('.paneel [name="deelnemers"]', 'een@voorbeeld.nl; twee@voorbeeld.nl');
  await p.fill('.paneel [name="notitie"]', 'Eerste regel\nTweede regel'); await wacht(200);
  const knop = p.locator('#noutlook');
  assert.equal((await knop.innerText()).trim(), 'Afmaken in Outlook');
  const href = await knop.getAttribute('href');
  assert.match(href, /^ms-outlook:\/\/events\/new\?.*start=\d{4}-\d\d-\d\dT\d\d:\d\d:00&end=/);
  assert.match(href, /attendees=een%40voorbeeld\.nl,twee%40voorbeeld\.nl/);
  assert.match(href, /description=Eerste%20regel%0ATweede%20regel/);
  assert.equal(await knop.getAttribute('target'), null);
  await p.evaluate(() => document.getElementById('noutlook').addEventListener('click', (e) => e.preventDefault())); // niet echt naar Outlook
  await knop.tap(); await wacht(900);
  assert.equal(await p.locator('.paneel').count(), 0, 'het paneel gaat dicht als Outlook het overneemt');
});

test('telefoon: Openen in Outlook gaat naar de dag van de afspraak in de app', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.locator('#inhoud [data-id]').first().tap(); await wacht(800);
  assert.match(await p.locator('.paneel a', { hasText: 'Openen in Outlook' }).getAttribute('href'), /^ms-outlook:\/\/events\?date=2026-11-0\d$/);
});

/* -------------------------------------------------------------- eigen agenda */

test('bestand: een .ics inladen, en na herstarten staat de agenda er meteen weer', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(800);
  await p.setInputFiles('#icsinvoer', ICS); await wacht(2500);
  assert.ok((await p.locator('#inhoud [data-id]').count()) > 3);
  assert.equal(await p.evaluate(() => !!window.ICAL), false, 'het inlezen gebeurt in de Web Worker, niet in de app');
  await wacht(1000); // bewaren van de uitgerolde weken
  const t0 = Date.now();
  await p.reload(); await p.waitForSelector('#inhoud [data-id]', { timeout: 5000 });
  assert.ok(Date.now() - t0 < 2500, `te traag: ${Date.now() - t0} ms`);
  assert.deepEqual(p.fouten, []);
});

test('agenda-link: ophalen op de achtergrond, en een duidelijke melding bij een verkeerde sleutel', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  let sleutelGoed = true;
  await p.context().route('https://agenda.voorbeeld.workers.dev/**', async (r) => {
    await wacht(1500); // Outlook is traag
    if (!sleutelGoed) return r.fulfill({ status: 403, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Geen toegang' });
    r.fulfill({ status: 200, contentType: 'text/calendar', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(ICS, 'utf8') });
  });
  await p.goto(url); await wacht(800);
  await p.click('#titelknop'); await wacht(700);
  await p.locator('.paneel [data-actie="instellingen"]').tap(); await wacht(900);
  await p.locator('.paneel [data-actie="ics-kies"]').tap(); await wacht(800);
  await p.locator('[data-bron="link"]').tap(); await wacht(800);
  await p.fill('#linkinvoer', 'webcal://outlook.office365.com/owa/calendar/x/y/calendar.ics');
  await p.locator('#linkknop').tap(); await wacht(300);
  assert.match(await p.locator('#linkfout').innerText(), /Cloudflare Worker/);
  await p.fill('#linkinvoer', LINK);
  await p.locator('#linkknop').tap(); await wacht(400);
  assert.equal(await p.locator('.paneel').count(), 0, 'het paneel gaat meteen dicht');
  assert.match(await p.locator('#statustekst').innerText(), /ophalen/i);
  await wacht(5000);
  assert.equal(await p.locator('#statustekst').innerText(), 'Je agenda is ingeladen.');
  sleutelGoed = false;
  await p.evaluate((l) => gebruikLink(l), LINK); await wacht(2200);
  assert.equal(await p.locator('#statustekst').innerText(), 'Geen toegang. Klopt de sleutel in de link?');
  assert.deepEqual(p.fouten, []);
});

test('bestand: zonder Web Worker leest de app het bestand zelf in', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.context().addInitScript(() => { window.Worker = function () { throw new Error('geen worker'); }; });
  await p.goto(url); await wacht(800);
  await p.setInputFiles('#icsinvoer', ICS); await wacht(3000);
  assert.ok((await p.locator('#inhoud [data-id]').count()) > 3);
  assert.equal(await p.evaluate(() => !!window.ICAL), true);
  assert.deepEqual(p.fouten, []);
});

/* -------------------------------------------------------------- contacten */

const CONTACTEN_CSV = path.join(MAP, 'test', 'contacten.csv');

test('contacten: NK2Edit, csv met kopregel en vCard worden gelezen', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(800);
  const uit = await p.evaluate((nk2) => ({
    nk2: leesContacten(nk2),
    csv: leesContacten('Voornaam;Tussenvoegsel;Achternaam;E-mailadres\nAnna;van;Peeters;anna@x.example\n;;;los@x.example\n'),
    vcf: leesContacten('BEGIN:VCARD\r\nVERSION:3.0\r\nN:Bos;Piet;;;\r\nFN:Piet Bos\r\nitem1.EMAIL;type=INTERNET:piet@x.example\r\nEMAIL;type=WORK:p.bos@werk.ex\r\n ample\r\nEND:VCARD\r\n'),
  }), fs.readFileSync(CONTACTEN_CSV, 'utf8'));
  assert.deepEqual(uit.nk2.map((c) => c.naam), ['Marieke de Vries', '', 'Jan Jansen', 'Kees Bakker', 'José Álvarez', 'Jannie Smit'], 'zwaarste eerst, dubbele weg, achternaam-komma omgedraaid');
  assert.equal(uit.nk2[0].email, 'marieke.de.vries@voorbeeld.nl');
  assert.deepEqual(uit.csv, [{ naam: 'Anna van Peeters', email: 'anna@x.example', gewicht: 0 }, { naam: '', email: 'los@x.example', gewicht: 0 }]);
  assert.deepEqual(uit.vcf.map((c) => `${c.naam} ${c.email}`), ['Piet Bos piet@x.example', 'Piet Bos p.bos@werk.example']);
});

test('contacten: inladen, en bij een nieuwe afspraak namen aanvullen tot adressen', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(800);
  await p.setInputFiles('#contactinvoer', CONTACTEN_CSV); await wacht(600);
  assert.equal(await p.locator('#statustekst').innerText(), '6 contacten ingeladen.');
  await p.reload(); await wacht(1000); // blijft bewaard op het toestel
  await kies(p, 'nieuw');
  await p.locator('.paneel .chip').first().tap(); await wacht(300);
  const veld = p.locator('.paneel [name="deelnemers"]');
  assert.equal(await veld.getAttribute('placeholder'), 'Naam of e-mailadres');
  await veld.focus();
  await veld.type('jan', { delay: 20 }); await wacht(200);
  assert.deepEqual(await p.locator('.aanvuloptie .t1').allInnerTexts(), ['Jan Jansen', 'Jannie Smit']);
  await p.locator('.aanvuloptie').first().tap(); await wacht(200);
  assert.equal(await veld.inputValue(), 'jan.jansen@voorbeeld.nl; ');
  assert.equal(await p.locator('#naanvul').isHidden(), true);
  await veld.type('jose', { delay: 20 }); await wacht(200); // zonder accent vindt hij José
  await p.locator('.aanvuloptie').first().tap(); await wacht(200);
  await veld.type('jan', { delay: 20 }); await wacht(200);
  assert.deepEqual(await p.locator('.aanvuloptie .t1').allInnerTexts(), ['Jannie Smit'], 'wie er al in staat, komt niet nog eens');
  assert.match(await p.locator('#noutlook').getAttribute('href'), /attendees=jan\.jansen%40voorbeeld\.nl,jose%40partner\.example(&|$)/);
  assert.deepEqual(p.fouten, []);
});

test('contacten: wissen, en zonder contacten geen suggesties', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(800);
  await p.setInputFiles('#contactinvoer', CONTACTEN_CSV); await wacht(600);
  p.on('dialog', (d) => d.accept());
  await p.click('#titelknop'); await wacht(800);
  await p.locator('.paneel [data-actie="instellingen"]').tap(); await wacht(900);
  assert.match(await p.locator('#icontacten').innerText(), /6 contacten/);
  await p.locator('.paneel [data-actie="contacten-wis"]').tap(); await wacht(600);
  assert.match(await p.locator('#icontacten').innerText(), /Geen contacten/);
  await p.keyboard.press('Escape'); await wacht(500);
  await kies(p, 'nieuw');
  await p.locator('.paneel [name="deelnemers"]').type('jan', { delay: 20 }); await wacht(200);
  assert.equal(await p.locator('.aanvuloptie').count(), 0);
});

test('instellingen: de weekkiezer past op een kleine iPhone, en Instellingen scrolt tot onderaan', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, { ...TELEFOON, viewport: { width: 375, height: 667 } });
  await p.goto(url); await wacht(800);
  await p.click('#titelknop'); await wacht(800);
  assert.equal(await p.locator('.paneel.kiezer').evaluate((e) => e.scrollHeight <= e.clientHeight + 1), true, 'de weekkiezer hoeft niet te scrollen');
  assert.equal(await p.locator('.paneel .instrij .t2').innerText(), 'Voorbeeldgegevens');
  await p.locator('.paneel [data-actie="instellingen"]').tap(); await wacht(900);
  await p.locator('.paneel.instellingen .detailinhoud').evaluate((e) => { e.scrollTop = 1e5; }); await wacht(200);
  const v = await p.locator('.paneel.instellingen .voetnoot').boundingBox();
  assert.ok(v.y + v.height <= 667 - 16, `voetnoot eindigt op ${Math.round(v.y + v.height)} van 667`);
});

test('telefoon: alle invoervelden hebben minstens 16 punten, anders zoomt iOS in', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(800);
  const klein = () => p.evaluate(() => [...document.querySelectorAll('input:not([type=file]), textarea, select')]
    .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id || e.name || e.className));
  await p.click('#titelknop'); await wacht(700);
  await p.locator('.paneel [data-actie="instellingen"]').tap(); await wacht(900);
  await p.locator('[data-actie="ruimte-erbij"]').tap(); await wacht(200);
  assert.deepEqual(await klein(), [], 'instellingen');
  await p.locator('[data-actie="ics-kies"]').tap(); await wacht(800);
  await p.locator('[data-bron="link"]').tap(); await wacht(800);
  assert.deepEqual(await klein(), [], 'agenda-link');
  await p.keyboard.press('Escape'); await wacht(500);
  await kies(p, 'nieuw');
  await p.locator('[data-actie="eigen"]').tap(); await wacht(300);
  assert.deepEqual(await klein(), [], 'nieuwe afspraak');
});

/* -------------------------------------------------------------- ruimtes en plaatsen */

const ANTWOORD_GOOGLE = { suggestions: [
  { placePrediction: { text: { text: 'Damrak 1, Amsterdam, Nederland' }, structuredFormat: { mainText: { text: 'Damrak 1' }, secondaryText: { text: 'Amsterdam, Nederland' } } } },
] };

test('ruimtes: opgeven in Instellingen, bij Locatie kiezen, en de ruimte gaat mee als deelnemer', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(800);
  await p.click('#titelknop'); await wacht(700);
  await p.locator('.paneel [data-actie="instellingen"]').tap(); await wacht(900);
  for (const [naam, email] of [['Zonnezaal', 'zonnezaal@voorbeeld.nl'], ['Coupé', 'coupe@voorbeeld.nl'], ['Groot Overleg', 'grootoverleg@voorbeeld.nl'], ['Weg', ''], ['Kelder', 'kelder@']]) {
    await p.locator('[data-actie="ruimte-erbij"]').tap(); await wacht(150);
    await p.keyboard.type(naam); // de naam van de nieuwe ruimte heeft meteen de focus
    if (email) await p.locator('.ruimterij').last().locator('.rmail').fill(email);
  }
  assert.equal(await p.locator('.ruimterij').last().locator('.rmail.ongeldig').count(), 1, 'een onvolledig adres valt op');
  await p.locator('.ruimterij').nth(3).locator('[data-actie="ruimte-weg"]').tap(); await wacht(150);
  assert.deepEqual(await p.locator('.ruimterij .rnaam').evaluateAll((l) => l.map((i) => i.value)), ['Zonnezaal', 'Coupé', 'Groot Overleg', 'Kelder']);
  await p.reload(); await wacht(1000); // bewaard op het toestel
  await kies(p, 'nieuw');
  await p.locator('.paneel .chip').first().tap(); await wacht(200);
  const loc = p.locator('.paneel [name="locatie"]');
  const dagY = () => p.locator('.paneel .formkaart').nth(1).boundingBox().then((x) => Math.round(x.y));
  const y0 = await dagY();
  await loc.focus(); await wacht(300);
  assert.deepEqual(await p.locator('#nlocaties .aanvuloptie .t1').allInnerTexts(), ['Zonnezaal', 'Coupé', 'Groot Overleg', 'Kelder'], 'alle ruimtes bij een tik');
  assert.deepEqual(await p.locator('#nlocaties .aanvuloptie .t2').allInnerTexts(), ['Ruimte · zonnezaal@voorbeeld.nl', 'Ruimte · coupe@voorbeeld.nl', 'Ruimte · grootoverleg@voorbeeld.nl', 'Ruimte'], 'een ongeldig adres telt niet');
  assert.equal(await dagY(), y0, 'de lijst ligt over het formulier: niets verspringt');
  await loc.type('ov', { delay: 20 }); await wacht(200);
  assert.deepEqual(await p.locator('#nlocaties .aanvuloptie .t1').allInnerTexts(), ['Groot Overleg']);
  await p.locator('#nlocaties .aanvuloptie').first().tap(); await wacht(200);
  assert.equal(await loc.inputValue(), 'Groot Overleg');
  assert.match(await p.locator('#nsamen').innerText(), /Groot Overleg staat bij de deelnemers/);
  let href = await p.locator('#noutlook').getAttribute('href');
  assert.match(href, /location=Groot%20Overleg&attendees=grootoverleg%40voorbeeld\.nl/);
  await loc.fill(''); await loc.type('coupe', { delay: 20 }); await wacht(200); // zonder accent
  await p.locator('#nlocaties .aanvuloptie').first().tap(); await wacht(200);
  href = await p.locator('#noutlook').getAttribute('href');
  assert.match(href, /attendees=coupe%40voorbeeld\.nl/);
  assert.doesNotMatch(href, /grootoverleg/, 'de vorige ruimte is weg');
  await loc.type(', achterin', { delay: 20 }); await wacht(200); // zelf iets anders: geen ruimte meer
  assert.doesNotMatch(await p.locator('#noutlook').getAttribute('href'), /attendees=/);
  assert.deepEqual(p.fouten, []);
});

test('ruimtes: de eerdere vorm (één per regel met een maildomein) wordt omgezet', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.context().addInitScript(() => { if (!sessionStorage.getItem('gezet')) { sessionStorage.setItem('gezet', '1'); localStorage.setItem('ag_ruimtes', JSON.stringify({ tekst: 'Glazen Huis\nKelder <beneden@elders.example>', domein: '@voorbeeld.nl' })); } });
  await p.goto(url); await wacht(800);
  assert.deepEqual(await p.evaluate(() => ruimtes()), [{ naam: 'Glazen Huis', email: 'glazenhuis@voorbeeld.nl' }, { naam: 'Kelder', email: 'beneden@elders.example' }]);
  assert.equal(await p.evaluate(() => localStorage.getItem('ag_ruimtes')), null, 'de oude vorm is opgeruimd');
});

test('plaatsen: met een Google-sleutel vult Locatie ook adressen aan, en de sleutel testen werkt', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  const vragen = [];
  let weiger = false;
  await p.context().route('https://places.googleapis.com/**', (r) => {
    vragen.push({ sleutel: r.request().headers()['x-goog-api-key'], body: JSON.parse(r.request().postData()) });
    if (weiger) return r.fulfill({ status: 403, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: { message: 'API key not valid.' } }) });
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(ANTWOORD_GOOGLE) });
  });
  await p.goto(url); await wacht(800);
  await p.click('#titelknop'); await wacht(700);
  await p.locator('.paneel [data-actie="instellingen"]').tap(); await wacht(900);
  const kaart = p.locator('#igooglekaart');
  assert.match(await kaart.innerText(), /Geen sleutel/);
  await p.locator('[data-actie="google-wijzig"]').tap(); await wacht(200);
  await p.locator('[data-actie="google-bewaar"]').tap(); await wacht(200);
  assert.equal(await p.locator('#igoogleuitslag').innerText(), 'Plak eerst een sleutel.');
  await p.fill('#igoogle', 'proefsleutel');
  weiger = true;
  await p.locator('[data-actie="google-bewaar"]').tap(); await wacht(600); // bewaren test meteen
  assert.match(await p.locator('#igoogleuitslag').innerText(), /^Google accepteert deze sleutel niet\. Controleer de sleutel en de beperkingen in Google Cloud\. \(API key not valid\.\)$/);
  weiger = false;
  await p.locator('[data-actie="google-wijzig"]').tap(); await wacht(200);
  await p.fill('#igoogle', 'proefsleutel');
  await p.locator('#igoogle').press('Enter'); await wacht(600); // Enter bewaart ook
  assert.match(await p.locator('#igoogleuitslag').innerText(), /^De sleutel werkt\.$/);
  assert.match(await kaart.innerText(), /Sleutel ingesteld/);
  assert.deepEqual(await kaart.locator('.instknop').allInnerTexts(), ['Sleutel wijzigen', 'Sleutel verwijderen'], 'geen aparte testknop');
  assert.equal(await p.locator('.paneel.instellingen').evaluate((e) => e.innerHTML.includes('proefsleutel')), false, 'de sleutel staat nergens in beeld');
  // Wijzigen begint met een leeg veld; annuleren laat de sleutel staan
  await p.locator('[data-actie="google-wijzig"]').tap(); await wacht(200);
  assert.equal(await p.locator('#igoogle').inputValue(), '');
  await p.locator('[data-actie="google-annuleer"]').tap(); await wacht(200);
  assert.equal(await p.evaluate(() => googleSleutel()), 'proefsleutel');
  await p.keyboard.press('Escape'); await wacht(500);
  await kies(p, 'nieuw');
  const loc = p.locator('.paneel [name="locatie"]');
  await loc.focus(); await loc.type('da', { delay: 20 }); await wacht(500);
  assert.equal(vragen.length, 2, 'met twee letters nog niet naar Google');
  await loc.type('mrak', { delay: 20 }); await wacht(700);
  assert.equal(vragen.length, 3, 'één vraag na het typen, niet één per letter');
  await loc.type(' ', { delay: 0 }); await wacht(30);
  assert.deepEqual(await p.locator('#nlocaties .aanvuloptie .t2').allInnerTexts(), ['Amsterdam, Nederland'], 'de plaatsen blijven staan tot er nieuwe zijn');
  await wacht(700);
  await loc.press('Backspace'); await wacht(700);
  const v = vragen.at(-1);
  assert.equal(v.sleutel, 'proefsleutel');
  assert.equal(v.body.input, 'damrak');
  assert.ok(v.body.sessionToken, 'met een sessie');
  assert.deepEqual(await p.locator('#nlocaties .aanvuloptie .t2').allInnerTexts(), ['Amsterdam, Nederland']);
  await p.locator('#nlocaties .aanvuloptie').first().tap(); await wacht(200);
  assert.equal(await loc.inputValue(), 'Damrak 1, Amsterdam, Nederland');
  // Weigert Google de sleutel later, dan staat dat onderaan de lijst, en het blijft staan tijdens het typen
  weiger = true;
  await loc.fill(''); await loc.type('kalverstraat', { delay: 20 }); await wacht(700);
  assert.equal(await p.locator('#nlocaties .aanvulmelding').innerText(), 'Google accepteert je sleutel niet meer. Controleer hem onder Instellingen.');
  await loc.type(' 1', { delay: 0 }); await wacht(30);
  assert.equal(await p.locator('#nlocaties .aanvulmelding').count(), 1, 'de melding knippert niet weg bij de volgende letter');
  assert.deepEqual(p.fouten, []);
});

test('telefoon: de plusknop klapt open met twee keuzes, en dicht met een tik ernaast', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(900);
  const plus = p.locator('.plusknop');
  await plus.tap(); await wacht(400);
  assert.equal(await plus.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await p.locator('.keuzemenu [role="menuitem"]').allInnerTexts(), ['Tijden uit een mail', 'Nieuwe afspraak'], 'nieuwe afspraak het dichtst bij de duim');
  await plus.tap(); await wacht(400);
  assert.equal(await p.locator('.keuzemenu').count(), 0, 'nog een tik: dicht');
  await plus.tap(); await wacht(400);
  await p.touchscreen.tap(100, 300); await wacht(400);
  assert.equal(await p.locator('.keuzemenu').count(), 0, 'tik ernaast: dicht');
  assert.equal(await p.locator('.paneel').count(), 0, 'en er opent niets');
  assert.equal(await p.locator('.paneel.nieuw [data-actie="mailtijden"]').count(), 0);
});

/* -------------------------------------------------------------- tijden uit een mail */

const MAIL = `Ik kan een online uurtje inplannen ergens op de volgende momenten komende week:

Maandag 9 November tussen 13:00 en 16:00
Woensdag 11 November tussen 15:00 en 17:00
Donderdag 12 November van 11:00 en 12:00 of ergens tussen 14:00 en 17:00`;

test('mail: de lezer haalt dagen, tijden, duur en online uit gewone zinnen', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(600);
  const lees = (tekst) => p.evaluate((t) => {
    const u = leesMailTijden(t);
    const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { duur: u.duur, online: u.online, opties: u.opties.map((o) => `${ymd(o.dag)} ${hm(o.van)}-${hm(o.tot)}${o.waarschuwing ? ' !' : ''}`) };
  }, tekst);
  assert.deepEqual(await lees(MAIL), { duur: 60, online: true, opties: ['2026-11-09 13:00-16:00', '2026-11-11 15:00-17:00', '2026-11-12 11:00-12:00', '2026-11-12 14:00-17:00'] });
  assert.deepEqual((await lees('Schikt di 10/11 9.00-12.00 of do 12-11 13u-16u? Een half uur is genoeg.')), { duur: 30, online: false, opties: ['2026-11-10 09:00-12:00', '2026-11-12 13:00-16:00'] }, 'elke tijd bij zijn eigen dag');
  assert.deepEqual((await lees('Kan jij morgen na 14:00, of overmorgen \'s ochtends?')).opties, ['2026-11-05 14:00-18:00', '2026-11-06 09:00-12:00']);
  assert.deepEqual((await lees('Volgende week dinsdag tussen 1 en 4, of woensdagmiddag.')).opties, ['2026-11-10 13:00-16:00', '2026-11-11 13:00-17:00'], 'tussen 1 en 4 is \'s middags');
  assert.deepEqual(await lees('Zullen we vrijdag 13 november om half 3 bellen via Teams? Duurt 45 minuten.'), { duur: 45, online: true, opties: ['2026-11-13 14:30-15:15'] }, 'half 3 is 14:30');
  assert.deepEqual((await lees('Opties:\n- maandag 16 nov\n- dinsdag 17 nov: 10:00 - 11:30\n- woensdag 9-12')).opties, ['2026-11-16 08:00-18:00', '2026-11-17 10:00-11:30', '2026-11-18 09:00-12:00'], 'woensdag 9-12 is een tijdvak, op de woensdag daarna');
  assert.deepEqual((await lees('Ik ben beschikbaar op 9 en 10 november van 9 tot 12 uur.')).opties, ['2026-11-09 09:00-12:00', '2026-11-10 09:00-12:00']);
  assert.deepEqual((await lees('Dinsdag 9 november tussen 10:00 en 11:00')).opties, ['2026-11-09 10:00-11:00 !'], 'de datum wint; de weekdag klopt niet');
  assert.deepEqual((await lees('Graag anderhalf uur. Donderdag 19 november tussen 13.30 en 17.00 of vrijdag 20 november voor 12:00.')), { duur: 90, online: false, opties: ['2026-11-19 13:30-17:00', '2026-11-20 08:00-12:00'] });
  assert.deepEqual((await lees('Hoi, we zitten nu in week 45 en 46. Hoe staat het met de 2 en 3 punten?')).opties, [], 'geen tijden in gewone tekst');
});

test('mail: tijden naast de agenda, kiezen, antwoord kopiëren en inplannen', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(900);
  // Klembord nabootsen: platte tekst en opmaak bewaren
  await p.evaluate(() => {
    window.gekopieerd = null;
    navigator.clipboard.writeText = async (t) => { window.gekopieerd = { tekst: t }; };
    navigator.clipboard.write = async ([item]) => { window.gekopieerd = { tekst: await (await item.getType('text/plain')).text(), html: await (await item.getType('text/html')).text() }; };
  });
  await kies(p, 'mail');
  await p.fill('#mtekst', MAIL); await wacht(1500);
  assert.deepEqual(await p.locator('#muitslag h3').allInnerTexts(), ['MAANDAG 9 NOVEMBER', 'WOENSDAG 11 NOVEMBER', 'DONDERDAG 12 NOVEMBER']);
  const vak = (i) => p.locator('#muitslag .mvak').nth(i);
  assert.equal(await p.locator('#muitslag .mstatus:not(.sub)').count(), 0, 'geen zinnetje als "te kort": de kleuren van de tijden zeggen genoeg');
  assert.deepEqual(await vak(2).locator('.chip.vrij').allInnerTexts(), ['11:00'], 'vrij: groen');
  // Altijd waarmee het overlapt, elk overleg op een eigen regel (ook bij te kort)
  const overlap = (i) => vak(i).locator('.moverlap li').evaluateAll((l) => l.map((x) => x.innerText.replace(/\s+/g, ' ')));
  assert.deepEqual(await overlap(0), ['14:30 – 15:30 Demo Kies op Maat voor SURF']);
  assert.deepEqual(await overlap(1), ['15:30 – 16:30 Bespreken Flusso']);
  assert.deepEqual(await overlap(2), []);
  assert.deepEqual(await overlap(3), ['15:00 – 15:45 1-op-1 Jochem', '16:00 – 17:00 Architectuuroverleg']);
  assert.deepEqual(await vak(1).locator('.chip').allInnerTexts(), ['15:00', '15:30', '16:30'], 'ook tijden die overlappen: bij het begin en einde van een overleg');
  assert.deepEqual(await vak(1).locator('.chip.botst').allInnerTexts(), ['15:00'], 'gedeeltelijk: geel');
  assert.deepEqual(await vak(1).locator('.chip.vol').allInnerTexts(), ['15:30'], 'helemaal bezet: rood');
  assert.equal(await p.locator('#msamen').innerText(), 'Tik op een tijd om hem te kiezen');
  assert.equal(await p.locator('#minplannen').isDisabled(), true);
  await vak(0).locator('.chip', { hasText: '13:30' }).tap();
  await vak(3).locator('.chip', { hasText: '14:00' }).tap(); await wacht(200);
  assert.equal(await p.locator('#msamen .mantwoord li').count(), 2, 'het antwoord zoals het in de mail komt');
  assert.equal(await p.locator('#minplannen').isDisabled(), true, 'inplannen kan met één tijd');
  assert.match(await p.locator('.mailtijden .groteknop.vol').innerText(), /Antwoord kopiëren/, 'kopiëren is de hoofdknop');
  await p.locator('#mkopieer').tap(); await wacht(300);
  assert.deepEqual(await p.evaluate(() => window.gekopieerd), { tekst: 'Ik kan op de volgende tijdstippen:\n• Maandag 9 november van 13:30 tot 14:30\n• Donderdag 12 november van 14:00 tot 15:00' }, 'platte tekst, zonder opmaak of kleur');
  // Een half uur: andere tijden; wat niet meer past, valt af
  await p.locator('.mailtijden [data-stap="-15"]').tap(); await p.locator('.mailtijden [data-stap="-15"]').tap(); await wacht(400);
  assert.deepEqual(await vak(1).locator('.chip.vrij').allInnerTexts(), ['15:00', '16:30']);
  assert.deepEqual(await p.locator('#muitslag .chip.aan').allInnerTexts(), ['13:30', '14:00'], 'gekozen tijden die nog passen, blijven staan');
  await p.locator('#muitslag .chip.aan').first().tap(); await wacht(100);
  assert.equal(await p.locator('#muitslag .chip.aan').count(), 1);
  await p.locator('#minplannen').tap(); await wacht(1200);
  assert.equal(await p.locator('.paneel.mailtijden').count(), 0);
  assert.match(await p.locator('.paneel.nieuw #nsamen').innerText(), /^Donderdag 12 november, 14:00 – 14:30/);
  assert.equal(await p.locator('.paneel [name="locatie"]').inputValue(), 'Microsoft Teams', 'online: Teams bij Locatie');
  assert.deepEqual(p.fouten, []);
});

test('mail: bij een drukke middag het begin en einde van elk overleg als voorstel', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(600);
  const uit = await p.evaluate(() => {
    const d = new Date(2026, 10, 9);
    const om = (h, m) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
    const lijst = [['A', 13, 0, 13, 30], ['B', 13, 30, 14, 0], ['C', 14, 0, 15, 0], ['D', 14, 0, 14, 30], ['E', 15, 30, 16, 0]].map(([title, a, b, c, e]) => ({ title, start: om(a, b), end: om(c, e) }));
    return toetsVak(lijst, { dag: d, van: 13 * 60, tot: 16 * 60 }, 60).tijden.map((x) => `${hhmm(new Date(x.t))}${x.vol ? ' rood' : x.botst.length ? ' geel' : ''}`);
  });
  assert.deepEqual(uit, ['13:00 rood', '13:30 rood', '14:00 rood', '14:30 geel', '15:00 geel', '15:30 geel']);
});

test('mail: een tijd die overlapt kiezen; het antwoord noemt geen reden, inplannen toont de overlap', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(900);
  await kies(p, 'mail');
  await p.fill('#mtekst', 'Woensdag 11 november tussen 15:00 en 17:00'); await wacht(1200);
  assert.deepEqual(await p.locator('#muitslag .chip.botst').allInnerTexts(), ['15:00'], 'gedeeltelijk: geel');
  await p.locator('.mailtijden [data-stap="-15"]').tap(); await p.locator('.mailtijden [data-stap="-15"]').tap(); await wacht(400);
  assert.deepEqual(await p.locator('#muitslag .chip.vol').allInnerTexts(), ['15:30'], 'helemaal bezet: rood');
  await p.locator('.mailtijden [data-stap="15"]').tap(); await p.locator('.mailtijden [data-stap="15"]').tap(); await wacht(400);
  await p.locator('#muitslag .chip.botst', { hasText: '15:00' }).tap(); await wacht(200);
  assert.equal(await p.locator('#muitslag .chip.botst.aan').count(), 1);
  assert.equal(await p.locator('#msamen').innerText(), 'Ik kan op woensdag 11 november van 15:00 tot 16:00.', 'één tijd: een zin, zonder reden');
  assert.equal(await p.locator('#minplannen').isDisabled(), false);
  await p.locator('#minplannen').tap(); await wacht(1200);
  assert.match(await p.locator('.paneel.nieuw #nsamen').innerText(), /^Woensdag 11 november, 15:00 – 16:00\nOverlap met Bespreken Flusso/);
  assert.match(await p.locator('#noutlook').getAttribute('href'), /start=2026-11-11T15:00:00/);
  assert.deepEqual(p.fouten, []);
});

/* -------------------------------------------------------------- desktop */

test('desktop: contacten aanvullen met het toetsenbord; Escape sluit eerst de suggesties', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, MAC);
  await p.goto(url); await wacht(800);
  await p.setInputFiles('#contactinvoer', CONTACTEN_CSV); await wacht(600);
  await p.locator('#zijbalk [data-actie="instellingen"]').click(); await wacht(700);
  assert.match(await p.locator('#icontacten').innerText(), /6 contacten/);
  await p.keyboard.press('Escape'); await wacht(500);
  await kies(p, 'nieuw', true);
  const veld = p.locator('.paneel [name="deelnemers"]');
  await veld.click(); await veld.type('ja', { delay: 20 }); await wacht(200);
  assert.equal(await p.locator('.aanvuloptie.actief .t1').innerText(), 'Jan Jansen', 'de eerste staat klaar');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await wacht(200);
  assert.equal(await veld.inputValue(), 'jannie.smit@voorbeeld.nl; ');
  await veld.type('mar', { delay: 20 }); await wacht(200);
  await p.keyboard.press('Escape'); await wacht(300);
  assert.equal(await p.locator('#naanvul').isHidden(), true);
  assert.equal(await p.locator('.paneel').count(), 1, 'het venster blijft open');
});

/* -------------------------------------------------------------- desktop */

test('desktop: dagkolommen, een leeg weekend smal met korte dagnaam, en de legenda', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, MAC);
  await p.goto(url); await wacht(1000);
  assert.equal(await p.locator('.weekraster .dagkolom').count(), 7);
  const smal = await p.locator('.dagkolom.smal .kolomkop .dow').allInnerTexts();
  assert.deepEqual(smal, ['Za', 'Zo']);
  assert.equal(await p.locator('main .legenda').count(), 1);
  assert.deepEqual(p.fouten, []);
});

test('desktop: Nieuw opent een menu; met de pijltjes en Enter kies je', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, MAC);
  await p.goto(url); await wacht(900);
  await p.locator('#nieuwknop').click(); await wacht(300);
  assert.deepEqual(await p.locator('.keuzemenu [role="menuitem"]').allInnerTexts(), ['Nieuwe afspraak', 'Tijden uit een mail']);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await wacht(900);
  assert.equal(await p.locator('.paneel.mailtijden.dialoog').count(), 1);
  await p.keyboard.press('Escape'); await wacht(500);
  await p.locator('#nieuwknop').click(); await wacht(300);
  await p.keyboard.press('Escape'); await wacht(300);
  assert.equal(await p.locator('.keuzemenu').count(), 0);
});

test('desktop: detail als venster, Escape sluit het', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, MAC);
  await p.goto(url); await wacht(1000);
  await p.locator('#inhoud [data-id]').first().click(); await wacht(700);
  assert.equal(await p.locator('.paneel.detail.dialoog.open').count(), 1);
  assert.equal(await p.locator('.paneel a', { hasText: 'Openen in Outlook' }).getAttribute('href'), 'https://outlook.office.com/calendar/', 'op de Mac Outlook op het web');
  await p.keyboard.press('Escape'); await wacht(500);
  assert.equal(await p.locator('.paneel').count(), 0);
});

/* -------------------------------------------------------------- uitvoeren */

const { chromium } = await laadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
let mis = 0, gedraaid = 0;
const alleen = process.argv[2];
for (const t of tests) {
  if (alleen && !t.naam.includes(alleen)) continue;
  const start = Date.now();
  gedraaid++;
  try {
    await t.fn({ browser, url: server.url });
    console.log(`✓ ${t.naam} (${Date.now() - start} ms)`);
  } catch (e) {
    mis++;
    console.log(`✗ ${t.naam}\n    ${String(e.message).split('\n').join('\n    ')}`);
  }
  for (const c of browser.contexts()) await c.close();
}
await browser.close(); await server.stop();
console.log(mis ? `\n${mis} van ${gedraaid} tests mislukt` : `\n${gedraaid === tests.length ? 'Alle ' : ''}${gedraaid} tests geslaagd`);
process.exitCode = mis ? 1 : 0;
