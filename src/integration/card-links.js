/**
 * Library character cards meet a chat — the same idea as item-links.js, with one difference:
 * a card does not make a record of its own in the chat, it is attached to a character of the chat.
 *
 * `state.ui.cards = { [cardId]: entityId }` says which card tells about which character. Switching
 * a card on finds the character of that name (or an alias of it) or creates one; switching it off
 * only removes the attachment (the character and its feelings, knowledge and clothes stay).
 * The persona never has a card here: she keeps her own page.
 *
 * Not journaled: it is how the chat reads the library, so a swipe does not undo it.
 */
import { applyOperation, createEntity, createOperation, normalizeAlias, uniqueId } from '../core/index.js';

const ALIASES_MAX = 30;

function entityNames(entity) {
  return [entity.name, ...(entity.aliases ?? [])].filter(Boolean);
}

function cardNames(card) {
  return [card.name, ...(card.aliases ?? [])].filter(Boolean);
}

/** cardId → entityId for every card attached in this chat (to a character that still exists and is not the persona). */
export function cardLinks(state) {
  const map = new Map();
  const personaId = state.ui?.personaId || '';
  for (const [cardId, entityId] of Object.entries(state.ui?.cards ?? {})) {
    if (state.entities?.[entityId] && entityId !== personaId) map.set(cardId, entityId);
  }
  return map;
}

/** entityId → the card that tells about them, for the cards that still exist in the library. */
export function cardsByEntity(state, library) {
  const byId = new Map((library?.characters ?? []).map(card => [card.id, card]));
  const map = new Map();
  for (const [cardId, entityId] of cardLinks(state)) {
    const card = byId.get(cardId);
    if (card && !map.has(entityId)) map.set(entityId, card);
  }
  return map;
}

/**
 * The closets of the characters of the chat: entityId → { cardIds, lookIds } of the wardrobe pieces and sets each may use. A piece marked
 * personal («только у него») in one card's closet is taken out of everyone else's, and so is a set that holds such a piece.
 * `wardrobe` = { looks } (to see what the sets hold).
 */
export function closetsByEntity(state, library, wardrobe, personalPieces) {
  const owners = personalPieces(library);
  const looks = new Map((wardrobe?.looks ?? []).map(look => [look.id, look]));
  const closets = {};
  for (const [entityId, card] of cardsByEntity(state, library)) {
    if (!card.closet) continue;
    const mine = id => !owners.has(id) || owners.get(id) === card.id;
    const cardIds = card.closet.cardIds.filter(mine);
    const lookIds = card.closet.lookIds.filter(id => (looks.get(id)?.cardIds ?? []).every(mine));
    if (cardIds.length || lookIds.length) closets[entityId] = { cardIds, lookIds };
  }
  return closets;
}

/**
 * For recognition in the posts: entityId → the cases of the names of the character's card, from the name library entry the card is tied to
 * (`names` = the library). Characters whose card has no entry are not in the map.
 */
export function cardNameForms(state, library, names, recognitionForms) {
  const forms = new Map();
  for (const [entityId, card] of cardsByEntity(state, library)) {
    const entry = card.nameId ? (names?.entries ?? []).find(item => item.id === card.nameId) : null;
    if (entry && !entry.off) forms.set(entityId, recognitionForms(entry));
  }
  return forms;
}

/**
 * The characters of the chat the card is about (a sound is no proof: nobody is guessed): the name of the card is a name or an alias of the
 * character, or the character's own name is one of the aliases of the card. Two aliases that merely coincide
 * (a family name, a shared nickname) tell nothing: otherwise a whole folder of relatives collapsed into one character.
 */
export function entityCandidates(state, card, foreignNames = new Set()) {
  const personaId = state.ui?.personaId || '';
  const own0 = normalizeAlias(card.name ?? '');
  const aliasKeys = new Set((card.aliases ?? []).map(normalizeAlias));
  // a character already named as another card (and not as this one, nor by its alias) is that card's character, whatever aliases got stuck to them earlier
  const entities = Object.values(state.entities ?? {}).filter(entity => {
    if (entity.id === personaId) return false;
    const key = normalizeAlias(entity.name ?? '');
    return key === own0 || aliasKeys.has(key) || !foreignNames.has(key);
  });
  const own = normalizeAlias(card.name ?? '');
  return entities.filter(entity => entityNames(entity).some(name => normalizeAlias(name) === own) || aliasKeys.has(normalizeAlias(entity.name ?? ''))).map(entity => entity.id);
}

