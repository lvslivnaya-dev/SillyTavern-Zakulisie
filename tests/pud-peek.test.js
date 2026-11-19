/** «Слива выглядывает»: когда и что говорить, погода из Open-Meteo (с подставным fetch), вид и настройки. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  PEEK_FACES, PEEK_KINDS, PEEK_PERSONA, defaultPeekSettings, parseClock, parseClockList, inWindow, noteActivity,
  weatherKind, decide, pickLine, pruneMeals, holdMs, linesFor, clockParts, zoneOf,
  buildCommentMessages, cleanComment, commentDue, commentTokens, bubbleMaxWidth, countWords, tidyMessage,
} from '../src/pud/core/peek.js';
import { normalizeReminders } from '../src/pud/core/peek.js';
import { findPlace, currentWeather } from '../src/pud/core/peek-weather.js';
import { PEEK_ID, startPeek } from '../src/pud/ui/peek.js';
import { defaultSettings, migrateSettings } from '../src/pud/core/settings.js';

const MIN = 60 * 1000;
const at = (h, m = 0) => new Date(2026, 10, 15, h, m, 0);

test('все картинки лиц на месте, и у каждого вида реплик есть лицо и фразы', () => {
  for (const name of Object.keys(PEEK_FACES)) {
    assert.ok(existsSync(new URL(`../assets/peek/${name}.webp`, import.meta.url)), `${name}.webp`);
    const meta = PEEK_FACES[name];
    assert.ok(meta.w > 100 && meta.h > 100 && meta.ledge > 0 && meta.ledge <= meta.h, name);
  }
  for (const [kind, item] of Object.entries(PEEK_KINDS)) {
    assert.ok(PEEK_FACES[item.face], `${kind}: лицо`);
    assert.ok(item.lines.length >= 2, `${kind}: фразы`);
    assert.ok(item.emoji && item.title, kind);
  }
});

test('время и промежутки: часы, списки, окно через полночь', () => {
  assert.equal(parseClock('13:30'), 810);
  assert.equal(parseClock('9.05'), 545);
  assert.equal(parseClock('24:00'), null);
  assert.equal(parseClock('мусор'), null);
  assert.deepEqual(parseClockList('19:00, 09:00;13:30 мусор 09:00'), [540, 810, 1140]);
  assert.equal(inWindow(30, 23 * 60, 7 * 60), true);
  assert.equal(inWindow(12 * 60, 23 * 60, 7 * 60), false);
  assert.equal(inWindow(100, null, null), false);
});

test('сессия: пауза дольше двадцати минут начинает новую', () => {
  const session = { start: 0, last: 0 };
  noteActivity(session, 1000);
  assert.equal(session.start, 1000);
  noteActivity(session, 1000 + 10 * MIN);
  assert.equal(session.start, 1000);
  noteActivity(session, 1000 + 40 * MIN);
  assert.equal(session.start, 1000 + 40 * MIN);
});

test('погода: гроза, снег, дождь, холод, жара, обычная погода молчит', () => {
  assert.equal(weatherKind({ code: 95, temp: 20 }), 'storm');
  assert.equal(weatherKind({ code: 73, temp: -2 }), 'snow');
  assert.equal(weatherKind({ code: 61, temp: 10 }), 'rain');
  assert.equal(weatherKind({ code: 0, temp: 6, feels: 1 }), 'cold');
  assert.equal(weatherKind({ code: 1, temp: 30, feels: 31 }), 'hot');
  assert.equal(weatherKind({ code: 2, temp: 15, feels: 14 }), null);
  assert.equal(weatherKind(null), null);
});

function ctx(over = {}) {
  const now = at(15, 0);
  const cfg = { ...defaultPeekSettings(), ...over.cfg };
  const nowMs = now.getTime();
  return { now, cfg, session: { start: nowMs - 10 * MIN, last: nowMs - MIN, ...over.session }, weather: over.weather ?? null, lastShownAt: over.lastShownAt ?? 0 };
}

test('решения: тишина, пока ничего не наступило или пользователь не активен', () => {
  assert.equal(decide(ctx({ cfg: { kinds: { hello: false } } })), null);
  const idle = ctx();
  idle.session.last = idle.now.getTime() - 3 * 60 * MIN;
  assert.equal(decide(idle), null);
  assert.equal(decide(ctx({ cfg: { enabled: false } })), null);
});

test('решения: долгое сидение зовёт отдохнуть, потом не чаще restAgainMin', () => {
  const c = ctx({ session: { start: at(15).getTime() - 100 * MIN } });
  assert.equal(decide(c)?.kind, 'rest');
  c.cfg.last = { rest: c.now.getTime() - 30 * MIN };
  assert.notEqual(decide(c)?.kind, 'rest');
  c.cfg.last = { rest: c.now.getTime() - 70 * MIN };
  assert.equal(decide(c)?.kind, 'rest');
});

test('решения: еда в окне после назначенного времени, один раз за день', () => {
  const c = ctx({ cfg: { meals: '14:30' }, session: { start: at(15).getTime() - 5 * MIN } });
  const first = decide(c);
  assert.equal(first.kind, 'meal');
  c.cfg.mealsDone = { [first.mealKey]: true };
  assert.notEqual(decide(c)?.kind, 'meal');
  const late = ctx({ cfg: { meals: '10:00' }, session: { start: at(15).getTime() - 5 * MIN } });
  assert.notEqual(decide(late)?.kind, 'meal');
});

test('решения: сон после времени отбоя, тихие часы и отложенное глушат всё', () => {
  const night = { now: at(1, 30), cfg: defaultPeekSettings(), session: { start: at(1, 30).getTime() - 5 * MIN, last: at(1, 30).getTime() - MIN } };
  assert.equal(decide(night)?.kind, 'sleep');
  night.cfg.quietFrom = '00:00';
  night.cfg.quietTo = '08:00';
  assert.equal(decide(night), null);
  const snoozed = { ...night, cfg: { ...defaultPeekSettings(), snoozeUntil: night.now.getTime() + MIN } };
  assert.equal(decide(snoozed), null);
});

test('решения: минимальный промежуток между появлениями', () => {
  const c = ctx({ session: { start: at(15).getTime() - 100 * MIN }, lastShownAt: at(15).getTime() - 5 * MIN });
  assert.equal(decide(c), null);
});

test('решения: погода говорит раз в пять часов на каждый вид', () => {
  const c = ctx({ cfg: { kinds: { hello: false, water: false } }, weather: { code: 0, temp: 0, feels: -3 } });
  const choice = decide(c);
  assert.equal(choice.kind, 'cold');
  assert.equal(choice.temp, -3);
  c.cfg.last = { cold: c.now.getTime() - 60 * MIN };
  assert.equal(decide(c), null);
  c.cfg.kinds.weather = false;
  c.cfg.last = {};
  assert.equal(decide(c), null);
});

test('решения: приветствие после долгого перерыва, на старте сессии', () => {
  const nowMs = at(15).getTime();
  const c = ctx({ session: { start: nowMs - MIN, last: nowMs - 10 * 1000 } });
  assert.equal(decide(c)?.kind, 'hello');
});

test('фразы: свои добавляются к встроенным, {t} подставляется', () => {
  const cfg = { phrases: { cold: ['  своя про холод  ', ''] } };
  assert.ok(linesFor('cold', cfg).includes('своя про холод'));
  assert.equal(linesFor('cold', cfg).length, PEEK_KINDS.cold.lines.length + 1);
  const line = pickLine('cold', { phrases: { cold: ['{t} градусов'] } }, () => 0.999, { t: -7 });
  assert.equal(line, '-7 градусов');
  assert.equal(pickLine('нет-такого', {}), '');
  assert.ok(holdMs({ showSec: 10 }, 'x'.repeat(100)) >= 14000);
});

test('отметки еды старше трёх дней стираются', () => {
  const now = at(12);
  const fresh = '2026-11-15|540';
  const old = '2026-11-01|540';
  assert.deepEqual(pruneMeals({ [fresh]: true, [old]: true }, now), { [fresh]: true });
});

test('поиск города и погода из ответов Open-Meteo (подставной fetch)', async () => {
  const calls = [];
  const fetchFn = async url => {
    calls.push(url);
    if (url.includes('geocoding')) return { ok: true, json: async () => ({ results: [{ name: 'Берлин', country: 'Германия', latitude: 52.5, longitude: 13.4, timezone: 'Europe/Berlin' }] }) };
    return { ok: true, json: async () => ({ current: { temperature_2m: 7.7, apparent_temperature: 3.8, precipitation: 0, weather_code: 61, wind_speed_10m: 13 } }) };
  };
  const place = await findPlace('Берлин', fetchFn);
  assert.deepEqual(place, { name: 'Берлин', country: 'Германия', lat: 52.5, lon: 13.4, tz: 'Europe/Berlin' });
  assert.match(calls[0], /name=%D0%91/);
  const weather = await currentWeather(place, fetchFn);
  assert.equal(weather.temp, 7.7);
  assert.equal(weather.code, 61);
  assert.equal(weatherKind(weather), 'rain');
  assert.equal(await findPlace('   ', fetchFn), null);
  assert.equal(await findPlace('нигде', async () => ({ ok: true, json: async () => ({}) })), null);
  await assert.rejects(findPlace('x', async () => ({ ok: false, status: 500 })));
  await assert.rejects(currentWeather(null, fetchFn));
});

test('настройки по умолчанию содержат peek и доживают миграцию', () => {
  assert.deepEqual(defaultSettings().peek, defaultPeekSettings());
  const migrated = migrateSettings({ peek: { side: 'right', phrases: { rest: ['моя'] } } });
  assert.equal(migrated.peek.side, 'right');
  assert.deepEqual(migrated.peek.phrases.rest, ['моя']);
  assert.equal(migrated.peek.minGapMin, 25);
});

function mount(settings = { peek: defaultPeekSettings() }, { storage = null } = {}) {
  const win = new JSDOM('<!doctype html><body class="pud-on"><div id="send_form"><textarea id="send_textarea"></textarea></div></body>', { pretendToBeVisual: true, url: 'http://localhost/' }).window;
  for (const [key, value] of Object.entries(storage ?? {})) win.localStorage.setItem(key, value);
  const handlers = {};
  const context = {
    eventTypes: { MESSAGE_SENT: 'sent', MESSAGE_RECEIVED: 'recv', CHAT_CHANGED: 'chat', GENERATION_STARTED: 'gen', GENERATION_ENDED: 'end', GENERATION_STOPPED: 'stop' },
    eventSource: { on: (type, fn) => { (handlers[type] ??= []).push(fn); }, removeListener: (type, fn) => { handlers[type] = (handlers[type] ?? []).filter(item => item !== fn); } },
  };
  const tabs = [];
  const shared = {
    hub: {
      addTab(id, title) {
        const pane = win.document.createElement('section');
        pane.dataset.pane = id;
        win.document.body.append(pane);
        tabs.push(id);
        return { pane, remove: () => pane.remove() };
      },
      open() {},
    },
  };
  let saves = 0;
  const undo = startPeek(win.document, { context, settings, save: () => { saves++; }, shared });
  return { win, document: win.document, handlers, settings, shared, undo, tabs, saves: () => saves };
}

test('маскот встаёт над строкой ввода, показывает реплику и убирается при откате', async () => {
  const m = mount();
  const root = m.document.getElementById(PEEK_ID);
  assert.ok(root, 'контейнер');
  assert.equal(root.parentElement.id, 'send_form');
  assert.ok(m.shared.peek, 'доступ для других модулей');
  assert.deepEqual(m.tabs, ['peek']);
  assert.ok(m.document.querySelector('[data-pane="peek"] [data-path="enabled"]'), 'настройки нарисованы');

  await m.shared.peek.show({ kind: 'cold', temp: -4 });
  const text = m.document.querySelector('.pud-peek-text').textContent;
  assert.ok(text.length > 0);
  assert.ok(!text.includes('{t}'));
  assert.match(m.document.querySelector('.pud-peek-img').src, /cold\.webp$/);
  assert.equal(m.document.querySelector('.pud-peek-emoji').textContent, PEEK_KINDS.cold.emoji);
  assert.ok(root.style.getPropertyValue('--peek-h'));

  m.shared.peek.hide();
  m.undo();
  assert.equal(m.document.getElementById(PEEK_ID), null);
  assert.equal(m.document.querySelector('[data-pane="peek"]'), null);
  assert.equal(m.shared.peek, undefined);
  assert.equal((m.handlers.sent ?? []).length, 0);
});

test('клик по маскоту открывает меню, «Напомни позже» откладывает и прячет', async () => {
  const m = mount();
  await m.shared.peek.show({ kind: 'rest' });
  const root = m.document.getElementById(PEEK_ID);
  m.document.querySelector('.pud-peek-clip').dispatchEvent(new m.win.MouseEvent('click', { bubbles: true }));
  assert.equal(m.document.querySelector('.pud-peek-menu').hidden, false);
  m.document.querySelector('[data-do="later"]').dispatchEvent(new m.win.MouseEvent('click', { bubbles: true }));
  assert.ok(m.settings.peek.snoozeUntil > Date.now() + 25 * MIN);
  assert.equal(m.document.querySelector('.pud-peek-menu').hidden, true);
  assert.ok(!root.classList.contains('on'));
  assert.ok(m.saves() >= 1);
  m.undo();
});

test('настройки меняются из вкладки, чужие значения зажимаются в границы', () => {
  const m = mount();
  const pane = m.document.querySelector('[data-pane="peek"]');
  const size = pane.querySelector('[data-path="size"]');
  size.value = '9999';
  size.dispatchEvent(new m.win.Event('change', { bubbles: true }));
  assert.equal(m.settings.peek.size, 160);
  const box = pane.querySelector('[data-path="kinds.water"]');
  box.checked = false;
  box.dispatchEvent(new m.win.Event('change', { bubbles: true }));
  assert.equal(m.settings.peek.kinds.water, false);
  const own = pane.querySelector('[data-phrase="rest"]');
  own.value = 'раз\n\nдва ';
  own.dispatchEvent(new m.win.Event('change', { bubbles: true }));
  assert.deepEqual(m.settings.peek.phrases.rest, ['раз', 'два']);
  const city = pane.querySelector('[data-path="city"]');
  m.settings.peek.place = { name: 'x', lat: 1, lon: 2 };
  city.value = 'Берлин';
  city.dispatchEvent(new m.win.Event('change', { bubbles: true }));
  assert.equal(m.settings.peek.city, 'Берлин');
  assert.equal(m.settings.peek.place, null, 'смена города сбрасывает найденное место');
  m.undo();
});

test('без строки ввода модуль тихо ничего не делает', () => {
  const win = new JSDOM('<!doctype html><body></body>').window;
  const undo = startPeek(win.document, { context: {}, settings: { peek: defaultPeekSettings() }, save() {}, shared: {} });
  assert.equal(typeof undo, 'function');
  undo();
});

test('часы: по часовому поясу города, у каждого свои; неизвестный пояс заменяется часами устройства', () => {
  const instant = new Date('2026-11-15T23:30:00Z');
  assert.deepEqual(clockParts(instant, 'Asia/Tokyo'), { minute: 8 * 60 + 30, day: '2026-11-16' });
  assert.deepEqual(clockParts(instant, 'America/New_York'), { minute: 18 * 60 + 30, day: '2026-11-15' });
  assert.deepEqual(clockParts(instant, 'Нет/Такого'), clockParts(instant));
  assert.equal(zoneOf({ tz: 'device', place: { tz: 'Asia/Tokyo' } }), '');
  assert.equal(zoneOf({ tz: 'city', place: { tz: 'Asia/Tokyo' } }), 'Asia/Tokyo');
  assert.equal(zoneOf({ tz: 'city', place: null }), '');
});

test('сон по часам города: в Токио два часа ночи — спать, в Индии 22:30 — ещё нет', () => {
  const now = new Date('2026-11-15T17:00:00Z');
  const build = tz => ({ now, session: { start: now.getTime() - 5 * MIN, last: now.getTime() - MIN }, cfg: { ...defaultPeekSettings(), tz: 'city', place: { name: 'x', lat: 1, lon: 1, tz }, kinds: { hello: false, water: false } } });
  assert.equal(decide(build('Asia/Tokyo'))?.kind, 'sleep');
  assert.equal(decide(build('Asia/Kolkata')), null);
});

test('комментарий: характер, лимит слов и сообщения чата попадают в запрос', () => {
  const messages = buildCommentMessages({ chat: [{ name: 'Аня', text: 'Привет', isUser: true }, { name: 'Сатору', text: 'Ну здравствуй.' }], maxWords: 20, author: 'Аня' });
  assert.equal(messages[0].role, 'system');
  assert.ok(messages[0].content.includes(PEEK_PERSONA));
  assert.match(messages[0].content, /не больше 20 слов/);
  assert.match(messages[1].content, /[Нн]е больше 20 слов/);
  assert.match(messages[1].content, /Аня \(автор\): Привет/);
  assert.match(messages[1].content, /Сатору: Ну здравствуй\./);
  assert.match(PEEK_PERSONA, /ехидн/);
  assert.doesNotMatch(PEEK_PERSONA, /несовершеннолетн|детей/, 'про детей в характере ничего нет: фразы вроде «воспринимает как ребёнка» не должны глушить шутки');
  assert.match(buildCommentMessages({ chat: [], maxWords: 8 })[0].content, /Одно короткое предложение/);
  assert.ok(commentTokens(80) > commentTokens(10));
});

test('комментарий: ответ модели чистится, а длинное режется по законченному предложению, не посреди фразы', () => {
  assert.equal(cleanComment('  «Слива: Ну ты даёшь!»  ', 20), 'Ну ты даёшь!');
  assert.equal(cleanComment('**Вот** это _поворот_', 20), 'Вот это поворот');
  assert.equal(cleanComment('<think>думаю</think>Ладно.', 20), 'Ладно.');
  assert.equal(cleanComment('   ', 20), '');
  const long = 'Один два три четыре пять. Шесть семь восемь девять десять. Одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать.';
  assert.equal(cleanComment(long, 10), 'Один два три четыре пять. Шесть семь восемь девять десять.');
  const noEnd = 'раз два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать';
  assert.match(cleanComment(noEnd, 6), /…$/);
  assert.equal(countWords('Ну, ты даёшь — 3 раза!'), 5);
});

test('облачко шире для длинных реплик и ограничено сверху; сообщения чата очищаются от тегов', () => {
  assert.ok(bubbleMaxWidth(3) < bubbleMaxWidth(10));
  assert.ok(bubbleMaxWidth(10) < bubbleMaxWidth(20));
  assert.equal(bubbleMaxWidth(500), bubbleMaxWidth(30));
  assert.equal(tidyMessage('<think>скрыто</think><b>Привет</b>  мир ![](x.png)'), 'Привет мир');
  assert.ok(tidyMessage('а'.repeat(2000), 300).length < 330);
});

test('когда комментировать: включено, выбран способ, прошло время и события, нет тишины', () => {
  const base = { ...defaultPeekSettings(), commentEnabled: true, commentProfile: 'p1', commentEvery: 3, commentGapMin: 4 };
  const now = new Date('2026-11-15T12:00:00Z');
  const ok = { cfg: base, count: 3, lastAt: 0, now, busy: false };
  assert.equal(commentDue(ok), true);
  assert.equal(commentDue({ ...ok, count: 2 }), false, 'мало событий');
  assert.equal(commentDue({ ...ok, lastAt: now.getTime() - MIN }), false, 'слишком скоро');
  assert.equal(commentDue({ ...ok, cfg: { ...base, commentEnabled: false } }), false);
  assert.equal(commentDue({ ...ok, cfg: { ...base, commentProfile: '' } }), false, 'способ не выбран');
  assert.equal(commentDue({ ...ok, cfg: { ...base, commentProfile: 'main' }, busy: true }), false, 'модель чата занята');
  assert.equal(commentDue({ ...ok, cfg: { ...base, commentProfile: 'main' }, busy: false }), true);
  assert.equal(commentDue({ ...ok, cfg: { ...base, snoozeUntil: now.getTime() + MIN } }), false);
  assert.equal(commentDue({ ...ok, cfg: { ...base, enabled: false } }), false);
});

function stubTavern({ reply = 'Ну наконец-то он признался. А то мы тут до пенсии томно вздыхали бы.', chat } = {}) {
  const calls = [];
  const ctx = {
    chatId: 'c1',
    name1: 'Аня',
    chat: chat ?? [
      { name: 'Аня', mes: 'Я тебя люблю.', is_user: true },
      { name: 'Сатору', mes: '<think>х</think>Наконец-то ты это сказала.', is_user: false },
      { name: 'system', mes: 'служебное', is_system: true },
    ],
    ConnectionManagerRequestService: {
      getSupportedProfiles: () => [{ id: 'p1', name: 'Мини' }],
      sendRequest: async (id, messages, maxTokens) => { calls.push({ id, messages, maxTokens }); return { content: reply }; },
    },
    generateRaw: async options => { calls.push({ main: true, options }); return reply; },
  };
  globalThis.SillyTavern = { getContext: () => ctx };
  return { calls, ctx, restore: () => { delete globalThis.SillyTavern; } };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('комментарий моделью: Слива читает чат, просит модель с лимитом слов и показывает реплику шире обычной', async () => {
  const tavern = stubTavern();
  const peek = defaultPeekSettings();
  Object.assign(peek, { commentEnabled: true, commentProfile: 'p1', commentEvery: 1, commentGapMin: 1, commentMaxWords: 30 });
  const m = mount({ peek });
  try {
    for (const fn of m.handlers.recv) fn();
    await wait(1700);
    assert.equal(tavern.calls.length, 1);
    const call = tavern.calls[0];
    assert.equal(call.id, 'p1');
    assert.ok(call.maxTokens >= 160);
    assert.match(call.messages[0].content, /не больше 30 слов/);
    assert.match(call.messages[1].content, /Наконец-то ты это сказала/);
    assert.ok(!call.messages[1].content.includes('служебное'), 'служебные сообщения не читаются');
    assert.ok(!call.messages[1].content.includes('<think>'), 'думающие блоки вырезаны');
    assert.match(m.document.querySelector('.pud-peek-text').textContent, /наконец-то он признался/i);
    assert.equal(m.document.getElementById(PEEK_ID).style.getPropertyValue('--peek-maxw'), `${bubbleMaxWidth(14)}px`);
    assert.ok(m.settings.peek.last.comment > 0);
    // второй ответ сразу после первого: не чаще заданного промежутка
    for (const fn of m.handlers.recv) fn();
    await wait(50);
    assert.equal(tavern.calls.length, 1);
  } finally { m.undo(); tavern.restore(); }
});

test('комментарий моделью: без выбранного способа молчит, ошибка модели не роняет и откладывает попытки', async () => {
  const tavern = stubTavern();
  const peek = defaultPeekSettings();
  Object.assign(peek, { commentEnabled: true, commentProfile: '', commentEvery: 1, commentGapMin: 1 });
  const silent = mount({ peek });
  for (const fn of silent.handlers.recv) fn();
  await wait(50);
  assert.equal(tavern.calls.length, 0);
  silent.undo();

  tavern.ctx.ConnectionManagerRequestService.sendRequest = async () => { throw new Error('сервер недоступен'); };
  const failing = defaultPeekSettings();
  Object.assign(failing, { commentEnabled: true, commentProfile: 'p1', commentEvery: 1, commentGapMin: 1 });
  const m = mount({ peek: failing });
  const origWarn = console.warn; const origErr = console.error; console.warn = () => {}; console.error = () => {};
  try {
    for (const fn of m.handlers.recv) fn();
    await wait(50);
    for (const fn of m.handlers.recv) fn();
    await wait(50);
    assert.match(m.document.querySelector('[data-comment-status]').textContent, /Не вышло: сервер недоступен/);
  } finally { console.warn = origWarn; console.error = origErr; m.undo(); tavern.restore(); }
});

test('пока ждёшь ответа: Слива не прячется, когда началась генерация; «модель чата» ждёт конца ответа', async () => {
  const tavern = stubTavern();
  const peek = defaultPeekSettings();
  Object.assign(peek, { commentEnabled: true, commentProfile: 'main', commentEvery: 1, commentGapMin: 1, commentWaiting: true });
  const m = mount({ peek });
  try {
    await m.shared.peek.show({ kind: 'rest' });
    await wait(60);
    const root = m.document.getElementById(PEEK_ID);
    assert.ok(root.classList.contains('on'));
    for (const fn of m.handlers.gen) fn();
    assert.ok(root.classList.contains('on'), 'генерация не прячет маскота');
    await wait(30);
    assert.equal(tavern.calls.length, 0, 'модель чата занята ответом, комментарий не запрошен');
  } finally { m.undo(); tavern.restore(); }
});

test('город: возвращается из браузера, если настройки сбросились; вписанный в настройках дублируется туда', () => {
  const stored = JSON.stringify({ city: 'Казань', place: { name: 'Казань', country: 'Россия', lat: 55.8, lon: 49.1, tz: 'Europe/Moscow' } });
  const m = mount({ peek: defaultPeekSettings() }, { storage: { 'pud-peek-city': stored } });
  assert.equal(m.settings.peek.city, 'Казань');
  assert.equal(m.settings.peek.place.tz, 'Europe/Moscow');
  const city = m.document.querySelector('[data-path="city"]');
  city.value = 'Берлин';
  city.dispatchEvent(new m.win.Event('change', { bubbles: true }));
  assert.equal(JSON.parse(m.win.localStorage.getItem('pud-peek-city')).city, 'Берлин');
  city.value = '';
  city.dispatchEvent(new m.win.Event('change', { bubbles: true }));
  assert.equal(m.win.localStorage.getItem('pud-peek-city'), null);
  m.undo();
});

test('новые настройки: комментарии выключены по умолчанию, часы по устройству, ждать ответа можно', () => {
  const d = defaultPeekSettings();
  assert.equal(d.commentEnabled, false);
  assert.equal(d.commentProfile, '');
  assert.equal(d.tz, 'device');
  assert.equal(d.whileWaiting, true);
  assert.equal(d.commentMaxWords, 25);
});

test('комментарий: реплика берётся из маркеров, рассуждения модели не показываются', () => {
  assert.equal(cleanComment('Мы должны ответить как Слива. Нужно понять контекст... <<<Ну ты даёшь, Гето.>>>', 25), 'Ну ты даёшь, Гето.');
  assert.equal(cleanComment('<<<Первая>>> размышляю <<<Вторая, итоговая.>>>', 25), 'Вторая, итоговая.');
  assert.equal(cleanComment('<<<Реплика без закрытия', 25), 'Реплика без закрытия');
  assert.equal(cleanComment('Мы должны ответить как Слива. Нужно понять контекст: это ролевая игра.', 25), '', 'рассуждения без маркеров не показываем');
  assert.equal(cleanComment('Okay, let me think about this.', 25), '');
  assert.equal(cleanComment('Ну ты даёшь, Гето!', 25), 'Ну ты даёшь, Гето!', 'обычная реплика без маркеров проходит');
  const msgs = buildCommentMessages({ chat: [{ name: 'Аня', text: 'Привет', isUser: true }], maxWords: 20 });
  assert.match(msgs[1].content, /<<<\[лицо\] реплика>>>/);
});

test('свои напоминания: по времени раз в день, через промежутки, выключенные и пустые молчат, пауза встроенных их не держит', () => {
  const daily = { id: 'r-aaa', on: true, text: 'Выпить таблетки', mode: 'daily', times: '14:30', everyMin: 60, face: 'wink', emoji: '💊' };
  const c = ctx({ cfg: { reminders: [daily], kinds: { rest: false, water: false, hello: false, meal: false, cheer: false, sleep: false, weather: false } }, session: { start: at(15).getTime() - 5 * MIN } });
  const first = decide(c);
  assert.equal(first.kind, 'custom');
  assert.equal(first.text, 'Выпить таблетки');
  assert.equal(first.emoji, '💊');
  assert.ok(first.doneKey);
  c.cfg.remindersDone = { [first.doneKey]: true };
  assert.equal(decide(c), null, 'один раз за день');
  // не наступило время
  assert.equal(decide(ctx({ cfg: { reminders: [{ ...daily, times: '18:00' }], kinds: { rest: false, water: false, hello: false, meal: false, cheer: false, sleep: false, weather: false } } })), null);
  // выключенное и пустое
  assert.equal(decide(ctx({ cfg: { reminders: [{ ...daily, on: false }], kinds: { rest: false, water: false, hello: false, meal: false, cheer: false, sleep: false, weather: false } } })), null);
  assert.equal(decide(ctx({ cfg: { reminders: [{ ...daily, text: '  ' }], kinds: { rest: false, water: false, hello: false, meal: false, cheer: false, sleep: false, weather: false } } })), null);
  // через промежутки: считается от начала сессии и от прошлого показа
  const every = { ...daily, id: 'r-bbb', mode: 'every', everyMin: 30 };
  const e = ctx({ cfg: { reminders: [every], kinds: { rest: false, water: false, hello: false, meal: false, cheer: false, sleep: false, weather: false } }, session: { start: at(15).getTime() - 40 * MIN } });
  assert.equal(decide(e)?.kind, 'custom');
  e.cfg.last = { 'r:r-bbb': e.now.getTime() - 10 * MIN };
  assert.equal(decide(e), null);
  // общая пауза между встроенными репликами своё напоминание не задерживает
  const gap = ctx({ cfg: { reminders: [daily], kinds: { rest: false, water: false, hello: false, meal: false, cheer: false, sleep: false, weather: false } }, lastShownAt: at(15).getTime() - 2 * MIN });
  assert.equal(decide(gap)?.kind, 'custom');
  // нормализация
  const list = normalizeReminders([{ text: 'x', mode: 'every', everyMin: 1, face: 'нет', emoji: '' }, null, 5]);
  assert.equal(list.length, 1);
  assert.equal(list[0].everyMin, 5);
  assert.equal(list[0].face, 'wink');
  assert.equal(list[0].emoji, '⏰');
  assert.match(list[0].id, /^r-/);
});

test('свои напоминания в настройках Сливы: добавить, написать, выбрать время, показать сейчас, удалить', async () => {
  const m = mount();
  try {
    const pane = m.document.querySelector('[data-pane="peek"]');
    pane.querySelector('[data-act="rem-add"]').click();
    assert.equal(m.settings.peek.reminders.length, 1);
    const text = pane.querySelector('.pud-rem [data-rf="text"]');
    text.value = 'Выпить воду с лимоном';
    text.dispatchEvent(new m.win.Event('input', { bubbles: true }));
    assert.equal(m.settings.peek.reminders[0].text, 'Выпить воду с лимоном');
    const mode = pane.querySelector('.pud-rem [data-rf="mode"]');
    mode.value = 'every';
    mode.dispatchEvent(new m.win.Event('change', { bubbles: true }));
    assert.equal(m.settings.peek.reminders[0].mode, 'every');
    assert.ok(pane.querySelector('.pud-rem [data-rf="everyMin"]'), 'вместо времени — поле минут');
    pane.querySelector('.pud-rem [data-act="rem-test"]').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(m.document.querySelector('.pud-peek-text').textContent, 'Выпить воду с лимоном');
    const dot = pane.querySelector('[data-rhelp]');
    assert.equal(pane.querySelector('[data-rnote]').hidden, true);
    dot.click();
    assert.equal(pane.querySelector('[data-rnote]').hidden, false);
    pane.querySelector('.pud-rem [data-act="rem-del"]').click();
    assert.equal(m.settings.peek.reminders.length, 0);
  } finally { m.undo(); }
});

test('у облачка Сливы есть крестик: закрывает сразу, ничего не откладывая', async () => {
  const m = mount();
  await m.shared.peek.show({ kind: 'rest' });
  const root = m.document.getElementById(PEEK_ID);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.ok(root.classList.contains('on'));
  m.document.querySelector('.pud-peek-x').dispatchEvent(new m.win.MouseEvent('click', { bubbles: true }));
  assert.ok(!root.classList.contains('on'), 'облачко закрылось');
  assert.ok(!(m.settings.peek.snoozeUntil > 0), 'тишина не включилась');
  m.undo();
});

test('комментарий: лицо берётся из тега в реплике и соответствует смыслу, тег не показывается', async () => {
  const { commentFace, COMMENT_MOODS } = await import('../src/pud/core/peek.js');
  assert.equal(commentFace('<<<[smug] Ну-ну, конечно.>>>'), 'smug');
  assert.equal(commentFace('Мы думаем… <<<[love] Какая забота!>>>'), 'love');
  assert.equal(commentFace('<<<[LOVE] Ах>>>'), 'love');
  assert.equal(commentFace('[panic] Беги!'), 'panic', 'без маркеров тоже читается');
  assert.equal(cleanComment('<<<[smug] Ну-ну, конечно.>>>', 20), 'Ну-ну, конечно.');
  assert.equal(cleanComment('<<<[love]Какая забота!>>>', 20), 'Какая забота!');
  assert.equal(cleanComment('<<<[нет такого] текст>>>', 20), '[нет такого] текст', 'неизвестный тег не трогаем');
  // нет тега или тег неизвестный → мягкое случайное лицо, не падает
  assert.ok(['wink', 'normal', 'happy'].includes(commentFace('<<<Просто реплика>>>', () => 0.9)));
  assert.ok(['wink', 'normal', 'happy'].includes(commentFace('<<<[cold] Брр>>>', () => 0)));
  for (const name of Object.keys(COMMENT_MOODS)) assert.ok(PEEK_FACES[name], `${name}: есть лицо`);
  const prompt = buildCommentMessages({ chat: [], maxWords: 20 })[0].content;
  for (const name of ['smug', 'love', 'approve', 'shy', 'pout', 'grumpy', 'scared', 'panic']) assert.match(prompt, new RegExp(`\[${name}\]`));
});
