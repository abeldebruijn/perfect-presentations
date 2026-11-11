# Twee schermen

React-prototype voor [het tweeschermen-issue](https://github.com/abeldebruijn/perfect-presentations/issues/8). Dit is een proef om gedrag te beoordelen. De presentatie bestaat uit drie slides en wordt naar één interactieve HTML-export gebouwd.

## Bekijken

Download `prototype.html` en open het in een desktopbrowser. Klik op **Publiek openen**, sleep het nieuwe venster naar het tweede scherm en druk daar op **F** of dubbelklik op de slide voor volledig scherm. Sta pop-ups voor dit bestand toe als de browser daarom vraagt.

De publieksweergave vult het venster met de slide. Navigeer met de pijltjestoetsen in beide vensters of met de knoppen bij de presentator. Op slide 3 wordt **Antwoord tonen** met het andere scherm gedeeld. In het invoerveld houden de pijltjestoetsen hun gewone betekenis. De presentator kiest waar de klok zichtbaar is en past per slide het tijdsbudget aan.

## Voorgesteld gedrag

- De presentator beheert de sessiestatus. Het publieksvenster stuurt navigatie- en interactiecommando’s terug. De sessie-ID voorkomt vermenging tussen presentaties.
- De timer begint na **Timer starten**. Bij een slidewissel loopt hij door. Eerder bestede tijd blijft per slide bewaard. Pauzeren stopt de tijd voor alle slides. Uitloop verschijnt als positieve overschrijding. **Slidetimer herstellen** zet de bestede tijd van alleen de huidige slide op nul.
- De presentatorstatus wordt in sessionStorage bewaard. Vernieuwen herstelt dezelfde sessie waar opslag beschikbaar is. Een vernieuwd of opnieuw geopend publieksvenster vraagt de actuele status op. Het scherm toont of de verbinding recent actief was.
- Vensters wisselen berichten uit via postMessage met controle op sessie en afzender. Bij HTTP wordt ook de origin gecontroleerd. Een lokaal bestand gebruikt een wildcard targetOrigin omdat file-URL’s dat vereisen. Deze proef deelt alleen voorbeeldinhoud.
- De tijdlijn bevat slide-ID’s en tijdstempels voor een later meetingassistentprototype. Opnemen en transcriptie volgen in dat prototype.

## Bouwen en controleren

Gebruik Node.js en voer in deze map `npm ci` en `npm run build` uit. Het resultaat is `prototype.html` met gebundelde React-code en CSS. Voer vervolgens `npm install --no-save playwright`, `npx playwright install chromium` en `npm run verify` uit. Met de omgevingsvariabele `CHROMIUM_PATH` kun je een bestaande Chromium-installatie kiezen.

`verify.cjs` bevat browserchecks voor file-URL’s zonder netwerk en voor localhost. Het controleert navigatie vanuit beide vensters, pijlen in een invoerveld, gedeelde interacties, de drie timerinstellingen, uitloop, pauzeren, opnieuw bezoeken, beide vensters vernieuwen, het publieksvenster heropenen en fullscreen. Bij slagen schrijft het `results.json` en screenshots. De proef voor tijdmeting gebruikt korte echte wachttijden.

## Resultaten en open punten

De productiebuild met esbuild is geslaagd. Browserchecks konden in de gebruikte uitvoeromgeving niet starten. De aanwezige Chromium-installatie kreeg `socket() failed: Operation not permitted`. De cloudbrowser stond file-URL’s niet toe. Er zijn daardoor nog geen geslaagde browserresultaten of screenshots.

Beoordeel dit eerst in Chrome op een computer met twee schermen. Test daarna Safari en Firefox. Controleer ook pop-upblokkering, grafieken die zelf pijltjestoetsen gebruiken, lang op de achtergrond blijven, het verliezen van de presentator en het apart openen van een HTML-bestand. Het publieksvenster moet via **Publiek openen** worden gekoppeld.

Herstel van een sessie gebruikt opslag wanneer die beschikbaar is. Als de browser opslag voor lokale bestanden blokkeert, gaat presentatorstatus bij vernieuwen verloren. De juiste terugval en een eventuele noodzaak om het bestand lokaal te serveren blijven onderdeel van de browserproef.

De React-presentatie op een route in een bestaand full-stack framework moet later met dezelfde interactie- en sessielogica worden getest. Dit voorbeeld is met esbuild gebundeld. De frameworkadapter en vergaderopname worden apart uitgewerkt.
