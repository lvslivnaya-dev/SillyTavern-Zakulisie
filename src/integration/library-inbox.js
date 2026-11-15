/**
 * The library inbox: a folder tree on the computer (kept by the server plugin kulisy-images) where pictures
 * of places and things are dropped by hand and become entries of the library.
 *
 *   <папка>/Библиотека/<Места|Вещи>/<папка библиотеки>/<вложенная папка>/картинка.jpg
 *
 * The folders under the shelf are the library's own folders (made on the spot when the library has no such one);
 * the file name, when it is a real name and not «IMG_2034», becomes the name of the entry. The picture stays where
 * it lies: the entry points at that file.
 */
import { LIBRARY_LIMITS, addFolder, addLibraryItem, addLocation, folderPath } from '../core/index.js';
import { nameFromFile } from './wardrobe-inbox.js';

const norm = value => String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

/** The two shelves of the tree; the folder names are the page's own labels. */
export const LIBRARY_SHELVES = Object.freeze({ places: 'Места', items: 'Вещи' });
const SHELF_NAMES = new Map([
  ...Object.entries(LIBRARY_SHELVES).map(([key, label]) => [norm(label), key]),
  ['локации', 'places'], ['локация', 'places'], ['место', 'places'], ['предметы', 'items'], ['предмет', 'items'], ['вещь', 'items'],
]);
/** Where a picture lying right in the shelf (no folder) goes. */
export const INBOX_FOLDER = 'Из папки';
/** The tree is shelf + at most four levels of folders (the plugin allows five levels of directories). */
const MAX_LEVELS = 4;
/** The same rule as the plugin's: a folder name the tree can hold. */
const SEGMENT = /^[\p{L}\p{N}][\p{L}\p{N} _.()-]{0,59}$/u;
const usable = name => SEGMENT.test(name) && !/^\.+$/.test(name) && !name.endsWith('.');

/** Every folder of the tree for this library: 'Места', 'Места/Кафе', 'Места/Кафе/Терраса', … (the same for 'Вещи'). */
export function libraryDirectories(library) {
  const dirs = [];
  const folders = (library?.folders ?? []).filter(folder => !folder.persona);
  for (const label of Object.values(LIBRARY_SHELVES)) {
    dirs.push(label);
    for (const folder of folders) {
      const names = folderPath(library, folder.id).map(item => item.name);
      if (names.length && names.length <= MAX_LEVELS && names.every(usable)) dirs.push(`${label}/${names.join('/')}`);
    }
  }
  return dirs.slice(0, 400);
}

/** Pictures of the tree no entry points at yet: the ones dropped in by hand. */
export function newLibraryFiles(files, library) {
  const used = new Set([...(library?.locations ?? []), ...(library?.items ?? [])].map(entry => String(entry.image ?? '').replace(/^\/+/, '')).filter(Boolean));
  return (files ?? []).filter(file => file?.public && !used.has(String(file.public).replace(/^\/+/, '')));
}

/** 'Места/Кафе/Терраса/фото.jpg' → { kind: 'places'|'items', folders: ['Кафе', 'Терраса'], name, problem }. */
export function placeFromLibraryPath(relativePath) {
  const parts = String(relativePath ?? '').split('/').filter(Boolean);
  const fileName = parts.pop() ?? '';
  const [shelfName, ...folders] = parts;
  const name = nameFromFile(fileName);
  if (shelfName === undefined) return { kind: '', folders: [], name, problem: 'Картинка лежит прямо в «Библиотеке»: положите её в папку «Места» или «Вещи».' };
  const kind = SHELF_NAMES.get(norm(shelfName));
  if (!kind) return { kind: '', folders: [], name, problem: `Непонятная папка «${shelfName}»: нужна «${LIBRARY_SHELVES.places}» или «${LIBRARY_SHELVES.items}».` };
  return { kind, folders, name, problem: '' };
}

/**
 * The library folder for a chain of names, made where it is missing; → { library, folderId }.
 * Folders are told apart by name inside their parent, without case. An empty chain is the folder «Из папки».
 */
export function ensureFolderChain(library, names) {
  let next = library;
  let parentId = '';
  for (const name of names.length ? names : [INBOX_FOLDER]) {
    const found = next.folders.find(folder => !folder.persona && (folder.parentId ?? '') === parentId && norm(folder.name) === norm(name));
    if (found) { parentId = found.id; continue; }
    if (next.folders.length >= LIBRARY_LIMITS.folders) throw new RangeError('Слишком много папок в библиотеке.');
    const made = addFolder(next, { name, parentId });
    next = made.library;
    parentId = made.folder.id;
  }
  return { library: next, folderId: parentId };
}

/** A new place or thing for a picture of the tree; → { library, entry }. */
export function addFromTreePicture(library, place, image, placeholder) {
  const { library: home, folderId } = ensureFolderChain(library, place.folders);
  const fields = { folderId, name: place.name || placeholder, image };
  const made = place.kind === 'items' ? addLibraryItem(home, fields) : addLocation(home, fields);
  const entry = made.item ?? made.location;
  if (!entry?.image) throw new Error('Путь картинки не подошёл.');
  return { library: made.library, entry };
}
