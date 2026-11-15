import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGenerationPrompt, cleanGenerated, generateCardSections, guideFor } from '../src/integration/card-generate.js';

const card = { name: 'Манджиро Сано', aliases: ['Майки'], gender: 'male' };

test('канонный персонаж: фандом, момент и АУ попадают в запрос, пожелания тоже', () => {
  const [system, user] = buildGenerationPrompt({
    card, section: { kind: 'voice', title: 'Voice', text: '' },
    origin: { mode: 'canon', fandom: 'Токийские мстители', frame: 'до арки Поднебесья', au: 'мягче' }, wishes: 'говорит коротко',
  });
  assert.equal(system.role, 'system');
  assert.match(system.content, /RUSSIAN/);
  assert.match(user.content, /CANON character from: Токийские мстители/);
  assert.match(user.content, /MOMENT OF CANON: до арки Поднебесья/);
  assert.match(user.content, /Changes to the canon for THIS card \(AU\): мягче/);
  assert.match(user.content, /говорит коротко/);
  assert.match(user.content, /Task: write this section from scratch/);
  assert.match(user.content, /Gender: male/);
});

test('оригинальный персонаж: канона нет, ни фандома, ни момента', () => {
  const [, user] = buildGenerationPrompt({ card, section: { kind: 'visual', title: 'Visual', text: '' }, origin: { mode: 'original', fandom: 'Ван Пис', frame: 'x' } });
  assert.match(user.content, /ORIGINAL character/);
  assert.doesNotMatch(user.content, /Ван Пис|MOMENT OF CANON/);
});

test('раздел с текстом правится, а не пишется заново; соседние разделы идут контекстом', () => {
  const [, user] = buildGenerationPrompt({
    card, section: { kind: 'character', title: 'Character and psychology', text: 'Старый текст' },
    others: [{ title: 'Basic Info', text: 'Лидер банды' }], origin: { mode: 'original' },
  });
  assert.match(user.content, /CURRENT TEXT OF THIS SECTION\]\nСтарый текст/);
  assert.match(user.content, /EDIT the current text/);
  assert.match(user.content, /### Basic Info\nЛидер банды/);
});

test('разделы «other» различаются по названию', () => {
  assert.match(guideFor({ kind: 'other', title: 'Public Info' }).holds, /reputation/);
  assert.match(guideFor({ kind: 'other', title: 'Biography' }).holds, /childhood/);
  assert.match(guideFor({ kind: 'other', title: 'Любимая еда' }).holds, /title of the section/);
});

test('ответ очищается: ограда, заголовок, заметка, отказ', () => {
  assert.deepEqual(cleanGenerated('```\nТекст\n```'), { text: 'Текст', note: '', skip: '' });
  assert.equal(cleanGenerated('### Voice\nГоворит тихо.', 'Voice').text, 'Говорит тихо.');
  assert.equal(cleanGenerated('**Voice**\nГоворит тихо.', 'Voice').text, 'Говорит тихо.');
  assert.equal(cleanGenerated('Первая строка про Voice.\nВторая.', 'Voice').text, 'Первая строка про Voice.\nВторая.');
  const noted = cleanGenerated('Рост 160 см.\n\nNOTE: рост по вики, не уверен насчёт цвета глаз', 'Visual');
  assert.equal(noted.text, 'Рост 160 см.');
  assert.match(noted.note, /не уверен/);
  assert.equal(cleanGenerated('[[SKIP: по канону ему 14 лет]]').skip, 'по канону ему 14 лет');
});

