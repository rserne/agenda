// Schermafbeeldingen van de belangrijkste schermen, om te controleren dat een opschoning niets aan het uiterlijk verandert.
// Gebruik: node test/schermen.mjs <map>      (maakt de afbeeldingen)
//          node test/schermen.mjs <map> <vergelijkmap>   (maakt ze en vergelijkt pixel voor pixel)
import fs from 'fs';
import path from 'path';
import { startServer, laadPlaywright, nieuwePagina, wacht, TELEFOON, IPAD, IPAD_STAAND, MAC, MAP } from './hulp.mjs';

const [, , doel, vergelijk] = process.argv;
if (!doel) { console.error('Gebruik: node test/schermen.mjs <map> [vergelijkmap]'); process.exit(2); }
fs.mkdirSync(doel, { recursive: true });
const { chromium } = await laadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const ICS = path.join(MAP, 'test', 'voorbeeld.ics');
const fouten = [];

async function reeks(naam, apparaat, thema, { bestand = false } = {}) {
  const p = await nieuwePagina(browser, apparaat, { thema });
  await p.goto(server.url); await wacht(900);
  if (bestand) { await p.setInputFiles('#icsinvoer', ICS); await wacht(2500); }
  const foto = async (stap) => { await wacht(450); await p.screenshot({ path: path.join(doel, `${naam}-${thema}-${stap}.png`), animations: 'disabled', caret: 'hide' }); };
  const telefoon = !apparaat.viewport || apparaat.viewport.width < 1200;
  await p.evaluate(() => window.scrollTo(0, 0));
  await foto('1-week');
  for (const f of ['Alles', 'Vrij']) { await p.locator('[data-filter]:visible', { hasText: f }).first().click(); await p.evaluate(() => window.scrollTo(0, 0)); await foto(`2-${f.toLowerCase()}`); }
  await p.locator('[data-filter]:visible', { hasText: 'Opvallend' }).first().click();
  await p.locator('#inhoud [data-id]').nth(1).click(); await foto('3-detail');
  await p.keyboard.press('Escape'); await wacht(400);
  if (telefoon) { await p.click('#titelknop'); await foto('4-kiezer'); await p.keyboard.press('Escape'); await wacht(400); }
  await p.locator('[data-tab="forecast"]:visible').first().click(); await p.evaluate(() => window.scrollTo(0, 0)); await foto('5-vooruitblik');
  await p.locator('[data-nieuw]:visible').first().click(); await wacht(400); await foto('7-keuze');
  await p.locator('.keuzemenu [data-keuze="nieuw"]').click(); await foto('6-nieuw');
  fouten.push(...p.fouten.map((f) => `${naam}-${thema}: ${f}`));
  await p.context().close();
}

for (const thema of ['light', 'dark']) {
  await reeks('telefoon', TELEFOON, thema);
  await reeks('telefoon-ics', TELEFOON, thema, { bestand: true });
  await reeks('ipad', IPAD, thema);
  await reeks('ipadstaand', IPAD_STAAND, thema);
  await reeks('mac', MAC, thema);
}
await browser.close(); await server.stop();
if (fouten.length) { console.error('Fouten op de pagina:\n' + fouten.join('\n')); process.exitCode = 1; }

if (vergelijk) {
  // Pixel voor pixel vergelijken in de browser (geen extra pakketten nodig). Een paar pixels verschil door het
  // glaseffect (wazige achtergrond) tellen we niet mee: pas boven de 250 duidelijk andere pixels is een scherm anders.
  const b2 = await chromium.launch(); const p = await b2.newPage();
  const namen = fs.readdirSync(doel).filter((n) => n.endsWith('.png')).sort();
  const anders = [];
  for (const n of namen) {
    const twee = path.join(vergelijk, n);
    if (!fs.existsSync(twee)) { anders.push(`${n} (ontbreekt)`); continue; }
    const a = fs.readFileSync(path.join(doel, n)), c = fs.readFileSync(twee);
    if (a.equals(c)) continue;
    const telling = await p.evaluate(async ([x, y]) => {
      const laad = (b64) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b64; });
      const [i1, i2] = await Promise.all([laad(x), laad(y)]);
      if (i1.width !== i2.width || i1.height !== i2.height) return -1;
      const pix = (i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
      const d1 = pix(i1), d2 = pix(i2); let n = 0;
      for (let k = 0; k < d1.length; k += 4) if (Math.abs(d1[k] - d2[k]) + Math.abs(d1[k + 1] - d2[k + 1]) + Math.abs(d1[k + 2] - d2[k + 2]) > 48) n++;
      return n;
    }, [a.toString('base64'), c.toString('base64')]);
    if (telling < 0 || telling > 250) anders.push(`${n} (${telling < 0 ? 'andere maat' : telling + ' pixels'})`);
  }
  await b2.close();
  console.log(anders.length ? `Anders dan ${vergelijk} (${anders.length} van ${namen.length}):\n  ${anders.join('\n  ')}` : `Alle ${namen.length} schermen gelijk aan ${vergelijk}.`);
  if (anders.length) process.exitCode = 1;
} else console.log(`${fs.readdirSync(doel).filter((n) => n.endsWith('.png')).length} schermen in ${doel}`);
