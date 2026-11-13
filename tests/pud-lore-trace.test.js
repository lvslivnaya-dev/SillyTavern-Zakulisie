import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRecorder, storable, trimStored, offCount, chipText, OFF_STORED_MAX, howText, whyText, byBook, matches, parseStart, EXTRA_KEY } from '../src/pud/core/lore-trace.js';
import { startLoreTrace, tapConsole, CHIP_CLASS, MENU_ID } from '../src/pud/ui/lore-trace.js';

const entry = (world, uid, extra = {}) => ({ world, uid, comment: `${world} #${uid}`, key: [`k${uid}`], keysecondary: [], content: `текст ${uid}`, position: 0, depth: 4, ...extra });

/** Повторяет, что пишет таверна (world-info.js checkWorldInfo) за одно сканирование. */
function playScan(feed, loop, { dry = false, trigger = 'normal' } = {}) {
  const ran = entry('Ран', 1);
  const sec = entry('Ран', 2, { keysecondary: ['двор'] });
  const cool = entry('Ран', 3);
  const off = entry('Ран', 4, { disable: true });
  const lost = entry('Мир', 1, { probability: 30 });
  const always = entry('Мир', 2, { constant: true });
  const quiet = entry('Мир', 3, { key: ['тишина'], scanDepth: 2 });
  const fat = entry('Мир', 4);
  const rec = entry('Мир', 5);
  const sorted = [ran, sec, cool, off, lost, always, quiet, fat, rec];
  const debug = (...args) => feed(args);
  debug(`[WI] --- START WI SCAN (on 12 messages, trigger = ${trigger})${dry ? ' (DRY RUN)' : ''} ---`);
  debug('[WI] Entry 4', 'from \'Ран\' processing', off); debug('[WI] Entry 4', 'disabled');
  debug('[WI] Entry 3', 'from \'Ран\' processing', cool); debug('[WI] Entry 3', 'suppressed by cooldown');
  debug('[WI] Entry 2', 'from \'Мир\' processing', always); debug('[WI] Entry 2', 'activated because of constant');
  debug('[WI] Entry 1', 'from \'Ран\' processing', ran); debug('[WI] Entry 1', 'activated by primary key match', 'Ран');
  debug('[WI] Entry 2', 'from \'Ран\' processing', sec);
  debug('[WI] Entry 2', 'Entry with primary key match', 'Ран', 'has secondary keywords. Checking with logic logic', ['AND_ANY', 0]);
  debug('[WI] Entry 2', 'activated. (AND ANY) Found match secondary keyword', 'двор');
  debug('[WI] Entry 1', 'from \'Мир\' processing', lost); debug('[WI] Entry 1', 'activated by primary key match', 'город');
  debug('[WI] Entry 4', 'from \'Мир\' processing', fat); debug('[WI] Entry 4', 'activated by primary key match', 'дом');
  debug('WI entry 1 failed probability check, removing from activated entries', lost);
  const active = new Map([[`Мир.2`, always], ['Ран.1', ran], ['Ран.2', sec]]);
  loop({ state: { current: 1, next: 2 }, activated: { entries: active }, sortedEntries: sorted, budget: { current: 900, overflowed: true } });
  debug('[WI] Entry 5', 'from \'Мир\' processing', rec); debug('[WI] Entry 5', 'activated by primary key match', 'катана');
  active.set('Мир.5', rec);
  loop({ state: { current: 2, next: 0 }, activated: { entries: active }, sortedEntries: sorted, budget: { current: 900, overflowed: true } });
  return feed([`[WI] --- DONE${dry ? ' (DRY RUN)' : ''} ---`]);
}

function record(options) {
  const recorder = createRecorder({ now: () => '2026-11-08T10:00:00.000Z' });
  let done = null;
  playScan(args => { const result = recorder.line(args); if (result) done = result; return result; }, data => recorder.loop(data), options);
  return done;
}

test('START: тип генерации и пробный прогон', () => {
  assert.deepEqual(parseStart('[WI] --- START WI SCAN (on 3 messages, trigger = swipe) ---'), { type: 'swipe', dry: false });
  assert.deepEqual(parseStart('[WI] --- START WI SCAN (on 3 messages, trigger = normal) (DRY RUN) ---'), { type: 'normal', dry: true });
  assert.equal(parseStart('[WI] другое'), null);
});

