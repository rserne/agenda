# Agenda

Je week in één oogopslag, als web-app (PWA) voor iPhone, iPad en laptop. De app leest je Outlook-agenda via een gepubliceerde iCal-feed en laat zien wat opvalt: externe overleggen en interne afspraken die niet vast zijn. Daarnaast toont hij alles, of juist waar je nog tijd hebt.

- **Week:** per dag een lijst, met Opvallend, Alles en Vrij. De dagkop blijft bovenaan staan tijdens het scrollen.
- **Vooruitblik:** zeven dagen vanaf vandaag in tegels. Van vandaag staan alleen de afspraken die nog komen of nu bezig zijn; wat al voorbij is, verdwijnt vanzelf.
- **Weekkiezer:** tik op de titel. Elke werkdag kleurt mee met hoe vol hij is (een heatmap): grijs bij een rustige dag, geel vanaf drie uur en rood vanaf zes uur aan afspraken (`MID_HOURS`, `FULL_HOURS`).
- **Detailscherm:** locatie, Teams-link, organisator en deelnemers per organisatie, notities, en mailen naar één of alle deelnemers.

Zonder bouwstap: `index.html`, `app.css`, `app.js` en `voorbeeld.js` draaien zoals ze zijn op GitHub Pages. Licht en donker volgen de instelling van het toestel.

**Formaten**
- **Telefoon:** kop met titel en capsule, schakelaar bovenin, tabbalk onderin, panelen van onderen.
- **Tablet (vanaf 768 punten):** dezelfde opbouw in een kolom van 760 punten, Vooruitblik met vier tegels naast elkaar.
- **Desktop (vanaf 1200 punten):** in de stijl van Agenda op de Mac. Een zijbalk met de maandkalender (heatmap) en Week of Vooruitblik, een werkbalk met Opvallend, Alles of Vrij en ‹ Vandaag ›, en de werkdagen als kolommen naast elkaar met een gekleurd streepje per afspraak. Het detailscherm opent als dialoog midden in beeld.

**Voorbeeldgegevens.** Zolang de echte agenda nog niet is gekoppeld, staat `BRON = 'voorbeeld'` bovenin `app.js`. `voorbeeld.js` maakt dan voor elke week verzonnen afspraken: vaste overleggen, losse interne afspraken en externe overleggen met deelnemers. Zet `BRON` op `'nhost'` als de functie werkt; met `?echt` of `?demo` achter het adres kies je tijdelijk de andere bron.

**Nieuwe afspraak.** Met de plusknop in de kop (op de desktop **Nieuw**): je kiest de dag en de duur (standaard een uur, in stappen van een kwartier) en de app stelt begintijden voor die in je vrije blokken passen, tussen 8:00 en 18:00. Kies je zelf een andere tijd die botst, dan zie je meteen met welke afspraak. Tik je op een vrij blok, dan blijft alles binnen dat blok: de dag ligt vast, de duur gaat niet verder dan het blok lang is en de begintijden vallen erbinnen. Omdat de app je agenda alleen leest, opent **Verder in Outlook** Outlook op het web met alles ingevuld; daar sla je de afspraak op en verstuur je de uitnodiging. **Downloaden als .ics** werkt ook in andere agenda's.

## Hoe het werkt

```
iPhone (PWA op GitHub Pages)
   │  inloggen bij Nhost Auth (zelfde account als de AustralieApp)
   │  GET /v1/agenda?van=…&tot=…  met de toegangssleutel
   ▼
Nhost-functie functions/agenda.js
   │  controleert de sleutel bij Nhost Auth
   │  haalt de feed op (geheim ICS_URL) en rolt herhalingen uit
   ▼
Outlook, gepubliceerde agenda (.ics)
```

De feed-URL staat alleen als geheim bij Nhost. Wie de feed-URL heeft, kan je hele agenda lezen, dus die hoort niet in deze openbare repository en niet in de app.

De app bewaart de opgehaalde afspraken op het toestel (localStorage), zodat hij meteen iets toont en ook zonder verbinding werkt. Bij openen haalt hij de nieuwe stand op als die ouder is dan vijf minuten.

## Indeling

| Soort | Wanneer | Kleur |
|---|---|---|
| Extern | Externe organisator, of deelnemers buiten je eigen domein. Altijd opvallend, ook als het terugkeert. | koraal |
| Intern, ad hoc | Alleen eigen domein en geen vast overleg | ijsblauw |
| Intern, vast | Een herhaalreeks, of dezelfde titel in minstens twee verschillende weken | grijs |

