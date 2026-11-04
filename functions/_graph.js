// Agenda, afspraken uit Microsoft Graph omzetten
// Zet een afspraak uit /me/calendarView om naar dezelfde vorm als een afspraak uit een .ics-bestand
// (zie _ical.js), zodat de rest van de app niet hoeft te weten waar de gegevens vandaan komen.
// De tijden vragen we op in UTC (Prefer: outlook.timezone="UTC").

// '2026-11-04T13:00:00.0000000' (UTC) als Date. Safari leest geen zeven decimalen, dus die gaan eraf.
const utc = (t) => new Date(String(t.dateTime).replace(/\.\d+$/, '') + 'Z');
const ymdLokaal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ANTWOORD = { accepted: 'accepted', organizer: 'accepted', tentativelyaccepted: 'tentative', declined: 'declined', none: 'needs-action', notresponded: 'needs-action' };
const ROL = { required: 'req-participant', optional: 'opt-participant', resource: 'non-participant' };
const HERHALING = { daily: 'daily', weekly: 'weekly', absolutemonthly: 'monthly', relativemonthly: 'monthly', absoluteyearly: 'yearly', relativeyearly: 'yearly' };
const MAX_NOTITIE = 4000; // notities van Teams-uitnodigingen kunnen lang zijn; dit is genoeg voor de link en de tekst

function persoon(p, extra = {}) {
  const a = p && p.emailAddress;
  if (!a || (!a.address && !a.name)) return null;
  return { name: a.name || null, email: a.address ? a.address.toLowerCase() : null, ...extra };
}

// Herhaling van een reeks ({ type: 'weekly', interval: 1 }) in de vorm van _ical.js
export function herhalingVan(recurrence) {
  const p = recurrence && recurrence.pattern;
  if (!p) return null;
  const freq = HERHALING[String(p.type || '').toLowerCase()];
  return freq ? { freq, interval: p.interval || 1 } : null;
}

export function vanGraph(g, reeksen = new Map()) {
  let start = utc(g.start);
  let end = utc(g.end);
  // Een hele dag: Graph geeft middernacht, omgerekend naar UTC. Wij willen de datum zelf, met een exclusief einde.
  if (g.isAllDay) { start = ymdLokaal(start); end = ymdLokaal(end); } else { start = start.toISOString(); end = end.toISOString(); }
  const plekken = (g.locations || []).map((l) => l.displayName).filter(Boolean);
  const location = (g.location && g.location.displayName) || plekken.join('; ');
  const attendees = (g.attendees || []).map((a) => persoon(a, {
    role: ROL[String(a.type || '').toLowerCase()] || null,
    status: ANTWOORD[String((a.status && a.status.response) || '').toLowerCase()] || null,
    type: String(a.type || '').toLowerCase() === 'resource' ? 'resource' : 'individual',
  })).filter(Boolean);
  const notes = g.body && g.body.contentType === 'text' ? String(g.body.content || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_NOTITIE) : String(g.bodyPreview || '');
  const type = String(g.type || 'singleInstance');
  return {
    id: g.id,
    uid: g.iCalUId || g.id,
    title: String(g.subject || '').trim(),
    start,
    end,
    allDay: !!g.isAllDay,
    location: location.trim(),
    notes,
    url: (g.onlineMeeting && g.onlineMeeting.joinUrl) || g.onlineMeetingUrl || '',
    organizer: persoon(g.organizer, { role: 'chair', status: 'accepted', type: 'individual' }),
    attendees,
    recurring: type !== 'singleInstance',
    repeat: g.seriesMasterId ? reeksen.get(g.seriesMasterId) || null : null,
    detached: type === 'exception',
    canceled: !!g.isCancelled,
    tentative: g.showAs === 'tentative' || !!(g.responseStatus && g.responseStatus.response === 'tentativelyAccepted'),
    free: g.showAs === 'free',
    webLink: g.webLink || '',
  };
}

// Velden die we per afspraak opvragen (minder velden = sneller antwoord)
export const GRAPH_VELDEN = 'id,iCalUId,subject,start,end,isAllDay,location,locations,attendees,organizer,onlineMeeting,onlineMeetingUrl,body,bodyPreview,type,seriesMasterId,showAs,isCancelled,responseStatus,webLink';

// Foutmeldingen van Microsoft in gewone taal, met wat je eraan kunt doen
export function msUitleg(e, terugAdres) {
  const t = `${(e && (e.errorCode || e.code)) || ''} ${(e && (e.errorMessage || e.message)) || ''}`;
  if (/AADSTS50011/.test(t)) return `Het terugkeeradres staat niet in de app-registratie. Voeg in Entra bij Authentication, Single-page application, dit adres toe: ${terugAdres}`;
  if (/AADSTS9002326|cross-origin|AADSTS7000218|client_secret|client_assertion/i.test(t)) return 'De app-registratie staat niet ingesteld als Single-page application. Voeg in Entra bij Authentication het platform Single-page application toe, met het adres van deze app.';
  if (/AADSTS50194/.test(t)) return 'De app-registratie is alleen voor jullie eigen organisatie bedoeld. Vul de tenant-ID of het maildomein in (zet ?tenant=jouwdomein.nl achter het adres).';
  if (/AADSTS700016/.test(t)) return 'Deze client-ID bestaat niet in deze tenant. Controleer de client-ID en de tenant.';
  if (/AADSTS65001|AADSTS90094|consent_required|AADSTS90095/i.test(t)) return 'Je organisatie vraagt toestemming van een beheerder voor deze app (admin consent voor Calendars.Read).';
  if (/AADSTS530\d\d/.test(t)) return 'Een Conditional Access-regel van je organisatie blokkeert het inloggen vanuit deze app.';
  if (/user_cancelled|AADSTS65004/i.test(t)) return 'Inloggen afgebroken.';
  const eerste = String((e && (e.errorMessage || e.message)) || 'Onbekende fout').split(/\r?\n/)[0];
  return `Inloggen bij Microsoft lukte niet: ${eerste}`;
}
