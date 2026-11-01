// Maakt demo.json uit de voorbeeldfeed (verzonnen namen), voor de app zonder Nhost: node test/maakdemo.mjs
import fs from 'fs';
import { afsprakenUitIcal } from '../functions/_ical.js';
const t = fs.readFileSync(new URL('./voorbeeld.ics', import.meta.url), 'utf8');
const events = afsprakenUitIcal(t, new Date('2026-10-01T00:00:00Z'), new Date('2027-01-04T00:00:00Z'));
fs.writeFileSync(new URL('../demo.json', import.meta.url), JSON.stringify({ me: 'jan.jansen@caci.nl', ownDomains: ['caci.nl'], fetchedAt: new Date().toISOString(), events }));
console.log(events.length, 'afspraken in demo.json');
