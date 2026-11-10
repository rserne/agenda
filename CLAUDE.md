# Werkafspraken voor Claude

Lees dit eerst, en daarna `README.md`. Daar staan de opbouw van de app, de bestanden, de tests en hoe je een nieuwe versie online zet.

## Wat dit is

Een agenda-PWA in gewoon JavaScript, zonder bouwstap, op GitHub Pages (https://rserne.github.io/agenda/). Robbert gebruikt hem vooral op zijn iPhone en iPad, en daarnaast op de Mac. Er is geen andere versie van de app: alleen deze PWA.

## Taal en toon

- Antwoord altijd in natuurlijk, foutloos Nederlands, als een professionele copywriter. Geen anglicismen, geen lijdende vorm.
- Teksten in de app zijn kort en zakelijk. Robbert haalt toelichtende zinnetjes liever weg dan dat hij ze toevoegt: voeg geen uitleg toe aan schermen zonder dat hij erom vraagt.
- Robbert stuurt vaak een schermafbeelding met een korte opmerking. Pas dan precies dat aan, niet meer.

## Wat nooit in de repo komt

De repo is openbaar. Daarom:

- Nooit de echte agenda, de echte contacten, echte namen of e-mailadressen van collega's of ruimtes.
- Nooit de link van de Cloudflare Worker, de sleutel daarin, de Outlook-link of de Google-sleutel. Ook niet in de code, de tests of een commitbericht.
- Testgegevens zijn verzonnen (`voorbeeld.js`, `test/voorbeeld.ics`, `test/contacten.csv`). Verzin ook geen deelnemers of adressen die echt lijken.
- De Google-sleutel staat alleen op het toestel (localStorage) en verschijnt nooit leesbaar in de app.
- Zet geen inbelgegevens of Teams-links op een plek die anderen kunnen zien.

## Wat Robbert al heeft afgewezen

Stel deze niet opnieuw voor, tenzij hij er zelf over begint:

- Microsoft Graph of een andere koppeling die inloggen bij Microsoft vraagt.
- De sleutel van de Worker in een header in plaats van in de link.
- Organisator en deelnemers via een script op zijn pc.
- Organisatoren herkennen via de Teams-ID's uit de contacten.
- Vaste kleuren of een andere opzet voor de heatmap.
- Een taalmodel om tijden uit een mail te lezen. De vaste herkenning in `js/mailtijden.js` volstaat.

## Ontwerpkeuzes die vastliggen

- Kleuren komen uit de tokens bovenin `app.css`. Vrij is blauw (`--accent`), gedeeltelijke overlap geel (`--overlap`), helemaal bezet warm rood (`--bezet`). Afspraken hebben eigen kleuren: extern paars, intern ad hoc grafiet, intern vast lichtgrijs; geen blauw, geel of rood.
- Pictogrammen in het keuzemenu van de plusknop staan links. Kaders zijn doorgetrokken, niet gestippeld. Tijden worden niet doorgestreept.
- Invoervelden zijn minstens 16px, anders zoomt iOS in. Een test bewaakt dat.
- Een afspraak afmaken gebeurt in de Outlook-app (iOS) of Outlook op het web; de app zelf schrijft nooit in de agenda.

## Werkwijze

1. Hoog bij elke wijziging `APP_VERSIE` in `app.js` en `VERSION` in `sw.js` samen op. Een nieuw bestand in `js/` hoort ook in `index.html` en in `BESTANDEN` in `sw.js`.
2. Draai `npm test`. Maak bij een wijziging in het uiterlijk eerst een basis met `npm run schermen -- <map>` en vergelijk daarna.
3. Commit als Robbert Serne, op `main`, en push. GitHub Pages zet de nieuwe versie zelf online.
4. Vertel daarna in een paar zinnen wat er is veranderd en welk versienummer live staat.
