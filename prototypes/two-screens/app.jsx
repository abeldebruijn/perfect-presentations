import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SlideMarks, useSlideMarks} from './useSlideMarks.jsx';
import {ScenarioChart} from './ScenarioChart.jsx';
import './style.css';

const params = new URLSearchParams(location.hash.slice(1));
const viewer = params.get('view') === 'viewer';
const session = params.get('session') || crypto.randomUUID();
if (!viewer) history.replaceState(null, '', `#session=${session}`);
const storageKey = `perfect-presentations-prototype:${session}`;
const titles = ['Twee schermen, één verhaal', 'Wat ik wil bespreken', 'Probeer de interactie', 'Bespaarde uren per week'];
const estimates = [60, 90, 120, 90];
const freshState = () => ({slide:0, scrollProgress:0, estimates:[...estimates], elapsed:estimates.map(() => 0), running:false, since:null, visibility:'presenter', revealed:false, scenario:'basis', events:[]});
let state = freshState();
try {
  const saved = !viewer && JSON.parse(sessionStorage.getItem(storageKey));
  if (saved) {
    state = {
      ...state, ...saved,
      estimates:estimates.map((estimate, index) => saved.estimates?.[index] ?? estimate),
      elapsed:estimates.map((_, index) => saved.elapsed?.[index] ?? 0),
    };
  }
} catch {}
let audience = null;
let lastSeen = 0;
const listeners = new Set();
const targetOrigin = location.protocol === 'file:' ? '*' : location.origin;
function send(target, type, payload) {
  target?.postMessage({protocol:'pp-prototype-v1', session, type, payload}, targetOrigin);
}
function isSessionMessage(event) {
  const message = event.data;
  return message?.protocol === 'pp-prototype-v1' && message.session === session &&
    (location.protocol === 'file:' || event.origin === location.origin);
}
function sendMarks(payload) {
  send(viewer ? window.opener : audience, 'marks', payload);
}
function isPeerMarks(event) {
  const peer = viewer ? window.opener : audience;
  return peer && event.source === peer && isSessionMessage(event) && event.data.type === 'marks';
}
function persist() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
}
function publish() {
  persist();
  listeners.forEach(fn => fn({...state}));
  send(audience, 'snapshot', state);
}
function settle(now) {
  if (state.running) state.elapsed[state.slide] += now - state.since;
  state.since = state.running ? now : null;
}
function command(action, value) {
  if (viewer) { send(window.opener, 'command', {action,value}); return; }
  if (action === 'scroll') {
    if (value?.slide !== state.slide || !Number.isFinite(value.progress) ||
        value.progress < 0 || value.progress > 1 || value.progress === state.scrollProgress) return;
    state.scrollProgress = value.progress;
  }
  const now = Date.now();
  if (action === 'move') {
    const next = Math.max(0, Math.min(titles.length-1, state.slide + value));
    if (next === state.slide) return;
    settle(now);
    state.slide = next;
    state.scrollProgress = 0;
    state.events.push({session, deck:'two-screens', version:1, slideId:`slide-${next+1}`, at:now});
  }
  if (action === 'toggle') { settle(now); state.running = !state.running; state.since = state.running ? now : null; }
  if (action === 'visibility' && ['presenter','viewer','both'].includes(value)) state.visibility = value;
  if (action === 'estimate' && Number.isFinite(value) && value > 0) state.estimates[state.slide] = value;
  if (action === 'reveal') state.revealed = !state.revealed;
  if (action === 'scenario') {
    if (value !== 'basis' && value !== 'alternatief') return;
    state.scenario = value;
  }
  if (action === 'reset') { state.elapsed[state.slide] = 0; state.since = state.running ? now : null; }
  publish();
}
window.addEventListener('message', event => {
  if (!isSessionMessage(event)) return;
  const message = event.data;
  if (viewer) {
    if (event.source !== window.opener || message.type !== 'snapshot') return;
    state = message.payload;
    lastSeen = Date.now();
    listeners.forEach(fn => fn({...state}));
    return;
  }
  if (message.type === 'ready') {
    // A reconnect uses the session capability from the viewer URL.
    if (audience && !audience.closed && event.source !== audience) return;
    audience = event.source;
    lastSeen = Date.now();
    send(audience, 'snapshot', state);
  }
  if (event.source === audience && message.type === 'command') {
    const {action,value} = message.payload || {};
    if (['move','reveal','scroll','scenario'].includes(action) && (action !== 'move' || value === -1 || value === 1)) command(action,value);
  }
});
setInterval(() => {
  if (viewer) send(window.opener, 'ready');
  else if (audience && !audience.closed) send(audience, 'snapshot', state);
}, 500);
function openViewer() {
  const url = new URL(location.href);
  url.hash = `view=viewer&session=${session}`;
  const opened = window.open(url, `pp-audience-${session}`);
  if (!opened) { alert('Sta pop-ups toe en klik opnieuw op Publiek openen.'); return; }
  audience = opened;
  opened.focus();
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    alert('Volledig scherm is hier niet beschikbaar.');
  }
}
function App() {
  const [current, setCurrent] = useState({...state});
  const [now,setNow] = useState(Date.now());
  const slideRef = useRef(null);
  const scrollProgress = current.scrollProgress ?? 0;
  useLayoutEffect(() => {
    const slide = slideRef.current;
    const restoreScroll = () => {
      const scrollable = slide.scrollHeight - slide.clientHeight;
      const top = scrollProgress * scrollable;
      if (Math.abs(slide.scrollTop - top) > 0.5) slide.scrollTop = top;
    };
    restoreScroll();
    window.addEventListener('resize', restoreScroll);
    return () => window.removeEventListener('resize', restoreScroll);
  }, [current.slide, current.revealed, scrollProgress]);
  const marks = useSlideMarks(slideRef, current.slide, sendMarks, isPeerMarks);

  function syncScroll(event) {
    marks.measure();
    const slide = event.currentTarget;
    const scrollable = slide.scrollHeight - slide.clientHeight;
    // Ignore the scroll event produced by applying the other window's position.
    if (scrollable <= 0 || state.slide !== current.slide ||
        Math.abs(slide.scrollTop - (state.scrollProgress ?? 0) * scrollable) <= 0.5) return;
    const progress = Math.max(0, Math.min(1, slide.scrollTop / scrollable));
    command('scroll', {slide:current.slide, progress});
  }
  useEffect(() => {
    listeners.add(setCurrent);
    const interval = setInterval(() => setNow(Date.now()), 100);
    const keydown = event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target.closest('input,textarea,select,[contenteditable]')) return;
      if (viewer && event.key.toLowerCase() === 'f' && !event.repeat) {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (event.target.closest('[data-arrow-keys]')) return;
        event.preventDefault();
        command('move',event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown',keydown);
    return () => {
      listeners.delete(setCurrent);
      clearInterval(interval);
      window.removeEventListener('keydown', keydown);
    };
  }, []);
  const spent = current.elapsed[current.slide] + (current.running ? now-current.since : 0);
  const remaining = current.estimates[current.slide] - Math.floor(spent/1000);
  const timerVisible = current.visibility === 'both' || current.visibility === (viewer ? 'viewer' : 'presenter');
  const connected = now-lastSeen < 2000;
  const timer = timerVisible && (
    <div data-testid="timer" className={`timer${remaining < 0 ? ' overdue' : ''}`}>
      <span>{remaining < 0 ? '+' : ''}{Math.floor(Math.abs(remaining) / 60)}:{String(Math.abs(remaining) % 60).padStart(2, '0')}</span>{' '}
      <small>{remaining < 0 ? 'uitloop' : 'resterend'}</small>
    </div>
  );
  const slide = (
    <div className="slide-frame">
      <article
        key={current.slide}
        ref={slideRef}
        tabIndex={0}
        aria-label={titles[current.slide]}
        {...marks.handlers}
        onScroll={syncScroll}
        onDoubleClick={viewer ? event => {
          if (!event.target.closest('button,a,input,select,textarea,[contenteditable]')) void toggleFullscreen();
        } : undefined}>
        <div className="slide-content">
          <div className="eyebrow" data-selection-block="eyebrow">TWEE SCHERMEN · {current.slide+1} / {titles.length}</div>
          <h1 data-selection-block="title">{titles[current.slide]}</h1>
          {current.slide === 0 && <p data-selection-block="intro">Een gedeelde presentatie met ruimte voor interactie.</p>}
          {current.slide === 1 && <ul><li data-selection-block="agenda-1">Dezelfde slide en interacties op beide schermen</li><li data-selection-block="agenda-2">Een tijdsinschatting voor elke slide</li><li data-selection-block="agenda-3">Navigeren met knoppen en pijltjestoetsen</li></ul>}
          {current.slide === 2 && <><button onClick={() => command('reveal')}>{current.revealed ? 'Antwoord verbergen' : 'Antwoord tonen'}</button>{current.revealed && <p data-testid="answer" data-selection-block="answer">Deze interactie wordt gedeeld met het andere scherm.</p>}<p><input aria-label="Probeer pijltjestoetsen" placeholder="Pijltjes verplaatsen hier de cursor" /></p></>}
          {current.slide === 3 && <ScenarioChart scenario={current.scenario ?? 'basis'} onScenarioChange={value => command('scenario', value)}/>}
        </div>
      </article>
      <SlideMarks slideRef={slideRef} slideIndex={current.slide} own={marks.own} peer={marks.peer} geometry={marks.geometry}/>
    </div>
  );
  if (viewer) return <main className="audience-view">{slide}{timer}</main>;

  return (
    <main className="presenter-view">
      <header className="presenter-header">
        <div className="presenter-brand">
          <strong>Perfect Presentations</strong>
          <span>Presentatorweergave</span>
        </div>
        <div className="presenter-connection">
          <span className={connected ? 'connection-status connected' : 'connection-status'}>
            {connected ? 'Publiek verbonden' : 'Publiek niet verbonden'}
          </span>
          <button className="primary-action" onClick={openViewer}>Publiek openen</button>
        </div>
      </header>

      <div className="presenter-workspace">
        <section className="presenter-stage" aria-label="Huidige slide">
          <div className="stage-label">
            <span>Huidige slide</span>
            <span>{current.slide + 1} van {titles.length}</span>
          </div>
          {slide}
          <nav className="slide-controls" aria-label="Slidenavigatie">
            <button disabled={current.slide === 0} onClick={() => command('move', -1)}>Vorige</button>
            <button className="primary-action" disabled={current.slide === titles.length - 1} onClick={() => command('move', 1)}>Volgende</button>
            <button className="fullscreen-action" onClick={toggleFullscreen}>Volledig scherm</button>
          </nav>
          {current.slide === 0 && <p className="stage-label">Sleep het publiekstabblad uit de tabbalk naar je tweede scherm. Druk daar op F voor volledig scherm.</p>}
        </section>

        <aside className="presenter-sidebar" aria-label="Timer en volgende slide">
          <section className="presenter-panel">
            <h2>Slidetimer</h2>
            {timer || <p className="timer-location">Klok zichtbaar bij het publiek</p>}
            <div className="timer-controls">
              <button onClick={() => command('toggle')}>{current.running ? 'Pauzeren' : 'Timer starten'}</button>
              <button className="reset-action" onClick={() => command('reset')}>Slidetimer herstellen</button>
            </div>
            <div className="timer-settings">
              <label>Schatting <span className="estimate-field"><input aria-label="Schatting" type="number" min="1" value={current.estimates[current.slide]} onChange={e => command('estimate', Number(e.target.value))}/> sec</span></label>
              <label>Klok op <select aria-label="Klok op" value={current.visibility} onChange={e => command('visibility', e.target.value)}>
                <option value="presenter">Presentator</option>
                <option value="viewer">Publiek</option>
                <option value="both">Beide</option>
              </select></label>
            </div>
          </section>
          <section className="presenter-panel next-slide">
            <h2>Volgende slide</h2>
            <p>{titles[current.slide + 1] || 'Einde presentatie'}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')).render(<App/>);
