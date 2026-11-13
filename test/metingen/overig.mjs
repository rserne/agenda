// Meting: de overige panelen en de statusregel van Cloudflare
// De panelen Koppeling opgeven, Agenda kiezen en Actiepunten bij een dag, en de statusregel van Cloudflare in zeven
// toestanden.
// Alle namen, adressen en sleutels hierin zijn verzonnen. inPagina draait in de browser, binnen de app.

export const titel = 'De overige panelen en de statusregel van Cloudflare';
export const samenvatting = (u) => `${Object.keys(u).length} onderdelen`;

export async function inPagina() {
  const slaap = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let wisselId = null; // het willekeurige id van de testnotitie
  const plat = (h) => { const t = h.replace(/\s+/g, ' '); return wisselId ? t.split(wisselId).join('ID') : t; };
  const res = {};
  const paneel = async (sleutel, kiezer, open) => {
    await open(); await slaap(150);
    const el = [...document.querySelectorAll(kiezer)].pop();
    res[sleutel] = el ? { klasse: el.className.replace(/\s*open\s*/, ' ').trim(), html: plat(el.innerHTML) } : 'niet gevonden';
    if (el) { el.querySelector('[data-actie="sluit"]').click(); await slaap(400); res[sleutel].dichtNaSluiten = !el.classList.contains('open'); }
  };
  // Koppeling opgeven en agenda kiezen
  await paneel('link leeg', '.paneel.linkpaneel', () => openLinkPaneel());
  await paneel('link met voorstel', '.paneel.linkpaneel', () => openLinkPaneel('https://voorbeeld.example/?sleutel=nep&x="1"'));
  const echt = BESTAND;
  for (const [k, b] of [['voorbeeld', null], ['bestand', { naam: 'a.ics', datum: 1 }], ['link', { naam: 'Outlook', datum: 1, link: 'x' }]]) { BESTAND = b; await paneel(`bron ${k}`, '.paneel.bronpaneel', () => openBronPaneel()); }
  BESTAND = echt;
  // Actiepunten bij een dag
  await laadNotities();
  const e = [...zichtbaar.values()].find((x) => !x.allDay);
  const n = maakNotitie(e); wisselId = n.id; wijzigNotitie(n, { tekst: 'Over de offerte', punten: [{ id: 'p1', tekst: 'Offerte sturen', klaar: false, deadline: '2026-11-03' }, { id: 'p2', tekst: 'Bellen & <mailen>', klaar: false, deadline: ymd(e.start) }] });
  render(); await slaap(300);
  await paneel('actiepunten bij een dag', '.paneel.dagpunten', () => document.querySelector('#inhoud [data-agdag]').click());
  // De statusregel van Cloudflare
  let adres = null;
  window.notitieAdres = () => adres;
  const toestand = (sleutel, sync, linkBezig = false) => { Object.assign(SYNC, { bezig: false, fout: null, geenDatabase: false, laatst: 0 }, sync); LINK_BEZIG = linkBezig; res[`sync ${sleutel}`] = plat(syncStatusHtml()); };
  toestand('niet gekoppeld', {});
  adres = 'https://voorbeeld.example/notities';
  toestand('gekoppeld', {}); toestand('bezig', { bezig: true }); toestand('geen database', { geenDatabase: true }); toestand('fout', { fout: 'Geen verbinding <met> de Worker' });
  toestand('gesynchroniseerd', { laatst: new Date(2026, 10, 4, 8, 50).getTime() }); toestand('agenda bezig', { laatst: new Date(2026, 10, 4, 8, 50).getTime() }, true);
  LINK_BEZIG = false; Object.assign(SYNC, { bezig: false, fout: null, geenDatabase: false, laatst: 0 });
  return res;
}
