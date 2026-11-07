# Agenda

Je week in één oogopslag, als web-app (PWA) voor iPhone, iPad en laptop. De app leest je Outlook-agenda en laat zien wat opvalt: externe overleggen en interne afspraken die niet vast zijn. Daarnaast toont hij alles, of juist waar je nog tijd hebt.

- **Week:** per dag een lijst, met Opvallend, Alles en Vrij. De dagkop blijft bovenaan staan tijdens het scrollen. Op de telefoon trek je onderaan door naar de volgende week.
- **Vooruitblik:** zeven dagen vanaf vandaag in tegels. Van vandaag staan alleen de afspraken die nog komen of nu bezig zijn; wat al voorbij is, verdwijnt vanzelf.
- **Weekkiezer:** tik op de titel. Elke werkdag kleurt mee met hoe vol hij is (een heatmap): grijs bij een rustige dag, geel vanaf drie uur en rood vanaf zes uur aan afspraken (`MID_HOURS`, `FULL_HOURS`).
- **Detailscherm:** locatie, Teams-link, organisator en deelnemers per organisatie, notities, en mailen naar één of alle deelnemers.

Zonder bouwstap: alle bestanden draaien zoals ze zijn op GitHub Pages. Licht en donker volgen de instelling van het toestel.

**Formaten**
- **Telefoon:** kop met titel en capsule, schakelaar bovenin, tabbalk onderin, panelen van onderen.
- **Tablet (vanaf 768 punten):** dezelfde opbouw in een kolom van 760 punten, Vooruitblik met vier tegels naast elkaar.
- **Desktop (vanaf 1200 punten):** in de stijl van Agenda op de Mac. Een zijbalk met de maandkalender (heatmap) en Week of Vooruitblik, een werkbalk met Opvallend, Alles of Vrij en ‹ Vandaag ›, en de werkdagen als kolommen naast elkaar met een gekleurd streepje per afspraak. Het detailscherm opent als dialoog midden in beeld.

**Nieuwe afspraak.** Tik op de plusknop naast de tabbalk (op de desktop **Nieuw** in de werkbalk) en kies **Nieuwe afspraak**: je kiest de dag en de duur (standaard een uur, in stappen van een kwartier) en de app stelt begintijden voor die in je vrije blokken passen, tussen 8:00 en 18:00. Kies je zelf een andere tijd die botst, dan zie je meteen met welke afspraak. Tik je op een vrij blok, dan blijft alles binnen dat blok. Omdat de app je agenda alleen leest, opent **Afmaken in Outlook** Outlook met alles ingevuld: titel, tijd, locatie, deelnemers en notitie. Daar sla je de afspraak op en verstuur je de uitnodiging. Op iPhone en iPad gaat dat naar de Outlook-app (`ms-outlook://events/new`), elders naar Outlook op het web. **Openen in Outlook** in het detailscherm opent de app op de dag van de afspraak (`ms-outlook://events?date=…`); naar de afspraak zelf springen kan niet, want de gepubliceerde agenda bevat het id van Outlook niet. Een .ics-bestand downloaden kan ook, voor andere agenda's.

**Tijden uit een mail.** Vraagt iemand of je op een van een paar momenten kunt, tik dan op de plusknop (op de desktop **Nieuw**), kies **Tijden uit een mail** en plak de tekst. De app leest de dagen en tijden eruit en legt ze naast je agenda: per tijdvak zie je elk overleg dat erin valt, en de begintijden in kleur: blauw is vrij (net als in Vrij), geel overlapt gedeeltelijk (net als het label Overlap), rood is helemaal bezet. Na het plakken klapt het tekstveld in tot drie regels, zodat de tijden meteen in beeld staan; **Hele tekst tonen** klapt het weer uit. **Inplannen** verschijnt zodra je precies één tijd kiest. Als begintijd stelt de app de vrije momenten voor, en ook het begin en einde van elk overleg in het tijdvak: daar kun je een overleg overslaan.  Het antwoord noemt alleen de tijden die je kiest, nooit een reden. De duur haalt hij uit de tekst ('een uurtje', 'half uur', '45 minuten'), en die kun je aanpassen. Kies een of meer tijden en tik op **Antwoord kopiëren**: bij één tijd een zin ('Ik kan op maandag 9 november van 13:30 tot 14:30.'), bij meer 'Ik kan op de volgende tijdstippen:' met de dagen en tijden als opsomming. Of kies er één en tik op **Inplannen**: dan staat Nieuwe afspraak klaar, met Microsoft Teams bij Locatie als de mail 'online' of 'Teams' noemt.

