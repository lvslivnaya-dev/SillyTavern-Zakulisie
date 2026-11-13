/**
 * The card of a persona: what the others can see in her, and the records about her that depend on who is on stage and on the AU
 * (the alternate universe) the chat plays.
 *
 * A persona card is a card of the character library (core/location-library.js) marked `persona: true`: the same folders, gallery,
 * editor, names with their case forms, closet and translation. Its sections are those of the persona template (what shows from
 * outside: Visual, Voice, Public Info), and it has what a character's card has not:
 *   records[] = [record]   record = { id, text, about[], knows[], aboutIds[], knowsIds[], au[], secret, off }
 *            about, knows — the characters the record concerns / who know it, as names (a name or a nickname typed in);
 *            aboutIds, knowsIds — the same, tied straight to cards of the library (a card is found in the chat by whoever it is attached to);
 *            none of the four = about her for everyone;
 *            au — the AU it belongs to (empty = every AU); secret — known only to about + knows.
 * The list of AU and the switch «send the persona» are in the extension settings:
 *   settings = { version: 1, enabled, au: [{ id, name }], cards: [legacy] }   (a chat says which AU are on: state.ui.au)
 *
 * What goes out (buildPersonaPrompt): the sections, and the records whose AU is on in the chat and whose people are on stage
 * (any of them — so that the one who knows is never left without what he knows). Pure: no DOM, no SillyTavern.
 */
import { normalizeAlias, uniqueId } from './ids.js';
import { filledSections, sectionText } from './character-cards.js';

export const PERSONA_VERSION = 1;
export const PERSONA_LIMITS = Object.freeze({ records: 80, au: 30, name: 80, text: 700, people: 12, promptCharacters: 3500 });
export const PERSONA_TAG = 'PERSONA';

const clone = value => JSON.parse(JSON.stringify(value));
const line = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const prose = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const unique = list => [...new Set(list)];

/** The settings: the switch, the list of AU. `cards` is what an earlier version kept here; it moves to the library (migratePersonaCards). */
export function emptyPersonaCards() {
  return { version: PERSONA_VERSION, enabled: true, au: [], cards: [] };
}

/** «Рэн, Мику» → ['Рэн', 'Мику']: the names typed in one field. */
export function splitPeople(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,;\n]/);
  return unique(list.map(item => line(item, PERSONA_LIMITS.name)).filter(Boolean)).slice(0, PERSONA_LIMITS.people);
}

const cardIds = value => unique((Array.isArray(value) ? value : []).map(id => line(id, 80)).filter(Boolean)).slice(0, PERSONA_LIMITS.people);

/** A tidy list of records (a record without text is dropped; ids stay unique). */
export function cleanRecords(raw) {
  const seen = new Set();
  const records = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const text = prose(item?.text, PERSONA_LIMITS.text);
    if (!text) continue;
    let id = typeof item.id === 'string' && item.id ? item.id : '';
    if (!id || seen.has(id)) id = uniqueId('prec');
    seen.add(id);
    records.push({
      id, text,
      about: splitPeople(item.about),
      knows: splitPeople(item.knows),
      aboutIds: cardIds(item.aboutIds),
      knowsIds: cardIds(item.knowsIds),
      au: unique((Array.isArray(item.au) ? item.au : []).map(value => line(value, 80)).filter(Boolean)),
      secret: item.secret === true,
      off: item.off === true,
    });
    if (records.length >= PERSONA_LIMITS.records) break;
  }
  return records;
}

/** Tolerant: anything broken becomes an empty settings object. */
export function normalizePersonaCards(raw) {
  if (!raw || typeof raw !== 'object') return emptyPersonaCards();
  const au = [];
  const auIds = new Set();
  for (const item of Array.isArray(raw.au) ? raw.au : []) {
    const name = line(item?.name, PERSONA_LIMITS.name);
    const id = typeof item?.id === 'string' && item.id ? item.id : '';
    if (!name || !id || auIds.has(id) || au.length >= PERSONA_LIMITS.au) continue;
    auIds.add(id);
    au.push({ id, name });
  }
  return { version: PERSONA_VERSION, enabled: raw.enabled !== false, au, cards: Array.isArray(raw.cards) ? raw.cards : [] };
}

export function addAu(library, name) {
  const next = clone(normalizePersonaCards(library));
  const clean = line(name, PERSONA_LIMITS.name);
  if (!clean) throw new Error('У АУ должно быть название.');
  if (next.au.some(item => normalizeAlias(item.name) === normalizeAlias(clean))) throw new Error('Такое АУ уже есть.');
  if (next.au.length >= PERSONA_LIMITS.au) throw new Error(`АУ не больше ${PERSONA_LIMITS.au}.`);
  next.au.push({ id: uniqueId('au'), name: clean });
  return next;
}

/** The AU is dropped from the list. (Records that named it keep the id: it matches nothing, so they simply wait.) */
export function removeAu(library, id) {
  const next = clone(normalizePersonaCards(library));
  next.au = next.au.filter(item => item.id !== id);
  return next;
}