test('разделы пишутся по очереди, следующий видит предыдущий; NSFW не уходит в чужие разделы', async () => {
  const seen = [];
  const answers = ['Лидер банды, 15 лет.', 'Спокойный, но опасный.'];
  const context = { generateRaw: async ({ prompt }) => { seen.push(prompt[1].content); return answers.shift(); } };
  const { results, failed } = await generateCardSections(context, {
    card,
    sections: [{ id: 'a', kind: 'basic', title: 'Basic Info', text: '' }, { id: 'b', kind: 'character', title: 'Character', text: '' }],
    others: [{ id: 'n', kind: 'nsfw', title: 'NSFW module', text: 'секретный текст' }],
    origin: { mode: 'original' },
  });
  assert.equal(failed, null);
  assert.deepEqual(results.map(item => item.text), ['Лидер банды, 15 лет.', 'Спокойный, но опасный.']);
  assert.doesNotMatch(seen[0], /секретный текст/);
  assert.match(seen[1], /### Basic Info\nЛидер банды/);
});

test('ошибка на разделе: написанное остаётся, раздел назван', async () => {
  let calls = 0;
  const context = { generateRaw: async () => { calls += 1; if (calls === 2) throw new Error('нет связи'); return 'Текст.'; } };
  const out = await generateCardSections(context, { card, sections: [{ id: 'a', kind: 'basic', title: 'A', text: '' }, { id: 'b', kind: 'voice', title: 'Voice', text: '' }, { id: 'c', kind: 'skills', title: 'Skills', text: '' }], origin: { mode: 'original' } });
  assert.equal(out.results.length, 1);
  assert.equal(out.failed.title, 'Voice');
  assert.match(out.failed.message, /нет связи/);
  assert.equal(calls, 2);
});

test('пустой ответ модели — ошибка раздела, отказ — не ошибка', async () => {
  const empty = await generateCardSections({ generateRaw: async () => '  ' }, { card, sections: [{ id: 'a', kind: 'basic', title: 'A', text: '' }], origin: { mode: 'original' } });
  assert.match(empty.failed.message, /пустой/);
  const skipped = await generateCardSections({ generateRaw: async () => '[[SKIP: возраст не указан]]' }, { card, sections: [{ id: 'n', kind: 'nsfw', title: 'NSFW module', text: '' }], origin: { mode: 'original' } });
  assert.equal(skipped.failed, null);
  assert.equal(skipped.results[0].skip, 'возраст не указан');
});

test('строгость к канону меняет правило в запросе; у оригинального героя её нет', () => {
  const build = strictness => buildGenerationPrompt({ card, section: { kind: 'basic', title: 'Basic Info', text: '' }, origin: { mode: 'canon', fandom: 'X', strictness } })[1].content;
  assert.match(build('strict'), /Use ONLY facts the canon states/);
  assert.match(build('balanced'), /FILL the gaps/);
  assert.match(build('free'), /Adapt and invent freely/);
  assert.match(build(undefined), /FILL the gaps/, 'по умолчанию — достройка пробелов');
  const original = buildGenerationPrompt({ card, section: { kind: 'basic', title: 'Basic Info', text: '' }, origin: { mode: 'original', strictness: 'strict' } })[1].content;
  assert.doesNotMatch(original, /STRICTNESS/);
});

test('пожелания к одному разделу идут отдельной строкой', () => {
  const [, user] = buildGenerationPrompt({ card, section: { kind: 'voice', title: 'Voice', text: '' }, origin: { mode: 'original' }, wishes: 'общие', sectionWishes: 'низкий голос' });
  assert.match(user.content, /общие/);
  assert.match(user.content, /Wishes for THIS section only[^\n]*\nнизкий голос/);
});

test('сначала пишется основа героя, потом то, что на ней стоит', async () => {
  const order = [];
  const context = { generateRaw: async ({ prompt }) => { order.push(/Title: (.+)/.exec(prompt[1].content)[1]); return 'Текст.'; } };
  const sections = ['relationships', 'voice', 'visual', 'character', 'basic'].map(kind => ({ id: kind, kind, title: kind, text: '' }));
  await generateCardSections(context, { card, sections, origin: { mode: 'original' } });
  assert.deepEqual(order, ['basic', 'character', 'visual', 'voice', 'relationships']);
});

test('пожелания раздела доходят до запроса этого раздела', async () => {
  const seen = [];
  const context = { generateRaw: async ({ prompt }) => { seen.push(prompt[1].content); return 'Текст.'; } };
  await generateCardSections(context, { card, sections: [{ id: 'v', kind: 'voice', title: 'Voice', text: '', wishes: 'шёпотом' }, { id: 's', kind: 'skills', title: 'Skills', text: '' }], origin: { mode: 'original' } });
  assert.match(seen[0], /шёпотом/);
  assert.doesNotMatch(seen[1], /шёпотом/);
});
