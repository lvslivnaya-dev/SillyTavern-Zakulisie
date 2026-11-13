/**
 * Records between characters, in the library: a memory they share, a tension between them, a headcanon about how they are with each other.
 * One kind of record with a type, not three separate lists. A record is tied to cards of the library (the persona's card too), so it
 * belongs to the characters themselves and works in every chat, whatever the characters are called there; it may name the AU it is for.
 *
 * It goes out when every character it is tied to is on stage and its AU is on (a record with no AU is for every AU).
 * Stored in the library: library.bonds = [{ id, type, text, cardIds[], au[], off?, intensity? (1–5), pinned? }].
 * A pinned record always goes (past the size limit); the rest go strongest first.
 */
import { uniqueId } from './ids.js';

export const BOND_TYPES = Object.freeze({ memory: 'Воспоминание', tension: 'Напряжение', headcanon: 'Хедканон' });
export const BOND_LIMITS = Object.freeze({ records: 600, text: 600, people: 8, promptCharacters: 3000 });
export const BOND_TAG = 'BONDS';

const clone = value => JSON.parse(JSON.stringify(value));
const prose = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const unique = list => [...new Set(list)];
const ids = (value, max) => unique((Array.isArray(value) ? value : []).map(id => String(id ?? '').trim().slice(0, 80)).filter(Boolean)).slice(0, max);

/** A tidy list: a record with no text is dropped, an unknown type becomes a headcanon, ids stay unique. */
export function cleanBonds(raw) {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const text = prose(item?.text, BOND_LIMITS.text);
    if (!text) continue;
    let id = typeof item.id === 'string' && item.id ? item.id : '';
    if (!id || seen.has(id)) id = uniqueId('bond');
    seen.add(id);
    list.push({
      id, type: Object.hasOwn(BOND_TYPES, item.type) ? item.type : 'headcanon', text,
      cardIds: ids(item.cardIds, BOND_LIMITS.people), au: ids(item.au, 30),
      ...(item.off === true ? { off: true } : {}),
      ...(Number.isFinite(Number(item.intensity)) && item.intensity !== '' && item.intensity != null ? { intensity: Math.max(1, Math.min(5, Math.round(Number(item.intensity)))) } : {}),
      ...(item.pinned === true ? { pinned: true } : {}),
    });
    if (list.length >= BOND_LIMITS.records) break;
  }
  return list;
}

/** The library with the record added (its fields are cleaned; at least one card is needed). */
export function addBond(library, fields = {}) {
  const [bond] = cleanBonds([{ ...fields, id: '' }]);
  if (!bond) throw new Error('У записи должен быть текст.');
  if (!bond.cardIds.length) throw new Error('Привяжите запись хотя бы к одному герою.');
  const next = clone(library);
  next.bonds = cleanBonds(next.bonds);
  if (next.bonds.length >= BOND_LIMITS.records) throw new RangeError(`Записей не больше ${BOND_LIMITS.records}.`);
  next.bonds.push(bond);
  return { library: next, bond };
}

export function updateBond(library, id, changes = {}) {
  const next = clone(library);
  next.bonds = cleanBonds(next.bonds);
  const at = next.bonds.findIndex(item => item.id === id);
  if (at < 0) throw new RangeError('Такой записи нет.');
  const [bond] = cleanBonds([{ ...next.bonds[at], ...changes, id }]);
  if (!bond) throw new Error('У записи должен быть текст.');
  if (!bond.cardIds.length) throw new Error('Привяжите запись хотя бы к одному герою.');
  next.bonds[at] = bond;
  return next;
}

export function removeBond(library, id) {
  const next = clone(library);
  next.bonds = cleanBonds(next.bonds).filter(item => item.id !== id);
  return next;
}

/** Records whose card is gone lose that tie; one left with no card at all is dropped. */
export function pruneBonds(library) {
  const have = new Set((library.characters ?? []).map(card => card.id));
  const bonds = cleanBonds(library.bonds).map(item => ({ ...item, cardIds: item.cardIds.filter(id => have.has(id)) })).filter(item => item.cardIds.length);
  return bonds.length === (library.bonds ?? []).length && bonds.every((item, at) => item.cardIds.length === library.bonds[at].cardIds.length) ? library : { ...library, bonds };
}

/**
 * The records that go out now: not switched off, of an AU that is on (or of none), with every card they are tied to on stage.
 * `presentCardIds` = the library cards of everyone on stage (the persona's included), `activeAu` = the AU ids on in this chat.
 */
export function selectBonds(bonds, { presentCardIds = [], activeAu = [], knownCardIds = null } = {}) {
  const here = new Set(presentCardIds);
  const on = new Set(activeAu);
  const known = knownCardIds ? new Set(knownCardIds) : null;
  return cleanBonds(bonds).filter(record => {
    if (record.off) return false;
    if (record.au.length && !record.au.some(id => on.has(id))) return false;
    const tied = known ? record.cardIds.filter(id => known.has(id)) : record.cardIds;
    return tied.length > 0 && tied.every(id => here.has(id));
  });
}

const RULES = Object.freeze([
  'These are facts between the characters named in each line. Both (all) of them know them as written, and behave consistently with them in every scene.',
  'memory: something they went through together; they remember it, but do not have to bring it up. tension: something unresolved between them; show it in small things, never solve it by yourself. headcanon: a stable habit or fact about the two of them; treat it as always true.',
  'Never write the words, thoughts or actions of the persona because of these lines.',
]);

/** The wrapped block, or '' when there is nothing to say. `cardNames` = Map(cardId → name). */
export function buildBondsPrompt(bonds, { presentCardIds = [], activeAu = [], cardNames = new Map(), maxCharacters = BOND_LIMITS.promptCharacters } = {}) {
  // Pinned first (they are kept whatever the size), then the strongest.
  const chosen = selectBonds(bonds, { presentCardIds, activeAu, knownCardIds: [...cardNames.keys()] })
    .map((record, at) => ({ record, at }))
    .sort((left, right) => Number(Boolean(right.record.pinned)) - Number(Boolean(left.record.pinned)) || (right.record.intensity ?? 3) - (left.record.intensity ?? 3) || left.at - right.at)
    .map(item => item.record);
  const lines = chosen.map(record => {
    const people = record.cardIds.map(id => cardNames.get(id)).filter(Boolean).join(', ');
    return { pinned: Boolean(record.pinned), text: `${record.type}[${people}]: ${record.text.replace(/\s*\n\s*/g, ' ')}` };
  });
  if (!lines.length) return '';
  const head = `[${BOND_TAG} — what ties them]`;
  const tail = `Rules:\n${RULES.map(rule => `- ${rule}`).join('\n')}\n[/${BOND_TAG}]`;
  let room = Math.max(300, maxCharacters) - head.length - tail.length - 2;
  const kept = [];
  for (const { pinned, text } of lines) {
    if (!pinned && text.length + 1 > room) continue;
    room -= text.length + 1;
    kept.push(text);
  }
  return kept.length ? [head, ...kept, tail].join('\n') : '';
}
