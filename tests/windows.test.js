/** Окна верхней панели: у каждой вкладки Студии ровно одно окно, окно показывает только свои вкладки. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="top-settings-holder"><div id="persona-management-button" class="drawer"></div><div id="rightNavHolder" class="drawer"></div></div></body></html>', { pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
for (const name of Object.getOwnPropertyNames(window)) {
  if (/^[A-Z]/.test(name) && typeof window[name] === 'function') { try { globalThis[name] = window[name]; } catch { /* read-only */ } }
}
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
window.requestAnimationFrame = globalThis.requestAnimationFrame;

const { NAV_TABS, WINDOWS, windowOf } = await import('../src/ui/layout.js');
const { createRelationshipStudio } = await import('../src/ui/studio.js');
const { mountWindowButtons } = await import('../src/integration/shell.js');
const { createDefaultState } = await import('../src/core/index.js');

const sample = () => ({ ...createDefaultState(), pairs: [], tavernPersonas: [], lorebooks: { available: [], selected: [], cardWorlds: [], status: '' }, settings: {}, promptPreview: '', analysisTokens: {} });

test('every tab of the Studio lives in exactly one window', () => {
  const seen = new Map();
  for (const win of WINDOWS) for (const id of win.tabs) {
    assert.ok(!seen.has(id), `«${id}» is in two windows: ${seen.get(id)} and ${win.id}`);
    seen.set(id, win.id);
  }
  for (const [id] of NAV_TABS) assert.ok(seen.has(id), `tab «${id}» has no window`);
  assert.equal(windowOf('songs').title, 'Медиа');
  assert.equal(windowOf('nothing').id, 'settings', 'unknown tabs fall into the settings window');
});

test('the scene window shows its five tabs only; one-tab windows have no menu', () => {
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: sample }, open: true, layout: { mode: 'window', tab: 'scene' } });
    const root = studio.element.shadowRoot;
    const labels = () => [...root.querySelectorAll('.nav button:not(.nav-fold) .nav-label')].map(node => node.textContent);
    assert.deepEqual(labels(), ['Сейчас', 'Персонажи', 'Хроника', 'События', 'Секреты']);
    assert.equal(studio.scopeId(), 'scene');
    assert.ok(!root.querySelector('.studio').classList.contains('single'));

    studio.showWindow('wardrobe');
    assert.equal(studio.scopeId(), 'wardrobe');
    assert.ok(root.querySelector('.studio').classList.contains('single'), 'wardrobe is one page: no menu');
    assert.equal(root.querySelector('.brand strong').textContent, 'Гардероб');

    studio.showWindow('settings');
    assert.ok(labels().includes('Кубик') && labels().includes('Имена') && labels().includes('Погода'));
    assert.ok(!labels().includes('Хроника'));
  } finally { studio?.destroy(); }
});

test('top bar: one button per window, the open one is lit, a second press goes to the handler', () => {
  const pressed = [];
  const bar = mountWindowButtons(WINDOWS, { onOpen: id => pressed.push(id) });
  try {
    const buttons = [...document.querySelectorAll('.ku-winbtn')];
    assert.equal(buttons.length, WINDOWS.length);
    assert.equal(document.getElementById('persona-management-button').nextElementSibling, buttons[0], 'they stand after the persona button');
    buttons[1].querySelector('.drawer-icon').click();
    assert.deepEqual(pressed, [WINDOWS[1].id]);
    bar.setOpen('scene');
    assert.ok(buttons[0].querySelector('.drawer-icon').classList.contains('openIcon'));
    assert.ok(!buttons[1].querySelector('.drawer-icon').classList.contains('openIcon'));
    bar.setOpen(null);
    assert.ok(buttons.every(node => !node.querySelector('.drawer-icon').classList.contains('openIcon')));
  } finally { bar.unmount(); }
  assert.equal(document.querySelectorAll('.ku-winbtn').length, 0);
});

test('embedded editor of a persona card: inline in the given place, a gear instead of close and folder, no menu', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const card = { id: 'pc1', folderId: 'f1', name: 'Судзу', aliases: [], persona: true, avatar: 'suzu.png', sections: [], records: [], words: [] };
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Персоны', persona: true }], locations: [], items: [], characters: [card] }, personaCards: { enabled: true, au: [], cards: [] } };
  let gears = 0;
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, container: place, embedCard: true, onGear: () => { gears += 1; } });
    studio.showCard('pc1');
    const root = studio.element.shadowRoot;
    assert.equal(place.firstElementChild, studio.element, 'the host stands in the place it was given');
    assert.equal(studio.isOpen(), true);
    assert.ok(root.querySelector('.ku-ccard'), 'the editor of the card is drawn');
    assert.equal(root.querySelector('.ku-wlayer').classList.contains('ku-embedded'), true, 'not an overlay');
    assert.equal(root.querySelector('input[aria-label="Другие имена"]') !== null, true);
    assert.equal(root.querySelector('select[aria-label="Папка"]'), null, 'the folder is the window\'s business');
    assert.equal(root.querySelector('[aria-label="Закрыть"]'), null, 'nothing to close');
    assert.equal(root.querySelector('.header, .sidebar'), null, 'no header and no menu');
    root.querySelector('.ku-gear').click();
    assert.equal(gears, 1);

    studio.showCard('nobody');
    assert.match(root.querySelector('.embed-content').textContent, /ещё нет карточки/);
  } finally { studio?.destroy(); place.remove(); }
});
