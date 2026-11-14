import React, {useEffect, useRef, useState} from 'react';

function encodeWav(buffer) {
  const frames = Math.floor(buffer.duration * 16000);
  const data = new DataView(new ArrayBuffer(44 + frames * 2));
  for (const [offset, word] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) {
    [...word].forEach((letter, index) => data.setUint8(offset + index, letter.charCodeAt(0)));
  }
  data.setUint32(4, 36 + frames * 2, true);
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, 16000, true);
  data.setUint32(28, 32000, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  data.setUint32(40, frames * 2, true);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < frames; index++) {
    const sample = samples[Math.floor(index * buffer.sampleRate / 16000)];
    data.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
  }
  return data.buffer;
}

export function Recorder({getSlide, subscribeToMoves}) {
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState(0);
  const [meeting, setMeeting] = useState(null);
  const capture = useRef(null);

  function release() {
    const current = capture.current;
    if (!current) return;
    cancelAnimationFrame(current.animation);
    current.unsubscribe?.();
    current.stream.getTracks().forEach(track => track.stop());
    current.context.close().catch(() => {});
    capture.current = null;
  }
  useEffect(() => release, []);

  async function checkMicrophone() {
    setPhase('opening');
    setMessage('');
    setMeeting(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1}});
      const context = new AudioContext();
      capture.current = {stream, context};
      await context.resume();
      const analyser = context.createAnalyser();
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      function measure() {
        analyser.getFloatTimeDomainData(samples);
        setLevel(Math.min(1, Math.sqrt(samples.reduce((sum, value) => sum + value ** 2, 0) / samples.length) * 5));
        capture.current.animation = requestAnimationFrame(measure);
      }
      measure();
      setPhase('check');
    } catch (error) {
      release();
      setPhase('idle');
      setMessage(`Microfoon openen mislukt. ${error.message}`);
    }
  }

  async function save(current) {
    setPhase('saving');
    setMessage('');
    try {
      const response = await fetch('/api/meetings', {
        method: 'POST',
        headers: {'Content-Type': 'audio/wav', 'X-Meeting': encodeURIComponent(JSON.stringify(current.metadata))},
        body: current.wav,
      });
      if (!response.ok) throw new Error((await response.json()).error);
      setMeeting((await response.json()).id);
      release();
      setPhase('idle');
      setMessage('Opname opgeslagen.');
    } catch (error) {
      setPhase('retry');
      setMessage(`Opslaan mislukt. ${error.message}`);
    }
  }

  function start() {
    const current = capture.current;
    try {
      const recorder = new MediaRecorder(current.stream);
      const chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      recorder.onerror = () => {
        release();
        setPhase('idle');
        setMessage('De microfoonopname werd onderbroken.');
      };
      recorder.onstop = async () => {
        try {
          const audio = await new Blob(chunks, {type: recorder.mimeType}).arrayBuffer();
          const decoded = await current.context.decodeAudioData(audio);
          current.wav = encodeWav(decoded);
          current.metadata.duration = Math.floor(decoded.duration * 16000) / 16000;
          current.metadata.slides = current.metadata.slides.filter(slide => slide.at < current.metadata.duration);
          await save(current);
        } catch (error) {
          release();
          setPhase('idle');
          setMessage(`Audio kon niet worden gelezen. ${error.message}`);
        }
      };
      const begin = performance.now();
      current.metadata = {date: new Date().toISOString(), slides: [{...getSlide(), at: 0}]};
      recorder.start();
      current.recorder = recorder;
      cancelAnimationFrame(current.animation);
      current.unsubscribe = subscribeToMoves(slide => {
        current.metadata.slides.push({...slide, at: (performance.now() - begin) / 1000});
      });
      setPhase('recording');
    } catch (error) {
      setMessage(`Opname starten mislukt. ${error.message}`);
    }
  }

  return <section className="presenter-panel meeting-recorder" aria-label="Lokale opname">
    <h2>Opname</h2>
    {phase === 'check' && <p>Praat even en kijk of de meter beweegt. <meter min="0" max="1" value={level} aria-label="Microfoonniveau"/></p>}
    {phase === 'recording' && <p role="status">🔴 Opname actief</p>}
    {phase === 'saving' && <p role="status">Opname opslaan…</p>}
    {message && <p role="status">{message}</p>}
    {meeting && <p><a href={`/meetings.html?id=${meeting}`}>Open opname</a></p>}
    <div className="timer-controls">
      {phase === 'idle' && <button onClick={checkMicrophone}>Microfoon checken</button>}
      {phase === 'opening' && <p>Wacht op de microfoon…</p>}
      {phase === 'check' && <>
        <button onClick={() => { release(); setPhase('idle'); }}>Annuleren</button>
        <button className="primary-action" onClick={start}>Opname starten</button>
      </>}
      {phase === 'recording' && <button onClick={() => {
        setPhase('saving');
        capture.current.unsubscribe();
        capture.current.recorder.stop();
        capture.current.stream.getTracks().forEach(track => track.stop());
      }}>Opname stoppen</button>}
      {phase === 'retry' && <button onClick={() => save(capture.current)}>Opslaan opnieuw proberen</button>}
    </div>
  </section>;
}