**Zonder organisator en deelnemers.** Een gepubliceerde Outlook-agenda bevat geen organisator en geen deelnemers. `functions/_verrijk.js` leidt daarom de organiserende organisatie af:
- uit de Teams-link: een klassieke uitnodiging bevat de tenant van de organisator. De tenant die het vaakst voorkomt is je eigen organisatie; bij elke andere tenant leert de code welk maildomein erbij hoort (bijvoorbeeld tue.nl, dus TUE);
- uit de titel: 'Vernieuwenderwijs / CACI' of 'CACI / SURF'.

Het detailscherm toont dan 'Afgeleid uit de Teams-uitnodiging' of 'Afgeleid uit de titel'. Deelnemers en mailen zijn er dan niet; een overleg dat CACI zelf organiseert met externe gasten blijft intern, tenzij de titel de andere organisatie noemt.

Je eigen domein komt uit `EIGEN_DOMEINEN` en `MIJN_EMAIL` bij Nhost. Staat daar niets, dan neemt de app het domein dat het vaakst onder de deelnemers voorkomt.

**Overlap.** Lopen twee afspraken door elkaar, dan krijgt de afspraak die je als eerste ingaat een oranje regel, zoals 'Overlap met Weekstart om 10:30': daar moet je misschien eerder weg. De afspraak die later begint, krijgt niets. Beginnen ze tegelijk, dan staat 'Overlap met …' (zonder tijd) alleen bij de bovenste in de lijst; in het detailscherm staat het bij allebei. Vaste overleggen tellen mee, ook als Opvallend ze verbergt. In de Vooruitblik krijgt de tegel een oranje rand.

**Vrij** toont de gaten tussen je afspraken, op werkdagen van 8:00 tot 18:00 en vanaf een half uur. Hele dagen, afgezegde afspraken en afspraken die op 'vrij' staan, tellen niet als bezet.

## Eenmalig instellen

### 1. Agenda publiceren in Outlook

Outlook op het web, Instellingen, Agenda, Gedeelde agenda's, Een agenda publiceren. Kies je agenda en **Kan alle details weergeven**, en kopieer de ICS-link. Mag dat niet binnen je organisatie, dan kan alleen 'beschikbaarheid' en blijven titels leeg.

### 2. GitHub Pages

Repository, Settings, Pages: Deploy from a branch, `main`, map `/ (root)`. De app staat dan op `https://rserne.github.io/agenda/`.

### 3. Nhost (project AustralieApp)

Een gratis Nhost-organisatie mag maar één actief project hebben. Daarom draait de functie voorlopig in het project van de AustralieApp. De app gebruikt dat project via `NHOST_SUB` bovenin `app.js`.

1. **Repository koppelen:** in het dashboard van het project, Settings, Git: koppel `rserne/agenda`, branch `main`, base directory `/`. Nhost zet bij elke push de functie in `functions/` online. Bestanden met een `_` ervoor (zoals `_ical.js`) krijgen geen eigen adres.
2. **Omgevingsvariabelen voor de functie:** Settings, Environment Variables. Die zijn alleen in het dashboard te zien, niet in de app of de repository.
   - `ICS_URL` = de ICS-link uit Outlook.
   - `ALLOWED_EMAILS` = jouw inlogadres bij Nhost. Zonder deze regel kan iedereen met een AustralieApp-account je agenda zien.
   - `MIJN_EMAIL` = je werkadres zoals het in uitnodigingen staat. Daarmee herkent de app jou tussen de deelnemers ('(jij)', niet mailen naar jezelf).
   - `EIGEN_DOMEINEN` = je eigen maildomein(en), komma-gescheiden.
   - Optioneel `ALLOWED_ORIGINS`: adressen die de functie mogen aanroepen. Standaard `https://rserne.github.io` en `http://localhost:8080`.
3. **Eerste deploy controleren:** deze repository heeft geen map `nhost/`, dus Nhost hoort alleen de functie online te zetten en de database, Hasura en de instellingen van de AustralieApp met rust te laten. Kijk na de eerste push in Deployments of alles groen is en of de AustralieApp het nog doet.
4. Na de eerste deploy staat de functie op `https://gjqqtpteurwdbealgmqh.functions.eu-central-1.nhost.run/v1/agenda`. Zonder inloggen geeft die `401`, en dat is goed.

### 4. Op je iPhone en iPad

Open de app in Safari, tik op Delen, Zet op beginscherm. Log in met je AustralieApp-account.

## Microsoft 365 koppelen (Graph)

