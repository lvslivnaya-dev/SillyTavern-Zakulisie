/**
 * Библиотека чатов: чистая логика без DOM.
 * Чаты из /api/chats/recent собираются по владельцу (персонаж или группа), раскладываются по полкам и страницам.
 * Ключи совпадают с MistraelSL Character Chat Pills, поэтому её закрепления и архив переезжают как есть.
 */

export const PAGE_SIZE = 10;

/** Ключи хранилища MistraelSL Character Chat Pills (localStorage). */
export const LEGACY_KEYS = {
  pinned: 'MistraelSL_CharacterChatPills_pinnedCharacters',
  archived: 'MistraelSL_CharacterChatPills_archivedCharacters',
  archivedChats: 'MistraelSL_CharacterChatPills_archivedChats',
  favoriteChats: 'MistraelSL_CharacterChatPills_favoriteChats',
};

/** Владелец: у персонажа это имя файла аватара, у группы — group:id. */
export const ownerKey = chat => (chat.group ? `group:${chat.group}` : String(chat.avatar ?? ''));
/** Ключ чата: владелец + имя файла в нижнем регистре (как у MistraelSL). */
export const chatKey = (owner, fileName) => `${owner}::${String(fileName ?? '').toLowerCase()}`;
export const chatName = fileName => String(fileName ?? '').replace(/\.jsonl$/i, '');

