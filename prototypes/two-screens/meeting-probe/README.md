# Meetingproef

Kan een presentator een afspraak via het transcript terugvinden in de opname en bij de slide die op dat moment in beeld was? Deze proef draait lokaal naast het tweeschermenprototype.

## Starten

Gebruik Node 22 of nieuwer. Voer vanuit `prototypes/two-screens` uit:

```sh
npm ci
npm install --no-save --package-lock=false @desert-ant-labs/who@4.3.0
npm run build
```

Start de [Whisper-server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server) met het meertalige model `ggml-base.bin`:

```sh
whisper-server --host 127.0.0.1 --port 8179 -m /pad/naar/ggml-base.bin -l nl
```

Start Ollama, haal het proefmodel op en start de meetingsserver vanuit `prototypes/two-screens`:

```sh
ollama pull qwen2.5:1.5b
node meeting-probe/server.mjs
```

Open [de presentatorweergave](http://127.0.0.1:8000/route.html) of ga direct naar [Meetings](http://127.0.0.1:8000/meetings.html). De server gebruikt standaard een tijdelijke map voor sessies. Zet `MEETING_DATA` op een eigen lokale map als je sessies langer wilt bewaren. `MEETING_PORT`, `MEETING_MODEL` en `MEETING_WHISPER` zijn optioneel. De eerste start van [Desert Ant Who](https://desertant.com/docs/who/) kan modelbestanden downloaden.

## Doorlopen

- Klik in **Meetings** op **Open voorbeeldgesprek**. In de synthetische opname wisselt de slide op 10 seconden van **Planning** naar **Begroting**. De tweede spreker onderbreekt daarna kort en zegt rond 15 seconden toe de cijfers vrijdag naar het team te sturen.
- Open de passage over de wissel. Controleer de twee slidelabels. Klik vanuit de vrijdagafspraak door naar de opname. De proef gebruikt het begin van de eerste gedetecteerde stem binnen de passage als afspeelpunt. Bij ontbrekende sprekerinformatie gebruikt hij het ruwe begin van de passage.
- Vink **Onderbreek verwerking** aan en open opnieuw het voorbeeldgesprek. Vernieuw de pagina, luister naar de bewaarde opname en klik op **Verwerking opnieuw proberen**.
- Maak daarna een eigen opname vanuit de presentatorweergave. Gebruik één microfoon en twee mensen. Wissel van slide terwijl de eerste persoon spreekt en laat de tweede kort door die persoon heen praten. Vergelijk vervolgens audio, transcript, sprekerlabels, samenvatting en actiepunten.

## Eerste meting

De eerste lokale verwerking van de synthetische opname van 20 seconden duurde ongeveer 0,39 s voor whisper.cpp base, 0,26 s voor Who 4.3.0 met gedownloade modelbestanden en 1,89 s voor Ollama met Qwen 2.5 1.5B. Who rapporteerde twee sprekers, met twee afzonderlijke beurten, maar miste de geplande onderbreking. De passage rond de slidewissel koppelde aan beide slides. De vrijdagafspraak kwam uit het juiste transcriptsegment op **Begroting**.

Whisper begon sommige segmenten vóór de hoorbare spraak en maakte fouten rond de onderbreking. Ollama labelde een toelichting ook als actiepunt. Het bestaan van een transcriptverwijzing is automatisch gecontroleerd. De inhoudelijke juistheid van die verwijzing en het herkennen van overlap vragen beoordeling met echte audio.
