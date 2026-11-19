/** Memories, tensions and headcanons go by who is in the scene and who knows them, not by the size of the budget alone. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addHeadcanons, applyOperations, createDefaultState, createOperation, headcanonKey, relationshipId, selectHeadcanons, selectRuntimePrompt,
} from '../src/core/index.js';
import { mentionScorer } from '../src/integration/headcanon-retrieval.js';

function setup() {
  const state = applyOperations(createDefaultState(), ['a', 'b', 'c', 'd', 'p'].map((id, at) => createOperation('entity.upsert', { id, name: ['Анна', 'Леон', 'Ева', 'Ян', 'Персона'][at] })));
  state.ui.personaId = 'p';
  return state;
}

test('a memory of a group goes to the scene when ANY of those who know it is there, and names who knows it', () => {
  let state = setup();
  state = applyOperations(state, [createOperation('memory.add', { shared: true, item: { id: 'm1', text: 'Ходили всей толпой в кино', participantIds: ['a', 'b', 'c'] } }, { id: 'x1' })]);
  const out = ids => selectRuntimePrompt(state, { sceneIds: ids, includeMemories: true, includeTensions: true });
  assert.match(out(['a', 'b']), /shared-memories\[Анна,Леон,Ева\]=Ходили всей толпой в кино.*known only to: Анна,Леон,Ева/, 'two of the three are here: they remember it');
  assert.doesNotMatch(out(['d']), /кино/, 'none of those who know it is here');
  assert.doesNotMatch(out(['d', 'p']), /кино/, 'the persona is always in the scene and does not bring it on her own');
  assert.match(out(undefined), /кино/, 'no scene given: nothing is filtered');
});

test('a memory about nobody in particular is chat-wide and always goes', () => {
  let state = setup();
  state = applyOperations(state, [createOperation('memory.add', { shared: true, item: { id: 'm2', text: 'Прошлым летом был потоп', participantIds: [] } }, { id: 'x2' })]);
  assert.match(selectRuntimePrompt(state, { sceneIds: ['d'] }), /потоп/);
});

test('memories of a line (from > to) follow the one who feels them', () => {
  let state = setup();
  state = applyOperations(state, [
    createOperation('relationship.upsert', { from: 'a', to: 'b' }),
    createOperation('memory.add', { relationshipId: relationshipId('a', 'b'), item: { id: 'm3', text: 'Тихий вечер у реки' } }, { id: 'x3' }),
  ]);
  assert.match(selectRuntimePrompt(state, { sceneIds: ['a'] }), /Тихий вечер у реки/, 'Анна is here: she remembers');
  assert.doesNotMatch(selectRuntimePrompt(state, { sceneIds: ['d'] }), /Тихий вечер у реки/, 'neither of the two is here');
});

test('a headcanon says who knows it: the group, plus those the fact names; the others are not listed', () => {
  const state = setup();
  const key = headcanonKey('a', 'b');
  const { headcanons } = addHeadcanons(state, key, [{ text: 'Делят один зонт', knownBy: ['a', 'b', 'c'] }, { text: 'Он всегда провожает её', knownBy: ['a', 'b'] }]);
  const [first, second] = headcanons[key].items;
  assert.deepEqual(first.knownBy, ['a', 'b', 'c'], 'Ева was there too');
  assert.equal(second.knownBy, undefined, 'only the group knows it: nothing to store');
  const withIt = { ...state, ui: { ...state.ui, headcanons } };
  const lines = selectHeadcanons(withIt, { score: mentionScorer(withIt, 'Ева вошла.') });
  assert.deepEqual(lines, ['headcanon[Анна & Леон + known to Ева]: Делят один зонт'], 'Ева is here and knows it, the other fact is only for the pair');
});

test('meaning ranks what already fits the scene: a record near the last posts beats a stronger one far from them', async () => {
  const { relativeScores } = await import('../src/core/semantic.js');
  let state = setup();
  state = applyOperations(state, [
    createOperation('memory.add', { shared: true, item: { id: 'f1', text: 'Дождь на мосту', intensity: 3, participantIds: ['a'] } }, { id: 'y1' }),
    createOperation('memory.add', { shared: true, item: { id: 'f2', text: 'Ссора из-за денег', intensity: 5, participantIds: ['a'] } }, { id: 'y2' }),
  ]);
  const near = item => (item.text.startsWith('Дождь') ? 0.84 : 0.80);
  const tight = { sceneIds: ['a'], maxCharacters: 90 };
  assert.doesNotMatch(selectRuntimePrompt(state, tight), /Дождь/, 'without meaning the stronger one wins the short budget');
  assert.match(selectRuntimePrompt(state, { ...tight, similarity: near }), /Дождь/, 'with meaning the one that answers the scene stays');
  assert.equal(relativeScores([{ v: 1 }, { v: 3 }], item => item.v)({ v: 3 }), 1);
  assert.equal(relativeScores([{ v: 1 }], item => item.v)({ v: 1 }), 0.5, 'a lone value says nothing');
});

test('the chronicle over its budget keeps the newest and the pinned, then the summaries closest to the scene, in story order', async () => {
  const { buildChroniclePrompt, normalizeChronicle } = await import('../src/core/index.js');
  const summaries = ['Давний пожар в доме', 'Поездка на море', 'Спор о наследстве', 'Тихий вечер дома', 'Гости на пороге'].map((text, seq) => ({ id: `s${seq}`, level: 0, seq, text: `${text}. ${'и так далее '.repeat(12)}`, createdAt: '2026-01-01T00:00:00Z' }));
  const chronicle = normalizeChronicle({ version: 1, seq: 5, summaries });
  const near = item => (item.text.startsWith('Поездка') ? 0.9 : 0.8);
  const plain = buildChroniclePrompt(chronicle, { maxCharacters: 800 });
  const smart = buildChroniclePrompt(chronicle, { maxCharacters: 800, similarity: near });
  assert.doesNotMatch(plain, /Поездка/, 'by default the oldest are dropped');
  assert.match(smart, /Поездка на море/, 'with meaning the one near the scene is kept');
  assert.match(smart, /Гости на пороге/, 'the newest stays');
  assert.ok(smart.indexOf('Поездка') < smart.indexOf('Гости'), 'story order');
});

test('the semantic limit: only that many unpinned records stay, the closest to the scene, pinned ones always', async () => {
  const { buildBondsPrompt } = await import('../src/core/index.js');
  let state = setup();
  const texts = ['Дождь на мосту', 'Ссора из-за денег', 'Завтрак вдвоём', 'Новый год у реки'];
  state = applyOperations(state, texts.map((text, at) => createOperation('memory.add', { shared: true, item: { id: `l${at}`, text, intensity: 3, participantIds: ['a'], ...(at === 3 ? { pinned: true } : {}) } }, { id: `z${at}` })));
  const near = item => ({ 'Дождь на мосту': 0.9, 'Ссора из-за денег': 0.7, 'Завтрак вдвоём': 0.85 })[item.text] ?? 0.6;
  const out = selectRuntimePrompt(state, { sceneIds: ['a'], similarity: near, semanticLimit: 1 });
  assert.match(out, /Дождь на мосту/, 'the closest stays');
  assert.doesNotMatch(out, /Ссора из-за денег|Завтрак вдвоём/, 'the others fit the budget, but only the closest ones are chosen');
  assert.match(out, /Новый год у реки/, 'pinned always goes');
  assert.match(selectRuntimePrompt(state, { sceneIds: ['a'], similarity: near, semanticLimit: 0 }), /Ссора из-за денег/, '0: no cut');
  const lib = { bonds: texts.map((text, at) => ({ id: `b${at}`, type: 'memory', text, cardIds: ['c1'] })) };
  const names = new Map([['c1', 'Анна']]);
  const bonds = buildBondsPrompt(lib.bonds, { presentCardIds: ['c1'], cardNames: names, similarity: near, semanticLimit: 2 });
  assert.match(bonds, /Дождь на мосту/);
  assert.match(bonds, /Завтрак вдвоём/);
  assert.doesNotMatch(bonds, /Ссора из-за денег/);
});

test('the chronicle: only the closest older summaries are sent even when the budget would hold all', async () => {
  const { buildChroniclePrompt, normalizeChronicle } = await import('../src/core/index.js');
  const names = ['Давний пожар', 'Поездка на море', 'Спор о наследстве', 'Тихий вечер', 'Гости на пороге', 'Ночной звонок'];
  const chronicle = normalizeChronicle({ version: 1, seq: 6, summaries: names.map((text, seq) => ({ id: `s${seq}`, level: 0, seq, text, createdAt: '2026-01-01T00:00:00Z' })) });
  const near = item => (item.text === 'Поездка на море' ? 0.9 : item.text === 'Давний пожар' ? 0.85 : 0.7);
  const all = buildChroniclePrompt(chronicle, { maxCharacters: 6000 });
  assert.match(all, /Давний пожар/);
  const cut = buildChroniclePrompt(chronicle, { maxCharacters: 6000, similarity: near, semanticLimit: 1 });
  assert.match(cut, /Поездка на море/);
  assert.doesNotMatch(cut, /Давний пожар|Спор о наследстве|Тихий вечер/);
  assert.match(cut, /Гости на пороге/);
  assert.match(cut, /Ночной звонок/);
  assert.ok(cut.indexOf('Поездка') < cut.indexOf('Гости'));
});
