/** Настройки Пудреницы в extension_settings.pudrenitsa: значения по умолчанию, миграция, ключ набора кнопок пресета. */

export const SETTINGS_KEY = 'pudrenitsa';
export const SETTINGS_VERSION = 1;

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    enabled: true,
    // Палитра: pink | graphite | noir | latte | matcha | id своей палитры (src/core/palettes.js)
    palette: 'pink',
    // Свои палитры: копии встроенных с поправленными цветами, id начинается с «my-»
    customPalettes: [],
    // Лапки: бледный узор на фоне и значки-лапки в сообщениях чата
    paws: { background: true, chat: true },
    // Кнопки пресета: chipKey(пресет, профиль) → [{ id, label }]
    chips: {},
    // Папки: { id, name, parent } (parent нужен лорбукам, у остальных null)
    folders: { personas: [], characters: [], lorebooks: [], extensions: [] },
    // Что в какой папке лежит: имя объекта → [id папок]
    assignments: { personas: {}, characters: {}, lorebooks: {}, extensions: {} },
    archive: { personas: [], characters: [] },
    favorites: { personas: [] },
    // Вид в библиотеке лорбуков для каждой папки: id папки → 'grid' | 'list'
    views: { lorebooks: {} },
    covers: { lorebooks: {} },
    // Библиотека чатов: закреплённые владельцы (аватар или group:id), отметки чатов «владелец::файл»,
    // imported — закрепления и архив MistraelSL Character Chat Pills уже перенесены
    library: { pinned: [], favoriteChats: [], archivedChats: [], imported: false, shelf: 'recent', personasImported: false, lorebooksImported: false },
    // Окно расширений: ключ блока настроек → id расширения (если хозяин не угадался сам)
    extensionLinks: {},
    // Редактор лорбука: последний открытый лорбук и сортировка записей
    loreEditor: { book: '', sort: 'native' },
    // «Что сработало из лорбуков»: значки-ключики под ответами
    loreTrace: { chips: true },
    // «Внешность по картинке»: чем описывать (профиль подключения или модель чата) и что запомнено у каждой персоны
    personaLook: { mode: 'profile', profileId: '', maxTokens: 5000 },
    personaLooks: {},
    // Встроенные промпты нарратора: [{ id, name, text, isDefault }], см. core/prompts.js
    prompts: [],
    // Пункты меню «палочки» (ключи), спрятанные из списка расширений
    wandHidden: [],
    // Свои иконки: { pud: { имя: data-ссылка }, studio: { … } }, см. shared/custom-icons.js
    icons: { pud: {}, studio: {} },
    // Свой экран загрузки (картинка, гифка, видео), см. core/custom-media.js
    loading: { enabled: false, src: '', path: '', kind: '', name: '', size: 'm', fit: 'contain', bg: 'theme', color: '#fff5f8', text: '', spinner: false },
    // Позиции и размеры окон: имя окна → { left, top, width, height }
    windows: {},
  };
}

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Дополняет сохранённое значение недостающими ключами по образцу. Чужие ключи не трогает. */
function fill(saved, sample) {
  if (Array.isArray(sample)) return Array.isArray(saved) ? saved : structuredClone(sample);
  if (isPlainObject(sample)) {
    // Пустой образец ({} для словарей вроде chips) принимает любые ключи
    if (!isPlainObject(saved)) return structuredClone(sample);
    const out = { ...saved };
    for (const [key, value] of Object.entries(sample)) out[key] = fill(saved[key], value);
    return out;
  }
  return typeof saved === typeof sample ? saved : sample;
}

/** Чистая функция: любое сохранённое значение → настройки текущей версии. */
export function migrateSettings(raw) {
  const settings = fill(isPlainObject(raw) ? raw : {}, defaultSettings());
  // Здесь будут шаги вида: if (settings.version < 2) { …; settings.version = 2; }
  settings.version = SETTINGS_VERSION;
  return settings;
}

/** Берёт настройки из контекста таверны и кладёт мигрированную версию обратно. */
export function getSettings(context) {
  const store = context.extensionSettings;
  store[SETTINGS_KEY] = migrateSettings(store[SETTINGS_KEY]);
  return store[SETTINGS_KEY];
}

/** Ключ набора кнопок пресета: у одного пресета с разными профилями соединения разные наборы. */
export function chipKey(preset, profile) {
  return `${preset ?? ''}::${profile ?? ''}`;
}
