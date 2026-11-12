// Tests van de app in een echte browser (Chromium via Playwright), met een vaste klok en de voorbeeldgegevens.
// Gebruik: npm test   (of: node test/app.test.mjs)
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
import ICAL from 'ical.js';
import { maakOmzetter } from '../js/ical.js';
import { startServer, laadPlaywright, nieuwePagina, wacht, TELEFOON, IPAD, MAC, MAP } from './hulp.mjs';
import worker from '../cloudflare/worker.js';
import { nepD1 } from './d1.mjs';

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

test('telefoon: in de Vooruitblik gaat doortrekken naar de volgende zeven dagen', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1200);
  await p.locator('#weergaveknop').tap(); await wacht(300);
  await p.locator('.weergavemenu [data-weergave="forecast"]').tap(); await wacht(800);
  assert.equal(await p.locator('#datumregel').innerText(), '4–10 november');
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wacht(300);
  await veeg(p, 200, 650, 300);
  assert.equal(await p.locator('#titel').innerText(), 'Vooruitblik');
  assert.equal(await p.locator('#datumregel').innerText(), '11–17 november');
});

test('telefoon: het weergaveknopje wisselt tussen Week en Vooruitblik, en Agenda onthoudt de keuze', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  assert.deepEqual(await p.locator('#tabbalk .pil [data-tab]').allInnerTexts(), ['Agenda', 'Notities']);
  assert.equal(await p.locator('#tabbalk .tabtandwiel').getAttribute('aria-label'), 'Instellingen');
  assert.equal(await p.locator('#capsule [data-nav="0"]').isVisible(), false, 'op de iPhone alleen ‹ ›');
  await p.locator('#weergaveknop').tap(); await wacht(300);
  assert.deepEqual(await p.locator('.weergavemenu [role="menuitemradio"]').allInnerTexts(), ['Week', 'Vooruitblik']);
  assert.equal(await p.locator('.weergavemenu [data-weergave="week"]').getAttribute('aria-checked'), 'true');
  await p.locator('.weergavemenu [data-weergave="forecast"]').tap(); await wacht(700);
  assert.equal(await p.locator('#titel').innerText(), 'Vooruitblik');
  await p.locator('#tabbalk [data-tab="notities"]').tap(); await wacht(500);
  assert.equal(await p.locator('#weergaveknop').isVisible(), false, 'alleen in de agenda');
  await p.locator('#tabbalk [data-tab="agenda"]').tap(); await wacht(700);
  assert.equal(await p.locator('#titel').innerText(), 'Vooruitblik', 'terug naar de laatst gekozen weergave');
  // Een week verder: nog een tik op de tab Agenda brengt je naar vandaag
  await p.locator('#weergaveknop').tap(); await wacht(300);
  await p.locator('.weergavemenu [data-weergave="week"]').tap(); await wacht(700);
  await p.locator('#capsule [data-nav="1"]').tap(); await wacht(700);
  assert.equal(await p.locator('#titel').innerText(), 'Week 46');
  await p.locator('#tabbalk [data-tab="agenda"]').tap(); await wacht(700);
  assert.equal(await p.locator('#titel').innerText(), 'Week 45');
  assert.equal(await p.locator('#datumregel').innerText(), '2–8 november');
  assert.deepEqual(p.fouten, []);
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
  // De balk met de werkdag: overleggen, vrije tijd en de gekozen tijd; geen kader om een tijdvak
  assert.equal(await p.locator('.paneel.nieuw .mtijdlijn').count(), 1);
  assert.ok(await p.locator('.paneel.nieuw .mvrij').count() >= 1);
  assert.equal(await p.locator('.paneel.nieuw .mkeus').count(), 1);
  assert.equal(await p.locator('.paneel.nieuw .mvakband').count(), 0);
  // Tik op de balk: de afspraken uit de balk eronder; nog een tik klapt de lijst dicht
  assert.equal(await p.locator('#nafspraken').isVisible(), false);
  await p.locator('#ntijdlijn').tap(); await wacht(300);
  assert.equal(await p.locator('#ntijdlijn').getAttribute('aria-expanded'), 'true');
  assert.ok(await p.locator('#nafspraken li').count() >= 1, 'afspraken in de lijst');
  await p.locator('#ntijdlijn').tap(); await wacht(300);
  assert.equal(await p.locator('#nafspraken').isVisible(), false);
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
  await p.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(900);
  await p.locator('[data-actie="ics-kies"]').tap(); await wacht(800);
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

test('cloudflare: de koppeling staat los van de agenda; met een .ics-bestand gaan notities en ruimtes ook mee', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  p.on('dialog', (d) => d.accept());
  await p.context().route('https://agenda.voorbeeld.workers.dev/**', (r) => r.fulfill({ status: 501, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'De Worker heeft nog geen database' }));
  await p.goto(url); await wacht(800);
  await p.setInputFiles('#icsinvoer', ICS); await wacht(2500);
  await p.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(900);
  assert.deepEqual(await p.locator('#instscherm .instsectie h3').allTextContents(), ['Cloudflare', 'Agenda', 'Ruimtes', 'Alleen op dit toestel']);
  assert.match(await p.locator('#isync').innerText(), /Niet gekoppeld/);
  assert.match(await p.locator('#instscherm .voetnoot').innerText(), /^Versie /);
  await p.locator('#isync [data-actie="koppeling-wijzig"]').tap(); await wacht(800);
  assert.equal(await p.locator('#linkinvoer').inputValue(), '', 'de huidige link staat er niet in');
  await p.fill('#linkinvoer', LINK);
  await p.locator('#linkknop').tap(); await wacht(1200);
  assert.equal(await p.evaluate(() => koppeling()), LINK);
  assert.equal(await p.evaluate(() => BESTAND && BESTAND.link), null, 'de agenda blijft het bestand');
  assert.match(await p.locator('#isync').innerText(), /Je Worker heeft nog geen database/);
  await p.locator('#isync [data-actie="koppeling-wis"]').tap(); await wacht(400);
  assert.equal(await p.evaluate(() => koppeling()), null);
  assert.match(await p.locator('#isync').innerText(), /Niet gekoppeld/);
  assert.equal(await p.evaluate(() => !!BESTAND), true, 'het bestand blijft');
  assert.deepEqual(p.fouten, []);
});

test('agenda-link: na Nu bijwerken in Instellingen toont de agenda de nieuwe afspraken zodra je terugkeert', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  let ics = fs.readFileSync(ICS, 'utf8');
  await p.context().route('https://agenda.voorbeeld.workers.dev/**', (r) => r.fulfill({ status: 200, contentType: 'text/calendar', headers: { 'Access-Control-Allow-Origin': '*' }, body: ics }));
  await p.goto(url); await wacht(800);
  await p.evaluate((l) => gebruikLink(l), LINK); await wacht(4000);
  // In Outlook krijgt een zichtbare afspraak een andere naam
  const titel = await p.evaluate(() => DATA.ruw.get(document.querySelector('#inhoud [data-id]').dataset.id).title);
  ics = ics.split(`SUMMARY:${titel}`).join('SUMMARY:Bijgewerkt overleg');
  await p.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(900);
  assert.equal(await p.locator('#instscherm [data-actie="ics-nu"]').count(), 0, 'geen Nu bijwerken meer bij de agenda');
  await p.locator('#instscherm [data-actie="sync-nu"]').tap(); await wacht(3000);
  assert.equal(await p.locator('#statustekst').innerText(), 'Je agenda is bijgewerkt.');
  await p.locator('#tabbalk [data-tab="agenda"]').tap(); await wacht(800);
  assert.match(await p.locator('#inhoud').innerText(), /Bijgewerkt overleg/);
  assert.deepEqual(p.fouten, []);
});

