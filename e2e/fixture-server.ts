/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Mode = 'normal' | 'api-down' | 'audio-missing' | 'offline';

interface ControlRequest {
  hideStoryIds?: Array<number>;
  mode?: Mode;
}

const PORT = 4010;
const AUDIO_SECONDS = 60;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COVER = readFileSync(join(ROOT, 'images/logo.png'));
const TIMESTAMP = '2026-11-01T00:00:00.000Z';
const MODES: ReadonlySet<string> = new Set<Mode>([
  'normal',
  'api-down',
  'audio-missing',
  'offline',
]);

// 32 kbps, 44.1 kHz, mono MPEG-1 Layer III frames with empty side info decode as silence.
function createSilentMp3(seconds: number) {
  const frameBytes = Math.floor((144 * 32000) / 44100);
  const frameCount = Math.ceil((seconds * 44100) / 1152);
  const frame = Buffer.alloc(frameBytes);
  frame.set([0xff, 0xfb, 0x10, 0xc0]);

  return Buffer.concat(Array.from({ length: frameCount }, () => frame));
}

const AUDIO = createSilentMp3(AUDIO_SECONDS);

function createStory(id: number, name: string, overrides: Record<string, unknown> = {}) {
  return {
    author: 'Moonlit E2E',
    category_ids: [1],
    created_at_timestamp: TIMESTAMP,
    description: `${name} short description`,
    description_large: `${name} is a fixture story for automated listener journeys.`,
    full_cover_url: `/media/covers/${id}-full.png`,
    id,
    is_coming_soon: false,
    is_featuring: false,
    is_free: true,
    is_hidden: false,
    medium_cover_url: `/media/covers/${id}-medium.png`,
    name,
    played_count: 0,
    revision: 1,
    small_cover_url: `/media/covers/${id}-small.png`,
    type: 1,
    updated_at_timestamp: TIMESTAMP,
    ...overrides,
  };
}

const STORIES = [
  createStory(101, 'Free Fixture Tale', { is_featuring: true, played_count: 30 }),
  createStory(102, 'Locked Fixture Tale', { is_free: false, played_count: 20 }),
  createStory(103, 'Retiring Fixture Tale', { played_count: 10 }),
  createStory(104, 'Hidden Fixture Tale', { is_hidden: true }),
];

const VOICES = [
  { cover_url: '/media/voices/1.png', id: 1, is_free: true, name: 'Fixture Narrator' },
  { cover_url: '/media/voices/2.png', id: 2, is_free: true, name: 'Second Narrator' },
  { cover_url: '/media/voices/3.png', id: 3, is_free: false, name: 'Premium Narrator' },
];

function getRecordings(storyId: number) {
  return VOICES.map((voice) => ({
    audio_url: `/media/audio/${storyId}-${voice.id}.mp3`,
    created_at_timestamp: TIMESTAMP,
    duration: AUDIO_SECONDS,
    id: storyId * 10 + voice.id,
    is_hidden: false,
    name: `${voice.name} reads story ${storyId}`,
    size: AUDIO.length,
    story_id: storyId,
    updated_at_timestamp: TIMESTAMP,
    voices: voice,
  }));
}

const state = {
  hiddenStoryIds: new Set<number>(),
  mode: 'normal' as Mode,
  requests: [] as Array<string>,
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendBytes(res: ServerResponse, contentType: string, bytes: Buffer) {
  res.writeHead(200, { 'Content-Length': bytes.length, 'Content-Type': contentType });
  res.end(bytes);
}

function getVisibleStories() {
  return STORIES.filter((story) => !story.is_hidden && !state.hiddenStoryIds.has(story.id));
}

async function readControlRequest(req: IncomingMessage): Promise<ControlRequest> {
  const chunks: Array<Buffer> = [];

  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  const text = Buffer.concat(chunks).toString();

  return text ? (JSON.parse(text) as ControlRequest) : {};
}

async function handleControl(req: IncomingMessage, res: ServerResponse) {
  const { hideStoryIds = [], mode = 'normal' } =
    req.method === 'DELETE' ? {} : await readControlRequest(req);

  if (!MODES.has(mode)) {
    sendJson(res, 400, { error: `unknown mode ${mode}` });
    return;
  }

  if (req.method === 'DELETE') {
    state.requests = [];
  }

  state.mode = mode;
  state.hiddenStoryIds = new Set(hideStoryIds);
  sendJson(res, 200, { hideStoryIds, mode });
}

function handleApi(url: URL, req: IncomingMessage, res: ServerResponse) {
  if (state.mode === 'api-down' || state.mode === 'offline') {
    sendJson(res, 500, { error: `fixture ${state.mode} mode` });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/stories') {
    sendJson(res, 200, { data: getVisibleStories() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/audio_recordings') {
    const storyId = Number(url.searchParams.get('storyId'));
    const isVisible = getVisibleStories().some((story) => story.id === storyId);

    sendJson(res, 200, { data: isVisible ? getRecordings(storyId) : [] });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/playNotify') {
    sendJson(res, 200, null);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/config') {
    sendJson(res, 200, {
      awsAccessToken: '',
      awsAccountId: '',
      awsConnectionString: '',
      awsSecretKey: '',
      presignedURLsEnabled: false,
    });
    return;
  }

  sendJson(res, 404, { error: `no fixture for ${req.method} ${url.pathname}` });
}

function handleMedia(url: URL, res: ServerResponse) {
  if (state.mode === 'offline') {
    sendJson(res, 503, { error: 'fixture offline mode' });
    return;
  }

  if (!url.pathname.startsWith('/media/audio/')) {
    sendBytes(res, 'image/png', COVER);
    return;
  }

  if (state.mode === 'audio-missing') {
    sendJson(res, 404, { error: 'fixture audio-missing mode' });
    return;
  }

  sendBytes(res, 'audio/mpeg', AUDIO);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  console.log(
    `${new Date().toISOString()} [${state.mode}] ${req.method} ${url.pathname}${url.search}`,
  );

  if (!url.pathname.startsWith('/__')) {
    state.requests.push(`${req.method} ${url.pathname}`);
  }

  try {
    if (url.pathname === '/__control') {
      await handleControl(req, res);
    } else if (url.pathname === '/__requests') {
      sendJson(res, 200, state.requests);
    } else if (url.pathname.startsWith('/media/')) {
      handleMedia(url, res);
    } else {
      handleApi(url, req, res);
    }
  } catch (error) {
    sendJson(res, 500, { error: String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Moonlit fixture API listens on http://localhost:${PORT}`);
});
