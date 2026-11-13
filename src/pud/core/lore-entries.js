/**
 * Записи лорбука: чистая логика без DOM.
 * Поля записи — как в таверне (newWorldInfoEntryDefinition); при правке зеркалим их в originalData, как родной редактор.
 */

/** Куда вставляется запись (world_info_position). */
export const POSITIONS = [
  { value: 0, title: 'До описания персонажа', short: 'до перса' },
  { value: 1, title: 'После описания персонажа', short: 'после перса' },
  { value: 5, title: 'До примеров диалога', short: 'до примеров' },
  { value: 6, title: 'После примеров диалога', short: 'после примеров' },
  { value: 2, title: 'Сверху заметки автора', short: 'над заметкой' },
  { value: 3, title: 'Снизу заметки автора', short: 'под заметкой' },
  { value: 4, title: 'На глубине в чате', short: 'глубина' },
  { value: 7, title: 'Выход (outlet) для макроса', short: 'outlet' },
];
export const AT_DEPTH = 4;
export const OUTLET = 7;

export const ROLES = [
  { value: 0, title: 'Система' },
  { value: 1, title: 'Пользователь' },
  { value: 2, title: 'Ассистент' },
];

/** Логика вторичных ключей (world_info_logic). */
export const LOGIC = [
  { value: 0, title: 'и хотя бы один из вторичных' },
  { value: 3, title: 'и все вторичные' },
  { value: 2, title: 'и ни одного из вторичных' },
  { value: 1, title: 'и не все вторичные' },
];

export const TRIGGERS = [
  { value: 'normal', title: 'обычное сообщение' },
  { value: 'continue', title: 'продолжение' },
  { value: 'impersonate', title: 'за тебя' },
  { value: 'swipe', title: 'свайп' },
  { value: 'regenerate', title: 'перегенерация' },
  { value: 'quiet', title: 'тихая генерация' },
];

export const MATCH_SOURCES = [
  { field: 'matchPersonaDescription', title: 'описании персоны' },
  { field: 'matchCharacterDescription', title: 'описании персонажа' },
  { field: 'matchCharacterPersonality', title: 'характере персонажа' },
  { field: 'matchCharacterDepthPrompt', title: 'заметке персонажа' },
  { field: 'matchScenario', title: 'сценарии' },
  { field: 'matchCreatorNotes', title: 'заметках создателя' },
];

/** Поля «да / нет / как в общих настройках» (null = общая настройка). */
export const TRISTATE = ['caseSensitive', 'matchWholeWords', 'useGroupScoring'];
/** Числа, где пусто = выключено или общая настройка. */
export const NULLABLE_NUMBERS = ['scanDepth', 'sticky', 'cooldown', 'delay'];

export const SORTS = [
  { value: 'native', title: 'как в таверне' },
  { value: 'name', title: 'по названию' },
  { value: 'order', title: 'по порядку вставки' },
  { value: 'new', title: 'сначала новые' },
];

/** Стратегия: по ключам, всегда (constant) или по смыслу (vectorized). */
export function strategyOf(entry) {
  if (entry?.constant) return 'constant';
  if (entry?.vectorized) return 'vector';
  return 'normal';
}
export function strategyPatch(strategy) {
  return { constant: strategy === 'constant', vectorized: strategy === 'vector' };
}

export const keysOf = (entry, field = 'key') => (Array.isArray(entry?.[field]) ? entry[field].map(String).filter(Boolean) : []);

export function entryTitle(entry) {
  const comment = String(entry?.comment ?? '').trim();
  if (comment) return comment;
  const keys = keysOf(entry);
  return keys.length ? keys.join(', ') : 'Без названия';
}

export const entryList = data => Object.values(data?.entries ?? {}).filter(entry => entry && typeof entry === 'object');

export function filterEntries(list, query = '') {
  const needle = query.trim().toLowerCase();
  if (!needle) return list;
  return list.filter(entry => [entry.comment, entry.content, ...keysOf(entry), ...keysOf(entry, 'keysecondary')]
    .some(text => String(text ?? '').toLowerCase().includes(needle)));
}

export function sortEntries(list, mode = 'native') {
  const byUid = (a, b) => Number(a.uid) - Number(b.uid);
  const copy = [...list];
  if (mode === 'name') return copy.sort((a, b) => entryTitle(a).localeCompare(entryTitle(b), 'ru') || byUid(a, b));
  if (mode === 'order') return copy.sort((a, b) => (Number(b.order) || 0) - (Number(a.order) || 0) || byUid(a, b));
  if (mode === 'new') return copy.sort((a, b) => byUid(b, a));
  const index = entry => (Number.isFinite(Number(entry.displayIndex)) ? Number(entry.displayIndex) : Number(entry.uid));
  return copy.sort((a, b) => index(a) - index(b) || byUid(a, b));
}

export function freeUid(data) {
  for (let uid = 0; uid < 1_000_000; uid++) if (!Object.hasOwn(data.entries, uid)) return uid;
  return null;
}

/** Копия записи с новым uid сразу после оригинала (в ручной сортировке). */
export function duplicateEntry(data, uid) {
  const source = data.entries[uid];
  const free = freeUid(data);
  if (!source || free === null) return null;
  const copy = { ...structuredClone(source), uid: free };
  copy.comment = `${String(source.comment ?? '').trim() || entryTitle(source)} (копия)`;
  copy.displayIndex = (Number(source.displayIndex) || Number(source.uid) || 0) + 0.5;
  data.entries[free] = copy;
  return copy;
}

/**
 * Куда записать поле в originalData (карточка, импортированная из персонажа).
 * @param {string} field поле записи
 * @param {any} value новое значение
 * @param {Record<string, string>} keyMap originalWIDataKeyMap таверны
 * @returns {[string, any] | null}
 */
export function originalTarget(field, value, keyMap = {}) {
  if (field === 'disable') return ['enabled', !value];
  if (field === 'characterFilter') return ['character_filter', value];
  return keyMap[field] ? [keyMap[field], value] : null;
}

/** Значение из поля формы в тип записи. */
export function parseField(field, raw, type = 'text') {
  if (type === 'checkbox') return Boolean(raw);
  if (TRISTATE.includes(field)) return raw === '' ? null : raw === 'true';
  if (NULLABLE_NUMBERS.includes(field)) {
    if (raw === '' || raw === null) return null;
    const number = Number(raw);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
  }
  if (['order', 'depth', 'probability', 'groupWeight', 'position', 'role', 'selectiveLogic', 'delayUntilRecursion'].includes(field)) {
    const number = Number(raw);
    if (!Number.isFinite(number)) return 0;
    if (field === 'probability') return Math.min(100, Math.max(0, Math.round(number)));
    return Math.max(0, Math.round(number));
  }
  return String(raw ?? '');
}

/** Короткая сводка для строки списка. */
export function entryMeta(entry) {
  const position = POSITIONS.find(item => item.value === Number(entry.position));
  const where = Number(entry.position) === AT_DEPTH ? `глубина ${Number(entry.depth) || 0}` : (position?.short ?? 'позиция ?');
  return `${where} · порядок ${Number(entry.order) || 0}`;
}
