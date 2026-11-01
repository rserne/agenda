// Test: zet de voorbeeldfeed om en toon week 45 van 2026
import fs from 'fs';
import ICAL from 'ical.js';
import { maakOmzetter } from '../functions/_ical.js';
const { afsprakenUitIcal } = maakOmzetter(ICAL);
const t = fs.readFileSync(new URL('./voorbeeld.ics', import.meta.url), 'utf8');
const ev = afsprakenUitIcal(t, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-09T00:00:00Z'));
const nl = (s) => s.length === 10 ? s + ' (hele dag)' : new Date(s).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
for (const e of ev) console.log(nl(e.start).padEnd(22), nl(e.end).slice(-5), e.recurring ? 'R' : ' ', e.detached ? 'L' : ' ', e.canceled ? 'X' : ' ', e.free ? 'V' : ' ', e.title, '|', e.attendees.length, 'deeln.', e.organizer ? e.organizer.email : '');
console.log(ev.length, 'afspraken');
