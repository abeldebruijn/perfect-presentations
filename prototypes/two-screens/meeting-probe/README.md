# Meetingproef

Kan een presentator een afspraak via het transcript terugvinden in de opname en bij de slide die op dat moment in beeld was? Deze proef draait lokaal naast het tweeschermenprototype.

## Starten

Gebruik Node 22 of nieuwer. Voer vanuit `prototypes/two-screens` uit:

```sh
npm ci
npm run build
```

Start de meetingsserver met `node meeting-probe/server.mjs`. Open [Instellingen](http://127.0.0.1:8000/settings.html) en plak je Vercel AI Gateway API-sleutel. Je kunt de sleutel ook als `AI_GATEWAY_API_KEY` aan het serverproces meegeven. Een sleutel uit Instellingen heeft voorrang en wordt in de lokale sessiemap opgeslagen met lees- en schrijfrechten voor je eigen account.

De opname gaat via de gateway naar [Gemini 3.5 Transcribe](https://vercel.com/ai-gateway/models/gemini-3.5-transcribe). [Gemini 4 Hydrogen](https://vercel.com/ai-gateway/models/gemini-4-hydrogen) krijgt het transcript met passage-ID’s en maakt de samenvatting en actiepunten. Kies **Opnieuw verwerken** in een bestaande sessie om ook eerdere audio met deze modellen te verwerken. Als de gateway geen tijdstempels teruggeeft, blijft de tekst leesbaar en toont de sessie dat de tijdstempels ontbreken.

Voor lokale verwerking zonder gateway-sleutel start je de [Whisper-server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server) met het meertalige model `ggml-base.bin`:

```sh
whisper-server --host 127.0.0.1 --port 8179 -m /pad/naar/ggml-base.bin -l nl
```

Start voor lokale verwerking ook Ollama en haal het proefmodel op vanuit `prototypes/two-screens`:

```sh
ollama pull qwen2.5:1.5b
```

Open [de presentatorweergave](http://127.0.0.1:8000/route.html) of ga direct naar [Opnames](http://127.0.0.1:8000/meetings.html). De server gebruikt standaard een tijdelijke map voor sessies. Zet `MEETING_DATA` op een eigen lokale map als je sessies langer wilt bewaren. `MEETING_PORT`, `MEETING_MODEL` en `MEETING_WHISPER` zijn optioneel. De eerste start van [Desert Ant Who](https://desertant.com/docs/who/) kan modelbestanden downloaden.

## Doorlopen

- Klik in **Opnames** onder **Opnamebeheer** op **Voorbeeld verwerken**. In de synthetische opname wisselt de slide op 10 seconden van **Planning** naar **Begroting**. De tweede spreker onderbreekt daarna kort en zegt rond 15 seconden toe de cijfers vrijdag naar het team te sturen.
- Open de passage over de wissel. Controleer de twee slidelabels. Klik vanuit de vrijdagafspraak door naar de opname. De proef gebruikt het begin van de eerste gedetecteerde stem binnen de passage als afspeelpunt. Bij ontbrekende sprekerinformatie gebruikt hij het ruwe begin van de passage.
- Vink **Onderbreek voorbeeldverwerking** aan en open opnieuw het voorbeeldgesprek. Vernieuw de pagina, luister naar de bewaarde opname en klik op **Opnieuw proberen**.
- Maak daarna een eigen opname vanuit de presentatorweergave. Gebruik één microfoon en twee mensen. Wissel van slide terwijl de eerste persoon spreekt en laat de tweede kort door die persoon heen praten. Vergelijk vervolgens audio, transcript, sprekerlabels, samenvatting en actiepunten.

## Eerste meting

De eerste lokale verwerking van de synthetische opname van 20 seconden duurde ongeveer 0,39 s voor whisper.cpp base, 0,26 s voor Who 4.3.0 met gedownloade modelbestanden en 1,89 s voor Ollama met Qwen 2.5 1.5B. Who rapporteerde twee sprekers, met twee afzonderlijke beurten, maar miste de geplande onderbreking. De passage rond de slidewissel koppelde aan beide slides. De vrijdagafspraak kwam uit het juiste transcriptsegment op **Begroting**.

Whisper begon sommige segmenten vóór de hoorbare spraak en maakte fouten rond de onderbreking. Ollama labelde een toelichting ook als actiepunt. Het bestaan van een transcriptverwijzing is automatisch gecontroleerd. De inhoudelijke juistheid van die verwijzing en het herkennen van overlap vragen beoordeling met echte audio.
