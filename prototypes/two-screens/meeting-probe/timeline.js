export const speakerName = (session, id) => session.speakerNames?.[id] || 'Spreker ' + (id + 1);

const colors = ['#71ddd0', '#f0a86f', '#c7a3f5', '#8bb6ff', '#ed92b1'];

export function createTimeline(audio, element, time, jump, saveNames) {
  const get = id => document.getElementById(id);
  const play = get('play-audio');
  const range = get('seek-audio');
  const canvas = document.querySelector('.waveform canvas');
  const grid = get('timeline-grid');
  const dialog = get('speaker-dialog');
  const form = get('speaker-form');
  const edit = get('edit-speakers');
  const tracks = get('timeline-tracks');
  const ruler = get('timeline-ruler');
  const toggle = get('toggle-tracks');
  const timeline = get('timeline');
  toggle.onclick = () => {
    const collapsed = toggle.getAttribute('aria-expanded') === 'true';
    tracks.hidden = ruler.hidden = collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = collapsed ? 'Uitklappen' : 'Inklappen';
  };
  new ResizeObserver(() => {
    document.body.style.setProperty('--timeline-height', timeline.offsetHeight + 'px');
  }).observe(timeline);
  let session;
  let snapshot;
  let speakerIds = [];
  let editId;
  let peaks;
  let load;

  function seek(value) {
    const duration = audio.duration || session?.duration;
    if (Number.isFinite(duration)) audio.currentTime = Math.min(duration, Math.max(0, value));
  }

  function sync() {
    const duration = session?.duration || 0;
    const position = audio.currentTime;
    play.textContent = audio.paused ? '▶' : 'Ⅱ';
    play.setAttribute('aria-label', audio.paused ? 'Afspelen' : 'Pauzeren');
    play.disabled = !duration;
    range.disabled = !duration;
    range.max = duration;
    range.value = position;
    range.setAttribute('aria-valuetext', time(position));
    get('playback-time').textContent = time(position) + ' / ' + time(duration);
    grid.style.setProperty('--position', (duration ? Math.min(100, position / duration * 100) : 0) + '%');
  }

  const audioError = () => { get('audio-error').textContent = 'De opname kan niet worden afgespeeld.'; };
  play.onclick = () => audio.paused ? audio.play().catch(audioError) : audio.pause();
  range.oninput = () => seek(Number(range.value));
  for (const event of ['timeupdate', 'play', 'pause', 'seeking', 'loadedmetadata', 'ended']) {
    audio.addEventListener(event, sync);
  }
  audio.addEventListener('error', audioError);

  function draw() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    context.fillStyle = '#586768';
    context.fillRect(0, height / 2, width, 1);
    if (!peaks) return;
    const count = Math.max(1, Math.min(peaks.length, Math.floor(width / 3)));
    const step = width / count;
    for (let index = 0; index < count; index++) {
      const peak = peaks[Math.floor(index * peaks.length / count)];
      const seconds = (index + 0.5) / count * session.duration;
      const turn = session.turns?.find(item => item.start <= seconds && seconds < item.end);
      context.fillStyle = turn ? colors[speakerIds.indexOf(turn.speaker) % colors.length] : '#899e9e';
      const magnitude = Math.min(height * 0.9, Math.sqrt(peak) * height);
      context.fillRect(index * step, (height - magnitude) / 2, Math.max(1, step - 1.3), magnitude);
    }
  }
  new ResizeObserver(draw).observe(canvas);

  async function loadWaveform(signal) {
    let context;
    try {
      const response = await fetch(audio.src, {signal});
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      if (signal.aborted) return;
      context = new AudioContext();
      const buffer = await context.decodeAudioData(bytes);
      if (signal.aborted) return;
      const samples = buffer.getChannelData(0);
      const count = Math.min(1600, samples.length);
      peaks = Array.from({length: count}, (_, index) => {
        let peak = 0;
        const from = Math.floor(index * samples.length / count);
        const to = Math.floor((index + 1) * samples.length / count);
        for (let sample = from; sample < to; sample++) peak = Math.max(peak, Math.abs(samples[sample]));
        return peak;
      });
      draw();
    } catch {
      // Playback and the timeline remain available without the waveform.
    } finally {
      await context?.close().catch(() => {});
    }
  }

  function lane(label, color) {
    const row = element('div', '', {class: 'timeline-lane'});
    const name = element('span', label, {class: 'meta lane-label'});
    const line = element('div', '', {class: 'lane-line'});
    line.style.setProperty('--track-color', color);
    row.append(name, line);
    tracks.append(row);
    return line;
  }

  function marker(line, start, end, label, action, text = '') {
    if (!Number.isFinite(start) || start < 0 || start > session.duration) return;
    const button = element('button', text, {type: 'button', class: 'timeline-marker', title: label, 'aria-label': label});
    button.style.left = start / session.duration * 100 + '%';
    if (Number.isFinite(end)) {
      button.style.width = Math.max(0, (Math.min(end, session.duration) - start) / session.duration * 100) + '%';
    } else {
      button.classList.add('point');
      button.style.left = 'clamp(6px, ' + button.style.left + ', calc(100% - 6px))';
    }
    button.onclick = action;
    line.append(button);
  }

  edit.onclick = () => {
    editId = session.id;
    get('speaker-error').textContent = '';
    get('speaker-fields').replaceChildren(...speakerIds.map(id => {
      const label = element('label', 'Spreker ' + (id + 1));
      const input = element('input', '', {name: String(id), maxlength: '60', autocomplete: 'off'});
      input.value = session.speakerNames?.[id] ?? '';
      label.append(input);
      return label;
    }));
    dialog.showModal();
  };
  get('close-speakers').onclick = () => dialog.close();
  form.onsubmit = async event => {
    event.preventDefault();
    if (editId !== session.id) return;
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    get('speaker-error').textContent = '';
    try {
      await saveNames(Object.fromEntries(new FormData(form)));
      dialog.close();
    } catch (error) {
      get('speaker-error').textContent = error.message || 'Opslaan is mislukt.';
    } finally {
      submit.disabled = false;
    }
  };

  return {
    render(recording) {
      if (session?.id !== recording.id) {
        dialog.close();
        load?.abort();
        load = new AbortController();
        peaks = null;
        get('audio-error').textContent = '';
        void loadWaveform(load.signal);
      }
      session = recording;
      const next = JSON.stringify([session.id, session.duration, session.turns, session.slides, session.speakerNames,
        session.status === 'ready' ? session.summary : null, session.passages]);
      if (next === snapshot) return;
      snapshot = next;
      speakerIds = [...new Set((session.turns ?? []).map(turn => turn.speaker))].sort((a, b) => a - b);
      edit.hidden = !speakerIds.length;
      tracks.replaceChildren();
      if (session.slides.length) {
        const line = lane('Slides', '#d7ed9f');
        session.slides.forEach((slide, index) => {
          const end = session.slides[index + 1]?.at ?? session.duration;
          if (end <= slide.at) return;
          marker(line, slide.at, end, slide.title + ' · ' + time(slide.at), () => seek(slide.at), slide.title);
        });
      }
      for (const [index, id] of speakerIds.entries()) {
        const name = speakerName(session, id);
        const line = lane(name, colors[index % colors.length]);
        for (const turn of session.turns.filter(turn => turn.speaker === id && turn.end > turn.start)) {
          marker(line, turn.start, turn.end, name + ' · ' + time(turn.start), () => seek(turn.start));
        }
      }
      if (session.status === 'ready') {
        const notes = (session.summary ?? []).map(note => ({
          note, passage: session.passages.find(passage => passage.id === note.passageId),
        })).filter(({passage}) => Number.isFinite(passage?.start));
        if (notes.length) {
          const line = lane('Samenvatting', '#f1c97e');
          const byStart = new Map();
          for (const {note, passage} of notes) {
            const start = passage.seek ?? passage.start;
            if (!byStart.has(start)) byStart.set(start, {passage, texts: []});
            byStart.get(start).texts.push(note.text);
          }
          for (const [start, {passage, texts}] of byStart) {
            marker(line, start, null, time(start) + ' · ' + texts.join(' / '), () => jump(passage));
          }
        }
      }
      get('timeline-ruler').replaceChildren(...[0, 0.25, 0.5, 0.75, 1].map(part =>
        element('span', time(session.duration * part))));
      draw();
      sync();
    },
  };
}
