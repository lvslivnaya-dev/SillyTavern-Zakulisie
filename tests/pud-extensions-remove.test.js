import test from 'node:test';
import assert from 'node:assert/strict';
import { SORT_RECENT, buildExtensions, filterExtensions } from '../src/pud/core/extensions.js';
import { migrateSettings } from '../src/pud/core/settings.js';
import { extensionApi } from '../src/pud/integration/extensions-api.js';

test('«последние установленные»: новые сверху, без даты и встроенные в конце, при равных — по алфавиту', () => {
  const names = ['memory', 'third-party/Old', 'third-party/New', 'third-party/Zed', 'third-party/Alpha'];
  const installed = { 'third-party/Old': 100, 'third-party/New': 900, 'third-party/Zed': 0, 'third-party/Alpha': 0 };
  const list = buildExtensions(names, id => ({ display_name: id.replace('third-party/', '') }), [], {}, {}, installed);
  const order = filterExtensions(list, migrateSettings({}), { sort: SORT_RECENT }).map(item => item.name);
  assert.deepEqual(order, ['New', 'Old', 'Alpha', 'Zed', 'memory']);
});

test('удаление расширения: если сервер так и не удалил, ошибка называет папку и причину', async () => {
  globalThis.SillyTavern = { getContext: () => ({ getRequestHeaders: () => ({}), extensionSettings: {} }) };
  const realFetch = globalThis.fetch;
  const realTimeout = globalThis.setTimeout;
  let asked = 0;
  globalThis.fetch = async () => { asked += 1; return { ok: false, status: 500, text: async () => 'EBUSY' }; };
  globalThis.setTimeout = (fn) => realTimeout(fn, 0);
  try {
    await assert.rejects(() => extensionApi.remove('third-party/Foo'), /Foo.*не удалилась.*500.*EBUSY/s);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realTimeout;
    delete globalThis.SillyTavern;
  }
  assert.equal(asked, 4, 'сервер просят несколько раз, а не один');
});
