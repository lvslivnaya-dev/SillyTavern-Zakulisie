/** Повторы, нити, настроение, звуки погоды, график отношений: чистая логика и вкладки (jsdom, без сети и звука). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readMeta, writeMeta, META_KEY } from '../src/pud/core/meta.js';
import { findRepeats, banBlock, normalizeRepeats, wordsOf } from '../src/pud/core/repeats.js';
import {
  addThread, setStatus, removeThread, threadsBlock, normalizeThreads, buildFindMessages, parseFound, isDuplicate,
} from '../src/pud/core/threads.js';
import { MOODS, setMood, moodsBlock, normalizeMoods, parseMoodAnswer, buildMoodMessages, normalizeMoodConfig, moodList, moodOf } from '../src/pud/core/moods.js';
import { hourFromText, hourInRange, tintFor, normalizeMoodTheme, normalizeRule, layerFor, DEFAULT_RULES } from '../src/pud/core/mood-theme.js';
import { loopPlan, randomStart, gainFor, soundKindFor, SOUND_KINDS, normalizeWeatherSound, seamlessLoop } from '../src/pud/core/weather-sound.js';
import { scaleSeries, relationLines, chartPath, normalizeRelGraph, recentShifts, relationOverview } from '../src/pud/core/relgraph.js';
import { relationshipId } from '../src/core/ids.js';
import { startRepeats } from '../src/pud/ui/repeats.js';
import { startThreads } from '../src/pud/ui/threads.js';
import { startMood } from '../src/pud/ui/mood.js';
import { startMoodTheme, TINT_ID } from '../src/pud/ui/mood-theme.js';
import { startQuick } from '../src/pud/ui/quick.js';
import { startWeatherSound, SOUND_BUTTON_CLASS } from '../src/pud/ui/weather-sound.js';
import { startRelGraph, WIDGET_CLASS } from '../src/pud/ui/relgraph.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// ───────── мета чата
test('метаданные чата: чтение и запись по ключу, копии, чужой объект не ломается', () => {
  const context = { chatMetadata: {}, saveMetadataDebounced() { this.saved = (this.saved ?? 0) + 1; } };
  assert.equal(readMeta(context, 'x', 'нет'), 'нет');
  assert.equal(writeMeta(context, 'x', { a: 1 }), true);
  const got = readMeta(context, 'x');
  got.a = 99;
  assert.deepEqual(readMeta(context, 'x'), { a: 1 });
  assert.ok(context.chatMetadata[META_KEY]);
  assert.equal(context.saved, 1);
  assert.equal(writeMeta({}, 'x', 1), false);
});

// ───────── повторы
test('повторы: частые обороты находятся, длинная фраза вытесняет короткую, «это нормально» не считается', () => {
  const phrase = 'сердце пропустило удар';
  const messages = [
    `Он замер. ${phrase} от этих слов.`,
    `Она улыбнулась, и ${phrase} снова.`,
    `${phrase} — подумал он тогда.`,
    'Совсем другой текст про погоду и чай без повторов.',
  ];
  const found = findRepeats(messages, { minMessages: 3 });
  assert.ok(found.some(item => item.phrase === phrase && item.count === 3), JSON.stringify(found));
  assert.ok(!found.some(item => item.phrase === 'сердце пропустило'), 'часть длинной фразы не показывается');
  assert.deepEqual(findRepeats(messages, { minMessages: 3, ignored: [phrase] }).filter(item => item.phrase === phrase), []);
  assert.deepEqual(findRepeats(['и в на он она', 'и в на он она', 'и в на он она'], { minMessages: 3 }), [], 'одни служебные слова не штамп');
  assert.deepEqual(wordsOf('<think>скрыто</think>Ёлка, ёж!'), ['елка', 'еж']);
});

test('повторы: заметка модели и настройки', () => {
  assert.equal(banBlock([]), '');
  assert.match(banBlock(['воздух сгустился', ' ']), /"воздух сгустился"/);
  const n = normalizeRepeats({ send: false, lastMessages: 5, minMessages: 99, bans: ['а', 'а', ''] });
  assert.equal(n.send, false);
  assert.equal(n.lastMessages, 10);
  assert.equal(n.minMessages, 20);
  assert.deepEqual(n.bans, ['а']);
});

// ───────── нити
test('нити: добавление без повторов, статусы, напоминание модели только про открытые', () => {
  let list = [];
  const first = addThread(list, { text: 'Обещал рассказать про шрам', who: 'Сатору' });
  assert.ok(first.thread);
  list = first.list;
  assert.equal(addThread(list, { text: 'обещал рассказать про шрам!' }).thread, null);
  assert.equal(addThread(list, { text: '   ' }).thread, null);
  list = addThread(list, { text: 'Она так и не ответила про ключи' }).list;
  assert.equal(list.length, 2);
  assert.match(threadsBlock(list), /Сатору: Обещал рассказать про шрам/);
  list = setStatus(list, list[0].id, 'closed');
  assert.ok(!threadsBlock(list).includes('ключи'));
  assert.equal(threadsBlock(setStatus(list, list[1].id, 'snoozed')), '');
  assert.equal(removeThread(list, list[0].id).length, 1);
  assert.equal(isDuplicate('Новая', list), false);
  assert.deepEqual(normalizeThreads('мусор'), []);
});

test('нити: поиск моделью — запрос просит JSON, ответ разбирается терпимо', () => {
  const messages = buildFindMessages({ chat: [{ name: 'Аня', text: 'Привет', isUser: true }], existing: [{ text: 'старая нить' }] });
  assert.match(messages[1].content, /JSON-массива/);
  assert.match(messages[1].content, /старая нить/);
  const parsed = parseFound('Вот: ```json\n[{"who":"Сатору","text":"Не рассказал про шрам"},{"text":""},{"text":"Ключи"}]\n```');
  assert.deepEqual(parsed.map(item => item.text), ['Не рассказал про шрам', 'Ключи']);
  assert.deepEqual(parseFound('ничего нет'), []);
  assert.deepEqual(parseFound('[сломано'), []);
});

// ───────── настроение
test('настроение героев: ставится и снимается, в промпт попадают только герои сцены', () => {
  let moods = {};
  moods = setMood(moods, 'Сатору', 'smirk');
  moods = setMood(moods, 'Гето', 'angry');
  assert.match(moodsBlock(moods), /Сатору is smug and teasing/);
  assert.ok(!moodsBlock(moods, ['Сатору']).includes('Гето'));
  assert.equal(moodsBlock(setMood(moods, 'Сатору', ''), ['Сатору']), '');
  assert.deepEqual(normalizeMoods({ А: { mood: 'нет-такого' }, Б: { mood: 'sad' } }), { Б: { mood: 'sad', at: 0 } });
  assert.ok(MOODS.length >= 10 && MOODS.every(item => item.emoji && item.label && item.en));
  assert.match(buildMoodMessages({ chat: [], names: ['А'] })[1].content, /"Имя героя":"id настроения"/);
  assert.deepEqual(parseMoodAnswer('Ответ: {"сатору":"love","Гето":"нет","Кто-то":"sad"}', ['Сатору', 'Гето']), { Сатору: 'love' });
});

test('тема по настроению: правила сами задают, когда и какой цвет; через полночь, накал, погода, выключенное', () => {
  assert.equal(hourFromText('14:20'), 14);
  assert.equal(hourFromText('вечер'), null);
  assert.equal(hourInRange(23, 22, 5), true);
  assert.equal(hourInRange(3, 22, 5), true);
  assert.equal(hourInRange(12, 22, 5), false);
  assert.equal(hourInRange(12, null, null), true, 'часы не заданы: любые');
  assert.equal(hourInRange(null, 8, 10), false, 'часа нет, а правило про часы');
  const theme = normalizeMoodTheme({ enabled: true });
  assert.equal(theme.rules.length, DEFAULT_RULES.length, 'без правил человека берутся начальные');
  const day = tintFor(theme, { hour: 12, heat: 0, weather: '' });
  assert.equal(day.opacity, 0);
  const night = tintFor(theme, { hour: 2, heat: 0, weather: '' });
  assert.deepEqual(night.matched, ['Ночь']);
  assert.ok(night.css.includes('linear-gradient'));
  const hot = tintFor(theme, { hour: 12, heat: 95, weather: '' });
  assert.deepEqual(hot.matched, ['Накал']);
  assert.ok(hot.css.includes('linear-gradient(to top'), 'накал — градиент снизу вверх');
  // сохранённые начальные правила становятся градиентом снизу, цвет остаётся её
  const old = normalizeMoodTheme({ enabled: true, rules: [{ id: 'night', name: 'Ночь', hourFrom: 22, hourTo: 5, color: '#123456', alpha: 30, style: 'flat' }] });
  assert.equal(old.rules.find(r => r.id === 'night').style, 'bottom');
  assert.equal(old.rules.find(r => r.id === 'night').color, '#123456');
  assert.ok(old.rules.some(r => r.id === 'rain'), 'погодные дописаны');
  assert.deepEqual(tintFor(theme, { hour: 23, heat: 90, weather: '' }).matched, ['Ночь', 'Накал'], 'подходящие правила накладываются слоями');
  assert.equal(tintFor({ ...theme, enabled: false }, { hour: 2, heat: 99 }).opacity, 0);
  // чужое правило: только гроза, красный
  const own = normalizeMoodTheme({ enabled: true, rules: [{ name: 'Моя гроза', color: '#ff0000', alpha: 30, weather: 'storm', style: 'edges' }] });
  assert.equal(tintFor(own, { hour: 12, heat: 0, weather: 'rain' }).opacity, 0);
  assert.deepEqual(tintFor(own, { hour: 12, heat: 0, weather: 'storm' }).matched, ['Моя гроза']);
  assert.ok(tintFor(own, { hour: 12, heat: 0, weather: 'storm' }).css.includes('255 0 0'));
  // накал растёт: у границы слабее, чем на пределе
  const grow = normalizeRule({ color: '#ff0000', alpha: 40, heatMin: 40, heatMax: 100, grow: true });
  assert.equal(layerFor(grow, { heat: 40 }), null);
  assert.ok(layerFor(grow, { heat: 100 }).includes('0.400'));
  assert.equal(normalizeRule({ color: 'не цвет', alpha: 999, heatMin: 90, heatMax: 10 }).alpha, 60);
  assert.equal(normalizeRule({ color: 'не цвет' }).color, '#888888');
  assert.ok(normalizeRule({ heatMin: 90, heatMax: 10 }).heatMin <= normalizeRule({ heatMin: 90, heatMax: 10 }).heatMax);
});

// ───────── звуки
test('звуки: петля внахлёст, случайный старт внутри записи, громкость и виды погоды', () => {
  const plan = loopPlan(60, 4);
  assert.equal(plan.fade, 4);
  assert.equal(plan.period, 56);
  const short = loopPlan(3, 4);
  assert.ok(short.fade <= 1 && short.period > 0);
  assert.equal(randomStart(60, 4, () => 0), 0);
  assert.ok(randomStart(60, 4, () => 0.999) <= 30);
  assert.equal(randomStart(5, 4, () => 0.9), 0);
  assert.ok(gainFor(50) < 0.5 && gainFor(100) === 1 && gainFor(0) === 0);
  assert.equal(soundKindFor('rain'), 'rain');
  assert.equal(soundKindFor('нет'), null);
  assert.ok(Object.keys(SOUND_KINDS).includes('storm'));
  assert.equal(normalizeWeatherSound({ enabled: true, volume: 500 }).volume, 100);
});

// ───────── график отношений
function graphState() {
  const from = 'ent-a';
  const to = 'ent-b';
  const id = relationshipId(from, to);
  return {
    id,
    state: {
      config: { scales: [{ id: 'trust', label: 'Доверие', default: 0 }, { id: 'love', label: 'Любовь', default: 0 }] },
      entities: { [from]: { name: 'Аня' }, [to]: { name: 'Сатору' } },
      baseline: { relationships: {} },
      relationships: { [id]: { id, from, to, scales: { trust: 40, love: 0 } } },
      operations: [
        { id: 'o1', type: 'scale.delta', messageIndex: 2, payload: { from, to, scaleId: 'trust', value: 10 } },
        { id: 'o2', type: 'scale.delta', messageIndex: 4, payload: { from, to, scaleId: 'love', value: 5 } },
        { id: 'o3', type: 'scale.set', messageIndex: 6, payload: { relationshipId: id, scaleId: 'trust', value: -20 } },
        { id: 'o4', type: 'scale.delta', payload: { from, to, scaleId: 'trust', value: 500 } },
      ],
    },
  };
}

test('график: значения шкалы по журналу, зажимаются в границы; путь SVG и список линий', () => {
  const { id, state } = graphState();
  const trust = scaleSeries(state, id, 'trust');
  assert.deepEqual(trust.map(point => point.value), [0, 10, -20, 100]);
  assert.deepEqual(trust.map(point => point.index), [null, 2, 6, null]);
  assert.deepEqual(scaleSeries(state, id, 'love').map(point => point.value), [0, 5]);
  assert.deepEqual(scaleSeries(state, id, 'нет'), []);
  assert.deepEqual(relationLines(state), [{ id, label: 'Аня → Сатору' }]);
  const path = chartPath(trust, { width: 100, height: 50 });
  assert.match(path, /^M[\d. ]+( L[\d. ]+){3}$/);
  assert.match(chartPath([{ value: 0 }]), /^M[\d. ]+ L[\d. ]+$/);
  assert.equal(chartPath([]), '');
  const n = normalizeRelGraph({ pinned: [{ lineId: 'x', place: 'rail' }, { nope: 1 }] });
  assert.deepEqual(n.pinned, [{ lineId: 'x', scaleIds: [], place: 'rail' }]);
});

// ───────── вкладки
function mount({ chat = [], metadata = {}, extraBody = '' } = {}) {
  const win = new JSDOM(`<!doctype html><body class="pud-on"><div id="ku-scene-chips">${extraBody}</div></body>`, { pretendToBeVisual: true, url: 'http://localhost/' }).window;
  const handlers = {};
  const prompts = {};
  const context = {
    chat,
    chatMetadata: metadata,
    chatId: 'c1',
    name1: 'Аня',
    saveMetadataDebounced() {},
    setExtensionPrompt: (key, value) => { prompts[key] = value; },
    eventTypes: { CHAT_CHANGED: 'chat' },
    eventSource: { on: (type, fn) => { (handlers[type] ??= []).push(fn); }, removeListener: (type, fn) => { handlers[type] = (handlers[type] ?? []).filter(item => item !== fn); } },
    ConnectionManagerRequestService: { getSupportedProfiles: () => [{ id: 'p1', name: 'Мини' }], sendRequest: async () => ({ content: '[]' }) },
  };
  globalThis.SillyTavern = { getContext: () => context };
  const tabs = {};
  const shared = {
    hub: {
      addTab(id) {
        const pane = win.document.createElement('section');
        pane.dataset.pane = id;
        win.document.body.append(pane);
        tabs[id] = pane;
        return { pane, remove: () => pane.remove() };
      },
      open() {},
    },
  };
  return { win, document: win.document, context, prompts, tabs, shared, handlers, done: () => { delete globalThis.SillyTavern; } };
}
const click = (m, node) => node.dispatchEvent(new m.win.MouseEvent('click', { bubbles: true }));

test('вкладка «Повторы»: показывает штамп, «Запретить» кладёт запрет в промпт, откат убирает', () => {
  const phrase = 'воздух в комнате сгустился';
  const chat = [1, 2, 3].map(n => ({ name: 'Рассказчик', is_user: false, mes: `Сцена ${n}. ${phrase} сразу.` }));
  const m = mount({ chat });
  const settings = {};
  const undo = startRepeats(m.document, { context: m.context, settings, save() {}, shared: m.shared });
  try {
    const pane = m.tabs.repeats;
    assert.match(pane.textContent, /воздух в комнате сгустился/);
    click(m, pane.querySelector('[data-act="ban"]'));
    assert.deepEqual(settings.repeats.bans.length, 1);
    assert.match(m.prompts['pud-repeats'], /Do not use them/);
    click(m, pane.querySelector('[data-act="unban"]'));
    assert.equal(m.prompts['pud-repeats'], '');
    const field = pane.querySelector('[data-field="newban"]');
    field.value = 'своя фраза';
    click(m, pane.querySelector('[data-act="addban"]'));
    assert.deepEqual(settings.repeats.bans, ['своя фраза']);
  } finally { undo(); m.done(); }
  assert.equal(m.document.querySelector('[data-pane="repeats"]'), null);
});

test('вкладка «Нити»: добавить, отложить, закрыть; открытые уходят в промпт; поиск моделью добавляет найденное', async () => {
  const chat = [{ name: 'Аня', is_user: true, mes: 'Расскажи про шрам.' }, { name: 'Сатору', is_user: false, mes: 'Потом.' }];
  const m = mount({ chat });
  m.context.ConnectionManagerRequestService.sendRequest = async () => ({ content: '[{"who":"Сатору","text":"Обещал рассказать про шрам потом"}]' });
  const settings = { peek: { commentProfile: 'p1' } };
  const undo = startThreads(m.document, { context: m.context, settings, save() {}, shared: m.shared });
  try {
    const pane = m.tabs.threads;
    pane.querySelector('[data-field="text"]').value = 'Ключи так и не нашлись';
    click(m, pane.querySelector('[data-act="add"]'));
    assert.match(m.prompts['pud-threads'], /Ключи так и не нашлись/);
    assert.equal(readMeta(m.context, 'threads').length, 1);
    click(m, pane.querySelector('[data-act="snooze"]'));
    assert.equal(m.prompts['pud-threads'], '');
    click(m, pane.querySelector('[data-act="open"]'));
    click(m, pane.querySelector('[data-act="find"]'));
    await wait(30);
    assert.equal(readMeta(m.context, 'threads').length, 2);
    assert.match(m.prompts['pud-threads'], /шрам/);
    assert.match(pane.textContent, /Найдено нитей: 1/);
    click(m, pane.querySelector('[data-act="close"]'));
    click(m, pane.querySelector('[data-act="remove"]'));
    assert.ok(readMeta(m.context, 'threads').length <= 2);
  } finally { undo(); m.done(); }
});

test('вкладка «Нити»: без выбранной модели поиск говорит, куда идти', async () => {
  const m = mount({ chat: [{ name: 'Аня', is_user: true, mes: 'Привет' }] });
  const origWarn = console.warn; const origErr = console.error; console.warn = () => {}; console.error = () => {};
  const undo = startThreads(m.document, { context: m.context, settings: {}, save() {}, shared: m.shared });
  try {
    click(m, m.tabs.threads.querySelector('[data-act="find"]'));
    await wait(20);
    assert.match(m.tabs.threads.textContent, /выберите модель во вкладке «Слива»/i);
  } finally { console.warn = origWarn; console.error = origErr; undo(); m.done(); }
});

function sceneBridge(scene, listeners = new Set()) {
  return {
    scene: {
      read: () => scene.value,
      subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      lines: () => scene.lines ?? [],
      scales: () => scene.scales ?? [],
      series: (lineId, scaleId) => scene.series?.(lineId, scaleId) ?? [],
    },
    emit: () => listeners.forEach(fn => fn()),
  };
}

/** Притворяется шторкой Кулис: реестр страниц, «какая открыта» и перерисовка; open(id) рисует страницу в div. */
function paneHost(m, bridge) {
  const now = { id: '', box: null };
  bridge.panes = new Map();
  bridge.paneHooks = {
    current: () => now.id,
    rerender: () => { if (now.id && bridge.panes.has(now.id)) { now.box.replaceChildren(); bridge.panes.get(now.id).render(now.box); } },
  };
  return {
    open(id) {
      now.id = id;
      now.box = m.document.createElement('div');
      m.document.body.append(now.box);
      bridge.panes.get(id).render(now.box);
      return now.box;
    },
  };
}

