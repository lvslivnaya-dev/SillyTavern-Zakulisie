import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { PALETTES, paletteVars } from '../src/pud/core/palettes.js';
import { migrateSettings } from '../src/pud/core/settings.js';
import { DARK_CLASS, startPalette } from '../src/pud/ui/palette.js';

const CSS = readFileSync(new URL('../style/pud.css', import.meta.url), 'utf8');

test('палитры: пять штук, каждая задаёт все токены, которыми пользуется style.css', () => {
  assert.deepEqual(PALETTES.map(p => p.id), ['pink', 'graphite', 'noir', 'latte', 'matcha']);
  assert.deepEqual(paletteVars('pink'), {}, 'розовая уже в style.css');
  const used = new Set([...CSS.matchAll(/var\((--pud-[\w-]+)/g)].map(match => match[1]));
  for (const local of ['--pud-toast', '--pud-depth', '--pud-f-mono']) used.delete(local);
  const defined = new Set([...CSS.matchAll(/^\s*(--pud-[\w-]+):/gm)].map(match => match[1]));
  for (const name of used) assert.ok(defined.has(name), `токен ${name} используется, но не задан в style.css`);
  // цветовые токены: значение — цвет, тройка чисел или картинка
  const colorTokens = [...CSS.matchAll(/^\s*(--pud-[\w-]+):\s*(#|rgba?\(|\d+ \d+ \d+;|url\()/gm)].map(match => match[1]);
  for (const p of PALETTES.slice(1)) {
    const vars = paletteVars(p.id);
    for (const name of colorTokens) assert.ok(name in vars, `${p.id}: нет ${name}`);
    assert.match(vars['--pud-card-rgb'], /^\d+ \d+ \d+$/);
    assert.match(vars['--pud-paw'], /^url\("data:image\/svg\+xml,/);
  }
});

test('в стилях не осталось литеральных цветов вне определения токенов', () => {
  const body = CSS.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(line => !/^\s*--pud-[\w-]+:\s*(#[0-9a-fA-F]+|rgba?\([^)]*\)|[\d ]+)\s*;\s*$/.test(line) && !line.includes('url("data:'));
  const left = body.filter(line => /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(line) && !/#000\b/.test(line));
  assert.deepEqual(left, []);
});

test('выбор палитры ставит переменные на body, запоминается, откат возвращает розовую', () => {
  const { document } = new JSDOM('<!doctype html><body></body>').window;
  const settings = migrateSettings({});
  const tabs = {};
  const shared = { hub: { addTab: (id) => { const pane = document.createElement('div'); document.body.append(pane); tabs[id] = pane; return { pane, remove: () => pane.remove() }; } } };
  let saved = 0;
  const undo = startPalette(document, { settings, save: () => { saved++; }, shared });
  assert.equal(document.body.style.getPropertyValue('--pud-bg'), '');
  tabs.palette.querySelector('[data-palette="noir"]').click();
  assert.equal(settings.palette, 'noir');
  assert.equal(saved, 1);
  assert.equal(document.body.style.getPropertyValue('--pud-bg'), '#111113');
  assert.ok(document.body.classList.contains(DARK_CLASS));
  assert.equal(tabs.palette.querySelector('.pud-pal.on').dataset.palette, 'noir');
  tabs.palette.querySelector('[data-palette="latte"]').click();
  assert.equal(document.body.classList.contains(DARK_CLASS), false);
  undo();
  assert.equal(document.body.style.getPropertyValue('--pud-bg'), '');
  assert.equal(document.body.style.getPropertyValue('--pud-paw'), '');
});

test('коды цветов: короткие, без решётки и мусор', async () => {
  const { normalizeHex } = await import('../src/pud/core/palettes.js');
  assert.equal(normalizeHex('#F8C'), '#ff88cc');
  assert.equal(normalizeHex(' e8899F '), '#e8899f');
  assert.equal(normalizeHex('#12345'), null);
  assert.equal(normalizeHex('red;background:url(x)'), null);
});

test('сохранённые свои палитры чистятся: битый цвет берётся из основы, чужие id выкидываются', async () => {
  const { COLOR_KEYS, sanitizeCustomPalettes, paletteById } = await import('../src/pud/core/palettes.js');
  const out = sanitizeCustomPalettes([
    { id: 'my-a', title: 'Моя', base: 'noir', dark: true, bg: '#123', narr: 'нет", onclick="x' },
    { id: 'pink', title: 'чужая' },
    { id: 'my-a', title: 'дубль' },
    null,
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].bg, '#112233');
  assert.equal(out[0].narr, paletteById('noir').narr);
  for (const key of COLOR_KEYS) assert.match(out[0][key], /^#[0-9a-f]{6}$/);
  // редактор покрывает все цвета встроенных палитр, кроме полупрозрачного rim
  const builtIn = Object.keys(paletteById('pink')).filter(key => !['id', 'title', 'hint', 'dark', 'rim'].includes(key));
  assert.deepEqual([...COLOR_KEYS].sort(), builtIn.sort());
});

test('своя палитра: копия текущей, цвет кодом и пипеткой, тёмная, удаление в два нажатия', () => {
  const { document } = new JSDOM('<!doctype html><body></body>').window;
  const settings = migrateSettings({});
  assert.deepEqual(settings.customPalettes, []);
  let pane;
  const shared = { hub: { addTab: () => { pane = document.createElement('div'); document.body.append(pane); return { pane, remove: () => pane.remove() }; } } };
  let saved = 0;
  const undo = startPalette(document, { settings, save: () => { saved++; }, shared });
  pane.querySelector('[data-palette="latte"]').click();
  pane.querySelector('[data-pal-new]').click();
  assert.equal(settings.customPalettes.length, 1);
  const mine = settings.customPalettes[0];
  assert.equal(settings.palette, mine.id);
  assert.equal(mine.base, 'latte');
  assert.equal(document.body.style.getPropertyValue('--pud-bg'), '#f3ebe1');

  const text = pane.querySelector('[data-color="bg"] [data-color-text]');
  text.value = '#abc';
  text.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  assert.equal(mine.bg, '#aabbcc');
  assert.equal(document.body.style.getPropertyValue('--pud-bg'), '#aabbcc');
  assert.equal(pane.querySelector('[data-color="bg"] [data-color-pick]').value, '#aabbcc');

  text.value = 'zzz';
  text.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  assert.ok(pane.querySelector('[data-color="bg"]').classList.contains('bad'));
  assert.equal(mine.bg, '#aabbcc', 'мусор не применяется');
  text.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.equal(text.value, '#aabbcc', 'при уходе с поля код возвращается');

  const pick = pane.querySelector('[data-color="narr"] [data-color-pick]');
  pick.value = '#ff0000';
  pick.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  assert.equal(document.body.style.getPropertyValue('--pud-narr'), '#ff0000');

  const dark = pane.querySelector('[data-pal-dark]');
  dark.checked = true;
  dark.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.ok(document.body.classList.contains(DARK_CLASS));
  assert.ok(saved >= 3);

  pane.querySelector('[data-pal-del]').click();
  assert.equal(settings.customPalettes.length, 1, 'первое нажатие только спрашивает');
  pane.querySelector('[data-pal-del]').click();
  assert.equal(settings.customPalettes.length, 0);
  assert.equal(settings.palette, 'latte');
  undo();
  assert.equal(document.body.style.getPropertyValue('--pud-bg'), '');
});

test('своя палитра переживает перезапуск', () => {
  const { document } = new JSDOM('<!doctype html><body></body>').window;
  const settings = migrateSettings({ palette: 'my-x', customPalettes: [{ id: 'my-x', title: 'X', base: 'pink', bg: '#010203' }] });
  const undo = startPalette(document, { settings, save: () => {} });
  assert.equal(document.body.style.getPropertyValue('--pud-bg'), '#010203');
  undo();
});

test('палитра по описанию: запрос, разбор ответа, подтяжка контраста, новая своя палитра', async () => {
  const { buildPalettePrompt, parsePaletteReply, contrast } = await import('../src/pud/core/palette-ai.js');
  const { paletteById: byId, COLOR_KEYS } = await import('../src/pud/core/palettes.js');
  const asked = buildPalettePrompt('молочно-розовая', byId('pink'));
  assert.match(asked.prompt, /молочно-розовая/);
  for (const key of COLOR_KEYS) assert.ok(asked.systemPrompt.includes(`- ${key}:`), key);
  assert.throws(() => parsePaletteReply('не знаю'));

  const { document } = new JSDOM('<!doctype html><body></body>').window;
  const settings = migrateSettings({});
  let pane;
  const shared = { hub: { addTab: () => { pane = document.createElement('div'); document.body.append(pane); return { pane, remove: () => pane.remove() }; } } };
  let request;
  const reply = '```json\n{"title":"Молочный","dark":false,"bg":"#fff6f2","card":"#fffdfb","narr":"#fff0f0","speech":"#7a9a50","think":"#7a4a90"}\n```';
  const undo = startPalette(document, { settings, save: () => {}, shared, generate: async opts => { request = opts; return reply; } });
  const input = pane.querySelector('[data-pal-desc]');
  input.value = 'молочно-розовая';
  input.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  pane.querySelector('[data-pal-gen]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(request.prompt, /молочно-розовая/);
  const made = settings.customPalettes.at(-1);
  assert.equal(made.title, 'Молочный');
  assert.equal(settings.palette, made.id);
  assert.equal(made.bg, '#fff6f2');
  assert.notEqual(made.narr, '#fff0f0', 'светлый текст на светлом фоне подтянут');
  assert.ok(contrast(made.narr, made.card) >= 3.5);
  assert.equal(made.lilac, byId('pink').lilac, 'недостающий цвет взят из прошлой палитры');
  assert.equal(document.body.style.getPropertyValue('--pud-bg'), '#fff6f2');
  assert.match(pane.querySelector('.pud-palai-note').textContent, /Готово/);
  undo();
});

test('палитра по описанию: ошибка модели не ломает вкладку', async () => {
  const { document } = new JSDOM('<!doctype html><body></body>').window;
  const settings = migrateSettings({});
  let pane;
  const shared = { hub: { addTab: () => { pane = document.createElement('div'); document.body.append(pane); return { pane, remove: () => pane.remove() }; } } };
  const original = console.error; console.error = () => {};
  try {
    const undo = startPalette(document, { settings, save: () => {}, shared, generate: async () => { throw new Error('нет соединения'); } });
    const input = pane.querySelector('[data-pal-desc]');
    input.value = 'мятная';
    input.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    pane.querySelector('[data-pal-gen]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(settings.customPalettes.length, 0);
    assert.match(pane.querySelector('.pud-palai-note').textContent, /нет соединения/);
    assert.equal(pane.querySelector('[data-pal-gen]').disabled, false);
    undo();
  } finally { console.error = original; }
});

test('лапки на фоне и в чате выключаются галочками и запоминаются', async () => {
  const { NO_PAW_CLASSES } = await import('../src/pud/ui/palette.js');
  const { document } = new JSDOM('<!doctype html><body></body>').window;
  const settings = migrateSettings({});
  assert.deepEqual(settings.paws, { background: true, chat: true });
  let pane;
  const shared = { hub: { addTab: () => { pane = document.createElement('div'); document.body.append(pane); return { pane, remove: () => pane.remove() }; } } };
  let saved = 0;
  const undo = startPalette(document, { settings, save: () => { saved++; }, shared });
  const box = pane.querySelector('[data-paws="background"]');
  assert.equal(box.checked, true);
  box.checked = false;
  box.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.equal(settings.paws.background, false);
  assert.equal(settings.paws.chat, true);
  assert.ok(document.body.classList.contains(NO_PAW_CLASSES.background));
  assert.equal(document.body.classList.contains(NO_PAW_CLASSES.chat), false);
  assert.equal(saved, 1);
  undo();
  assert.equal(document.body.classList.contains(NO_PAW_CLASSES.background), false);

  const again = startPalette(document, { settings: migrateSettings({ paws: { chat: false } }), save: () => {} });
  assert.ok(document.body.classList.contains(NO_PAW_CLASSES.chat));
  assert.equal(document.body.classList.contains(NO_PAW_CLASSES.background), false);
  again();
});
