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

test('card of the library: closing with unsaved typing asks first; a clean card closes at once', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const card = { id: 'c1', folderId: 'f1', name: 'Судзу', aliases: [], sections: [{ id: 's1', kind: 'visual', title: 'Visual', text: 'Высокая.' }], records: [], words: [] };
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Папка' }], locations: [], items: [], characters: [card] } };
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, container: place });
    studio.showWindow('cards', 'cards');
    const root = studio.element.shadowRoot;
    const openCard = () => { root.querySelector('.ku-place-open')?.click(); };
    openCard();
    const clickClose = () => root.querySelector('.ku-ctop-tools [aria-label="Закрыть"]').click();
    clickClose(); // nothing typed: closes at once
    assert.equal(root.querySelector('.ku-ccard'), null, 'a clean card closes without a question');
    openCard();
    const name = root.querySelector('.ku-cname');
    name.value = 'Судзу Новая';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    clickClose();
    assert.ok(root.querySelector('.ku-ccard'), 'the card stays open');
    assert.match(root.querySelector('.ku-aunotice[role="alert"]').textContent, /несохранённые правки/);
    [...root.querySelectorAll('.ku-aunotice button')].find(button => button.textContent === 'Остаться').click();
    assert.equal(root.querySelector('.ku-aunotice[role="alert"]'), null, 'stay: the question goes, the typing stays');
    assert.equal(root.querySelector('.ku-cname').value, 'Судзу Новая');
    clickClose();
    [...root.querySelectorAll('.ku-aunotice button')].find(button => button.textContent === 'Не сохранять').click();
    assert.equal(root.querySelector('.ku-ccard'), null, 'leave without saving closes the card');
  } finally { studio?.destroy(); place.remove(); }
});

test('reload with an unsaved card: the browser is asked to confirm; with nothing typed it is not', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const card = { id: 'c1', folderId: 'f1', name: 'Судзу', aliases: [], sections: [], records: [], words: [] };
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Папка' }], locations: [], items: [], characters: [card] } };
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, container: place });
    studio.showWindow('cards', 'cards');
    const root = studio.element.shadowRoot;
    root.querySelector('.ku-place-open').click();
    const leave = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
    assert.equal(leave(), false, 'nothing typed');
    const name = root.querySelector('.ku-cname');
    name.value = 'Другое имя';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal(leave(), true, 'typed and not saved');
  } finally { studio?.destroy(); place.remove(); }
});

test('card of the library: «очистить разделы» in the footer: tick some or all, two presses, the texts go', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const card = { id: 'c1', folderId: 'f1', name: 'Судзу', aliases: [], records: [], words: [], sections: [
    { id: 'a', kind: 'visual', title: 'Visual', text: 'Высокая.' }, { id: 'b', kind: 'voice', title: 'Voice', text: 'Тихо.' }, { id: 'c', kind: 'other', title: 'Public Info', text: 'Известна.' }] };
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Папка' }], locations: [], items: [], characters: [card] } };
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, container: place });
    studio.showWindow('cards', 'cards');
    const root = studio.element.shadowRoot;
    root.querySelector('.ku-place-open').click();
    root.querySelector('.ku-cfoot-tool[aria-label^="Очистить разделы"]').click();
    const boxes = () => [...root.querySelectorAll('.ku-clearrow input')];
    assert.equal(boxes().length, 3, 'every section with text is listed');
    boxes()[0].click(); boxes()[1].click();
    const press = label => [...root.querySelectorAll('.ku-clearpanel button')].find(node => node.textContent.startsWith(label)).click();
    press('Очистить (2)');
    assert.ok(root.querySelector('.ku-clearpanel'), 'the first press only asks');
    press('Да, очистить 2');
    assert.equal(root.querySelector('.ku-clearpanel'), null);
    // the third text is still there: the panel lists only it now
    root.querySelector('.ku-cfoot-tool[aria-label^="Очистить разделы"]').click();
    assert.equal(boxes().length, 1, 'what is left is the one with text');
  } finally { studio?.destroy(); place.remove(); }
});

