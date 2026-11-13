/**
 * «Что сработало»: разбор одного сканирования лорбуков таверны.
 * Таверна не отдаёт, каким ключом зацепилась запись и почему другая не вошла, но пишет это в
 * console.debug. Регистратор читает эти строки, плюс событие WORLDINFO_SCAN_DONE (что реально
 * вошло, бюджет, все записи сканирования), и собирает запись-отчёт. Чистая логика, без DOM.
 *
 * Отчёт:
 * {
 *   v, at, type, dry, limit, overflow,
 *   on:   [{ w, u, t, how, key, key2, logic, rec, deep, pos, depth, tok }],  вошли в промпт
 *   off:  [{ w, u, t, why, key, info }],                                   нашлись, но не вошли
 *   miss: [{ w, u, t, keys, scan }],                                       ключ не встретился (только в памяти)
 * }
 */
import { entryTitle, keysOf, POSITIONS, AT_DEPTH } from './lore-entries.js';

export const RECORD_VERSION = 1;
export const EXTRA_KEY = 'pud_lore';

/** Как запись попала в промпт. */
export const HOW = {
  key: 'по ключу',
  constant: 'всегда (константа)',
  sticky: 'липкая, держится с прошлых ходов',
  external: 'извне: векторы или другое расширение',
  decorator: 'метка @@activate',
  unknown: 'сработала',
};

/** Почему нашлась, но не вошла (или вообще не проверялась). */
export const WHY = {
  secondary: 'основной ключ есть, а вторичные не подошли',
  probability: 'не выпал шанс срабатывания',
  budget: 'не влезла в бюджет лорбуков',
  group: 'проиграла другой записи своей группы',
  cooldown: 'перезарядка (cooldown) после прошлого срабатывания',
  delay: 'задержка (delay): чату ещё мало сообщений',
  recursionDelay: 'ждёт рекурсии: срабатывает только от текста других записей',
  excludeRecursion: 'не срабатывает от текста других записей',
  trigger: 'не тот тип генерации (фильтр «срабатывать при»)',
  character: 'фильтр по персонажу',
  tag: 'фильтр по тегу персонажа',
  dontActivate: 'метка @@dont_activate',
  nokeys: 'у записи нет ключей',
  empty: 'пустой текст записи',
  unknown: 'не вошла, причину таверна не написала',
};

const LOGIC_NAMES = { 'AND ANY': 'и любой из', 'NOT ALL': 'и не все из', 'NOT ANY': 'и ни одного из', 'AND ALL': 'и все из' };

const idOf = entry => `${entry?.world}.${entry?.uid}`;
const isEntry = value => value !== null && typeof value === 'object' && 'uid' in value && 'world' in value;
const asText = value => (Array.isArray(value) ? value.map(String).join(', ') : value === undefined || value === null ? '' : String(value));

/** Куда запись вставляется, коротко: «до перса», «глубина 4». */
export function positionLabel(pos, depth) {
  if (Number(pos) === AT_DEPTH) return `глубина ${Number(depth) || 0}`;
  return POSITIONS.find(item => item.value === Number(pos))?.short ?? '';
}

/** Строка из START: «[WI] --- START WI SCAN (on 12 messages, trigger = swipe) (DRY RUN) ---». */
export function parseStart(text) {
  if (typeof text !== 'string' || !text.startsWith('[WI] --- START WI SCAN')) return null;
  return { type: /trigger = ([a-z_]+)/.exec(text)?.[1] ?? 'normal', dry: text.includes('(DRY RUN)') };
}

