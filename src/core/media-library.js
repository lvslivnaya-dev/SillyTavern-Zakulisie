/**
 * The media library («Медиа → Плеер»): links to music and videos of different services, pinned by hand and played in the little
 * player of the page (ui/media-dock.js) without leaving the tavern. It lives in the extension settings, shared by all chats.
 *
 * library = { version: 1, items: [item] }
 * item    = { id, title, url, note, pinned, service, mood, image? }
 *            image   — a cover of your own for the gallery view (only the look: nothing else uses it);
 *            service — what parseMediaLink made of the url ('youtube', 'spotify', …, 'file' for a direct file, 'link' = cannot be embedded);
 *            mood    — a free word or phrase for the scene mood it suits (the player may offer it when the scene changes).
 *
 * Pure: no DOM, no SillyTavern. Every function returns a new library and never mutates its input.
 */
import { uniqueId } from './ids.js';
import { cleanImagePath } from './wardrobe.js';

export const MEDIA_VERSION = 1;
export const MEDIA_LIMITS = Object.freeze({ items: 500, title: 120, url: 600, note: 400, mood: 60 });

export const MEDIA_SERVICES = Object.freeze({
  youtube: 'YouTube', ytmusic: 'YouTube Music', spotify: 'Spotify', soundcloud: 'SoundCloud', yandex: 'Яндекс Музыка', apple: 'Apple Music',
  file: 'Файл', link: 'Ссылка',
});

const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const AUDIO_FILE = /\.(mp3|ogg|oga|wav|m4a|flac|aac|opus)$/i;
const VIDEO_FILE = /\.(mp4|webm|ogv|mov)$/i;

/**
 * A link as the player understands it: { service, kind, embed, url } or null when it is not an http(s) address.
 * kind — 'iframe' (a service's own embedded player), 'audio' / 'video' (a direct file), 'link' (opens in a new tab only).
 */
export function parseMediaLink(value) {
  const text = String(value ?? '').trim();
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const result = (service, kind, embed = '') => ({ service, kind, embed, url: url.href });

  if (host === 'youtu.be' && parts[0]) return result('youtube', 'iframe', `https://www.youtube.com/embed/${encodeURIComponent(parts[0])}`);
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    const service = host === 'music.youtube.com' ? 'ytmusic' : 'youtube';
    const list = url.searchParams.get('list');
    const video = url.searchParams.get('v') ?? (['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : '');
    if (video) return result(service, 'iframe', `https://www.youtube.com/embed/${encodeURIComponent(video)}${list ? `?list=${encodeURIComponent(list)}` : ''}`);
    if (list) return result(service, 'iframe', `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(list)}`);
  }
  if (host === 'open.spotify.com') {
    const rest = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts;
    if (['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(rest[0]) && rest[1]) return result('spotify', 'iframe', `https://open.spotify.com/embed/${rest[0]}/${encodeURIComponent(rest[1])}`);
  }
  if (host === 'soundcloud.com' && parts.length >= 1) return result('soundcloud', 'iframe', `https://w.soundcloud.com/player/?url=${encodeURIComponent(`${url.origin}${url.pathname}`)}&auto_play=false`);
  if (host === 'music.yandex.ru' || host === 'music.yandex.com') {
    const track = parts.indexOf('track');
    const album = parts.indexOf('album');
    if (album >= 0 && track >= 0 && parts[album + 1] && parts[track + 1]) return result('yandex', 'iframe', `https://music.yandex.ru/iframe/track/${parts[track + 1]}/${parts[album + 1]}`);
    if (album >= 0 && parts[album + 1]) return result('yandex', 'iframe', `https://music.yandex.ru/iframe/album/${parts[album + 1]}`);
    const users = parts.indexOf('users');
    if (users >= 0 && parts[users + 2] === 'playlists' && parts[users + 3]) return result('yandex', 'iframe', `https://music.yandex.ru/iframe/playlist/${encodeURIComponent(parts[users + 1])}/${parts[users + 3]}`);
  }
  if (host === 'music.apple.com' && parts.length >= 2) return result('apple', 'iframe', `https://embed.music.apple.com${url.pathname}${url.search}`);
  if (AUDIO_FILE.test(url.pathname)) return result('file', 'audio');
  if (VIDEO_FILE.test(url.pathname)) return result('file', 'video');
  return result('link', 'link');
}

function cleanItem(raw) {
  const url = clip(raw?.url, MEDIA_LIMITS.url);
  const parsed = parseMediaLink(url);
  if (!parsed) return null;
  return {
    id: String(raw?.id ?? '') || uniqueId('media'),
    title: clip(raw?.title, MEDIA_LIMITS.title) || MEDIA_SERVICES[parsed.service],
    url: parsed.url,
    note: clip(raw?.note, MEDIA_LIMITS.note),
    mood: clip(raw?.mood, MEDIA_LIMITS.mood),
    pinned: raw?.pinned === true,
    service: parsed.service,
    ...(cleanImagePath(raw?.image) ? { image: cleanImagePath(raw.image) } : {}),
  };
}

export function emptyMedia() {
  return { version: MEDIA_VERSION, items: [] };
}

/** Repair a stored library: unknown or broken items go, ids stay unique, the count is capped. */
export function normalizeMedia(raw) {
  const seen = new Set();
  const items = [];
  for (const item of Array.isArray(raw?.items) ? raw.items : []) {
    const clean = cleanItem(item);
    if (!clean) continue;
    if (seen.has(clean.id)) clean.id = uniqueId('media');
    seen.add(clean.id);
    items.push(clean);
    if (items.length >= MEDIA_LIMITS.items) break;
  }
  return { version: MEDIA_VERSION, items };
}

/** Add a link: { library, item }. A link that is not an address throws; the same address twice is not added again. */
export function addMediaItem(library, { url, title = '', note = '', mood = '', pinned = false } = {}) {
  const current = normalizeMedia(library);
  const parsed = parseMediaLink(url);
  if (!parsed) throw new RangeError('Это не ссылка: вставьте адрес вместе с https://');
  const same = current.items.find(item => item.url === parsed.url);
  if (same) return { library: current, item: same, existed: true };
  if (current.items.length >= MEDIA_LIMITS.items) throw new RangeError('Слишком много ссылок');
  const item = cleanItem({ url: parsed.url, title, note, mood, pinned });
  return { library: { ...current, items: [...current.items, item] }, item, existed: false };
}

/** Change fields of one item (title, url, note, mood, pinned); a new url is parsed again. */
export function updateMediaItem(library, id, patch = {}) {
  const current = normalizeMedia(library);
  if (!current.items.some(item => item.id === id)) throw new RangeError('Такой ссылки уже нет');
  return {
    ...current,
    items: current.items.map(item => {
      if (item.id !== id) return item;
      const next = cleanItem({ ...item, ...patch, id });
      if (!next) throw new RangeError('Это не ссылка: вставьте адрес вместе с https://');
      return next;
    }),
  };
}

export function removeMediaItem(library, id) {
  const current = normalizeMedia(library);
  return { ...current, items: current.items.filter(item => item.id !== id) };
}

/** Pinned first, then as added; with a query only the items whose title, note, mood, service or address match. */
export function searchMedia(library, query = '') {
  const needle = String(query ?? '').trim().toLocaleLowerCase('ru-RU');
  const items = normalizeMedia(library).items.filter(item => !needle
    || `${item.title} ${item.note} ${item.mood} ${MEDIA_SERVICES[item.service]} ${item.url}`.toLocaleLowerCase('ru-RU').includes(needle));
  return [...items.filter(item => item.pinned), ...items.filter(item => !item.pinned)];
}
