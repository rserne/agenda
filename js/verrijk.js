// Een gepubliceerde Outlook-agenda bevat geen organisator en geen deelnemers. Om externe overleggen toch
// te herkennen, leidt deze code af wie een overleg heeft georganiseerd:
//  1. Teams-link: een klassieke uitnodiging bevat de tenant (Tid) van de organisator. De tenant die het
//     vaakst voorkomt, is je eigen organisatie; elke andere tenant is extern. Welke organisatie bij een
//     tenant hoort, leren we uit de maildomeinen die in dezelfde uitnodigingen voorkomen.
//  2. Titel: 'Vernieuwenderwijs / CACI' of 'CACI / SURF' noemt de andere organisatie bij naam.
// Geen imports, zodat de browser dit bestand ook kan gebruiken.

const GENERIEK = /^(gmail|hotmail|outlook|live|icloud|me|yahoo|ziggo|kpnmail|xs4all|thread)\./i;
const TID = /Tid(?:%22%3a%22|":")([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const MAILDOMEIN = /[\w.+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,6})\b/gi;

export function orgLabel(domain) {
  const parts = domain.split('.');
  // caci.co.uk → caci; tue.nl → tue
  const core = parts.length >= 3 && /^(co|ac|com|org|gov)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return core.length <= 4 ? core.toUpperCase() : core.charAt(0).toUpperCase() + core.slice(1);
}

const isEigen = (domein, eigen) => eigen.some((o) => domein === o || domein.endsWith('.' + o));

// Leer uit de hele feed: wat is je eigen tenant en welk domein hoort bij welke andere tenant
export function leerUitIcal(tekst, eigenDomeinen = []) {
  const plat = tekst.replace(/\r?\n[ \t]/g, '');
  const blokken = plat.split('BEGIN:VEVENT').slice(1);
  const tenants = new Map();
  const domeinenPerTenant = new Map();
  const alleDomeinen = new Map();
  for (const b of blokken) {
    const m = TID.exec(b);
    const doms = new Set();
    for (const d of b.matchAll(MAILDOMEIN)) {
      const dom = d[1].toLowerCase();
      if (!GENERIEK.test(dom)) doms.add(dom);
    }
    doms.forEach((d) => alleDomeinen.set(d, (alleDomeinen.get(d) || 0) + 1));
    if (!m) continue;
    const tid = m[1].toLowerCase();
    tenants.set(tid, (tenants.get(tid) || 0) + 1);
    const tel = domeinenPerTenant.get(tid) || new Map();
    doms.forEach((d) => tel.set(d, (tel.get(d) || 0) + 1));
    domeinenPerTenant.set(tid, tel);
  }
  const eigen = eigenDomeinen.length ? eigenDomeinen : [[...alleDomeinen].sort((a, b) => b[1] - a[1])[0]?.[0]].filter(Boolean);
  const eigenTenant = [...tenants].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const tenantDomein = {};
  for (const [tid, tel] of domeinenPerTenant) {
    if (tid === eigenTenant) continue;
    const top = [...tel].filter(([d]) => !isEigen(d, eigen)).sort((a, b) => b[1] - a[1])[0];
    if (top) tenantDomein[tid] = top[0];
  }
  return { eigenTenant, tenantDomein, eigenDomeinen: eigen };
}

// Hint voor één afspraak: { orgs: ['TUE'], bron: 'teams' | 'titel' } of null
export function hintVoor(afspraak, kennis, eigenOrg = 'CACI') {
  const m = TID.exec(`${afspraak.notes || ''} ${afspraak.location || ''}`);
  if (m && kennis.eigenTenant) {
    const tid = m[1].toLowerCase();
    if (tid !== kennis.eigenTenant) {
      const dom = kennis.tenantDomein[tid];
      const label = dom ? orgLabel(dom) : null;
      // Een tenant van een zusterorganisatie met dezelfde naam (zoals caci.co.uk) telt als eigen
      if (label && label.toLowerCase() === eigenOrg.toLowerCase()) return null;
      return { orgs: [label || 'Extern'], bron: 'teams', tenant: tid };
    }
  }
  const t = String(afspraak.title || '');
  const eigen = eigenOrg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const naVoor = new RegExp(`([\\p{L}][\\p{L}\\d&.-]*)\\s*/\\s*${eigen}\\b`, 'iu').exec(t);
  const naAchter = new RegExp(`\\b${eigen}\\s*/\\s*([\\p{L}][\\p{L}\\d&.-]*)`, 'iu').exec(t);
  const naam = (naVoor && naVoor[1]) || (naAchter && naAchter[1]);
  if (naam && naam.toLowerCase() !== eigenOrg.toLowerCase()) return { orgs: [naam], bron: 'titel' };
  return null;
}
