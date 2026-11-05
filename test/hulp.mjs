// Gedeelde hulpjes voor de tests: een kleine webserver, een vaste klok en browserinstellingen
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

export const MAP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOORT = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ics': 'text/calendar', '.svg': 'image/svg+xml' };

// Statische server voor de app (zoals GitHub Pages), op een vrije poort
export async function startServer() {
  const server = http.createServer((req, res) => {
    const pad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let bestand = path.join(MAP, pad.endsWith('/') ? pad + 'index.html' : pad);
    if (!bestand.startsWith(MAP) || !fs.existsSync(bestand) || fs.statSync(bestand).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': SOORT[path.extname(bestand)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(bestand).pipe(res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${server.address().port}/`, stop: () => new Promise((ok) => server.close(ok)) };
}

// Vaste klok: woensdag 4 november 2026, 09:00 in Amsterdam. Zo zijn alle tests en schermafbeeldingen elke dag gelijk.
export const KLOK = '2026-11-04T08:00:00Z';
export function klokScript(iso = KLOK) {
  return `(() => { const T = new Date('${iso}').getTime(); const O = Date; const t0 = O.now();
    class D extends O { constructor(...a) { super(...(a.length ? a : [T + (O.now() - t0)])); } static now() { return T + (O.now() - t0); } }
    window.Date = D; })();`;
}

export const TELEFOON = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
export const IPAD = { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 1, hasTouch: true };
export const IPAD_STAAND = { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1, hasTouch: true };
export const MAC = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

// Playwright laden; met een duidelijke melding als het er niet is
export async function laadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* ook een algemeen geïnstalleerde versie proberen */ }
  try { return createRequire(import.meta.url)('playwright'); } catch (e) {
    console.error('Playwright ontbreekt. Installeer het eenmalig met: npm install --no-save playwright && npx playwright install chromium');
    process.exit(2);
  }
}

// Nieuwe pagina met vaste klok, tijdzone en kleurthema. Fouten op de pagina worden verzameld.
export async function nieuwePagina(browser, apparaat, { thema = 'light', klok = KLOK } = {}) {
  const ctx = await browser.newContext({ ...apparaat, colorScheme: thema, timezoneId: 'Europe/Amsterdam', locale: 'nl-NL', serviceWorkers: 'block' });
  await ctx.addInitScript(klokScript(klok));
  const pagina = await ctx.newPage();
  pagina.fouten = [];
  pagina.on('pageerror', (e) => pagina.fouten.push(e.message));
  return pagina;
}

export const wacht = (ms) => new Promise((ok) => setTimeout(ok, ms));
