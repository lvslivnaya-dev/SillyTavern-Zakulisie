/** «Персонажи»: little buttons on top, a window for a new hero (with the gender), a window of library cards; the long hints fold into a round «?». */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyOperations, createDefaultState, createEntity, createOperation } from '../src/core/index.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
for (const name of Object.getOwnPropertyNames(dom.window)) {
  if (/^[A-Z]/.test(name) && typeof dom.window[name] === 'function') { try { globalThis[name] = dom.window[name]; } catch { /* read-only */ } }
}
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
const { createRelationshipStudio } = await import('../src/ui/studio.js');
const { collapseHints, infoRow } = await import('../src/ui/helpers.js');

const ran = createEntity('Ран');
const state = applyOperations(createDefaultState(), [createOperation('entity.upsert', ran)]);
const flush = () => new Promise(resolve => setTimeout(resolve, 5));

function page(extra = {}) {
  const calls = [];
  const callbacks = new Proxy({}, { get: (target, name) => (typeof name === 'string' && name.startsWith('on') ? async payload => { calls.push([name, payload]); return true; } : undefined) });
  const snapshot = {
    ...state, pairs: [], dossiers: {}, leaks: [], slips: [], settings: {}, lorebooks: { available: [], selected: [], cardWorlds: [] },
    locationLibrary: { folders: [{ id: 'f', name: 'Герои' }], locations: [], items: [], characters: [
      { id: 'c1', folderId: 'f', name: 'Эмма', aliases: [], sections: [] }, { id: 'c2', folderId: 'f', name: 'Лиза', aliases: [], persona: true, sections: [] }] },
    linkedCharacterIds: [], ...extra,
  };
  const studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, open: true, layout: { mode: 'window', tab: 'characters' }, callbacks });
  const shadow = studio.element.shadowRoot;
  const byText = text => [...shadow.querySelectorAll('button')].find(node => node.textContent === text);
  return { calls, studio, shadow, byText };
}

test('the top of the page: small buttons, the search of heroes in lorebooks is here', () => {
  const { studio, byText, shadow } = page();
  try {
    for (const label of ['+ Персонаж', 'Из карточек', 'Герои из лорбуков', 'Знакомства', 'Секреты', 'Другие имена']) assert.ok(byText(label), label);
    assert.ok(shadow.querySelector('.ku-castbar'));
  } finally { studio.destroy(); }
});

test('«+ Персонаж» opens a little window: name, other names, gender; adding sends them', async () => {
  const { studio, byText, shadow, calls } = page();
  try {
    byText('+ Персонаж').click();
    await flush();
    const form = shadow.querySelector('form.ku-pop');
    assert.ok(form, 'the window is open');
    form.querySelector('input[aria-label="Имя нового персонажа"]').value = 'Мика';
    form.querySelector('input[aria-label="Другие имена"]').value = 'Мик, Микки';
    form.querySelector('select[aria-label="Пол"]').value = 'female';
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush();
    assert.deepEqual(calls.find(call => call[0] === 'onAddCharacter')[1], { name: 'Мика', aliases: ['Мик', 'Микки'], gender: 'female' });
  } finally { studio.destroy(); }
});

test('«Из карточек»: the cards of the library, a click puts one into the chat, the persona\'s card is not offered', async () => {
  const { studio, byText, shadow, calls } = page();
  try {
    byText('Из карточек').click();
    await flush();
    const tiles = [...shadow.querySelectorAll('.ku-pick')];
    assert.deepEqual(tiles.map(tile => tile.querySelector('.ku-pick-name').textContent), ['Эмма']);
    tiles[0].click();
    await flush();
    assert.deepEqual(calls.find(call => call[0] === 'onLibraryLink')[1], { libraryIds: ['c1'], on: true, kind: 'characters' });
  } finally { studio.destroy(); }
});

test('a long hint folds into a round «?» that unfolds it; a short one stays', () => {
  const box = document.createElement('div');
  box.innerHTML = '<h3>Раздел</h3><p class="ku-hint">Это длинное объяснение, которое занимает много места и не нужно на виду, пока о нём не спросят.</p><p class="ku-hint">Коротко.</p>';
  collapseHints(box);
  const dot = box.querySelector('h3 .ku-info-dot');
  assert.ok(dot, 'the dot stands at the title');
  const note = box.querySelector('p.ku-hint');
  assert.equal(note.hidden, true);
  dot.click();
  assert.equal(note.hidden, false);
  dot.click();
  assert.equal(note.hidden, true);
  assert.equal(box.querySelectorAll('.ku-info-dot').length, 1, 'the short one stays as it is');
  const row = infoRow('Конечная точка', 'Пояснение.');
  assert.ok(row.querySelector('.ku-info-dot') && row.querySelector('.ku-info-note').hidden);
});
