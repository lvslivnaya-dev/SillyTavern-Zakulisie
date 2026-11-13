/** The card of a persona (a card of the library with `persona: true`): sections of what shows, records with people and AU. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAu, addFolder, addLibraryCharacter, buildPersonaPrompt, cleanRecords, emptyLibrary, emptyPersonaCards, findPersonaCard, migratePersonaCards, normalizeLibrary,
  ensurePersonaHome, normalizePersonaCards, removeAu, selectPersonaRecords, updateLibraryCharacter,
} from '../src/core/index.js';

function sample() {
  let settings = addAu(emptyPersonaCards(), 'Универ');
  settings = addAu(settings, 'Мафия');
  const [univer, mafia] = settings.au.map(item => item.id);
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Персоны' });
  const added = addLibraryCharacter(library, { folderId: folder.id, name: 'Рика', aliases: ['Рикка'], persona: true, avatar: 'rika.png' });
  const lib = updateLibraryCharacter(added.library, added.character.id, {
    sections: [
      { kind: 'visual', title: 'Visual', text: 'Невысокая, веснушки, рыжие волосы' },
      { kind: 'voice', title: 'Voice', text: 'Тихий низкий голос' },
      { kind: 'other', title: 'Public Info', text: 'Студентка' },
    ],
    records: [
      { text: 'Рэн видит в ней младшую сестру', about: ['Рэн'], knows: ['Мику'], au: [univer] },
      { text: 'Носит шрамы под рукавами', about: [], knows: ['Рэн'], secret: true },
      { text: 'Знаменита в клане', au: [mafia] },
      { text: 'Общеизвестный факт', about: [], knows: [] },
      { text: 'Выключено', about: [], off: true },
    ],
  });
  return { settings, lib, univer, mafia, card: lib.characters[0] };
}

test('a persona card is a card of the library: the persona template, the flag, the records', () => {
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Персоны' });
  const made = addLibraryCharacter(library, { folderId: folder.id, name: 'Рика', persona: true });
  assert.equal(made.character.persona, true);
  assert.deepEqual(made.character.sections.map(section => section.kind), ['visual', 'voice', 'other', 'private'], 'what shows from outside, and the hidden character that only the factors read');
  const plain = addLibraryCharacter(library, { folderId: folder.id, name: 'Рэн' });
  assert.equal(plain.character.persona, undefined);
  assert.equal(plain.character.sections.length, 9);
  const { card } = sample();
  assert.equal(card.records.length, 5, 'the switched-off one stays too');
  assert.equal(normalizeLibrary(JSON.parse(JSON.stringify(sample().lib))).characters[0].records.length, 5, 'and it survives a round trip');
});

test('a record goes when its AU is on and ANY of its people is on stage — so the one who knows is not left out', () => {
  const { card, univer } = sample();
  const texts = options => selectPersonaRecords(card, options).map(record => record.text);
  assert.deepEqual(texts({ present: ['Рэн'], activeAu: [univer] }), ['Рэн видит в ней младшую сестру', 'Носит шрамы под рукавами', 'Общеизвестный факт']);
  assert.deepEqual(texts({ present: ['Мику'], activeAu: [univer] }), ['Рэн видит в ней младшую сестру', 'Общеизвестный факт'], 'Мику knows it, though it is about Рэн');
  assert.deepEqual(texts({ present: ['Кто-то'], activeAu: [univer] }), ['Общеизвестный факт']);
  assert.deepEqual(texts({ present: ['Рэн'], activeAu: [] }), ['Носит шрамы под рукавами', 'Общеизвестный факт'], 'the AU records wait until the AU is on');
});

test('several AU can be on at once, and a switched-off record never goes', () => {
  const { card, univer, mafia } = sample();
  const texts = selectPersonaRecords(card, { present: ['Рэн'], activeAu: [univer, mafia] }).map(record => record.text);
  assert.ok(texts.includes('Рэн видит в ней младшую сестру') && texts.includes('Знаменита в клане'));
  assert.ok(!texts.includes('Выключено'));
});

test('the block: sections, notes and secrets with who knows; empty when there is nothing', () => {
  const { card, univer } = sample();
  const block = buildPersonaPrompt(card, { present: ['Рэн'], activeAu: [univer] });
  assert.match(block, /^\[PERSONA — Рика\]\nlooks: Невысокая, веснушки/);
  assert.match(block, /voice: Тихий низкий голос/);
  assert.match(block, /info\[Public Info\]: Студентка/);
  assert.match(block, /note\[Рэн\]: Рэн видит в ней младшую сестру/);
  assert.match(block, /secret\[known only to Рэн\]: Носит шрамы под рукавами/);
  assert.match(block, /\[\/PERSONA\]$/);
  assert.equal(buildPersonaPrompt({ name: 'X', sections: [], records: [] }), '');
  assert.equal(buildPersonaPrompt(null), '');
});

test('the card is the one the chat chose, else by the avatar, else by name or alias; only personas count', () => {
  const { lib, card } = sample();
  const cards = lib.characters;
  assert.equal(findPersonaCard(cards, { avatar: 'rika.png' }).name, 'Рика');
  assert.equal(findPersonaCard(cards, { avatar: 'other.png', names: ['рикка'] }).name, 'Рика');
  assert.equal(findPersonaCard(cards, { id: card.id, names: ['Никто'] }).id, card.id, 'the choice of the chat wins');
  assert.equal(findPersonaCard(cards, { names: ['Никто'] }), null);
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Герои' });
  const hero = addLibraryCharacter(library, { folderId: folder.id, name: 'Рэн' }).character;
  assert.equal(findPersonaCard([hero], { names: ['Рэн'] }), null, 'a character is not a persona');
});

test('the AU list: add, no repeats, removing one; the cards of an earlier version move to the library', () => {
  const { settings, univer } = sample();
  assert.throws(() => addAu(settings, 'универ'), /уже есть/);
  assert.equal(removeAu(settings, univer).au.length, 1);
  assert.deepEqual(normalizePersonaCards('junk'), emptyPersonaCards());
  const moved = migratePersonaCards([{ name: 'Рика', aliases: ['Рикка'], avatar: 'rika.png', looks: 'Рыжая', voice: '', records: [{ text: 'Запись', about: ['Рэн'] }] }]);
  assert.deepEqual(moved[0].sections.map(section => [section.kind, section.text]), [['visual', 'Рыжая']]);
  assert.equal(moved[0].records[0].text, 'Запись');
  assert.deepEqual(migratePersonaCards([{ name: '' }, null]), []);
});

test('a persona card always has its looks and its voice, whatever is done to the sections', () => {
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Персоны' });
  const made = addLibraryCharacter(library, { folderId: folder.id, name: 'Рика', persona: true });
  const bare = updateLibraryCharacter(made.library, made.character.id, { sections: [{ kind: 'other', title: 'Public Info', text: 'Студентка' }] });
  assert.deepEqual(bare.characters[0].sections.map(section => section.kind), ['visual', 'voice', 'other', 'private'], 'the ones that were taken away come back, empty: looks and voice in front, the hidden character last');
  const hero = addLibraryCharacter(library, { folderId: folder.id, name: 'Рэн' });
  const heroBare = updateLibraryCharacter(hero.library, hero.character.id, { sections: [{ kind: 'other', title: 'Biography', text: 'x' }] });
  assert.equal(heroBare.characters.find(card => card.id === hero.character.id).sections.length, 1, 'a character card is not forced to hold them');
});

test('records are tied straight to the cards of characters, and a character on stage is found by the card attached to him', () => {
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Герои' });
  const ren = addLibraryCharacter(library, { folderId: folder.id, name: 'Рэндо Хайтани' }).character;
  const { card } = sample();
  const tied = { ...card, records: cleanRecords([{ text: 'Он видит в ней сестру', aboutIds: [ren.id], knowsIds: [ren.id, 'ghost'] }]) };
  assert.deepEqual(tied.records[0].aboutIds, [ren.id]);
  assert.equal(selectPersonaRecords(tied, { present: ['Кто-то'], presentCardIds: [] }).length, 0, 'nobody of the tied ones is on stage');
  assert.equal(selectPersonaRecords(tied, { present: ['Совсем другое имя'], presentCardIds: [ren.id] }).length, 1, 'found by the card, not by the name');
  const block = buildPersonaPrompt(tied, { presentCardIds: [ren.id], cardNames: new Map([[ren.id, ren.name]]) });
  assert.match(block, /note\[Рэндо Хайтани\]: Он видит в ней сестру/);
});

test('a persona note: the name, the line about her, the looks, the voice; a list of names; a bold name', async () => {
  const { draftFromPersonaNote, draftsFromPersonaNotes } = await import('../src/integration/character-import.js');
  const note = '---\nFandom: Токийские мстители\njpg: x.jpg\n---\nХайтани Судзу «Су»\nМладшая сестра Рана и Риндо\n\nСудзу невысокая, с веснушками.\n\nГолос тихий, низкий.\n\n---\n';
  const draft = draftFromPersonaNote('Person/Хайтани Судзу.md', note);
  assert.equal(draft.persona, true);
  assert.equal(draft.name, 'Хайтани Судзу');
  assert.deepEqual(draft.aliases, ['Су']);
  assert.deepEqual(draft.sections.map(section => [section.kind, section.text]), [['visual', 'Судзу невысокая, с веснушками.'], ['voice', 'Голос тихий, низкий.'], ['other', 'Младшая сестра Рана и Риндо']]);
  assert.equal(draft.source.path, 'Хайтани Судзу.md');
  const listed = draftFromPersonaNote('Person/Веспер.md', 'Имя: Веспер, Весп, Пера\n\nВнешность тут.\n\nГолос тут.\n');
  assert.deepEqual([listed.name, listed.aliases], ['Веспер', ['Весп', 'Пера']]);
  assert.equal(draftFromPersonaNote('Person/Кобаяси Ая.md', '**Кобаяси Ая**\n\nА.\n\nБ.\n').name, 'Кобаяси Ая');
  const headed = draftFromPersonaNote('Person/Х.md', 'Х\n\n### Внешность\nРыжая\n### Voice\nТихая\n### Прошлое\nУчилась\n');
  assert.deepEqual(headed.sections.map(section => section.kind), ['visual', 'voice', 'other']);
  assert.equal(draftFromPersonaNote('Person/Person.md', '---\njpg: x\n---\n'), null, 'an empty note is not a persona');
  assert.equal(draftsFromPersonaNotes([{ path: 'a/b.txt', text: 'x' }]).length, 0);
});

test('persona notes: loaded as persona cards, noticed when changed, refreshed with the sections kept; translation takes the records too', async () => {
  const { createLibraryCallbacks, createLocationLibraryStore } = await import('../src/integration/location-library-actions.js');
  const settings = {};
  const store = createLocationLibraryStore({ settings: () => settings, save: () => {} });
  const asked = [];
  const callbacks = createLibraryCallbacks({
    library: store, getState: () => ({ entities: {}, ui: {} }), commitOperations: async () => {}, replaceState: async () => {}, confirm: async () => true, notify: () => {},
    translateSections: async sections => { asked.push(...sections.map(item => item.id)); return sections.map(item => ({ id: item.id, text: `EN ${item.text}` })); },
  });
  const note = text => ({ path: 'Person/Рика.md', text });
  const body = 'Рика\n\nСмуглая.\n\nГолос хриплый.\n';
  const first = callbacks.onLibraryImportMarkdown({ files: [note(body)], folderId: '', kind: 'characters', persona: true });
  assert.equal(first.added.length, 1);
  const card = store.get().characters[0];
  assert.equal(card.persona, true, 'a persona card, not a hero');
  assert.deepEqual(callbacks.onLibraryPreviewNotes({ files: [note(body)], persona: true }).map(item => item.exists), [true]);
  assert.deepEqual(callbacks.onLibraryPreviewNotes({ files: [note(body)] }), [], 'the shelf of heroes does not read persona notes as questionnaires');

  const same = callbacks.onLibraryCheckNotes({ files: [note(body)], persona: true });
  assert.deepEqual([same.changed.length, same.same], [0, 1]);
  const edited = 'Рика\n\nСмуглая, высокая.\n\nГолос хриплый.\n';
  const changed = callbacks.onLibraryCheckNotes({ files: [note(edited)], persona: true });
  assert.deepEqual(changed.changed, [card.id]);
  await callbacks.onLibraryRefreshCards({ files: [note(edited)], persona: true });
  const fresh = store.get().characters[0];
  assert.equal(fresh.sections.find(section => section.kind === 'visual').text, 'Смуглая, высокая.');
  assert.equal(fresh.source.stale, undefined);

  store.set(updateLibraryCharacter(store.get(), card.id, { records: [{ text: 'Рэн видит в ней сестру', about: ['Рэн'] }] }));
  await callbacks.onLibraryTranslateCard({ cardId: card.id });
  const done = store.get().characters[0];
  assert.equal(done.lang, 'en');
  assert.equal(done.records[0].text, 'EN Рэн видит в ней сестру', 'the records are translated with the sections');
  assert.ok(asked.some(id => id.startsWith('record:')));
});

test('persona cards need no folder: they sit in a hidden one; a plain folder that holds only personas moves to their shelf', () => {
  const made = addLibraryCharacter(emptyLibrary(), { name: 'Рика', persona: true });
  const home = made.library.folders.find(folder => folder.id === made.character.folderId);
  assert.deepEqual([home.persona, home.hidden], [true, true], 'no folder of their own is shown');
  assert.equal(ensurePersonaHome(structuredClone(made.library)), home.id, 'the same place every time');
  assert.throws(() => addLibraryCharacter(emptyLibrary(), { name: 'Ран' }), /папк/, 'a hero still needs a folder');
  const own = addFolder(made.library, { name: 'Мои', persona: true });
  assert.equal(own.folder.persona, true);
  // an old library: persona cards in a plain «Персоны» folder
  const old = normalizeLibrary({ folders: [{ id: 'f1', name: 'Персоны' }, { id: 'f2', name: 'Герои' }], characters: [
    { id: 'c1', folderId: 'f1', name: 'Рика', persona: true, sections: [] }, { id: 'c2', folderId: 'f2', name: 'Ран', sections: [] }] });
  const flags = Object.fromEntries(old.folders.map(folder => [folder.id, [Boolean(folder.persona), Boolean(folder.hidden)]]));
  assert.deepEqual(flags, { f1: [true, true], f2: [false, false] });
});

test('the looks and the voice of a persona are described from a picture, by the rules of the permanent looks', async () => {
  const { createLibraryCallbacks, createLocationLibraryStore } = await import('../src/integration/location-library-actions.js');
  const store = createLocationLibraryStore({ settings: () => ({}), save: () => {} });
  const asked = [];
  let reply = '<think>хм</think>Вот описание:\n\nНевысокая, рыжая, веснушки.\n===VOICE===\nНизкий голос с хрипотцой.';
  const callbacks = createLibraryCallbacks({
    library: store, getState: () => ({ entities: {}, ui: {} }), commitOperations: async () => {}, replaceState: async () => {}, confirm: async () => true, notify: () => {},
    imageForModel: async path => `card:${path}`, avatarForModel: async avatar => `avatar:${avatar}`, prepareImage: async data => `shrunk:${data}`,
    ask: async (picture, prompt, options) => { asked.push({ picture, prompt, options }); return reply; },
  });
  const made = addLibraryCharacter(store.get(), { name: 'Рика', persona: true, avatar: 'rika.png' });
  store.set(made.library);
  const id = made.character.id;
  const done = await callbacks.onPersonaDescribe({ cardId: id, wishes: 'рост 150', voice: true, voiceWishes: 'приглушённый' });
  assert.deepEqual(done, { looks: 'Невысокая, рыжая, веснушки.', voice: 'Низкий голос с хрипотцой.' });
  assert.equal(asked[0].picture, 'avatar:rika.png', 'no picture of her own: the one from the tavern');
  assert.match(asked[0].prompt, /PERMANENT APPEARANCE/);
  assert.match(asked[0].prompt, /Leave out everything that changes: clothes/, 'what changes is not described');
  assert.match(asked[0].prompt, /VOICE/);
  assert.match(asked[0].prompt, /рост 150/);
  assert.match(asked[0].prompt, /приглушённый/);
  assert.ok(asked[0].options.maxTokens >= 5000, 'a thinking model has room for its thoughts');
  reply = 'Только внешность.';
  assert.deepEqual(await callbacks.onPersonaDescribe({ cardId: id }), { looks: 'Только внешность.', voice: '' });
  assert.doesNotMatch(asked[1].prompt, /VOICE/, 'no voice unless asked');
  store.set(updateLibraryCharacter(store.get(), id, { image: '/user/images/kulisy-wardrobe/x.png' }));
  await callbacks.onPersonaDescribe({ cardId: id });
  assert.equal(asked[2].picture, 'card:/user/images/kulisy-wardrobe/x.png');
  await callbacks.onPersonaDescribe({ cardId: id, picture: 'data:image/png;base64,AA' });
  assert.equal(asked[3].picture, 'shrunk:data:image/png;base64,AA', 'a picture picked for this time wins');
  await assert.rejects(() => callbacks.onPersonaDescribe({ cardId: 'nope' }), /нет/);
});

test('the voice is never left in the looks: the mark, a heading of its own, or a last paragraph about the voice', async () => {
  const { parsePersonaLook } = await import('../src/integration/vision.js');
  const looks = 'Невысокая, рыжая, веснушки.';
  const voice = 'Низкий голос с хрипотцой.';
  for (const reply of [`${looks}
===VOICE===
${voice}`, `${looks}

**Голос:**
${voice}`, `${looks}

## Voice
${voice}`, `${looks}

Голос: ${voice}`, `${looks}

${voice}`]) {
    assert.deepEqual(parsePersonaLook(reply, { voice: true }), { looks, voice }, reply);
  }
  assert.deepEqual(parsePersonaLook(`${looks}
===VOICE===
${voice}`, { voice: false }), { looks, voice: '' }, 'no voice asked: none kept');
});

test('the hidden character is a section of the persona card that never reaches the narrator, and is read for the factors', async () => {
  const { privateText, filledSections, makeSection } = await import('../src/core/index.js');
  const { library, folder } = addFolder(emptyLibrary(), { name: 'Персоны' });
  const made = addLibraryCharacter(library, { folderId: folder.id, name: 'Рика', persona: true });
  const lib = updateLibraryCharacter(made.library, made.character.id, { sections: [
    { kind: 'visual', title: 'Visual', text: 'Рыжая' }, { kind: 'private', title: 'Hidden character', text: 'Колючая, но теряется от нежности' }] });
  const card = lib.characters[0];
  assert.equal(privateText(card), 'Колючая, но теряется от нежности');
  assert.ok(!filledSections(card).some(section => section.kind === 'private'), 'not in the sections that go out');
  const block = buildPersonaPrompt(card, {});
  assert.match(block, /Рыжая/);
  assert.doesNotMatch(block, /Колючая/, 'the persona block never carries it');
  assert.equal(makeSection({ kind: 'private', text: 'x' }).kind, 'private');
});
