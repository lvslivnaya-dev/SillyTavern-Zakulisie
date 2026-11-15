import test from 'node:test';
import assert from 'node:assert/strict';
import { addFolder, auIsEmpty, auPrompt, auSummary, emptyLibrary, exportLibrary, folderAu, importLibrary, normalizeAu, normalizeLibrary, parseAuAnswer, sameAu, updateFolder } from '../src/core/index.js';
import { auParsePrompt } from '../src/core/au-notes.js';

function tree() {
  const first = addFolder(emptyLibrary(), { name: 'Токийские мстители' });
  const inner = addFolder(first.library, { name: 'АУ куб', parentId: first.folder.id });
  return { library: inner.library, root: first.folder, inner: inner.folder };
}

test('АУ хранится на папке, чистится и переживает нормализацию и экспорт', () => {
  const { library, root } = tree();
  const next = updateFolder(library, root.id, { au: { world: '  современный  город ', junk: 'x' } });
  assert.deepEqual(next.folders.find(folder => folder.id === root.id).au, normalizeAu({ world: 'современный город' }));
  assert.equal(normalizeLibrary(next).folders.find(folder => folder.id === root.id).au.world, 'современный город');
  const cleared = updateFolder(next, root.id, { au: {} });
  assert.equal('au' in cleared.folders.find(folder => folder.id === root.id), false, 'пустое АУ не хранится');
  const imported = importLibrary(emptyLibrary(), JSON.parse(JSON.stringify(exportLibrary(next))), '').library;
  assert.equal(imported.folders.find(folder => folder.name === 'Токийские мстители').au?.world, 'современный город');
});

test('подпапка добавляет своё к АУ внешней, момент заменяет', () => {
  const { root, inner, library: start } = tree();
  let library = start;
  library = updateFolder(library, root.id, { au: { frame: 'канон', world: 'город', absent: 'нет Вальхаллы' } });
  library = updateFolder(library, inner.id, { au: { frame: 'до Поднебесья', world: 'без магии', changes: 'старше на пять лет' } });
  const au = folderAu(library, inner.id);
  assert.equal(au.frame, 'до Поднебесья');
  assert.equal(au.world, 'город\nбез магии');
  assert.equal(au.absent, 'нет Вальхаллы');
  assert.equal(folderAu(library, root.id).changes, '');
  assert.ok(auIsEmpty(folderAu(emptyLibrary(), 'nope')));
});

test('одинаковое АУ не требует перестройки, разное требует', () => {
  assert.ok(sameAu(normalizeAu({ world: 'Город  ' }), normalizeAu({ world: 'город' })));
  assert.ok(!sameAu(normalizeAu({ world: 'город' }), normalizeAu({})));
});

test('АУ для запроса и для кнопки', () => {
  const au = normalizeAu({ world: 'город', absent: 'нет Вальхаллы' });
  assert.match(auPrompt(au), /different about the world[^\n]*город/);
  assert.match(auPrompt(au), /NOT in this AU[^\n]*Вальхаллы/);
  assert.equal(auPrompt(normalizeAu({})), '');
  assert.match(auSummary(au), /что иначе в мире: город/);
});

test('разбор свободного текста: поля и отдельные герои; мусор отвергается', () => {
  const answer = parseAuAnswer('<think>x</think>```json\n{"frame":"до Поднебесья","world":"город","changes":"","absent":"нет банд","extra":["Майки: не знает Дракена",""]}\n```');
  assert.equal(answer.au.frame, 'до Поднебесья');
  assert.deepEqual(answer.extra, ['Майки: не знает Дракена']);
  assert.throws(() => parseAuAnswer('нет json'), /разбор/);
  assert.throws(() => parseAuAnswer('{ сломано }'), /не прочитался/);
  const [system, user] = auParsePrompt('все учатся вместе', 'АУ куб');
  assert.match(system.content, /"absent"/);
  assert.match(user.content, /все учатся вместе/);
});
