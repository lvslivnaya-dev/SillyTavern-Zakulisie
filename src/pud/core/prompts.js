/**
 * Библиотека встроенных промптов Закулисья: тексты, которые подставляются в описание нарратора
 * (персонажа таверны) при его создании. Чистая логика без DOM и таверны.
 * Хранится в settings.prompts: [{ id, name, text, isDefault }].
 */

export const PROMPT_NAME_MAX = 80;
export const PROMPT_TEXT_MAX = 60000;

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function newId(prompts) {
  const taken = new Set(prompts.map(item => item.id));
  for (let n = 1; n < 1_000_000; n++) if (!taken.has(`p${n}`)) return `p${n}`;
  return `p${Date.now()}`;
}

/** Любое сохранённое значение → чистый список промптов (не больше одного «по умолчанию»). */
export function normalizePrompts(raw) {
  const out = [];
  let hasDefault = false;
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isPlainObject(item)) continue;
    const id = typeof item.id === 'string' && item.id && !out.some(prompt => prompt.id === item.id) ? item.id : newId(out);
    const isDefault = Boolean(item.isDefault) && !hasDefault;
    hasDefault ||= isDefault;
    out.push({
      id,
      name: String(item.name ?? '').slice(0, PROMPT_NAME_MAX),
      text: String(item.text ?? '').slice(0, PROMPT_TEXT_MAX),
      isDefault,
    });
  }
  return out;
}

export function addPrompt(prompts, { name = '', text = '' } = {}) {
  const list = normalizePrompts(prompts);
  const prompt = { id: newId(list), name: String(name).slice(0, PROMPT_NAME_MAX), text: String(text).slice(0, PROMPT_TEXT_MAX), isDefault: false };
  return { prompts: [...list, prompt], id: prompt.id };
}

export function updatePrompt(prompts, id, patch = {}) {
  return normalizePrompts(prompts).map(item => {
    if (item.id !== id) return item;
    const next = { ...item };
    if ('name' in patch) next.name = String(patch.name).slice(0, PROMPT_NAME_MAX);
    if ('text' in patch) next.text = String(patch.text).slice(0, PROMPT_TEXT_MAX);
    return next;
  });
}

export function removePrompt(prompts, id) {
  return normalizePrompts(prompts).filter(item => item.id !== id);
}

/** Копия сразу после оригинала; «по умолчанию» у копии выключено. */
export function duplicatePrompt(prompts, id) {
  const list = normalizePrompts(prompts);
  const index = list.findIndex(item => item.id === id);
  if (index < 0) return { prompts: list, id: '' };
  const copy = { ...list[index], id: newId(list), name: `${list[index].name} (копия)`.slice(0, PROMPT_NAME_MAX), isDefault: false };
  return { prompts: [...list.slice(0, index + 1), copy, ...list.slice(index + 1)], id: copy.id };
}

/** Один промпт «по умолчанию» на всех: включение у одного снимает у остальных; повторный клик снимает. */
export function setDefaultPrompt(prompts, id) {
  const list = normalizePrompts(prompts);
  const was = list.find(item => item.id === id)?.isDefault;
  return list.map(item => ({ ...item, isDefault: item.id === id && !was }));
}

/** Текст для нового нарратора: промпт «по умолчанию» или пусто. */
export function defaultPromptText(prompts) {
  return normalizePrompts(prompts).find(item => item.isDefault)?.text ?? '';
}

/** Приблизительный размер в токенах (как в остальных местах: знаки / 3.5). */
export function promptTokens(text) {
  return Math.ceil(String(text ?? '').length / 3.5);
}
