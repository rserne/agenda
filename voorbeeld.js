// Agenda, voorbeeldgegevens
// Maakt voor elke week een geloofwaardige agenda met verzonnen namen: vaste overleggen, losse interne
// afspraken en externe overleggen met deelnemers. Dezelfde week geeft altijd dezelfde afspraken
// (de toevalsgenerator start per week met hetzelfde getal). Zelfde vorm als wat de .ics-omzetter oplevert.
'use strict';

const VOORBEELD_IK = 'jan.jansen@caci.nl';
const VOORBEELD_DOMEINEN = ['caci.nl'];

const voorbeeldAfspraken = (() => {
  const TEAMS = '________________________________________________________________________________\nMicrosoft Teams-vergadering\nDeelnemen: https://teams.microsoft.com/l/meetup-join/19%3ameeting_voorbeeld%40thread.v2/0\n________________________________________________________________________________';
  // Kleine toevalsgenerator met een vast startgetal
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const p = (name, email, status = 'accepted', role = 'req-participant', type = 'individual') => ({ name, email, role, status, type });
  const ik = p('Jan Jansen', VOORBEELD_IK);
  const petra = p('Petra de Vries', 'petra.devries@caci.nl');
  const kees = p('Kees Bakker', 'kees.bakker@caci.nl', 'tentative');
  const jochem = p('Jochem Visser', 'jochem.visser@caci.nl');
  const lotte = p('Lotte de Boer', 'lotte.deboer@caci.nl');
  const team = [ik, petra, kees, lotte];
  const coupe = p('Coupé', 'coupe@caci.nl', 'accepted', 'non-participant', 'room');
  const ext = {
    SURF: [p('Bas de Wit', 'bas.dewit@surf.nl'), p('', 's.jong@surf.nl')],
    EUR: [p('Eva Kok', 'e.kok@eur.nl', 'accepted', 'opt-participant')],
    TUE: [p('Lisa Smit', 'l.smit@tue.nl'), p('Mark Peters', 'm.peters@tue.nl', 'needs-action')],
    HHS: [p('Iris Bos', 'i.bos@hhs.nl')],
    NPULS: [p('Ruud Meijer', 'r.meijer@npuls.nl', 'declined')],
    FUNDATIS: [p('Tom Kramer', 't.kramer@fundatis.nl')],
    VNW: [p('Sanne Mol', 'sanne@vernieuwenderwijs.nl')],
    AVANS: [p('Noor Hendriks', 'n.hendriks@avans.nl')],
  };

  // Vaste overleggen: [weekdag (1 = ma), begin, eind, titel, opties]
  const VAST = [
    [1, '09:30', '09:45', 'Weekstart', { loc: 'Coupé', att: [...team, coupe] }],
    [1, '10:30', '12:00', 'Overall Backlog Refinement Development - Ochtend', { org: petra, notes: TEAMS }],
    [1, '11:00', '12:00', 'Align-overleg', { loc: 'Coupé', att: [...team, coupe] }],
    [2, '10:00', '12:30', 'OOG-refinement', {}],
    [2, '15:00', '16:00', 'Vakgroep ontwerpen', { notes: TEAMS }],
    [3, '14:00', '14:30', 'Overall Sprint Planning', { elke: 2 }],
    [4, '16:00', '17:00', 'Architectuuroverleg', { loc: 'Coupé', att: [...team, coupe] }],
    [5, '13:00', '14:00', 'Retrospective', { elke: 2, notes: TEAMS }],
  ];
  // Dagelijks, behalve vrijdag
  const SCRUM = ['10:00', '10:15', 'Overall Daily Scrum Development', { org: petra, notes: TEAMS }];
  // Vaste externe overleggen
  const VAST_EXTERN = [
    [2, '10:00', '11:00', 'EuroTeQ 2.6 catch up meeting (if needed)', { org: ext.TUE[0], att: [ik, ...ext.TUE], notes: TEAMS }],
    [4, '09:00', '10:00', 'Osiris gebruikersoverleg', { org: ext.FUNDATIS[0], att: [ik, ...ext.FUNDATIS, lotte], elke: 4, notes: TEAMS }],
  ];
  // Losse afspraken. Elke week krijgt andere titels uit een vaste, geschudde lijst, zodat een titel pas
  // na een week of zeven terugkomt (anders telt de app hem als vast overleg).
  const NAMEN = [jochem, petra, kees, lotte, p('Sem Dekker', 'sem.dekker@caci.nl'), p('Fleur Smits', 'fleur.smits@caci.nl')];
  const ONDERWERPEN = ['Kies op Maat', 'OEAPI', 'Flusso', 'roosterkoppeling', 'toetsing', 'BSA-regeling', 'DUO-koppeling', 'studievoortgang', 'zaakgericht werken', 'pricing koppelvlakken', 'inschrijfmodule', 'examencommissie'];
  const voornaam = (x) => x.name.split(' ')[0];
  const schud = (lijst, seed) => { const r = rng(seed); const a = [...lijst]; for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; };
  const LOS_INTERN = schud([
    ...NAMEN.map((n) => [`KOM met ${voornaam(n)}`, 30, { att: [ik, n] }]),
    ...NAMEN.slice(0, 4).map((n) => [`1-op-1 ${voornaam(n)}`, 45, { att: [ik, n] }]),
    ...ONDERWERPEN.map((o) => [`Bespreken ${o}`, 60, { loc: 'Coupé', att: [...team, coupe], notes: 'Graag de voorstellen van vorige week meenemen.\n\nAgenda:\n1. Stand van zaken\n2. Planning\n3. Rondvraag' }]),
    ...ONDERWERPEN.map((o) => [`Controles ${o}`, 60, { notes: TEAMS }]),
    ...ONDERWERPEN.slice(0, 6).map((o) => [`Strategie sessie | ${o}`, 120, { loc: 'Coupé', att: [...team, coupe] }]),
    ['CP bijpraten (en KOM en ..)', 90, { loc: 'Coupé', att: [...team, coupe], notes: TEAMS }],
    ['Koppeling CP inzet Flusso', 30, { loc: 'Coupé', att: [...team, coupe] }],
  ], 7);
  const ORGS = [
    ['SURF', ext.SURF], ['EUR', ext.EUR], ['HHS', ext.HHS], ['Avans', ext.AVANS], ['Fundatis', ext.FUNDATIS], ['NPuls', ext.NPULS], ['Vernieuwenderwijs', ext.VNW], ['TU/e', ext.TUE],
  ];
  const LOS_EXTERN = schud([
    ...ORGS.map(([naam, mensen]) => [`Afstemming ${naam} / CACI`, 45, { org: mensen[0], att: [ik, ...mensen], notes: TEAMS }]),
    ...ORGS.slice(0, 6).map(([naam, mensen], i) => [`Demo ${ONDERWERPEN[i]} voor ${naam}`, 60, { att: [ik, petra, ...mensen], notes: TEAMS }]),
    ...ORGS.slice(0, 6).map(([naam, mensen], i) => [`Overleg ${ONDERWERPEN[i + 6]} met ${naam}`, 90, { org: mensen[0], att: [ik, kees, ...mensen], loc: naam === 'HHS' ? 'Haagse Hogeschool, Johanna Westerdijkplein 75, Den Haag' : '' }]),
    ['NPuls/CACI', 60, { org: ext.NPULS[0], att: [...ext.EUR, ...ext.SURF, ...ext.NPULS, ik, kees], notes: TEAMS }],
    ['SURF Onderwijsdagen briefing', 30, { att: [ik, ...ext.SURF], notes: TEAMS }],
  ], 11);
  const HELE_DAG = ['Reservewater vervangen', 'Studiedag', 'Teamuitje'];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const op = (dag, hm) => { const [h, m] = hm.split(':').map(Number); const d = new Date(dag); d.setHours(h, m, 0, 0); return d; };
  const weekNr = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7); };

  function afspraak(uid, titel, start, eind, o = {}) {
    const att = o.att || team;
    return {
      id: `${uid}|${start.toISOString()}`, uid, title: titel,
      start: start.toISOString(), end: eind.toISOString(), allDay: false,
      location: o.loc || '', notes: o.notes || '', url: '',
      organizer: o.org || ik, attendees: att,
      recurring: !!o.vast, repeat: o.vast ? { freq: 'weekly', interval: o.elke || 1 } : null,
      detached: false, canceled: false, tentative: false, free: false,
    };
  }

  // Alle afspraken van de week die op maandag ma begint
  function week(ma) {
    const uit = [];
    const nr = weekNr(ma);
    const r = rng(ma.getFullYear() * 100 + nr);
    const dag = (i) => { const d = new Date(ma); d.setDate(d.getDate() + i); return d; };
    for (let i = 0; i < 4; i++) uit.push(afspraak('scrum', SCRUM[2], op(dag(i), SCRUM[0]), op(dag(i), SCRUM[1]), { ...SCRUM[3], vast: true }));
    [...VAST, ...VAST_EXTERN].forEach(([wd, b, e, t, o]) => {
      if (o.elke && nr % o.elke !== 0) return;
      uit.push(afspraak(`vast-${t}`, t, op(dag(wd - 1), b), op(dag(wd - 1), e), { ...o, vast: true }));
    });
    // Losse afspraken op vrije plekken tussen 9:00 en 17:00
    const bezet = (d, a, b) => uit.some((x) => { const s = new Date(x.start), e = new Date(x.end); return s.toDateString() === d.toDateString() && s < b && e > a; });
    // Week w neemt de titels vanaf plek w × stap: zo zit er een flink aantal weken tussen dezelfde titel
    const weekIndex = Math.round(ma.getTime() / (7 * 864e5));
    const plaats = (lijst, aantal, soort, stap) => {
      for (let n = 0; n < aantal; n++) {
        const [titel, min, o] = lijst[(((weekIndex * stap + n) % lijst.length) + lijst.length) % lijst.length];
        for (let poging = 0; poging < 12; poging++) {
          const d = dag(Math.floor(r() * 5));
          const start = op(d, `${9 + Math.floor(r() * 7)}:${r() < 0.5 ? '00' : '30'}`);
          const eind = new Date(start.getTime() + min * 60000);
          if (eind.getHours() > 17 || (eind.getHours() === 17 && eind.getMinutes() > 0)) continue;
          if (bezet(d, start, eind)) continue;
          uit.push(afspraak(`${soort}-${nr}-${n}`, titel, start, eind, o));
          break;
        }
      }
    };
    plaats(LOS_EXTERN, 2 + Math.floor(r() * 2), 'extern', 3);
    plaats(LOS_INTERN, 3 + Math.floor(r() * 3), 'intern', 5);
    // Af en toe een hele dag, een vrije lunchwandeling of een afgezegde afspraak
    if (r() < 0.35) {
      const d = dag(Math.floor(r() * 5));
      uit.push({ ...afspraak(`hd-${nr}`, HELE_DAG[Math.floor(r() * HELE_DAG.length)], d, d, { att: [] }), start: ymd(d), end: ymd(dag((d.getDay() + 6) % 7 + 1)), allDay: true, organizer: null, free: true });
    }
    if (r() < 0.5) {
      const d = dag(Math.floor(r() * 5));
      uit.push({ ...afspraak(`lunch-${nr}`, 'Lunchwandeling', op(d, '12:00'), op(d, '12:30'), { att: [] }), organizer: null, free: true });
    }
    return uit;
  }

  // Afspraken van van t/m tot (weken vanaf de maandag van van)
  return function (van, tot) {
    const ma = new Date(van); ma.setHours(0, 0, 0, 0); ma.setDate(ma.getDate() - ((ma.getDay() + 6) % 7));
    const uit = [];
    for (let w = new Date(ma); w < tot; w.setDate(w.getDate() + 7)) uit.push(...week(new Date(w)));
    return uit;
  };
})();
