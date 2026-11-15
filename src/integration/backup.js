/**
 * Копия всех данных Закулисья одним файлом: для переезда со старых «Кулис» и «Пудреницы» на другой компьютер или в другой профиль
 * таверны, и просто как запасная.
 *
 * Что внутри: настройки и библиотеки (карточки, локации, гардероб, имена, песни), папки и палитры Пудреницы. Чаты сюда не входят:
 * состояние чата Закулисья лежит в самом файле чата таверны и переезжает вместе с ним.
 * Ключи доступа к моделям в файл НЕ попадают, а при загрузке свои ключи на этом компьютере остаются как были.
 * Pure: no DOM, no SillyTavern.
 */

export const BACKUP_KIND = 'zakulisie-backup';
export const BACKUP_VERSION = 1;
/** Ключи extension_settings, которые входят в копию: настройки «Кулис» и «Пудреницы» (у Закулисья они те же). */
export const BACKUP_KEYS = Object.freeze(['kulisy', 'pudrenitsa']);
/** Секреты внутри настроек Кулис: в файл не идут и при загрузке не затираются. */
export const SECRET_PATHS = Object.freeze([['aux', 'key'], ['embeddings', 'key'], ['wardrobeVision', 'key']]);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function readPath(root, path) {
  let node = root;
  for (const part of path) {
    if (!isObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

function writePath(root, path, value) {
  let node = root;
  for (const part of path.slice(0, -1)) {
    if (!isObject(node[part])) node[part] = {};
    node = node[part];
  }
  node[path.at(-1)] = value;
}

function deletePath(root, path) {
  const parent = readPath(root, path.slice(0, -1));
  if (isObject(parent)) delete parent[path.at(-1)];
}

/** Копия настроек без ключей доступа. */
export function stripSecrets(kulisy) {
  const copy = structuredClone(kulisy);
  for (const path of SECRET_PATHS) deletePath(copy, path);
  return copy;
}

/** Файл копии из extension_settings. Пустые разделы в файл не идут; если нечего копировать, это ошибка. */
export function buildBackup(extensionSettings, { now = new Date(), version = '' } = {}) {
  const settings = {};
  for (const key of BACKUP_KEYS) {
    const value = extensionSettings?.[key];
    if (!isObject(value)) continue;
    settings[key] = key === 'kulisy' ? stripSecrets(value) : structuredClone(value);
  }
  if (!Object.keys(settings).length) throw new Error('В этой таверне нет данных Кулис и Пудреницы: копировать нечего.');
  return { kind: BACKUP_KIND, version: BACKUP_VERSION, app: version, exportedAt: now.toISOString(), settings };
}

/** Короткая сводка файла для вопроса «точно загрузить?»: сколько чего внутри. */
export function summarizeBackup(backup) {
  const kulisy = backup?.settings?.kulisy ?? {};
  const count = list => (Array.isArray(list) ? list.length : 0);
  const library = kulisy.locationLibrary ?? {};
  return {
    exportedAt: String(backup?.exportedAt ?? ''),
    hasKulisy: isObject(backup?.settings?.kulisy),
    hasPudrenitsa: isObject(backup?.settings?.pudrenitsa),
    cards: count(library.characters),
    places: count(library.locations),
    items: count(library.items),
  };
}

/** Текст файла → проверенная копия. Понятная ошибка вместо «Unexpected token». */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(String(text ?? '')); }
  catch { throw new Error('Это не файл копии: внутри не JSON.'); }
  if (!isObject(data) || data.kind !== BACKUP_KIND) throw new Error('Это не файл копии Закулисья (его делает кнопка «Скачать копию всех данных»).');
  if (!Number.isInteger(data.version) || data.version > BACKUP_VERSION) throw new Error('Копия сделана более новой версией Закулисья: обновите расширение и повторите.');
  if (!isObject(data.settings) || !BACKUP_KEYS.some(key => isObject(data.settings[key]))) throw new Error('В файле копии нет данных.');
  return data;
}

/**
 * Кладёт копию в extension_settings (на месте: объекты, на которые уже смотрят модули, остаются теми же).
 * Ключи доступа, которые есть на этом компьютере, сохраняются. Возвращает, какие разделы заменены.
 */
export function applyBackup(extensionSettings, backup) {
  const replaced = [];
  for (const key of BACKUP_KEYS) {
    const incoming = backup?.settings?.[key];
    if (!isObject(incoming)) continue;
    const next = structuredClone(incoming);
    const current = extensionSettings[key];
    if (key === 'kulisy' && isObject(current)) {
      for (const path of SECRET_PATHS) {
        const mine = readPath(current, path);
        if (typeof mine === 'string' && mine) writePath(next, path, mine);
      }
    }
    if (isObject(current)) {
      for (const name of Object.keys(current)) delete current[name];
      Object.assign(current, next);
    } else {
      extensionSettings[key] = next;
    }
    replaced.push(key);
  }
  return replaced;
}

/** Имя файла: zakulisie-копия-2026-11-15.json */
export function backupFilename(now = new Date()) {
  return `zakulisie-backup-${now.toISOString().slice(0, 10)}.json`;
}