test('отчёт: кто вошёл и каким ключом, кто не вошёл и почему, у кого ключ не встретился', () => {
  const rec = record();
  assert.equal(rec.type, 'normal');
  assert.equal(rec.limit, 900);
  assert.equal(rec.overflow, true);
  const on = Object.fromEntries(rec.on.map(item => [`${item.w}.${item.u}`, item]));
  assert.deepEqual(Object.keys(on).sort(), ['Мир.2', 'Мир.5', 'Ран.1', 'Ран.2']);
  assert.equal(on['Ран.1'].how, 'key');
  assert.equal(on['Ран.1'].key, 'Ран');
  assert.equal(howText(on['Ран.2']), 'ключ «Ран» и любой из «двор»');
  assert.equal(on['Мир.2'].how, 'constant');
  assert.equal(on['Мир.5'].rec, true, 'вошла на круге рекурсии');
  assert.equal(on['Ран.1'].rec, false);
  const off = Object.fromEntries(rec.off.map(item => [`${item.w}.${item.u}`, item]));
  assert.equal(off['Ран.3'].why, 'cooldown');
  assert.equal(off['Мир.1'].why, 'probability');
  assert.equal(whyText(off['Мир.1']), 'не выпал шанс срабатывания (30%)');
  assert.equal(off['Мир.4'].why, 'budget', 'ключ нашёлся, бюджет переполнен');
  assert.equal(off['Мир.4'].key, 'дом');
  assert.equal(off['Ран.4'], undefined, 'выключенные записи не показываем');
  assert.deepEqual(rec.miss.map(item => `${item.w}.${item.u}`), ['Мир.3']);
  assert.deepEqual(rec.miss[0].keys, ['тишина']);
  assert.equal(rec.miss[0].scan, 2);
});

test('в сообщение уходит без текстов записей и без «не нашлись»', () => {
  const saved = storable(record());
  assert.equal(saved.miss, undefined);
  assert.ok(saved.on.every(item => !('content' in item)));
  assert.equal(saved.on.length, 4);
});

test('список «не вошли» в сообщении короткий, чтобы чат не раздувался, а счёт остаётся полным', () => {
  const many = Array.from({ length: 1000 }, (_, index) => ({ w: 'Мир', u: index, t: `Запись ${index}`, why: 'chance', key: 'к'.repeat(300), info: 'и'.repeat(500) }));
  const saved = storable({ ...record(), off: many });
  assert.equal(saved.off.length, OFF_STORED_MAX);
  assert.equal(saved.offTotal, 1000);
  assert.ok(saved.off[0].key.length <= 80 && saved.off[0].info.length <= 120);
  assert.equal(offCount(saved), 1000);
  assert.match(chipText(saved).title, /не вошло: 1000/);
  assert.ok(JSON.stringify(saved).length < 20000, 'отчёт занимает десятки килобайт, а не сотни');
  assert.equal(storable({ ...record(), off: many.slice(0, 3) }).offTotal, undefined);
});

test('старый отчёт без предела ужимается на месте один раз', () => {
  const old = { ...record(), off: Array.from({ length: 500 }, (_, index) => ({ w: 'Мир', u: index, t: 'з', why: 'chance', key: 'к', info: '' })), miss: [{ u: 1 }] };
  assert.equal(trimStored(old), true);
  assert.equal(old.off.length, OFF_STORED_MAX);
  assert.equal(old.offTotal, 500);
  assert.equal(old.miss, undefined);
  assert.equal(trimStored(old), false, 'второй раз менять нечего');
  assert.equal(trimStored(null), false);
});

test('новое START закрывает недописанное сканирование, чужие строки не ломают разбор', () => {
  const recorder = createRecorder();
  assert.equal(recorder.line(['обычная строка']), null);
  assert.equal(recorder.line([{ not: 'string' }]), null);
  recorder.line(['[WI] --- START WI SCAN (on 1 messages, trigger = quiet) ---']);
  const previous = recorder.line(['[WI] --- START WI SCAN (on 1 messages, trigger = normal) ---']);
  assert.equal(previous.type, 'quiet');
  assert.ok(recorder.scanning);
});

test('группировка по книгам и поиск по ключу', () => {
  const groups = byBook([{ w: 'Ран', t: 'а' }, { w: 'Мир', t: 'б' }, { w: 'Ран', t: 'в' }]);
  assert.deepEqual(groups.map(group => [group.book, group.items.length]), [['Мир', 1], ['Ран', 2]]);
  assert.ok(matches({ t: 'Сано', w: 'ТМ', keys: ['Майки'] }, 'майк'));
  assert.ok(!matches({ t: 'Сано', w: 'ТМ', keys: ['Майки'] }, 'дракен'));
});

