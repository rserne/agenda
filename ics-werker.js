// Agenda, het .ics-bestand inlezen in een Web Worker
// Een gepubliceerde Outlook-agenda is al gauw 1 à 2 MB met herhaalreeksen. Inlezen en uitrollen kost op een
// telefoon enkele seconden. Hier gebeurt dat naast de app, zodat scrollen en tikken gewoon doorgaan.
//
// Berichten: { id, soort: 'lees', tekst, eigenDomeinen, eigenOrg }  → { eigenDomeinen }
//            { id, soort: 'weken', weken: [[van, tot], …] } (ms)  → { weken: { van: [afspraak, …] } }

// ical.js is een gewoon script dat ICAL als globale variabele maakt; in een module-worker lezen we het zo in
const klaar = (async () => {
  const bron = await (await fetch(new URL('./vendor/ical.min.js', import.meta.url))).text();
  (0, eval)(bron); // eslint-disable-line no-eval
  const [{ maakOmzetter }, verrijk] = await Promise.all([import('./functions/_ical.js'), import('./functions/_verrijk.js')]);
  return { omzetter: maakOmzetter(self.ICAL), ...verrijk };
})();

let stand = null; // { reeksen, kennis, eigenOrg }

self.onmessage = async ({ data }) => {
  const { id, soort } = data;
  try {
    const code = await klaar;
    if (soort === 'lees') {
      stand = {
        reeksen: code.omzetter.voorbereid(data.tekst),
        kennis: code.leerUitIcal(data.tekst, data.eigenDomeinen || []),
        eigenOrg: data.eigenOrg || '',
      };
      self.postMessage({ id, ok: true, uit: { eigenDomeinen: stand.kennis.eigenDomeinen } });
    } else if (soort === 'weken') {
      if (!stand) throw new Error('Nog geen bestand ingelezen');
      const weken = {};
      for (const [van, tot] of data.weken) {
        weken[van] = code.omzetter.uitrollen(stand.reeksen, new Date(van), new Date(tot)).map((e) => {
          // Gepubliceerde agenda zonder organisator en deelnemers: de organisatie afleiden (zie _verrijk.js)
          const hint = e.organizer || e.attendees.length ? null : code.hintVoor(e, stand.kennis, stand.eigenOrg);
          return hint ? { ...e, hint } : e;
        });
      }
      self.postMessage({ id, ok: true, uit: { weken } });
    } else throw new Error(`Onbekend verzoek: ${soort}`);
  } catch (e) {
    self.postMessage({ id, ok: false, fout: e && e.message ? e.message : String(e) });
  }
};
