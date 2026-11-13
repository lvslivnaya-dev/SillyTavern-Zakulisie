/**
 * Библиотека персонажей: чистая логика без DOM.
 * Избранное — родной флажок таверны (fav), архив и папки — в настройках Пудреницы (архив общий с библиотекой чатов).
 */
import { ALL, NO_FOLDER, folderOf } from './personas.js';
import { toTime } from './library.js';

/** Поля карточки: имя в V1 (верхний уровень), в V2 (data) и родное поле редактора таверны. */
export const CHAR_FIELDS = {
  description: { title: 'Описание', v1: 'description', v2: 'description', native: '#description_textarea' },
  first_mes: { title: 'Первое сообщение', v1: 'first_mes', v2: 'first_mes', native: '#firstmessage_textarea' },
  personality: { title: 'Личность (кратко)', v1: 'personality', v2: 'personality', native: '#personality_textarea' },
  scenario: { title: 'Сценарий', v1: 'scenario', v2: 'scenario', native: '#scenario_pole' },
  mes_example: { title: 'Примеры диалога', v1: 'mes_example', v2: 'mes_example', native: '#mes_example_textarea' },
  creator_notes: { title: 'Заметки автора карточки', v1: 'creatorcomment', v2: 'creator_notes', native: '#creator_notes_textarea' },
  system_prompt: { title: 'Свой системный промпт', v1: null, v2: 'system_prompt', native: '#system_prompt_textarea' },
  post_history_instructions: { title: 'Инструкции после истории', v1: null, v2: 'post_history_instructions', native: '#post_history_instructions_textarea' },
};
/** Что лежит в «Расширенном описании» (описание — прямо в окне). */
export const EXTENDED_FIELDS = ['first_mes', 'personality', 'scenario', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions'];

export const isFav = character => character?.fav === true || character?.fav === 'true' || character?.data?.extensions?.fav === true;

/** Значение поля из персонажа таверны (V2 важнее V1). */
export function fieldValue(character, field) {
  const spec = CHAR_FIELDS[field];
  if (!spec || !character) return '';
  return String(character.data?.[spec.v2] ?? (spec.v1 ? character[spec.v1] : '') ?? '');
}

/** Тело для /api/characters/merge-attributes: одно поле в обоих местах карточки. */
export function mergePayload(avatar, field, value) {
  const spec = CHAR_FIELDS[field];
  const payload = { avatar, data: { [spec.v2]: value } };
  if (spec.v1) payload[spec.v1] = value;
  return payload;
}

/**
 * Персонажи таверны → записи для библиотеки.
 * @param {any[]} characters
 * @param {Record<string, string[]>} tagMap
 * @param {{ id: string, name: string }[]} tags
 */
export function buildCharacters(characters = [], tagMap = {}, tags = []) {
  const tagNames = new Map(tags.map(tag => [String(tag.id), String(tag.name ?? '')]));
  return characters.filter(character => character?.avatar).map(character => ({
    avatar: character.avatar,
    name: String(character.name ?? ''),
    fav: isFav(character),
    world: String(character.data?.extensions?.world ?? ''),
    tags: (tagMap[character.avatar] ?? []).map(id => tagNames.get(String(id))).filter(Boolean),
    creator: String(character.data?.creator ?? ''),
    hasChats: Number(character.chat_size) > 0 || toTime(character.date_last_chat) > 0,
    last: toTime(character.date_last_chat),
    added: toTime(character.date_added ?? character.create_date),
    description: String(character.data?.description ?? character.description ?? ''),
  }));
}

/**
 * Фильтры окна. view: all | chats | fav | archive. sort: name | recent | added.
 * Архивные видны только в архиве. Избранные всегда сверху.
 */
export function filterCharacters(list, settings, { view = 'all', folder = ALL, query = '', sort = 'name' } = {}) {
  const archived = new Set(settings.archive.characters);
  const needle = query.trim().toLowerCase();
  const result = list.filter(character => {
    if ((view === 'archive') !== archived.has(character.avatar)) return false;
    if (view === 'fav' && !character.fav) return false;
    if (view === 'chats' && !character.hasChats) return false;
    const inFolder = folderOf(settings, character.avatar, 'characters');
    if (folder === NO_FOLDER && inFolder) return false;
    if (folder !== ALL && folder !== NO_FOLDER && inFolder !== folder) return false;
    if (!needle) return true;
    return character.name.toLowerCase().includes(needle)
      || character.tags.some(tag => tag.toLowerCase().includes(needle))
      || character.creator.toLowerCase().includes(needle)
      || character.description.toLowerCase().includes(needle);
  });
  const order = {
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    recent: (a, b) => b.last - a.last || a.name.localeCompare(b.name, 'ru'),
    added: (a, b) => b.added - a.added || a.name.localeCompare(b.name, 'ru'),
  }[sort] ?? ((a, b) => a.name.localeCompare(b.name, 'ru'));
  return result.sort((a, b) => Number(b.fav) - Number(a.fav) || order(a, b));
}

export function characterStats(list, settings) {
  const archived = new Set(settings.archive.characters);
  return {
    total: list.length,
    archived: list.filter(character => archived.has(character.avatar)).length,
    favorites: list.filter(character => character.fav).length,
    withChats: list.filter(character => character.hasChats).length,
    withLorebook: list.filter(character => character.world).length,
    folders: settings.folders.characters.length,
  };
}

/** Убирает следы удалённого персонажа из настроек Пудреницы. */
export function forgetCharacter(settings, avatar) {
  delete settings.assignments.characters[avatar];
  settings.archive.characters = settings.archive.characters.filter(item => item !== avatar);
  settings.library.pinned = settings.library.pinned.filter(item => item !== avatar);
}