test('bestand op de Mac: na opnieuw openen geen voorbeeldafspraken tussen je eigen agenda, ook niet uit een oude kopie', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, MAC);
  await p.goto(url); await wacht(800);
  await p.setInputFiles('#icsinvoer', ICS); await wacht(3000);
  const uids = new Set([...fs.readFileSync(ICS, 'utf8').matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim()));
  const vreemd = () => p.evaluate((u) => [...DATA.ruw.values()].filter((e) => !u.includes(e.uid)).map((e) => e.title), [...uids]);
  // Opnieuw openen in de tab Notities en met contacten: de zijbalk staat er dan meteen, maar laadt geen
  // voorbeeldweken voordat de agenda uit de opslag komt
  await p.setInputFiles('#contactinvoer', path.join(MAP, 'test', 'contacten.csv')); await wacht(600);
  await p.locator('#zijbalk [data-nf-soort="alle"]').click(); await wacht(400);
  await p.reload(); await wacht(3000);
  assert.ok(await p.evaluate(() => DATA.ruw.size) > 3);
  assert.deepEqual(await vreemd(), []);
  // Een kopie van vóór v163 (zonder stempel) met een voorbeeldafspraak erin: de app leest het bestand opnieuw
  await p.evaluate(async () => {
    const k = await IDB.get('icsweken');
    const e = [...DATA.ruw.values()][0];
    delete k.soort;
    k.events.push({ ...e, id: 'vb|1', uid: 'voorbeeld-1', title: 'Bespreken voorbeeld' });
    await IDB.set('icsweken', k);
  });
  await p.reload(); await wacht(3500);
  assert.deepEqual(await vreemd(), []);
  assert.equal((await p.evaluate(() => IDB.get('icsweken'))).soort, 2, 'de nieuwe kopie heeft de stempel');
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
  await p.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(900);
  assert.match(await p.locator('#icontacten').innerText(), /6 contacten/);
  await p.locator('[data-actie="contacten-wis"]').tap(); await wacht(600);
  assert.match(await p.locator('#icontacten').innerText(), /Geen contacten/);
  await p.keyboard.press('Escape'); await wacht(500);
  await kies(p, 'nieuw');
  await p.locator('.paneel [name="deelnemers"]').type('jan', { delay: 20 }); await wacht(200);
  assert.equal(await p.locator('.aanvuloptie').count(), 0);
});

test('instellingen: de weekkiezer past op een kleine iPhone, en Instellingen scrolt tot boven de tabbalk', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, { ...TELEFOON, viewport: { width: 375, height: 667 } });
  await p.goto(url); await wacht(800);
  await p.click('#titelknop'); await wacht(800);
  assert.equal(await p.locator('.paneel.kiezer').evaluate((e) => e.scrollHeight <= e.clientHeight + 1), true, 'de weekkiezer hoeft niet te scrollen');
  assert.equal(await p.locator('.paneel.kiezer .instrij').count(), 0, 'de weekkiezer is alleen de kalender');
  await p.keyboard.press('Escape'); await wacht(500);
  await p.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(900);
  await p.evaluate(() => window.scrollTo(0, 1e5)); await wacht(300);
  const v = await p.locator('#instscherm .voetnoot').boundingBox();
  const tb = await p.locator('#tabbalk .pil').boundingBox();
  assert.ok(v.y + v.height <= tb.y, `voetnoot eindigt op ${Math.round(v.y + v.height)}, de tabbalk begint op ${Math.round(tb.y)}`);
});

test('telefoon: alle invoervelden hebben minstens 16 punten, anders zoomt iOS in', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(800);
  const klein = () => p.evaluate(() => [...document.querySelectorAll('input:not([type=file]), textarea, select')]
    .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id || e.name || e.className));
  await p.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(900);
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
  await p.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(900);
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
  await p.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(900);
  const kaart = p.locator('#igooglekaart');
  assert.match(await kaart.innerText(), /Geen Google-sleutel/);
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
  assert.match(await kaart.innerText(), /Google-sleutel ingesteld/);
  assert.deepEqual(await kaart.locator('.instknop').allInnerTexts(), ['Sleutel wijzigen', 'Sleutel verwijderen'], 'geen aparte testknop');
  assert.equal(await p.locator('#instscherm').evaluate((e) => e.innerHTML.includes('proefsleutel')), false, 'de sleutel staat nergens in beeld');
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

test('telefoon: de plusknop klapt open met drie keuzes, en dicht met een tik ernaast', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(900);
  const plus = p.locator('.plusknop');
  await plus.tap(); await wacht(400);
  assert.equal(await plus.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await p.locator('.keuzemenu [role="menuitem"]').allInnerTexts(), ['Notitie', 'Tijden uit een mail', 'Nieuwe afspraak'], 'nieuwe afspraak het dichtst bij de duim');
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

test('actiepunten: een deadline aan het eind van het punt, alleen op werkdagen', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(600);
  // Vanaf donderdag 12 november 2026 (en vrijdag 13 en zaterdag 14 voor het weekend)
  const lees = (tekst, dag = 12) => p.evaluate(([t, d]) => leesDeadline(t, new Date(2026, 10, d)), [tekst, dag]);
  const gevallen = [
    ['Offerte sturen eind volgende week', 'Offerte sturen', '2026-11-20'],
    ['Planning delen deze week', 'Planning delen', '2026-11-13'],
    ['Budget begin maart', 'Budget', '2027-03-01'],
    ['Budget medio maart', 'Budget', '2027-03-15'],
    ['Budget eind maart', 'Budget', '2027-03-31'],
    ['Rapport uiterlijk eind januari', 'Rapport', '2027-01-29'], // 31 januari is een zondag
    ['Verslag 12 maart', 'Verslag', '2027-03-12'],
    ['Verslag 12-3-2027', 'Verslag', '2027-03-12'],
    ['Verslag 14-11', 'Verslag', '2026-11-13'], // zaterdag: de vrijdag ervoor
    ['Bellen morgen', 'Bellen', '2026-11-13'],
    ['Bellen dinsdag', 'Bellen', '2026-11-17'],
    ['Bespreken voor vrijdag', 'Bespreken', '2026-11-13'],
    ['Agenda maken begin volgende week', 'Agenda maken', '2026-11-16'],
    ['Agenda maken medio volgende week', 'Agenda maken', '2026-11-18'],
    ['Facturen eind van de maand', 'Facturen', '2026-11-30'],
    ['Terugkoppelen over 3 werkdagen', 'Terugkoppelen', '2026-11-17'],
  ];
  for (const [invoer, tekst, deadline] of gevallen) assert.deepEqual(await lees(invoer), { tekst, deadline }, invoer);
  assert.deepEqual(await lees('Bellen morgen', 13), { tekst: 'Bellen', deadline: '2026-11-16' }, 'morgen op vrijdag: maandag');
  assert.deepEqual(await lees('Klaar deze week', 14), { tekst: 'Klaar', deadline: '2026-11-20' }, 'deze week in het weekend: de week erna');
  for (const geen of ['Bel Jan over maart', 'eind maart', 'Release 2.0 plannen', 'Begin maart bespreken']) assert.equal(await lees(geen), null, geen);
  // In een notitie: ! met een deadline aan het eind wordt een punt met die deadline
  await p.locator('#tabbalk .plusknop').tap(); await wacht(400);
  await p.locator('.keuzemenu [data-keuze="notitie"]').tap(); await wacht(800);
  await p.locator('#nottekst').tap();
  await p.keyboard.type('! Offerte sturen 12-3-2027'); await p.keyboard.press('Enter'); await wacht(300);
  assert.equal(await p.locator('.punt .punttekst').first().inputValue(), 'Offerte sturen');
  assert.equal(await p.evaluate(() => NOTITIES[NOTITIES.length - 1].punten[0].deadline), '2027-03-12');
  assert.equal(await p.locator('.punt .puntdatum').first().innerText(), '12 mrt 2027');
  assert.deepEqual(p.fouten, []);
});

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
  assert.deepEqual(await vak(2).locator('.chip.vrij').allInnerTexts(), ['11:00'], 'vrij: groen');  // Altijd waarmee het overlapt, elk overleg op een eigen regel (ook bij te kort)
  const overlap = (i) => vak(i).locator('.moverlap li').evaluateAll((l) => l.map((x) => x.innerText.replace(/\s+/g, ' ')));
  assert.deepEqual(await overlap(0), ['14:30 – 15:30 Demo Kies op Maat voor SURF']);
  assert.deepEqual(await overlap(1), ['15:30 – 16:30 Bespreken Flusso']);
  assert.deepEqual(await overlap(2), []);
  assert.deepEqual(await overlap(3), ['15:00 – 15:45 1-op-1 Jochem', '16:00 – 17:00 Architectuuroverleg']);
  assert.deepEqual(await vak(1).locator('.chip').allInnerTexts(), ['15:00', '15:30', '16:30'], 'ook tijden die overlappen: bij het begin en einde van een overleg');
  assert.deepEqual(await vak(1).locator('.chip.botst').allInnerTexts(), ['15:00'], 'gedeeltelijk: geel');
  assert.deepEqual(await vak(1).locator('.chip.vol').allInnerTexts(), ['15:30'], 'helemaal bezet: rood');
  assert.equal(await p.locator('#msamen').innerText(), 'Tik op een tijd om hem te kiezen');
  // Na het plakken klapt het tekstveld in, zodat de tijden in beeld staan; 'Hele tekst tonen' klapt het weer uit
  assert.equal(await p.locator('#mtekst.ingeklapt').count(), 1);
  assert.ok((await p.locator('#mtekst').boundingBox()).height <= 80);
  await p.locator('#mtoon').tap(); await wacht(200);
  assert.equal(await p.locator('#mtekst.ingeklapt').count(), 0);
  assert.equal(await p.locator('#mtoon').isHidden(), true);
  // Niet alleen kleur: ook een gesproken label en een andere rand
  assert.equal(await p.locator('#muitslag .chip.vrij').first().getAttribute('aria-label'), '13:00, vrij');
  assert.equal(await p.locator('#minplannen').isHidden(), true, 'inplannen pas met één tijd');
  await vak(0).locator('.chip', { hasText: '13:30' }).tap();
  await vak(3).locator('.chip', { hasText: '14:00' }).tap(); await wacht(200);
  // Per tijdvak een tijdlijntje met de overleggen eromheen en de gekozen tijd, zodat je ziet of hij aansluit
  assert.equal(await p.locator('#muitslag .mtijdlijn').count(), 4);
  assert.ok(await vak(1).locator('.moverleg').count() >= 1, 'Bespreken Flusso in het tijdlijntje van woensdag');
  assert.equal(await vak(1).locator('.mvrij').count(), 2, 'vrij voor en na Bespreken Flusso');
  assert.equal(await vak(0).locator('.mkeus').count(), 1, 'de gekozen tijd staat in het tijdlijntje');
  assert.equal(await vak(1).locator('.mkeus').count(), 0);
  assert.equal(await p.locator('#msamen .mantwoord li').count(), 2, 'het antwoord zoals het in de mail komt');
  assert.equal(await p.locator('#minplannen').isHidden(), true, 'met twee tijden: geen inplannen');
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