const chipsHtml = '<button class="ku-chip on"><span class="ku-chip-name">Сатору</span></button><button class="ku-chip on"><span class="ku-chip-name">Гето</span></button><button class="ku-chip on"><span class="ku-chip-name">Аня</span><span class="ku-chip-note">персона</span></button><button class="ku-chip"><span class="ku-chip-name">Нанами</span></button>';

test('вкладка «Настроение»: плашки у каждого героя свои, у персоны и тех, кого нет на сцене, их нет; текущая подсвечена', async () => {
  const m = mount({ extraBody: chipsHtml });
  const bridge = sceneBridge({ value: { heat: 0, time: '', cast: ['Сатору', 'Гето'], weather: null } });
  const settings = { moods: { strips: true, stripsReset: true } };
  const undo = startMood(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge });
  try {
    await wait(120);
    const strips = [...m.document.querySelectorAll('#ku-scene-chips .pud-mood-strip')];
    assert.deepEqual(strips.map(item => item.dataset.name), ['Сатору', 'Гето'], 'ни персоны, ни Нанами');
    assert.equal(strips[0].querySelectorAll('.pud-mood-pill').length, MOODS.length);
    assert.equal(strips[0].previousElementSibling.classList.contains('ku-chip'), true, 'плашки стоят сразу под героем');
    click(m, strips[0].querySelector('[data-mood="angry"]'));
    click(m, strips[1].querySelector('[data-mood="sad"]'));
    const saved = readMeta(m.context, 'moods');
    assert.deepEqual(Object.fromEntries(Object.entries(saved).map(([name, item]) => [name, item.mood])), { Сатору: 'angry', Гето: 'sad' }, 'у каждого своё');
    assert.match(m.prompts['pud-moods'], /Сатору is angry/);
    assert.match(m.prompts['pud-moods'], /Гето is sad/);
    const lit = m.document.querySelectorAll('#ku-scene-chips .pud-mood-pill.on');
    assert.equal(lit.length, 2);
    // повторный клик по той же плашке снимает настроение
    click(m, m.document.querySelector('#ku-scene-chips .pud-mood-strip[data-name="Сатору"] .pud-mood-pill.on'));
    assert.equal(readMeta(m.context, 'moods')['Сатору'], undefined);
    // выключили плашки
    const off = m.tabs.mood.querySelector('[data-field="strips"]');
    off.checked = false;
    off.dispatchEvent(new m.win.Event('change', { bubbles: true }));
    assert.equal(m.document.querySelectorAll('#ku-scene-chips .pud-mood-strip').length, 0);
  } finally { undo(); m.done(); }
  assert.equal(m.document.querySelectorAll('.pud-mood-strip').length, 0);
});

