import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  LOOK_BLOCKS, cleanModelText, describePrompt, lookMemory, lookSettings, putLookBlock, readLookBlock, removeLookBlock, translatePrompt,
} from '../src/pud/core/persona-look.js';
import { forgetPersona } from '../src/pud/core/personas.js';
import { migrateSettings } from '../src/pud/core/settings.js';
import { startPersonaLook } from '../src/pud/ui/persona-look.js';

test('запрос на описание: только постоянное, пожелания главнее картинки, голос по желанию и без словечек', () => {
  const plain = describePrompt({});
  assert.match(plain, /PERMANENT APPEARANCE/);
  assert.match(plain, /Leave out everything that changes: clothes/);
  assert.match(plain, /in Russian/);
  assert.doesNotMatch(plain, /VOICE/);
  assert.doesNotMatch(plain, /wishes/);
  const full = describePrompt({ wishes: 'рост 156, веснушки', voice: true, voiceWishes: 'низкий голос', name: 'Судзу' });
  assert.match(full, /The user's wishes about the appearance\. They are facts[^\n]*:\nрост 156, веснушки/);
  assert.match(full, /VOICE: how it sounds in different moments/);
  assert.match(full, /Do not give catchphrases, speech quirks, example lines or quotes/);
  assert.match(full, /wishes about the voice:\nнизкий голос/);
  assert.match(full, /«Судзу»/);
  assert.match(full, /win over the picture/);
  assert.doesNotMatch(describePrompt({ voice: false, voiceWishes: 'тихий' }), /тихий/, 'пожелания к голосу без голоса не идут');
});

test('перевод: факты сохраняются, текст компактный, имена латиницей', () => {
  const prompt = translatePrompt('Невысокая, с веснушками.');
  assert.match(prompt, /from Russian into English/);
  assert.match(prompt, /fewest words that lose nothing/);
  assert.match(prompt, /Hepburn/);
  assert.match(prompt, /Невысокая, с веснушками\.$/);
});

test('ответ модели очищается: размышления, ограждения кода, вступления, кавычки', () => {
  assert.equal(cleanModelText('<think>ну…</think>\n\nНевысокая, с веснушками.'), 'Невысокая, с веснушками.');
  assert.equal(cleanModelText('```\nНевысокая.\n```'), 'Невысокая.');
  assert.equal(cleanModelText('Вот описание:\n\nНевысокая.'), 'Невысокая.');
  assert.equal(cleanModelText('Here is the translation:\n\nShe is short.'), 'She is short.');
  assert.equal(cleanModelText('«Невысокая.»'), 'Невысокая.');
  assert.equal(cleanModelText(null), '');
});

test('блок внешности: добавляется в конец, заменяется на месте на любом языке, убирается, остальное не трогает', () => {
  const base = 'Дерзкая и тихая.\n\nРаботает в баре.';
  const first = putLookBlock(base, 'Short, freckled.', 'en');
  assert.equal(first, `${base}\n\n[Appearance]\nShort, freckled.\n[/Appearance]`);
  assert.equal(readLookBlock(first), 'Short, freckled.');
  // повторно: заменяется, а не дублируется
  const again = putLookBlock(first, 'Short, fanged.', 'en');
  assert.equal(again.match(/\[Appearance\]/g).length, 1);
  assert.match(again, /Short, fanged\./);
  // русский блок заменяет английский (на месте), хвост остаётся
  const mixed = `Начало.\n\n${LOOK_BLOCKS.en.open}\nOld.\n${LOOK_BLOCKS.en.close}\n\nКонец.`;
  const ru = putLookBlock(mixed, 'Невысокая.', 'ru');
  assert.equal(ru, 'Начало.\n\n[Внешность]\nНевысокая.\n[/Внешность]\n\nКонец.');
  assert.equal(readLookBlock(ru), 'Невысокая.');
  // лишние копии убираются
  const doubled = `${first}\n\n[Внешность]\nСтарая.\n[/Внешность]`;
  const one = putLookBlock(doubled, 'New.', 'en');
  assert.equal((one.match(/\[Appearance\]|\[Внешность\]/g) ?? []).length, 1);
  assert.equal(removeLookBlock(first), base);
  assert.equal(removeLookBlock(base), base);
  assert.equal(putLookBlock('', 'Text.', 'en'), '[Appearance]\nText.\n[/Appearance]');
  assert.equal(readLookBlock('нет блока'), '');
});

test('настройки и память: профиль по умолчанию, мусор чинится, у удалённой персоны память забывается', () => {
  assert.deepEqual(lookSettings(null), { mode: 'profile', profileId: '', maxTokens: 5000 });
  assert.deepEqual(lookSettings({ mode: 'nope', profileId: 5, maxTokens: 99999 }), { mode: 'profile', profileId: '', maxTokens: 32000 });
  assert.equal(lookSettings({ mode: 'main' }).mode, 'main');
  assert.deepEqual(lookMemory({ wishes: ' рост 156 ', voice: 'да', ru: 'текст' }), { wishes: 'рост 156', voice: false, voiceWishes: '', ru: 'текст', en: '' });
  const settings = migrateSettings({});
  assert.deepEqual(settings.personaLook, { mode: 'profile', profileId: '', maxTokens: 5000 });
  settings.personaLooks['suzu.png'] = { ru: 'x' };
  forgetPersona(settings, 'suzu.png');
  assert.equal(settings.personaLooks['suzu.png'], undefined);
});

// ---- окно ----

const frame = () => new Promise(resolve => setTimeout(resolve, 20));

function setup({ description = 'Дерзкая и тихая.', look = {}, power: powerOverride } = {}) {
  const { document } = new JSDOM('<body class="pud-on"></body>', { pretendToBeVisual: true }).window;
  const power = powerOverride ?? { personas: { 'suzu.png': 'Хайтани Судзу' }, persona_descriptions: { 'suzu.png': { description } } };
  const calls = [];
  const api = {
    ready: async () => {},
    power: () => power,
    imageUrl: avatar => `User Avatars/${avatar}`,
    update: async (avatar, patch) => { calls.push(['update', avatar, patch]); Object.assign(power.persona_descriptions[avatar], patch); },
  };
  const fakeLook = {
    listProfiles: () => [{ id: 'p1', name: 'Gemini' }, { id: 'p2', name: 'Claude' }],
    pictureDataUrl: async (doc, source) => { calls.push(['picture', typeof source === 'string' ? source : 'file']); return 'data:image/png;base64,AAAA'; },
    askAboutPicture: async (context, settings, dataUrl, prompt) => { calls.push(['ask', settings, dataUrl, prompt]); return 'Невысокая, с веснушками и клыками.'; },
    askText: async (context, settings, prompt) => { calls.push(['translate', settings, prompt]); return 'Short, with freckles and fangs.'; },
    ...look,
  };
  const settings = migrateSettings({});
  const toasts = [];
  globalThis.toastr = { success: text => toasts.push(['success', text]), error: text => toasts.push(['error', text]), info() {} };
  const ui = startPersonaLook(document, { context: {}, settings, save() {}, api, look: fakeLook });
  return { document, ui, api, calls, settings, power, toasts };
}

test('окно: описать по аватару с пожеланиями, поправить, одобрить и перевести, вставить английский в блок', async () => {
  const { document, ui, calls, settings, power } = setup();
  ui.open('suzu.png');
  const win = document.querySelector('.pud-plook');
  assert.equal(win.hidden, false);
  assert.match(win.querySelector('.pud-look-who').textContent, /Хайтани Судзу/);
  assert.equal(win.querySelector('.pud-look-pic img').getAttribute('src'), 'User Avatars/suzu.png');
  assert.match(win.textContent, /блока внешности ещё нет/);
  // модель: профили, первый выбран, «как у таверны» есть
  const model = win.querySelector('[data-field="model"]');
  assert.deepEqual([...model.options].map(option => option.value), ['profile:p1', 'profile:p2', 'main']);
  model.value = 'profile:p2';
  model.dispatchEvent(new document.defaultView.Event('change'));
  assert.deepEqual([settings.personaLook.mode, settings.personaLook.profileId], ['profile', 'p2']);

  const wishes = win.querySelector('[data-field="wishes"]');
  wishes.value = 'рост 156, веснушки, клыки';
  wishes.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  const voice = win.querySelector('[data-field="voice"]');
  assert.equal(win.querySelector('[data-voice-wishes]').hidden, true);
  voice.checked = true;
  voice.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  assert.equal(win.querySelector('[data-voice-wishes]').hidden, false);

  win.querySelector('[data-act="describe"]').click();
  await frame();
  const ask = calls.find(call => call[0] === 'ask');
  assert.equal(ask[1].profileId, 'p2');
  assert.equal(ask[2], 'data:image/png;base64,AAAA');
  assert.match(ask[3], /рост 156, веснушки, клыки/);
  assert.match(ask[3], /VOICE/);
  const ru = win.querySelector('[data-text="ru"]');
  assert.equal(ru.value, 'Невысокая, с веснушками и клыками.');
  assert.equal(win.querySelector('[data-act="put-en"]').disabled, true, 'английского ещё нет');
  assert.equal(win.querySelector('[data-text="en"]').value, '');

  // поправили руками, одобрили, перевели
  ru.value = 'Невысокая, с веснушками, клыками и шрамом на брови.';
  ru.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  win.querySelector('[data-act="translate"]').click();
  await frame();
  assert.match(calls.find(call => call[0] === 'translate')[2], /шрамом на брови/);
  assert.equal(win.querySelector('[data-text="en"]').value, 'Short, with freckles and fangs.');
  assert.match(win.querySelector('[data-count="en"]').textContent, /знаков/);

  // вставка в описание: блок в конце, остальное цело
  win.querySelector('[data-act="put-en"]').click();
  await frame();
  assert.equal(power.persona_descriptions['suzu.png'].description, 'Дерзкая и тихая.\n\n[Appearance]\nShort, with freckles and fangs.\n[/Appearance]');
  assert.match(win.textContent, /блок внешности: вставка заменит его/);
  // и память сохранилась
  assert.equal(settings.personaLooks['suzu.png'].wishes, 'рост 156, веснушки, клыки');
  assert.equal(settings.personaLooks['suzu.png'].voice, true);
  assert.equal(settings.personaLooks['suzu.png'].en, 'Short, with freckles and fangs.');
  // повторное описание новое: старый перевод сбрасывается, а блок заменяется только при вставке
  win.querySelector('[data-act="describe"]').click();
  await frame();
  assert.equal(win.querySelector('[data-text="en"]').value, '', 'перевод относился к прежнему тексту');
  win.querySelector('[data-act="put-ru"]').click();
  await frame();
  const description = power.persona_descriptions['suzu.png'].description;
  assert.equal((description.match(/\[Appearance\]|\[Внешность\]/g) ?? []).length, 1);
  assert.match(description, /\[Внешность\]\nНевысокая, с веснушками и клыками\.\n\[\/Внешность\]/);
  // убрать блок
  win.querySelector('[data-act="remove"]').click();
  await frame();
  assert.equal(power.persona_descriptions['suzu.png'].description, 'Дерзкая и тихая.');
  ui.destroy();
});

test('окно: другая картинка только на этот раз; ошибка модели показана и ничего не ломает', async () => {
  const failing = { askAboutPicture: async () => { throw new Error('Модель не видит картинки.'); } };
  const { document, ui, calls, toasts } = setup({ look: failing });
  ui.open('suzu.png');
  const win = document.querySelector('.pud-plook');
  const input = win.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new document.defaultView.File(['x'], 'pic.png', { type: 'image/png' })], configurable: true });
  input.dispatchEvent(new document.defaultView.Event('change'));
  await frame();
  assert.deepEqual(calls.find(call => call[0] === 'picture'), ['picture', 'file']);
  assert.equal(win.querySelector('.pud-look-pic img').getAttribute('src'), 'data:image/png;base64,AAAA');
  assert.equal(win.querySelector('[data-act="reset"]').hidden, false);
  win.querySelector('[data-act="describe"]').click();
  await frame();
  assert.match(win.querySelector('[data-status]').textContent, /Модель не видит картинки/);
  assert.equal(toasts.at(-1)[0], 'error');
  assert.equal(win.querySelector('[data-text="ru"]').value, '');
  assert.equal(win.querySelector('[data-act="describe"]').disabled, false, 'кнопка снова доступна');
  win.querySelector('[data-act="reset"]').click();
  assert.equal(win.querySelector('.pud-look-pic img').getAttribute('src'), 'User Avatars/suzu.png');
  ui.destroy();
});

test('окно: нет профилей: остаётся «как у таверны»; у персоны уже есть блок: об этом сказано', async () => {
  const { document, ui } = setup({ description: 'Текст.\n\n[Внешность]\nСтарая.\n[/Внешность]', look: { listProfiles: () => [] } });
  ui.open('suzu.png');
  const win = document.querySelector('.pud-plook');
  assert.deepEqual([...win.querySelector('[data-field="model"]').options].map(option => option.value), ['main']);
  assert.match(win.textContent, /Профилей подключения нет/);
  assert.match(win.textContent, /блок внешности: вставка заменит его/);
  assert.equal(win.querySelector('[data-act="remove"]').disabled, false);
  ui.destroy();
});