export function createRecorder({ now = () => new Date().toISOString() } = {}) {
  let scan = null;

  const slotIn = (target, entry) => {
    const id = idOf(entry);
    let item = target.items.get(id);
    if (!item) {
      item = { id, entry, how: '', key: '', key2: '', logic: '', why: '', info: '', disabled: false, rec: false, deep: false };
      target.items.set(id, item);
    }
    return item;
  };
  const slot = entry => slotIn(scan, entry);

  /** Строка лога о записи: «[WI] Entry 12», «текст», …значения. */
  const entryLine = (args) => {
    const uid = /^\[WI\] Entry (\S+)/.exec(args[0])?.[1];
    const text = typeof args[1] === 'string' ? args[1] : '';
    const object = args.slice(1).find(isEntry);
    if (text.startsWith('from \'') && text.endsWith(' processing') && object) {
      scan.current = object;
      slot(object);
      return;
    }
    const entry = object ?? (scan.current && String(scan.current.uid) === uid ? scan.current : null);
    if (!entry) return;
    const item = slot(entry);
    const value = args[2];
    if (text === 'disabled') item.disabled = true;
    else if (text.startsWith('skipped by generation type trigger filter')) item.why = 'trigger';
    else if (text === 'filtered out by character') item.why = 'character';
    else if (text === 'filtered out by tag') item.why = 'tag';
    else if (text.startsWith('suppressed by delay until recursion')) item.why = 'recursionDelay';
    else if (text === 'suppressed by delay') item.why = 'delay';
    else if (text === 'suppressed by cooldown') item.why = 'cooldown';
    else if (text === 'suppressed by exclude recursion') item.why = 'excludeRecursion';
    else if (text.startsWith('suppressed by @@dont_activate')) item.why = 'dontActivate';
    else if (text.startsWith('has no keys defined')) item.why = 'nokeys';
    else if (text.startsWith('activated by @@activate')) { item.how = 'decorator'; item.why = ''; }
    else if (text === 'externally activated') { item.how = 'external'; item.why = ''; }
    else if (text === 'activated because of constant') { item.how = 'constant'; item.why = ''; }
    else if (text === 'activated because active sticky') { item.how = 'sticky'; item.why = ''; }
    else if (text === 'activated by primary key match') { item.how = 'key'; item.key = asText(value); item.key2 = ''; item.logic = ''; item.why = ''; }
    else if (text === 'Entry with primary key match') { item.key = asText(value); item.key2 = ''; item.logic = ''; }
    else if (text.startsWith('activated. (')) {
      const logic = /^activated\. \(([A-Z ]+)\)/.exec(text)?.[1] ?? '';
      item.how = 'key';
      item.logic = LOGIC_NAMES[logic] ?? logic;
      item.key2 = asText(value);
      item.why = '';
    } else if (text.startsWith('skipped. Secondary keywords not satisfied')) { item.why = 'secondary'; item.info = asText(value); }
    else if (/removed as .*loser from inclusion group '(.*)'/.test(text)) { item.why = 'group'; item.info = /group '(.*)'/.exec(text)[1]; }
    else if (text.startsWith('skipped adding to prompt due to empty content')) item.why = 'empty';
  };

  const finish = () => {
    if (!scan) return null;
    const done = scan;
    scan = null;
    const on = [];
    const off = [];
    const miss = [];
    const meta = entry => ({ w: String(entry.world ?? ''), u: entry.uid, t: entryTitle(entry) });
    for (const entry of done.sorted) slotIn(done, entry);
    for (const item of done.items.values()) {
      const entry = item.entry;
      if (!entry) continue;
      if (done.active.has(item.id)) {
        const real = done.active.get(item.id) ?? entry;
        const how = item.how || (real.constant ? 'constant' : real.vectorized ? 'external' : 'unknown');
        on.push({ ...meta(real), how, key: item.key, key2: item.key2, logic: item.logic, rec: item.rec, deep: item.deep, pos: Number(real.position) || 0, depth: Number(real.depth) || 0, content: String(real.content ?? '') });
      } else if (item.disabled) {
        continue;
      } else if (item.why) {
        off.push({ ...meta(entry), why: item.why, key: item.key, info: item.info });
      } else if (item.how) {
        off.push({ ...meta(entry), why: done.overflow ? 'budget' : 'unknown', key: item.key, info: '' });
      } else {
        miss.push({ ...meta(entry), keys: keysOf(entry), scan: entry.scanDepth ?? null });
      }
    }
    return { v: RECORD_VERSION, at: done.at, type: done.type, dry: done.dry, limit: done.limit, overflow: done.overflow, on, off, miss };
  };

  return {
    get scanning() { return Boolean(scan); },

    /** Строка консоли (console.debug / console.log). Возвращает законченный отчёт, когда сканирование закончилось. */
    line(args) {
      const head = args?.[0];
      if (typeof head !== 'string') return null;
      const start = parseStart(head);
      if (start) {
        const previous = finish();
        scan = { ...start, at: now(), items: new Map(), current: null, active: new Map(), sorted: [], limit: 0, overflow: false };
        return previous;
      }
      if (!scan) return null;
      if (head.startsWith('[WI] --- DONE')) return finish();
      if (head.startsWith('[WI] Entry ')) { entryLine(args); return null; }
      if (head.startsWith('WI entry ') && head.includes('failed probability check')) {
        const entry = args.find(isEntry);
        if (entry) { const item = slot(entry); item.why = 'probability'; item.info = asText(entry.probability); }
      }
      return null;
    },

    /** Событие WORLDINFO_SCAN_DONE (после каждого круга сканирования). */
    loop(data) {
      if (!scan || !data) return;
      if (Array.isArray(data.sortedEntries) && !scan.sorted.length) scan.sorted = data.sortedEntries;
      const active = data.activated?.entries;
      if (active instanceof Map) {
        for (const entry of active.values()) {
          if (scan.active.has(idOf(entry))) continue;
          scan.active.set(idOf(entry), entry);
          const item = slot(entry);
          if (data.state?.current === 2) item.rec = true;
          if (data.state?.current === 3) item.deep = true;
        }
      }
      scan.limit = Number(data.budget?.current) || scan.limit;
      scan.overflow = Boolean(data.budget?.overflowed) || scan.overflow;
    },

    finish,
  };
}