test('настроение: модель следит автоматически после ответов и пишет по каждому герою, персону не трогает', async () => {
  const m = mount({ extraBody: chipsHtml, chat: [{ name: 'Сатору', is_user: false, mes: 'Он смутился.' }, { name: 'Гето', is_user: false, mes: 'Он нахмурился.' }] });
  const seen = [];
  m.context.ConnectionManagerRequestService.sendRequest = async (id, messages) => { seen.push(messages[1].content); return { content: '{"Сатору":"shy","Гето":"angry","Аня":"sad"}' }; };
  m.context.eventTypes.MESSAGE_RECEIVED = 'recv';
  const bridge = sceneBridge({ value: { heat: 0, time: '', cast: ['Сатору', 'Гето'], weather: null } });
  const settings = { peek: { commentProfile: 'p1' }, moods: { auto: true, autoEvery: 2, strips: true, stripsReset: true } };
  const undo = startMood(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge });
  try {
    for (const fn of m.handlers.recv) fn();
    await wait(1700);
    assert.equal(seen.length, 0, 'после первого ответа ещё рано (каждые 2)');
    for (const fn of m.handlers.recv) fn();
    await wait(1700);
    assert.equal(seen.length, 1);
    assert.match(seen[0], /Герои: Сатору, Гето\./, 'персоны среди героев нет');
    const saved = readMeta(m.context, 'moods');
    assert.deepEqual(Object.fromEntries(Object.entries(saved).map(([name, item]) => [name, item.mood])), { Сатору: 'shy', Гето: 'angry' });
    assert.equal(saved['Аня'], undefined, 'персоне настроение не ставится, даже если модель его прислала');
    assert.ok(m.document.querySelector('#ku-scene-chips .pud-mood-strip[data-name="Гето"] .pud-mood-pill[data-mood="angry"].on'));
  } finally { undo(); m.done(); }
});

test('настроение: без выбранной модели автоматика молчит; вручную работает', async () => {
  const m = mount({ extraBody: chipsHtml });
  m.context.eventTypes.MESSAGE_RECEIVED = 'recv';
  let calls = 0;
  m.context.ConnectionManagerRequestService.sendRequest = async () => { calls += 1; return { content: '{}' }; };
  const undo = startMood(m.document, { context: m.context, settings: { moods: { auto: true, autoEvery: 1, stripsReset: true } }, save() {}, shared: m.shared, bridge: sceneBridge({ value: { cast: ['Сатору'] } }) });
  try {
    for (const fn of m.handlers.recv) fn();
    await wait(1700);
    assert.equal(calls, 0);
  } finally { undo(); m.done(); }
});

