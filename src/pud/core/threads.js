/**
 * Незавершённые нити: обещания, вопросы и тайны, которые повисли в сюжете («он обещал рассказать про шрам»).
 * Живут в метаданных чата. Открытые нити уходят модели короткой напоминалкой, чтобы они не терялись и не решались сами собой.
 */

export const THREAD_STATUS = Object.freeze({ open: 'висит', snoozed: 'отложена', closed: 'закрыта' });
export const THREAD_LIMITS = Object.freeze({ text: 200, who: 60, list: 60, prompt: 5 });

let counter = 0;
const newId = () => `th:${Date.now().toString(36)}${(counter++).toString(36)}`;
const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const norm = text => cleanText(text, 400).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N} ]/gu, '').trim();

/** Список из метаданных → аккуратный список (чужое выбрасывается). */
export function normalizeThreads(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const text = cleanText(item?.text, THREAD_LIMITS.text);
    if (!text) continue;
    const id = typeof item.id === 'string' && item.id ? item.id : newId();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      text,
      who: cleanText(item?.who, THREAD_LIMITS.who),
      status: Object.hasOwn(THREAD_STATUS, item?.status) ? item.status : 'open',
      at: Number.isFinite(item?.at) ? item.at : 0,
    });
    if (out.length >= THREAD_LIMITS.list) break;
  }
  return out;
}

/** Похожа ли новая нить на уже записанную (одинаковый текст или один содержит другой). */
export function isDuplicate(text, list) {
  const target = norm(text);
  if (!target) return true;
  return list.some(item => {
    const have = norm(item.text);
    return have === target || (have.length > 12 && target.length > 12 && (have.includes(target) || target.includes(have)));
  });
}

/** Добавляет нить в начало. Пустые и повторы пропускаются: вернётся { list, thread: null }. */
export function addThread(list, { text, who = '', at = Date.now() }) {
  const clean = cleanText(text, THREAD_LIMITS.text);
  if (!clean || isDuplicate(clean, list) || list.length >= THREAD_LIMITS.list) return { list, thread: null };
  const thread = { id: newId(), text: clean, who: cleanText(who, THREAD_LIMITS.who), status: 'open', at };
  return { list: [thread, ...list], thread };
}

export const setStatus = (list, id, status) => list.map(item => (item.id === id && Object.hasOwn(THREAD_STATUS, status) ? { ...item, status } : item));
export const removeThread = (list, id) => list.filter(item => item.id !== id);
export const openThreads = list => list.filter(item => item.status === 'open');

/** Напоминалка модели про открытые нити ('' — нет открытых). */
export function threadsBlock(list, max = THREAD_LIMITS.prompt) {
  const open = openThreads(list).slice(0, Math.max(1, max));
  if (!open.length) return '';
  return `[Open story threads. Keep them alive: weave them in when it fits the scene, but do not resolve them on your own and do not rush the characters. The user decides when a thread closes.\n${open.map(item => `- ${item.who ? `${item.who}: ` : ''}${item.text}`).join('\n')}]`;
}

/** Запрос модели «найди висящие нити» по последним сообщениям. */
export function buildFindMessages({ chat, existing = [], max = 6 }) {
  const lines = chat.map(item => `${item.name || (item.isUser ? 'Автор' : 'Рассказчик')}: ${item.text}`);
  const known = existing.length ? `\n\nУже записанные нити (не повторяй их):\n${existing.map(item => `- ${item.text}`).join('\n')}` : '';
  return [
    { role: 'system', content: 'Ты помощник автора ролевого чата. Ты ищешь в переписке НЕЗАВЕРШЁННЫЕ НИТИ: обещания, на которые не последовало продолжения, вопросы без ответа, тайны и намёки, к которым стоит вернуться, брошенные планы и угрозы. Не выдумывай того, чего в тексте нет, и не включай то, что уже разрешилось.' },
    { role: 'user', content: `Переписка (старое выше, новое ниже):\n\n${lines.join('\n\n')}${known}\n\nВерни не больше ${max} нитей СТРОГО в виде JSON-массива, без пояснений и без markdown: [{"who":"кто связан (имя или пусто)","text":"нить одним коротким предложением по-русски"}]. Если нитей нет, верни [].` },
  ];
}

/** Ответ модели → [{ who, text }] (терпимо к мусору вокруг JSON). */
export function parseFound(raw) {
  const text = String(raw ?? '').replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, ' ');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return (Array.isArray(parsed) ? parsed : [])
      .map(item => ({ who: cleanText(item?.who, THREAD_LIMITS.who), text: cleanText(item?.text, THREAD_LIMITS.text) }))
      .filter(item => item.text);
  } catch { return []; }
}