test('mail: in een vrij tijdvak ook de halve uren als begintijd', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(600);
  const uit = await p.evaluate(() => {
    const d = new Date(2026, 10, 11);
    const vak = { dag: d, van: 15 * 60, tot: 17 * 60 };
    const tijden = (duur) => toetsVak([], vak, duur).tijden.map((x) => hhmm(new Date(x.t)));
    return { uur: tijden(60), kwartier: tijden(15) };
  });
  assert.deepEqual(uit.uur, ['15:00', '15:30', '16:00']);
  assert.deepEqual(uit.kwartier, ['15:00', '15:15', '15:30', '15:45', '16:00', '16:15', '16:30', '16:45'], 'bij een kwartier per kwartier');
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
  assert.equal(await p.locator('#minplannen').isVisible(), true, 'met één tijd: inplannen');
  await p.locator('#minplannen').tap(); await wacht(1200);
  assert.match(await p.locator('.paneel.nieuw #nsamen').innerText(), /^Woensdag 11 november, 15:00 – 16:00\nOverlap met Bespreken Flusso/);
  assert.match(await p.locator('#noutlook').getAttribute('href'), /start=2026-11-11T15:00:00/);
  assert.deepEqual(p.fouten, []);
});

/* -------------------------------------------------------------- notities */

test('notities: bij een afspraak schrijven, een nieuw label maken, en na herstarten staat alles er nog', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.locator('#inhoud [data-id]').first().tap(); await wacht(800);
  assert.equal(await p.locator('.paneel.detail .sectie h3', { hasText: 'Mijn notitie' }).count(), 0, 'zonder notitie geen blok');
  await p.locator('.paneel.detail .kopknop[data-actie="eigennotitie"]').tap(); await wacht(800);
  assert.ok(await p.locator('#nottekst').evaluate((x) => parseFloat(getComputedStyle(x).fontSize)) >= 16, '#nottekst minstens 16 punten');
  await p.fill('#nottekst', 'Afgesproken: offerte voor de pilot\nVolgende stap: planning delen');
  // Labels typ je in de tekst: #woord en een spatie wordt een tag, in kleine letters
  assert.equal(await p.locator('#notlabelsectie').isVisible(), false, 'zonder labels geen regel');
  await p.locator('#nottekst').focus(); await p.keyboard.press('Control+End');
  await p.locator('#nottekst').pressSequentially(' #Pilot '); await wacht(200);
  assert.deepEqual(await p.locator('#notlabels .tag').allInnerTexts(), ['#pilot']);
  assert.doesNotMatch(await p.locator('#nottekst').inputValue(), /#/);
  await p.keyboard.press('Escape'); await wacht(600); // de notitie dicht
  // Terug in het detailscherm: het blok met de notitie, en het knopje bovenin gekleurd
  assert.match(await p.locator('.paneel.detail .nkort').innerText(), /offerte voor de pilot/);
  assert.deepEqual(await p.locator('.paneel.detail .nlabel').allInnerTexts(), ['#pilot']);
  assert.equal(await p.locator('.paneel.detail .kopknop.aan').count(), 1);
  // Na herstarten
  await p.reload(); await wacht(1200);
  await p.locator('#inhoud [data-id]').first().tap(); await wacht(800);
  assert.match(await p.locator('.paneel.detail .nkort').innerText(), /offerte voor de pilot/);
  assert.deepEqual(p.fouten, []);
});

test('notities: labels die al bestaan gaan voor, ook met andere hoofdletters', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.evaluate(async () => {
    await laadNotities();
    const n = maakNotitie(); wijzigNotitie(n, { tekst: 'Eerste', labels: ['Pilot', 'Klant A'] });
    const m = maakNotitie(); wijzigNotitie(m, { tekst: 'Tweede', labels: ['Pilot'] });
  });
  await p.evaluate(() => openNotitie()); await wacht(800);
  await p.fill('#nottitel', 'Derde');
  await p.locator('#nottekst').tap(); await wacht(300);
  await p.locator('#nottekst').pressSequentially('Tekst #KLANT '); await wacht(200); // de spatie maakt er een tag van, in kleine letters
  assert.equal(await p.locator('.aanvullijst:visible').count(), 0, 'geen voorstellen');
  assert.deepEqual(await p.locator('#notlabels .tag').allInnerTexts(), ['#klant']);
  await p.locator('#notlabels .tag').tap(); await p.locator('#notlabels .tag').tap(); await wacht(200); // twee tikken: weg
  assert.deepEqual(await p.locator('#notlabels .tag').allInnerTexts(), []);
  assert.equal(await p.locator('#notlabelsectie').isVisible(), false, 'zonder labels geen regel');
  await p.locator('#nottekst').tap(); await p.keyboard.press('Control+End');
  await p.locator('#nottekst').pressSequentially('#Klant-A #pilot '); await wacht(200);
  assert.deepEqual(await p.locator('#notlabels .tag').allInnerTexts(), ['#klant-a', '#pilot']);
  // Een tik kiest de tag, nog een tik haalt hem weg
  await p.locator('#notlabels .tag', { hasText: '#pilot' }).tap(); await wacht(100);
  assert.equal(await p.locator('#notlabels .tag.aan').innerText(), '#pilot');
  await p.locator('#notlabels .tag.aan').tap(); await wacht(200);
  assert.deepEqual(await p.locator('#notlabels .tag').allInnerTexts(), ['#klant-a']);
  assert.deepEqual(await p.evaluate(() => NOTITIES.find((n) => n.tekst.startsWith('Derde')).labels), ['klant-a']);
  assert.deepEqual(p.fouten, []);
});

