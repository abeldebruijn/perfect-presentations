import {createServer} from 'node:http';
import {mkdir, readFile, readdir, writeFile, rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {align, checkReferences} from './align.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const recordings = process.env.MEETING_DATA ?? join(tmpdir(), 'perfect-presentations-meeting-probe');
const whisper = process.env.MEETING_WHISPER ?? 'http://127.0.0.1:8179';
const ollama = 'http://127.0.0.1:11434';
const model = process.env.MEETING_MODEL ?? 'qwen2.5:1.5b';
const port = Number(process.env.MEETING_PORT ?? 8000);
await mkdir(recordings, {recursive: true, mode: 0o700});
const jobs = new Set();
let who;

const read = async id => JSON.parse(await readFile(join(recordings, id, 'session.json'), 'utf8'));
async function save(session) {
  const file = join(recordings, session.id, 'session.json');
  await writeFile(file + '.tmp', JSON.stringify(session));
  await rename(file + '.tmp', file);
}

async function fetchJson(url, options) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(120_000)});
  if (!response.ok) throw new Error(`Lokale dienst gaf HTTP ${response.status}.`);
  return response.json();
}

const entrySchema = {
  type: 'object', required: ['text', 'passageId'],
  properties: {text: {type: 'string'}, passageId: {type: 'string'}},
};

async function processMeeting(session, interrupt) {
  let stage = 'Transcriptie';
  const timings = {};
  let began = performance.now();
  async function next(label) {
    timings[stage] = Math.round(performance.now() - began);
    if (stage === interrupt) throw new Error('Verwerking onderbroken voor de proef.');
    stage = label;
    await save({...session, status: 'processing', stage, timings});
    began = performance.now();
  }
  try {
    await save({...session, status: 'processing', stage, timings});
    const wav = await readFile(join(recordings, session.id, 'audio.wav'));
    const input = new FormData();
    input.append('file', new Blob([wav], {type: 'audio/wav'}), 'audio.wav');
    input.append('response_format', 'verbose_json');
    input.append('language', 'nl');
    const {segments} = await fetchJson(whisper + '/inference', {method: 'POST', body: input});
    const transcript = segments.map(({start, end, text}) => ({
      start, end: Math.min(end, session.duration), text: text.trim(),
    })).filter(segment => segment.text && segment.end > segment.start);

    await next('Sprekersegmenten');
    const modulePath = process.env.MEETING_WHO_MODULE;
    who ??= import(modulePath ? pathToFileURL(modulePath).href : '@desert-ant-labs/who/native')
      .then(({Who}) => Who.load()).catch(error => {
        who = undefined;
        throw error;
      });
    const {turns} = await (await who).diarize(wav);
    const passages = align(transcript, turns, session.slides, session.duration);
    session = {...session, passages, turns};

    await next('Samenvatting');
    const sources = passages.map(({id, text}) => ({id, text}));
    const generated = passages.length ? await fetchJson(ollama + '/api/generate', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model, stream: false, options: {temperature: 0},
        format: {type: 'object', required: ['summary', 'actions'], properties: {
          summary: {type: 'array', items: entrySchema}, actions: {type: 'array', items: entrySchema},
        }},
        prompt: `Vat dit gesprek kort samen in het Nederlands. Geef alleen expliciet toegezegde actiepunten in actions. Geef per regel de tekst (text) en de ID van de passage die de bewering ondersteunt (passageId). Dit zijn de gegevens: ${JSON.stringify(sources)}`,
      }),
    }) : {response: '{"summary":[],"actions":[]}'};
    const result = checkReferences(JSON.parse(generated.response), passages);
    timings[stage] = Math.round(performance.now() - began);
    await save({...session, ...result, stage: null, timings, status: 'ready'});
  } catch (error) {
    await save({...session, status: 'failed', stage, timings, error: error.cause?.message ?? error.message});
  }
}

function launch(session, interrupt) {
  if (jobs.has(session.id)) return;
  jobs.add(session.id);
  processMeeting(session, interrupt).catch(console.error).finally(() => jobs.delete(session.id));
}

const files = new Map([
  ['/route.html', ['route.html', 'text/html']],
  ['/bundle.js', ['bundle.js', 'text/javascript']],
  ['/bundle.css', ['bundle.css', 'text/css']],
  ['/meetings.html', ['meeting-probe/meetings.html', 'text/html']],
]);
const json = (response, data, status = 200) => {
  response.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  response.end(JSON.stringify(data));
};
const present = session => session.status === 'processing' && !jobs.has(session.id)
  ? {...session, status: 'failed', error: 'De lokale server werd gestopt tijdens de verwerking.'}
  : session;

