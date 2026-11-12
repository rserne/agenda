// Agenda, instellingen
// Instellingen, de agenda-link en het kiezen van een agenda.
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

/* ------------------------------------------------------------------ */
/*  Agenda-link en agenda kiezen                                       */
/* ------------------------------------------------------------------ */

function openLinkPaneel(voorstel = '') {
  const el = document.createElement('div');
  el.className = 'paneel detail nieuw linkpaneel' + (isDesktop() ? ' dialoog' : '');
  const huidig = voorstel; // de huidige link tonen we niet
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><h2 class="dtitel">Cloudflare</h2></div>
      <p class="linkuitleg">Plak de link van je Cloudflare Worker, met de sleutel erin.</p>
      <div class="formkaart">
        <label class="frij kolom"><span class="flabel">Link</span><input id="linkinvoer" type="url" inputmode="url" placeholder="https://agenda.rserne.workers.dev/?sleutel=…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" value="${esc(huidig)}"></label>
      </div>
      <p class="linkfout" id="linkfout" hidden></p>
      <div class="dvoet">
        <button class="groteknop hoofd" id="linkknop">Koppelen</button>
        <p class="voetnoot">De link blijft op dit toestel. Wie de link heeft, ziet je agenda en notities: deel hem dus niet.</p>
      </div>
    </div>`;
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  const invoer = $('#linkinvoer', el), fout = $('#linkfout', el);
  const haal = () => {
    const link = invoer.value.trim();
    const melding = /^webcals?:|outlook\.(office365|office|live)\.com/i.test(link)
      ? 'Een Outlook-link kan de app niet rechtstreeks ophalen. Gebruik de link van je Cloudflare Worker.'
      : !/^https:\/\/\S+$/i.test(link) ? 'Dit is geen geldige link. Hij begint met https://.' : null;
    if (melding) { fout.textContent = melding; fout.hidden = false; return; }
    p.sluit();
    // Met een .ics-bestand als agenda blijft dat zo; anders haalt de app meteen je Outlook-agenda op
    zetKoppeling(link);
    if (BESTAND && !BESTAND.link) { synchroniseerStraks(300); tekenSyncStatus(); } else gebruikLink(link);
  };
  $('#linkknop', el).addEventListener('click', haal);
  invoer.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') haal(); });
  el.addEventListener('click', (ev) => { if (ev.target.closest('[data-actie="sluit"]')) p.sluit(); });
  if (!huidig) setTimeout(() => invoer.focus(), 350);
}

// Kiezen waar de afspraken vandaan komen: de Cloudflare-link (werkt zichzelf bij), een .ics-bestand of de voorbeeldgegevens
function openBronPaneel() {
  const nu = BESTAND && BESTAND.link ? 'link' : BESTAND ? 'bestand' : 'voorbeeld';
  const optie = (id, icoon, titel, sub) => `<button class="bronoptie${nu === id ? ' aan' : ''}" data-bron="${id}" aria-pressed="${nu === id}">
      <span class="bronicoon">${icoon}</span><span class="tekst"><span class="t1">${titel}</span><span class="t2">${sub}</span></span>${nu === id ? `<span class="bronvink">${I.vink}</span>` : ''}</button>`;
  const el = document.createElement('div');
  el.className = 'paneel detail nieuw bronpaneel' + (isDesktop() ? ' dialoog' : '');
  el.innerHTML = `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>
    <div class="detailinhoud">
      <div class="dkop"><h2 class="dtitel">Agenda kiezen</h2></div>
      <div class="formkaart bronlijst">
        ${optie('link', I.koppel, 'Via je agenda-link', 'Wordt vanzelf bijgewerkt')}
        ${optie('bestand', I.inladen, 'Uit een .ics-bestand', 'Bijwerken doe je zelf')}
        ${optie('voorbeeld', I.kalender, 'Voorbeeldgegevens', 'Verzonnen afspraken en namen')}
      </div>
      <p class="voetnoot">Je agenda blijft alleen op dit toestel. In Outlook verandert er niets.</p>
    </div>`;
  const p = openPaneel(el, { greepSelector: '.detailgreep' });
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    const k = ev.target.closest('[data-bron]');
    if (!k) return;
    const keuze = k.dataset.bron;
    // Het bestandsvenster moet direct bij de tik openen (iOS), dus vóór het sluiten van het paneel
    if (keuze === 'bestand') { $('#icsinvoer').click(); p.sluit(); return; }
    p.sluit();
    if (keuze === 'link') { if (koppeling()) gebruikLink(koppeling()); else setTimeout(() => openLinkPaneel(), 250); }
    else if (keuze === 'voorbeeld' && nu !== 'voorbeeld' && confirm(wisVraag())) vergeetBestand();
  });
}

/* ------------------------------------------------------------------ */
/*  Instellingen                                                       */
/* ------------------------------------------------------------------ */

// Alles wat alleen op dit toestel staat: je agenda, je contacten, je ruimtes en de Google-sleutel
// Instellingen: op de Mac als venster (vanuit de zijbalk), op iPhone en iPad als tab (doel: het scherm om in te tekenen)
function openInstellingen({ doel = null } = {}) {
  const el = doel || document.createElement('div');
  if (!doel) {
    el.className = 'paneel detail nieuw instellingen' + (isDesktop() ? ' dialoog' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Instellingen');
  }
  const knop = (actie, icoon, tekst, uit = false, gevaar = false) => `<button class="frij instknop${gevaar ? ' gevaar' : ''}" data-actie="${actie}"${uit ? ' disabled' : ''}>${icoon}<span>${tekst}</span></button>`;
  const status = (icoon, t1, t2) => `<div class="frij inststatus">${icoon}<span class="tekst"><span class="t1">${t1}</span>${t2 ? `<span class="t2">${t2}</span>` : ''}</span></div>`;
  const agendaHtml = () => {
    const [t1, t2] = agendaBron();
    return status(BESTAND && BESTAND.link ? I.koppel : BESTAND ? I.inladen : I.kalender, t1, t2)
      + (BESTAND && !BESTAND.link ? knop('ics-openen', I.inladen, 'Ander bestand inladen') : '')
      + knop('ics-kies', I.kalender, BESTAND ? 'Andere agenda kiezen' : 'Je eigen agenda kiezen');
  };
  const contactHtml = () => {
    const c = CONTACTEN_INFO;
    const d = c && new Date(c.datum);
    return (c ? status(I.persoon, c.aantal === 1 ? '1 contact' : `${c.aantal} contacten`, `Ingeladen op ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`)
      : status(I.persoon, 'Geen contacten', 'Met contacten kun je makkelijk deelnemers bij een afspraak opgeven'))
      + knop('contacten-inladen', I.inladen, c ? 'Ander bestand inladen' : 'Contacten inladen')
      + (c ? knop('contacten-wis', I.wissen, 'Contacten verwijderen', false, true) : '');
  };
  // Ruimtes: per ruimte een naam en een e-mailadres, met een knop om hem te verwijderen
  const ruimteRij = (r, i) => `<div class="frij ruimterij" data-i="${i}">
      <span class="ruimtevelden">
        <input class="rnaam" type="text" placeholder="Naam" aria-label="Naam van de ruimte" autocomplete="off" autocapitalize="words" spellcheck="false" value="${esc(r.naam)}">
        <input class="rmail${r.email && !IS_ADRES.test(r.email.trim()) ? ' ongeldig' : ''}" type="email" inputmode="email" placeholder="E-mailadres (optioneel)" aria-label="E-mailadres van de ruimte" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(r.email)}">
      </span>
      <button class="ruimteweg" data-actie="ruimte-weg" aria-label="${esc(r.naam ? `${r.naam} verwijderen` : 'Ruimte verwijderen')}"><span class="rond">${I.min}</span></button>
    </div>`;
  // Google-sleutel: nooit tonen. Alleen of er een is, en hem testen, wijzigen of verwijderen.
  const googleHtml = (bewerk = false) => {
    if (bewerk) return `<label class="frij"><span class="flabel">Sleutel</span><input id="igoogle" class="geheim" type="text" placeholder="Plak hier je sleutel" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"></label>`
      + knop('google-bewaar', I.vink, 'Bewaren') + knop('google-annuleer', I.kruis, 'Annuleren');
    if (googleSleutel()) return status(I.speld, 'Google-sleutel ingesteld', 'Bij Locatie zoek je ook naar adressen en plaatsen')
      + knop('google-wijzig', I.herhaal, 'Sleutel wijzigen') + knop('google-wis', I.wissen, 'Sleutel verwijderen', false, true);
    return status(I.speld, 'Geen Google-sleutel', 'Met een sleutel zoek je bij Locatie ook naar adressen en plaatsen')
      + knop('google-wijzig', I.plus, 'Sleutel opgeven');
  };
  const ruimtesHtml = () => ruimteLijst().map(ruimteRij).join('') + `<button class="frij instknop" data-actie="ruimte-erbij">${I.plus}<span>Ruimte toevoegen</span></button>`;
  el.innerHTML = `${doel ? '' : `<div class="detailgreep"><div class="greep"></div>
      <div class="detailnav"><button class="rond glas" data-actie="sluit" aria-label="Sluiten">${I.kruis}</button></div></div>`}
    <div class="detailinhoud">
      ${doel ? '' : '<div class="dkop"><h2 class="dtitel">Instellingen</h2></div>'}
      <section class="instsectie"><h3>Cloudflare</h3><div class="formkaart" id="isync">${syncStatusHtml()}</div></section>
      <section class="instsectie"><h3>Agenda</h3><div class="formkaart" id="iagenda">${agendaHtml()}</div></section>
      <section class="instsectie"><h3>Ruimtes</h3><div class="formkaart" id="iruimtes">${ruimtesHtml()}</div></section>
      <section class="instsectie"><h3>Alleen op dit toestel</h3>
        <div class="formkaart" id="icontacten">${contactHtml()}</div>
        <p class="insttoelichting">Een csv uit NK2Edit of Outlook, of een vCard (.vcf).</p>
        <div class="formkaart" id="igooglekaart">${googleHtml()}</div><p class="insttoelichting" id="igoogleuitslag" aria-live="polite"></p></section>
      <p class="voetnoot">Versie ${esc(APP_VERSIE)}</p>
    </div>`;
  const p = doel ? { sluit: () => {} } : openPaneel(el, { greepSelector: '.detailgreep' });
  const tekenAgenda = () => { const a = $('#iagenda', el); if (a) a.innerHTML = agendaHtml(); };
  el.tekenAgenda = tekenAgenda; // als tab: bijwerken zonder het scherm opnieuw op te bouwen
  const tekenContacten = () => { const a = $('#icontacten', el); if (a) a.innerHTML = contactHtml(); };
  const uitslag = (tekst, fout = false) => { const u = $('#igoogleuitslag', el); u.textContent = tekst; u.classList.toggle('fout', fout); };
  const tekenGoogle = (bewerk = false) => {
    $('#igooglekaart', el).innerHTML = googleHtml(bewerk);
    if (bewerk) $('#igoogle', el).focus();
  };
  const testSleutel = async () => {
    uitslag('Testen…');
    const r = await testGoogleSleutel(googleSleutel());
    uitslag(r.tekst, !r.ok);
  };
  async function googleActie(actie) {
    if (actie === 'google-wijzig') { uitslag(''); tekenGoogle(true); }
    else if (actie === 'google-annuleer') { uitslag(''); tekenGoogle(); }
    else if (actie === 'google-bewaar') {
      const nieuw = $('#igoogle', el).value.trim();
      if (!nieuw) { uitslag('Plak eerst een sleutel.', true); $('#igoogle', el).focus(); return; }
      zetGoogleSleutel(nieuw);
      tekenGoogle();
      testSleutel(); // meteen laten zien of hij werkt (later ziet Locatie het vanzelf als Google hem weigert)
    } else if (actie === 'google-wis' && confirm('De Google-sleutel van dit toestel verwijderen?')) { zetGoogleSleutel(''); uitslag(''); tekenGoogle(); }
  }
  el.addEventListener('keydown', (ev) => {
    if (ev.target.id !== 'igoogle') return;
    if (ev.key === 'Enter') { ev.preventDefault(); googleActie('google-bewaar'); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); googleActie('google-annuleer'); }
  });
  // Wat er in de velden staat, meteen bewaren
  const leesRuimtes = () => [...el.querySelectorAll('.ruimterij')].map((rij) => ({ naam: $('.rnaam', rij).value, email: $('.rmail', rij).value }));
  const tekenRuimtes = (focusRij = -1) => {
    $('#iruimtes', el).innerHTML = ruimtesHtml();
    if (focusRij >= 0) { const i = el.querySelector(`.ruimterij[data-i="${focusRij}"] .rnaam`); if (i) i.focus(); }
  };
  // Komen er ruimtes binnen van een ander toestel, dan de lijst opnieuw tekenen (niet terwijl je erin typt)
  const ruimtesBinnen = () => {
    if (!el.isConnected) { document.removeEventListener('ruimtesbinnen', ruimtesBinnen); return; }
    if (!$('#iruimtes', el).contains(document.activeElement)) tekenRuimtes();
  };
  document.addEventListener('ruimtesbinnen', ruimtesBinnen);
  el.addEventListener('input', (ev) => {
    if (ev.target.closest('.ruimterij')) zetRuimteLijst(leesRuimtes());
    if (ev.target.classList.contains('rmail')) { const w = ev.target.value.trim(); ev.target.classList.toggle('ongeldig', !!w && !IS_ADRES.test(w)); }
  });
  el.addEventListener('click', async (ev) => {
    const t = ev.target;
    if (t.closest('[data-actie="sluit"]')) { p.sluit(); return; }
    const a = t.closest('[data-actie]');
    const actie = a && a.dataset.actie;
    // Een bestandsvenster moet direct bij de tik openen (iOS), dus vóór het sluiten van het paneel
    if (actie === 'ics-openen') { $('#icsinvoer').click(); p.sluit(); return; }
    if (actie === 'contacten-inladen') { $('#contactinvoer').click(); p.sluit(); return; }
    if (actie === 'ics-kies') { p.sluit(); setTimeout(openBronPaneel, 250); return; }
    if (actie === 'ruimte-erbij') { const l = leesRuimtes(); l.push({ naam: '', email: '' }); zetRuimteLijst(l); tekenRuimtes(l.length - 1); return; }
    if (actie === 'ruimte-weg') { const l = leesRuimtes(); l.splice(Number(a.closest('.ruimterij').dataset.i), 1); zetRuimteLijst(l); tekenRuimtes(); return; }
    // Nu synchroniseren: ook de Outlook-agenda opnieuw ophalen
    if (actie === 'sync-nu') {
      if (BESTAND && BESTAND.link) { Promise.resolve(nuBijwerken()).finally(() => { tekenAgenda(); tekenSyncStatus(); }); tekenAgenda(); }
      synchroniseer();
      return;
    }
    if (actie === 'koppeling-wijzig') { p.sluit(); setTimeout(() => openLinkPaneel(), doel ? 0 : 250); return; }
    if (actie === 'koppeling-wis') {
      const vraagTekst = BESTAND && BESTAND.link
        ? 'De koppeling met Cloudflare van dit toestel verwijderen? Je notities en ruimtes blijven hier staan; je Outlook-agenda verdwijnt van dit toestel.'
        : 'De koppeling met Cloudflare van dit toestel verwijderen? Je notities en ruimtes blijven hier staan.';
      if (!confirm(vraagTekst)) return;
      vergeetKoppeling();
      if (BESTAND && BESTAND.link) await vergeetBestand();
      tekenSyncStatus(); tekenAgenda();
      return;
    }
    if (actie === 'contacten-wis') {
      if (confirm('Contacten van dit toestel verwijderen? Je bestand zelf blijft bestaan.')) { await vergeetContacten(); tekenContacten(); render(); renderZijbalk(); }
      return;
    }
    if (actie && actie.startsWith('google-')) googleActie(actie);
  });
}