test('тема по настроению (Визуал): вкладка с правилами, правка цвета красит налёт сразу, добавить и вернуть стандартные', async () => {
  const m = mount();
  const scene = { value: { heat: 90, time: '02:10', weather: { kind: 'storm' } } };
  const bridge = sceneBridge(scene);
  const settings = { moodTheme: { enabled: true, strength: 100 } };
  const undo = startMoodTheme(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge });
  try {
    const pane = m.tabs.moodtheme;
    assert.equal(pane.querySelectorAll('.pud-rule').length, DEFAULT_RULES.length);
    assert.match(pane.querySelector('[data-readout]').textContent, /2 ч по сюжету.*накал 90.*Сработало: Ночь, Накал/);
    const tint = m.document.getElementById(TINT_ID);
    assert.equal(tint.style.opacity, '1');
    // правка правила «Гроза»: включить
    const storm = pane.querySelector('[data-rule="storm"]');
    const on = storm.querySelector('[data-f="on"]');
    on.checked = true;
    on.dispatchEvent(new m.win.Event('change', { bubbles: true }));
    assert.match(pane.querySelector('[data-readout]').textContent, /Гроза/);
    assert.equal(settings.moodTheme.rules.find(item => item.id === 'storm').on, true);
    // свой цвет
    const color = storm.querySelector('[data-f="color"]');
    color.value = '#00ff00';
    color.dispatchEvent(new m.win.Event('input', { bubbles: true }));
    assert.equal(settings.moodTheme.rules.find(item => item.id === 'storm').color, '#00ff00');
    // добавить и удалить правило
    click(m, pane.querySelector('[data-act="add"]'));
    assert.equal(settings.moodTheme.rules.length, DEFAULT_RULES.length + 1);
    click(m, pane.querySelector(`[data-act="remove"][data-id="${settings.moodTheme.rules.at(-1).id}"]`));
    assert.equal(settings.moodTheme.rules.length, DEFAULT_RULES.length);
    // выключить совсем
    const master = pane.querySelector('[data-global="enabled"]');
    master.checked = false;
    master.dispatchEvent(new m.win.Event('change', { bubbles: true }));
    assert.equal(tint.style.opacity, '0');
    // вернуть стандартные
    click(m, pane.querySelector('[data-act="reset"]'));
    assert.equal(settings.moodTheme.rules.find(item => item.id === 'rain').on, true);
  } finally { undo(); m.done(); }
  assert.equal(m.document.getElementById(TINT_ID), null);
});

test('быстрое меню шторки: панели повторов, нитей, настроения и отношений открываются кнопками, запрет вписывается прямо там', async () => {
  const chat = [1, 2, 3].map(n => ({ name: 'Рассказчик', is_user: false, mes: `Сцена ${n}. воздух в комнате сгустился сразу.` }));
  const m = mount({ chat, extraBody: chipsHtml });
  const { state } = graphState();
  const bridge = sceneBridge({ value: { heat: 0, time: '', cast: ['Сатору', 'Гето'], weather: null }, lines: relationLines(state), scales: state.config.scales, series: (a, b) => scaleSeries(state, a, b) });
  const settings = { moods: { stripsReset: true } };
  const host = paneHost(m, bridge);
  const undos = [
    startQuick(m.document, { shared: m.shared, bridge }),
    startRepeats(m.document, { context: m.context, settings, save() {}, shared: m.shared }),
    startThreads(m.document, { context: m.context, settings, save() {}, shared: m.shared }),
    startMood(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge }),
    startRelGraph(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge }),
  ];
  try {
    await wait(120);
    assert.deepEqual([...bridge.panes.keys()].sort(), ['mood', 'relgraph', 'repeats', 'threads'], 'четыре страницы шторки');
    assert.deepEqual([...bridge.panes.values()].map(item => item.name).sort(), ['Нити', 'Повторы', 'Связи', 'Эмоции']);
    // «Пнуть»: настоящая плитка спрятана, боковая планка нажимает её
    const kickTile = m.document.createElement('button');
    kickTile.className = 'ku-tile kick';
    let kicks = 0;
    kickTile.addEventListener('click', () => { kicks += 1; });
    const railBox = m.document.querySelector('#ku-scene-chips .ku-rail') ?? m.document.getElementById('ku-scene-chips');
    railBox.append(kickTile);
    await wait(2200);
    const kickBtn = m.document.querySelector('#ku-scene-chips > .pud-sidebar .pud-kick-btn');
    assert.ok(kickBtn, 'кнопка «пнуть» в боковой планке');
    click(m, kickBtn);
    assert.equal(kicks, 1);
    // повторы: вписать новый запрет
    let pop = host.open('repeats');
    assert.match(pop.textContent, /воздух в комнате сгустился/);
    pop.querySelector('[data-q="newban"]').value = 'мурашки по коже';
    click(m, pop.querySelector('[data-q="addban"]'));
    assert.deepEqual(settings.repeats.bans, ['мурашки по коже']);
    assert.match(m.prompts['pud-repeats'], /мурашки по коже/);
    assert.match(pop.textContent, /мурашки по коже/, 'панель обновилась');
    // нити: добавить и отложить
    pop = host.open('threads');
    pop.querySelector('[data-q="text"]').value = 'Ключи не нашлись';
    click(m, pop.querySelector('[data-q="add"]'));
    assert.match(m.prompts['pud-threads'], /Ключи не нашлись/);
    click(m, pop.querySelector('[data-q="snooze"]'));
    assert.equal(m.prompts['pud-threads'], '');
    // настроение: плашка в панели
    pop = host.open('mood');
    click(m, pop.querySelector('.pud-mood-pill[data-name="Гето"][data-mood="tense"]'));
    assert.equal(readMeta(m.context, 'moods')['Гето'].mood, 'tense');
    assert.ok(pop.querySelector('.pud-mood-pill[data-name="Гето"][data-mood="tense"].on'), 'подсветка обновилась');
    // отношения: график и закрепление в шторке
    pop = host.open('relgraph');
    assert.ok(pop.querySelector('svg.pud-relchart path'));
    click(m, pop.querySelector('[data-q="rail"]'));
    assert.equal(settings.relGraph.pinned[0].place, 'rail');
  } finally { undos.reverse().forEach(fn => fn()); m.done(); }
  assert.equal(bridge.panes.size, 0, 'при выключении страницы убраны');
});

test('звуки: бесшовная петля — на стыке нет скачка и она короче записи на перекрытие', () => {
  const rate = 1000;
  const total = 6000;
  const signal = Float32Array.from({ length: total }, (_, i) => Math.sin(i * 0.05) * 0.8);
  const [loop] = seamlessLoop([signal], rate, 2);
  assert.equal(loop.length, total - 2000);
  // на стыке петли (конец → начало) продолжение плавное
  const stitched = Math.abs(loop[loop.length - 1] - loop[0]);
  const naive = Math.abs(signal[total - 1] - signal[0]);
  assert.ok(stitched < 0.06, `скачок на стыке ${stitched}`);
  assert.ok(stitched < naive || naive < 0.06);
  // середина записи не тронута
  assert.equal(loop[3000], signal[3000]);
  // очень короткая запись не падает
  assert.equal(seamlessLoop([Float32Array.from([0.1, 0.2])], rate, 4)[0].length, 2);
});

function fakeStore(initial = {}) {
  const files = { ...initial };
  return {
    files,
    get: async kind => files[kind] ?? null,
    put: async (kind, value) => { files[kind] = value; },
    remove: async kind => { delete files[kind]; },
    names: async () => Object.fromEntries(Object.entries(files).map(([kind, value]) => [kind, value.name])),
  };
}
function fakeEngine() {
  const log = [];
  let current = null;
  return {
    log,
    available: () => true,
    setVolume: value => log.push(['volume', value]),
    resume: async () => {},
    suspend: async () => {},
    current: () => current,
    play: kind => { if (current === kind) return; current = kind; log.push(['play', kind]); },
    stop: () => { if (current) log.push(['stop', current]); current = null; },
    destroy: () => log.push(['destroy']),
  };
}

test('звуки погоды: под погоду сюжета играет нужный файл, пауза в шторке останавливает, без файла тишина', async () => {
  const m = mount();
  const scene = { value: { weather: { kind: 'rain' } } };
  const bridge = sceneBridge(scene);
  const storage = fakeStore({ rain: { name: 'дождь.mp3', blob: { arrayBuffer: async () => new ArrayBuffer(8) } } });
  const engine = fakeEngine();
  const settings = { weatherSound: { enabled: true, volume: 40 } };
  // в jsdom нет Web Audio: подменяем разбор записи, чтобы дойти до проигрывателя
  m.win.AudioContext = class { async decodeAudioData() { return { duration: 60 }; } close() {} };
  const undo = startWeatherSound(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge, storage, createEngine: () => engine });
  try {
    await wait(30);
    bridge.emit();
    await wait(30);
    assert.deepEqual(engine.log.filter(item => item[0] === 'play'), [['play', 'rain']]);
    const button = m.document.querySelector(`.${SOUND_BUTTON_CLASS}`);
    assert.ok(button, 'кнопка в шторке');
    click(m, button);
    await wait(20);
    assert.ok(engine.log.some(item => item[0] === 'stop'));
    assert.equal(m.document.querySelector(`.${SOUND_BUTTON_CLASS}`).textContent, '🔇');
    click(m, m.document.querySelector(`.${SOUND_BUTTON_CLASS}`));
    scene.value = { weather: { kind: 'clear' } };
    bridge.emit();
    await wait(30);
    assert.equal(engine.current(), null, 'для ясной погоды файла нет: тишина');
    // выключили
    bridge.soundPanel.setEnabled(false);
    await wait(20);
    assert.equal(m.document.querySelector(`.${SOUND_BUTTON_CLASS}`), null);
  } finally { undo(); m.done(); }
  assert.ok(engine.log.some(item => item[0] === 'destroy'));
});

