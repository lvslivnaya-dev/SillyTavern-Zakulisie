import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBackup, buildBackup, parseBackup, summarizeBackup, BACKUP_KIND } from '../src/integration/backup.js';

const sample = () => ({
  kulisy: { enabled: true, aux: { mode: 'custom', key: 'SECRET-A', url: 'x' }, embeddings: { key: 'SECRET-B' }, wardrobeVision: { key: 'SECRET-C' }, locationLibrary: { characters: [{ id: 'c1' }, { id: 'c2' }], locations: [{ id: 'p1' }], items: [] } },
  pudrenitsa: { palette: 'noir' },
  other: { untouched: true },
});

test('копия не содержит ключей доступа и чужих расширений', () => {
  const backup = buildBackup(sample());
  const text = JSON.stringify(backup);
  assert.equal(backup.kind, BACKUP_KIND);
  assert.ok(!text.includes('SECRET'));
  assert.ok(!('other' in backup.settings));
  assert.equal(backup.settings.kulisy.aux.url, 'x');
});

test('без данных Кулис копировать нечего', () => {
  assert.throws(() => buildBackup({ other: {} }), /копировать нечего/);
});

test('сводка считает карточки, локации и вещи', () => {
  const info = summarizeBackup(buildBackup(sample()));
  assert.deepEqual([info.cards, info.places, info.items, info.hasPudrenitsa], [2, 1, 0, true]);
});

test('чужой файл и битый JSON отклоняются понятной ошибкой', () => {
  assert.throws(() => parseBackup('не json'), /не JSON/);
  assert.throws(() => parseBackup('{"kind":"other"}'), /не файл копии/);
  assert.throws(() => parseBackup(JSON.stringify({ kind: BACKUP_KIND, version: 99, settings: {} })), /более новой/);
  assert.throws(() => parseBackup(JSON.stringify({ kind: BACKUP_KIND, version: 1, settings: {} })), /нет данных/);
});

test('загрузка заменяет данные на месте, а свои ключи доступа остаются', () => {
  const backup = parseBackup(JSON.stringify(buildBackup(sample())));
  const here = { kulisy: { aux: { key: 'MY-KEY', mode: 'off' }, junk: 1 }, pudrenitsa: { palette: 'pink' }, other: { untouched: true } };
  const kulisyRef = here.kulisy;
  const replaced = applyBackup(here, backup);
  assert.deepEqual(replaced, ['kulisy', 'pudrenitsa']);
  assert.equal(here.kulisy, kulisyRef, 'тот же объект: модули, что на него смотрят, видят новое');
  assert.equal(here.kulisy.aux.key, 'MY-KEY');
  assert.equal(here.kulisy.aux.mode, 'custom');
  assert.ok(!('junk' in here.kulisy));
  assert.equal(here.pudrenitsa.palette, 'noir');
  assert.deepEqual(here.other, { untouched: true });
});

test('на чистой таверне разделы создаются', () => {
  const here = {};
  applyBackup(here, parseBackup(JSON.stringify(buildBackup(sample()))));
  assert.equal(here.kulisy.locationLibrary.characters.length, 2);
});