/**
 * Сколько записей «нашлись, но не вошли» оседает в сообщении. Таких записей бывает по тысяче на ответ, а чат целиком
 * переписывается на диск при каждом сохранении: без предела файл рос на сотни килобайт за ответ и таверна начинала зависать.
 */
export const OFF_STORED_MAX = 40;

const clipText = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const lightOff = item => ({ ...item, key: clipText(item.key, 80), info: clipText(item.info, 120) });

/** Что сохраняется в сообщении: без списка «не нашлись», без текстов записей и с коротким списком «не вошли». */
export function storable(record) {
  if (!record) return null;
  const { miss, ...rest } = record;
  const off = record.off ?? [];
  return {
    ...rest,
    on: record.on.map(({ content, ...item }) => item),
    off: off.slice(0, OFF_STORED_MAX).map(lightOff),
    ...(off.length > OFF_STORED_MAX ? { offTotal: off.length } : {}),
  };
}

/** Старый отчёт, сохранённый без предела: ужимает список «не вошли» на месте. true = что-то изменилось. */
export function trimStored(record) {
  if (!record || !Array.isArray(record.off)) return false;
  let changed = false;
  if ('miss' in record) { delete record.miss; changed = true; }
  if (record.off.length > OFF_STORED_MAX) {
    record.offTotal = Math.max(record.offTotal ?? 0, record.off.length);
    record.off = record.off.slice(0, OFF_STORED_MAX).map(lightOff);
    changed = true;
  }
  return changed;
}

/** Сколько записей не вошло всего (в сохранённом отчёте список может быть короче). */
export const offCount = record => record?.offTotal ?? record?.off?.length ?? 0;

/** Бейдж сообщения: «7» и подсказка. */
export function chipText(record) {
  const count = record?.on?.length ?? 0;
  const skipped = offCount(record);
  return { count, title: `Из лорбуков сработало: ${count}${skipped ? `, нашлось, но не вошло: ${skipped}` : ''}. Нажми, чтобы посмотреть.` };
}

/** Записи по книгам: [{ book, items }], книги по алфавиту, записи в исходном порядке. */
export function byBook(items) {
  const books = new Map();
  for (const item of items ?? []) {
    if (!books.has(item.w)) books.set(item.w, []);
    books.get(item.w).push(item);
  }
  return [...books.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([book, list]) => ({ book, items: list }));
}

/** Поиск по названию записи, книге и ключам. */
export function matches(item, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  return [item.t, item.w, item.key, item.key2, ...(item.keys ?? [])].some(text => String(text ?? '').toLowerCase().includes(q));
}

/** Описание срабатывания одной записи по-русски. */
export function howText(item) {
  if (item.how === 'key') {
    const main = item.key ? `ключ «${item.key}»` : 'по ключу';
    return item.key2 ? `${main} ${item.logic || '+'} «${item.key2}»` : main;
  }
  return HOW[item.how] ?? HOW.unknown;
}

export function whyText(item) {
  const base = WHY[item.why] ?? WHY.unknown;
  if (item.why === 'secondary' && item.info) return `${base}: ${item.info}`;
  if (item.why === 'group' && item.info) return `${base} «${item.info}»`;
  if (item.why === 'probability' && item.info) return `${base} (${item.info}%)`;
  return base;
}
