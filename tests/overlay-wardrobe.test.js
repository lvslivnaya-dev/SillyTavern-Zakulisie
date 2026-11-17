/**
 * The clothes' room in the drawer: two tabs (persona / heroes), what is worn, a tap on a piece puts it on or takes it off,
 * a tap on an outfit dresses in the whole outfit. A fake browser (jsdom) and fake callbacks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = window;
globalThis.document = window.document;
for (const name of Object.getOwnPropertyNames(window)) {
  if (/^[A-Z]/.test(name) && typeof window[name] === 'function') { try { globalThis[name] = window[name]; } catch { /* read-only global */ } }
}
const { registerWardrobeRooms } = await import('../src/integration/overlay-wardrobe.js');

function setup({ personaOn = true, openCloset = undefined } = {}) {
  const calls = [];
  const state = { world: { wardrobe: { ran: { cardIds: ['c-shirt'], outfit: 'белая рубашка' } } } };
  const wardrobe = {
    cards: [
      { id: 'c-shirt', shelf: 'characters', gender: 'male', category: 'top', name: 'Белая рубашка', description: 'x' },
      { id: 'c-coat', shelf: 'characters', gender: 'male', category: 'outerwear', name: 'Чёрное пальто', description: 'y' },
      { id: 'p-dress', shelf: 'persona', gender: 'female', category: 'top', name: 'Платье', description: 'z' },
    ],
    looks: [{ id: 'l1', shelf: 'characters', name: 'Выходной', cardIds: ['c-coat'] }, { id: 'l2', shelf: 'persona', name: 'Бал', cardIds: ['p-dress'] }],
  };
  const panes = new Map();
  let redraws = 0;
  const stop = registerWardrobeRooms({
    panes, rerender: () => { redraws += 1; }, getState: () => state, wardrobe: () => wardrobe,
    heroes: () => [{ id: 'ran', name: 'Ран', here: true }, { id: 'mikey', name: 'Майки', here: false }],
    persona: () => (personaOn ? { id: 'me', name: 'Аня' } : null),
    closetOf: id => (id === 'ran' ? { hasCard: true, cardIds: ['c-coat'], lookIds: ['l1'] } : id === 'me' ? { hasCard: true, cardIds: [], lookIds: [] } : { hasCard: false, cardIds: [], lookIds: [] }),
    wear: async payload => { calls.push(['wear', payload]); },
    takeOff: async payload => { calls.push(['off', payload]); },
    notify: () => {},
    ...(openCloset ? { openCloset } : {}),
  });
  return { panes, calls, stop, redraws: () => redraws };
}
const draw = (panes, id) => { const box = document.createElement('div'); panes.get(id).render(box); return box; };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('two tabs for the rail: the persona\'s and the heroes\', and they go away together', () => {
  const { panes, stop } = setup();
  assert.deepEqual([...panes.keys()], ['wardrobe-persona', 'wardrobe-heroes']);
  assert.match(panes.get('wardrobe-persona').name, /персоны/);
  assert.match(panes.get('wardrobe-heroes').name, /героев/);
  stop();
  assert.equal(panes.size, 0);
});

test('heroes: what is worn is shown, a worn piece comes off, another goes on over, an outfit dresses in full', async () => {
  const { panes, calls } = setup();
  let box = draw(panes, 'wardrobe-heroes');
  assert.match(box.textContent, /Надето · 1/);
  assert.match(box.textContent, /белая рубашка/);
  assert.ok(!box.textContent.includes('Платье'), 'the shelf of the persona is not mixed in');
  box.querySelector('.ku-wr-worn').click();
  await settle();
  assert.deepEqual(calls.at(-1), ['off', { entityId: 'ran', cardId: 'c-shirt' }]);
  box = draw(panes, 'wardrobe-heroes');
  [...box.querySelectorAll('.ku-wr-item')].find(item => item.textContent.includes('Чёрное пальто')).click();
  await settle();
  assert.deepEqual(calls.at(-1), ['wear', { entityId: 'ran', cardIds: ['c-coat'], mode: 'add' }]);
  box = draw(panes, 'wardrobe-heroes');
  [...box.querySelectorAll('.ku-wr-chip')].find(chip => chip.textContent === 'Выходной').click();
  await settle();
  assert.deepEqual(calls.at(-1), ['wear', { entityId: 'ran', lookId: 'l1', mode: 'replace' }]);
});

