import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGenerationPrompt } from '../src/integration/card-generate.js';

const card = { name: 'Манджиро Сано', aliases: ['Майки'], gender: 'male' };
const au = { frame: 'до Поднебесья', world: 'современный город', changes: 'все старше на пять лет', absent: 'нет Вальхаллы' };
const basic = { kind: 'basic', title: 'Basic Info', text: '' };

test('АУ папки читается и для канонного, и для оригинального героя; момент карточки сильнее момента папки', () => {
  const canon = buildGenerationPrompt({ card, section: basic, origin: { mode: 'canon', fandom: 'X', folderAu: au } })[1].content;
  assert.match(canon, /\[AU OF THE FOLDER/);
  assert.match(canon, /What is different about the world[^\n]*современный город/);
  assert.match(canon, /EVERY character[^\n]*на пять лет/);
  assert.match(canon, /NOT in this AU[^\n]*Вальхаллы/);
  assert.match(canon, /MOMENT OF CANON: до Поднебесья/);
  const own = buildGenerationPrompt({ card, section: basic, origin: { mode: 'canon', fandom: 'X', frame: 'после таймскипа', folderAu: au } })[1].content;
  assert.match(own, /MOMENT OF CANON: после таймскипа/);
  const original = buildGenerationPrompt({ card, section: basic, origin: { mode: 'original', folderAu: au } })[1].content;
  assert.match(original, /ORIGINAL/);
  assert.match(original, /современный город/);
  const none = buildGenerationPrompt({ card, section: basic, origin: { mode: 'canon', folderAu: { frame: '', world: '', changes: '', absent: '' } } })[1].content;
  assert.doesNotMatch(none, /AU OF THE FOLDER/);
});

test('перестройка под АУ: текст берётся за основу, сказано откуда и куда', () => {
  const [, user] = buildGenerationPrompt({
    card, section: { kind: 'character', title: 'Character', text: 'Лидер банды.' }, origin: { mode: 'canon', fandom: 'X', folderAu: au },
    adapt: { from: 'Moment of the canon: канон', to: 'What is different about the world: современный город' },
  });
  assert.match(user.content, /REBUILD this text for a different setting/);
  assert.match(user.content, /written for: Moment of the canon/);
  assert.match(user.content, /CURRENT TEXT OF THIS SECTION\]\nЛидер банды/);
  assert.doesNotMatch(user.content, /EDIT the current text/);
});

test('канонного героя модель опознаёт по имени и называет, кого приняла; у оригинального этого нет', () => {
  const canon = buildGenerationPrompt({ card: { name: 'Дракен', aliases: [] }, section: basic, origin: { mode: 'canon', fandom: 'Токийские мстители' }, identify: true })[1].content;
  assert.match(canon, /Name: Дракен/);
  assert.match(canon, /transliteration/);
  assert.match(canon, /«Принят за: »/);
  const later = buildGenerationPrompt({ card: { name: 'Дракен', aliases: [] }, section: basic, origin: { mode: 'canon', fandom: 'X' } })[1].content;
  assert.doesNotMatch(later, /Принят за/);
  const original = buildGenerationPrompt({ card: { name: 'Рика', aliases: [] }, section: basic, origin: { mode: 'original' }, identify: true })[1].content;
  assert.doesNotMatch(original, /Принят за|transliteration/);
});