createServer(async (request, response) => {
  try {
    const origin = `http://${request.headers.host}`;
    if (![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin) ||
        (request.headers.origin && request.headers.origin !== origin)) return json(response, {}, 403);
    const {pathname} = new URL(request.url, origin);
    if (pathname === '/') {
      response.writeHead(302, {Location: '/route.html'}).end();
      return;
    }
    if (request.method === 'GET' && files.has(pathname)) {
      const [file, type] = files.get(pathname);
      const contents = await readFile(join(root, file));
      response.writeHead(200, {'Content-Type': type});
      response.end(contents);
      return;
    }
    if (pathname === '/api/meetings' && request.method === 'GET') {
      const folders = await readdir(recordings);
      const sessions = await Promise.all(folders.filter(id => /^[\da-f-]{36}$/.test(id))
        .map(id => read(id).catch(() => null)));
      return json(response, sessions.filter(Boolean).map(present).sort((a, b) => b.date.localeCompare(a.date)));
    }
    if (['/api/meetings', '/api/meetings/example'].includes(pathname) && request.method === 'POST') {
      const example = pathname.endsWith('/example');
      const id = randomUUID();
      let incoming;
      if (example) {
        incoming = {
          date: new Date().toISOString(), duration: 20,
          slides: [{at: 0, id: 'slide-1', title: 'Planning'}, {at: 10, id: 'slide-2', title: 'Begroting'}],
          audio: await readFile(join(root, 'meeting-probe/example.wav')),
        };
      } else {
        const metadata = JSON.parse(decodeURIComponent(request.headers['x-meeting']));
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 64 * 1024 * 1024) return json(response, {error: 'De proef ondersteunt maximaal 64 MB audio.'}, 413);
          chunks.push(chunk);
        }
        incoming = {...metadata, audio: Buffer.concat(chunks)};
      }
      const {audio, ...metadata} = incoming;
      if (audio.toString('ascii', 0, 4) !== 'RIFF' || !Number.isFinite(metadata.duration) ||
          metadata.duration <= 0 || metadata.slides?.[0]?.at !== 0) {
        return json(response, {error: 'Audio of begintijd van de slide ontbreekt.'}, 400);
      }
      await mkdir(join(recordings, id), {mode: 0o700});
      await writeFile(join(recordings, id, 'audio.wav'), audio);
      const session = {...metadata, id, example, deck: example ? 'Voorbeeldgesprek' : 'Perfect Presentations', status: 'saved'};
      await save(session);
      launch(session, example && request.headers['x-interrupt'] === 'yes' ? 'Sprekersegmenten' : null);
      return json(response, {id}, 201);
    }
    const match = /^\/api\/meetings\/([\da-f-]{36})(\/audio|\/retry)?$/.exec(pathname);
    if (match) {
      const [, id, action] = match;
      const session = present(await read(id));
      if (action === '/audio' && request.method === 'GET') {
        const audio = await readFile(join(recordings, id, 'audio.wav'));
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
        if (range) {
          const from = Number(range[1]);
          const to = Math.min(Number(range[2] || audio.length - 1), audio.length - 1);
          if (from > to) return response.writeHead(416, {'Content-Range': `bytes */${audio.length}`}).end();
          return response.writeHead(206, {
            'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': to - from + 1,
            'Content-Range': `bytes ${from}-${to}/${audio.length}`,
          }).end(audio.subarray(from, to + 1));
        }
        return response.writeHead(200, {'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': audio.length}).end(audio);
      }
      if (action === '/retry' && request.method === 'POST' && session.status === 'failed') {
        delete session.error;
        launch(session);
        return json(response, {id}, 202);
      }
      if (!action && request.method === 'GET') return json(response, session);
    }
    json(response, {error: 'Pagina of sessie bestaat niet.'}, 404);
  } catch (error) {
    json(response, {error: error.code === 'ENOENT' ? 'Voer npm run build uit of controleer de sessie.' : error.message},
      error.code === 'ENOENT' ? 404 : 500);
  }
}).listen(port, '127.0.0.1', () => console.log(`Meetingproef op http://127.0.0.1:${port}`));
