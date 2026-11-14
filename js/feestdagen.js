// Agenda, feestdagen
// De elf officiële Nederlandse feestdagen, uitgerekend in de app zelf: geen koppeling, geen link, ook offline.
// Ze staan onder de dagkop in de week en de Vooruitblik, en bij een zoekresultaat op die dag.
// Op een vrije feestdag stelt de app geen vrije tijden voor (Vrij en Nieuwe afspraak).
// Vrij zijn alle feestdagen, behalve Goede Vrijdag, en Bevrijdingsdag alleen in een lustrumjaar (2025, 2030, …).
// Gewoon script (geen module): het deelt de bovenste laag met de andere bestanden; de volgorde staat in index.html.
'use strict';

// Eerste Paasdag, met de rekenregel van Meeus, Jones en Butcher (gregoriaanse kalender)
function pasen(jaar) {
  const a = jaar % 19, b = Math.floor(jaar / 100), c = jaar % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(jaar, Math.floor(n / 31) - 1, (n % 31) + 1);
}

const _feestdagen = new Map();
const feestSleutel = (d) => `${d.getMonth()}-${d.getDate()}`;
function feestdagenVan(jaar) {
  if (_feestdagen.has(jaar)) return _feestdagen.get(jaar);
  const p = pasen(jaar);
  const koningsdag = new Date(jaar, 3, 27);
  if (koningsdag.getDay() === 0) koningsdag.setDate(26); // niet op zondag: dan de zaterdag ervoor
  const lijst = [
    [new Date(jaar, 0, 1), 'Nieuwjaarsdag', true],
    [addDays(p, -2), 'Goede Vrijdag', false],
    [p, 'Eerste Paasdag', true],
    [addDays(p, 1), 'Tweede Paasdag', true],
    [koningsdag, 'Koningsdag', true],
    [new Date(jaar, 4, 5), 'Bevrijdingsdag', jaar % 5 === 0],
    [addDays(p, 39), 'Hemelvaartsdag', true],
    [addDays(p, 49), 'Eerste Pinksterdag', true],
    [addDays(p, 50), 'Tweede Pinksterdag', true],
    [new Date(jaar, 11, 25), 'Eerste Kerstdag', true],
    [new Date(jaar, 11, 26), 'Tweede Kerstdag', true],
  ];
  const kaart = new Map(lijst.map(([d, naam, vrij]) => [feestSleutel(d), { naam, vrij }]));
  _feestdagen.set(jaar, kaart);
  return kaart;
}

// { naam, vrij } voor een feestdag, anders null
const feestdag = (d) => feestdagenVan(d.getFullYear()).get(feestSleutel(d)) || null;
const vrijeFeestdag = (d) => !!(feestdag(d) || {}).vrij;

// De regel onder de dagkop
const VLAG = lijn('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>', 2);
function feestdagHtml(d) {
  const f = feestdag(d);
  return f ? `<div class="feestdag">${VLAG}<span>${f.naam}</span></div>` : '';
}