De app kan je agenda ook rechtstreeks uit Outlook lezen via Microsoft Graph. Je logt in met je eigen werkaccount;
de app leest dan namens jou (delegated, alleen `Calendars.Read` en `User.Read`). Er is geen client secret: een app
in de browser kan geen geheim bewaren, daarom logt MSAL.js in met PKCE. Client-ID en tenant zijn niet geheim.

In de app: tik op de titel (telefoon) of kijk in de zijbalk (desktop), onder Agenda, op **Microsoft 365 koppelen**.

Eenmalig in Entra ID (App registrations, de registratie met `MS_CLIENT_ID` uit `app.js`):

- **Authentication**: platform *Single-page application*, met als redirect-URI's `https://rserne.github.io/agenda/`
  en `http://localhost:8080/` (om lokaal te testen).
- **API permissions**: *Delegated* `Calendars.Read` en `User.Read`. Vraagt je organisatie om admin consent, dan moet
  een beheerder die eenmalig geven.
- Geen client secret of certificaat nodig.

De tenant-ID staat in `MS_TENANT_STANDAARD`.
Je kunt hem ook kiezen met `?tenant=jouwdomein.nl` of `?tenant=<tenant-ID>` achter het adres; dat onthoudt de app.

Goed om te weten:
- Microsoft geeft een app in de browser een verversingstoken van hooguit 24 uur. Daarna toont de app je bewaarde
  afspraken met een balk om opnieuw in te loggen.
- Gegevens en tokens blijven op dit toestel (localStorage). Afmelden wist ze.
- `functions/_graph.js` zet een Graph-afspraak om naar dezelfde vorm als een afspraak uit een .ics-bestand.
- MSAL.js staat in `vendor/msal-browser.min.js` (v4.30.0) en wordt alleen geladen als je Microsoft 365 gebruikt.

## Eigen .ics-bestand openen

Onder **Agenda** staat **Eigen agenda inladen**: op de telefoon en tablet in de weekkiezer (tik op de titel), op de desktop in de zijbalk. De app leest het bestand in de browser, bewaart het in IndexedDB op dat toestel en toont je echte agenda, zonder Nhost en zonder inloggen. Het bestand wordt nergens naartoe gestuurd. Met **Wissen** gaat de app terug naar de voorbeeldgegevens. Het inlezen van een groot bestand kost op een telefoon enkele seconden. Daarom bewaart de app de uitgerolde weken (een halfjaar terug en vooruit) ook in IndexedDB: bij het opstarten staan die meteen in beeld, en het bestand zelf wordt pas daarna op de achtergrond ingelezen voor weken daarbuiten.

Zet een echt agenda-bestand nooit in deze repository: die is openbaar.

## Instellingen in app.js

Bovenin `app.js` staan onder meer de werktijd (`WORK_START`, `WORK_END`), de grens voor vrije blokken (`FREE_MIN`), de rode ring (`FULL_HOURS`), de naam van je eigen organisatie (`OWN_ORG_NAME`) en hoeveel weken de app terug en vooruit kijkt om vaste overleggen te herkennen (`LOOK_AROUND_WEEKS`).

Handige adressen:
- `?demo` of `?echt`: tijdelijk de andere bron (voorbeeldgegevens of je echte agenda), zie `BRON`.
- `?datum=2026-11-02`: doen alsof het die dag is.
- `?uitloggen`: uitloggen en de bewaarde afspraken wissen.

## Testen

```
npm install
node test/run.mjs        # voorbeeldfeed omzetten, week 45 van 2026
node test/functie.mjs    # de functie met nagebootste login en feed
python3 -m http.server 8080   # en open http://localhost:8080/
```

`test/voorbeeld.ics` is een feed in Outlook-stijl met verzonnen namen: herhaalreeksen, een verplaatste keer, een uitzondering, een hele dag, een afgezegde en een vrije afspraak.

## Nieuwe versie online zetten

Hoog `APP_VERSIE` in `app.js` en `VERSION` in `sw.js` op, commit en push. GitHub Pages en de Nhost-functie werken zichzelf bij. Wie de app open heeft, krijgt onderin de melding 'Nieuwe versie beschikbaar' met **Vernieuwen**: de app leest kort na het openen, bij terugkomen en elk half uur `APP_VERSIE` uit het begin van `app.js` op de server en vergelijkt die met de versie die draait. GitHub Pages kan een nieuwe versie tot een paar minuten na de push nog oud uitleveren. De service worker geeft de app-bestanden meteen uit de cache (snelle start, ook zonder bereik) en haalt ze op de achtergrond opnieuw op; **Vernieuwen** leegt eerst die cache.
