import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { barItems, chipKey, plainName, setLabel, togglePin } from '../src/pud/core/chips.js';
import { currentSet, readPrompts, togglePrompt } from '../src/pud/integration/prompts.js';
import { BAR_ID, startChips } from '../src/pud/ui/chips.js';
import { migrateSettings } from '../src/pud/core/settings.js';

test('название без эмодзи в начале', () => {
  assert.equal(plainName('🧠 Think | GEMINI 3.7 / 3.8'), 'Think | GEMINI 3.7 / 3.8');
  assert.equal(plainName('⚔️ Anti-Slop'), 'Anti-Slop');
  assert.equal(plainName('18+'), '18+');
  assert.equal(plainName('🔥18+'), '18+');
});

test('закрепление, подпись и порядок кнопок; наборы разных профилей не смешиваются', () => {
  const settings = migrateSettings({});
  const gemini = chipKey('NoriMyn', 'p-gemini');
  const claude = chipKey('NoriMyn', 'p-claude');
  assert.equal(togglePin(settings, gemini, 'think'), true);
  togglePin(settings, gemini, 'slop');
  setLabel(settings, gemini, 'think', 'Думай');
  togglePin(settings, claude, 'nsfw');
  const prompts = [{ id: 'slop', name: '⚔️ Anti-Slop', enabled: true }, { id: 'think', name: '🧠 Think', enabled: false }, { id: 'nsfw', name: '🔥 18+', enabled: true }];
  assert.deepEqual(barItems(settings, gemini, prompts).map(item => [item.id, item.label, item.enabled]), [['think', 'Думай', false], ['slop', 'Anti-Slop', true]]);
  assert.deepEqual(barItems(settings, claude, prompts).map(item => item.id), ['nsfw']);
  assert.equal(togglePin(settings, claude, 'nsfw'), false);
  assert.equal(settings.chips[claude], undefined, 'пустой набор не хранится');
});

test('закреплённый тоггл, которого нет в пресете, не показывается', () => {
  const settings = migrateSettings({ chips: { 'A::': [{ id: 'gone', label: '' }] } });
  assert.deepEqual(barItems(settings, 'A::', [{ id: 'x', name: 'X', enabled: true }]), []);
});

test('подпись обрезается до 24 знаков и не трогает незакреплённые', () => {
  const settings = migrateSettings({});
  assert.equal(setLabel(settings, 'A::', 'x', 'что-то'), false);
  togglePin(settings, 'A::', 'x');
  setLabel(settings, 'A::', 'x', 'очень-очень-очень-длинная-подпись');
  assert.equal(settings.chips['A::'][0].label.length, 24);
});

/** Мини-таверна: список Prompt Manager с тумблерами, которые переключаются по клику, как настоящие. */
function tavern() {
  const win = new JSDOM(`<!doctype html><body>
    <div id="sheld"><div id="chat"></div></div>
    <div id="completion_prompt_manager"><ul id="completion_prompt_manager_list">
      <li class="completion_prompt_manager_prompt" data-pm-identifier="think"><span class="completion_prompt_manager_prompt_name">🧠 Think</span><span class="prompt-manager-toggle-action fa-solid fa-toggle-on"></span></li>
      <li class="completion_prompt_manager_prompt" data-pm-identifier="slop"><span class="completion_prompt_manager_prompt_name">Anti-Slop</span><span class="prompt-manager-toggle-action fa-solid fa-toggle-off"></span></li>
      <li class="completion_prompt_manager_prompt" data-pm-identifier="chatHistory"><span class="completion_prompt_manager_prompt_name">Chat History</span></li>
    </ul></div></body>`, { pretendToBeVisual: true }).window;
  for (const toggle of win.document.querySelectorAll('.prompt-manager-toggle-action')) {
    toggle.addEventListener('click', () => { toggle.classList.toggle('fa-toggle-on'); toggle.classList.toggle('fa-toggle-off'); });
  }
  return win;
}
const context = {
  mainApi: 'openai',
  chatCompletionSettings: { preset_settings_openai: 'NoriMyn', prompts: [{ identifier: 'think', name: '🧠 Think | GEMINI' }] },
  extensionSettings: { connectionManager: { selectedProfile: 'p1', profiles: [{ id: 'p1', name: 'Gemini Pro' }] } },
  eventTypes: {},
};
const frame = () => new Promise(resolve => setTimeout(resolve, 40));

test('тогглы читаются из списка Prompt Manager, маркеры без тумблера пропускаются', () => {
  const { document } = tavern();
  assert.deepEqual(readPrompts(document, context), [
    { id: 'think', name: '🧠 Think | GEMINI', enabled: true },
    { id: 'slop', name: 'Anti-Slop', enabled: false },
  ]);
  assert.equal(togglePrompt(document, 'slop'), true);
  assert.equal(readPrompts(document, context)[1].enabled, true);
  assert.equal(togglePrompt(document, 'nope'), false);
  assert.deepEqual(currentSet(context), { key: 'NoriMyn::p1', preset: 'NoriMyn', profileId: 'p1', profileName: 'Gemini Pro' });
});

test('полоска над чатом: появляется после закрепления, кнопка переключает родной тоггл, откат убирает всё', async () => {
  const { document } = tavern();
  const settings = migrateSettings({});
  let saves = 0;
  const tabs = [];
  const hub = { addTab: (id) => { const pane = document.createElement('section'); document.body.append(pane); tabs.push(id); return { pane, remove: () => pane.remove() }; }, open() {} };
  const undo = startChips(document, { context, settings, save: () => { saves++; }, hub });
  const bar = document.getElementById(BAR_ID);
  assert.equal(bar.nextElementSibling.id, 'chat', 'полоска стоит прямо над чатом');
  assert.equal(bar.hidden, true, 'пока ничего не закреплено, полоски нет');
  assert.deepEqual(tabs, ['chips']);

  document.querySelector('.pud-tg[data-id="think"] .pud-tg-pin').click();
  assert.equal(saves, 1);
  assert.equal(bar.hidden, false);
  const chip = bar.querySelector('.pud-chip[data-id="think"]');
  assert.equal(chip.textContent.trim(), 'Think | GEMINI');
  assert.ok(chip.classList.contains('on'));

  chip.click();
  await frame();
  assert.ok(!bar.querySelector('.pud-chip[data-id="think"]').classList.contains('on'), 'кнопка показывает новое состояние тоггла');
  assert.ok(document.querySelector('[data-pm-identifier="think"] .fa-toggle-off'), 'переключился родной тоггл');

  const input = document.querySelector('.pud-tg[data-id="think"] .pud-tg-label');
  input.value = 'Думай';
  input.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  assert.equal(bar.querySelector('.pud-chip-label').textContent, 'Думай');
  assert.equal(settings.chips['NoriMyn::p1'][0].label, 'Думай');

  undo();
  assert.equal(document.getElementById(BAR_ID), null);
});

test('с другим API полоска прячется', () => {
  const { document } = tavern();
  const settings = migrateSettings({ chips: { 'NoriMyn::p1': [{ id: 'think', label: '' }] } });
  const undo = startChips(document, { context: { ...context, mainApi: 'textgenerationwebui' }, settings, save() {} });
  assert.equal(document.getElementById(BAR_ID).hidden, true);
  undo();
});