test('notities: de tab zoekt op tekst, filtert op label, en een losse notitie kan via de plusknop', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  p.on('dialog', (d) => d.accept());
  await p.goto(url); await wacht(1000);
  await p.evaluate(async () => {
    await laadNotities();
    const n = maakNotitie(); wijzigNotitie(n, { tekst: 'Planning van de pilot', labels: ['Pilot'] });
    const m = maakNotitie(); wijzigNotitie(m, { tekst: 'Begroting voor volgend jaar', labels: ['Klant A'] });
  });
  // Een losse notitie via de plusknop
  await p.locator('#tabbalk .plusknop').tap(); await wacht(400);
  await p.locator('.keuzemenu [data-keuze="notitie"]').tap(); await wacht(800);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'nottitel', 'de cursor staat in de titel');
  await p.fill('#nottitel', 'Idee voor de nieuwsbrief');
  await p.keyboard.press('Escape'); await wacht(600);
  // De tab Notities: zoeken in de kop, geen weekkeuze en pijlen
  await p.locator('#tabbalk [data-tab="notities"]').tap(); await wacht(700);
  assert.equal(await p.locator('#titel').innerText(), 'Notities');
  assert.equal(await p.locator('#capsule').isVisible(), false);
  assert.equal(await p.locator('#schakelaar').isVisible(), false);
  assert.equal(await p.locator('#notlijst .notitierij').count(), 3);
  assert.ok(await p.locator('#notzoek').evaluate((x) => parseFloat(getComputedStyle(x).fontSize)) >= 16);
  await p.fill('#notzoek', 'pilot'); await wacht(200);
  assert.deepEqual(await p.locator('#notlijst .notitierij .t1').allInnerTexts(), ['Planning van de pilot']);
  await p.fill('#notzoek', 'niets hierover'); await wacht(200);
  assert.equal(await p.locator('#notlijst').innerText(), 'Niets gevonden');
  await p.fill('#notzoek', ''); await wacht(200);
  // Labels als blokjes in het zoekveld: een tik in het zoekveld toont Te doen en de labels
  assert.equal(await p.locator('#notfilter').count(), 0, 'geen regels met labels boven de lijst');
  await p.locator('#notzoek').tap(); await wacht(200);
  assert.deepEqual(await p.locator('#zoekvoorstel .zvlabels .chip').allInnerTexts(), ['#klant-a', '#pilot']);
  await p.locator('#zoekvoorstel [data-zv="klant-a"]').tap(); await wacht(200);
  assert.deepEqual(await p.locator('#zoektokens .zoektoken').allInnerTexts(), ['#klant-a']);
  assert.deepEqual(await p.locator('#notlijst .notitierij .t1').allInnerTexts(), ['Begroting voor volgend jaar']);
  await p.keyboard.press('Backspace'); await wacht(200); // het blokje weer weg
  assert.equal(await p.locator('#zoektokens .zoektoken').count(), 0);
  // Labels binnen een label: na het eerste blokje staan de labels die daarbinnen voorkomen
  await p.evaluate(() => {
    const a = maakNotitie(); wijzigNotitie(a, { tekst: 'Pilot planning', labels: ['pilot', 'planning'] });
    const b = maakNotitie(); wijzigNotitie(b, { tekst: 'Pilot budget', labels: ['pilot', 'budget'] });
    tekenNotities(); toonVoorstel();
  }); await wacht(200);
  await p.locator('#zoekvoorstel [data-zv="pilot"]').tap(); await wacht(200);
  assert.match(await p.locator('#zoekvoorstel .zvkop').innerText(), /Binnen #pilot/i);
  assert.deepEqual(await p.locator('#zoekvoorstel .zvlabels .chip').allInnerTexts(), ['#budget', '#planning']);
  await p.locator('#zoekvoorstel [data-zv="budget"]').tap(); await wacht(200);
  assert.deepEqual(await p.locator('#notlijst .notitierij .t1').allInnerTexts(), ['Pilot budget']);
  await p.locator('#zoektokens .zoektoken').first().tap(); await wacht(200); // #pilot weg: alleen nog #budget
  assert.deepEqual(await p.locator('#zoektokens .zoektoken').allInnerTexts(), ['#budget']);
  await p.locator('#zoektokens .zoektoken').first().tap(); await wacht(200);
  assert.equal(await p.locator('#notlijst .notitierij').count(), 5);
  // Een hekje in het zoekveld: alleen de labels die zo beginnen
  await p.locator('#notzoek').tap(); await p.fill('#notzoek', '#pl'); await wacht(200);
  assert.deepEqual(await p.locator('#zoekvoorstel .zvlabels .chip').allInnerTexts(), ['#planning']);
  assert.deepEqual(await p.locator('#notlijst .notitierij .t1').allInnerTexts(), ['Pilot planning']);
  await p.fill('#notzoek', ''); await wacht(200);
  await p.evaluate(() => { NOTITIES.filter((n) => n.tekst.startsWith('Pilot ')).forEach((n) => wijzigNotitie(n, { tekst: '', labels: [] })); tekenNotities(); }); await wacht(200);
  await p.locator('#zoekvoorstel [data-zv="klant-a"]').tap(); await wacht(200);
  await p.keyboard.press('Enter'); await wacht(200);
  // Verwijderen vanuit het overzicht
  await p.locator('#notlijst .notitierij').first().tap(); await wacht(800);
  assert.equal(await p.locator('.notpagina.open').count(), 1, 'op de iPhone een eigen scherm');
  assert.equal(await p.locator('#tabbalk').isVisible(), false, 'het scherm eronder schemert niet door het toetsenbord');
  await p.locator('.notpagina [data-actie="notmenu"]').tap(); await wacht(400);
  await p.locator('.keuzemenu.notmenu [data-menu="verwijder"]').tap(); await wacht(700);
  assert.equal(await p.locator('#zoektokens .zoektoken').count(), 0, 'het label verdwijnt als niets het meer gebruikt');
  assert.equal(await p.locator('#tabbalk').isVisible(), true, 'na het sluiten weer zichtbaar');
  assert.equal(await p.locator('#notlijst .notitierij').count(), 2);
  assert.equal(await p.evaluate(() => NOTITIES.filter((n) => n.weg).length), 1, 'verwijderd, maar gemarkeerd voor de andere toestellen');
  // In de tab Notities staat Notitie onderaan het plusmenu, het dichtst bij de duim
  await p.locator('#tabbalk .plusknop').tap(); await wacht(400);
  assert.deepEqual(await p.locator('.keuzemenu [role="menuitem"]').allInnerTexts(), ['Tijden uit een mail', 'Nieuwe afspraak', 'Notitie']);
  assert.deepEqual(p.fouten, []);
});