test('closet: with a closet in the card the room opens on it; «Вся гардеробная» shows the whole shelf', () => {
  const { panes } = setup();
  const box = draw(panes, 'wardrobe-heroes');
  assert.match(box.querySelector('.ku-wr-modes').textContent, /Шкаф · 1/);
  assert.deepEqual([...box.querySelectorAll('.ku-wr-item')].map(item => item.textContent.includes('пальто')), [true], 'only what the card chose');
  assert.deepEqual([...box.querySelectorAll('.ku-wr-chip')].map(chip => chip.textContent).filter(text => text === 'Выходной' || text === 'Бал'), ['Выходной'], 'only the outfits of the closet');
  [...box.querySelectorAll('.ku-wr-modes .ku-wr-chip')].find(chip => chip.textContent === 'Вся гардеробная').click();
  assert.equal(box.querySelectorAll('.ku-wr-item').length, 2, 'the whole shelf of the heroes');
});

test('closet: no closet, no card: told what to do; the persona with an empty closet opens on the whole shelf', () => {
  const { panes } = setup();
  const box = draw(panes, 'wardrobe-heroes');
  box.querySelector('.ku-wr-select').value = 'mikey';
  box.querySelector('.ku-wr-select').dispatchEvent(new window.Event('change'));
  assert.equal(box.querySelectorAll('.ku-wr-item').length, 2, 'no closet: the room opens on the whole shelf');
  [...box.querySelectorAll('.ku-wr-modes .ku-wr-chip')].find(chip => chip.textContent.startsWith('Шкаф')).click();
  assert.match(box.querySelector('.ku-wr-grid').textContent, /нет карточки/);
  const persona = draw(panes, 'wardrobe-persona');
  assert.match(persona.querySelector('.ku-wr-grid').textContent + persona.textContent, /Платье/);
});

test('heroes: the hero is picked from a list, the gender and the section are separate controls (the section is a list too)', () => {
  const { panes } = setup();
  let box = draw(panes, 'wardrobe-heroes');
  const lists = [...box.querySelectorAll('select.ku-wr-select')];
  assert.equal(lists.length, 2, 'who, and the section');
  assert.deepEqual([...lists[0].options].map(option => option.value), ['ran', 'mikey']);
  assert.match(lists[0].options[1].textContent, /не на сцене/);
  assert.equal(box.querySelectorAll('.ku-wr-line').length, 2, 'the gender and the section are two lines');
  [...box.querySelectorAll('.ku-wr-modes .ku-wr-chip')].find(chip => chip.textContent === 'Вся гардеробная').click();
  box = draw(panes, 'wardrobe-heroes');
  const section = box.querySelectorAll('select.ku-wr-select')[1];
  section.value = 'outerwear';
  section.dispatchEvent(new window.Event('change'));
  assert.deepEqual([...box.querySelectorAll('.ku-wr-item')].map(item => item.textContent.includes('пальто')), [true], 'only the chosen section is left');
});

test('persona: its own shelf only; with no persona in the chat a hint instead', () => {
  const { panes } = setup();
  const box = draw(panes, 'wardrobe-persona');
  assert.match(box.textContent, /Аня/);
  assert.match(box.textContent, /Платье/);
  assert.ok(!box.textContent.includes('Чёрное пальто'));
  const none = setup({ personaOn: false });
  assert.match(draw(none.panes, 'wardrobe-persona').textContent, /Персона не привязана/);
});

test('closet: with the window wired in, «Шкаф» opens the big wardrobe window on this hero\'s closet instead of the small list', () => {
  const opened = [];
  const { panes } = setup({ openCloset: id => opened.push(id) });
  const box = draw(panes, 'wardrobe-heroes');
  [...box.querySelectorAll('.ku-wr-modes .ku-wr-chip')].find(chip => chip.textContent.startsWith('Шкаф')).click();
  assert.deepEqual(opened, ['ran']);
  assert.equal(box.querySelectorAll('.ku-wr-item').length, 1, 'the small pane stays as it was (nothing is switched inside it)');
  const persona = draw(panes, 'wardrobe-persona');
  [...persona.querySelectorAll('.ku-wr-modes .ku-wr-chip')].find(chip => chip.textContent.startsWith('Шкаф')).click();
  assert.deepEqual(opened, ['ran', 'me']);
});
