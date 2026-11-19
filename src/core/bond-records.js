/**
 * Records between characters, in the library: a memory they share, a tension between them, a headcanon about how they are with each other.
 * One kind of record with a type, not three separate lists. A record is tied to cards of the library (the persona's card too), so it
 * belongs to the characters themselves and works in every chat, whatever the characters are called there.
 *
 * It goes out when at least one of the characters it is tied to is on stage (the others of a group may be away: the ones who are here
 * must still remember it). The persona alone does not count: she is always in the scene. Only the people named in a line know it.
 * Stored in the library: library.bonds = [{ id, type, text, cardIds[], off?, intensity? (1–5), pinned? }].
 * A pinned record always goes (past the size limit); the rest go strongest first.
 */
import { uniqueId } from './ids.js';
import { relativeScores } from './semantic.js';

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
      cardIds: ids(item.cardIds, BOND_LIMITS.people),
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
 * The records that go out now: not switched off, with at least one of the cards they are tied to on stage.
 * `presentCardIds` = the library cards of everyone on stage; `personaCardId` = the persona's card, which alone does not bring a record.
 */
export function selectBonds(bonds, { presentCardIds = [], knownCardIds = null, personaCardId = '' } = {}) {
  const here = new Set(presentCardIds);
  const known = knownCardIds ? new Set(knownCardIds) : null;
  return cleanBonds(bonds).filter(record => {
    if (record.off) return false;
    const tied = known ? record.cardIds.filter(id => known.has(id)) : record.cardIds;
    if (!tied.length) return false;
    const others = tied.filter(id => id !== personaCardId);
    return (others.length ? others : tied).some(id => here.has(id));
  });
}

const RULES = Object.freeze([
  'These are facts between the characters named in each line. Those named know them as written and behave consistently with them in every scene, even when the others of the group are away.',
  'Only the people named in a line know it. Whoever else is in the scene was not part of it: they do not know it and do not refer to it as if they had been there.',
  'memory: something they went through together; they remember it, but do not have to bring it up. tension: something unresolved between them; show it in small things, never solve it by yourself. headcanon: a stable habit or fact about the two of them; treat it as always true.',
  'Never write the words, thoughts or actions of the persona because of these lines.',
]);

/** The wrapped block, or '' when there is nothing to say. `cardNames` = Map(cardId → name). */
export function buildBondsPrompt(bonds, { presentCardIds = [], personaCardId = '', cardNames = new Map(), maxCharacters = BOND_LIMITS.promptCharacters, similarity = null, semanticLimit = 0 } = {}) {
  // Pinned first (they are kept whatever the size), then the strongest; with meaning (`similarity(record)` → closeness to the scene, embeddings)
  // the record that answers the last posts counts about as much as a step of strength.
  const fits = selectBonds(bonds, { presentCardIds, personaCardId, knownCardIds: [...cardNames.keys()] });
  const near = similarity ? relativeScores(fits, similarity) : () => null;
  // `semanticLimit`: how many unpinned records stay, the closest to the scene by meaning (0 = all that fit the budget).
  const limit = Math.max(0, Math.floor(Number(semanticLimit) || 0));
  const loose = fits.filter(record => !record.pinned);
  const stay = similarity && limit && loose.length > limit && loose.some(record => near(record) != null)
    ? new Set([...loose].sort((left, right) => (near(right) ?? -1) - (near(left) ?? -1) || (right.intensity ?? 3) - (left.intensity ?? 3)).slice(0, limit)) : null;
  const weight = record => (record.intensity ?? 3) + 3 * (near(record) ?? 0);
  const chosen = fits
    .filter(record => !stay || record.pinned || stay.has(record))
    .map((record, at) => ({ record, at }))
    .sort((left, right) => Number(Boolean(right.record.pinned)) - Number(Boolean(left.record.pinned)) || weight(right.record) - weight(left.record) || left.at - right.at)
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