test('actiepunten: bovenaan de notitie, met een deadline, via ! in de tekst, en Te doen als overzicht', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.evaluate(() => openNotitie()); await wacht(800);
  await p.fill('#nottitel', 'Overleg pilot');
  // Labels en actiepunten verschijnen pas als ze er zijn; het tekstveld zegt hoe
  assert.equal(await p.locator('#notlabelsectie').isVisible(), false);
  assert.equal(await p.locator('#notpuntsectie').isVisible(), false);
  assert.match(await p.locator('#nottekst').getAttribute('placeholder'), /#label of ! actiepunt/);
  // Een lange tekst: het veld groeit mee, alleen het scherm scrolt
  await p.locator('#nottekst').fill('Regel\n'.repeat(80)); await wacht(200);
  const veld = await p.evaluate(() => { const t = $('#nottekst'), s = $('.notpagina'); return { t: t.scrollHeight - t.clientHeight, s: s.scrollHeight > s.clientHeight }; });
  assert.deepEqual(veld, { t: 0, s: true }, 'geen scrollbalk in het tekstveld');
  // De cursor onderaan blijft in beeld, ook als het scherm eromheen nog bovenaan staat (zoals als het toetsenbord opengaat)
  const cursor = await p.evaluate(() => { const t = $('#nottekst'), s = $('.notpagina'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); s.scrollTop = 0;
    caretInBeeld(t); return s.scrollTop >= s.scrollHeight - s.clientHeight - 60; });
  assert.ok(cursor, 'de cursor onderaan de tekst is in beeld');
  await p.locator('#nottekst').fill(''); await wacht(200);
  await p.locator('#nottekst').tap(); await p.keyboard.type('! Offerte sturen'); await p.keyboard.press('Enter'); await wacht(200);
  await p.locator('#notpunten .punttekst').first().focus(); await p.keyboard.press('End'); await p.keyboard.press('Enter'); await wacht(200);
  await p.keyboard.type('Planning delen'); await wacht(200);
  assert.deepEqual(await p.locator('#notpunten .punttekst').evaluateAll((l) => l.map((x) => x.value)), ['Offerte sturen', 'Planning delen']);
  assert.ok(await p.locator('#notpunten .punttekst').first().evaluate((x) => parseFloat(getComputedStyle(x).fontSize)) >= 16);
  // Een deadline: gisteren, dus te laat
  await p.locator('#notpunten .puntkiezer').first().evaluate((k) => { k.value = '2026-11-03'; k.dispatchEvent(new Event('change', { bubbles: true })); }); await wacht(200);
  assert.equal(await p.locator('#notpunten .puntdatum.laat').innerText(), 'Gisteren');
  // Herstel in de datumkiezer van iOS gaat terug naar de beginwaarde; die is leeg, dus de deadline gaat weg
  await p.locator('#notpunten .puntkiezer').first().evaluate((k) => { k.value = k.defaultValue; k.dispatchEvent(new Event('input', { bubbles: true })); }); await wacht(200);
  assert.equal(await p.locator('#notpunten .puntdatum.aan').count(), 0, 'Herstel haalt de deadline weg');
  // De kiezer blijft open: na een keuze is het veld nog hetzelfde (iOS kiest bij het openen meteen vandaag)
  assert.ok(await p.locator('#notpunten .puntkiezer').first().evaluate((k) => { k.value = '2026-11-04'; k.dispatchEvent(new Event('change', { bubbles: true })); return k.isConnected; }), 'het veld blijft staan');
  assert.equal(await p.locator('#notpunten .puntdatum.aan').first().innerText(), 'Vandaag');
  await p.locator('#notpunten .puntkiezer').first().evaluate((k) => { k.value = '2026-11-03'; k.dispatchEvent(new Event('change', { bubbles: true })); }); await wacht(200);
  // Een kruisje haalt een actiepunt weg
  await p.locator('#notpunten .punt', { hasText: '' }).last().locator('.puntweg').tap(); await wacht(200);
  assert.equal(await p.locator('#notpunten .punt').count(), 1);
  await p.locator('#notpunten .punttekst').first().focus(); await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.keyboard.type('Planning delen'); await wacht(200);
  // Op een touchscreen tik je direct op de datumkiezer zelf (iOS opent die dan zonder tussenstap)
  const opDeKnop = await p.evaluate(() => { const r = $('#notpunten .puntdatum').getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).className; });
  assert.equal(opDeKnop, 'puntkiezer');
  // Een regel met ! in de tekst wordt bij Enter een actiepunt
  await p.locator('#nottekst').tap(); await p.keyboard.type('Afgesproken: we starten in januari.\n! Team uitnodigen'); await p.keyboard.press('Enter'); await wacht(200);
  assert.equal(await p.locator('#nottekst').inputValue(), 'Afgesproken: we starten in januari.\n');
  assert.equal(await p.locator('#notpunten .punt').count(), 3);
  // Een woord met een hekje in de tekst wordt een label (net als ! voor een actiepunt); #123 blijft tekst
  await p.keyboard.type('Zie melding #123 en #Klant verder'); await wacht(200);
  assert.equal(await p.locator('#nottekst').inputValue(), 'Afgesproken: we starten in januari.\nZie melding #123 en verder');
  assert.deepEqual(await p.locator('#notlabels .tag').allInnerTexts(), ['#klant']);
  // Ook in een ! -regel: het punt zonder het label, het label bij de notitie
  await p.keyboard.press('Enter'); await p.keyboard.type('! Contract tekenen #juridisch'); await p.keyboard.press('Enter'); await wacht(200);
  assert.equal(await p.locator('#notpunten .punttekst').nth(3).inputValue(), 'Contract tekenen');
  assert.deepEqual(await p.locator('#notlabels .tag').allInnerTexts(), ['#klant', '#juridisch']);
  await p.locator('#notpunten .punt').nth(3).locator('.puntvink').tap(); await wacht(200); // afgevinkt: telt verder niet mee
  // Afvinken in de notitie
  await p.locator('#notpunten .punt').nth(1).locator('.puntvink').tap(); await wacht(200);
  assert.equal(await p.locator('#notpunten .punt.klaar').count(), 2);
  await p.keyboard.press('Escape'); await wacht(600);
  // Een los actiepunt: een notitie met alleen dat punt; de titel is het punt
  await p.evaluate(() => { const n = maakNotitie(); wijzigNotitie(n, { punten: [{ id: 'los', tekst: 'Boek terugbrengen', klaar: false, deadline: null }] }); });
  await p.locator('#tabbalk [data-tab="notities"]').tap(); await wacht(700);
  assert.ok((await p.locator('#notlijst .notitierij .t1').allInnerTexts()).includes('Boek terugbrengen'));
  // Te doen: alle open actiepunten, geordend op deadline
  await p.locator('#notzoek').tap(); await wacht(200);
  assert.match(await p.locator('#zoekvoorstel [data-zv="tedoen"]').innerText(), /Te doen\s*3/);
  await p.locator('#zoekvoorstel [data-zv="tedoen"]').tap(); await wacht(300);
  await p.keyboard.press('Enter'); await wacht(200);
  assert.deepEqual(await p.locator('#notlijst .ngroep').allInnerTexts(), ['Te laat', 'Zonder deadline']);
  assert.deepEqual(await p.locator('#notlijst .tdrij .t1').allInnerTexts(), ['Offerte sturen', 'Boek terugbrengen', 'Team uitnodigen']);
  assert.match(await p.locator('#notlijst .tdrij').first().innerText(), /Gisteren\s*Overleg pilot/);
  await p.locator('#notlijst .tdrij').first().locator('.puntvink').tap(); await wacht(300);
  assert.deepEqual(await p.locator('#notlijst .tdrij .t1').allInnerTexts(), ['Boek terugbrengen', 'Team uitnodigen']);
  // Een tik op een punt opent de notitie
  await p.locator('#notlijst .tdrij .t1', { hasText: 'Team uitnodigen' }).tap(); await wacht(800);
  assert.equal(await p.locator('#nottitel').inputValue(), 'Overleg pilot');
  assert.deepEqual(p.fouten, []);
});

test('actiepunten in de agenda: een balk boven de dag, vandaag ook wat te laat is; niet bij Vrij', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, TELEFOON);
  await p.goto(url); await wacht(1000);
  await p.evaluate(async () => {
    await laadNotities();
    const n = maakNotitie(); wijzigNotitie(n, { tekst: 'Overleg pilot', punten: [
      { id: 'a', tekst: 'Offerte sturen', klaar: false, deadline: '2026-11-03' },
      { id: 'b', tekst: 'Planning delen', klaar: false, deadline: '2026-11-04' },
      { id: 'c', tekst: 'Zaal reserveren', klaar: false, deadline: '2026-11-06' },
      { id: 'd', tekst: 'Al gedaan', klaar: true, deadline: '2026-11-04' }] });
    behoudDag(render);
  }); await wacht(400);
  // Als balk direct onder de dag, boven de afspraken
  const vandaag = p.locator('#inhoud h2.dagkop.vandaag + .vbpunten');
  assert.deepEqual(await vandaag.locator('.agtekst').allInnerTexts(), ['Offerte sturen', 'Planning delen']);
  assert.deepEqual(await vandaag.locator('.aglaat').allInnerTexts(), ['Gisteren'], 'te laat staat er los achter');
  // Een tik op de balk opent het overzicht van de dag; daar vink je af
  await vandaag.tap(); await wacht(700);
  assert.equal(await p.locator('.paneel.dagpunten .dtitel').innerText(), 'Actiepunten');
  assert.deepEqual(await p.locator('.paneel.dagpunten .dagtekst .t1').allInnerTexts(), ['Offerte sturen', 'Planning delen']);
  await p.locator('.paneel.dagpunten [data-dagvink$="|a"]').tap(); await wacht(700);
  assert.deepEqual(await p.locator('.paneel.dagpunten .dagtekst .t1').allInnerTexts(), ['Planning delen']);
  await p.keyboard.press('Escape'); await wacht(600);
  assert.deepEqual(await p.locator('#inhoud h2.dagkop.vandaag + .vbpunten .agtekst').allInnerTexts(), ['Planning delen']);
  // Bij Vrij niet
  await p.locator('[data-filter="free"]:visible').first().tap(); await wacht(300);
  assert.equal(await p.locator('#inhoud .vbpunten').count(), 0);
  // Vooruitblik: de actiepunten als balk boven de afspraken
  await p.locator('[data-filter="notable"]:visible').first().tap(); await wacht(200);
  await p.evaluate(() => kiesTab('forecast')); await wacht(600);
  assert.equal(await p.locator('#inhoud .vbpunten').count(), 2);
  // Vanuit het overzicht van de dag opent een tik op de tekst de notitie
  await p.locator('#inhoud .vbpunten').first().tap(); await wacht(700);
  await p.locator('.paneel.dagpunten [data-dagnotitie]').first().tap(); await wacht(800);
  assert.equal(await p.locator('#nottitel').inputValue(), 'Overleg pilot');
  assert.deepEqual(p.fouten, []);
});

