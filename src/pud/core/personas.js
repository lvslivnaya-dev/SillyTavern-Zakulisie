/**
 * Библиотека персон: чистая логика без DOM и без таверны.
 * Персоны живут в power_user.personas (аватар → имя) и power_user.persona_descriptions (аватар → описание и привязки).
 * Папки, избранное и архив — в настройках Пудреницы.
 */

/** Ключи хранилища MistraelSL Persona Panel (localStorage). */
export const LEGACY_PERSONA_KEYS = {
  favorites: 'MistraelSL_PersonaPanel_favorites',
  folders: 'MistraelSL_PersonaPanel_folders_v1',
};

export const NO_FOLDER = '__none__';
export const ALL = '__all__';

/** Позиции описания персоны (как persona_description_positions в таверне). */
export const POSITIONS = [
  { value: 0, title: 'В промпте (Story String)' },
  { value: 2, title: 'Над заметкой автора' },
  { value: 3, title: 'Под заметкой автора' },
  { value: 4, title: 'На глубине' },
  { value: 9, title: 'Не отправлять' },
];
export const ROLES = [
  { value: 0, title: 'Система' },
  { value: 1, title: 'Пользователь' },
  { value: 2, title: 'Ассистент' },
];

/**
 * Персоны таверны → удобные записи с именами привязанных персонажей.
 * @param {{ personas?: Record<string, string>, persona_descriptions?: Record<string, any> }} power
 * @param {{ characters?: any[], groups?: any[] }} world
 */
export function buildPersonas(power, { characters = [], groups = [] } = {}) {
  const byAvatar = new Map(characters.map(character => [character.avatar, character.name]));
  const byGroup = new Map(groups.map(group => [group.id, group.name]));
  return Object.entries(power?.personas ?? {}).map(([avatar, name]) => {
    const descriptor = power.persona_descriptions?.[avatar] ?? {};
    const connections = (Array.isArray(descriptor.connections) ? descriptor.connections : [])
      .map(connection => ({
        type: connection.type === 'group' ? 'group' : 'character',
        id: String(connection.id ?? ''),
        name: connection.type === 'group' ? byGroup.get(connection.id) : byAvatar.get(connection.id),
      }))
      .filter(connection => connection.id);
    return {
      avatar,
      name: String(name ?? ''),
      title: String(descriptor.title ?? ''),
      description: String(descriptor.description ?? ''),
      lorebook: String(descriptor.lorebook ?? ''),
      position: Number(descriptor.position ?? 0),
      depth: Number(descriptor.depth ?? 2),
      role: Number(descriptor.role ?? 0),
      connections,
    };
  });
}

/** Папки общие для персон и персонажей: kind — 'personas' или 'characters'. */
export const folderOf = (settings, avatar, kind = 'personas') => settings.assignments[kind][avatar]?.[0] ?? '';

/**
 * Список под фильтры окна.
 * view: all | linked (к открытому персонажу) | fav | archive. Архивные видны только в архиве.
 * sort: name | linked (привязанные к открытому персонажу первыми).
 */
export function filterPersonas(list, settings, { view = 'all', folder = ALL, query = '', sort = 'name', connection = null } = {}) {
  const favorites = new Set(settings.favorites.personas);
  const archived = new Set(settings.archive.personas);
  const needle = query.trim().toLowerCase();
  const linked = persona => Boolean(connection) && persona.connections.some(item => item.type === connection.type && item.id === connection.id);
  const result = list.filter(persona => {
    if ((view === 'archive') !== archived.has(persona.avatar)) return false;
    if (view === 'fav' && !favorites.has(persona.avatar)) return false;
    if (view === 'linked' && !linked(persona)) return false;
    const inFolder = folderOf(settings, persona.avatar);
    if (folder === NO_FOLDER && inFolder) return false;
    if (folder !== ALL && folder !== NO_FOLDER && inFolder !== folder) return false;
    if (!needle) return true;
    return persona.name.toLowerCase().includes(needle)
      || persona.title.toLowerCase().includes(needle)
      || persona.description.toLowerCase().includes(needle);
  });
  const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
  return result.sort(sort === 'linked'
    ? (a, b) => Number(linked(b)) - Number(linked(a)) || Number(favorites.has(b.avatar)) - Number(favorites.has(a.avatar)) || byName(a, b)
    : (a, b) => Number(favorites.has(b.avatar)) - Number(favorites.has(a.avatar)) || byName(a, b));
}