test('a card folded with «Свернуть»: the window goes, a pill with its name stays, a click brings the card back', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const card = { id: 'c1', folderId: 'f1', name: 'Судзу', aliases: [], records: [], words: [], sections: [{ id: 'a', kind: 'visual', title: 'Visual', text: 'Высокая.' }] };
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Папка' }], locations: [], items: [], characters: [card] } };
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, container: place });
    studio.showWindow('cards', 'cards');
    const root = studio.element.shadowRoot;
    const pill = root.querySelector('.ku-pill');
    assert.equal(pill.hidden, true, 'nothing folded yet');
    root.querySelector('.ku-place-open').click();
    root.querySelector('.ku-ctop-tools [aria-label="Свернуть"]').click();
    assert.equal(studio.isOpen(), false, 'the window is folded');
    assert.equal(pill.hidden, false);
    assert.match(pill.textContent, /Судзу/);
    pill.click();
    assert.equal(studio.isOpen(), true);
    assert.ok(root.querySelector('.ku-ccard'), 'the same card is open again');
    assert.equal(pill.hidden, true);
  } finally { studio?.destroy(); place.remove(); }
});

test('translation of a card: the card shows what is going on, and the pill of a folded window does too', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const card = { id: 'c1', folderId: 'f1', name: 'Судзу', aliases: [], records: [], words: [], sections: [{ id: 'a', kind: 'visual', title: 'Visual', text: 'Высокая.' }] };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Папка' }], locations: [], items: [], characters: [card] } };
  let studio;
  try {
    studio = createRelationshipStudio({
      store: { getSnapshot: () => snapshot },
      callbacks: { onLibraryTranslateCard: async payload => { payload.onProgress?.(0, 2, 'Visual'); await gate; } },
      container: place,
    });
    studio.showWindow('cards', 'cards');
    const root = studio.element.shadowRoot;
    root.querySelector('.ku-place-open').click();
    [...root.querySelectorAll('.ku-cstrip button')].find(node => node.textContent === 'Перевести на английский').click();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.match(root.querySelector('.ku-genbadge')?.textContent ?? '', /Перевожу «Visual» \(1 из 2\)/, 'the card shows the step');
    root.querySelector('.ku-ctop-tools [aria-label="Свернуть"]').click();
    assert.match(root.querySelector('.ku-pill').textContent, /Судзу.*Перевожу «Visual»/, 'the pill shows the translation, not just «открыта»');
    release();
  } finally { studio?.destroy(); place.remove(); }
});

test('selected text of a section: a plaque «Создать раздел», the piece moves into a new section and leaves the old one', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const text = 'Первый абзац.\n\nВторой абзац про шрам.\n\nТретий абзац.';
  const card = { id: 'c1', folderId: 'f1', name: 'Судзу', aliases: [], records: [], words: [], sections: [{ id: 'a', kind: 'other', title: 'Public Info', text }] };
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Папка' }], locations: [], items: [], characters: [card] } };
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, container: place });
    studio.showWindow('cards', 'cards');
    const root = studio.element.shadowRoot;
    root.querySelector('.ku-place-open').click();
    const area = root.querySelector('#ku-card-text');
    assert.equal(root.querySelector('.ku-splitplaque').hidden, true, 'nothing selected: no plaque');
    const piece = 'Второй абзац про шрам.';
    area.setSelectionRange(text.indexOf(piece), text.indexOf(piece) + piece.length);
    area.dispatchEvent(new Event('select', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(root.querySelector('.ku-splitplaque').hidden, false, 'the plaque shows on a selection');
    [...root.querySelectorAll('.ku-splitplaque button')][0].click();
    assert.equal(root.querySelector('#ku-card-text').value, piece, 'the new section is open with the piece');
    assert.equal(root.querySelector('.ku-ctitle-edit').value, 'Новый раздел');
    const old = [...root.querySelectorAll('.ku-cnav')].find(node => node.textContent.includes('Public Info'));
    old.click();
    assert.equal(root.querySelector('#ku-card-text').value, 'Первый абзац.\n\nТретий абзац.', 'the piece is gone from the old section and the seam is closed');
  } finally { studio?.destroy(); place.remove(); }
});

