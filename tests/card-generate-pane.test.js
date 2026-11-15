import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const name of Object.getOwnPropertyNames(dom.window)) { if (/^[A-Z]/.test(name) && typeof dom.window[name] === 'function') { try { globalThis[name] = dom.window[name]; } catch {} } }

const { freshGeneration, renderGeneratePane, renderSectionBar, runGeneration } = await import('../src/ui/card-generate-pane.js');
const { makeSection } = await import('../src/core/index.js');

const draftOf = () => ({ sections: [
  makeSection({ kind: 'basic', title: 'Basic Info', text: '' }),
  makeSection({ kind: 'visual', title: 'Visual', text: 'старая внешность' }),
  makeSection({ kind: 'voice', title: 'Voice', text: '' }),
  makeSection({ kind: 'nsfw', title: 'NSFW module', text: '' }),
] });

function deps(draft, gen, extra = {}) {
  const calls = { generate: [], describe: [], status: [] };
  return {
    calls,
    deps: {
      gen, draft, card: { name: 'Рика', aliases: [], gender: '' }, entryId: 'c1', redraw: () => {},
      setStatus: (text, danger) => calls.status.push({ text, danger }),
      generate: async request => { calls.generate.push(request); return { results: request.sections.map(section => ({ id: section.id, title: section.title, text: `новый ${section.title}`, note: '', skip: '' })), failed: null }; },
      describe: async request => { calls.describe.push(request); return { looks: 'Рыжая, веснушки.', voice: '' }; },
      modelField: () => document.createElement('div'),
      where: { fandom: () => 'Токийские мстители', folderAu: () => ({ frame: '', world: 'современный город', changes: '', absent: '' }) },
      folders: () => [{ id: 'f1', text: 'Токийские мстители' }, { id: 'f2', text: 'Токийские мстители › АУ куб' }],
      setFolder: () => {}, newFolder: async () => {}, rebuild: () => {}, moved: false,
      hasPicture: true,
      ...extra,
    },
  };
}

test('по умолчанию отмечены пустые разделы без NSFW; персона по умолчанию оригинальная', () => {
  const draft = draftOf();
  const gen = freshGeneration(draft, { hasPicture: true });
  assert.deepEqual([...gen.picked].sort(), draft.sections.filter(section => ['basic', 'voice'].includes(section.kind)).map(section => section.id).sort());
  assert.equal(gen.mode, 'canon');
  assert.equal(freshGeneration(draft, { persona: true }).mode, 'original');
});

test('картинка пишет Visual, остальное пишется после и уже с ним; Visual отдельно не пишется', async () => {
  const draft = draftOf();
  const gen = freshGeneration(draft, { hasPicture: true });
  gen.picked.add(draft.sections[1].id);
  const { calls, deps: d } = deps(draft, gen);
  const jobs = draft.sections.filter(section => gen.picked.has(section.id)).map(section => ({ section, fresh: false }));
  await runGeneration(gen, { ...d, jobs, wishes: () => '', picture: { on: true, wishes: 'рост 150' } });
  assert.equal(calls.describe[0].wishes, 'рост 150');
  assert.equal(draft.sections[1].text, 'Рыжая, веснушки.');
  assert.deepEqual(calls.generate[0].sections.map(section => section.title), ['Basic Info', 'Voice']);
  assert.equal(calls.generate[0].others.find(item => item.title === 'Visual').text, 'Рыжая, веснушки.', 'следующие разделы видят внешность');
  assert.equal(gen.backup.get(draft.sections[1].id), 'старая внешность');
  assert.equal(gen.running, false);
});

test('«с нуля» не отдаёт модели прежний текст, «править» отдаёт', async () => {
  const draft = draftOf();
  const gen = freshGeneration(draft, {});
  const visual = draft.sections[1];
  const { calls, deps: d } = deps(draft, gen);
  await runGeneration(gen, { ...d, jobs: [{ section: visual, fresh: true }], wishes: () => 'ниже ростом', picture: { on: false } });
  assert.equal(calls.generate[0].sections[0].text, '');
  assert.equal(calls.generate[0].sections[0].wishes, 'ниже ростом');
  assert.equal(visual.text, 'новый Visual');
  gen.backup = null;
  visual.text = 'моя правка';
  await runGeneration(gen, { ...d, jobs: [{ section: visual, fresh: false }], wishes: () => '', picture: { on: false } });
  assert.equal(calls.generate[1].sections[0].text, 'моя правка');
});

