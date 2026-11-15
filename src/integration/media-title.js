/**
 * The name of a link for the media library: YouTube, Spotify and SoundCloud tell it themselves (oEmbed, open to a page of any site);
 * for a direct file the file's name will do. Anything else: '' (the user names it). Never throws; a slow answer is dropped.
 */
import { parseMediaLink } from '../core/media-library.js';

const OEMBED = Object.freeze({
  youtube: url => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  ytmusic: url => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.replace('music.youtube.com', 'www.youtube.com'))}`,
  spotify: url => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
  soundcloud: url => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
});

const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

/** A name from a file's address: «rain%20on%20window.mp3» → «rain on window». */
export function titleFromFile(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
    return clean(name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' '));
  } catch { return ''; }
}

export async function lookupMediaTitle(value, { fetcher = globalThis.fetch?.bind(globalThis), timeout = 6000 } = {}) {
  const parsed = parseMediaLink(value);
  if (!parsed) return '';
  if (parsed.service === 'file') return titleFromFile(parsed.url);
  const make = OEMBED[parsed.service];
  if (!make || !fetcher) return '';
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeout);
  try {
    const response = await fetcher(make(parsed.url), controller ? { signal: controller.signal } : {});
    if (!response.ok) return '';
    const data = await response.json();
    const title = clean(data?.title);
    // SoundCloud gives the track and the author apart; the others put the artist into the title themselves
    return parsed.service === 'soundcloud' && data?.author_name && title ? clean(`${title} — ${data.author_name}`) : title;
  } catch { return ''; } finally { clearTimeout(timer); }
}
