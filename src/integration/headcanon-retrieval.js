/**
 * Which headcanons fit the scene that is about to be generated.
 *
 * Without embeddings a fact is relevant when someone who knows it (its group, or those it says know it) appears in the
 * last messages — one of them is enough, so a group's habit still reaches the two who are there (the persona always counts as present,
 * so she alone does not make it relevant). With embeddings the
 * semantic similarity between the scene and each fact ranks them, and pair
 * presence only adds a small bonus — see semanticScorer.
 */
import { matchingKeys } from './growth.js';

/** Text of the last messages (newest last), trimmed to a budget from the end. */
export function recentSceneText(chat, count = 3, maxCharacters = 3000) {
  const messages = (chat ?? []).filter(message => message && !message.is_system && String(message.mes ?? '').trim()).slice(-count);
  const text = messages.map(message => String(message.mes)).join('\n\n');
  return text.length > maxCharacters ? text.slice(-maxCharacters) : text;
}

/** Entity IDs mentioned in the text by name, alias or Russian word stem. */
export function mentionedEntities(state, text) {
  const lower = String(text ?? '').toLocaleLowerCase('ru-RU');
  const found = new Set();
  // A word two characters share (a surname) names whoever of them is on stage; with none on stage it names nobody.
  const everyone = Object.values(state.entities ?? {});
  const owners = new Map();
  for (const entity of everyone) for (const key of matchingKeys(entity)) owners.set(key, (owners.get(key) ?? 0) + 1);
  const here = new Set(state.knowledge?.scene?.presentIds ?? []);
  for (const entity of everyone) {
    if (matchingKeys(entity).some(key => lower.includes(key) && ((owners.get(key) ?? 0) < 2 || here.has(entity.id)))) found.add(entity.id);
  }
  const personaId = state.ui?.personaId || '';
  if (personaId && state.entities?.[personaId]) found.add(personaId);
  return found;
}

/** How many of those who know a fact are here, and the share: { here, total }. The persona is left out unless she is the only one. */
export function knowersHere(state, item, pair, present) {
  const personaId = state.ui?.personaId || '';
  const known = [...new Set([...pair.ids, ...(item.knownBy ?? [])])];
  const others = known.filter(id => id !== personaId);
  const counted = others.length ? others : known;
  return { here: counted.filter(id => present.has(id)).length, total: counted.length };
}

/** Fallback: one of those who know it is here → relevant, the more of them the better; newer facts first. */
export function mentionScorer(state, sceneText) {
  const present = mentionedEntities(state, sceneText);
  return (item, pair) => {
    const { here, total } = knowersHere(state, item, pair, present);
    if (!here) return 0;
    const time = Date.parse(item.createdAt ?? '') || 0;
    return 1 + here / total + time / 1e15;
  };
}

/**
 * Semantic ranking. similarity(item) is the cosine similarity of the fact to the
 * scene (or null when its vector is missing). e5-style models put almost every
 * pair of texts near 0.8 and relevant ones only ~0.05 higher, so presence of
 * both members adds just a nudge (PRESENCE_BONUS), never more than meaning.
 */
const PRESENCE_BONUS = 0.03;

export function semanticScorer(state, sceneText, similarity, threshold = 0) {
  const present = mentionedEntities(state, sceneText);
  return (item, pair) => {
    const value = similarity(item);
    if (value == null || value < threshold) return 0;
    // Keep scores positive: selectHeadcanons skips anything <= 0.
    const { here, total } = knowersHere(state, item, pair, present);
    return Math.max(1e-6, value + PRESENCE_BONUS * (here / total));
  };
}