test('ошибка картинки: разделы не пишутся, прежний текст не потерян, статус красный', async () => {
  const draft = draftOf();
  const gen = freshGeneration(draft, { hasPicture: true });
  const { calls, deps: d } = deps(draft, gen, { describe: async () => { throw new Error('модель не видит картинки'); } });
  await runGeneration(gen, { ...d, jobs: [{ section: draft.sections[0], fresh: false }], wishes: () => '', picture: { on: true, wishes: '' } });
  assert.equal(draft.sections[1].text, 'старая внешность');
  assert.equal(calls.generate.length, 0);
  assert.equal(calls.status.at(-1).danger, true);
  assert.equal(gen.running, false);
});

test('без имени герой не пишется', async () => {
  const draft = draftOf();
  const gen = freshGeneration(draft, {});
  const { calls, deps: d } = deps(draft, gen, { card: { name: ' ', aliases: [] } });
  await runGeneration(gen, { ...d, jobs: [{ section: draft.sections[0], fresh: true }], wishes: () => '', picture: { on: false } });
  assert.equal(calls.generate.length, 0);
  assert.equal(calls.status[0].danger, true);
});

test('страница и полоса раздела рисуются; у раздела с текстом две кнопки', () => {
  const draft = draftOf();
  const gen = freshGeneration(draft, { hasPicture: true });
  const { deps: d } = deps(draft, gen);
  const page = renderGeneratePane(d);
  assert.match(page.textContent, /Откуда герой/);
  assert.match(page.textContent, /Насколько держаться канона/);
  assert.match(page.textContent, /Описать внешность по картинке/);
  gen.mode = 'original';
  assert.doesNotMatch(renderGeneratePane(d).textContent, /Насколько держаться канона/);
  const filled = [...renderSectionBar({ ...d, section: draft.sections[1], openPage: () => {} }).querySelectorAll('button')].map(node => node.textContent);
  assert.ok(filled.includes('Написать с нуля') && filled.includes('Править по пожеланиям'));
  const empty = [...renderSectionBar({ ...d, section: draft.sections[0], openPage: () => {} }).querySelectorAll('button')].map(node => node.textContent);
  assert.deepEqual(empty, ['Написать']);
});

test('голос по картинке: только по галочке, пишется в Voice и отдельно не пишется', async () => {
  const draft = draftOf();
  const gen = freshGeneration(draft, { hasPicture: true });
  const { calls, deps: d } = deps(draft, gen, { describe: async request => { calls.describe.push(request); return { looks: 'Рыжая.', voice: 'Низкий, чуть хриплый.' }; } });
  const voice = draft.sections[2];
  await runGeneration(gen, { ...d, jobs: draft.sections.filter(section => gen.picked.has(section.id)).map(section => ({ section, fresh: false })), wishes: () => '', picture: { on: true, wishes: '', voice: true, voiceWishes: 'низкий' } });
  assert.equal(calls.describe[0].voice, true);
  assert.equal(calls.describe[0].voiceWishes, 'низкий');
  assert.equal(voice.text, 'Низкий, чуть хриплый.');
  assert.deepEqual(calls.generate[0].sections.map(section => section.title), ['Basic Info']);
  const without = freshGeneration(draft, { hasPicture: true });
  const second = deps(draft, without);
  await runGeneration(without, { ...second.deps, jobs: [], wishes: () => '', picture: { on: true, wishes: '' } });
  assert.equal(second.calls.describe[0].voice, false);
});

test('раздел ложится в черновик сразу, как только написан, а не после последнего', async () => {
  const draft = draftOf();
  const gen = freshGeneration(draft, {});
  const seen = [];
  const { deps: d } = deps(draft, gen, {
    redraw: () => seen.push(draft.sections.map(section => section.text)),
    generate: async request => {
      const results = request.sections.map(section => ({ id: section.id, title: section.title, text: `новый ${section.title}`, note: '', skip: '' }));
      for (const result of results) request.onSection(result);
      return { results, failed: null };
    },
  });
  const jobs = draft.sections.filter(section => ['basic', 'voice'].includes(section.kind)).map(section => ({ section, fresh: false }));
  await runGeneration(gen, { ...d, jobs, wishes: () => '', picture: { on: false } });
  assert.ok(seen.some(texts => texts[0] === 'новый Basic Info' && texts[2] === ''), 'первый раздел виден, пока второй ещё пишется');
  assert.equal(draft.sections[2].text, 'новый Voice');
  assert.equal(gen.picked.has(draft.sections[0].id), false);
});
