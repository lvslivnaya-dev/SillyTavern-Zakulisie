import test from 'node:test';
import assert from 'node:assert/strict';
import { PART_IDS, addPreset, capture, changeParts, cleanPart, describe, normalizePresets, removePreset, renamePreset } from '../src/pud/core/visual-presets.js';
import { defaultSettings, migrateSettings } from '../src/pud/core/settings.js';
import { makeCustomPalette, paletteById } from '../src/pud/core/palettes.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const custom = (() => { const copy = makeCustomPalette(paletteById('noir'), []); copy.title = 'Моя ночь'; copy.accent = '#336699'; return copy; })();
const now = () => ({
  background: 'night.jpg',
  palette: { id: custom.id, custom, paws: { background: false, chat: true } },
  icons: { pud: { heart: PNG }, studio: {} },
  mood: { enabled: true, strength: 60 },
});

test('пресет — любые из четырёх частей; пустое и сломанное в него не попадает', () => {
  assert.deepEqual(PART_IDS, ['background', 'palette', 'icons', 'mood']);
  const only = capture({ background: '', palette: { id: 'matcha' }, icons: { pud: {}, studio: {} }, mood: null });
  assert.deepEqual(Object.keys(only), ['palette'], 'без фона, без иконок и без темы — их в пресете нет');
  assert.equal(cleanPart('palette', { id: 'нет-такой' }), null);
  assert.equal(cleanPart('background', { name: '  ' }), null);
  assert.equal(cleanPart('icons', { pud: { 'плохое имя!': PNG, ok: 'http://x' } }), null);
});

test('сохранить текущий вид: выбранные части, имя, свой цвет палитры кладётся целиком', () => {
  const list = addPreset([], '  Вечер  ', now(), ['palette', 'background']);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Вечер');
  assert.deepEqual(Object.keys(list[0].parts), ['background', 'palette']);
  assert.equal(list[0].parts.palette.custom.accent, '#336699');
  assert.equal(list[0].parts.palette.paws.background, false);
  const all = addPreset(list, '', now());
  assert.equal(all[1].name, 'Пресет 2');
  assert.deepEqual(Object.keys(all[1].parts), PART_IDS);
  assert.throws(() => addPreset([], 'пусто', { background: '', palette: null, icons: null, mood: null }), /Нечего сохранять/);
  assert.throws(() => addPreset([], 'x', now(), []), /Нечего сохранять/);
});

test('части пресета можно добавлять и убирать; последнюю убрать нельзя; переименовать и удалить можно', () => {
  let list = addPreset([], 'А', now(), ['background']);
  const id = list[0].id;
  list = changeParts(list, id, now(), { add: ['icons', 'mood'] });
  assert.deepEqual(Object.keys(list[0].parts), ['background', 'icons', 'mood']);
  list = changeParts(list, id, now(), { drop: ['icons'] });
  assert.deepEqual(Object.keys(list[0].parts), ['background', 'mood']);
  list = changeParts(list, id, now(), { drop: ['background', 'mood'] });
  assert.deepEqual(Object.keys(list[0].parts), ['background', 'mood'], 'пресет без частей не бывает');
  list = changeParts(list, id, { ...now(), background: 'day.png' }, { add: ['background'] });
  assert.equal(list[0].parts.background.name, 'day.png', 'обновить из текущего');
  assert.equal(renamePreset(list, id, ' Б ')[0].name, 'Б');
  assert.equal(renamePreset(list, id, '   ')[0].name, 'А', 'пустое имя не принимается');
  assert.deepEqual(removePreset(list, id), []);
});

test('описание пресета и сохранение в настройках: список переживает перезапуск, лишнее чистится', () => {
  const list = addPreset([], 'Ночь', now());
  const words = describe(list[0]);
  assert.deepEqual(words.map(item => item.label), ['Фон', 'Палитра', 'Иконки', 'Тема по настроению']);
  assert.equal(words[1].note, 'Моя ночь');
  assert.equal(words[2].note, '1 шт.');
  assert.equal(words[3].note, 'включена');
  assert.deepEqual(defaultSettings().visualPresets, []);
  const migrated = migrateSettings(JSON.parse(JSON.stringify({ visualPresets: list })));
  assert.equal(normalizePresets(migrated.visualPresets).length, 1);
  assert.deepEqual(normalizePresets([{ id: 'a', name: 'x', parts: {} }, { id: '', parts: { background: { name: 'a' } } }, null, 'text']), []);
  assert.equal(normalizePresets(Array.from({ length: 40 }, (_, index) => ({ id: `p${index}`, name: 'n', parts: { background: { name: 'a.jpg' } } }))).length, 30);
});