/** Счётчики для папок (без архива). */
export function folderCounts(list, settings, kind = 'personas') {
  const archived = new Set(settings.archive[kind]);
  const counts = { [ALL]: 0, [NO_FOLDER]: 0 };
  for (const persona of list) {
    if (archived.has(persona.avatar)) continue;
    counts[ALL]++;
    const folder = folderOf(settings, persona.avatar, kind);
    const key = folder && settings.folders[kind].some(item => item.id === folder) ? folder : NO_FOLDER;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const cleanName = name => String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);

export function createFolder(settings, name, kind = 'personas') {
  const clean = cleanName(name);
  if (!clean) return null;
  const folder = { id: newId(), name: clean, parent: null };
  settings.folders[kind].push(folder);
  return folder;
}

export function renameFolder(settings, id, name, kind = 'personas') {
  const folder = settings.folders[kind].find(item => item.id === id);
  const clean = cleanName(name);
  if (!folder || !clean) return false;
  folder.name = clean;
  return true;
}

/** Удаляет папку; персоны из неё остаются без папки. */
export function deleteFolder(settings, id, kind = 'personas') {
  settings.folders[kind] = settings.folders[kind].filter(item => item.id !== id);
  for (const [avatar, folders] of Object.entries(settings.assignments[kind])) {
    if (folders.includes(id)) delete settings.assignments[kind][avatar];
  }
}

/** Кладёт персону в папку ('' — без папки). У персоны одна папка. */
export function moveToFolder(settings, avatar, folderId, kind = 'personas') {
  if (folderId && settings.folders[kind].some(item => item.id === folderId)) settings.assignments[kind][avatar] = [folderId];
  else delete settings.assignments[kind][avatar];
}

/** Убирает следы удалённой персоны из настроек. */
export function forgetPersona(settings, avatar) {
  delete settings.assignments.personas[avatar];
  delete settings.personaLooks?.[avatar];
  settings.favorites.personas = settings.favorites.personas.filter(item => item !== avatar);
  settings.archive.personas = settings.archive.personas.filter(item => item !== avatar);
}

/** Статистика для окошка «Статистика». */
export function personaStats(list, settings) {
  const archived = new Set(settings.archive.personas);
  return {
    total: list.length,
    archived: list.filter(persona => archived.has(persona.avatar)).length,
    favorites: settings.favorites.personas.filter(avatar => list.some(persona => persona.avatar === avatar)).length,
    withDescription: list.filter(persona => persona.description.trim()).length,
    withLorebook: list.filter(persona => persona.lorebook).length,
    linked: list.filter(persona => persona.connections.length).length,
    unlinked: list.filter(persona => !persona.connections.length).length,
    folders: settings.folders.personas.length,
    words: list.reduce((sum, persona) => sum + (persona.description.match(/\S+/g)?.length ?? 0), 0),
  };
}

/**
 * Привязка персоны к персонажу или группе.
 * Если несколько персон на одного персонажа нельзя, привязка снимается с остальных (как делает таверна).
 * @returns {string[]} аватары персон, у которых привязку сняли
 */
export function connect(descriptions, avatar, connection, allowMulti) {
  const descriptor = descriptions[avatar];
  if (!descriptor) return [];
  const list = Array.isArray(descriptor.connections) ? descriptor.connections : [];
  if (!list.some(item => item.type === connection.type && item.id === connection.id)) list.push({ type: connection.type, id: connection.id });
  descriptor.connections = list;
  const unlinked = [];
  if (!allowMulti) {
    for (const [other, data] of Object.entries(descriptions)) {
      if (other === avatar || !Array.isArray(data?.connections)) continue;
      const kept = data.connections.filter(item => !(item.type === connection.type && item.id === connection.id));
      if (kept.length !== data.connections.length) { data.connections = kept; unlinked.push(other); }
    }
  }
  return unlinked;
}

export function disconnect(descriptions, avatar, connection) {
  const descriptor = descriptions[avatar];
  if (!Array.isArray(descriptor?.connections)) return;
  descriptor.connections = descriptor.connections.filter(item => !(item.type === connection.type && item.id === connection.id));
}

/** Файл одной персоны для экспорта. Картинка — data URL или пусто. */
export function exportPayload(persona, image = '') {
  return {
    pudrenitsa_persona: 1,
    name: persona.name,
    title: persona.title,
    description: persona.description,
    position: persona.position,
    depth: persona.depth,
    role: persona.role,
    lorebook: persona.lorebook,
    image,
  };
}

/** Разбор файла импорта: своя одиночная персона или null (тогда это бэкап таверны). */
export function parsePersonaFile(data) {
  if (!data || typeof data !== 'object' || data.pudrenitsa_persona !== 1 || !cleanName(data.name)) return null;
  const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  return {
    name: cleanName(data.name),
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    position: number(data.position, 0),
    depth: number(data.depth, 2),
    role: number(data.role, 0),
    lorebook: String(data.lorebook ?? ''),
    image: typeof data.image === 'string' && data.image.startsWith('data:image/') ? data.image : '',
  };
}

/** Один раз забирает избранное и папки MistraelSL Persona Panel. */
export function importLegacyPersonas(settings, read) {
  if (settings.library.personasImported) return false;
  settings.library.personasImported = true;
  const parse = (key, fallback) => { try { return JSON.parse(read(key) || '') ?? fallback; } catch { return fallback; } };
  let moved = false;
  const favorites = parse(LEGACY_PERSONA_KEYS.favorites, []);
  if (Array.isArray(favorites)) {
    for (const avatar of favorites) {
      if (typeof avatar === 'string' && !settings.favorites.personas.includes(avatar)) { settings.favorites.personas.push(avatar); moved = true; }
    }
  }
  const state = parse(LEGACY_PERSONA_KEYS.folders, {});
  if (state && Array.isArray(state.folders)) {
    const ids = new Map();
    for (const item of state.folders) {
      const name = cleanName(item?.name);
      if (!item?.id || !name) continue;
      const existing = settings.folders.personas.find(folder => folder.name === name);
      const folder = existing ?? createFolder(settings, name);
      ids.set(String(item.id), folder.id);
      moved = true;
    }
    for (const [avatar, folderId] of Object.entries(state.assignments ?? {})) {
      const target = ids.get(String(folderId));
      if (target && !settings.assignments.personas[avatar]) settings.assignments.personas[avatar] = [target];
    }
  }
  return moved;
}