/** Любая метка времени из таверны (число в секундах или мс, строка с числом, дата) → мс. */
export function toTime(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? (value < 1e12 ? value * 1000 : value) : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return toTime(Number(raw));
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Чаты → карточки владельцев, самые свежие первыми.
 * @param {any[]} recent ответ /api/chats/recent
 * @param {any[]} characters
 * @param {any[]} groups
 * @param {Record<string, string[]>} tagMap теги таверны: аватар персонажа или id группы → id тегов
 */
export function groupChats(recent, characters = [], groups = [], tagMap = {}) {
  const byAvatar = new Map(characters.map(character => [character.avatar, character]));
  const byGroup = new Map(groups.map(group => [group.id, group]));
  const owners = new Map();
  for (const raw of Array.isArray(recent) ? recent : []) {
    if (!raw?.file_name) continue;
    const group = raw.group ? byGroup.get(raw.group) : null;
    const character = !raw.group ? byAvatar.get(raw.avatar) : null;
    if (!group && !character) continue;
    const key = ownerKey(raw);
    let entry = owners.get(key);
    if (!entry) {
      entry = group
        ? { key, kind: 'group', groupId: group.id, avatar: '', name: group.name ?? '', image: group.avatar_url ?? '', tags: (tagMap[group.id] ?? []).map(String), chats: [], last: 0, messages: 0 }
        : { key, kind: 'char', groupId: '', avatar: character.avatar, name: character.name ?? '', image: '', tags: (tagMap[character.avatar] ?? []).map(String), chats: [], last: 0, messages: 0 };
      owners.set(key, entry);
    }
    const chat = { file: raw.file_name, name: chatName(raw.file_name), last: toTime(raw.last_mes), items: Number(raw.chat_items) || 0, mes: String(raw.mes ?? ''), size: raw.file_size ?? '' };
    entry.chats.push(chat);
    entry.messages += chat.items;
    if (chat.last >= entry.last) entry.last = chat.last;
  }
  const list = [...owners.values()];
  for (const entry of list) entry.chats.sort((a, b) => b.last - a.last);
  return list.sort((a, b) => b.last - a.last);
}

/** Закрепления, архив и избранное из настроек в удобном виде. */
export function marks(settings) {
  const lib = settings.library;
  return {
    pinned: new Set(lib.pinned),
    archived: new Set(settings.archive.characters),
    favorite: new Set(lib.favoriteChats),
    archivedChats: new Set(lib.archivedChats),
  };
}

/** Чаты владельца: избранные сверху, потом по свежести; архивные только в архиве. */
export function visibleChats(entry, mark, { archived = false, query = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return entry.chats
    .filter(chat => mark.archivedChats.has(chatKey(entry.key, chat.file)) === archived)
    .filter(chat => !needle || chat.name.toLowerCase().includes(needle) || chat.mes.toLowerCase().includes(needle))
    .sort((a, b) => Number(mark.favorite.has(chatKey(entry.key, b.file))) - Number(mark.favorite.has(chatKey(entry.key, a.file))) || b.last - a.last);
}

/** Чат, который открывает кнопка «Открыть»: самый свежий не из архива. */
export const latestChat = (entry, mark) => entry.chats.find(chat => !mark.archivedChats.has(chatKey(entry.key, chat.file))) ?? null;

const matches = (entry, needle) => !needle
  || entry.name.toLowerCase().includes(needle)
  || entry.chats.some(chat => chat.name.toLowerCase().includes(needle));

/**
 * Карточки одной полки.
 * recent — всё, кроме архива, закреплённые первыми; pinned; frequent — по числу сообщений; archive; tag:<id>.
 */
export function shelfEntries(entries, shelf, mark, query = '') {
  const needle = query.trim().toLowerCase();
  const live = entries.filter(entry => !mark.archived.has(entry.key) && matches(entry, needle));
  if (shelf === 'archive') return entries.filter(entry => mark.archived.has(entry.key) && matches(entry, needle));
  if (shelf === 'pinned') return live.filter(entry => mark.pinned.has(entry.key));
  if (shelf === 'frequent') return live.filter(entry => entry.messages > 0).sort((a, b) => b.messages - a.messages || b.last - a.last);
  if (shelf.startsWith('tag:')) {
    const id = shelf.slice(4);
    return live.filter(entry => entry.tags.includes(id));
  }
  return [...live].sort((a, b) => Number(mark.pinned.has(b.key)) - Number(mark.pinned.has(a.key)) || b.last - a.last);
}

/** Фандомы на полке: теги, которые есть хотя бы у одного не архивного владельца, по алфавиту. */
export function shelfTags(entries, mark, tags = []) {
  const counts = new Map();
  for (const entry of entries) {
    if (mark.archived.has(entry.key)) continue;
    for (const id of entry.tags) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return tags
    .filter(tag => counts.has(String(tag.id)))
    .map(tag => ({ id: String(tag.id), name: String(tag.name ?? ''), count: counts.get(String(tag.id)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Страница списка: номер приводится к допустимому. */
export function paginate(list, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  return { items: list.slice(current * size, current * size + size), page: current, pages };
}

/** Добавляет или убирает значение из массива настроек. Возвращает новое состояние. */
export function toggleIn(array, value, on = !array.includes(value)) {
  const index = array.indexOf(value);
  if (on && index === -1) array.push(value);
  if (!on && index !== -1) array.splice(index, 1);
  return on;
}

/** Переименование чата: переносит отметки избранного и архива на новое имя. */
export function renameMarks(settings, owner, oldFile, newFile) {
  const from = chatKey(owner, oldFile);
  const to = chatKey(owner, newFile);
  for (const list of [settings.library.favoriteChats, settings.library.archivedChats]) {
    const index = list.indexOf(from);
    if (index !== -1) list.splice(index, 1, to);
  }
}

/** Переименование персонажа: переносит закрепление, архив и отметки его чатов. */
export function renameOwner(settings, oldOwner, newOwner) {
  const swap = list => { const index = list.indexOf(oldOwner); if (index !== -1) list.splice(index, 1, newOwner); };
  swap(settings.library.pinned);
  swap(settings.archive.characters);
  for (const list of [settings.library.favoriteChats, settings.library.archivedChats]) {
    list.forEach((key, index) => { if (key.startsWith(`${oldOwner}::`)) list[index] = newOwner + key.slice(oldOwner.length); });
  }
}

/**
 * Один раз забирает закрепления, архив и избранное MistraelSL Character Chat Pills.
 * @param {any} settings
 * @param {(key: string) => string | null} read чтение localStorage
 * @returns {boolean} что-то перенесено
 */
export function importLegacy(settings, read) {
  if (settings.library.imported) return false;
  settings.library.imported = true;
  const take = key => {
    try {
      const value = JSON.parse(read(key) || '[]');
      return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
    } catch { return []; }
  };
  let moved = false;
  const merge = (target, values) => { for (const value of values) if (!target.includes(value)) { target.push(value); moved = true; } };
  merge(settings.library.pinned, take(LEGACY_KEYS.pinned));
  merge(settings.archive.characters, take(LEGACY_KEYS.archived));
  merge(settings.library.favoriteChats, take(LEGACY_KEYS.favoriteChats));
  merge(settings.library.archivedChats, take(LEGACY_KEYS.archivedChats));
  return moved;
}

/** Дата для карточки: «сегодня, 14:05», «вчера», «5 нояб.», с годом, если он не текущий. */
export function shortDate(time, now = Date.now()) {
  if (!time) return '';
  const date = new Date(time);
  const today = new Date(now);
  const day = value => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((day(today) - day(date)) / 86400000);
  if (diff === 0) return `сегодня, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  if (diff === 1) return 'вчера';
  const options = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== today.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString('ru-RU', options);
}

/** «3 чата», «1 сообщение», «25 сообщений». */
export function plural(count, one, few, many) {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  const word = n > 10 && n < 20 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
  return `${count} ${word}`;
}
