/**
 * «Аудит ключей»: что лорбуки отправляли модели за всю историю чата, а не за один ответ.
 * Берёт отчёты «Что сработало» (message.extra.pud_lore) всех ответов и считает:
 *   - какие вторичные ключи впускают записи почти в каждом ответе (шумные);
 *   - какие записи дороже всего за чат и из-за каких ключей входят;
 *   - сколько токенов лорбуков уходит за ответ в среднем.
 * Чистая логика, без DOM. Ничего не меняет в лорбуках: только показывает и собирает список слов.
 */
import { EXTRA_KEY } from './lore-trace.js';

/** Меньше стольких ответов вердиктов не выносим: выборка слишком мала. */
export const MIN_REPLIES = 4;
/** Ключ шумный: он есть минимум в такой доле ответов и открыл минимум столько разных записей. */
export const NOISY_SHARE = 0.5;
export const NOISY_ENTRIES = 3;

/**
 * Ключ лорбука так, как его читает человек: «/(?<![\p{L}])голос(?:а|ам)?(?![\p{L}])/iu» → «голос…».
 * Окончания и границы слов убираются, остаётся основа.
 */
export function plainKey(key) {
  const original = String(key ?? '').trim();
  if (!original) return '';
  let text = original;
  const regex = /^\/(.*)\/([a-z]*)$/s.exec(text);
  if (regex) text = regex[1];
  text = text
    .replace(/\(\?<?[!=][^)]*\)/g, '')
    .replace(/\(\?:[^()]*\)\??/g, '…')
    .replace(/\\[bB]/g, '')
    .replace(/^\^|\$$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || original;
}

const average = (sum, count) => (count ? Math.round(sum / count) : 0);

/**
 * chat: массив сообщений таверны. → разбор или null, если отчётов нет.
 * { replies, tokensPerReply, constantPerReply, keyPerReply, secondary, primary, entries, noisy, words }
 */
export function auditChat(chat) {
  const records = [];
  for (const message of chat ?? []) {
    const record = message?.extra?.[EXTRA_KEY];
    if (record && Array.isArray(record.on) && !message.is_user) records.push(record);
  }
  if (!records.length) return null;

  const secondary = new Map(); // ключ → { key, replies:Set, entries:Map(id → title) }
  const primary = new Map();
  const entries = new Map(); // id → { id, w, u, t, replies, total, reasons: Map }
  let tokens = 0;
  let constantTokens = 0;
  let keyTokens = 0;

  records.forEach((record, index) => {
    const seenKeys = new Set();
    for (const item of record.on) {
      const id = `${item.w}.${item.u}`;
      const cost = Number(item.tok) || 0;
      tokens += cost;
      if (item.how === 'constant') constantTokens += cost; else keyTokens += cost;
      if (!entries.has(id)) entries.set(id, { id, w: item.w, u: item.u, t: item.t, replies: 0, total: 0, constant: item.how === 'constant', reasons: new Map() });
      const entry = entries.get(id);
      entry.replies += 1;
      entry.total += cost;
      if (item.how !== 'key') continue;
      const first = plainKey(item.key);
      const second = plainKey(item.key2);
      if (first || second) {
        const reason = second ? `${first} + ${second}` : first;
        entry.reasons.set(reason, (entry.reasons.get(reason) ?? 0) + 1);
      }
      for (const [bucket, key] of [[primary, first], [secondary, second]]) {
        if (!key) continue;
        if (!bucket.has(key)) bucket.set(key, { key, replies: new Set(), entries: new Map() });
        const slot = bucket.get(key);
        slot.replies.add(index);
        slot.entries.set(id, { t: item.t, w: item.w, u: item.u });
        seenKeys.add(key);
      }
    }
  });

  const replies = records.length;
  const enough = replies >= MIN_REPLIES;
  const toList = bucket => [...bucket.values()].map(slot => ({
    key: slot.key,
    replies: slot.replies.size,
    share: slot.replies.size / replies,
    entries: slot.entries.size,
    titles: [...slot.entries.values()].map(entry => entry.t).slice(0, 6),
    refs: [...slot.entries.values()],
    noisy: enough && slot.replies.size / replies >= NOISY_SHARE && slot.entries.size >= NOISY_ENTRIES,
  })).sort((left, right) => right.replies - left.replies || right.entries - left.entries);

  const secondaryList = toList(secondary);
  const entryList = [...entries.values()].map(entry => ({
    id: entry.id, w: entry.w, u: entry.u, t: entry.t,
    replies: entry.replies,
    share: entry.replies / replies,
    perAppearance: average(entry.total, entry.replies),
    total: entry.total,
    constant: entry.constant,
    reasons: [...entry.reasons].sort((left, right) => right[1] - left[1]).slice(0, 3).map(([reason, count]) => ({ reason, count })),
  })).sort((left, right) => right.total - left.total || right.replies - left.replies);

  const noisy = secondaryList.filter(item => item.noisy);
  return {
    replies,
    enough,
    tokensPerReply: average(tokens, replies),
    constantPerReply: average(constantTokens, replies),
    keyPerReply: average(keyTokens, replies),
    secondary: secondaryList,
    primary: toList(primary),
    entries: entryList,
    noisy,
    words: noisy.map(item => item.key.replace(/…/g, '')).filter(Boolean),
  };
}

/**
 * Вторичные ключи записи без тех, что читаются как `plain` (то же слово с любыми окончаниями).
 * → { keys, removed }: новый список и сколько ключей ушло. Запись не меняется.
 */
export function withoutKey(entry, plain) {
  const keys = Array.isArray(entry?.keysecondary) ? entry.keysecondary.map(String) : [];
  const kept = keys.filter(key => plainKey(key) !== plain);
  return { keys: kept, removed: keys.length - kept.length };
}

/** Список слов шумных ключей для вставки в таблицу «Регексы» (по одному в строке). */
export function wordsText(audit) {
  return (audit?.words ?? []).join('\n');
}