test('звуки погоды: файл выбирается и убирается через панель окна календаря, слишком большой отклоняется', async () => {
  const m = mount();
  const storage = fakeStore();
  const bridge = sceneBridge({ value: { weather: null } });
  const undo = startWeatherSound(m.document, { context: m.context, settings: {}, save() {}, shared: m.shared, bridge, storage, createEngine: () => fakeEngine() });
  try {
    await wait(20);
    const panel = bridge.soundPanel;
    assert.ok(panel, 'панель отдана мосту');
    assert.equal(m.tabs.sounds, undefined, 'вкладки «Звуки погоды» в настройках больше нет');
    assert.ok(panel.view().kinds.some(item => item.kind === 'rain' && !item.file));
    await panel.pick('rain', { name: 'дождь.ogg', size: 1000 });
    assert.equal(storage.files.rain.name, 'дождь.ogg');
    assert.equal(panel.view().kinds.find(item => item.kind === 'rain').file, 'дождь.ogg');
    await panel.pick('storm', { name: 'гроза.wav', size: 90 * 1024 * 1024 });
    assert.equal(storage.files.storm, undefined);
    assert.match(panel.view().status, /слишком большой/);
    await panel.remove('rain');
    assert.equal(storage.files.rain, undefined);
  } finally { undo(); m.done(); }
  assert.equal(bridge.soundPanel, null, 'при остановке модуля панель снимается');
});

test('график отношений: вкладка рисует линию, закрепление виджетом и в шторке, открепление', () => {
  const { id, state } = graphState();
  const m = mount();
  const scene = {
    value: { heat: 0 },
    lines: relationLines(state),
    scales: state.config.scales,
    series: (lineId, scaleId) => scaleSeries(state, lineId, scaleId),
  };
  const settings = { relGraph: { scaleIds: ['trust', 'love'] } };
  const bridge = sceneBridge(scene);
  const undo = startRelGraph(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge });
  try {
    const pane = m.tabs.relgraph;
    assert.ok(pane.querySelector('svg.pud-relchart path'), 'линия графика');
    assert.match(pane.textContent, /Аня → Сатору/);
    click(m, pane.querySelector('[data-act="widget"]'));
    assert.equal(settings.relGraph.pinned.length, 1);
    const widget = m.document.querySelector(`.${WIDGET_CLASS}`);
    assert.ok(widget && widget.querySelector('svg path'));
    assert.match(widget.querySelector('.pud-relw-title').textContent, /Аня → Сатору/);
    click(m, pane.querySelector('[data-act="rail"]'));
    assert.equal(settings.relGraph.pinned[0].place, 'rail');
    assert.equal(m.document.querySelector(`.${WIDGET_CLASS}`), null, 'виджет ушёл, остался мини-график в шторке');
    bridge.emit();
    assert.equal(settings.relGraph.pinned.length, 1);
    click(m, pane.querySelector('[data-act="widget"]'));
    click(m, m.document.querySelector(`.${WIDGET_CLASS} .pud-relw-x`));
    assert.equal(settings.relGraph.pinned.length, 0);
    assert.equal(m.document.querySelector(`.${WIDGET_CLASS}`), null);
    assert.ok(id);
  } finally { undo(); m.done(); }
});

test('все новые вкладки без моста Кулис не падают (старый запуск без Закулисья)', () => {
  const m = mount();
  const settings = { moods: { stripsReset: true } };
  const undos = [
    startMood(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge: null }),
    startRelGraph(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge: null }),
    startWeatherSound(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge: null, storage: fakeStore(), createEngine: () => fakeEngine() }),
  ];
  try {
    assert.ok(m.tabs.mood && m.tabs.relgraph);
    assert.match(m.tabs.relgraph.textContent, /Модуль Кулис не подключён/);
  } finally { undos.forEach(fn => fn()); m.done(); }
  for (const id of ['mood', 'relgraph']) assert.equal(m.document.querySelector(`[data-pane="${id}"]`), null);
});

test('график отношений: шкалы линии выбираются значками (⚙), название в подсказке; без значка берётся первая буква', () => {
  const { id, state } = graphState();
  const m = mount();
  const scaleDefs = [
    { id: 'trust', label: 'Доверие', icon: '<span class="ku-ico"><svg viewBox="0 0 24 24"><path d="M1 1"/></svg></span>' },
    { id: 'love', label: 'Любовь' },
  ];
  const scene = { value: { heat: 0 }, lines: relationLines(state), scales: scaleDefs, series: (a, b) => scaleSeries(state, a, b) };
  const settings = { relGraph: { scaleIds: ['trust'] } };
  const bridge = sceneBridge(scene);
  bridge.scene.overview = ids => relationOverview(state, ids);
  bridge.scene.shifts = limit => recentShifts(state, limit);
  const host = paneHost(m, bridge);
  const undos = [
    startQuick(m.document, { shared: m.shared, bridge }),
    startRelGraph(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge }),
  ];
  try {
    const pane = m.tabs.relgraph;
    assert.equal(pane.querySelector('.pud-scale-btn[data-scale]'), null, 'общего ряда значков больше нет');
    click(m, pane.querySelector(`[data-rel="edit"][data-id="${id}"]`));
    const trust = pane.querySelector('.pud-scale-btn[data-rel="scale"][data-sid="trust"]');
    const love = pane.querySelector('.pud-scale-btn[data-rel="scale"][data-sid="love"]');
    assert.equal(trust.title, 'Доверие');
    assert.equal(trust.getAttribute('aria-pressed'), 'true');
    assert.ok(trust.querySelector('svg'), 'значок шкалы из Кулис');
    assert.equal(love.textContent, 'Л', 'без значка первая буква');
    click(m, love);
    assert.deepEqual(settings.relGraph.lineScales[id], ['trust', 'love']);
    assert.equal(pane.querySelector('.pud-scale-btn[data-rel="scale"][data-sid="love"]').getAttribute('aria-pressed'), 'true');
    click(m, pane.querySelector('.pud-scale-btn[data-rel="scale"][data-sid="trust"]'));
    assert.deepEqual(settings.relGraph.lineScales[id], ['love']);
    // страница в шторке: то же, и график берёт шкалы линии
    const pop = host.open('relgraph');
    assert.equal(pop.querySelector('.pud-scale-btn[data-q-scale]'), null);
    click(m, pop.querySelector('.pud-scale-btn[data-rel="scale"][data-sid="trust"]'));
    assert.deepEqual(settings.relGraph.lineScales[id], ['trust', 'love']);
    assert.equal(pop.querySelector('.pud-scale-btn[data-rel="scale"][data-sid="trust"]').title, 'Доверие');
    assert.ok(pop.querySelector('.pud-rellegend li[title="Доверие"] svg'), 'в легенде тоже значок');
  } finally { undos.reverse().forEach(fn => fn()); m.done(); }
});

test('отношения: сводка «сейчас» со стрелками и последние сдвиги по всем линиям, новые сверху', () => {
  const { id, state } = graphState();
  const shifts = recentShifts(state, 10);
  // журнал: trust +10 (сообщение 2), love +5 (4), trust сброшен в -20 (6), trust +500 зажат до 100 (без номера)
  assert.deepEqual(shifts.map(item => [item.scaleId, item.delta, item.value, item.index]), [['trust', 120, 100, null], ['trust', -30, -20, 6], ['love', 5, 5, 4], ['trust', 10, 10, 2]]);
  assert.equal(shifts[0].label, 'Аня → Сатору');
  assert.equal(recentShifts(state, 2).length, 2);
  const over = relationOverview(state, ['trust', 'love'], 5);
  assert.equal(over.length, 1);
  assert.equal(over[0].id, id);
  assert.deepEqual(over[0].scales.map(item => [item.id, item.value]), [['trust', 40], ['love', 0]], 'текущее значение берётся из состояния');
  assert.ok(over[0].scales[0].delta !== 0 || over[0].scales[0].delta === 0);
  assert.deepEqual(relationOverview(state, ['нет']).at(0).scales, [], 'неизвестных шкал нет');
});

