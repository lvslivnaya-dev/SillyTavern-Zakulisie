import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="chat">
    <div class="mes" mesid="3"><div class="mes_block"><div class="mes_text">Раньше</div></div></div>
    <div class="mes" mesid="4"><div class="mes_block"><div class="mes_text">Ты же была в подворотне?</div><div class="mes_bias"></div></div></div>
  </div>
  <div id="form_sheld"><div id="send_form"><textarea id="send_textarea"></textarea></div></div>
</body></html>`);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
const { mountChatOverlay, extraPanes, mediaSection } = await import('../src/integration/chat-overlay.js');

const view = (overrides = {}) => ({
  chips: true,
  cast: [
    { id: 'm', name: 'Майки', present: true, persona: false },
    { id: 's', name: 'Судзу', present: true, persona: true },
    { id: 'r', name: 'Ран', present: false, persona: false },
  ],
  location: 'гараж',
  leaks: [{ messageIndex: 4, entityId: 'm', eventId: 'alley', name: 'Майки', eventText: 'Разговор в подворотне', quote: 'Ты же была в подворотне?', canSwipe: true }],
  ...overrides,
});

const tileOf = (bar, name) => [...bar.querySelectorAll('.ku-tile')].find(item => item.querySelector('.ku-tile-name').textContent === name);

test('the drawer is a side panel: a rail on the wall always, the panel beside it only when opened', () => {
  const toggles = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: open => toggles.push(open) });
  try {
    overlay.render(view());
    const bar = document.getElementById('ku-scene-chips');
    assert.equal(bar.parentElement, document.body, 'it hangs on the browser, not above the message box');
    assert.ok(bar.classList.contains('ku-side'));
    assert.equal(bar.classList.contains('open'), false);
    assert.equal(bar.querySelectorAll('.ku-chip').length, 0, 'closed: the panel is empty, only the rail');
    assert.ok(bar.querySelector('.ku-rail .ku-rail-toggle'), 'the rail has its fold button');
    assert.match(tileOf(bar, 'Сцена').textContent, /2 на сцене/, 'the tabs are on the rail even when the panel is folded');
    bar.querySelector('.ku-rail-toggle').click();
    assert.deepEqual(toggles, [true], 'the rail button unfolds the panel');
    tileOf(bar, 'Сцена').click();
    assert.deepEqual(toggles, [true, true], 'a tab pressed on a folded panel unfolds it on that tab');
    overlay.render(view({ director: { open: true } }));
    const chips = [...bar.querySelectorAll('.ku-chip')];
    assert.deepEqual(chips.map(chip => chip.querySelector('.ku-chip-name').textContent), ['Майки', 'Судзу', 'Ран']);
    assert.equal(chips[2].classList.contains('on'), false);
    assert.equal(bar.querySelector('.ku-tile-stack'), null, 'time and place are in «Сцена» now: the rail keeps only the secrets strip, when there are secrets');
    assert.match(bar.querySelector('.ku-dir-head').textContent, /Сцена/, 'the head names the tab');
    assert.match(bar.querySelector('.ku-dir-head').textContent, /гараж/, 'the place of the scene stays in the head');
    // Open: clicking the head or a chip does not fold it; the rail button and the tab that is already on do.
    bar.querySelector('.ku-dir-head').click();
    chips[0].click();
    assert.deepEqual(toggles, [true, true]);
    bar.querySelector('.ku-rail-toggle').click();
    assert.deepEqual(toggles, [true, true, false]);
    tileOf(bar, 'Сцена').click();
    assert.deepEqual(toggles, [true, true, false, false], 'the same tab again folds the panel into the rail');
  } finally { overlay.unmount(); }
  assert.equal(document.getElementById('ku-scene-chips'), null, 'unmount cleans up');
});

test('the drawer goes away when no chat is open (the main page), and comes back with a chat', () => {
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {} });
  try {
    overlay.render(view({ chatId: 'chat-1' }));
    assert.ok(document.getElementById('ku-scene-chips'));
    overlay.render(view({ chatId: '' }));
    assert.equal(document.getElementById('ku-scene-chips'), null);
    overlay.render(view({ chatId: 'chat-1' }));
    assert.ok(document.getElementById('ku-scene-chips'));
  } finally { overlay.unmount(); }
});

test('a leak note goes right under the reply text, with its answers', () => {
  const actions = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: (action, payload) => actions.push([action, payload]) });
  try {
    overlay.render(view());
    const block = document.querySelector('.mes[mesid="4"] .mes_block');
    const note = block.querySelector('.ku-leak');
    assert.equal(note.previousElementSibling.className, 'mes_text');
    assert.match(note.textContent, /Майки ведёт себя так, будто знает: «Разговор в подворотне»/);
    assert.equal(document.querySelectorAll('.ku-leak').length, 1, 'only on that reply');
    for (const label of ['Свайп', 'Он знает', 'Не утечка']) [...note.querySelectorAll('button')].find(button => button.textContent === label).click();
    const payload = { messageIndex: 4, entityId: 'm', eventId: 'alley' };
    assert.deepEqual(actions, [['swipe', payload], ['knows', payload], ['dismiss', payload]]);
    overlay.render(view({ leaks: [] }));
    assert.equal(document.querySelectorAll('.ku-leak').length, 0, 'a resolved leak disappears');
  } finally { overlay.unmount(); }
});

test('no swipe button on an older reply; chips hidden when switched off', () => {
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {} });
  try {
    overlay.render(view({ chips: false, leaks: [{ ...view().leaks[0], canSwipe: false }] }));
    assert.equal(document.getElementById('ku-scene-chips'), null);
    const labels = [...document.querySelectorAll('.ku-leak button')].map(button => button.textContent);
    assert.deepEqual(labels, ['Он знает', 'Не утечка']);
  } finally { overlay.unmount(); }
});

test('names and quotes from the chat are text, never HTML', () => {
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {} });
  try {
    const evil = '<img src=x onerror="globalThis.pwned=1">';
    overlay.render(view({
      director: { open: true },
      cast: [{ id: 'x', name: evil, present: true, persona: false }],
      leaks: [{ messageIndex: 4, entityId: 'x', eventId: 'e', name: evil, eventText: evil, quote: evil, canSwipe: false }],
    }));
    assert.equal(document.querySelector('#ku-scene-chips img'), null);
    assert.equal(document.querySelector('.ku-leak img'), null);
    assert.match(document.querySelector('.ku-chip-name').textContent, /<img/);
  } finally { overlay.unmount(); }
});

test('director: a chip opens its menu; a kick is armed with the chosen wait; the menu folds after', async () => {
  const cues = [];
  const describe = id => ({
    name: { m: 'Майки', r: 'Ран' }[id], persona: false, present: id === 'm',
    reactTargets: [{ id: 's', name: 'Судзу' }],
    lines: [{ targetId: 's', targetName: 'Судзу', factors: [{ label: 'Заступается', text: 'Заступается: • при всех' }] }],
    secrets: [{ eventId: 'e1', label: 'Сломанная рука', text: 'Сломанная рука — давно' }],
  });
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, describe, onCue: cue => { cues.push(cue); return true; } });
  try {
    const open = view({ director: { open: true, cues: [], others: [{ id: 'k', name: 'Какучо' }] } });
    overlay.render(open);
    const bar = document.getElementById('ku-scene-chips');
    const click = label => [...bar.querySelectorAll('button')].find(button => button.textContent.startsWith(label)).click();
    bar.querySelector('.ku-chip[data-entity-id="m"]').click();
    assert.ok(bar.querySelector('.ku-dir-card'), 'the menu of Майки');
    click('через 2');
    click('👟 Вступить');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(cues.at(-1), { kind: 'enter', entityId: 'm', wait: 2 });
    assert.equal([...bar.querySelectorAll('button')].some(button => button.textContent.startsWith('👟 Вступить')), false, 'the menu of the hero folds after a kick');

    bar.querySelector('.ku-chip[data-entity-id="m"]').click();
    click('❤ Двинуть');
    click('Заступается');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(cues.at(-1), { kind: 'factor', entityId: 'm', targetId: 's', text: 'Заступается: • при всех', label: 'Заступается', wait: 0 });

    bar.querySelector('.ku-chip[data-entity-id="m"]').click();
    click('✍ Своё');
    const input = bar.querySelector('[data-ku-field="custom"]');
    input.value = 'пусть приревнует';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    overlay.render(open);
    assert.equal(bar.querySelector('[data-ku-field="custom"]').value, 'пусть приревнует', 'a re-render keeps what is typed');
    bar.querySelector('[data-ku-field="custom"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(cues.at(-1), { kind: 'custom', entityId: 'm', text: 'пусть приревнует', wait: 0 });

    // Someone off stage: only «call» and the quiet mark.
    bar.querySelector('.ku-chip[data-entity-id="r"]').click();
    assert.equal([...bar.querySelectorAll('.ku-dir-card button')].some(button => button.textContent.includes('Вступить')), false);
    click('🚪 Позвать');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(cues.at(-1).kind, 'call');
  } finally { overlay.unmount(); }
});

test('director: queue tags can be taken back; Alt+digit kicks the n-th on stage', () => {
  const removed = [];
  const cues = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onRemoveCue: id => removed.push(id), onCue: cue => cues.push(cue) });
  try {
    overlay.render(view({ director: { open: true, hotkeys: true, cues: [{ id: 'c1', kind: 'hold', entityId: 'm', label: 'Майки молчит', badge: '🤐', used: true, wait: 0 }] } }));
    tileOf(document.getElementById('ku-scene-chips'), 'Что уходит').click();
    const tag = document.querySelector('.ku-dir-tag');
    assert.match(tag.textContent, /Майки молчит ✓/);
    tag.querySelector('button').click();
    assert.deepEqual(removed, ['c1']);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Digit1', altKey: true, bubbles: true }));
    assert.deepEqual(cues, [{ kind: 'enter', entityId: 'm', wait: 0 }], 'Alt+1 → Майки (the persona is skipped)');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Digit2', altKey: true, bubbles: true }));
    assert.equal(cues.length, 1, 'Alt+2: the persona and the absent are not counted');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Digit1', altKey: true, ctrlKey: true, bubbles: true }));
    assert.equal(cues.length, 1, 'AltGr (Ctrl+Alt) is not a hotkey');
  } finally { overlay.unmount(); }
});

test('director: «🎬 Новый кадр» collects text, time, place and cast; «Сейчас» sends right after', async () => {
  const cues = [];
  let kicked = 0;
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onCue: cue => { cues.push(cue); return true; }, onKickNow: () => { kicked += 1; } });
  try {
    const open = view({ director: { open: true, cues: [], places: [{ id: 'deck', name: 'Палуба' }], people: [{ id: 'm', name: 'Майки' }, { id: 'r', name: 'Ран' }] } });
    overlay.render(open);
    const bar = document.getElementById('ku-scene-chips');
    const click = label => [...bar.querySelectorAll('button')].find(button => button.textContent.startsWith(label)).click();
    tileOf(bar, 'Новый кадр').click();
    const text = bar.querySelector('[data-ku-field="scene"]');
    text.value = 'утро после драки';
    text.dispatchEvent(new window.Event('input', { bubbles: true }));
    click('на следующий день');
    const select = bar.querySelector('[data-ku-field="place-id"]');
    select.value = 'deck';
    select.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(bar.querySelector('[data-ku-field="place"]').value, 'Палуба', 'the chosen place fills the words');
    bar.querySelector('[data-ku-action="dir-cast"][data-entity-id="r"]').click();
    assert.equal(bar.querySelector('[data-ku-field="scene"]').value, 'утро после драки', 'kept through re-renders');
    click('▶ Сейчас');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(cues.at(-1), { kind: 'scene', text: 'утро после драки', skip: 'nextday', castIds: ['r'], placeId: 'deck', place: 'Палуба', wait: 0 });
    assert.equal(kicked, 1);
    assert.equal(bar.querySelector('[data-ku-field="scene"]'), null, 'the card folds after');

    tileOf(bar, 'Рассказчику / повторы').click();
    const note = bar.querySelector('[data-ku-field="note"]');
    note.value = 'короче';
    note.dispatchEvent(new window.Event('input', { bubbles: true }));
    note.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(cues.at(-1), { kind: 'note', text: 'короче', wait: 0 });
    assert.equal(kicked, 1, 'a note waits for the post');
  } finally { overlay.unmount(); }
});

test('the drawer has the scene type: three buttons when open, a mark when closed and not calm', async () => {
  const modes = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onSceneMode: mode => { modes.push(mode); } });
  try {
    overlay.render(view({ sceneMode: 'intim', director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    assert.ok(bar.querySelector('.ku-dir-mode'), 'the choice is in «Сцена», with the time and the heat');
    assert.equal(tileOf(bar, 'Тип'), undefined, 'no tile of its own any more');
    const buttons = [...bar.querySelectorAll('.ku-dir-mode .ku-dir-btn')];
    assert.deepEqual(buttons.map(item => item.textContent), ['☕ Быт', '⚔ Бой', '🔥 Близость']);
    assert.deepEqual(buttons.map(item => item.getAttribute('aria-pressed')), ['false', 'false', 'true']);
    buttons[1].click();
    await Promise.resolve();
    assert.deepEqual(modes, ['fight']);
    overlay.render(view({ sceneMode: 'intim' }));
    assert.match(bar.querySelector('.ku-dir-head').textContent, /🔥 Близость/);
    overlay.render(view({ sceneMode: 'calm' }));
    assert.doesNotMatch(bar.querySelector('.ku-dir-head').textContent, /Быт/);
  } finally { overlay.unmount(); }
});

test('the drawer has the weather: a badge when closed, kind buttons and a lock when open', async () => {
  const sent = [];
  const opened = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onWeather: payload => { sent.push(payload); }, onOpenStudio: tab => opened.push(tab) });
  try {
    overlay.render(view({ weather: { kind: 'rain', temp: 14, source: 'forecast', badge: '🌧 14°' } }));
    const bar = document.getElementById('ku-scene-chips');
    assert.match(bar.querySelector('.ku-dir-head').textContent, /🌧 14°/);
    overlay.render(view({ weather: { kind: 'rain', temp: 14, source: 'forecast', badge: '🌧 14°' }, director: { open: true } }));
    assert.match(tileOf(bar, 'Календарь / погода').textContent, /14° дождь/);
    tileOf(bar, 'Календарь / погода').click();
    const weatherButtons = () => [...bar.querySelectorAll('.ku-dir-weather .ku-dir-btn')];
    const buttons = weatherButtons();
    assert.equal(buttons.filter(item => item.getAttribute('aria-pressed') === 'true').length, 1, 'only the current kind is pressed (the lock is not)');
    buttons.find(item => /^Снег/.test(item.title)).click();
    await Promise.resolve();
    assert.deepEqual(sent.at(-1), { kind: 'snow', temp: '', text: '', lock: false, from: 0, days: 1 });
    weatherButtons().find(item => item.textContent === '🔓 Держать').click();
    await Promise.resolve();
    assert.deepEqual(sent.at(-1), { kind: 'rain', temp: 14, lock: true });
    weatherButtons().find(item => item.dataset.kuAction === 'studio' && item.dataset.tab === 'calendar').click();
    assert.deepEqual(opened, ['calendar']);
    overlay.render(view({ weather: { kind: 'rain', temp: 14, source: 'lock', badge: '🌧 14°' }, director: { open: true } }));
    assert.ok([...bar.querySelectorAll('.ku-dir-weather .ku-dir-btn')].find(item => item.textContent === '🔒 Держится'));
  } finally { overlay.unmount(); }
});

test('the event card has ready genres; one press arms an event cue with the genre', async () => {
  const cues = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onCue: cue => { cues.push(cue); return true; } });
  try {
    overlay.render(view({ director: { open: true, cues: [] } }));
    const bar = document.getElementById('ku-scene-chips');
    tileOf(bar, 'Новый кадр').click();
    const genres = [...bar.querySelectorAll('.ku-dir-genres .ku-dir-btn:not([data-ku-action="dir-plan-genre"])')];
    assert.deepEqual(genres.map(item => item.textContent.replace(/^\S+\s/, '')), ['Что-нибудь случится', 'Драка', 'Конфликт', 'Драма', 'Резня', 'Изнасилование', 'Насилие', 'Психологическое давление']);
    genres.find(item => /Драма/.test(item.textContent)).click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(cues.at(-1).kind, 'event');
    assert.equal(cues.at(-1).genre, 'drama');
    assert.equal(cues.at(-1).entityId, undefined, 'about the whole reply');
  } finally { overlay.unmount(); }
});

test('«Сцена» holds the clock: type the time or shift it, and it is saved through the callback', async () => {
  const saved = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onSetTime: payload => { saved.push(payload); return true; } });
  try {
    overlay.render(view({ clock: { time: '23:30', day: 3, label: 'вторник' }, director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    const time = bar.querySelector('[data-ku-field="clock-time"]');
    assert.deepEqual([time.value, bar.querySelector('[data-ku-field="clock-day"]').value, bar.querySelector('[data-ku-field="clock-label"]').value], ['23:30', '3', 'вторник']);
    time.value = '07:05';
    time.dispatchEvent(new window.Event('input', { bubbles: true }));
    [...bar.querySelectorAll('.ku-dir-time button')].find(item => item.textContent === 'Сохранить').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(saved.at(-1), { time: '07:05', day: '3', label: 'вторник' });
    // «+1 ч» past midnight goes to the next day.
    [...bar.querySelectorAll('.ku-dir-time button')].find(item => item.textContent === '+1 ч').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(saved.at(-1), { time: '00:30', day: '4', label: 'вторник' });
  } finally { overlay.unmount(); }
});

test('the dice appear in «Сцена» only in an intimate scene; options are chips, the chosen ones burn, your own can be added', async () => {
  const calls = [];
  const groups = [
    { id: 'initiative', label: 'Кто ведёт', icon: '👑', multi: false, options: [{ id: 'npc:ran', text: 'ведёт Ран' }, { id: 'npc:mikey', text: 'ведёт Майки' }] },
    { id: 'act', label: 'Тип секса', icon: '🔥', multi: true, options: [{ id: 'vaginal', text: 'вагинальный' }, { id: 'oral-asks', text: 'оральный: просит персону' }, { id: 'oral-demands', text: 'оральный: требует от персоны, нажимает' }] },
  ];
  const dice = (picks, extra = {}) => ({ groups, picks, locked: [], sent: false, ...extra });
  const overlay = mountChatOverlay({
    onTogglePresent: () => {}, onLeak: () => {},
    onDiceRoll: payload => { calls.push(['roll', payload]); },
    onDiceToggle: payload => { calls.push(['pick', payload]); },
    onDiceLock: payload => { calls.push(['lock', payload]); },
    onDiceAdd: payload => { calls.push(['add', payload]); },
    onDiceSend: () => { calls.push(['send']); },
    onDiceClear: () => { calls.push(['clear']); },
  });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    overlay.render(view({ sceneMode: 'calm', dice: null, director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    assert.equal(document.querySelector('#ku-scene-chips .ku-dice-chip'), null, 'no dice in a calm scene');
    overlay.render(view({ sceneMode: 'intim', dice: dice([]), director: { open: true } }));
    const chips = () => [...document.querySelectorAll('#ku-scene-chips .ku-dice-chip')];
    assert.deepEqual(chips().map(chip => chip.textContent), ['ведёт Ран', 'ведёт Майки', 'вагинальный', 'оральный: просит персону', 'оральный: требует от персоны, нажимает']);
    assert.equal(chips().filter(chip => chip.classList.contains('on')).length, 0);
    // The oral options that the persona is asked for and pressed into are there.
    chips()[3].click();
    await settle();
    assert.deepEqual(calls.at(-1), ['pick', { group: 'act', option: 'oral-asks' }]);
    // What came back as chosen burns (two in a multi group).
    overlay.render(view({ sceneMode: 'intim', dice: dice([{ group: 'initiative', id: 'npc:ran', text: 'ведёт Ран' }, { group: 'act', id: 'vaginal', text: 'вагинальный' }, { group: 'act', id: 'oral-asks', text: 'оральный: просит персону' }]), director: { open: true } }));
    assert.deepEqual(chips().filter(chip => chip.classList.contains('on')).map(chip => chip.textContent), ['ведёт Ран', 'вагинальный', 'оральный: просит персону']);
    assert.deepEqual(chips().filter(chip => chip.getAttribute('aria-pressed') === 'true').length, 3);
    // Roll, lock, re-roll a group, send, clear.
    const press = label => [...document.querySelectorAll('#ku-scene-chips .ku-dir-dice button')].find(item => item.textContent.startsWith(label));
    press('🎲 Перебросить').click(); await settle();
    assert.deepEqual(calls.at(-1), ['roll', { only: '' }]);
    [...document.querySelectorAll('#ku-scene-chips .ku-dir-dice-row')][1].querySelector('[data-ku-action="dir-dice-lock"]').click(); await settle();
    assert.deepEqual(calls.at(-1), ['lock', { group: 'act' }]);
    [...document.querySelectorAll('#ku-scene-chips .ku-dir-dice-row')][0].querySelector('[data-ku-action="dir-dice-roll"]').click(); await settle();
    assert.deepEqual(calls.at(-1), ['roll', { only: 'initiative' }]);
    press('▶ Отправить').click(); await settle();
    assert.deepEqual(calls.at(-1), ['send']);
    press('Сбросить').click(); await settle();
    assert.deepEqual(calls.at(-1), ['clear']);
    // Her own option: «+» opens a field, Enter adds it to the group.
    [...document.querySelectorAll('#ku-scene-chips .ku-dir-dice-row')][1].querySelector('[data-ku-action="dir-dice-add-open"]').click();
    const field = document.querySelector('#ku-scene-chips [data-ku-field="dice-add"]');
    field.value = 'с повязкой на глазах';
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    assert.deepEqual(calls.at(-1), ['add', { group: 'act', text: 'с повязкой на глазах' }]);
    assert.equal(document.querySelector('#ku-scene-chips [data-ku-field="dice-add"]'), null, 'the field folds after');
    // A sent roll is shown as sent.
    overlay.render(view({ sceneMode: 'intim', dice: dice([{ group: 'act', id: 'vaginal', text: 'вагинальный' }], { sent: true }), director: { open: true } }));
  } finally { overlay.unmount(); }
});

test('the quests tile lists what is in play: tick the current step, bring it in, open the page', async () => {
  const calls = [];
  const overlay = mountChatOverlay({
    onTogglePresent: () => {}, onLeak: () => {},
    onQuestStep: payload => { calls.push(['step', payload]); },
    onQuestPush: payload => { calls.push(['push', payload]); },
    onOpenStudio: tab => { calls.push(['open', tab]); },
  });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    overlay.render(view({ quests: [], director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    assert.match(tileOf(bar, 'Квесты').textContent, /нет/);
    overlay.render(view({ quests: [{ id: 'q1', name: 'Найти сестру', secret: true, stepId: 's2', step: 'осмотреть склад', progress: '1/3', due: 'осталось 2 дня', pushed: false }], director: { open: true } }));
    assert.match(tileOf(bar, 'Квесты').textContent, /1 идут/);
    tileOf(bar, 'Квесты').click();
    const card = bar.querySelector('.ku-dir-quests');
    assert.match(card.textContent, /🔒 Найти сестру/);
    assert.match(card.textContent, /1\/3 · осталось 2 дня/);
    assert.match(card.textContent, /осмотреть склад/);
    [...card.querySelectorAll('button')].find(item => /Шаг выполнен/.test(item.textContent)).click(); await settle();
    assert.deepEqual(calls.at(-1), ['step', { questId: 'q1', stepId: 's2', done: true }]);
    [...bar.querySelector('.ku-dir-quests').querySelectorAll('button')].find(item => /Ввести сейчас/.test(item.textContent)).click(); await settle();
    assert.deepEqual(calls.at(-1), ['push', { questId: 'q1' }]);
  } finally { overlay.unmount(); }
});

test('a quest guess goes under the reply with Add / No, and answers carry the hint', () => {
  const actions = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onQuestHint: (action, payload) => actions.push([action, payload]) });
  try {
    overlay.render(view({ leaks: [], questHints: [{ messageIndex: 4, id: 'new:тайный долг', title: 'Похоже, началось задание «Тайный долг».', detail: 'надо вернуть Шагов: 1', confirm: 'Добавить квест', confirmTitle: 'Добавить' }] }));
    const note = document.querySelector('.mes[mesid="4"] .ku-quest-note-chat');
    assert.ok(note, 'the plaque is under the reply');
    assert.equal(note.previousElementSibling.className, 'mes_text');
    assert.match(note.textContent, /Тайный долг/);
    for (const label of ['Добавить квест', 'Нет']) [...note.querySelectorAll('button')].find(button => button.textContent === label).click();
    assert.deepEqual(actions, [['confirm', { messageIndex: 4, hintId: 'new:тайный долг' }], ['dismiss', { messageIndex: 4, hintId: 'new:тайный долг' }]]);
    overlay.render(view({ leaks: [], questHints: [] }));
    assert.equal(document.querySelectorAll('.ku-quest-note-chat').length, 0);
  } finally { overlay.unmount(); }
});

test('the heat in «Сцена» shows the number, the panel nudges, sets, locks and resets it', async () => {
  const calls = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onHeat: payload => { calls.push(payload); } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    overlay.render(view({ heat: { value: 0, label: 'спокойно', lock: false, why: '' }, director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    assert.match(bar.querySelector('.ku-dir-heat').textContent, /спокойно/);
    overlay.render(view({ heat: { value: 72, label: 'накалено', lock: false, why: 'ссора' }, director: { open: true } }));
    assert.match(bar.querySelector('.ku-dir-heat').textContent, /72 · накалено/);
    const card = () => bar.querySelector('.ku-dir-heat');
    assert.match(card().textContent, /ссора/);
    assert.equal(card().querySelector('.ku-heat-fill').style.width, '72%');
    const press = label => [...card().querySelectorAll('button')].find(item => item.textContent === label);
    press('−10').click(); await settle();
    assert.deepEqual(calls.at(-1), { delta: -10 });
    press('90').click(); await settle();
    assert.deepEqual(calls.at(-1), { value: 90 });
    press('🔓 Держать').click(); await settle();
    assert.deepEqual(calls.at(-1), { lock: true });
    press('Сбросить').click(); await settle();
    assert.deepEqual(calls.at(-1), { clear: true });
  } finally { overlay.unmount(); }
});

test('there is no strip above the message box; «Что уходит модели» in the drawer says what goes to the model with the next post', async () => {
  const toggles = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: open => toggles.push(open) });
  try {
    overlay.render(view({ time: 'вт 22:20', location: 'палуба', director: { open: false, cues: [{ id: 'c1', badge: '⚡', label: 'Событие: шторм', used: false, wait: 0 }] },
      sceneMode: 'intim', dice: { groups: [], picks: [{ group: 'mood', id: 'j', text: 'с ревностью', ahead: false }], locked: [], sent: false, stage: { id: 'touch', label: 'Касания', ru: 'только касания', note: 'тихо', stages: [] } } }));
    assert.equal(document.getElementById('ku-scene-strip'), null, 'no strip above the message box: the drawer has all of it');
    const sent = view2 => {
      overlay.render(view2);
      const bar = document.getElementById('ku-scene-chips');
      bar.querySelector('[data-pane="sent"]').click();
      return bar.querySelector('.ku-dir-sent');
    };
    const card = sent(view({ director: { open: true, cues: [{ id: 'c1', badge: '⚡', label: 'Событие: шторм', used: false, wait: 0 }] },
      dice: { groups: [], picks: [{ group: 'mood', id: 'j', text: 'с ревностью', ahead: false }], locked: [], sent: false, stage: { id: 'touch', label: 'Касания', ru: 'только касания', note: 'тихо', stages: [] } } }));
    assert.match(card.querySelector('.ku-ss-out').textContent, /Уйдёт модели: .*Касания: только касания · заметка: тихо.*с ревностью \(не отправлен\)/, 'the stage and the roll');
    assert.match(card.parentElement.querySelector('.ku-dir-queue').textContent, /Событие: шторм/, 'the queued directions are listed here, with a cross each');
    assert.match(sent(view({ director: { open: true } })).querySelector('.ku-ss-out').textContent, /ничего заготовленного/);
    assert.equal(sent(view({ director: { open: true } })).querySelector('.ku-ss-last'), null, 'nothing was sent yet');
    assert.match(sent(view({ director: { open: true }, lastSent: { stage: { label: 'Касания', note: 'тихо' }, cues: ['⚡ Событие: шторм'] } })).querySelector('.ku-ss-last').textContent, /В последний запрос ушло: стадия «Касания», заметка «тихо» · ⚡ Событие: шторм/);
    assert.match(sent(view({ director: { open: true }, lastSent: { stage: null, cues: [] } })).querySelector('.ku-ss-last').textContent, /ничего от Закулисья, кроме обычной сцены/);
    const lib = sent(view({ director: { open: true }, lastSent: { stage: null, cues: [], cards: [{ name: 'Инуи', sent: ['Голос'], held: [{ title: 'Внешность', why: 'уже была' }] }, { name: 'Кокону', sent: [], held: [] }], place: { name: 'Кафе', parts: ['описание'] }, things: ['Шарф'], noCard: [{ name: 'Изана', inLibrary: true }, { name: 'Кай', inLibrary: false }] } })).querySelector('.ku-ss-lib');
    assert.match(lib.textContent, /Из библиотеки ушло: .*Инуи: Голос.*Кокону: ничего.*Кафе: описание.*Шарф/, 'which entries of the library went with the request');
    assert.match(lib.textContent, /Изана: карточка есть, но не подключена к нему.*Кай: карточки нет/, 'who is on stage but has no card in the request, and why');
    assert.match(lib.querySelector('.ku-ss-tag').title, /Не ушло: Внешность \(уже была\)/, 'and why the rest did not');
  } finally { overlay.unmount(); }
  assert.equal(document.getElementById('ku-scene-strip'), null, 'unmount takes it away');
});

test('the songs tab looks like the player: one list, a click pins a song, who sings it, a star, a false alarm', async () => {
  const calls = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onSong: payload => { calls.push(payload); } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  const songs = (over = {}) => ({ enabled: true, playing: [], found: [], muted: [], library: [{ songId: 's1', title: 'Ласточка', artist: 'Кино' }, { songId: 's2', title: 'Дождь', artist: '' }], ...over });
  const director = { open: true, people: [{ id: 'm', name: 'Майки' }, { id: 'r', name: 'Ран' }] };
  const rows = bar => [...bar.querySelectorAll('.ku-dir-songs .pud-media-row')];
  const rowOf = (bar, title) => rows(bar).find(row => row.querySelector('.pud-media-title').textContent === title);
  const press = (bar, label) => [...bar.querySelector('.ku-dir-songs').querySelectorAll('button')].find(item => item.textContent.includes(label));
  try {
    overlay.render(view({ songs: songs(), director }));
    const bar = document.getElementById('ku-scene-chips');
    assert.match(tileOf(bar, 'Медиа').textContent, /тихо/);
    tileOf(bar, 'Медиа').click();
    assert.ok(bar.querySelector('.ku-dir-songs.pud-media-pane'), 'the same pane and list as the player');
    // Find a song of the library and put it on.
    const find = bar.querySelector('[data-ku-field="song-find"]');
    find.value = 'ласт';
    find.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(rows(bar).length, 1, 'the search narrows the list');
    rowOf(bar, 'Ласточка').querySelector('.pud-media-play').click(); await settle();
    assert.deepEqual(calls.at(-1), { op: 'pin', songId: 's1', mode: 'sound', singerId: '' });
    // On: it plays; pick who sings it, or take it away with the same click.
    overlay.render(view({ songs: songs({ playing: [{ songId: 's1', title: 'Ласточка', artist: 'Кино', mode: 'sound', singerId: '' }] }), director }));
    assert.match(tileOf(bar, 'Медиа').textContent, /▶ 1/);
    assert.equal(press(bar, '🔊 Звучит').getAttribute('aria-pressed'), 'true');
    press(bar, '🎤 Майки').click(); await settle();
    assert.deepEqual(calls.at(-1), { op: 'pin', songId: 's1', mode: 'sung', singerId: 'm' });
    rowOf(bar, 'Ласточка').querySelector('.pud-media-play').click(); await settle();
    assert.deepEqual(calls.at(-1), { op: 'unpin', songId: 's1' });
    // A song the posts brought up by mistake: ✕ mutes it, ↺ brings it back.
    const again = bar.querySelector('[data-ku-field="song-find"]');
    again.value = '';
    again.dispatchEvent(new window.Event('input', { bubbles: true }));
    overlay.render(view({ songs: songs({ found: [{ songId: 's2', title: 'Дождь', why: 'lyrics', muted: false }] }), director }));
    assert.match(tileOf(bar, 'Медиа').textContent, /слышно/);
    assert.match(rowOf(bar, 'Дождь').textContent, /узнана по словам/);
    assert.equal(rows(bar)[0].querySelector('.pud-media-title').textContent, 'Дождь', 'the noticed one goes first');
    rowOf(bar, 'Дождь').querySelector('[data-ku-action="dir-song-mute"]').click(); await settle();
    assert.deepEqual(calls.at(-1), { op: 'mute', songId: 's2' });
    overlay.render(view({ songs: songs({ found: [{ songId: 's2', title: 'Дождь', why: 'lyrics', muted: true }], muted: [{ songId: 's2', title: 'Дождь' }] }), director }));
    assert.match(rowOf(bar, 'Дождь').textContent, /заглушена/);
    rowOf(bar, 'Дождь').querySelector('[data-ku-action="dir-song-unmute"]').click(); await settle();
    assert.deepEqual(calls.at(-1), { op: 'unmute', songId: 's2' });
    // The star: a favorite goes up the list.
    overlay.render(view({ songs: songs({ library: [{ songId: 's1', title: 'Ласточка', artist: 'Кино', favorite: false }, { songId: 's2', title: 'Дождь', artist: '', favorite: true }] }), director }));
    assert.equal(rows(bar)[0].querySelector('.pud-media-title').textContent, 'Дождь', 'a favorite is above the rest');
    rows(bar)[0].querySelector('[data-ku-action="dir-song-fav"]').click(); await settle();
    assert.deepEqual(calls.at(-1), { op: 'favorite', songId: 's2' });
  } finally { overlay.unmount(); }
});

test('the rail stands at either wall and tells the docked panels how much room it takes', () => {
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {} });
  const root = document.documentElement.style;
  try {
    overlay.render(view());
    const bar = document.getElementById('ku-scene-chips');
    assert.equal(bar.classList.contains('ku-side-right'), false, 'left by default');
    assert.equal(root.getPropertyValue('--ku-rail-left'), '78px');
    assert.equal(root.getPropertyValue('--ku-rail-right'), '0px');
    overlay.render(view({ railSide: 'right' }));
    assert.equal(bar.classList.contains('ku-side-right'), true);
    assert.equal(root.getPropertyValue('--ku-rail-left'), '0px');
    assert.equal(root.getPropertyValue('--ku-rail-right'), '78px');
    overlay.render(view({ chips: false }));
    assert.equal(document.getElementById('ku-scene-chips'), null);
    assert.equal(root.getPropertyValue('--ku-rail-right'), '', 'no rail, no room taken');
  } finally { overlay.unmount(); }
});

test('pages from other modules are ordinary tabs: a tile on the rail, the page inside the panel, the head names it', () => {
  const toggles = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: open => toggles.push(open) });
  extraPanes.set('demo', { id: 'demo', icon: '🧵', name: 'Нити', title: 'Нити сюжета', render: box => { box.textContent = 'страница нитей'; } });
  try {
    overlay.render(view({ director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    const tile = tileOf(bar, 'Нити');
    assert.ok(tile, 'a tile on the rail');
    tile.click();
    overlay.render(view({ director: { open: true } }));
    assert.match(bar.querySelector('.ku-dir-inner').textContent, /страница нитей/, 'the page is inside the panel');
    assert.match(bar.querySelector('.ku-dir-head').textContent, /Нити сюжета/);
    assert.equal(tileOf(bar, 'Нити').classList.contains('on'), true);
  } finally { extraPanes.delete('demo'); overlay.unmount(); }
});

test('a link that suits the scene is offered under the last reply with Включить / Нет, and only there', () => {
  const actions = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onMediaOffer: (action, payload) => actions.push([action, payload]) });
  mediaSection.suggest = () => ({ id: 'm1', title: 'Погоня', reason: 'боится' });
  try {
    overlay.render(view({ leaks: [] }));
    const note = document.querySelector('.mes[mesid="4"] .ku-media-note-chat');
    assert.ok(note, 'under the last reply');
    assert.equal(document.querySelectorAll('.ku-media-note-chat').length, 1);
    assert.match(note.textContent, /Подходит под вайб, включить\?.*Погоня · боится/);
    for (const label of ['▶ Включить', 'Нет']) [...note.querySelectorAll('button')].find(button => button.textContent === label).click();
    assert.deepEqual(actions, [['play', { id: 'm1' }], ['dismiss', { id: 'm1' }]]);
    mediaSection.suggest = () => null;
    overlay.render(view({ leaks: [] }));
    assert.equal(document.querySelectorAll('.ku-media-note-chat').length, 0, 'nothing suits: no plaque');
    mediaSection.suggest = () => ({ id: 'm1', title: 'Погоня', reason: '' });
    document.querySelector('.mes[mesid="4"]').setAttribute('is_user', 'true');
    overlay.render(view({ leaks: [] }));
    assert.equal(document.querySelectorAll('.ku-media-note-chat').length, 0, 'the last message is yours: the reply is not here yet');
  } finally { document.querySelector('.mes[mesid="4"]').removeAttribute('is_user'); mediaSection.suggest = null; overlay.unmount(); }
});

test('«Рассказчику»: write, send once, pin to this chat or to all chats, save with a cooldown; the lists fold; saved ones are sent, pinned, taken to the field or deleted', async () => {
  const calls = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {}, onCue: () => true, onNotes: async payload => { calls.push(payload); return true; } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    const notes = {
      library: [{ id: 'n1', text: 'Короче', every: 0, left: 0 }, { id: 'n2', text: 'Про погоду', every: 4, left: 2 }],
      pins: [{ id: 'p1', text: 'Пиши от третьего лица', every: 3, left: 1, scope: 'chat' }, { id: 'g1', text: 'Реплики в кавычках', every: 0, left: 0, scope: 'all' }],
    };
    overlay.render(view({ director: { open: true, cues: [], notes } }));
    const bar = document.getElementById('ku-scene-chips');
    bar.querySelector('[data-pane="note"]').click();
    const panel = () => bar.querySelector('.ku-dir-card');
    const click = async selector => { panel().querySelector(selector).click(); await settle(); };
    const typeIn = (field, value) => { const input = panel().querySelector(`[data-ku-field="${field}"]`); input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); };
    // the pinned ones are open, the saved ones are folded
    assert.match(panel().textContent, /Закреплено · 2/);
    assert.match(panel().textContent, /Пиши от третьего лица/);
    assert.match(panel().textContent, /этот чат · раз в 3 · через 1/);
    assert.match(panel().textContent, /все чаты · каждый · со следующим ответом/);
    assert.equal(panel().querySelectorAll('button[data-ku-action="dir-note-send"]').length, 0, 'the saved ones are folded');
    await click('[data-ku-action="dir-note-fold"][data-which="lib"]');
    const sends = [...panel().querySelectorAll('button[data-ku-action="dir-note-send"]')];
    assert.equal(sends.length, 2);
    assert.equal(sends[0].disabled, false);
    assert.equal(sends[1].disabled, true, 'a cooling note cannot be sent');
    assert.match(sends[1].textContent, /⏳2/);
    sends[0].click();
    await settle();
    assert.deepEqual(calls.at(-1), { action: 'send', id: 'n1', wait: 0 });
    // the field and the cooldown: pin (this chat), pin (all chats) and save carry both
    typeIn('note', 'Больше тишины');
    typeIn('note-every', '5');
    await click('[data-ku-action="dir-note-pin"]');
    assert.deepEqual(calls.at(-1), { action: 'pin', text: 'Больше тишины', every: 5 });
    typeIn('note', 'Больше тишины');
    await click('[data-ku-action="dir-note-pin-all"]');
    assert.deepEqual(calls.at(-1), { action: 'pin-all', text: 'Больше тишины', every: 5 });
    typeIn('note', 'Больше тишины');
    await click('[data-ku-action="dir-note-save"]');
    assert.deepEqual(calls.at(-1), { action: 'save', text: 'Больше тишины', every: 5 });
    await click('[data-ku-action="dir-note-pin-saved"]');
    assert.deepEqual(calls.at(-1), { action: 'pin-saved', id: 'n1' });
    await click('[data-ku-action="dir-note-pin-all-saved"]');
    assert.deepEqual(calls.at(-1), { action: 'pin-all-saved', id: 'n1' });
    await click('[data-ku-action="dir-note-unpin"]');
    assert.deepEqual(calls.at(-1), { action: 'unpin', id: 'p1' });
    await click('[data-ku-action="dir-note-unpin-all"]');
    assert.deepEqual(calls.at(-1), { action: 'unpin-all', id: 'g1' });
    await click('[data-ku-action="dir-note-del"]');
    assert.deepEqual(calls.at(-1), { action: 'delete', id: 'n1' });
    // ✎ opens the row as a small form; «Сохранить» changes the note IN PLACE (scope + id), «Отмена» changes nothing
    panel().querySelector('[data-ku-action="dir-note-edit"][data-scope="lib"][data-id="n2"]').click();
    assert.equal(panel().querySelector('[data-ku-field="note-edit"]').value, 'Про погоду');
    assert.equal(panel().querySelector('[data-ku-field="note-edit-every"]').value, '4');
    typeIn('note-edit', 'Про погоду и ветер');
    typeIn('note-edit-every', '2');
    await click('[data-ku-action="dir-note-edit-save"]');
    assert.deepEqual(calls.at(-1), { action: 'edit', scope: 'lib', id: 'n2', text: 'Про погоду и ветер', every: 2 });
    assert.equal(panel().querySelector('[data-ku-field="note-edit"]'), null, 'the form closes after a save');
    panel().querySelector('[data-ku-action="dir-note-edit"][data-scope="chat"][data-id="p1"]').click();
    await click('[data-ku-action="dir-note-edit-cancel"]');
    assert.equal(panel().querySelector('[data-ku-field="note-edit"]'), null);
    panel().querySelector('[data-ku-action="dir-note-edit"][data-scope="all"][data-id="g1"]').click();
    typeIn('note-edit', 'Реплики в «ёлочках»');
    panel().querySelector('[data-ku-field="note-edit"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    assert.deepEqual(calls.at(-1), { action: 'edit', scope: 'all', id: 'g1', text: 'Реплики в «ёлочках»', every: 0 }, 'Enter saves too');
    // folding the pinned ones hides them
    await click('[data-ku-action="dir-note-fold"][data-which="pins"]');
    assert.equal(panel().querySelector('[data-ku-action="dir-note-unpin"]'), null);
  } finally { overlay.unmount(); }
});

test('the weather tab: pick the days and the span, then a kind goes onto all of them; «Вернуть прогнозу» clears the same days', async () => {
  const sent = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {}, onWeather: payload => { sent.push(payload); } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    const week = Array.from({ length: 7 }, (_, index) => ({ day: 10 + index, label: `день ${10 + index}`, kind: index % 2 ? 'rain' : 'clear', temp: 10 + index, source: 'forecast' }));
    overlay.render(view({ weather: { kind: 'clear', temp: 10, source: 'forecast', badge: '☀ 10°' }, weatherDay: 10, weatherWeek: week, director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    tileOf(bar, 'Календарь / погода').click();
    const card = () => bar.querySelector('.ku-dir-weather');
    assert.equal(card().querySelectorAll('.ku-wx-day').length, 7, 'the week ahead is on the card');
    card().querySelectorAll('.ku-wx-day')[2].click();
    card().querySelector('[data-ku-action="dir-wx-days"][data-days="3"]').click();
    const temp = card().querySelector('[data-ku-field="wx-temp"]');
    temp.value = '-4';
    temp.dispatchEvent(new window.Event('input', { bubbles: true }));
    [...card().querySelectorAll('.ku-dir-btn')].find(item => /^Снег/.test(item.title)).click();
    await settle();
    assert.deepEqual(sent.at(-1), { kind: 'snow', temp: -4, text: '', lock: false, from: 2, days: 3 });
    assert.equal(card().querySelector('[data-ku-field="wx-temp"]').value, '', 'the drafts are emptied after the weather is set');
    card().querySelectorAll('.ku-wx-day')[1].click();
    card().querySelector('[data-ku-action="dir-wx-days"][data-days="7"]').click();
    card().querySelector('[data-ku-action="dir-weather-clear"]').click();
    await settle();
    assert.deepEqual(sent.at(-1), { clear: true, from: 1, days: 7 });
  } finally { overlay.unmount(); }
});

test('«Новый кадр» plans by the story clock: a span, own text or the narrator, a genre; the plans are listed and removable', async () => {
  const sent = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {}, onCue: () => true, onPlan: async payload => { sent.push(payload); return true; } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    const plans = [{ id: 'p1', title: 'в дверь звонят', when: 'через 2 дня', left: 'осталось 1 дн. 3 ч', within: false }, { id: 'p2', title: '🎲 рассказчик придумает сам', when: 'в течение недели', left: '', within: true }];
    overlay.render(view({ director: { open: true, cues: [], plans, planClock: true, planHours: true } }));
    const bar = document.getElementById('ku-scene-chips');
    tileOf(bar, 'Новый кадр').click();
    assert.equal(bar.querySelector('[data-ku-action="dir-plan-when"]'), null, 'the plan fields appear only after «запланировать…»');
    bar.querySelector('[data-ku-action="dir-skip"][data-skip="plan"]').click();
    const card = () => bar.querySelector('.ku-dir-frame');
    assert.match(card().textContent, /В плане · 2/);
    assert.match(card().textContent, /осталось 1 дн\. 3 ч/);
    const type = (field, value) => { const input = card().querySelector(`[data-ku-field="${field}"]`); input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); };
    type('plan-amount', '3');
    type('plan-unit', 'week');
    card().querySelector('[data-ku-action="dir-plan-when"][data-within="true"]').click();
    type('scene', 'приедет проверка');
    card().querySelector('[data-ku-action="dir-plan-genre"][data-genre="drama"]').click();
    card().querySelector('[data-ku-action="dir-frame"]').click();
    await settle();
    assert.deepEqual(sent.at(-1), { action: 'add', text: 'приедет проверка', genre: 'drama', amount: 3, unit: 'week', within: true });
    assert.equal(card().querySelector('[data-ku-field="scene"]').value, '', 'the form is emptied after a plan is made');
    card().querySelector('[data-ku-action="dir-plan-del"][data-id="p2"]').click();
    await settle();
    assert.deepEqual(sent.at(-1), { action: 'remove', id: 'p2' });
    overlay.render(view({ director: { open: true, cues: [], plans: [], planClock: false } }));
    assert.match(card().textContent, /нужен день истории/i);
  } finally { overlay.unmount(); }
});

test('«Новый кадр» is one function: a time jump, a place or a cast make a scene; the bare text is an event in this one; nothing at all is a free event', async () => {
  const cues = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onCue: cue => { cues.push(cue); return true; } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    const open = view({ director: { open: true, cues: [], places: [], people: [{ id: 'm', name: 'Майки' }] } });
    overlay.render(open);
    const bar = document.getElementById('ku-scene-chips');
    tileOf(bar, 'Новый кадр').click();
    const type = value => { const input = bar.querySelector('[data-ku-field="scene"]'); input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); };
    const go = label => [...bar.querySelectorAll('[data-ku-action="dir-frame"]')].find(item => item.textContent === label).click();
    type('в дверь звонят');
    go('С моим постом'); await settle();
    assert.deepEqual(cues.at(-1), { kind: 'event', text: 'в дверь звонят', wait: 0 }, 'no time, place or cast: an event');
    tileOf(bar, 'Новый кадр').click();
    go('С моим постом'); await settle();
    assert.deepEqual(cues.at(-1), { kind: 'event', wait: 0 }, 'nothing written: the narrator invents it');
    tileOf(bar, 'Новый кадр').click();
    bar.querySelector('[data-ku-action="dir-skip"][data-skip="evening"]').click();
    type('вечер на кухне');
    go('С моим постом'); await settle();
    assert.equal(cues.at(-1).kind, 'scene', 'a time jump makes it a new scene');
    assert.equal(cues.at(-1).text, 'вечер на кухне');
    tileOf(bar, 'Новый кадр').click();
    bar.querySelector('[data-ku-action="dir-cast"][data-entity-id="m"]').click();
    go('С моим постом'); await settle();
    assert.deepEqual([cues.at(-1).kind, cues.at(-1).castIds], ['scene', ['m']], 'a cast makes it a new scene');
    assert.equal(bar.querySelector('[data-pane="event"]'), null, 'no «Событие» button any more');
  } finally { overlay.unmount(); }
});

test('the long fields of the drawer wrap onto new lines instead of running sideways (a textarea, Enter still sends)', async () => {
  const sent = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {}, onCue: cue => { sent.push(cue); return true; } });
  try {
    overlay.render(view({ director: { open: true, cues: [], notes: { library: [], pins: [] } } }));
    const bar = document.getElementById('ku-scene-chips');
    bar.querySelector('[data-pane="note"]').click();
    const field = bar.querySelector('[data-ku-field="note"]');
    assert.equal(field.tagName, 'TEXTAREA', 'the note field wraps its text');
    field.value = 'очень длинное указание, которое раньше уезжало вбок и заставляло листать стрелкой';
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(sent.at(-1).text, 'очень длинное указание, которое раньше уезжало вбок и заставляло листать стрелкой');
    bar.querySelector('[data-pane="scene"]').click();
    assert.equal(bar.querySelector('[data-ku-field="scene"]').tagName, 'TEXTAREA');
  } finally { overlay.unmount(); }
});

test('one button holds tabs: «Одежда» (persona / heroes) and «Рассказчику / повторы» (note / repeats)', () => {
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {} });
  for (const [id, name] of [['repeats', 'Повторы'], ['wardrobe-persona', 'Одежда персоны'], ['wardrobe-heroes', 'Одежда героев']]) extraPanes.set(id, { id, icon: '👗', name, title: name, render: box => { box.textContent = `страница ${id}`; } });
  try {
    overlay.render(view({ director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    const names = [...bar.querySelectorAll('.ku-tile .ku-tile-name')].map(item => item.textContent);
    assert.equal(names.filter(name => name === 'Одежда').length, 1, 'one button for both wardrobes');
    tileOf(bar, 'Одежда').click();
    const tabs = [...bar.querySelectorAll('.ku-dir-tabs button')].map(item => item.textContent);
    assert.deepEqual(tabs, ['Персона', 'Герои']);
    assert.match(bar.textContent, /страница wardrobe-persona/);
    [...bar.querySelectorAll('.ku-dir-tabs button')][1].click();
    assert.match(bar.textContent, /страница wardrobe-heroes/, 'the second tab opens the heroes');
    assert.ok(bar.querySelector('.ku-dir-head'), 'the drawer stays open on a tab press');
    tileOf(bar, 'Рассказчику / повторы').click();
    assert.ok(bar.querySelector('[data-ku-field="note"]'), 'the note is the first tab');
    [...bar.querySelectorAll('.ku-dir-tabs button')][1].click();
    assert.match(bar.textContent, /страница repeats/);
    tileOf(bar, 'Одежда').click();
    assert.match(bar.textContent, /страница wardrobe-heroes/, 'the button remembers the tab used last');
  } finally { for (const id of ['repeats', 'wardrobe-persona', 'wardrobe-heroes']) extraPanes.delete(id); overlay.unmount(); }
});

test('all the tiles stand in one column, in three groups with a line between; «Пнуть» is at the foot', () => {
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {} });
  for (const [id, name] of [['repeats', 'Повторы'], ['threads', 'Нити'], ['relgraph', 'Связи']]) extraPanes.set(id, { id, icon: '🔁', name, title: name, render: box => { box.textContent = name; } });
  try {
    overlay.render(view({ director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    assert.equal(bar.querySelector('.ku-rail-r'), null, 'no right column any more');
    assert.equal(bar.querySelectorAll('.ku-rail').length, 1);
    const rail = bar.querySelector('.ku-rail');
    const names = [...rail.querySelectorAll('.ku-tile .ku-tile-name')].map(item => item.textContent);
    assert.deepEqual(names, ['Сцена', 'Новый кадр', 'Календарь / погода', 'Что уходит', 'Квесты', 'Медиа', 'Рассказчику / повторы', 'Нити', 'Связи', 'Настройка', 'Пнуть']);
    assert.equal(rail.querySelectorAll('.ku-rail-sep').length, 2, 'two lines: scene | tools | modules');
    assert.ok(rail.querySelector('.ku-rail-grow'), 'the kick is pushed to the foot');
    assert.ok(bar.querySelector('.ku-rail2 > .pud-sidebar'), 'the small buttons of Закулисье live under the tiles');
  } finally { for (const id of ['repeats', 'threads', 'relgraph']) extraPanes.delete(id); overlay.unmount(); }
});

test('buttons switched off in the settings leave the column, and an open page of such a button falls back to «Сцена»', () => {
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {} });
  try {
    overlay.render(view({ director: { open: true } }));
    const bar = document.getElementById('ku-scene-chips');
    tileOf(bar, 'Квесты').click();
    assert.match(bar.querySelector('.ku-dir-head').textContent, /Квесты/);
    overlay.render(view({ director: { open: true }, drawerHidden: ['quests', 'songs', 'calendar', 'wardrobe'] }));
    const names = [...bar.querySelectorAll('.ku-tile .ku-tile-name')].map(item => item.textContent);
    assert.ok(!names.includes('Квесты') && !names.includes('Медиа') && !names.includes('Календарь / погода'), 'the switched-off buttons are gone');
    assert.ok(names.includes('Сцена') && names.includes('Новый кадр'), 'the others stay');
    assert.match(bar.querySelector('.ku-dir-head').textContent, /Сцена/, 'the hidden page is not shown');
  } finally { overlay.unmount(); }
});

test('a hero from the library has a round portrait on the drawer button; the others have none', () => {
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onToggleOpen: () => {} });
  try {
    const base = view({ director: { open: true } });
    overlay.render({ ...base, cast: base.cast.map((person, index) => (index === 0 ? { ...person, portrait: '/user/images/a.png' } : person)) });
    const faces = [...document.querySelectorAll('#ku-scene-chips .ku-chip-ava')];
    assert.equal(faces.length, 1);
    assert.equal(faces[0].getAttribute('src'), '/user/images/a.png');
  } finally { overlay.unmount(); }
});