/**
 * The persona card among the cards of the library: the one the chat chose (`id`), else by the SillyTavern persona (`avatar`),
 * else by her name or an alias of it.
 */
export function findPersonaCard(cards, { id = '', avatar = '', names = [] } = {}) {
  const personas = (cards ?? []).filter(card => card?.persona);
  const chosen = id ? personas.find(card => card.id === id) : null;
  if (chosen) return chosen;
  const byAvatar = avatar ? personas.find(card => card.avatar === avatar) : null;
  if (byAvatar) return byAvatar;
  const wanted = new Set(names.filter(Boolean).map(normalizeAlias));
  return personas.find(card => [card.name, ...(card.aliases ?? [])].some(name => wanted.has(normalizeAlias(name)))) ?? null;
}

/**
 * The cards an earlier version kept in the settings → the fields of persona cards of the library, [{ name, aliases, avatar, words, sections, records }].
 */
export function migratePersonaCards(settingsCards) {
  const list = [];
  for (const old of Array.isArray(settingsCards) ? settingsCards : []) {
    const name = line(old?.name, PERSONA_LIMITS.name);
    if (!name) continue;
    const sections = [['visual', 'Visual', old.looks], ['voice', 'Voice', old.voice]].filter(([, , text]) => String(text ?? '').trim())
      .map(([kind, title, text]) => ({ kind, title, text }));
    list.push({
      name, aliases: splitPeople(old.aliases), avatar: line(old.avatar, 200), words: Array.isArray(old.words) ? old.words : undefined,
      sections, records: cleanRecords(old.records),
    });
  }
  return list;
}

/**
 * The records that go out now: not switched off, of an AU that is on (or of none), and either for everyone
 * (nobody named) or with any of the people it names on stage. `present` = names and aliases of those on stage,
 * `presentCardIds` = the library cards attached to them (a record tied to a card finds its character whatever the name is).
 */
export function selectPersonaRecords(card, { present = [], activeAu = [], presentCardIds = [] } = {}) {
  const here = new Set(present.filter(Boolean).map(normalizeAlias));
  const cardsHere = new Set(presentCardIds);
  const on = new Set(activeAu);
  return (card?.records ?? []).filter(record => {
    if (record.off) return false;
    if (record.au.length && !record.au.some(id => on.has(id))) return false;
    const names = unique([...record.about, ...record.knows]);
    const ids = unique([...(record.aboutIds ?? []), ...(record.knowsIds ?? [])]);
    return (!names.length && !ids.length) || names.some(name => here.has(normalizeAlias(name))) || ids.some(id => cardsHere.has(id));
  });
}

const RULES = Object.freeze([
  'This is only what the others can see or know about the persona. Never write her words, thoughts or actions.',
  'A record marked secret is known only to the people listed in it: nobody else knows it, hints at it or reacts to it.',
  'Whoever is named in a record knows it as written, so they behave consistently with it in every scene.',
]);

/** The wrapped block, or '' when there is nothing to say. */
export function buildPersonaPrompt(card, { present = [], activeAu = [], presentCardIds = [], cardNames = new Map(), maxCharacters = PERSONA_LIMITS.promptCharacters } = {}) {
  if (!card) return '';
  const lines = [];
  const auOn = new Set(activeAu);
  for (const section of filledSections(card).filter(item => !item.au?.length || item.au.some(id => auOn.has(id)))) {
    const text = sectionText(section).replace(/\s*\n\s*/g, ' ');
    const label = section.kind === 'visual' ? 'looks' : section.kind === 'voice' ? 'voice' : `info[${section.title}]`;
    lines.push(`${label}: ${text}`);
  }
  for (const record of selectPersonaRecords(card, { present, activeAu, presentCardIds })) {
    const label = ids => (ids ?? []).map(id => cardNames.get(id)).filter(Boolean);
    const about = unique([...record.about, ...label(record.aboutIds)]);
    const people = unique([...about, ...record.knows, ...label(record.knowsIds)]);
    const text = record.text.replace(/\s*\n\s*/g, ' ');
    lines.push(record.secret
      ? `secret[known only to ${people.join(', ') || 'her alone'}]: ${text}`
      : `note${about.length ? `[${about.join(', ')}]` : ''}: ${text}`);
  }
  if (!lines.length) return '';
  const head = `[${PERSONA_TAG} — ${card.name}]`;
  const tail = `Rules:\n${RULES.map(rule => `- ${rule}`).join('\n')}\n[/${PERSONA_TAG}]`;
  let room = Math.max(300, maxCharacters) - head.length - tail.length - 2;
  const kept = [];
  for (const text of lines) {
    if (text.length + 1 > room) continue;
    room -= text.length + 1;
    kept.push(text);
  }
  return kept.length ? [head, ...kept, tail].join('\n') : '';
}
