// Zet een iCal-feed (zoals Outlook die publiceert) om naar losse afspraken binnen een periode.
// Herhalende afspraken worden uitgerold, verplaatste of gewijzigde keren (RECURRENCE-ID) vervangen
// de gewone keer, en uitzonderingen (EXDATE) vallen weg. Bestanden met een _ ervoor zijn bij Nhost
// geen eigen adres, alleen hulpcode voor agenda.js.
import ICAL from 'ical.js';

const MAX_KEREN = 50000; // veiligheidsgrens per herhaalreeks (een dagelijkse reeks van jaren terug telt vanaf het begin)

// Outlook zet de tijdzones als VTIMEZONE in het bestand, vaak met Windows-namen als
// 'W. Europe Standard Time'. Die moeten bekend zijn voordat we tijden omrekenen.
function registreerTijdzones(vcal) {
  for (const vtz of vcal.getAllSubcomponents('vtimezone')) {
    const tzid = vtz.getFirstPropertyValue('tzid');
    if (tzid && !ICAL.TimezoneService.has(tzid)) ICAL.TimezoneService.register(tzid, new ICAL.Timezone(vtz));
  }
}

const mailVan = (waarde) => {
  if (!waarde) return null;
  const m = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.exec(String(waarde));
  return m ? m[1].toLowerCase() : null;
};

function persoon(prop) {
  if (!prop) return null;
  const p = (naam) => prop.getParameter(naam) || null;
  return {
    name: p('cn'),
    email: mailVan(prop.getFirstValue()),
    role: (p('role') || '').toLowerCase() || null, // req-participant, opt-participant, chair
    status: (p('partstat') || '').toLowerCase() || null, // accepted, declined, tentative, needs-action
    type: (p('cutype') || '').toLowerCase() || null, // individual, room, resource
  };
}

// Een tijd als ISO-tekst. Hele dagen blijven een datum zonder tijd (eind is exclusief).
const isoVan = (t) => (t.isDate ? t.toString().slice(0, 10) : t.toJSDate().toISOString());

function maakAfspraak(event, details, kenmerken) {
  const comp = details.item ? details.item.component : event.component;
  const tekst = (naam) => comp.getFirstPropertyValue(naam) || '';
  const start = details.startDate;
  const eind = details.endDate || start;
  const status = String(tekst('status')).toUpperCase();
  const transp = String(tekst('transp')).toUpperCase();
  const bezet = String(tekst('x-microsoft-cdo-busystatus')).toUpperCase();
  return {
    id: `${event.uid}|${isoVan(details.recurrenceId || start)}`,
    uid: event.uid,
    title: String(tekst('summary')).trim(),
    start: isoVan(start),
    end: isoVan(eind),
    allDay: !!start.isDate,
    location: String(tekst('location')).trim(),
    notes: String(tekst('description')),
    url: String(tekst('url')),
    organizer: persoon(comp.getFirstProperty('organizer')),
    attendees: comp.getAllProperties('attendee').map(persoon).filter(Boolean),
    recurring: kenmerken.herhaalt,
    repeat: kenmerken.regel || null, // { freq: 'weekly', interval: 1 } bij een herhaalreeks
    detached: kenmerken.losgemaakt,
    canceled: status === 'CANCELLED' || /^(geannuleerd|canceled|cancelled):/i.test(String(tekst('summary'))),
    tentative: status === 'TENTATIVE' || bezet === 'TENTATIVE',
    free: transp === 'TRANSPARENT' || bezet === 'FREE',
  };
}

// van en tot zijn JavaScript-datums; alles wat die periode raakt, komt mee.
export function afsprakenUitIcal(tekst, van, tot) {
  const vcal = new ICAL.Component(ICAL.parse(tekst));
  registreerTijdzones(vcal);
  const vanT = ICAL.Time.fromJSDate(van, true);
  const totT = ICAL.Time.fromJSDate(tot, true);

  // Per UID de hoofdafspraak en de gewijzigde keren bij elkaar zoeken
  const reeksen = new Map();
  for (const ve of vcal.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(ve);
    if (!ev.uid || !ev.startDate) continue;
    const r = reeksen.get(ev.uid) || { hoofd: null, losse: [] };
    if (ev.isRecurrenceException()) r.losse.push(ev);
    else r.hoofd = ev;
    reeksen.set(ev.uid, r);
  }

  const uit = [];
  const raakt = (s, e) => e.compare(vanT) > 0 && s.compare(totT) < 0;

  for (const { hoofd, losse } of reeksen.values()) {
    // Alleen gewijzigde keren zonder hoofdafspraak (komt voor bij gedeeltelijke exports)
    if (!hoofd) {
      for (const ev of losse) {
        const d = { startDate: ev.startDate, endDate: ev.endDate, recurrenceId: ev.recurrenceId, item: ev };
        if (raakt(d.startDate, d.endDate || d.startDate)) uit.push(maakAfspraak(ev, d, { herhaalt: true, losgemaakt: true }));
      }
      continue;
    }
    losse.forEach((ev) => hoofd.relateException(ev));
    const rr = hoofd.component.getFirstPropertyValue('rrule');
    const regel = rr ? { freq: String(rr.freq || '').toLowerCase(), interval: rr.interval || 1 } : null;

    if (!hoofd.isRecurring()) {
      const d = { startDate: hoofd.startDate, endDate: hoofd.endDate, item: hoofd };
      if (raakt(d.startDate, d.endDate || d.startDate)) uit.push(maakAfspraak(hoofd, d, { herhaalt: false, losgemaakt: false }));
      continue;
    }

    const it = hoofd.iterator();
    let keer;
    let n = 0;
    while ((keer = it.next()) && n++ < MAX_KEREN) {
      // Voorbij het eind van de periode: klaar
      if (keer.compare(totT) >= 0) {
        // Een verplaatste keer kan eerder vallen dan zijn oorspronkelijke tijd; die vangen we hieronder op
        break;
      }
      const d = hoofd.getOccurrenceDetails(keer);
      const losgemaakt = !!(d.item && d.item !== hoofd);
      if (!raakt(d.startDate, d.endDate || d.startDate)) continue;
      uit.push(maakAfspraak(hoofd, d, { herhaalt: true, losgemaakt, regel }));
    }
    // Gewijzigde keren die naar binnen de periode zijn verplaatst, terwijl de oorspronkelijke keer erbuiten viel
    for (const ev of losse) {
      const al = uit.some((a) => a.uid === hoofd.uid && a.id === `${hoofd.uid}|${isoVan(ev.recurrenceId)}`);
      if (al) continue;
      const d = { startDate: ev.startDate, endDate: ev.endDate, recurrenceId: ev.recurrenceId, item: ev };
      if (raakt(d.startDate, d.endDate || d.startDate)) uit.push(maakAfspraak(hoofd, d, { herhaalt: true, losgemaakt: true, regel }));
    }
  }

  uit.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return uit;
}