De lezer (`js/mailtijden.js`) werkt met vaste regels en draait op het toestel; er gaat niets naar buiten. Hij kent datums ('9 november', '10/11', 'di 10-11'), weekdagen ('dinsdag', 'volgende week dinsdag'), 'vandaag', 'morgen' en 'overmorgen', tijdvakken ('tussen 13:00 en 16:00', 'van 11 tot 12', '13.00-16.00', 'na 14:00', 'voor 12:00', 'om half 3'), dagdelen ('s ochtends, middag, na de lunch, eind van de middag) en meerdere tijdvakken op een dag. Tijden van 1 tot en met 6 zonder minuten zijn 's middags; 'half 3' is 14:30. Klopt een weekdag niet bij de datum, dan meldt hij dat. Vrij proza met voorwaarden ('elke ochtend behalve woensdag') leest hij niet.

## Waar de afspraken vandaan komen

Alles wat alleen op jouw toestel staat, geef je op onder **Instellingen**: onderaan de weekkiezer (tik op de titel), op de desktop onderaan de zijbalk. Daar staan Agenda, Contacten, Ruimtes en Plaatsen via Google.

Onder **Agenda** kies je de bron:

1. **Agenda-link:** de link van je Cloudflare Worker, met de sleutel erin. De app haalt je agenda daarmee zelf op (zie hieronder).
2. **Eigen .ics-bestand:** een bestand dat je eenmalig inlaadt.
3. **Niets gekozen:** dan toont de app verzonnen voorbeeldgegevens uit `voorbeeld.js`. Met `?demo` achter het adres krijg je die altijd, ook als je een eigen agenda hebt gekoppeld.

```
iPhone, iPad of laptop (PWA op GitHub Pages)
   │  GET https://agenda.<account>.workers.dev/?sleutel=…
   ▼
Cloudflare Worker  cloudflare/worker.js
   │  controleert de sleutel, haalt de feed op (geheim ICS_URL)
   ▼
Outlook, gepubliceerde agenda (.ics)
```

De app leest het bestand in een Web Worker (`js/ics-werker.js`), zodat hij blijft reageren. Daar rolt `js/ical.js` de herhalingen uit en leidt `js/verrijk.js` de organisatie af. De uitgerolde weken (een halfjaar terug en vooruit) bewaart de app in IndexedDB. Bij het opstarten staan die meteen in beeld, ook als ze bij een ouder bestand horen; het inlezen gebeurt daarna op de achtergrond. Zonder Web Worker (oude browsers) leest de app het bestand zelf in.

Je link en je bestand blijven alleen op het toestel, in IndexedDB. Ze komen nooit in de code of in deze openbare repository. Zet daarom ook nooit een echt agenda-bestand in de repository.

### Agenda-link

De app haalt je agenda altijd op de achtergrond op: bij het opstarten, elk kwartier zolang de app open is, als je terugkomt in de app en als de verbinding terugkomt. Is er niets veranderd (alleen de DTSTAMP), dan leest hij niets opnieuw in. Is er wel iets veranderd, dan leest hij het nieuwe bestand naast het oude in en wisselt hij pas als alles klaar is. Onderin verschijnt kort een melding, ook als het misgaat (verkeerde sleutel, geen verbinding).

De link van je gepubliceerde Outlook-agenda zelf werkt niet: Outlook staat niet toe dat een andere website hem ophaalt (CORS). Daarom loopt het via de Cloudflare Worker, die die toestemming wel geeft. Geef je toch een `webcal://`- of Outlook-link op, dan verwijst de app je naar de Worker.

### Eigen .ics-bestand

Kies onder Agenda **Je eigen agenda kiezen** en dan **Uit een .ics-bestand**. De app leest het bestand in de browser en stuurt het nergens naartoe. Met **Voorbeeldgegevens** gaat de app terug naar de verzonnen afspraken. Het inlezen van een groot bestand kost op een telefoon enkele seconden; daarna staat de agenda bij elke start meteen in beeld.

## Contacten

Onder **Instellingen**, **Contacten** laad je een bestand met namen en e-mailadressen in. Typ je daarna bij een nieuwe afspraak een naam in het veld Deelnemers, dan stelt de app de passende contacten voor. Tik je er een aan, dan staat het adres in het veld. Op de desktop kies je met de pijltjes en Enter.

De app leest drie soorten bestanden:
- **De adrescache van Outlook**, geëxporteerd met [NK2Edit](https://www.nirsoft.net/utils/outlook_nk2_edit.html) als csv. Dit zijn de adressen die Outlook zelf aanvult, en de adressen die je het vaakst gebruikt, staan bovenaan.
- **Een csv met kopregel**, zoals een export van je contactpersonen uit Outlook of Gmail.
- **Een vCard** (.vcf), bijvoorbeeld uit Contacten op de iPhone of de Mac.

De lijst blijft alleen op het toestel, in IndexedDB, net als je agenda. Laad hem op elk toestel apart in. Zet nooit een echt contactenbestand in de repository: `test/contacten.csv` bevat alleen verzonnen namen.

## Ruimtes en plaatsen

Onder **Instellingen**, **Ruimtes** zet je je vergaderruimtes, elk met een naam en (optioneel) een e-mailadres. Met **Ruimte toevoegen** komt er een regel bij, met de rode min haal je er een weg. Tik je bij een nieuwe afspraak op Locatie, dan staan je ruimtes meteen klaar; typ je iets, dan filtert de lijst mee (accenten hoeven niet). De suggesties zweven over het formulier, zodat er niets verspringt terwijl je typt.

Kies je een ruimte met een e-mailadres, dan zet de app de ruimte ook als deelnemer in de uitnodiging, zodat Outlook hem reserveert. Typ je daarna zelf iets anders bij Locatie, dan haalt de app de ruimte weer uit de deelnemers. Of de ruimte vrij is, ziet de app niet; dat laat Outlook zien.

Met een **sleutel van Google** voor de Places API (New) vult Locatie vanaf drie letters ook adressen en plaatsen aan. De app vraagt pas als je even stopt met typen, met één sessie per afspraak; de vorige plaatsen blijven staan tot de nieuwe binnen zijn. Wat je in Locatie typt, gaat dan naar Google. Beperk de sleutel in Google Cloud Console tot de Places API (New) en tot de website `rserne.github.io`, zodat niemand anders er iets aan heeft. De app toont de sleutel nergens: je ziet alleen dat er een is, en je kunt hem testen, wijzigen of verwijderen. Na het bewaren test de app hem meteen.

Ruimtes en sleutel staan alleen op het toestel (localStorage), nooit in de code of in de repository.

## Indeling

| Soort | Wanneer | Kleur |
|---|---|---|
| Extern | Externe organisator, of deelnemers buiten je eigen domein. Altijd opvallend, ook als het terugkeert. | koraal |
| Intern, ad hoc | Alleen eigen domein en geen vast overleg | ijsblauw |
| Intern, vast | Een herhaalreeks, of dezelfde titel in minstens twee verschillende weken | grijs |

**Zonder organisator en deelnemers.** Een gepubliceerde Outlook-agenda bevat geen organisator en geen deelnemers. `js/verrijk.js` leidt daarom de organiserende organisatie af:
- uit de Teams-link: een klassieke uitnodiging bevat de tenant van de organisator. De tenant die het vaakst voorkomt, is je eigen organisatie; bij elke andere tenant leert de code welk maildomein erbij hoort (bijvoorbeeld tue.nl, dus TUE);
- uit de titel: 'Vernieuwenderwijs / CACI' of 'CACI / SURF'.

Het detailscherm toont dan 'Afgeleid uit de Teams-uitnodiging' of 'Afgeleid uit de titel'. Deelnemers en mailen zijn er dan niet. Een overleg dat CACI zelf organiseert met externe gasten blijft intern, tenzij de titel de andere organisatie noemt. Extra eigen maildomeinen zet je in `OWN_DOMAINS_EXTRA`.

**Overlap.** Lopen twee afspraken door elkaar, dan krijgt de afspraak die je als eerste ingaat een oranje regel, zoals 'Overlap met Weekstart om 10:30': daar moet je misschien eerder weg. De afspraak die later begint, krijgt niets. Beginnen ze tegelijk, dan staat 'Overlap met …' (zonder tijd) alleen bij de bovenste in de lijst; in het detailscherm staat het bij allebei. Vaste overleggen tellen mee, ook als Opvallend ze verbergt. In de Vooruitblik krijgt de tegel een oranje rand.

**Vrij** toont de gaten tussen je afspraken, op werkdagen van 8:00 tot 18:00 en vanaf een half uur. Hele dagen, afgezegde afspraken en afspraken die op 'vrij' staan, tellen niet als bezet.

## Eenmalig instellen

### 1. Agenda publiceren in Outlook

Outlook op het web, Instellingen, Agenda, Gedeelde agenda's, Een agenda publiceren. Kies je agenda en **Kan alle details weergeven**, en kopieer de ICS-link. Mag dat niet binnen je organisatie, dan kan alleen 'beschikbaarheid' en blijven titels leeg.

### 2. GitHub Pages

Repository, Settings, Pages: Deploy from a branch, `main`, map `/ (root)`. De app staat dan op `https://rserne.github.io/agenda/`.

### 3. Cloudflare Worker

`cloudflare/worker.js` haalt de agenda op en geeft hem door aan de app. Hij bewaart niets. Gratis, zonder betaalkaart.

1. cloudflare.com, gratis account, **Workers & Pages**, **Create**, **Worker** (Start with Hello World).
2. **Edit code**: vervang de code door `cloudflare/worker.js` en kies **Deploy**.
3. **Settings**, **Variables and Secrets**, twee keer **Add**, type *Secret*: `ICS_URL` (de ICS-link uit Outlook) en `SLEUTEL` (een lange willekeurige tekst). Kies opnieuw **Deploy** als Cloudflare daarom vraagt.
4. In de app, onder Instellingen, Agenda, Je eigen agenda kiezen, Via je agenda-link: `https://<worker>.<account>.workers.dev/?sleutel=<SLEUTEL>`.

Koppel je de Worker liever aan GitHub (Import a repository), dan gebruikt Cloudflare `wrangler.jsonc` en plaatst het alleen de Worker. De naam in dat bestand (`agenda`) moet gelijk zijn aan de naam van de Worker in Cloudflare.

De Worker-link is net zo geheim als de Outlook-link: wie hem heeft, ziet je agenda. Stel je een nieuwe sleutel in, dan werkt de oude link niet meer.

### 4. Op je iPhone en iPad

Open de app in Safari, tik op Delen, Zet op beginscherm. Geef daarna onder Instellingen je agenda-link op, en eventueel je contacten en ruimtes.

## Code

| Bestand | Inhoud |
|---|---|
| `index.html`, `app.css` | De pagina en de opmaak. Bovenin `app.css` staat een inhoudsopgave. |
| `app.js` | Instellingen, hulpjes en iconen. Hier staat ook `APP_VERSIE`. |
| `js/gegevens.js` | Waar de afspraken vandaan komen: voorbeeld, .ics-bestand, agenda-link, IndexedDB. |
| `js/contacten.js` | Contacten inlezen (NK2Edit, csv, vCard), bewaren en zoeken. |
| `js/locaties.js` | Ruimtes en de Google-sleutel uit Instellingen, en plaatsen zoeken bij Google. |
| `js/mailtijden.js` | Dagen en tijden uit de tekst van een mail lezen. |
| `js/indeling.js` | Extern of intern, vast of ad hoc, overlap, vrije blokken en hoe vol een dag is. |
| `js/weergave.js` | Week, Vooruitblik, de kop en het tekenen van het scherm. |
| `js/panelen.js` | Weekkiezer, zijbalk, detailscherm, nieuwe afspraak (met aanvullen), de agendakeuze en Instellingen. |
| `js/bediening.js` | Tikken, vegen en doortrekken, het opstarten, de versiecontrole en de service worker. |
| `js/ical.js`, `js/verrijk.js`, `js/ics-werker.js` | Het inlezen van een .ics-bestand (ook in de Web Worker). |
| `voorbeeld.js` | Verzonnen voorbeeldafspraken. |
| `sw.js` | De service worker: de app werkt ook zonder verbinding. |
| `cloudflare/worker.js`, `wrangler.jsonc` | De Cloudflare Worker. |

De bestanden in `js/` zijn gewone scripts (geen modules) en laden in een vaste volgorde, die in `index.html` staat. Ze delen dezelfde variabelen, dus een functie in `panelen.js` kan `render()` uit `weergave.js` aanroepen.

Bovenin `app.js` staan onder meer de werktijd (`WORK_START`, `WORK_END`), de grens voor vrije blokken (`FREE_MIN`), de heatmap (`MID_HOURS`, `FULL_HOURS`), de naam van je eigen organisatie (`OWN_ORG_NAME`) en hoeveel weken de app terug en vooruit kijkt om vaste overleggen te herkennen (`LOOK_AROUND_WEEKS`).

Handige adressen:
- `?demo`: altijd de voorbeeldgegevens.
- `?datum=2026-11-02`: doen alsof het die dag is.

## Testen

```
npm install
npx playwright install chromium   # eenmalig
npm test                          # de tests, in een echte browser
npm run schermen -- basis         # schermafbeeldingen in de map basis/
npm run schermen -- na basis      # nieuwe afbeeldingen in na/ en vergelijken met basis/
python3 -m http.server 8080       # en open http://localhost:8080/
```

`npm test` start de app met een vaste klok (woensdag 4 november 2026, 9:00) en de voorbeeldgegevens. De tests controleren onder meer het opstarten, wisselen van filter, doortrekken naar de volgende week, het detailscherm, de weekkiezer, een nieuwe afspraak, het inladen van een .ics-bestand (met en zonder Web Worker), de agenda-link, de contacten, ruimtes en plaatsen (Google nagebootst), Instellingen, tijden uit een mail en de desktop. Zet je een deel van een naam erachter, dan draaien alleen die tests, bijvoorbeeld `npm test -- desktop`.

`npm run schermen` maakt 76 schermafbeeldingen: telefoon, telefoon met .ics, iPad liggend en staand, en Mac, elk in licht en donker. Maak voor een grote wijziging eerst een basis en vergelijk daarna; zo zie je meteen of er iets verschuift.

`test/voorbeeld.ics` is een feed in Outlook-stijl met verzonnen namen: herhaalreeksen, een verplaatste keer, een uitzondering, een hele dag, een afgezegde en een vrije afspraak.

## Nieuwe versie online zetten

Hoog `APP_VERSIE` in `app.js` en `VERSION` in `sw.js` op, commit en push. GitHub Pages werkt zichzelf bij. Wie de app open heeft, krijgt onderin de melding 'Nieuwe versie beschikbaar' met **Vernieuwen**: de app leest kort na het openen, bij terugkomen en elk half uur `APP_VERSIE` uit het begin van `app.js` op de server en vergelijkt die met de versie die draait. GitHub Pages kan een nieuwe versie tot een paar minuten na de push nog oud uitleveren. De service worker geeft de app-bestanden meteen uit de cache (snelle start, ook zonder bereik) en haalt ze op de achtergrond opnieuw op; **Vernieuwen** leegt eerst die cache. Zet een nieuw bestand in `js/` ook in `index.html` en in de lijst `BESTANDEN` in `sw.js`.
