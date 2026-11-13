/** Кнопки пресета: какие тогглы вынесены под верхнюю панель и с какими подписями. Чистые функции над settings.chips. */
import { chipKey } from './settings.js';

export { chipKey };
export const LABEL_MAX = 24;

/** Название промпта без эмодзи и значков в начале: «🧠 Think | GEMINI 3.7» → «Think | GEMINI 3.7». */
export function plainName(name) {
  return String(name ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || String(name ?? '').trim();
}

export function chipsFor(settings, key) {
  const list = settings.chips[key];
  return Array.isArray(list) ? list : [];
}

export function isPinned(settings, key, id) {
  return chipsFor(settings, key).some(chip => chip.id === id);
}

/** Закрепить или открепить тоггл. Возвращает новое состояние. */
export function togglePin(settings, key, id) {
  const list = chipsFor(settings, key);
  const index = list.findIndex(chip => chip.id === id);
  if (index >= 0) {
    list.splice(index, 1);
    if (!list.length) delete settings.chips[key];
    return false;
  }
  settings.chips[key] = [...list, { id, label: '' }];
  return true;
}

/** Короткая подпись живёт только на кнопке, сам промпт не меняется. Пустая подпись = название промпта. */
export function setLabel(settings, key, id, label) {
  const chip = chipsFor(settings, key).find(item => item.id === id);
  if (!chip) return false;
  chip.label = String(label ?? '').slice(0, LABEL_MAX).trim();
  return true;
}

/**
 * Что показать на панели: закреплённые тогглы, которые есть в текущем пресете, в порядке закрепления.
 * @param {{ id: string, name: string, enabled: boolean }[]} prompts
 */
export function barItems(settings, key, prompts) {
  const byId = new Map(prompts.map(prompt => [prompt.id, prompt]));
  return chipsFor(settings, key)
    .filter(chip => byId.has(chip.id))
    .map(chip => {
      const prompt = byId.get(chip.id);
      return { id: chip.id, label: chip.label || plainName(prompt.name), title: prompt.name, enabled: prompt.enabled };
    });
}
