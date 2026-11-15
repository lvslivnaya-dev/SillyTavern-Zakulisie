/**
 * «Чистилка»: после удаления расширения таверна стирает его файлы, а его настройки остаются в settings.json навсегда, и каждое
 * сохранение настроек гоняет их туда-сюда. Здесь: найти такие разделы extension_settings, показать размер и убрать выбранные.
 *
 * Ничего не удаляется само: расширение с другим именем ключа выглядит «осиротевшим», хотя живёт, поэтому список показывается
 * человеку, а перед удалением выбранное сохраняется в файл, из которого его можно вернуть.
 * Pure: no DOM, no SillyTavern.
 */

export const CLEANER_KIND = 'zakulisie-cleaner-backup';
export const CLEANER_VERSION = 1;

/** Разделы самой таверны и самого Закулисья: их не предлагают никогда. */
export const PROTECTED_KEYS = Object.freeze([
  'apiUrl', 'apiKey', 'autoConnect', 'notifyUpdates', 'disabledExtensions', 'expressionOverrides', 'memory', 'note', 'caption',
  'expressions', 'connectionManager', 'dice', 'regex', 'regex_presets', 'character_allowed_regex', 'preset_allowed_regex', 'tts', 'sd',
  'chromadb', 'translate', 'objective', 'quickReply', 'quickReplyV2', 'randomizer', 'speech_recognition', 'rvc', 'hypebot', 'vectors',
  'variables', 'attachments', 'character_attachments', 'disabled_attachments', 'gallery', 'cfg',
  'kulisy', 'pudrenitsa',
]);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const PROTECTED = new Set(PROTECTED_KEYS);

/** «third-party/Phone-ST» → «phonest»: для сравнения имени ключа с именем папки. */
function squash(name) {
  return String(name ?? '').split('/').pop().toLowerCase().replace(/sillytavern|extension|[^a-z0-9а-яё]/gi, '');
}

/** Есть ли папка расширения, похожая на этот ключ. Только подсказка: имена ключа и папки не обязаны совпадать. */
export function hasFolderFor(key, folders) {
  const mine = squash(key);
  if (!mine) return false;
  return (folders ?? []).some(folder => {
    const theirs = squash(folder);
    return theirs && (theirs === mine || (mine.length >= 5 && theirs.length >= 5 && (theirs.includes(mine) || mine.includes(theirs))));
  });
}

const sizeOf = value => { try { return JSON.stringify(value)?.length ?? 0; } catch { return 0; } };

/** Разделы, которые можно убрать, по размеру: [{ key, bytes, hasFolder }] и общий размер extension_settings. */
export function scanSettings(extensionSettings, folders = []) {
  const items = [];
  let total = 0;
  for (const [key, value] of Object.entries(isObject(extensionSettings) ? extensionSettings : {})) {
    const bytes = sizeOf(value);
    total += bytes;
    if (PROTECTED.has(key)) continue;
    items.push({ key, bytes, hasFolder: hasFolderFor(key, folders) });
  }
  items.sort((left, right) => right.bytes - left.bytes);
  return { items, total };
}

/** Размер для человека: «5,4 МБ», «320 КБ». */
export function formatBytes(bytes) {
  const number = Number(bytes) || 0;
  if (number >= 1024 * 1024) return `${(number / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  if (number >= 1024) return `${Math.round(number / 1024)} КБ`;
  return `${number} Б`;
}

/** Выбранные ключи без защищённых и без несуществующих; порядок сохраняется. */
function allowed(extensionSettings, keys) {
  return [...new Set(keys ?? [])].filter(key => typeof key === 'string' && !PROTECTED.has(key) && isObject(extensionSettings) && Object.hasOwn(extensionSettings, key));
}

/** Файл для возврата: то, что будет убрано. */
export function buildCleanerBackup(extensionSettings, keys, { now = new Date() } = {}) {
  const removed = {};
  for (const key of allowed(extensionSettings, keys)) removed[key] = structuredClone(extensionSettings[key]);
  if (!Object.keys(removed).length) throw new Error('Ничего не выбрано.');
  return { kind: CLEANER_KIND, version: CLEANER_VERSION, exportedAt: now.toISOString(), removed };
}

/** Убирает выбранные разделы. Возвращает, какие убраны и сколько места это освободило. */
export function removeSettings(extensionSettings, keys) {
  const done = [];
  let bytes = 0;
  for (const key of allowed(extensionSettings, keys)) {
    bytes += sizeOf(extensionSettings[key]);
    delete extensionSettings[key];
    done.push(key);
  }
  return { removed: done, bytes };
}

export function cleanerFilename(now = new Date()) {
  return `zakulisie-cleaned-settings-${now.toISOString().slice(0, 10)}.json`;
}

/** Текст файла → проверенная копия. */
export function parseCleanerBackup(text) {
  let data;
  try { data = JSON.parse(String(text ?? '')); }
  catch { throw new Error('Это не файл чистилки: внутри не JSON.'); }
  if (!isObject(data) || data.kind !== CLEANER_KIND || !isObject(data.removed)) throw new Error('Это не файл чистилки (его скачивает кнопка «Убрать выбранное»).');
  if (!Number.isInteger(data.version) || data.version > CLEANER_VERSION) throw new Error('Файл сделан более новой версией Закулисья.');
  return data;
}

/** Возвращает убранные разделы; то, что уже есть сейчас, не затирается. */
export function restoreSettings(extensionSettings, backup) {
  const restored = [];
  const skipped = [];
  for (const [key, value] of Object.entries(backup?.removed ?? {})) {
    if (PROTECTED.has(key)) continue;
    if (Object.hasOwn(extensionSettings, key)) { skipped.push(key); continue; }
    extensionSettings[key] = structuredClone(value);
    restored.push(key);
  }
  return { restored, skipped };
}