test('перехват консоли пропускает строки дальше и снимается', () => {
  const seen = [];
  const passed = [];
  const fake = { debug: (...args) => passed.push(args), log: (...args) => passed.push(args) };
  const original = fake.debug;
  const untap = tapConsole(fake, args => seen.push(args[0]));
  fake.debug('[WI] a', 1);
  fake.log('b');
  assert.deepEqual(seen, ['[WI] a', 'b']);
  assert.equal(passed.length, 2);
  untap();
  assert.equal(fake.debug, original);
});

test('модуль: отчёт ложится в ответ и его свайп, под ответом ключик, окно открывается по клику', async () => {
  const { window } = new JSDOM(`<!doctype html><body>
    <div id="options"><div class="options-content"><a id="pud-opt-chatlore"></a></div></div>
    <div id="chat"><div class="mes" mesid="1"><div class="mes_block"><div class="mes_text">привет</div></div></div></div></body>`, { pretendToBeVisual: true });
  const { document } = window;
  const listeners = {};
  const chat = [{ is_user: true, mes: 'привет' }, { is_user: false, name: 'Ран', mes: 'ответ', extra: {}, swipe_id: 0, swipe_info: [{ extra: {} }] }];
  const context = {
    chat,
    eventTypes: new Proxy({}, { get: (target, key) => String(key) }),
    eventSource: { on: (type, fn) => { (listeners[type] ??= []).push(fn); }, removeListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter(item => item !== fn); } },
    getTokenCountAsync: async text => text.length,
    getCurrentChatId: () => 'chat',
  };
  globalThis.SillyTavern = { getContext: () => context };
  const emit = (type, ...args) => { for (const fn of listeners[type] ?? []) fn(...args); };
  const fakeConsole = { debug() {}, log() {} };
  const settings = { windows: {} };
  const opened = [];
  const shared = { loreEditor: { open: (book, uid) => opened.push([book, uid]) } };
  const undo = startLoreTrace(document, { context, settings, shared, consoleTarget: fakeConsole });

  assert.equal(document.getElementById(MENU_ID)?.previousElementSibling?.id, 'pud-opt-chatlore', 'пункт меню после «Лорбуков чата»');
  playScan(args => fakeConsole.debug(...args), data => emit('WORLDINFO_SCAN_DONE', data));
  emit('MESSAGE_RECEIVED', 1, 'normal');
  const stored = chat[1].extra[EXTRA_KEY];
  assert.equal(stored.on.length, 4);
  assert.equal(chat[1].swipe_info[0].extra[EXTRA_KEY], stored, 'и в свайпе');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(stored.tokens > 0, 'токены досчитаны и записаны в сообщение');
  emit('CHARACTER_MESSAGE_RENDERED', 1);
  const chip = document.querySelector(`.${CHIP_CLASS}`);
  assert.ok(chip, 'ключик под ответом');
  assert.match(chip.textContent, /4\+3/);

  chip.click();
  const win = document.querySelector('.pud-ltwin');
  assert.ok(win && !win.hidden, 'окно открылось');
  assert.match(win.textContent, /ключ «Ран» и любой из «двор»/);
  assert.match(win.textContent, /перезарядка/);
  assert.match(win.textContent, /Ключ не встретился в чате · 1/, 'тот же прогон в памяти: видно и «не нашлись»');
  win.querySelector('[data-book="Ран"][data-uid="1"]').click();
  assert.deepEqual(opened, [['Ран', 1]]);

  // вкладка «Аудит ключей»: за весь чат, лорбуки только читаются
  win.querySelector('[data-tab="audit"]').click();
  assert.match(win.textContent, /Разобрано ответов: 1/);
  assert.match(win.textContent, /Ответов пока мало/, 'одного ответа мало для вердиктов');
  assert.match(win.textContent, /Самые дорогие записи за чат/);
  assert.equal(win.querySelector('.pud-lt-reply-tools').hidden, true, 'инструменты ответа спрятаны');
  win.querySelector('[data-book="Ран"][data-uid="1"]').click();
  assert.deepEqual(opened.at(-1), ['Ран', 1], 'запись из аудита открывается в редакторе');
  win.querySelector('[data-tab="reply"]').click();
  assert.equal(win.querySelector('.pud-lt-reply-tools').hidden, false);
  assert.match(win.textContent, /ключ «Ран» и любой из «двор»/);
  opened.length = 0;

  // пользователь написал новое — старый ожидающий отчёт не прилипнет к чужому сообщению
  playScan(args => fakeConsole.debug(...args), data => emit('WORLDINFO_SCAN_DONE', data), { trigger: 'quiet' });
  chat.push({ is_user: false, mes: 'приветствие', extra: {} });
  emit('MESSAGE_RECEIVED', 2, 'normal');
  assert.equal(chat[2].extra[EXTRA_KEY], undefined, 'фоновый запрос в ответ не пишется');

  // пробный прогон таверны (подсчёт токенов пресета) не наш — его не показываем
  playScan(args => fakeConsole.debug(...args), data => emit('WORLDINFO_SCAN_DONE', data), { dry: true });
  assert.ok(!win.querySelector('.pud-lt-pick').textContent.includes('Проверка'));

  undo();
  assert.equal(document.querySelector(`.${CHIP_CLASS}`), null);
  assert.equal(document.getElementById(MENU_ID), null);
  assert.equal(document.querySelector('.pud-ltwin'), null);
  assert.deepEqual(Object.values(listeners).flat(), [], 'все слушатели сняты');
});