test('the section made from a selection stands at the end of the list', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const text = 'Один.\n\nДва.';
  const card = { id: 'c1', folderId: 'f1', name: 'Судзу', aliases: [], records: [], words: [], sections: [{ id: 'a', kind: 'other', title: 'Первый', text }, { id: 'b', kind: 'other', title: 'Второй', text: 'Тут.' }] };
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Папка' }], locations: [], items: [], characters: [card] } };
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, container: place });
    studio.showWindow('cards', 'cards');
    const root = studio.element.shadowRoot;
    root.querySelector('.ku-place-open').click();
    const area = root.querySelector('#ku-card-text');
    area.setSelectionRange(text.indexOf('Два.'), text.length);
    area.dispatchEvent(new Event('select', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 10));
    root.querySelector('.ku-splitplaque button').click();
    const titles = [...root.querySelectorAll('.ku-cnav-title')].map(node => node.textContent);
    assert.deepEqual(titles, ['Первый', 'Второй', 'Новый раздел']);
  } finally { studio?.destroy(); place.remove(); }
});

test('split of a section reaches the save: the old section is saved without the piece', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const text = 'Один абзац.\n\nДругой абзац.';
  const card = { id: 'c1', folderId: 'f1', name: 'Судзу', aliases: [], records: [], words: [], sections: [{ id: 'a', kind: 'other', title: 'Первый', text }] };
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Папка' }], locations: [], items: [], characters: [card] } };
  let saved = null;
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, callbacks: { onLibraryUpdateCharacter: payload => { saved = payload; } }, container: place });
    studio.showWindow('cards', 'cards');
    const root = studio.element.shadowRoot;
    root.querySelector('.ku-place-open').click();
    const area = root.querySelector('#ku-card-text');
    area.focus();
    area.setSelectionRange(text.indexOf('Другой'), text.length);
    area.dispatchEvent(new Event('mouseup', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 10));
    const button = root.querySelector('.ku-splitplaque button');
    button.dispatchEvent(new Event('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(saved, 'the split is saved at once, without «Сохранить»');
    assert.match(root.querySelector('.ku-cfoot .ku-savenote').textContent, /Автосохранено \d\d:\d\d/, 'the footer tells that the card saved itself');
    assert.deepEqual(saved.changes.sections.map(section => section.text), ['Один абзац.', 'Другой абзац.']);
    saved = null;
    [...root.querySelectorAll('.ku-cfoot button')].find(node => node.textContent === 'Сохранить').click();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(saved.changes.sections.map(section => [section.title, section.text]), [['Первый', 'Один абзац.'], ['Новый раздел', 'Другой абзац.']]);
  } finally { studio?.destroy(); place.remove(); }
});

test('names of a card: while the model picks the forms, the card says so (badge, button, pill)', async () => {
  const place = document.createElement('div');
  document.body.append(place);
  const card = { id: 'c1', folderId: 'f1', name: 'Ганрид', aliases: ['Ган'], records: [], words: [], sections: [{ id: 'a', kind: 'other', title: 'Первый', text: 'Тут.' }] };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const snapshot = { ...sample(), locationLibrary: { folders: [{ id: 'f1', name: 'Папка' }], locations: [], items: [], characters: [card] } };
  let studio;
  try {
    studio = createRelationshipStudio({ store: { getSnapshot: () => snapshot }, callbacks: { onCardNamesFill: async () => { await gate; return []; } }, container: place });
    studio.showWindow('cards', 'cards');
    const root = studio.element.shadowRoot;
    root.querySelector('.ku-place-open').click();
    root.querySelector('.ku-cfoot-tool[aria-label^="Имена"]').click();
    [...root.querySelectorAll('.ku-cpane button')].find(node => node.textContent.startsWith('Подобрать склонения')).click();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(root.querySelector('.ku-genbadge')?.textContent ?? '', /Подбираю склонения/, 'the card shows the model works');
    assert.equal([...root.querySelectorAll('.ku-cpane button')].find(node => node.textContent === 'Подбираю…')?.disabled, true, 'the button cannot be pressed twice');
    root.querySelector('.ku-ctop-tools [aria-label="Свернуть"]').click();
    assert.match(root.querySelector('.ku-pill').textContent, /склонения/, 'the pill of the folded window says it too');
    release();
  } finally { studio?.destroy(); place.remove(); }
});
