/**
 * What to offer from the media library for the scene that is on now. No model is asked: the mood of the scene is made of what is
 * already known (the moods of the heroes on stage, the weather, the time of day), and a link fits when the words of its own field
 * «для какого настроения» (and its title and note) hold the stem of a word of that mood.
 *
 * Pure: no DOM, no SillyTavern.
 */
import { normalizeMedia } from './media-library.js';

/** Stems of the words that say the same as a mood (Russian, by the root: «тревог» finds «тревога», «тревожно», «тревожный»). */
export const MOOD_WORDS = Object.freeze({
  calm: ['спокой', 'уют', 'умиротвор', 'тих', 'расслаб', 'мягк', 'релакс'],
  happy: ['радост', 'весел', 'счастл', 'бодр', 'светл', 'позитив', 'празд', 'танц'],
  love: ['нежн', 'любов', 'влюбл', 'романт', 'тепл', 'ласк'],
  shy: ['смущ', 'застенч', 'нежн', 'робк'],
  smirk: ['игрив', 'ехидн', 'дерз', 'флирт', 'озорн', 'насмешл'],
  angry: ['гнев', 'злост', 'злой', 'злая', 'ярост', 'агресс', 'бой', 'драк', 'погон', 'напор', 'тяжел'],
  sad: ['груст', 'печал', 'тоск', 'меланхол', 'слез', 'одиноч', 'пораж', 'прощан'],
  scared: ['страх', 'ужас', 'тревог', 'тревож', 'жут', 'паник', 'беспокой', 'хоррор'],
  jealous: ['ревн', 'обид', 'ревност'],
  tense: ['напряж', 'тревог', 'тревож', 'ожидан', 'саспенс', 'опасн', 'погон', 'интриг'],
  aroused: ['страст', 'интим', 'горяч', 'эротич', 'близост', 'чувств', 'влечен'],
  tired: ['уста', 'сон', 'вялост', 'колыбел', 'ночн', 'дремот'],
});

/** The weather's own contribution: a kind of weather leans the scene a little toward these moods. */
const WEATHER_LEAN = Object.freeze({ rain: ['sad', 'calm'], storm: ['tense', 'scared'], snow: ['calm', 'love'], fog: ['scared', 'tense'], sunny: ['happy'], clear: ['happy', 'calm'], heat: ['aroused', 'tired'] });

const lower = text => String(text ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
/** The first letters of a label: «грустит» → «груст» (enough to meet «грусть», «грустная»). */
const stemOf = word => lower(word).replace(/[^а-яa-z]/g, '').slice(0, Math.max(4, Math.min(6, word.length - 2)));

/**
 * The mood of the scene: [{ id, label, weight }], the strongest first.
 * moods: { name: { mood } } as the chat keeps them; present: names of the heroes on stage (empty = everyone known);
 * list: the moods in use (ready ones and the user's own), time: 'HH:MM' or text with a clock in it; weather: a kind of weather.
 */
export function sceneMoods({ moods = {}, present = [], list = [], weather = '', time = '' } = {}) {
  const known = new Map(list.map(item => [item.id, item]));
  const names = new Set(present.map(lower));
  const weights = new Map();
  const add = (id, weight) => { if (known.has(id)) weights.set(id, (weights.get(id) ?? 0) + weight); };
  for (const [name, value] of Object.entries(moods)) {
    if (names.size && !names.has(lower(name))) continue;
    add(value?.mood, 3);
  }
  for (const id of WEATHER_LEAN[weather] ?? []) add(id, 1);
  const hour = /(\d{1,2}):\d{2}/.exec(String(time ?? ''));
  if (hour) {
    const value = Number(hour[1]);
    if (value >= 23 || value < 5) add('tired', 1);
  }
  return [...weights].map(([id, weight]) => ({ id, label: known.get(id).label, weight })).sort((left, right) => right.weight - left.weight);
}

/** Does a link's text hold a word of this mood? The hit of the mood's own name counts more than a word of the same family. */
function hits(text, mood) {
  const stems = [...(MOOD_WORDS[mood.id] ?? []), stemOf(mood.label)].filter(Boolean);
  const own = stemOf(mood.label);
  let score = 0;
  for (const stem of new Set(stems)) if (text.includes(stem)) score += stem === own ? 2 : 1;
  return score;
}

/**
 * The link that suits the scene best: { item, mood, score } or null. A link's own field «для какого настроения» counts twice as much as its
 * title and note. `dismissed` — ids the user waved away in this scene; a playing link is not offered again.
 */
export function suggestMedia(library, scene, { dismissed = [], playing = '' } = {}) {
  if (!scene?.length) return null;
  const skip = new Set([...dismissed, playing].filter(Boolean));
  let best = null;
  for (const item of normalizeMedia(library).items) {
    if (skip.has(item.id)) continue;
    const own = lower(item.mood);
    const other = lower(`${item.title} ${item.note}`);
    for (const mood of scene) {
      const score = (hits(own, mood) * 2 + hits(other, mood)) * mood.weight + (item.pinned ? 0.5 : 0);
      if (score >= 2 && (!best || score > best.score)) best = { item, mood, score };
    }
  }
  return best;
}