/** The character of the chat a card is about: the one whose name is exactly the card's ('' if there is none or several). */
export function entityForCard(state, card) {
  const found = entityCandidates(state, card);
  return found.length === 1 ? found[0] : '';
}

function meta(reason) {
  return { id: uniqueId('card-link'), reason, timestamp: new Date().toISOString() };
}

/**
 * Switch cards on in this chat. Each card goes to the character it is about; a character that is
 * not in the chat yet is added. A card of a character already holding another card replaces it
 * (one character, one card).
 * `pick` = { cardId: entityId | '__new' } is the user's own choice: that character (or a new one) whatever the names say.
 * Several characters with the card's name and no choice: the card waits (skipped), nobody is made up.
 * → { state, linked: [{ cardId, entityId, created }], skipped: [{ name, why }], replaced: [{ name, by, entityName }] }
 */
export function linkCards(state, library, cardIds, pick = {}) {
  const byId = new Map((library?.characters ?? []).map(card => [card.id, card]));
  let next = state;
  const linked = [];
  const skipped = [];
  const replaced = [];
  const personaName = state.entities?.[state.ui?.personaId]?.name ?? '';
  const taken = new Map([...cardLinks(state)].map(([cardId, entityId]) => [entityId, cardId]));
  // the names every card of the library is known by: who it belongs to
  const namesOf = new Map();
  const nameKeys = card => [...new Set(cardNames(card).map(normalizeAlias))];
  for (const card of byId.values()) {
    if (card.persona) continue;
    for (const key of nameKeys(card)) namesOf.set(key, [...(namesOf.get(key) ?? []), card.id]);
  }
  for (const cardId of [...new Set(cardIds ?? [])]) {
    const card = byId.get(cardId);
    if (!card || card.persona) continue; // a persona's card is not attached to a character of the chat
    if (personaName && cardNames(card).some(name => normalizeAlias(name) === normalizeAlias(personaName))) {
      skipped.push({ name: card.name, why: 'это персона: для неё есть своя страница' });
      continue;
    }
    let entityId = '';
    const chosen = pick[cardId];
    if (chosen && chosen !== '__new' && next.entities?.[chosen] && chosen !== state.ui?.personaId) entityId = chosen;
    else if (!chosen) {
      const foreign = new Set([...byId.values()].filter(other => !other.persona && other.id !== cardId).map(other => normalizeAlias(other.name ?? '')));
      const found = entityCandidates(next, card, foreign);
      if (found.length > 1) {
        skipped.push({ name: card.name, why: `в чате несколько героев с таким именем (${found.map(id => next.entities[id].name).join(', ')}): выберите нужного в окне карточки` });
        continue;
      }
      entityId = found[0] ?? '';
    }
    let created = false;
    if (entityId) {
      const entity = next.entities[entityId];
      const have = new Set(entityNames(entity).map(normalizeAlias));
      const extra = cardNames(card).filter(name => !have.has(normalizeAlias(name)));
      // names that stuck to this character earlier but belong to other cards only (and not to this one) are let go
      const mine = new Set(nameKeys(card));
      const stuck = alias => { const key = normalizeAlias(alias); return !mine.has(key) && (namesOf.get(key) ?? []).some(id => id !== cardId); };
      const kept = (entity.aliases ?? []).filter(alias => !stuck(alias));
      if (extra.length || kept.length !== (entity.aliases ?? []).length) {
        const updated = createEntity(entity.name, {
          id: entity.id, aliases: [...kept, ...extra].slice(0, ALIASES_MAX), avatar: entity.avatar, sourceId: entity.sourceId,
        });
        next = applyOperation(next, createOperation('entity.upsert', updated, meta(`Карточка «${card.name}»: имена добавлены`)));
      }
    } else {
      const entity = createEntity(card.name, { aliases: (card.aliases ?? []).slice(0, ALIASES_MAX) });
      entityId = entity.id;
      created = true;
      next = applyOperation(next, createOperation('entity.upsert', entity, meta(`Карточка «${card.name}»: персонаж добавлен`)));
    }
    // One card per character: the one that was attached before is let go.
    const cards = { ...(next.ui?.cards ?? {}) };
    if (taken.has(entityId) && taken.get(entityId) !== cardId) {
      const old = byId.get(taken.get(entityId));
      replaced.push({ name: old?.name ?? '', by: card.name, entityName: next.entities?.[entityId]?.name ?? '' });
      delete cards[taken.get(entityId)];
    }
    cards[cardId] = entityId;
    taken.set(entityId, cardId);
    // A hero that appeared only because of the card is remembered: taking the card off takes him off the stage too (when nothing happened to him).
    const made = created ? [...new Set([...(next.ui?.cardMade ?? []), entityId])] : (next.ui?.cardMade ?? []);
    next = { ...next, ui: { ...(next.ui ?? {}), cards, ...(made.length ? { cardMade: made } : {}) } };
    linked.push({ cardId, entityId, created });
  }
  return { state: next, linked, skipped, replaced };
}

