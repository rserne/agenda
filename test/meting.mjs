// Metingen van de panelen, om te controleren dat een verbouwing niets aan het gedrag verandert. Elke meting opent een
// scherm in de app, doet een vaste reeks handelingen en legt na elke handeling vast wat er staat: de HTML, de velden,
// de focus en wat de app bewaart of aanroept. Vergelijk je twee metingen, dan zie je bij het eerste verschil in welk
// scherm en na welke handeling het zit. De metingen zelf staan in test/metingen/.
// Gebruik: node test/meting.mjs <map>                  (meet en bewaart de uitkomst)
//          node test/meting.mjs <map> <vergelijkmap>   (meet en vergelijkt met een eerdere meting)
//          node test/meting.mjs <map> [vergelijkmap] --alleen=nieuw,mail   (alleen deze metingen)
import fs from 'fs';
import path from 'path';
import { startServer, laadPlaywright, nieuwePagina, wacht, TELEFOON, MAC } from './hulp.mjs';
import * as detail from './metingen/detail.mjs';
import * as nieuw from './metingen/nieuw.mjs';
import * as mail from './metingen/mail.mjs';
import * as instellingen from './metingen/instellingen.mjs';
import * as overig from './metingen/overig.mjs';

const METINGEN = { detail, nieuw, mail, instellingen, overig };
const args = process.argv.slice(2);
const alleen = (args.find((a) => a.startsWith('--alleen=')) || '').slice(9).split(',').filter(Boolean);
const [doel, vergelijk] = args.filter((a) => !a.startsWith('--'));
const onbekend = alleen.filter((n) => !METINGEN[n]);
if (!doel || onbekend.length) {
  console.error(onbekend.length ? `Onbekende meting: ${onbekend.join(', ')}. Kies uit: ${Object.keys(METINGEN).join(', ')}.` : 'Gebruik: node test/meting.mjs <map> [vergelijkmap] [--alleen=naam,naam]');
  process.exit(2);
}
fs.mkdirSync(doel, { recursive: true });

// Het eerste verschil tussen twee uitkomsten: waar het zit, en wat er aan beide kanten staat
function eersteVerschil(a, b, pad = []) {
  if (a === b) return null;
  if (typeof a === 'string' && typeof b === 'string') {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    const stuk = (s) => `${i > 60 ? '…' : ''}${s.slice(Math.max(0, i - 60), i + 80)}${s.length > i + 80 ? '…' : ''}`;
    return { pad, was: stuk(a), nu: stuk(b) };
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      // Een stap in een reeks noemen we bij zijn naam, niet bij zijn nummer
      const naam = b[k] && typeof b[k] === 'object' ? (b[k].stap || b[k].titel || b[k].wat) : null;
      const v = eersteVerschil(a[k], b[k], [...pad, naam ? `${k} (${naam})` : k]);
      if (v) return v;
    }
    return null;
  }
  return { pad, was: JSON.stringify(a), nu: JSON.stringify(b) };
}

const { chromium } = await laadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const anders = [];
const fouten = [];
for (const [naam, meting] of Object.entries(METINGEN)) {
  if (alleen.length && !alleen.includes(naam)) continue;
  const uitkomst = {};
  for (const [toestel, apparaat] of [['iphone', TELEFOON], ['mac', MAC]]) {
    const p = await nieuwePagina(browser, apparaat);
    await p.goto(server.url); await wacht(1200);
    uitkomst[toestel] = await p.evaluate(meting.inPagina);
    if (p.fouten.length) fouten.push(`${naam} (${toestel}): ${p.fouten.join('; ')}`);
    await p.context().close();
  }
  fs.writeFileSync(path.join(doel, `meting-${naam}.json`), JSON.stringify(uitkomst, null, 1));
  let oordeel = '';
  if (vergelijk) {
    const vorige = path.join(vergelijk, `meting-${naam}.json`);
    const v = fs.existsSync(vorige) ? eersteVerschil(JSON.parse(fs.readFileSync(vorige, 'utf8')), uitkomst) : { pad: [], was: '(geen eerdere meting)', nu: '' };
    if (v) anders.push(`${meting.titel}\n    waar: ${v.pad.join(' › ') || '-'}\n    was:  ${v.was}\n    nu:   ${v.nu}`);
    oordeel = v ? ': ANDERS' : ': gelijk';
  }
  console.log(`${meting.titel}: ${meting.samenvatting(uitkomst.mac)} per toestel${oordeel}`);
}
await browser.close();
await server.stop?.();
if (fouten.length) console.log(`\nFouten in de app tijdens het meten:\n  ${fouten.join('\n  ')}`);
if (vergelijk) console.log(anders.length ? `\nAnders dan ${vergelijk}:\n  ${anders.join('\n  ')}` : `\nAlle metingen gelijk aan ${vergelijk}.`);
process.exit(anders.length || fouten.length ? 1 : 0);
