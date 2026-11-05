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

test('telefoon: in de weekkiezer een week kiezen', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.click('#titelknop'); await wacht(800);
  await p.locator('.paneel .weekrij', { hasText: '47' }).first().tap(); await wacht(800);
  assert.equal(await p.locator('#titel').innerText(), 'Week 47');
});

test('telefoon: nieuwe afspraak opent Outlook met de gekozen tijd', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.locator('[data-nieuw]:visible').first().tap(); await wacht(900);
  await p.locator('.paneel .chip').first().tap(); await wacht(300);
  const knop = p.locator('#noutlook');
  assert.equal((await knop.innerText()).trim(), 'Afmaken in Outlook');
  assert.match(await knop.getAttribute('href'), /^https:\/\/outlook\.office\.com\/calendar\/deeplink\/compose\?.*startdt=/);
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

test('desktop: detail als venster, Escape sluit het', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, MAC);
  await p.goto(url); await wacht(1000);
  await p.locator('#inhoud [data-id]').first().click(); await wacht(700);
  assert.equal(await p.locator('.paneel.detail.dialoog.open').count(), 1);
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
