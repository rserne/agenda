// Agenda, service worker
// Bewaart de app zelf op het toestel, zodat hij ook zonder verbinding opent. Je afspraken bewaart app.js
// (localStorage); die komen nooit in deze cache. Hoog VERSION op bij elke uitgave, samen met APP_VERSIE in app.js.
const VERSION = 'v78';
const CACHE = 'agenda-' + VERSION;
const BESTANDEN = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-64.png', './voorbeeld.js', './vendor/ical.min.js', './functions/_ical.js', './functions/_verrijk.js', './functions/_graph.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BESTANDEN.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('agenda-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Eigen bestanden: meteen uit de cache (snelle start, ook met slecht bereik) en op de achtergrond bijwerken voor
// de volgende keer. Een nieuwe versie meldt de app zelf ('Nieuwe versie beschikbaar'); Vernieuwen leegt dan
// eerst de cache, zodat alles vers van de server komt. Niet in de cache: haal het van het netwerk.
// Alles van een ander adres (Nhost) laten we met rust.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.searchParams.has('versiecheck')) return; // de versiecontrole gaat altijd rechtstreeks naar het netwerk
  const vers = fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }))
    .then((r) => {
      if (r.ok) { const kopie = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, kopie)); }
      return r;
    });
  e.respondWith(
    caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then((bewaard) => {
      if (bewaard) { e.waitUntil(vers.catch(() => {})); return bewaard; }
      return vers.catch(() => caches.match('./index.html'));
    })
  );
});
