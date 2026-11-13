/**
 * Библиотека лорбуков: чистая логика без DOM.
 * Папки вложенные (parent), у лорбука одна папка, обложка и вид (сетка или список) — свои для каждой папки.
 * Всё хранится в настройках Пудреницы по имени лорбука; при переименовании ключи переезжают.
 */
export const ALL = '__all__';
export const NO_FOLDER = '__none__';
export const GLOBAL = '__global__';
export const GRID_PAGE = 10;
export const LIST_PAGE = 12;

const newId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const cleanName = name => String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);

export const bookFolder = (settings, name) => settings.assignments.lorebooks[name]?.[0] ?? '';

/**
 * Лорбуки для окна.
 * @param {string[]} names world_names
 * @param {string[]} selected глобально включённые (selected_world_info)
 * @param {any} settings
 * @param {{ avatar: string, data?: any }[]} characters для обложки из аватара персонажа, чей это основной лорбук
 * @param {Record<string, number>} counts число записей, если уже известно
 */
export function buildBooks(names = [], selected = [], settings, characters = [], counts = {}) {
  const on = new Set(selected);
  const owners = new Map();
  for (const character of characters) {
    const world = character?.data?.extensions?.world;
    if (world && !owners.has(world)) owners.set(world, character.avatar);
  }
  return names.map(name => ({
    name,
    global: on.has(name),
    folder: bookFolder(settings, name),
    cover: String(settings.covers.lorebooks[name] ?? ''),
    owner: owners.get(name) ?? '',
    entries: Object.hasOwn(counts, name) ? counts[name] : null,
  }));
}

export function filterBooks(list, settings, { view = ALL, query = '' } = {}) {
  const needle = query.trim().toLowerCase();
  const known = new Set(settings.folders.lorebooks.map(folder => folder.id));
  return list.filter(book => {
    if (view === GLOBAL && !book.global) return false;
    const folder = known.has(book.folder) ? book.folder : '';
    if (view === NO_FOLDER && folder) return false;
    if (![ALL, GLOBAL, NO_FOLDER].includes(view) && folder !== view) return false;
    return !needle || book.name.toLowerCase().includes(needle);
  }).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Дерево папок: [{ folder, depth }] в порядке показа, дети под родителем. */
export function folderTree(settings) {
  const folders = settings.folders.lorebooks;
  const ids = new Set(folders.map(folder => folder.id));
  const out = [];
  const walk = (parent, depth, seen) => {
    for (const folder of folders.filter(item => (item.parent && ids.has(item.parent) ? item.parent : null) === parent).sort((a, b) => a.name.localeCompare(b.name, 'ru'))) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      out.push({ folder, depth });
      walk(folder.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}

export function bookCounts(list, settings) {
  const known = new Set(settings.folders.lorebooks.map(folder => folder.id));
  const counts = { [ALL]: list.length, [GLOBAL]: 0, [NO_FOLDER]: 0 };
  for (const book of list) {
    if (book.global) counts[GLOBAL]++;
    const key = known.has(book.folder) ? book.folder : NO_FOLDER;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function createBookFolder(settings, name, parent = null) {
  const clean = cleanName(name);
  if (!clean) return null;
  const folder = { id: newId(), name: clean, parent: parent && settings.folders.lorebooks.some(item => item.id === parent) ? parent : null };
  settings.folders.lorebooks.push(folder);
  return folder;
}

export function renameBookFolder(settings, id, name) {
  const folder = settings.folders.lorebooks.find(item => item.id === id);
  const clean = cleanName(name);
  if (!folder || !clean) return false;
  folder.name = clean;
  return true;
}

/** Удаляет папку: её подпапки и лорбуки поднимаются на уровень выше (к её родителю). */
export function deleteBookFolder(settings, id) {
  const folder = settings.folders.lorebooks.find(item => item.id === id);
  if (!folder) return;
  const parent = folder.parent ?? null;
  for (const child of settings.folders.lorebooks) if (child.parent === id) child.parent = parent;
  settings.folders.lorebooks = settings.folders.lorebooks.filter(item => item.id !== id);
  for (const [name, folders] of Object.entries(settings.assignments.lorebooks)) {
    if (!folders.includes(id)) continue;
    if (parent) settings.assignments.lorebooks[name] = [parent];
    else delete settings.assignments.lorebooks[name];
  }
  delete settings.views.lorebooks[id];
}

/** Можно ли положить папку в другую (не в саму себя и не в своих потомков). */
export function canNest(settings, id, parent) {
  for (let cursor = parent; cursor; cursor = settings.folders.lorebooks.find(item => item.id === cursor)?.parent ?? null) {
    if (cursor === id) return false;
  }
  return true;
}

export function moveBook(settings, name, folderId) {
  if (folderId && settings.folders.lorebooks.some(item => item.id === folderId)) settings.assignments.lorebooks[name] = [folderId];
  else delete settings.assignments.lorebooks[name];
}

/** Лорбук переименован: папка, обложка и прочее переезжают на новое имя. */
export function renameBookMarks(settings, oldName, newName) {
  for (const store of [settings.assignments.lorebooks, settings.covers.lorebooks]) {
    if (Object.hasOwn(store, oldName)) { store[newName] = store[oldName]; delete store[oldName]; }
  }
}

export function forgetBook(settings, name) {
  delete settings.assignments.lorebooks[name];
  delete settings.covers.lorebooks[name];
}

/** Вид для папки: сетка по умолчанию, у каждой папки свой. */
export const viewOf = (settings, key) => (settings.views.lorebooks[key] === 'list' ? 'list' : 'grid');

/**
 * Один раз забирает папки, раскладку и обложки из My lorebook manager.
 * Его папки — в extension_settings.lorebookManager.folders, папка и обложка книги — в самом файле (extensions.lorebook_manager).
 * @param {any} settings
 * @param {any} legacy extension_settings.lorebookManager
 * @param {{ file_id?: string, name?: string, extensions?: any }[]} files ответ /api/worldinfo/list
 */
export function importLegacyLorebooks(settings, legacy, files = []) {
  if (settings.library.lorebooksImported) return false;
  settings.library.lorebooksImported = true;
  let moved = false;
  const ids = new Map();
  const folders = Array.isArray(legacy?.folders) ? legacy.folders : [];
  for (const item of folders) {
    const name = cleanName(item?.name);
    if (!item?.id || !name) continue;
    const folder = { id: newId(), name, parent: null };
    settings.folders.lorebooks.push(folder);
    ids.set(String(item.id), folder);
    moved = true;
  }
  for (const item of folders) {
    const folder = ids.get(String(item?.id));
    const parent = ids.get(String(item?.parentId ?? ''));
    if (folder && parent && canNest(settings, folder.id, parent.id)) folder.parent = parent.id;
  }
  for (const file of files) {
    const name = String(file?.file_id ?? file?.name ?? '');
    const meta = file?.extensions?.lorebook_manager;
    if (!name || !meta || typeof meta !== 'object') continue;
    const folder = ids.get(String(meta.folderId ?? ''));
    if (folder && !settings.assignments.lorebooks[name]) { settings.assignments.lorebooks[name] = [folder.id]; moved = true; }
    const cover = String(meta.coverPath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (cover && !cover.includes('..') && !/^[a-z][a-z0-9+.-]*:/i.test(cover) && !settings.covers.lorebooks[name]) {
      settings.covers.lorebooks[name] = `/${cover}`;
      moved = true;
    }
  }
  return moved;
}

export function paginate(list, page, size) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  return { items: list.slice(current * size, current * size + size), page: current, pages };
}