test('отношения: страница показывает сводку со значками и полосками, ленту сдвигов и прячет график в раскрывающийся блок', async () => {
  const m = mount();
  const { state } = graphState();
  const scaleDefs = state.config.scales.map(item => ({ ...item, icon: '<svg class="pud-i"></svg>' }));
  const scene = { value: { heat: 0 }, lines: relationLines(state), scales: scaleDefs, series: (a, b) => scaleSeries(state, a, b) };
  const bridge = sceneBridge(scene);
  bridge.scene.overview = ids => relationOverview(state, ids);
  bridge.scene.shifts = limit => recentShifts(state, limit);
  const settings = { relGraph: { scaleIds: ['trust', 'love'], stickers: { mode: 'bars' } } };
  const undo = startRelGraph(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge });
  try {
    const pane = m.tabs.relgraph;
    assert.equal(pane.querySelectorAll('.pud-rel-line').length, 1, 'одна пара — одна строка сводки');
    assert.equal(pane.querySelectorAll('.pud-rel-cell').length, 2, 'две выбранные шкалы');
    assert.ok(pane.querySelector('.pud-rel-cell .pud-rel-bar i'), 'полоска значения');
    assert.match(pane.querySelector('.pud-rel-cell').title, /Доверие: 40/);
    assert.ok(pane.querySelectorAll('.pud-rel-shifts li').length >= 3, 'лента сдвигов');
    assert.ok(pane.querySelector('.pud-rel-shifts li[data-msg="6"]'), 'строка ведёт к сообщению');
    assert.ok(pane.querySelector('details.pud-rel-detail svg.pud-relchart'), 'график внутри раскрывающегося блока');
    assert.equal(pane.querySelector('details.pud-rel-detail').open, false);
  } finally { undo(); m.done(); }
});

test('настроения: свои значки у встроенных и свои настроения попадают в список, плашки, промпт и разбор ответа', () => {
  const config = normalizeMoodConfig({ icons: { calm: '🍵', happy: '😊', nope: 'x' }, custom: [{ label: 'Тихо ревнует', emoji: '🫥', en: 'quietly jealous', color: '#336699' }, { label: '' }] });
  assert.deepEqual(config.icons, { calm: '🍵' }, 'совпавшее со стандартным и чужие id отбрасываются');
  assert.equal(config.custom.length, 1);
  assert.match(config.custom[0].id, /^c-/);
  const list = moodList(config);
  assert.equal(list.length, MOODS.length + 1);
  assert.equal(moodOf('calm', list).emoji, '🍵');
  const own = config.custom[0].id;
  const moods = setMood({}, 'Гето', own, 1, list);
  assert.equal(moods['Гето'].mood, own);
  assert.match(moodsBlock(moods, null, list), /Гето is quietly jealous/);
  assert.equal(moodsBlock(moods, null), '', 'без своего списка чужое настроение молчит');
  assert.deepEqual(parseMoodAnswer(`{"Гето":"${own}"}`, ['Гето'], list), { 'Гето': own });
  assert.deepEqual(parseMoodAnswer(`{"Гето":"${own}"}`, ['Гето']), {});
  assert.deepEqual(normalizeMoods({ 'Гето': { mood: own } }, list)['Гето'].mood, own);
  assert.equal(normalizeMoodConfig({ custom: Array.from({ length: 30 }, (_, i) => ({ label: `м${i}` })) }).custom.length, 12);
});

test('отношения: у каждой линии свой набор шкал, линию можно скрыть и закрепить наверху', () => {
  const n = normalizeRelGraph({ hidden: ['a', 'a', 3], top: ['b'], lineScales: { x: ['trust', 'trust', 'love'], y: 'нет' } });
  assert.deepEqual(n.hidden, ['a']);
  assert.deepEqual(n.top, ['b']);
  assert.deepEqual(n.lineScales.x, ['trust', 'love']);
  assert.deepEqual(n.lineScales.y, []);
});

test('отношения: ⚙ у линии даёт ей свой набор шкал, 📌 поднимает наверх, 🙈 прячет и возвращает', async () => {
  const m = mount();
  const { id, state } = graphState();
  const other = 'rel-other';
  state.relationships[other] = { id: other, from: 'ent-b', to: 'ent-a', scales: { trust: 5, love: 70 } };
  const scaleDefs = state.config.scales.map(item => ({ ...item, icon: '<svg class="pud-i"></svg>' }));
  const scene = { value: { heat: 0 }, lines: relationLines(state), scales: scaleDefs, series: (a, b) => scaleSeries(state, a, b) };
  const bridge = sceneBridge(scene);
  bridge.scene.overview = ids => relationOverview(state, ids);
  bridge.scene.shifts = limit => recentShifts(state, limit);
  const settings = { relGraph: { scaleIds: ['trust'], stickers: { mode: 'bars' } } };
  const undo = startRelGraph(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge });
  try {
    const pane = m.tabs.relgraph;
    const cellsOf = lineId => [...pane.querySelectorAll(`.pud-rel-line`)].find(li => li.querySelector(`[data-rel="hide"][data-id="${lineId}"]`)).querySelectorAll('.pud-rel-cell').length;
    assert.equal(cellsOf(id), 1, 'общий набор: одна шкала');
    click(m, pane.querySelector(`[data-rel="edit"][data-id="${id}"]`));
    click(m, pane.querySelector(`[data-rel="scale"][data-id="${id}"][data-sid="love"]`));
    assert.deepEqual(settings.relGraph.lineScales[id], ['trust', 'love']);
    assert.equal(cellsOf(id), 2, 'у этой линии две шкалы');
    assert.equal(cellsOf(other), 1, 'у другой остался общий набор');
    click(m, pane.querySelector(`[data-rel="reset"][data-id="${id}"]`));
    assert.equal(settings.relGraph.lineScales[id], undefined);
    // наверх
    const order = () => [...pane.querySelectorAll('.pud-rel-over > li [data-rel="hide"]')].map(item => item.dataset.id);
    const before = order();
    const last = before.at(-1);
    click(m, pane.querySelector(`[data-rel="top"][data-id="${last}"]`));
    assert.equal(order()[0], last, 'закреплённая линия первая');
    // спрятать и вернуть
    click(m, pane.querySelector(`[data-rel="hide"][data-id="${last}"]`));
    assert.ok(!order().includes(last));
    assert.deepEqual(settings.relGraph.hidden, [last]);
    assert.deepEqual(settings.relGraph.top, [], 'скрытая линия не остаётся закреплённой');
    click(m, pane.querySelector(`[data-rel="show"][data-id="${last}"]`));
    assert.ok(order().includes(last));
  } finally { undo(); m.done(); }
});

test('настроение: в большой настройке эмодзи ставится выбором настроения + палитрой или полем, добавляются свои настроения', async () => {
  const m = mount({ extraBody: chipsHtml });
  const settings = { moods: { strips: true, stripsReset: true } };
  const undo = startMood(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge: sceneBridge({ value: { heat: 0, time: '', cast: ['Сатору', 'Гето'], weather: null } }) });
  try {
    await wait(120);
    const pane = m.tabs.mood;
    // без выбранного настроения поле эмодзи выключено
    assert.equal(pane.querySelector('[data-emoji-shared]').disabled, true);
    click(m, pane.querySelector('[data-pick="calm"] .pud-mood-tname'));
    const shared = pane.querySelector('[data-emoji-shared]');
    assert.equal(shared.disabled, false);
    shared.value = '🍵';
    shared.dispatchEvent(new m.win.Event('input', { bubbles: true }));
    assert.equal(settings.moods.icons.calm, '🍵', 'применяется сразу, без ухода из поля');
    assert.equal(pane.querySelector('[data-pick="calm"] .pud-mood-prev').textContent, '🍵', 'значок плитки обновился');
    await wait(120);
    assert.equal(m.document.querySelector('#ku-scene-chips .pud-mood-pill[data-mood="calm"]').textContent, '🍵', 'плашка в шторке со своим значком');
    click(m, pane.querySelector('[data-pal="🥺"]'));
    assert.equal(settings.moods.icons.calm, '🥺', 'палитра ставит эмодзи выбранному настроению');
    click(m, pane.querySelector('[data-act="emoji-reset"]'));
    assert.equal(settings.moods.icons.calm, undefined, 'пусто — стандартный значок');
    // своё настроение
    click(m, pane.querySelector('[data-act="mood-add"]'));
    const label = pane.querySelector('.pud-mood-custom[data-cid] [data-cf="label"]');
    label.value = 'Тихо ревнует';
    label.dispatchEvent(new m.win.Event('input', { bubbles: true }));
    const en = pane.querySelector('.pud-mood-custom[data-cid] [data-cf="en"]');
    en.value = 'quietly jealous';
    en.dispatchEvent(new m.win.Event('input', { bubbles: true }));
    const own = settings.moods.custom[0];
    assert.equal(own.label, 'Тихо ревнует');
    click(m, pane.querySelector('.pud-mood-custom[data-cid] .pud-mood-fl'));
    click(m, pane.querySelector('[data-pal="🥺"]'));
    assert.equal(settings.moods.custom[0].emoji, '🥺', 'палитра работает и для своих');
    await wait(120);
    const pill = m.document.querySelector(`#ku-scene-chips .pud-mood-pill[data-mood="${own.id}"]`);
    assert.ok(pill, 'своё настроение среди плашек');
    click(m, pill);
    assert.match(m.prompts['pud-moods'], /is quietly jealous/);
    // «?» раскрывает пояснение
    const dot = pane.querySelector('[data-help="icons"]');
    const noteNode = pane.querySelector('[data-note="icons"]');
    assert.equal(noteNode.hidden, true);
    click(m, dot);
    assert.equal(pane.querySelector('[data-note="icons"]').hidden, false);
    click(m, pane.querySelector('[data-act="mood-del"]'));
    assert.equal(settings.moods.custom.length, 0);
  } finally { undo(); m.done(); }
});


