// Meting: instellingen
// Als venster en als tab, in vier toestanden (leeg, bestand, link, link met fout): ruimtes toevoegen, wijzigen en
// verwijderen, ruimtes van een ander toestel, de Google-sleutel, synchroniseren, de koppeling en de contacten. Na elke
// handeling de HTML, de velden, de focus, wat is bewaard en welke functies zijn aangeroepen.
// Alle namen, adressen en sleutels hierin zijn verzonnen. inPagina draait in de browser, binnen de app.

export const titel = 'Instellingen';
export const samenvatting = (u) => `${u.res.length} reeksen, ${u.res.reduce((t, x) => t + x.log.length, 0)} stappen`;

export async function inPagina() {
  const slaap = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const plat = (h) => h.replace(/\s+/g, ' ').split(APP_VERSIE).join('VERSIE'); // het versienummer telt niet mee
  const roep = [];
  let gekoppeld = false, ja = true, sleutelGoed = true;
  // Alles wat het scherm buiten zichzelf aanroept: alleen vastleggen
  for (const f of ['nuBijwerken', 'synchroniseer', 'synchroniseerStraks', 'render', 'renderZijbalk', 'openBronPaneel', 'openLinkPaneel']) window[f] = (...a) => { roep.push(`${f}(${a.map((x) => JSON.stringify(x)).join(',')})`); };
  window.tekenSyncStatus = () => { roep.push('tekenSyncStatus'); document.querySelectorAll('#isync').forEach((x) => { x.innerHTML = syncStatusHtml(); }); };
  window.vergeetBestand = async () => { roep.push('vergeetBestand'); await slaap(20); BESTAND = null; };
  window.vergeetContacten = async () => { roep.push('vergeetContacten'); await slaap(20); CONTACTEN_INFO = null; };
  window.testGoogleSleutel = async (s) => { roep.push(`testGoogleSleutel(${s})`); await slaap(30); return sleutelGoed ? { ok: true, tekst: 'De sleutel werkt.' } : { ok: false, tekst: 'Google weigert de sleutel.' }; };
  window.confirm = (vraag) => { roep.push(`confirm(${vraag}) → ${ja}`); return ja; };
  const knop = (actie, tekst) => `<button class="frij instknop" data-actie="${actie}"><span>${tekst}</span></button>`;
  window.syncStatusHtml = () => (gekoppeld ? `<div class="frij inststatus">Gekoppeld</div>${knop('sync-nu', 'Nu synchroniseren')}${knop('koppeling-wijzig', 'Koppeling wijzigen')}${knop('koppeling-wis', 'Koppeling verwijderen')}` : `<div class="frij inststatus">Niet gekoppeld</div>${knop('koppeling-wijzig', 'Koppeling opgeven')}`);
  for (const id of ['icsinvoer', 'contactinvoer']) document.getElementById(id).click = () => roep.push(`#${id}.click`);

  const toestanden = [
    ['leeg', { bestand: null, contacten: null, ruimtes: [], google: '', gekoppeld: false }],
    ['bestand, één contact', { bestand: { naam: 'agenda & <meer>.ics', datum: new Date(2026, 9, 3).getTime() }, contacten: { naam: 'c.csv', datum: new Date(2026, 8, 21).getTime(), aantal: 1 }, ruimtes: [{ naam: 'Zaal Een', email: 'zaal@voorbeeld-a.example' }], google: '', gekoppeld: false }],
    ['link, contacten, ruimtes, sleutel', { bestand: { naam: 'Outlook', datum: Date.now(), link: 'x' }, contacten: { naam: 'c.csv', datum: new Date(2026, 10, 1).getTime(), aantal: 214 }, ruimtes: [{ naam: 'Zaal "Een"', email: 'zaal@voorbeeld-a.example' }, { naam: '', email: 'geen adres' }, { naam: 'Kamer', email: '' }], google: 'nep-sleutel', gekoppeld: true }],
    ['link met fout', { bestand: { naam: 'Outlook', datum: Date.now(), link: 'x', linkFout: true }, contacten: null, ruimtes: [{ naam: 'Zaal', email: '' }], google: 'nep-sleutel', gekoppeld: true }],
  ];
  const zet = (t) => { BESTAND = t.bestand ? { ...t.bestand } : null; CONTACTEN_INFO = t.contacten ? { ...t.contacten } : null; LS.set('ag_ruimtes2', t.ruimtes); if (t.google) LS.set('ag_google', t.google); else LS.del('ag_google'); gekoppeld = t.gekoppeld; ja = true; sleutelGoed = true; };
  const res = [];
  for (const modus of ['venster', 'tab']) for (const [titel, toestand] of toestanden) {
    // Elke reeks begint met een vers scherm in dezelfde toestand
    const reeks = async (wat, doe) => {
      zet(toestand);
      let el, doel = null;
      if (modus === 'tab') { doel = document.createElement('div'); doel.className = 'instellingen instscherm'; doel.id = 'instscherm'; document.body.append(doel); openInstellingen({ doel }); el = doel; }
      else { openInstellingen(); el = [...document.querySelectorAll('.paneel.instellingen')].pop(); }
      const log = [];
      const q = (s) => el.querySelector(s);
      const snap = async (stap, ms = 60) => {
        await slaap(ms);
        const a = document.activeElement;
        log.push({ stap, html: plat(el.innerHTML), velden: [...el.querySelectorAll('input')].map((i) => `${i.className || i.id}=${i.value}`).join(' | '), focus: a ? (a.id || a.className || a.tagName) : '',
          open: el.classList.contains('open'), ruimtes: JSON.stringify(LS.get('ag_ruimtes2')), google: String(LS.get('ag_google') || ''), koppeling: String(LS.get('ag_koppeling') || ''), tekenAgenda: typeof el.tekenAgenda, roep: roep.splice(0).join(' ; ') });
      };
      const klik = async (s, stap, n = 0, ms) => { const k = el.querySelectorAll(s)[n]; if (!k || k.disabled) { log.push({ stap: `${stap}: niet mogelijk` }); return false; } k.click(); await snap(stap, ms); return true; };
      const typ = async (veld, waarde, stap) => { veld.focus(); veld.value = waarde; veld.dispatchEvent(new Event('input', { bubbles: true })); await snap(stap); };
      const toets = async (veld, key, stap, ms) => { veld.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); await snap(stap, ms); };
      await snap('open', 100);
      await doe({ el, q, snap, klik, typ, toets });
      if (doel) doel.remove(); else if (el.classList.contains('open')) { q('[data-actie="sluit"]').click(); await snap('gesloten', 100); }
      document.dispatchEvent(new Event('ruimtesbinnen')); // het scherm is weg: de luisteraar meldt zich af
      LS.del('ag_koppeling');
      res.push({ modus, titel, wat, klasse: el.className, rol: el.getAttribute('role'), log });
    };
    await reeks('ruimtes', async ({ el, q, snap, klik, typ }) => {
      await klik('[data-actie="ruimte-erbij"]', 'ruimte erbij');
      const rij = () => [...el.querySelectorAll('.ruimterij')].pop();
      await typ(rij().querySelector('.rnaam'), 'Nieuwe <zaal>', 'naam getypt');
      await typ(rij().querySelector('.rmail'), 'geen-adres', 'ongeldig adres');
      await typ(rij().querySelector('.rmail'), ' nieuw@voorbeeld-b.example ', 'geldig adres');
      await typ(rij().querySelector('.rmail'), '', 'adres leeg');
      // Ruimtes van een ander toestel: niet terwijl je in de lijst typt, wel daarna
      LS.set('ag_ruimtes2', [{ naam: 'Van elders', email: '' }]);
      document.dispatchEvent(new Event('ruimtesbinnen')); await snap('ruimtes binnen tijdens typen');
      document.activeElement.blur(); document.dispatchEvent(new Event('ruimtesbinnen')); await snap('ruimtes binnen daarna');
      await klik('[data-actie="ruimte-erbij"]', 'nog een ruimte'); await klik('[data-actie="ruimte-erbij"]', 'en nog een');
      await klik('[data-actie="ruimte-weg"]', 'eerste ruimte weg'); await klik('[data-actie="ruimte-weg"]', 'laatste ruimte weg', el.querySelectorAll('[data-actie="ruimte-weg"]').length - 1);
      await klik('.ruimteweg .rond', 'tik op het rondje in de knop');
    });
    await reeks('google', async ({ q, snap, klik, typ, toets }) => {
      await klik('[data-actie="google-wijzig"]', 'sleutel wijzigen');
      await toets(q('#igoogle'), 'Escape', 'Escape annuleert');
      await klik('[data-actie="google-wijzig"]', 'opnieuw wijzigen'); await klik('[data-actie="google-annuleer"]', 'annuleren');
      await klik('[data-actie="google-wijzig"]', 'weer wijzigen'); await klik('[data-actie="google-bewaar"]', 'bewaren zonder sleutel');
      await typ(q('#igoogle'), '  nieuwe-sleutel  ', 'sleutel getypt'); await toets(q('#igoogle'), 'a', 'gewone toets');
      await toets(q('#igoogle'), 'Enter', 'Enter bewaart: testen', 5); await snap('uitslag van de test', 100);
      sleutelGoed = false;
      await klik('[data-actie="google-wijzig"]', 'nog eens wijzigen'); await typ(q('#igoogle'), 'slechte-sleutel', 'slechte sleutel'); await klik('[data-actie="google-bewaar"]', 'bewaren: testen', 0, 5); await snap('uitslag: geweigerd', 100);
      ja = false; await klik('[data-actie="google-wis"]', 'verwijderen, toch niet');
      ja = true; await klik('[data-actie="google-wis"]', 'verwijderen');
    });
    await reeks('synchroniseren', async ({ snap, klik }) => { await klik('[data-actie="sync-nu"]', 'nu synchroniseren'); await snap('even later', 100); });
    await reeks('koppeling wijzigen', async ({ snap, klik }) => { await klik('[data-actie="koppeling-wijzig"]', 'koppeling wijzigen', 0, 30); await snap('na 300 ms', 300); });
    await reeks('koppeling verwijderen', async ({ snap, klik }) => {
      LS.set('ag_koppeling', 'nep');
      ja = false; await klik('[data-actie="koppeling-wis"]', 'verwijderen, toch niet');
      ja = true; await klik('[data-actie="koppeling-wis"]', 'verwijderen', 0, 5); gekoppeld = false; await snap('even later', 100);
    });
    await reeks('contacten verwijderen', async ({ snap, klik }) => {
      ja = false; await klik('[data-actie="contacten-wis"]', 'verwijderen, toch niet');
      ja = true; await klik('[data-actie="contacten-wis"]', 'verwijderen', 0, 5); await snap('even later', 100);
    });
    await reeks('ander bestand', async ({ snap, klik }) => { await klik('[data-actie="ics-openen"]', 'ander bestand inladen'); await snap('na 400 ms', 400); });
    await reeks('contacten inladen', async ({ snap, klik }) => { await klik('[data-actie="contacten-inladen"]', 'contacten inladen'); await snap('na 400 ms', 400); });
    await reeks('agenda kiezen', async ({ snap, klik }) => { await klik('[data-actie="ics-kies"]', 'agenda kiezen', 0, 30); await snap('na 300 ms', 300); });
    await reeks('sluiten', async ({ klik }) => { await klik('[data-actie="sluit"]', 'sluiten', 0, 400); });
  }
  return { res };
}
