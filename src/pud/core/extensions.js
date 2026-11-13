/**
 * Окно расширений: чистая логика без DOM.
 * Расширение в таверне — ключ из extensionNames: встроенные «memory», сторонние «third-party/Папка».
 * Блоки настроек расширения на шторке ничем не подписаны, поэтому хозяин ищется по заголовку и id блока,
 * а если не угадался — его привязывают вручную (settings.extensionLinks: ключ блока → расширение).
 */
import { ALL, NO_FOLDER, folderOf } from './personas.js';

export const PREFIX = 'third-party';
export const UPDATE = '__update__';
export const OFF = '__off__';
export const ORPHANS = '__orphans__';
/** Ручная отметка «этот блок не принадлежит угаданному расширению». */
export const NOBODY = '__nobody__';

/** Имя папки стороннего расширения без «third-party/». */
export const folderName = id => (id.startsWith(`${PREFIX}/`) ? id.slice(PREFIX.length + 1) : id);
/** Так имя ждут родные функции удаления и обновления: «/Папка». */
export const externalId = id => id.replace(PREFIX, '');

/** Для сравнения: без регистра, знаков и приставок SillyTavern/Extension/ST («SillyTavern-Kulisy» → «kulisy»). */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/sillytavern|silly tavern|extension|^st[-_ ]|[-_ ]st$/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Список для окна.
 * @param {string[]} names extensionNames
 * @param {(id: string) => any} manifestOf
 * @param {string[]} disabled
 * @param {Record<string, string>} types
 * @param {Record<string, boolean|null>} updates id → есть ли обновление (null — не проверено)
 */
export function buildExtensions(names, manifestOf, disabled = [], types = {}, updates = {}) {
  const off = new Set(disabled);
  return names.map(id => {
    const manifest = manifestOf(id) ?? {};
    const type = types[id] ?? (id.startsWith(PREFIX) ? 'local' : 'system');
    return {
      id,
      folder: folderName(id),
      name: String(manifest.display_name || folderName(id)),
      version: String(manifest.version ?? ''),
      author: String(manifest.author ?? ''),
      type,
      system: type === 'system' || !id.startsWith(PREFIX),
      enabled: !off.has(id),
      update: updates[id] ?? null,
    };
  });
}

/** view: ALL | UPDATE | OFF | ORPHANS | id папки | NO_FOLDER. Отключённые и с обновлением — отдельные фильтры. */
export function filterExtensions(list, settings, { view = ALL, query = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return list.filter(item => {
    if (view === UPDATE && item.update !== true) return false;
    if (view === OFF && item.enabled) return false;
    const inFolder = folderOf(settings, item.id, 'extensions');
    if (view === NO_FOLDER && inFolder) return false;
    if (![ALL, UPDATE, OFF, NO_FOLDER, ORPHANS].includes(view) && inFolder !== view) return false;
    return !needle || item.name.toLowerCase().includes(needle) || item.folder.toLowerCase().includes(needle) || item.author.toLowerCase().includes(needle);
  }).sort((a, b) => Number(b.enabled) - Number(a.enabled) || Number(a.system) - Number(b.system) || a.name.localeCompare(b.name, 'ru'));
}

export function extensionCounts(list, settings) {
  const counts = { [ALL]: list.length, [UPDATE]: 0, [OFF]: 0, [NO_FOLDER]: 0 };
  for (const item of list) {
    if (item.update === true) counts[UPDATE]++;
    if (!item.enabled) counts[OFF]++;
    const folder = folderOf(settings, item.id, 'extensions');
    const key = folder && settings.folders.extensions.some(entry => entry.id === folder) ? folder : NO_FOLDER;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Насколько блок настроек похож на расширение: 0 — не он. */
export function matchScore(block, item) {
  const head = normalize(block.title);
  const ids = normalize(block.ids);
  const name = normalize(item.name);
  const folder = normalize(item.folder);
  let score = 0;
  if (head && (head === name || head === folder)) score = Math.max(score, 4);
  if (head && name.length >= 4 && (head.includes(name) || name.includes(head))) score = Math.max(score, 3);
  if (head && folder.length >= 4 && (head.includes(folder) || folder.includes(head))) score = Math.max(score, 3);
  if (ids && folder.length >= 3 && ids.includes(folder)) score = Math.max(score, 2);
  if (ids && name.length >= 4 && ids.includes(name)) score = Math.max(score, 2);
  return score;
}

/**
 * Раскладывает блоки настроек по расширениям.
 * @param {{ key: string, title: string, ids: string }[]} blocks
 * @param {{ id: string, name: string, folder: string }[]} items
 * @param {Record<string, string>} links ручные привязки: ключ блока → id расширения
 * @returns {{ owners: Record<string, string[]>, orphans: string[] }}
 */
export function assignBlocks(blocks, items, links = {}) {
  const owners = {};
  const orphans = [];
  const known = new Set(items.map(item => item.id));
  for (const block of blocks) {
    if (links[block.key] === NOBODY) { orphans.push(block.key); continue; }
    let owner = known.has(links[block.key]) ? links[block.key] : '';
    if (!owner) {
      let best = 0;
      for (const item of items) {
        const score = matchScore(block, item);
        if (score > best) { best = score; owner = item.id; }
      }
      if (best < 2) owner = '';
    }
    if (owner) (owners[owner] ??= []).push(block.key);
    else orphans.push(block.key);
  }
  return { owners, orphans };
}