test('notities op de Mac: filters in de zijbalk, de lijst en rechts de notitie', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, MAC);
  await p.goto(url); await wacht(1000);
  await p.evaluate(async () => {
    await laadNotities();
    const a = maakNotitie(); wijzigNotitie(a, { tekst: 'Eerste notitie', labels: ['Pilot'], punten: [{ id: 'x', tekst: 'Offerte sturen', klaar: false, deadline: '2026-11-05' }] });
    const b = maakNotitie(); wijzigNotitie(b, { tekst: 'Tweede notitie', labels: ['Klant A'] });
  });
  await p.locator('#zijbalk [data-nf-soort="alle"]').click(); await wacht(700);
  // In de zijbalk de filters met aantallen, boven de lijst het zoekveld, en rechts de bovenste notitie (gekleurd in de lijst)
  assert.equal(await p.locator('.notilinks > #zoekbalk').count(), 1, 'het zoekveld boven de lijst');
  assert.match(await p.locator('#zbnotfilters [data-nf-soort="alle"]').innerText(), /Alle notities\s*2/);
  assert.match(await p.locator('#zbnotfilters [data-nf-soort="tedoen"]').innerText(), /Actiepunten\s*1/);
  assert.equal(await p.locator('#notlijst .notitierij').count(), 2);
  assert.equal(await p.locator('#notlijst .notitierij.aan').count(), 1);
  assert.equal(await p.locator('#notipaneel #nottitel').inputValue(), await p.locator('#notlijst .notitierij.aan .t1').innerText());
  assert.equal(await p.locator('#notlijst .nlabel').count(), 0, 'geen labels in de lijst');
  // Een label kiezen en weer weghalen; de keuze staat links, niet in het zoekveld
  await p.locator('#zbnotfilters [data-nf-label="pilot"]').click(); await wacht(200);
  assert.equal(await p.locator('#zbnotfilters [data-nf-label="pilot"][role="checkbox"][aria-checked="true"] .zbkeus.aan').count(), 1, 'een vinkvakje dat aan staat');
  assert.deepEqual(await p.locator('#notlijst .notitierij .t1').allInnerTexts(), ['Eerste notitie']);
  assert.equal(await p.locator('#zoektokens .zoektoken').count(), 0);
  await p.locator('#zbnotfilters [data-nf-label="pilot"]').click(); await wacht(200);
  assert.equal(await p.locator('#notlijst .notitierij').count(), 2);
  // Actiepunten per deadline; rechts de notitie van het bovenste punt
  await p.locator('#zbnotfilters [data-nf-soort="tedoen"]').click(); await wacht(300);
  assert.equal(await p.locator('#notlijst .tdrij').count(), 1);
  assert.equal(await p.locator('#notlijst .ngroep').first().innerText(), 'Morgen');
  assert.equal(await p.locator('#notipaneel #nottitel').inputValue(), 'Eerste notitie');
  // Twee punten in dezelfde notitie: alleen het punt waarop je tikt is gekleurd
  await p.evaluate(() => { const n = NOTITIES.find((x) => x.tekst === 'Eerste notitie'); wijzigNotitie(n, { punten: [...punten(n), { id: 'y', tekst: 'Planning delen', klaar: false, deadline: null }] }); tekenNotities(); });
  await wacht(200);
  assert.deepEqual(await p.locator('#notlijst .tdrij.aan .t1').allInnerTexts(), ['Offerte sturen'], 'eerst het eerste punt');
  await p.locator('#notlijst .tdrij', { hasText: 'Planning delen' }).click(); await wacht(300);
  assert.deepEqual(await p.locator('#notlijst .tdrij.aan .t1').allInnerTexts(), ['Planning delen']);
  assert.equal(await p.locator('#notipaneel #nottitel').inputValue(), 'Eerste notitie', 'rechts dezelfde notitie');
  assert.equal(await p.locator('#zbnotfilters [data-nf-soort="afspraak"]').count(), 0, 'geen filter Bij afspraak');
  assert.match(await p.locator('#zbnotfilters [data-nf-label="pilot"]').innerText(), /^pilot\s*2$/, 'labels zonder #, met het aantal open punten');
  await p.locator('#zbnotfilters [data-nf-soort="alle"]').click(); await wacht(300);
  // Een notitie kiezen: rechts, niet als eigen scherm; typen loopt mee in de lijst
  await p.locator('#notlijst .notitierij', { hasText: 'Eerste notitie' }).click(); await wacht(400);
  assert.equal(await p.locator('.notpagina').count(), 0, 'geen eigen scherm');
  assert.ok(await p.locator('#nottitel').evaluate((x) => parseFloat(getComputedStyle(x).fontSize)) >= 24, 'de titel groot bovenaan');
  await p.locator('#nottitel').click(); await p.keyboard.press('End');
  await p.keyboard.type(' en meer'); await wacht(200);
  // Komt er intussen iets binnen (synchroniseren), dan blijft de notitie staan en kun je verder typen
  await p.evaluate(() => tekenNotities()); await wacht(100);
  await p.keyboard.type('!'); await wacht(200);
  assert.equal(await p.locator('#nottitel').inputValue(), 'Eerste notitie en meer!');
  assert.ok((await p.locator('#notlijst .notitierij .t1').allInnerTexts()).includes('Eerste notitie en meer!'), 'de lijst loopt mee');
  // Nieuw, Notitie: rechts een lege notitie; pas na typen staat hij in de lijst
  await p.locator('#nieuwknop').click(); await wacht(300);
  assert.equal(await p.locator('.keuzemenu [role="menuitem"]').first().innerText(), 'Notitie', 'in Notities bovenaan');
  await p.locator('.keuzemenu [data-keuze="notitie"]').click(); await wacht(500);
  assert.equal(await p.locator('#notipaneel #nottitel').inputValue(), '');
  assert.equal(await p.locator('#notlijst .notitierij').count(), 2);
  await p.keyboard.type('Derde notitie'); await p.keyboard.press('Enter'); await p.keyboard.type('Met een tweede regel'); await wacht(300);
  assert.equal(await p.evaluate(() => NOTITIES.find((n) => n.tekst.startsWith('Derde')).tekst), 'Derde notitie\nMet een tweede regel');
  assert.equal(await p.locator('#notlijst .notitierij').count(), 3);
  // Een notitie bij een afspraak: de titel van de afspraak bovenaan en in de lijst
  await p.evaluate(() => { const e = [...DATA.ruw.values()].find((x) => !x.allDay); const n = maakNotitie(e); wijzigNotitie(n, { tekst: 'Over de offerte' }); tekenNotities(); });
  await wacht(300);
  const titel = await p.evaluate(() => [...DATA.ruw.values()].find((x) => !x.allDay).title);
  await p.locator('#notlijst .notitierij', { hasText: titel }).click(); await wacht(500);
  assert.equal(await p.locator('#notipaneel h2.dtitel').innerText(), titel);
  assert.equal(await p.locator('#notipaneel #nottekst').inputValue(), 'Over de offerte');
  // Labels: #woord en een spatie wordt een tag in de notitie, en het label verschijnt links
  await p.locator('#nottekst').click(); await p.keyboard.press('Control+End'); await p.keyboard.type(' #Overleg '); await wacht(200);
  assert.deepEqual(await p.locator('#notipaneel #notlabels .tag').allInnerTexts(), ['#overleg']);
  assert.equal(await p.locator('#zbnotfilters [data-nf-label="overleg"]').count(), 1);
  assert.equal(await p.locator('#notlijst .nlabel').count(), 0, 'ook nu geen labels in de lijst');
  assert.deepEqual(p.fouten, []);
});

