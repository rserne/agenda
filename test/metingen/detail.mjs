// Meting: het detailscherm van een afspraak en het visitekaartje
// Van elke voorbeeldafspraak, en van negen verzonnen varianten (veel deelnemers, lange notities, hele dag, zonder
// organisator, hybride, herhaling), de HTML van het detailscherm, ook met alle deelnemers en de lange notities
// uitgeklapt, en van elk visitekaartje.
// Alle namen, adressen en sleutels hierin zijn verzonnen. inPagina draait in de browser, binnen de app.

export const titel = 'Het detailscherm van een afspraak en het visitekaartje';
export const samenvatting = (u) => `${u.length} afspraken, ${u.reduce((t, r) => t + r.html.length, 0)} schermen, ${u.reduce((t, r) => t + r.kaartjes.length, 0)} kaartjes`;

export async function inPagina() {
  await laadNotities();
  const lijst = [...zichtbaar.values()];
  // Twee afspraken met een eigen notitie, voor de sectie Mijn notitie en het gekleurde knopje
  lijst.filter((e) => !e.allDay).slice(0, 2).forEach((e, i) => { const n = maakNotitie(e); wijzigNotitie(n, { tekst: `Notitie ${i}`, labels: ['pilot'] }); });
  // Verzonnen varianten voor de takken die de voorbeeldgegevens niet raken
  const basis = lijst.find((e) => !e.allDay && e.attendees.length > 1 && e.organizer);
  const eigen = basis.organizer.email.split('@')[1];
  const mens = (i, dom, extra = {}) => ({ name: dom ? `Persoon ${i}` : '', email: dom ? `persoon${i}@${dom}` : '', role: ['req-participant', 'opt-participant', 'chair'][i % 3], status: ['accepted', 'declined', 'tentative', 'needs-action'][i % 4], ...extra });
  const veel = [...Array(9)].map((_, i) => mens(i, eigen)).concat([...Array(4)].map((_, i) => mens(20 + i, 'voorbeeld-a.example')), [...Array(2)].map((_, i) => mens(30 + i, 'voorbeeld-b.example')), [{ name: 'Zonder adres', email: '', role: 'req-participant', status: 'accepted' }, { name: '', email: 'alleen@voorbeeld-c.example', role: 'x', status: 'y' }]);
  const lang = [...Array(12)].map((_, i) => `Regel ${i + 1} van de toelichting, met <tekens> & een link https://voorbeeld.example/${i}`).join('\n') + '\n________________\nMicrosoft Teams-vergadering';
  const variant = (id, velden) => ({ ...basis, id, ...velden });
  lijst.push(
    variant('v-veel', { attendees: veel, notes: lang, title: 'Veel deelnemers & <lange> notities' }),
    variant('v-geenorg', { organizer: null, mode: 'physical', places: [], roomNames: [], link: null, attendees: veel.slice(0, 3), title: '' }),
    variant('v-hybride', { mode: 'hybrid', places: ['Zaal 1', 'Stationsweg 1, 1234 AB Plaats'], roomNames: ['Zaal 1'], link: { provider: 'Microsoft Teams', url: 'https://voorbeeld.example/x?a=1&b=2' }, external: true, orgs: ['Voorbeeld A', 'Voorbeeld B'], kind: 'ext' }),
    variant('v-fysiek', { mode: 'physical', places: ['Zaal 2', 'Dorpsstraat 5, Plaats'], roomNames: [], link: null }),
    variant('v-heledag', { allDay: true, start: startOfDay(basis.start), end: addDays(startOfDay(basis.start), 3), mode: 'none', attendees: [], notes: 'Kort' }),
    variant('v-eendag', { allDay: true, start: startOfDay(basis.start), end: addDays(startOfDay(basis.start), 1), organizer: mens(40, 'voorbeeld-a.example'), attendees: [mens(41, eigen)] }),
    variant('v-herhaal', { repeat: { freq: 'weekly', interval: 2 }, organizer: mens(50, 'voorbeeld-a.example'), kind: 'int' }),
    variant('v-maand', { repeat: { freq: 'monthly', interval: 1 }, regular: true, kind: 'vast' }),
    variant('v-vreemd', { repeat: { freq: 'hourly' }, organizer: { name: 'alleen@voorbeeld-c.example', email: 'alleen@voorbeeld-c.example' }, notes: [...Array(3)].map(() => 'x'.repeat(120)).join(' ') }),
  );
  const plat = (h) => h.replace(/\s+/g, ' ');
  const bovenste = (s) => [...document.querySelectorAll(s)].pop();
  const dicht = () => panelen[panelen.length - 1].sluit();
  const res = [];
  for (const e of lijst) {
    openDetail(e);
    const el = bovenste('.paneel.detail');
    const r = { id: String(e.id), titel: e.title, klasse: el.className.replace(/\s*open\s*/, ' ').trim(), rol: el.getAttribute('role'), label: el.getAttribute('aria-label'), html: [plat(el.innerHTML)], kaartjes: [] };
    for (const actie of ['allen', 'notities', 'allen', 'notities']) {
      const k = el.querySelector(`[data-actie="${actie}"]`);
      if (k) { k.click(); r.html.push(plat(el.innerHTML)); }
    }
    const al = el.querySelector('[data-actie="allen"]'); if (al) al.click(); // alle deelnemers, voor de kaartjes
    for (const knop of el.querySelectorAll('[data-persoon]')) {
      knop.click();
      const v = bovenste('.visite');
      r.kaartjes.push({ label: v.getAttribute('aria-label'), html: plat(v.innerHTML) });
      dicht();
    }
    dicht();
    res.push(r);
  }
  return res;
}
