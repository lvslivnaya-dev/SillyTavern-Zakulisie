import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCleanerBackup, formatBytes, hasFolderFor, parseCleanerBackup, removeSettings, restoreSettings, scanSettings } from '../src/core/index.js';

const settings = () => ({ kulisy: { a: 1 }, regex: [1, 2], disabledExtensions: [], 'reproductive-system': { big: 'x'.repeat(500) }, spendingTracker: { y: 1 }, clothes_v2: { z: 'z'.repeat(2000) } });

test('сводка: защищённые разделы не предлагаются, остальное по размеру, папка угадывается по имени', () => {
  const { items, total } = scanSettings(settings(), ['third-party/SpendingTracker', 'third-party/Phone-ST']);
  assert.deepEqual(items.map(item => item.key), ['clothes_v2', 'reproductive-system', 'spendingTracker']);
  assert.equal(items.find(item => item.key === 'spendingTracker').hasFolder, true);
  assert.equal(items.find(item => item.key === 'clothes_v2').hasFolder, false);
  assert.ok(total > 2500);
  assert.equal(hasFolderFor('st-advanced-reproductive-system', ['third-party/SillyTavern-Advanced-Reproductive-System']), true);
  assert.equal(hasFolderFor('x', ['x']), true);
});

test('удаление: только выбранное, защищённое и чужое не трогается; копия возвращает назад без затирания', () => {
  const root = settings();
  const backup = buildCleanerBackup(root, ['clothes_v2', 'kulisy', 'нет такого']);
  assert.deepEqual(Object.keys(backup.removed), ['clothes_v2']);
  const result = removeSettings(root, ['clothes_v2', 'kulisy', 'regex']);
  assert.deepEqual(result.removed, ['clothes_v2']);
  assert.ok(result.bytes > 2000);
  assert.ok(root.kulisy && root.regex);
  assert.throws(() => buildCleanerBackup(root, ['kulisy']), /Ничего не выбрано/);
  root.spendingTracker = { new: true };
  const back = restoreSettings(root, parseCleanerBackup(JSON.stringify({ ...backup, removed: { ...backup.removed, spendingTracker: { old: 1 }, kulisy: { evil: 1 } } })));
  assert.deepEqual(back.restored, ['clothes_v2']);
  assert.deepEqual(back.skipped, ['spendingTracker']);
  assert.deepEqual(root.kulisy, { a: 1 });
  assert.throws(() => parseCleanerBackup('не json'), /не JSON/);
  assert.throws(() => parseCleanerBackup('{"kind":"x"}'), /не файл чистилки/);
});

test('размер для человека', () => {
  assert.equal(formatBytes(5639396), '5,4 МБ');
  assert.equal(formatBytes(2048), '2 КБ');
  assert.equal(formatBytes(12), '12 Б');
});
