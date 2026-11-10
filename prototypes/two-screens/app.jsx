import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

const params = new URLSearchParams(location.hash.slice(1));
const viewer = params.get('view') === 'viewer';
const session = params.get('session') || crypto.randomUUID();
if (!viewer) history.replaceState(null, '', `#session=${session}`);
const storageKey = `perfect-presentations-prototype:${session}`;
const titles = ['Twee schermen, één verhaal', 'Wat ik wil bespreken', 'Probeer de interactie'];
const freshState = () => ({slide:0, estimates:[60,90,120], elapsed:[0,0,0], running:false, since:null, visibility:'presenter', revealed:false, events:[]});
let state = freshState();
try { if (!viewer) state = JSON.parse(sessionStorage.getItem(storageKey)) || state; } catch {}
let audience = null;
let lastSeen = 0;
const listeners = new Set();
const targetOrigin = location.protocol === 'file:' ? '*' : location.origin;
function send(target, type, payload) {
  target?.postMessage({protocol:'pp-prototype-v1', session, type, payload}, targetOrigin);
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
  const now = Date.now();
  if (action === 'move') {
    const next = Math.max(0, Math.min(titles.length-1, state.slide + value));
    if (next === state.slide) return;
    settle(now);
    state.slide = next;
    state.events.push({session, deck:'two-screens', version:1, slideId:`slide-${next+1}`, at:now});
  }
  if (action === 'toggle') { settle(now); state.running = !state.running; state.since = state.running ? now : null; }
  if (action === 'visibility' && ['presenter','viewer','both'].includes(value)) state.visibility = value;
  if (action === 'estimate' && Number.isFinite(value) && value > 0) state.estimates[state.slide] = value;
  if (action === 'reveal') state.revealed = !state.revealed;
  if (action === 'reset') { state.elapsed[state.slide] = 0; state.since = state.running ? now : null; }
  publish();
}
window.addEventListener('message', event => {
  const message = event.data;
  if (message?.protocol !== 'pp-prototype-v1' || message.session !== session) return;
  if (location.protocol !== 'file:' && event.origin !== location.origin) return;
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
    if (['move','reveal'].includes(action) && (action !== 'move' || value === -1 || value === 1)) command(action,value);
  }
});
setInterval(() => {
  if (viewer) send(window.opener, 'ready');
  else if (audience && !audience.closed) send(audience, 'snapshot', state);
}, 500);
function openViewer() {
  const url = new URL(location.href);
  url.hash = `view=viewer&session=${session}`;
  const opened = window.open(url, `pp-${session}`, 'popup,width=1200,height=760');
  if (!opened) { alert('Sta pop-ups toe en klik opnieuw op Publiek openen.'); return; }
  audience = opened;
}
function App() {
  const [current, setCurrent] = useState({...state});
  const [now,setNow] = useState(Date.now());
  useEffect(() => {
    listeners.add(setCurrent);
    const interval = setInterval(() => setNow(Date.now()), 100);
    const keydown = event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target.closest('input,textarea,select,[contenteditable], [data-arrow-keys]')) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        command('move',event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown',keydown);
    return () => {listeners.delete(setCurrent); clearInterval(interval); window.removeEventListener('keydown',keydown);};
  }, []);
  const spent = current.elapsed[current.slide] + (current.running ? now-current.since : 0);
  const remaining = current.estimates[current.slide] - Math.floor(spent/1000);
  const timerVisible = current.visibility === 'both' || current.visibility === (viewer ? 'viewer' : 'presenter');
  const connected = now-lastSeen < 2000;
  return <main>
    <header><b>Perfect Presentations <small>· prototype</small></b><span>{viewer ? 'Publiek' : 'Presentator'} · {connected ? 'Verbonden' : 'Wachten op verbinding'}</span></header>
    {!viewer && <nav><button onClick={openViewer}>Publiek openen</button><button onClick={() => command('toggle')}>{current.running ? 'Pauzeren' : 'Timer starten'}</button><label>Klok op <select aria-label="Klok op" value={current.visibility} onChange={e => command('visibility',e.target.value)}><option value="presenter">Presentator</option><option value="viewer">Publiek</option><option value="both">Beide</option></select></label></nav>}
    <article>
      <div className="eyebrow">TWEE SCHERMEN · {current.slide+1} / {titles.length}</div>
      <h1>{titles[current.slide]}</h1>
      {current.slide === 0 && <p>Open het publieksvenster, sleep het naar je tweede scherm en kies Volledig scherm.</p>}
      {current.slide === 1 && <ul><li>Dezelfde slide en interacties op beide schermen</li><li>Een tijdsinschatting voor elke slide</li><li>Navigeren met knoppen en pijltjestoetsen</li></ul>}
      {current.slide === 2 && <><button onClick={() => command('reveal')}>{current.revealed ? 'Antwoord verbergen' : 'Antwoord tonen'}</button>{current.revealed && <p data-testid="answer">Deze interactie wordt gedeeld met het andere scherm.</p>}<p><input aria-label="Probeer pijltjestoetsen" placeholder="Pijltjes verplaatsen hier de cursor" /></p></>}
      {timerVisible && <div data-testid="timer" className={remaining < 0 ? 'timer overdue' : 'timer'}>{remaining < 0 ? '+' : ''}{Math.floor(Math.abs(remaining)/60)}:{String(Math.abs(remaining)%60).padStart(2,'0')} <small>{remaining < 0 ? 'uitloop' : 'resterend'}</small></div>}
    </article>
    <footer><button disabled={current.slide === 0} onClick={() => command('move',-1)}>Vorige</button><button disabled={current.slide === titles.length-1} onClick={() => command('move',1)}>Volgende</button><button onClick={() => document.documentElement.requestFullscreen().catch(() => alert('Volledig scherm is hier niet beschikbaar.'))}>Volledig scherm</button></footer>
    {!viewer && <aside><label>Schatting huidige slide (seconden) <input aria-label="Schatting" type="number" min="1" value={current.estimates[current.slide]} onChange={e => command('estimate',Number(e.target.value))}/></label><button onClick={() => command('reset')}>Slidetimer herstellen</button><p>Teruggaan bewaart de bestede tijd. Een pauze telt niet mee. De timer loopt door bij een slidewissel. Herstellen zet de huidige slidetijd op nul.</p><p>Volgende slide · {titles[current.slide+1] || 'Einde presentatie'}</p><small>Opnamecontext · {current.events.length} slidewissels vastgelegd. Opnemen wordt in het meetingassistentprototype uitgewerkt.</small></aside>}
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