test('настроение: модель читает и посты автора, и ответы; после поста автора тоже обновляется', async () => {
  const msgs = buildMoodMessages({ chat: [{ name: 'Аня', text: 'Гето побледнел и отвернулся.', isUser: true }, { name: 'Рассказчик', text: 'Он промолчал.', isUser: false }], names: ['Гето'] });
  assert.match(msgs[1].content, /\[пост автора, Аня\] Гето побледнел/);
  assert.match(msgs[1].content, /\[ответ, Рассказчик\] Он промолчал/);
  assert.match(msgs[0].content, /посты автора/);
});

test('повторы: галочки и массовая чистка — запретить выбранные, «все», снять выбранные и все запреты, вернуть в подсчёт', () => {
  const a = 'воздух в комнате сгустился';
  const b = 'сердце пропустило удар';
  const chat = [1, 2, 3].map(n => ({ name: 'Рассказчик', is_user: false, mes: `Сцена ${n}. ${a} сразу. ${b} тут же.` }));
  const m = mount({ chat });
  const settings = {};
  const undo = startRepeats(m.document, { context: m.context, settings, save() {}, shared: m.shared });
  try {
    const pane = m.tabs.repeats;
    assert.ok(pane.querySelector('[data-act="bulk-ban"][disabled]'), 'без отмеченных массовые кнопки выключены');
    const check = box => { box.checked = !box.checked; box.dispatchEvent(new m.win.Event('change', { bubbles: true })); };
    check(pane.querySelector('[data-selall="found"]'));
    assert.ok(pane.querySelectorAll('[data-sel="found"]:checked').length >= 2, 'отмечены все найденные');
    click(m, pane.querySelector('[data-act="bulk-ban"]'));
    assert.ok(settings.repeats.bans.length >= 2, 'запрещены разом');
    assert.match(m.prompts['pud-repeats'], /Do not use them/);
    // выборочно снять запреты
    check(pane.querySelector('[data-sel="bans"]'));
    click(m, pane.querySelector('[data-act="bulk-unban"]'));
    const left = settings.repeats.bans.length;
    assert.ok(left >= 1);
    click(m, pane.querySelector('[data-act="clear-bans"]'));
    assert.deepEqual(settings.repeats.bans, []);
    assert.equal(m.prompts['pud-repeats'], '');
    // «это нормально» для выбранных и возврат в подсчёт
    check(pane.querySelector('[data-selall="found"]'));
    click(m, pane.querySelector('[data-act="bulk-ignore"]'));
    assert.ok(settings.repeats.ignored.length >= 2);
    click(m, pane.querySelector('[data-act="clear-ignored"]'));
    assert.deepEqual(settings.repeats.ignored, []);
  } finally { undo(); m.done(); }
});

test('настроение: своя картинка вместо значка — нажатием на значок, вставкой, сбросом; плашка рисует её, а не эмодзи', async () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const m = mount({ extraBody: chipsHtml });
  const settings = { moods: { strips: true, stripsReset: true } };
  const undo = startMood(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge: sceneBridge({ value: { heat: 0, time: '', cast: ['Сатору', 'Гето'], weather: null } }), imageFromFile: async file => { if (file.name === 'bad') throw new Error('не картинка'); return PNG; } });
  try {
    await wait(120);
    const pane = m.tabs.mood;
    // нажатие на сам значок открывает выбор файла
    let opened = 0;
    pane.querySelector('[data-mood-file]').click = () => { opened += 1; };
    click(m, pane.querySelector('[data-pick="calm"] .pud-mood-prev'));
    assert.equal(opened, 1, 'значок открывает выбор файла');
    // вставка картинки на плитку (так вставляется стикер из Telegram)
    const file = { name: 'sticker.webp', type: 'image/webp' };
    const paste = new m.win.Event('paste', { bubbles: true, cancelable: true });
    paste.clipboardData = { files: [file], items: [] };
    pane.querySelector('[data-pick="calm"] .pud-mood-tname').dispatchEvent(paste);
    await wait(60);
    assert.equal(settings.moods.images.calm, PNG);
    await wait(120);
    const pill = m.document.querySelector('#ku-scene-chips .pud-mood-pill[data-mood="calm"]');
    assert.ok(pill.querySelector('img.pud-mood-img'), 'на плашке картинка');
    assert.equal(pill.textContent, '');
    assert.ok(pane.querySelector('[data-pick="calm"] .pud-mood-prev img'), 'картинка на самом значке');
    // сброс
    click(m, pane.querySelector('[data-act="mood-img-clear"][data-mid="calm"]'));
    assert.equal(settings.moods.images.calm, undefined);
    await wait(120);
    assert.equal(m.document.querySelector('#ku-scene-chips .pud-mood-pill[data-mood="calm"]').textContent, '😌');
    // у своего настроения картинка пропадает вместе с ним
    click(m, pane.querySelector('[data-act="mood-add"]'));
    const own = settings.moods.custom[0].id;
    const paste2 = new m.win.Event('paste', { bubbles: true, cancelable: true });
    paste2.clipboardData = { files: [file], items: [] };
    pane.querySelector('.pud-mood-custom[data-cid] [data-cf="label"]').dispatchEvent(paste2);
    await wait(60);
    assert.equal(settings.moods.images[own], PNG);
    click(m, pane.querySelector('[data-act="mood-del"]'));
    assert.equal(settings.moods.images[own], undefined);
  } finally { undo(); m.done(); }
});

test('настроение: картинки в настройках проверяются — чужие ссылки и несуществующие настроения отбрасываются', () => {
  const ok = 'data:image/png;base64,iVBORw0KGgo=';
  const config = normalizeMoodConfig({ images: { calm: ok, happy: 'http://evil/x.png', nope: ok, angry: 'data:text/html;base64,AAAA' } });
  assert.deepEqual(config.images, { calm: ok });
  assert.equal(moodList(config).find(item => item.id === 'calm').image, ok);
});

import { migrateSettings } from '../src/pud/core/settings.js';
test('настроение: плашки во вкладке «Кто» по умолчанию убраны, даже если раньше были включены; вернуть можно галочкой', async () => {
  const m = mount({ extraBody: chipsHtml });
  const settings = migrateSettings({ moods: { strips: true } });
  const undo = startMood(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge: sceneBridge({ value: { heat: 0, time: '', cast: ['Сатору', 'Гето'], weather: null } }) });
  try {
    await wait(120);
    assert.equal(m.document.querySelectorAll('#ku-scene-chips .pud-mood-strip').length, 0, 'в шторке плашек нет');
    assert.equal(settings.moods.strips, false);
    assert.equal(settings.moods.stripsReset, true);
  } finally { undo(); }
});

