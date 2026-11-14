import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { startConnection } from '../src/pud/ui/connection.js';

function setup() {
  const dom = new JSDOM(`<body class="pud-on"><div id="rm_api_block"><div class="wide100p">
    <div class="flex-container"><select id="connection_profiles"></select>
      <i id="create_connection_profile"></i><i id="update_connection_profile"></i><i id="reload_connection_profile"></i><i id="view_connection_profile"></i></div></div></div></body>`);
  const { document } = dom.window;
  const select = document.getElementById('connection_profiles');
  const connectionManager = { selectedProfile: null, profiles: [
    { id: 'b', name: 'Бета', mode: 'cc', api: 'openai', model: 'gpt-x', 'api-url': 'http://a/v1' },
    { id: 'a', name: 'Альфа', mode: 'cc', api: 'openai', model: 'claude' },
  ] };
  for (const [value, text] of [['', '<None>'], ['a', 'Альфа'], ['b', 'Бета']]) select.add(new dom.window.Option(text, value));
  const listeners = {};
  const context = {
    extensionSettings: { connectionManager },
    eventTypes: { CONNECTION_PROFILE_LOADED: 'l', CONNECTION_PROFILE_CREATED: 'c', CONNECTION_PROFILE_DELETED: 'd', CONNECTION_PROFILE_UPDATED: 'u' },
    eventSource: { on: (name, fn) => { (listeners[name] ??= []).push(fn); }, removeListener: () => {}, emit: async () => {} },
    saveSettingsDebounced: () => {}, getRequestHeaders: () => ({}),
    POPUP_TYPE: { CONFIRM: 1 }, callGenericPopup: async () => true,
  };
  return { dom, document, select, connectionManager, context };
}

test('плашки: «Без профиля» и по плашке на профиль, по алфавиту; подпись плашки важнее названия', () => {
  const { dom, document, context } = setup();
  const settings = { connectionLabels: { a: 'Мой Клод' } };
  const stop = startConnection(document, { context, settings, save: () => {} });
  const tiles = [...document.querySelectorAll('.pud-conn-tile')];
  assert.equal(tiles.length, 3);
  assert.deepEqual(tiles.map(tile => tile.querySelector('.pud-conn-name').textContent), ['Без профиля', 'Мой Клод', 'Бета']);
  assert.equal(tiles[1].querySelector('.pud-conn-sub').textContent, 'Альфа', 'под подписью видно настоящее название профиля');
  assert.ok(document.querySelector('.pud-conn-native-off'), 'родной ряд спрятан');
  stop();
  assert.equal(document.querySelector('.pud-conn'), null);
  assert.equal(document.querySelector('.pud-conn-native-off'), null, 'при откате родной ряд вернулся');
  dom.window.close();
});

test('плашка включает профиль через родной список, а правка и удаление его не включают', async () => {
  const { dom, document, select, connectionManager, context } = setup();
  let switched = '';
  select.addEventListener('change', () => { switched = select.value; connectionManager.selectedProfile = select.value || null; });
  const settings = { connectionLabels: {} };
  startConnection(document, { context, settings, save: () => {} });
  document.querySelector('.pud-conn-tile[data-id="b"] [data-act="pick"]').click();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(switched, 'b');
  switched = '';
  document.querySelector('.pud-conn-tile[data-id="a"] [data-act="del"]').click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(switched, '', 'удаление чужого профиля не переключает');
  assert.deepEqual(connectionManager.profiles.map(item => item.id), ['b']);
  assert.equal(select.querySelector('option[value="a"]'), null);
  dom.window.close();
});

test('✎: API и пресет — списки из таверны, адрес — из библиотеки, проверка идёт через сервер с ключом профиля', async () => {
  const { dom, document, select, connectionManager, context } = setup();
  connectionManager.profiles[0] = { id: 'b', name: 'Бета', mode: 'cc', api: 'custom', preset: 'P1', model: 'gpt-x', 'api-url': 'http://a/v1', 'secret-id': 'k2' };
  context.CONNECT_API_MAP = {
    openai: { selected: 'openai', source: 'openai' }, oai: { selected: 'openai', source: 'openai' },
    custom: { selected: 'openai', source: 'custom' }, openrouter: { selected: 'openai', source: 'openrouter' },
    koboldcpp: { selected: 'textgenerationwebui', type: 'koboldcpp' },
  };
  context.getPresetManager = apiId => ({ getAllPresets: () => (apiId === 'openai' ? ['P1', 'P2'] : ['T1']) });
  context.chatCompletionSettings = { custom_include_headers: '' };
  const requests = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (path, init) => {
    requests.push([path, init?.body ? JSON.parse(init.body) : null]);
    if (path === '/api/secrets/read') return { ok: true, status: 200, json: async () => ({ api_key_custom: [{ id: 'k1', label: 'один', value: '***1', active: true }, { id: 'k2', label: 'два', value: '***2', active: false }] }) };
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-x' }, { id: 'gpt-y' }] }) };
  };
  const settings = { connectionLabels: {}, connectionUrls: [] };
  let seen;
  context.callGenericPopup = async content => {
    if (typeof content === 'string') return true;
    const field = key => content.querySelector(`[data-value="${key}"]`);
    seen = {
      apis: [...field('api').options].map(option => option.value),
      presets: [...field('preset').options].map(option => option.value),
    };
    field('preset').value = 'P2';
    content.querySelector('[data-urllabel]').value = 'Мой прокси';
    content.querySelector('[data-urlsave]').click();
    content.querySelector('[data-test]').click();
    for (let i = 0; i < 100 && /Проверяю/.test(content.querySelector('.pud-conn-testout').textContent); i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    seen.test = content.querySelector('.pud-conn-testout').textContent;
    seen.library = [...content.querySelector('[data-urlpick]').options].map(option => option.textContent);
    content.querySelector('[data-secret]').value = 'k1';
    return true;
  };
  try {
    startConnection(document, { context, settings, save: () => {} });
    document.querySelector('.pud-conn-tile[data-id="b"] [data-act="edit"]').click();
    for (let i = 0; i < 200 && connectionManager.profiles.find(item => item.id === 'b').preset !== 'P2'; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(seen.apis, ['openai', 'custom', 'openrouter'], 'только API того же вида, без псевдонимов');
  assert.deepEqual(seen.presets, ['P1', 'P2']);
  assert.match(seen.test, /^✓ Работает, моделей: 2\. Модель «gpt-x» на месте\./);
  const status = requests.find(([path]) => path === '/api/backends/chat-completions/status')[1];
  assert.equal(status.chat_completion_source, 'custom');
  assert.equal(status.custom_url, 'http://a/v1');
  assert.equal(status.secret_id, 'k2', 'проверяется ключ профиля, а не активный');
  assert.deepEqual(settings.connectionUrls.map(item => [item.label, item.url]), [['Мой прокси', 'http://a/v1']]);
  assert.ok(seen.library.some(text => text.startsWith('Мой прокси')));
  const saved = connectionManager.profiles.find(item => item.id === 'b');
  assert.equal(saved.preset, 'P2');
  assert.equal(saved['secret-id'], 'k1');
  assert.equal(saved['api-url'], 'http://a/v1');
  dom.window.close();
});
