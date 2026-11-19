/** The setup guide of a chat: the steps and their state, the page, the reminder above the message box. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SETUP_STEPS, setupProgress, setupReminderDue, setupSteps } from '../src/core/index.js';
import { NAV_TABS } from '../src/ui/layout.js';

const states = steps => Object.fromEntries(steps.map(step => [step.id, step.done]));

test('the steps follow the facts of the chat: two are required, the rest are for the better', () => {
  const fresh = setupSteps({ enabled: true, personaId: '', characters: 0, libraryCards: 0, cardsOn: 0, lorebooks: 0, hasPlace: false, auxMode: 'off' });
  assert.deepEqual(SETUP_STEPS.filter(step => step.required).map(step => step.id), ['persona', 'characters']);
  assert.deepEqual(states(fresh), { persona: false, characters: false, lorebooks: false, place: false, weather: false, calendar: false, wardrobe: false, analysis: false, prompt: null });
  const progress = setupProgress(fresh);
  assert.deepEqual([progress.done, progress.total, progress.missing], [0, 2, ['persona', 'characters']]);
  assert.equal(progress.optionalTotal, 6, 'the last step has nothing to tick, so it is not counted');

  const set = setupSteps({ enabled: true, personaId: 'me', characters: 3, libraryCards: 12, cardsOn: 2, lorebooks: 1, hasPlace: true, hasWeather: true, hasCalendar: true, hasOutfits: true, auxMode: 'profile' });
  assert.deepEqual(states(set), { persona: true, characters: true, lorebooks: true, place: true, weather: true, calendar: true, wardrobe: true, analysis: true, prompt: null });
  assert.deepEqual(setupProgress(set).missing, []);
  for (const step of set) assert.ok(step.how.length >= 2 && step.what && step.title && step.tab, `${step.id} tells what to do`);
  assert.ok(set.every(step => step.tab === 'personas' || NAV_TABS.some(([id]) => id === step.tab)), 'every «Открыть» leads to a page of the menu or to the persona window');
});

test('the reminder is due only while Kulisy is on, the setting is on, this chat did not switch it off and a required step is open', () => {
  const open = setupProgress(setupSteps({ personaId: '', characters: 0 }));
  const closed = setupProgress(setupSteps({ personaId: 'me', characters: 1 }));
  assert.equal(setupReminderDue({ enabled: true, remind: true, off: false }, open), true);
  assert.equal(setupReminderDue({ enabled: true, remind: true, off: false }, closed), true, 'it stays after the required steps: only the cross closes it');
  assert.equal(setupReminderDue({ enabled: false, remind: true, off: false }, open), false, 'Kulisy is switched off');
  assert.equal(setupReminderDue({ enabled: true, remind: false, off: false }, open), false, 'the setting');
  assert.equal(setupReminderDue({ enabled: true, remind: true, off: true }, open), false, 'switched off in this chat');
});

const dom = new JSDOM('<!doctype html><html><body><div id="form_sheld"><div id="send_form"><textarea id="send_textarea"></textarea></div></div></body></html>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
for (const name of Object.getOwnPropertyNames(dom.window)) {
  if (/^[A-Z]/.test(name) && typeof dom.window[name] === 'function') { try { globalThis[name] = dom.window[name]; } catch { /* read-only */ } }
}
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
const { mountChatOverlay } = await import('../src/integration/chat-overlay.js');
const { createRelationshipStudio } = await import('../src/ui/studio.js');

test('«Настройка» in the drawer: the steps of the guide, each one opens its page; no banner above the message box any more', () => {
  const calls = [];
  const overlay = mountChatOverlay({ onOpenStudio: tab => calls.push(['studio', tab]), onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {} });
  const setup = { due: true, done: 1, total: 2, chat: 'a', steps: [{ id: 'persona', title: 'Выберите свою персону', tab: 'personas', required: true, done: true }, { id: 'characters', title: 'Соберите персонажей', tab: 'characters', required: true, done: false }] };
  try {
    overlay.render({ chips: true, cast: [{ id: 'z', name: 'Зоро', present: true }], leaks: [], setup, director: { open: true } });
    assert.equal(document.getElementById('ku-setup-banner'), null, 'the reminder above the message box is gone');
    const bar = document.getElementById('ku-scene-chips');
    const tile = [...bar.querySelectorAll('.ku-tile')].find(item => item.textContent.includes('Настройка'));
    assert.match(tile.textContent, /1\/2/, 'the tile shows the progress');
    tile.click();
    const card = bar.querySelector('.ku-dir-setup');
    assert.match(card.textContent, /сделано: 1 из 2/);
    const press = text => [...card.querySelectorAll('button')].find(node => node.textContent.includes(text)).click();
    press('Соберите персонажей');
    assert.deepEqual(calls.at(-1), ['studio', 'characters'], 'a step opens its own page');
    press('Подробно');
    assert.deepEqual(calls.at(-1), ['studio', 'setup']);
  } finally { overlay.destroy?.(); overlay.unmount?.(); document.getElementById('ku-scene-chips')?.remove(); }
});

test('the page «Настройка чата»: progress, every step with what to press, «Открыть страницу» goes to its page', async () => {
  const steps = setupSteps({ enabled: true, personaId: 'me', characters: 0, libraryCards: 3, cardsOn: 0, lorebooks: 0, hasPlace: false, auxMode: 'off' });
  const callbacks = new Proxy({}, { get: (target, name) => (typeof name === 'string' && name.startsWith('on') ? () => undefined : undefined) });
  const snapshot = () => ({
    entities: {}, pairs: [], dossiers: {}, leaks: [], slips: [], settings: {}, lorebooks: { available: [], selected: [], cardWorlds: [] }, characters: [],
    setup: { steps, progress: setupProgress(steps), off: false, remind: true, enabled: true },
  });
  const studio = createRelationshipStudio({ store: { getSnapshot: snapshot }, open: true, layout: { mode: 'window', tab: 'setup' }, callbacks });
  const shadow = studio.element.shadowRoot;
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    const main = shadow.querySelector('main');
    assert.match(main.textContent, /Настроим Закулисье для этого чата/);
    assert.match(main.textContent, /Обязательные шаги: 1 из 2/);
    assert.equal(main.querySelectorAll('.ku-setup-step').length, steps.length);
    assert.match(main.textContent, /Выберите свою персону/);
    assert.equal(main.querySelectorAll('.ku-setup-step.done').length, 1, 'only the persona is done');
    [...main.querySelectorAll('.ku-setup-step')][1].querySelector('button').click();
    await flush();
    assert.match(shadow.querySelector('main').textContent, /Персонажи/, 'the page of the characters opens');
  } finally { studio.destroy?.(); }
});