/** Switch cards off in this chat: the attachment goes, the characters stay. */
export function unlinkCards(state, cardIds, library = null) {
  const cardOf = new Map((library?.characters ?? []).map(card => [card.id, card]));
  const cards = { ...(state.ui?.cards ?? {}) };
  let changed = false;
  let next = state;
  let made = [...(state.ui?.cardMade ?? [])];
  for (const cardId of cardIds ?? []) {
    if (!(cardId in cards)) continue;
    const entityId = cards[cardId];
    delete cards[cardId];
    changed = true;
    // The hero was made by this card and has no history (no lines, no events): he leaves the chat with it; otherwise he stays.
    // Links made before the mark existed have none: a hero with the card's own name that did not come from a tavern character counts as made by it.
    const entity = next.entities?.[entityId];
    const old = entity && !entity.sourceId && cardOf.has(cardId) && normalizeAlias(entity.name) === normalizeAlias(cardOf.get(cardId).name);
    if ((made.includes(entityId) || old) && entity && entityId !== next.ui?.personaId) {
      const used = Object.values(next.relationships ?? {}).some(relation => relation.from === entityId || relation.to === entityId)
        || (next.knowledge?.events ?? []).some(event => (event.witnessIds ?? []).includes(entityId));
      if (!used) next = applyOperation(next, createOperation('entity.remove', { entityId }, meta('Карточку сняли: персонаж без истории убран')));
      made = made.filter(id => id !== entityId);
    }
  }
  if (!changed) return state;
  const ui = { ...(next.ui ?? {}), cards };
  if (made.length) ui.cardMade = made; else delete ui.cardMade;
  return { ...next, ui };
}

/** A chat just opened: attachments to cards that left the library or to characters that left the chat are let go. */
export function syncCardLinks(state, library) {
  const known = new Set((library?.characters ?? []).map(card => card.id));
  const cards = Object.fromEntries(Object.entries(state.ui?.cards ?? {}).filter(([cardId, entityId]) => known.has(cardId) && state.entities?.[entityId]));
  return Object.keys(cards).length === Object.keys(state.ui?.cards ?? {}).length ? state : { ...state, ui: { ...(state.ui ?? {}), cards } };
}

/**
 * A chat opened with the tavern character `avatar` (its narrator): the cards tied to that narrator are switched on, ONCE per card. The card is
 * then written down in `state.ui.cardsAuto`, so a card the user switched off in this chat does not come back by itself.
 * A card that could not be attached (several heroes with its name) is written down too, so it does not complain at every opening.
 * → { state, linked, skipped, replaced } (state is the same object when nothing was due).
 */
export function autoLinkNarratorCards(state, library, avatar) {
  const key = String(avatar ?? '');
  const done = new Set(state.ui?.cardsAuto ?? []);
  const due = key ? (library?.characters ?? []).filter(card => !card.persona && (card.narrators ?? []).includes(key) && !done.has(card.id)) : [];
  if (!due.length) return { state, linked: [], skipped: [], replaced: [] };
  const result = linkCards(state, library, due.map(card => card.id));
  const cardsAuto = [...new Set([...done, ...due.map(card => card.id)])];
  return { ...result, state: { ...result.state, ui: { ...(result.state.ui ?? {}), cardsAuto } } };
}