test('notities op de iPad: filters links in te klappen, en de tabbalk nooit over de notitie', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, IPAD);
  await p.goto(url); await wacht(1000);
  await p.evaluate(async () => { await laadNotities(); const a = maakNotitie(); wijzigNotitie(a, { tekst: `Notitie op de iPad\n${'Een lange regel tekst. '.repeat(300)}`, labels: ['pilot'] }); });
  await p.locator('#tabbalk [data-tab="notities"]').tap(); await wacht(800);
  const vak = (s) => p.locator(s).evaluate((x) => { const r = x.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
  // Drie kolommen: de filters, de lijst en de notitie. De werkbalk wijkt: titel, knopje en zoekveld staan boven de lijst
  assert.equal(await p.locator('#kop').isVisible(), false);
  assert.ok((await vak('#zijbalk')).r > 200, 'de filters staan links');
  assert.equal(await p.locator('.notkop #zijbalkknop').count(), 1, 'het knopje naast de titel');
  assert.equal(await p.locator('.notilinks > #zoekbalk').count(), 1);
  // De tabbalk ligt links, onder de filters en de lijst; de notitie loopt door tot de onderrand
  const balk = await vak('#tabbalk .kolom'), notitie = await vak('#notipaneel');
  assert.ok(balk.r <= notitie.l, `de tabbalk (tot ${balk.r}) ligt niet over de notitie (vanaf ${notitie.l})`);
  assert.ok(notitie.b >= 1024 - 1, 'de notitie tot de onderrand');
  // Ingeklapt: de tabbalk onder de lijst, nog steeds niet over de notitie; een gekozen label als blokje in het zoekveld
  await p.locator('#zbnotfilters [data-nf-label="pilot"]').tap(); await wacht(300);
  assert.equal(await p.locator('#zoektokens .zoektoken').count(), 0, 'met de filters in beeld niet in het zoekveld');
  await p.locator('#zijbalkknop').tap(); await wacht(700);
  const balk2 = await vak('#tabbalk .kolom'), notitie2 = await vak('#notipaneel'), lijst = await vak('.notilinks');
  assert.ok(balk2.l >= lijst.l && balk2.r <= notitie2.l, 'de tabbalk onder de lijst');
  assert.deepEqual(await p.locator('#zoektokens .zoektoken').allInnerTexts(), ['#pilot']);
  // Weer open, en naar de agenda: de tabbalk staat daar op dezelfde plek, en de maandkalender is standaard dicht
  await p.locator('#zijbalkknop').tap(); await wacht(700);
  const x = (await vak('#tabbalk .kolom')).l;
  await p.locator('#tabbalk [data-tab="agenda"]').tap(); await wacht(800);
  assert.equal((await vak('#tabbalk .kolom')).l, x, 'de tabbalk verspringt niet');
  assert.ok(await p.evaluate(() => document.body.classList.contains('zbdicht')), 'de maandkalender dicht');
  // Instellingen: geen zijbalk en geen knopje, ook niet als de maandkalender in de agenda open staat
  await p.locator('#zijbalkknop').tap(); await wacht(500);
  await p.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(800);
  assert.equal(await p.locator('#zijbalkknop').isVisible(), false, 'geen knopje');
  assert.ok((await vak('#zijbalk')).r <= 1, 'geen zijbalk');
  await p.locator('#tabbalk [data-tab="agenda"]').tap(); await wacht(800);
  await p.locator('#zijbalkknop').tap(); await wacht(500); // de maandkalender weer dicht
  // Terug naar Notities: de filters staan weer open
  await p.locator('#tabbalk [data-tab="notities"]').tap(); await wacht(800);
  assert.ok(!(await p.evaluate(() => document.body.classList.contains('zbdicht'))), 'de filters open');
  // Vanuit een afspraak: de notitie opent in de tab Notities, rechts naast de lijst, met de cursor in de tekst. Het
  // gekozen label (pilot) gaat uit, anders zou de nieuwe notitie niet in de lijst staan.
  const vanuitAfspraak = async () => {
    await p.locator('#tabbalk [data-tab="agenda"]').tap(); await wacht(800);
    await p.locator('#inhoud [data-id]').first().tap(); await wacht(700);
    const titel = await p.locator('.paneel.detail.open h2').first().innerText();
    await p.locator('.paneel.detail.open .rond[data-actie="eigennotitie"]:visible').tap(); await wacht(900);
    return titel;
  };
  const titel = await vanuitAfspraak();
  assert.equal(await p.evaluate(() => ST.tab), 'notities');
  assert.equal(await p.locator('.paneel.detail.open').count(), 0, 'het afspraakvenster is dicht');
  assert.equal(await p.locator('#notipaneel h2.dtitel').innerText(), titel);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'nottekst', 'meteen typen');
  await p.keyboard.type('Verslag van het overleg'); await wacht(300);
  assert.equal(await p.locator('#notlijst .notitierij.aan .t1').innerText(), titel, 'gekozen in de lijst');
  assert.equal(await p.locator('#zbnotfilters [aria-checked="true"]').count(), 0, 'geen label meer aangevinkt');
  // Nog een keer vanuit dezelfde afspraak: dezelfde notitie, geen tweede
  await vanuitAfspraak();
  assert.equal(await p.locator('#notipaneel #nottekst').inputValue(), 'Verslag van het overleg');
  assert.notEqual(await p.evaluate(() => document.activeElement.id), 'nottekst', 'een bestaande notitie zonder cursor');
  assert.equal(await p.locator('#notipaneel').evaluate((x) => x.scrollTop), 0, 'en bovenaan');
  // De plusknop in de agenda: Notitie opent ook in de tab Notities, niet als venster
  await p.locator('#tabbalk [data-tab="agenda"]').tap(); await wacht(800);
  await p.locator('#tabbalk .plusknop').tap(); await wacht(400);
  await p.locator('.keuzemenu [data-keuze="notitie"]').tap(); await wacht(800);
  assert.equal(await p.evaluate(() => ST.tab), 'notities');
  assert.equal(await p.locator('.paneel.notitie').count(), 0, 'geen venster');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'nottitel', 'de cursor in de titel');
  assert.equal(await p.evaluate((t) => NOTITIES.filter((n) => !n.weg && n.afspraak && n.afspraak.titel === t).length, titel), 1);
  assert.deepEqual(p.fouten, []);
});

/* -------------------------------------------------------------- synchroniseren */

test('worker: notities bewaren, de laatste wijziging wint, en zonder database of sleutel niets', async () => {
  const roep = (env, pad, opties = {}) => worker.fetch(new Request(`https://agenda.voorbeeld.workers.dev${pad}`, { ...opties, headers: { Origin: 'https://rserne.github.io' } }), env);
  const stuur = (env, notities) => roep(env, '/notities?sleutel=test', { method: 'POST', body: JSON.stringify({ notities }) });
  const haal = async (env, sinds) => (await roep(env, `/notities?sleutel=test&sinds=${sinds}`)).json();
  assert.equal((await roep({ SLEUTEL: 'test' }, '/notities?sleutel=test')).status, 501, 'zonder database');
  const env = { SLEUTEL: 'test', DB: nepD1() };
  assert.equal((await roep(env, '/notities?sleutel=fout')).status, 403);
  assert.equal((await roep(env, '/notities?sleutel=test', { method: 'PUT', body: '{}' })).status, 405);
  const opties = await roep(env, '/notities', { method: 'OPTIONS' });
  assert.equal(opties.headers.get('Access-Control-Allow-Methods'), 'GET, POST');
  assert.equal(opties.headers.get('Access-Control-Allow-Origin'), 'https://rserne.github.io');
  assert.deepEqual(await (await stuur(env, [{ id: 'a', tekst: 'Eerste', gewijzigd: 100 }, { id: 'b', tekst: 'Tweede', gewijzigd: 200 }])).json(), { ontvangen: 2 });
  let h = await haal(env, 0);
  assert.deepEqual(h.notities.map((n) => n.tekst), ['Eerste', 'Tweede']);
  assert.equal(h.versie, 2);
  await stuur(env, [{ id: 'a', tekst: 'Ouder', gewijzigd: 50 }]);
  assert.deepEqual((await haal(env, 2)).notities, [], 'een oudere wijziging verandert niets');
  await stuur(env, [{ id: 'a', tekst: 'Nieuwer', gewijzigd: 300 }]);
  h = await haal(env, 2);
  assert.deepEqual(h.notities.map((n) => n.tekst), ['Nieuwer']);
  assert.equal(h.versie, 3);
  assert.equal((await roep(env, '/notities?sleutel=test', { method: 'POST', body: 'geen json' })).status, 400);
  assert.equal((await roep({ SLEUTEL: 'test' }, '/?sleutel=test')).status, 500, 'de agenda mist ICS_URL');
});

test('worker: ruimtes als één lijst; een nieuwere lijst wint, een oudere verandert niets', async () => {
  const roep = (env, pad, opties = {}) => worker.fetch(new Request(`https://agenda.voorbeeld.workers.dev${pad}`, { ...opties, headers: { Origin: 'https://rserne.github.io' } }), env);
  const stuur = async (env, ruimtes, gewijzigd) => (await roep(env, '/ruimtes?sleutel=test', { method: 'POST', body: JSON.stringify({ ruimtes, gewijzigd }) })).json();
  assert.equal((await roep({ SLEUTEL: 'test' }, '/ruimtes?sleutel=test')).status, 501, 'zonder database');
  const env = { SLEUTEL: 'test', DB: nepD1() };
  assert.equal((await roep(env, '/ruimtes?sleutel=fout')).status, 403);
  assert.deepEqual(await (await roep(env, '/ruimtes?sleutel=test')).json(), { ruimtes: null, gewijzigd: 0 }, 'nog niets');
  assert.deepEqual(await stuur(env, [{ naam: 'Zonnezaal', email: 'zonnezaal@voorbeeld.nl' }], 100), { ruimtes: [{ naam: 'Zonnezaal', email: 'zonnezaal@voorbeeld.nl' }], gewijzigd: 100 });
  assert.deepEqual(await stuur(env, [{ naam: 'Ouder', email: '' }], 50), { ruimtes: [{ naam: 'Zonnezaal', email: 'zonnezaal@voorbeeld.nl' }], gewijzigd: 100 }, 'ouder: de huidige lijst blijft');
  assert.deepEqual((await stuur(env, [{ naam: 'Coupé', email: '' }, { naam: 'Kelder', email: '' }], 200)).ruimtes.map((r) => r.naam), ['Coupé', 'Kelder']);
  assert.equal((await roep(env, '/ruimtes?sleutel=test', { method: 'POST', body: JSON.stringify({ ruimtes: [{ naam: 1 }], gewijzigd: 300 }) })).status, 400);
  assert.equal((await roep(env, '/ruimtes?sleutel=test', { method: 'POST', body: 'geen json' })).status, 400);
});

