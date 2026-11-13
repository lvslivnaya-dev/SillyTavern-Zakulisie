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
export function entityCandidates(state, card) {
  const personaId = state.ui?.personaId || '';
  const entities = Object.values(state.entities ?? {}).filter(entity => entity.id !== personaId);
  const own = normalizeAlias(card.name ?? '');
  const aliases = new Set((card.aliases ?? []).map(normalizeAlias));
  return entities.filter(entity => entityNames(entity).some(name => normalizeAlias(name) === own) || aliases.has(normalizeAlias(entity.name ?? ''))).map(entity => entity.id);
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
      const found = entityCandidates(next, card);
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
      if (extra.length) {
        const updated = createEntity(entity.name, {
          id: entity.id, aliases: [...(entity.aliases ?? []), ...extra].slice(0, ALIASES_MAX), avatar: entity.avatar, sourceId: entity.sourceId,
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
    next = { ...next, ui: { ...(next.ui ?? {}), cards } };
    linked.push({ cardId, entityId, created });
  }
  return { state: next, linked, skipped, replaced };
}

/** Switch cards off in this chat: the attachment goes, the characters stay. */
export function unlinkCards(state, cardIds) {
  const cards = { ...(state.ui?.cards ?? {}) };
  let changed = false;
  for (const cardId of cardIds ?? []) if (cardId in cards) { delete cards[cardId]; changed = true; }
  return changed ? { ...state, ui: { ...(state.ui ?? {}), cards } } : state;
}

/** A chat just opened: attachments to cards that left the library or to characters that left the chat are let go. */
export function syncCardLinks(state, library) {
  const known = new Set((library?.characters ?? []).map(card => card.id));
  const cards = Object.fromEntries(Object.entries(state.ui?.cards ?? {}).filter(([cardId, entityId]) => known.has(cardId) && state.entities?.[entityId]));
  return Object.keys(cards).length === Object.keys(state.ui?.cards ?? {}).length ? state : { ...state, ui: { ...(state.ui ?? {}), cards } };
}