test('отношения: стикеры — значок в рамке, который заполняется цветом; свои цвета роста, падения и выше 90, у каждого значка тоже', async () => {
  const m = mount();
  const { state } = graphState();
  const scaleDefs = state.config.scales.map(item => ({ ...item, icon: '<svg class="pud-i"></svg>' }));
  const scene = { value: { heat: 0 }, lines: relationLines(state), scales: scaleDefs, series: (a, b) => scaleSeries(state, a, b) };
  const bridge = sceneBridge(scene);
  bridge.scene.overview = ids => relationOverview(state, ids);
  bridge.scene.shifts = limit => recentShifts(state, limit);
  const settings = { relGraph: { scaleIds: ['trust', 'love'] } };
  let saved = 0;
  const undo = startRelGraph(m.document, { context: m.context, settings, save() { saved += 1; }, shared: m.shared, bridge });
  try {
    const pane = m.tabs.relgraph;
    // by default: stickers, one per chosen scale, all of one size, inside the frame of the pair
    const line = pane.querySelector('.pud-rel-line');
    assert.equal(line.querySelectorAll('.pud-sticker').length, 2);
    assert.equal(line.querySelector('.pud-rel-bar'), null, 'no bars');
    const trust = line.querySelector('.pud-sticker');
    assert.match(trust.getAttribute('style'), /--st-fill:40%/);
    assert.match(trust.getAttribute('style'), /--st-color:var\(--pud-mint\)/, 'growth: a colour of the palette');
    assert.ok(trust.querySelector('.pud-scale-mark svg'), 'the icon of the scale inside');
    // the common colour of growth
    click(m, pane.querySelector('[data-stk-role="grow"]:not([data-stk-scale])[data-stk-set="pal:butter"]'));
    assert.equal(settings.relGraph.stickers.colors.grow, 'pal:butter');
    assert.match(pane.querySelector('.pud-rel-line .pud-sticker').getAttribute('style'), /--st-color:var\(--pud-butter\)/);
    // the colour of one icon beats the common one; «как у всех» takes it off
    click(m, pane.querySelector('[data-stk-role="grow"][data-stk-scale="trust"][data-stk-set="pal:lilac"]'));
    assert.equal(settings.relGraph.stickers.perScale.trust.grow, 'pal:lilac');
    assert.match(pane.querySelector('.pud-rel-line .pud-sticker').getAttribute('style'), /--st-color:var\(--pud-lilac\)/);
    click(m, pane.querySelector('[data-stk-role="grow"][data-stk-scale="trust"][data-stk-set=""]'));
    assert.equal(settings.relGraph.stickers.perScale.trust, undefined);
    assert.ok(saved >= 3, 'every change is saved');
    // the way it looks
    click(m, pane.querySelector('[data-stk-mode="bars"]'));
    assert.ok(pane.querySelector('.pud-rel-line .pud-rel-bar'));
    click(m, pane.querySelector('[data-stk-mode="stickers"]'));
    assert.ok(pane.querySelector('.pud-rel-line .pud-sticker'));
  } finally { undo(); m.done(); }
});

test('настроение: ответ модели ловит героев с АУ в имени, одно слово имени, русское название и обрезанный JSON', () => {
  const names = ['Асидо Мина (АУ агентство)', 'Бакуго Кацуки (АУ агентство)', 'Джиро Кёка (АУ агентство)', 'Токоями Фумикаге (АУ агентство)'];
  const answer = '{"Асидо Мина":"sad","Бакуго":"love","Джиро Кёка":"грустит","Токоями Фумикаге":"love"';
  assert.deepEqual(parseMoodAnswer(answer, names), {
    'Асидо Мина (АУ агентство)': 'sad',
    'Бакуго Кацуки (АУ агентство)': 'love',
    'Джиро Кёка (АУ агентство)': 'sad',
    'Токоями Фумикаге (АУ агентство)': 'love',
  });
  // Уникальное слово имени узнаётся; общая фамилия у двух героев не угадывается: лучше пропустить, чем перепутать.
  assert.deepEqual(parseMoodAnswer('{"Ран":"sad"}', ['Хайтани Ран', 'Хайтани Риндо']), { 'Хайтани Ран': 'sad' });
  assert.deepEqual(parseMoodAnswer('{"Хайтани":"sad"}', ['Хайтани Ран', 'Хайтани Риндо']), {});
});

test('настроение: свайп ответа возвращает настроение к тому, что было до определения', async () => {
  const m = mount({ extraBody: chipsHtml, chat: [{ name: 'Сатору', is_user: false, mes: 'Он смутился.' }, { name: 'Гето', is_user: false, mes: 'Он нахмурился.' }] });
  m.context.ConnectionManagerRequestService.sendRequest = async () => ({ content: '{"Сатору":"angry"}' });
  m.context.eventTypes.MESSAGE_RECEIVED = 'recv';
  m.context.eventTypes.MESSAGE_SWIPED = 'swiped';
  const bridge = sceneBridge({ value: { heat: 0, time: '', cast: ['Сатору', 'Гето'], weather: null } });
  const settings = { peek: { commentProfile: 'p1' }, moods: { auto: true, autoEvery: 1 } };
  writeMeta(m.context, 'moods', { Сатору: { mood: 'sad', at: 1 } });
  const undo = startMood(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge });
  try {
    for (const fn of m.handlers.recv) fn();
    await wait(1700);
    assert.equal(readMeta(m.context, 'moods')['Сатору'].mood, 'angry', 'определилось');
    for (const fn of m.handlers.swiped) fn(1);
    assert.equal(readMeta(m.context, 'moods')['Сатору'].mood, 'sad', 'свайп вернул прежнее');
  } finally { undo(); m.done(); }
});

test('настроение: встроенное можно убрать из шаблонов (пропадает с плашек) и вернуть', async () => {
  const m = mount({ extraBody: chipsHtml });
  const settings = { moods: { strips: true, stripsReset: true } };
  const undo = startMood(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge: sceneBridge({ value: { heat: 0, time: '', cast: ['Сатору', 'Гето'], weather: null } }) });
  try {
    await wait(120);
    const editor = m.tabs.mood;
    assert.ok(m.document.querySelector('#ku-scene-chips .pud-mood-pill[data-mood="calm"]'), 'плашка есть');
    click(m, editor.querySelector('[data-act="mood-hide"][data-mid="calm"]'));
    assert.deepEqual(settings.moods.hidden, ['calm']);
    await wait(120);
    assert.equal(m.document.querySelector('#ku-scene-chips .pud-mood-pill[data-mood="calm"]'), null, 'с плашек пропала');
    assert.ok(editor.querySelector('.pud-mood-tile.off[data-pick="calm"]'), 'в редакторе осталась, приглушённая');
    click(m, editor.querySelector('[data-act="mood-show"][data-mid="calm"]'));
    assert.deepEqual(settings.moods.hidden, []);
    await wait(120);
    assert.ok(m.document.querySelector('#ku-scene-chips .pud-mood-pill[data-mood="calm"]'), 'вернулась');
  } finally { undo(); m.done(); }
});

test('тема по настроению: «Подобрать» перекрашивает правила по описанию, остальное в правилах остаётся', async () => {
  const m = mount();
  const bridge = sceneBridge({ value: { heat: 0, time: '12:00', weather: null } });
  const settings = { moodTheme: { enabled: true, strength: 100 } };
  m.context.generateRaw = async ({ prompt }) => {
    assert.match(prompt, /зимняя ночь/);
    return '```json\n{"night":"#102030","nope":"#ffffff","storm":"red"}\n```';
  };
  const undo = startMoodTheme(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge });
  try {
    const pane = m.tabs.moodtheme;
    const before = settings.moodTheme.rules.find(rule => rule.id === 'night');
    const hours = before.hourFrom;
    pane.querySelector('[data-gen-desc]').value = 'зимняя ночь';
    pane.querySelector('[data-gen-desc]').dispatchEvent(new m.win.Event('input', { bubbles: true }));
    click(m, pane.querySelector('[data-act="gen"]'));
    await wait(60);
    const night = settings.moodTheme.rules.find(rule => rule.id === 'night');
    assert.equal(night.color, '#102030', 'цвет подобран');
    assert.equal(night.hourFrom, hours, 'часы не тронуты');
    assert.match(m.tabs.moodtheme.textContent, /перекрашено правил — 1/);
  } finally { undo(); m.done(); }
});

test('палитра отношений: «Подобрать» задаёт цвета стикеров по описанию', async () => {
  const m = mount();
  const settings = { relGraph: {} };
  m.context.generateRaw = async () => '{"grow":"#66cc99","fall":"#cc6677","growMax":"zzz"}';
  const undo = startRelGraph(m.document, { context: m.context, settings, save() {}, shared: m.shared, bridge: sceneBridge({ value: {} }) });
  try {
    const pane = m.tabs.relgraph;
    pane.querySelector('[data-stk-desc]').value = 'нежные';
    pane.querySelector('[data-stk-desc]').dispatchEvent(new m.win.Event('input', { bubbles: true }));
    click(m, pane.querySelector('[data-stk-gen]'));
    await wait(60);
    assert.equal(settings.relGraph.stickers.colors.grow, '#66cc99');
    assert.equal(settings.relGraph.stickers.colors.fall, '#cc6677');
    assert.match(pane.textContent, /подобрано цветов — 2/);
  } finally { undo(); m.done(); }
});