test('synchroniseren: een notitie van de iPhone staat even later op de Mac; wijzigen en verwijderen gaan mee', async ({ browser, url }) => {
  const env = { SLEUTEL: 'test', DB: nepD1() };
  const ics = fs.readFileSync(ICS, 'utf8');
  const koppel = (p) => p.context().route('https://agenda.voorbeeld.workers.dev/**', async (r) => {
    const v = r.request();
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (!['/notities', '/ruimtes'].includes(new URL(v.url()).pathname)) return r.fulfill({ status: 200, contentType: 'text/calendar', headers: cors, body: ics });
    const a = await worker.fetch(new Request(v.url(), { method: v.method(), body: v.method() === 'POST' ? v.postData() : undefined }), env);
    r.fulfill({ status: a.status, contentType: a.headers.get('Content-Type') || 'text/plain', headers: cors, body: await a.text() });
  });
  const iphone = await nieuwePagina(browser, TELEFOON);
  const mac = await nieuwePagina(browser, MAC);
  for (const p of [iphone, mac]) { await koppel(p); await p.goto(url); await wacht(800); await p.evaluate((l) => gebruikLink(l), LINK); }
  await wacht(4000);
  const sync = (p) => p.evaluate(async () => { while (SYNC.bezig) await new Promise((r) => setTimeout(r, 100)); await synchroniseer(); return levendeNotities().map((n) => n.tekst); });
  // Op de iPhone een notitie maken: kort daarna gaat hij vanzelf naar de Worker
  await iphone.evaluate(async () => { await laadNotities(); const n = maakNotitie(); wijzigNotitie(n, { tekst: 'Gedeelde notitie', labels: ['Pilot'] }); });
  await wacht(3500);
  assert.deepEqual(await sync(mac), ['Gedeelde notitie'], 'de Mac haalt hem op');
  await mac.locator('#zijbalk [data-nf-soort="alle"]').click(); await wacht(500);
  assert.deepEqual(await mac.locator('#notlijst .notitierij .t1').allInnerTexts(), ['Gedeelde notitie']);
  // Op de Mac wijzigen
  await mac.evaluate(() => wijzigNotitie(levendeNotities()[0], { tekst: 'Bijgewerkt op de Mac' }));
  await sync(mac);
  assert.deepEqual(await sync(iphone), ['Bijgewerkt op de Mac']);
  // Op de iPhone verwijderen
  await iphone.evaluate(() => verwijderNotitie(levendeNotities()[0]));
  await sync(iphone);
  assert.deepEqual(await sync(mac), [], 'ook op de Mac verdwenen');
  assert.equal(await mac.locator('#notlijst').innerText(), 'Nog geen notities');
  // Ruimtes: de lijst van de iPhone staat even later op de Mac; een wijziging op de Mac gaat terug
  await iphone.evaluate(() => zetRuimteLijst([{ naam: 'Zonnezaal', email: 'zonnezaal@voorbeeld.nl' }, { naam: 'Coupé', email: '' }]));
  await sync(iphone);
  await sync(mac);
  assert.deepEqual(await mac.evaluate(() => ruimtes().map((r) => r.naam)), ['Zonnezaal', 'Coupé']);
  await mac.evaluate(() => zetRuimteLijst([...ruimteLijst(), { naam: 'Kelder', email: '' }]));
  await sync(mac);
  await sync(iphone);
  assert.deepEqual(await iphone.evaluate(() => ruimtes().map((r) => r.naam)), ['Zonnezaal', 'Coupé', 'Kelder']);
  // Een toestel met ruimtes van vóór het synchroniseren (zonder tijdstip): wat al in de Worker staat, wint
  await iphone.evaluate(() => { LS.set('ag_ruimtes2', [{ naam: 'Oude lijst', email: '' }]); LS.del('ag_ruimtes_gewijzigd'); });
  await sync(iphone);
  assert.deepEqual(await iphone.evaluate(() => ruimtes().map((r) => r.naam)), ['Zonnezaal', 'Coupé', 'Kelder']);
  // Instellingen laat zien hoe het ervoor staat, ook als de Worker nog geen database heeft
  await iphone.locator('#tabbalk [data-tab="instellingen"]').tap(); await wacht(600);
  assert.match(await iphone.locator('#isync').innerText(), /Gesynchroniseerd/);
  assert.match(await iphone.locator('#isync').innerText(), /Om \d\d:\d\d · agenda, notities en ruimtes/);
  assert.equal(await iphone.locator('#isync').innerText().then((t) => t.includes(LINK)), false, 'de link zelf staat er niet');
  const db = env.DB; delete env.DB;
  await iphone.locator('#isync [data-actie="sync-nu"]').tap(); await wacht(800);
  assert.match(await iphone.locator('#isync').innerText(), /Je Worker heeft nog geen database/);
  env.DB = db;
  // Een Worker van vóór de notities (geeft op elk adres de agenda terug): melden, en niet meer vanzelf proberen
  await iphone.context().unroute('https://agenda.voorbeeld.workers.dev/**');
  let vragen = 0;
  await iphone.context().route('https://agenda.voorbeeld.workers.dev/**', (r) => { vragen++; r.fulfill({ status: r.request().method() === 'POST' ? 405 : 200, contentType: 'text/calendar', headers: { 'Access-Control-Allow-Origin': '*' }, body: ics }); });
  await iphone.locator('#isync [data-actie="sync-nu"]').tap(); await wacht(800);
  assert.match(await iphone.locator('#isync').innerText(), /Je Worker is nog niet bijgewerkt/);
  const na = vragen;
  await iphone.evaluate(() => synchroniseer({ vanzelf: true })); await wacht(300);
  assert.equal(vragen, na, 'geen automatische pogingen meer');
  // Een Worker die de notities al kent maar de ruimtes nog niet: de notities gaan gewoon door
  await mac.context().unroute('https://agenda.voorbeeld.workers.dev/**');
  await mac.context().route('https://agenda.voorbeeld.workers.dev/**', async (r) => {
    const v = r.request();
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (new URL(v.url()).pathname !== '/notities') return r.fulfill({ status: 200, contentType: 'text/calendar', headers: cors, body: ics });
    const a = await worker.fetch(new Request(v.url(), { method: v.method(), body: v.method() === 'POST' ? v.postData() : undefined }), env);
    r.fulfill({ status: a.status, contentType: a.headers.get('Content-Type') || 'text/plain', headers: cors, body: await a.text() });
  });
  assert.deepEqual(await mac.evaluate(async () => { await synchroniseer({ vanzelf: true }); return { fout: SYNC.fout, oud: SYNC.oud, ruimtesOud: SYNC.ruimtesOud }; }), { fout: null, oud: false, ruimtesOud: true });
  assert.deepEqual([...iphone.fouten, ...mac.fouten], []);
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
  assert.deepEqual(await p.locator('.keuzemenu [role="menuitem"]').allInnerTexts(), ['Nieuwe afspraak', 'Tijden uit een mail', 'Notitie']);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await wacht(900);
  assert.equal(await p.locator('.paneel.mailtijden.dialoog').count(), 1);
  await p.keyboard.press('Escape'); await wacht(500);
  await p.locator('#nieuwknop').click(); await wacht(300);
  await p.keyboard.press('Escape'); await wacht(300);
  assert.equal(await p.locator('.keuzemenu').count(), 0);
});

test('detail: een tik op een deelnemer opent het visitekaartje, Escape sluit alleen het kaartje', async ({ browser, url }) => {
  const p = await nieuwePagina(browser, MAC);
  await p.goto(url); await wacht(1000);
  // De eerste afspraak in beeld met deelnemers
  const nr = await p.evaluate(() => [...document.querySelectorAll('#inhoud [data-id]')].findIndex((t) => { const e = zichtbaar.get(t.dataset.id); return e && (e.attendees || []).length > 1 && t.offsetParent; }));
  assert.ok(nr >= 0, 'een afspraak met deelnemers in beeld');
  await p.locator('#inhoud [data-id]').nth(nr).click(); await wacht(700);
  const rij = p.locator('.paneel.detail.open [data-persoon]').first();
  const naam = (await rij.locator('.t1').innerText()).replace(' (jij)', '');
  await rij.click(); await wacht(500);
  assert.equal(await p.locator('.visite.open .naam').innerText(), naam);
  assert.equal(await p.locator('.visite.open .avatar').count(), 1);
  await p.keyboard.press('Escape'); await wacht(500);
  assert.equal(await p.locator('.visite.open').count(), 0, 'het kaartje is dicht');
  assert.equal(await p.locator('.paneel.detail.open').count(), 1, 'het detail staat er nog');
  assert.deepEqual(p.fouten, []);
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
