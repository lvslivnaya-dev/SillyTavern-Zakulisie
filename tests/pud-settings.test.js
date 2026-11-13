import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_VERSION, chipKey, defaultSettings, getSettings, migrateSettings } from '../src/pud/core/settings.js';

test('мусор вместо настроек даёт значения по умолчанию', () => {
  for (const raw of [undefined, null, 5, 'x', []]) assert.deepEqual(migrateSettings(raw), defaultSettings());
});

test('сохранённое не теряется, недостающее дополняется, чужие ключи остаются', () => {
  const raw = { enabled: false, chips: { 'A::B': [{ id: 'x', label: 'X' }] }, folders: { personas: [{ id: 'f1', name: 'ТР', parent: null }] }, custom: 1 };
  const out = migrateSettings(raw);
  assert.equal(out.enabled, false);
  assert.deepEqual(out.chips, raw.chips);
  assert.deepEqual(out.folders.personas, raw.folders.personas);
  assert.deepEqual(out.folders.lorebooks, []);
  assert.deepEqual(out.archive, { personas: [], characters: [] });
  assert.equal(out.custom, 1);
  assert.equal(out.version, SETTINGS_VERSION);
});

test('значение не того типа заменяется умолчанием', () => {
  const out = migrateSettings({ enabled: 'да', folders: { personas: 'не массив' }, chips: [] });
  assert.equal(out.enabled, true);
  assert.deepEqual(out.folders.personas, []);
  assert.deepEqual(out.chips, {});
});

test('умолчания не общие: правка одних настроек не портит другие', () => {
  const a = migrateSettings({});
  a.folders.personas.push({ id: 'x' });
  assert.deepEqual(migrateSettings({}).folders.personas, []);
});

test('getSettings кладёт мигрированные настройки в extensionSettings', () => {
  const context = { extensionSettings: {} };
  const settings = getSettings(context);
  assert.equal(context.extensionSettings.pudrenitsa, settings);
  assert.equal(getSettings(context).version, SETTINGS_VERSION);
});

test('ключ набора кнопок различает профили одного пресета', () => {
  assert.notEqual(chipKey('NoriMyn', 'Gemini'), chipKey('NoriMyn', 'Claude'));
  assert.equal(chipKey('NoriMyn', null), 'NoriMyn::');
});
