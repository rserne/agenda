// Stempagina van de datumprikker. Genodigden openen prik.html?p=<code>, zien alleen de voorgestelde tijden
// en geven per tijd ja, misschien of nee. Geen account nodig: Nhost laat zonder inlog (rol 'public') alleen
// deze ene peiling lezen en er een stem aan toevoegen zolang hij open is (zie database/README.md).
(function () {
  'use strict';
  const NHOST_SUB = 'gjqqtpteurwdbealgmqh'; // gelijk aan app.js
  const NHOST_REG = 'eu-central-1';
  const GQL = `https://${NHOST_SUB}.graphql.${NHOST_REG}.nhost.run/v1`;
  const main = document.getElementById('stem');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const dagNaam = (d) => cap(d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }));
  const tijd = (d) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const duurTekst = (m) => (m < 60 ? `${m} minuten` : m % 60 === 0 ? `${m / 60} uur` : `${Math.floor(m / 60)} uur en ${m % 60} minuten`);
  const opslag = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privévenster */ } } };

  async function gql(query, variables) {
    const r = await fetch(GQL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.errors) throw new Error((d.errors && d.errors[0] && d.errors[0].message) || `Fout ${r.status}`);
    return d.data;
  }
  const melding = (t) => { main.innerHTML = `<div class="melding">${t}</div>`; };

  const id = new URLSearchParams(location.search).get('p') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) { melding('Deze link is niet compleet. Vraag de afzender om de link opnieuw te sturen.'); return; }
  const sleutel = `prik_${id}`;

  let p = null;
  const keuzes = {};

  async function start() {
    try {
      const d = await gql('query ($id: uuid!) { peilingen_by_pk(id: $id) { id organisator titel duur_min locatie notitie opties gesloten gekozen } }', { id });
      p = d.peilingen_by_pk;
    } catch (e) { melding(navigator.onLine === false ? 'Je bent offline. Probeer het opnieuw zodra je verbinding hebt.' : 'De peiling is nu niet te laden. Probeer het later opnieuw.'); return; }
    if (!p) { melding('Deze peiling bestaat niet (meer).'); return; }
    document.title = `Wanneer kun je? · ${p.titel}`;
    if (p.gesloten) {
      melding(p.gekozen ? `<b>${esc(p.titel)}</b> is ingepland op ${esc(dagNaam(new Date(p.gekozen)))} om ${esc(tijd(new Date(p.gekozen)))}. Stemmen kan niet meer.` : `De peiling voor <b>${esc(p.titel)}</b> is gesloten.`);
      return;
    }
    const eerder = opslag.get(sleutel);
    if (eerder && eerder.keuzes) Object.assign(keuzes, eerder.keuzes);
    if (eerder && eerder.verstuurd) bedankt(eerder); else teken(eerder);
  }

  function teken(eerder) {
    const perDag = new Map();
    p.opties.slice().sort().forEach((iso) => {
      const d = new Date(iso);
      const k = d.toDateString();
      if (!perDag.has(k)) perDag.set(k, { d, opties: [] });
      perDag.get(k).opties.push(iso);
    });
    const knop = (iso, w, tekst) => `<button type="button" class="${w}${keuzes[iso] === w ? ' aan' : ''}" data-iso="${esc(iso)}" data-w="${w}" aria-pressed="${keuzes[iso] === w}">${tekst}</button>`;
    main.innerHTML = `
      <header class="stemkop">
        <div class="wie">${p.organisator ? `${esc(p.organisator)} vraagt wanneer je kunt` : 'Wanneer kun je?'}</div>
        <h1>${esc(p.titel)}</h1>
        <div class="meta">${esc(duurTekst(p.duur_min))}${p.locatie ? ` · ${esc(p.locatie)}` : ''}</div>
        ${p.notitie ? `<div class="notitie">${esc(p.notitie)}</div>` : ''}
      </header>
      ${[...perDag.values()].map((g) => `<section class="stemdag"><h2>${esc(dagNaam(g.d))}</h2><div class="stemkaart">
        ${g.opties.map((iso) => { const a = new Date(iso), b = new Date(a.getTime() + p.duur_min * 6e4); return `<div class="stemrij"><span class="tijd">${esc(tijd(a))} – ${esc(tijd(b))}</span>
          <span class="keuzeknoppen" role="group" aria-label="${esc(dagNaam(a))} ${esc(tijd(a))}">${knop(iso, 'ja', 'Ja')}${knop(iso, 'misschien', 'Misschien')}${knop(iso, 'nee', 'Nee')}</span></div>`; }).join('')}
      </div></section>`).join('')}
      <div class="stemnaam">
        <label><span>Naam</span><input id="naam" autocomplete="name" placeholder="Je naam" value="${esc((eerder && eerder.naam) || '')}"></label>
        <label><span>E-mail</span><input id="email" type="email" autocomplete="email" autocapitalize="off" placeholder="Voor de uitnodiging (optioneel)" value="${esc((eerder && eerder.email) || '')}"></label>
      </div>
      <div class="fout" id="fout" hidden></div>
      <button class="stemknop" id="verstuur">Versturen</button>
      <p class="voet">Je naam en keuzes zijn alleen zichtbaar voor ${p.organisator ? esc(p.organisator) : 'de organisator'}.</p>`;
  }

  function bedankt(st) {
    const ja = p.opties.filter((iso) => st.keuzes[iso] === 'ja').length;
    const mis = p.opties.filter((iso) => st.keuzes[iso] === 'misschien').length;
    main.innerHTML = `<header class="stemkop"><h1>${esc(p.titel)}</h1></header>
      <div class="bedankt"><div class="t1">Bedankt, ${esc(st.naam)}</div>
        <div class="t2">Je kunt op ${ja} ${ja === 1 ? 'tijd' : 'tijden'}${mis ? `, misschien op ${mis}` : ''}. ${p.organisator ? esc(p.organisator) : 'De organisator'} kiest straks een moment en stuurt een uitnodiging.</div>
        <button id="aanpassen">Keuze aanpassen</button></div>`;
  }

  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-iso]');
    if (b) {
      keuzes[b.dataset.iso] = b.dataset.w;
      b.parentElement.querySelectorAll('button').forEach((x) => { const aan = x === b; x.classList.toggle('aan', aan); x.setAttribute('aria-pressed', String(aan)); });
      return;
    }
    if (ev.target.closest('#aanpassen')) { teken(opslag.get(sleutel)); return; }
    if (ev.target.closest('#verstuur')) {
      const naam = document.getElementById('naam').value.trim();
      const email = document.getElementById('email').value.trim();
      const fout = document.getElementById('fout');
      fout.hidden = true;
      if (!naam) { fout.textContent = 'Vul je naam in.'; fout.hidden = false; document.getElementById('naam').focus(); return; }
      if (!p.opties.some((iso) => keuzes[iso])) { fout.textContent = 'Geef bij minstens één tijd aan of je kunt.'; fout.hidden = false; return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fout.textContent = 'Dit e-mailadres klopt niet.'; fout.hidden = false; return; }
      const knop = ev.target.closest('#verstuur');
      knop.disabled = true; knop.textContent = 'Versturen…';
      const k = {};
      p.opties.forEach((iso) => { k[iso] = keuzes[iso] || 'nee'; });
      try {
        await gql('mutation ($o: [stemmen_insert_input!]!) { insert_stemmen(objects: $o) { affected_rows } }', { o: [{ peiling_id: id, naam, email: email || null, keuzes: k }] });
        const st = { naam, email, keuzes: k, verstuurd: true };
        opslag.set(sleutel, st);
        bedankt(st);
        window.scrollTo(0, 0);
      } catch (e) {
        fout.textContent = /check constraint|permission/i.test(e.message) ? 'Deze peiling is inmiddels gesloten.' : 'Versturen lukt nu niet. Probeer het zo opnieuw.';
        fout.hidden = false;
        knop.disabled = false; knop.textContent = 'Versturen';
      }
    }
  });

  start();
})();