test('аудит: шумный ключ убирается из записей только после согласия, лорбук правится и сохраняется', async () => {
  const { window } = new JSDOM(`<!doctype html><body><div id="options"><div class="options-content"><a id="pud-opt-chatlore"></a></div></div><div id="chat"></div></body>`, { pretendToBeVisual: true });
  const { document } = window;
  const rxk = (word, ending = '') => `/(?<![\p{L}\p{M}\p{N}_-])${word}${ending}(?![\p{L}\p{M}\p{N}_-])/iu`;
  const voice = rxk('голос', '(?:а|ом)?');
  const record = () => ({ on: [1, 2, 3].map(uid => ({ w: 'Книга', u: uid, t: `Запись ${uid}`, how: 'key', key: rxk(`имя${uid}`), key2: voice, tok: 100 })), off: [] });
  const chat = [];
  for (let i = 0; i < 5; i += 1) chat.push({ is_user: true, mes: 'привет' }, { is_user: false, mes: 'ответ', extra: { [EXTRA_KEY]: record() } });
  const popups = [];
  let answer = false;
  const context = {
    chat,
    eventTypes: new Proxy({}, { get: (target, key) => String(key) }),
    eventSource: { on() {}, removeListener() {} },
    getCurrentChatId: () => 'chat',
    POPUP_TYPE: { CONFIRM: 2 },
    callGenericPopup: async content => { popups.push(content.textContent); return answer; },
  };
  globalThis.SillyTavern = { getContext: () => context };
  const book = { entries: Object.fromEntries([1, 2, 3].map(uid => [uid, { uid, key: [rxk(`имя${uid}`)], keysecondary: uid === 3 ? [rxk('тембр')] : [voice, rxk('тембр')] }])) };
  const saved = [];
  const mirrored = [];
  const api = {
    ready: async () => {},
    load: async () => structuredClone(book),
    save: async (name, data) => { saved.push([name, data]); },
    setOriginal: (data, uid, key, value) => mirrored.push([uid, key, value]),
  };
  const shared = {};
  const undo = startLoreTrace(document, { context, settings: { windows: {} }, shared, consoleTarget: { debug() {}, log() {} }, api });
  try {
    shared.loreTrace.open();
    const win = document.querySelector('.pud-ltwin');
    win.querySelector('[data-tab="audit"]').click();
    assert.match(win.textContent, /Шумные вторичные ключи · 1/);
    const button = win.querySelector('[data-act="strip-key"]');
    assert.ok(button, 'у шумного ключа есть кнопка');
    assert.match(button.textContent, /Убрать из 3/);

    // Отказ: лорбук не тронут.
    button.click();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(popups[0], /Убрать ключ «голос…»/);
    assert.match(popups[0], /Запись 1/);
    assert.match(popups[0], /Из вторичных ключей 2 записей/, 'в третьей записи этого ключа уже нет: она в список не попала');
    assert.deepEqual(saved, []);

    // Согласие: ключ ушёл только из тех записей, где был, и сохранено через api; ключ «тембр» остался.
    answer = true;
    win.querySelector('[data-act="strip-key"]').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(saved.length, 1);
    assert.equal(saved[0][0], 'Книга');
    assert.deepEqual(saved[0][1].entries[1].keysecondary, [rxk('тембр')]);
    assert.deepEqual(saved[0][1].entries[3].keysecondary, [rxk('тембр')]);
    assert.deepEqual(mirrored.map(item => item.slice(0, 2)), [[1, 'keysecondary'], [2, 'keysecondary']]);
    assert.equal(win.querySelector('[data-act="strip-key"]'), null, 'после правки кнопки нет');
    assert.match(win.textContent, /убран/);
  } finally { undo(); }
});
