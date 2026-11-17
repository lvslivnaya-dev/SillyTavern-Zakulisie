/**
 * Визуальные пресеты: сохранённый вид Закулисья. Пресет = любые из четырёх частей (все заполнять не обязательно):
 *   background — фон таверны (имя файла фона);
 *   palette    — палитра (id; своя палитра кладётся целиком, чтобы пресет работал и без неё в списке) и лапки;
 *   icons      — свои иконки ({ pud, studio });
 *   mood       — «тема по настроению» (правила налёта, сила, включено).
 * При применении меняются только те части, что есть в пресете. Чистая логика без DOM.
 */
import { normalizeIcons } from '../../shared/custom-icons.js';
import { normalizeMoodTheme } from './mood-theme.js';
import { DEFAULT_PALETTE, PALETTES, sanitizeCustomPalettes } from './palettes.js';

export const PART_IDS = Object.freeze(['background', 'palette', 'icons', 'mood']);
export const PART_LABELS = Object.freeze({ background: 'Фон', palette: 'Палитра', icons: 'Иконки', mood: 'Тема по настроению' });
export const PRESET_LIMITS = Object.freeze({ presets: 30, name: 60, background: 200 });

const clipName = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, PRESET_LIMITS.name);

/** One part, cleaned; null when it is empty or broken (then the preset does not have it). */
export function cleanPart(id, raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (id === 'background') {
    const name = String(raw.name ?? '').trim().slice(0, PRESET_LIMITS.background);
    return name ? { name } : null;
  }
  if (id === 'palette') {
    const custom = sanitizeCustomPalettes(raw.custom ? [raw.custom] : [])[0] ?? null;
    const known = custom?.id ?? (PALETTES.some(item => item.id === raw.id) ? raw.id : '');
    if (!known) return null;
    const paws = raw.paws && typeof raw.paws === 'object' ? { background: raw.paws.background !== false, chat: raw.paws.chat !== false } : null;
    return { id: known, ...(custom ? { custom } : {}), ...(paws ? { paws } : {}) };
  }
  if (id === 'icons') {
    const icons = normalizeIcons(raw);
    return Object.keys(icons.pud).length + Object.keys(icons.studio).length ? icons : null;
  }
  if (id === 'mood') return normalizeMoodTheme(raw);
  return null;
}

/** The saved list → a tidy one: unique ids, names, only the parts that survive cleaning, at least one part each. */
export function normalizePresets(raw) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const id = typeof item?.id === 'string' && item.id ? item.id.slice(0, 40) : '';
    if (!id || seen.has(id)) continue;
    const parts = {};
    for (const part of PART_IDS) { const clean = cleanPart(part, item.parts?.[part]); if (clean) parts[part] = clean; }
    if (!Object.keys(parts).length) continue;
    seen.add(id);
    out.push({ id, name: clipName(item.name) || 'Пресет', parts });
    if (out.length >= PRESET_LIMITS.presets) break;
  }
  return out;
}

/**
 * What is on now, as parts: `now` = { background: 'name.jpg' | '', palette: { id, custom, paws }, icons, mood }.
 * Only the asked-for parts (`include`, a list of ids) are taken.
 */
export function capture(now, include = PART_IDS) {
  const parts = {};
  for (const id of PART_IDS) {
    if (!include.includes(id)) continue;
    const raw = id === 'background' ? (now?.background ? { name: now.background } : null) : now?.[id];
    const clean = cleanPart(id, raw);
    if (clean) parts[id] = clean;
  }
  return parts;
}

let counter = 0;
const newId = list => { let id; do { counter += 1; id = `vp-${Date.now().toString(36)}${counter.toString(36)}`; } while (list.some(item => item.id === id)); return id; };

/** A new preset from the current look. Throws a Russian sentence when there is nothing to keep. */
export function addPreset(list, name, now, include = PART_IDS) {
  const presets = normalizePresets(list);
  if (presets.length >= PRESET_LIMITS.presets) throw new Error(`Пресетов уже ${PRESET_LIMITS.presets}: удалите ненужные.`);
  const parts = capture(now, include);
  if (!Object.keys(parts).length) throw new Error('Нечего сохранять: отметьте хотя бы одну часть, в которой что-то выбрано (фон, палитра, свои иконки или правила темы).');
  const title = clipName(name) || `Пресет ${presets.length + 1}`;
  return [...presets, { id: newId(presets), name: title, parts }];
}

export const removePreset = (list, id) => normalizePresets(list).filter(item => item.id !== id);
export const renamePreset = (list, id, name) => normalizePresets(list).map(item => (item.id === id ? { ...item, name: clipName(name) || item.name } : item));

/**
 * Change the parts of a preset: `now` is the current look. `add` takes these parts from the current look (or replaces them),
 * `drop` removes parts; a preset keeps at least one part.
 */
export function changeParts(list, id, now, { add = [], drop = [] } = {}) {
  return normalizePresets(list).map(item => {
    if (item.id !== id) return item;
    const parts = { ...item.parts };
    for (const part of drop) delete parts[part];
    Object.assign(parts, capture(now, add));
    const ordered = Object.fromEntries(PART_IDS.filter(id => parts[id]).map(id => [id, parts[id]]));
    return Object.keys(ordered).length ? { ...item, parts: ordered } : item;
  });
}

/** Short words on what a preset holds: [{ id, label, note }] in the order of the parts. */
export function describe(preset) {
  return PART_IDS.filter(id => preset?.parts?.[id]).map(id => {
    const part = preset.parts[id];
    const note = id === 'background' ? part.name
      : id === 'palette' ? (part.custom?.title ?? PALETTES.find(item => item.id === part.id)?.title ?? part.id)
        : id === 'icons' ? `${Object.keys(part.pud).length + Object.keys(part.studio).length} шт.`
          : (part.enabled ? 'включена' : 'выключена');
    return { id, label: PART_LABELS[id], note };
  });
}

export { DEFAULT_PALETTE };
