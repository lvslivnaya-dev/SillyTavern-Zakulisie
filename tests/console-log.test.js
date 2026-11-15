import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGmRequest, normalizeGmSettings } from '../src/core/gm-assistant.js';
import { createConsoleLog, formatConsoleReport, looksLikeProblem, sanitize, shortUrl } from '../src/core/console-log.js';
import { startConsoleWatch } from '../src/integration/console-watch.js';

test('ключи, токены, картинки и параметры адреса не доходят до журнала', () => {
  const dirty = 'POST https://api.example.com/v1/chat?key=SECRET123&x=1 failed: Authorization: Bearer abcdefghijklmnop1234 apiKey="sk-abcdefghijklmnopqrstuvwx" data:image/png;base64,AAAABBBBCCCC';
  const clean = sanitize(dirty);
  assert.doesNotMatch(clean, /SECRET123|abcdefghijklmnop1234|sk-abcdefgh|AAAABBBB/);
  assert.match(clean, /api\.example\.com\/v1\/chat\?…/);
  assert.ok(sanitize('x'.repeat(900)).length <= 401);
  assert.equal(shortUrl('/api/backends/chat-completions/generate?x=1', 'http://localhost:8000'), '/api/backends/chat-completions/generate');
  assert.equal(shortUrl('https://api.openai.com/v1/chat/completions', 'http://localhost:8000'), 'api.openai.com/…');
});

test('журнал: одинаковые подряд складываются, длина ограничена, отчёт со свежим внизу и памяткой', () => {
  let clock = 1000;
  const log = createConsoleLog({ limit: 3, now: () => clock++ });
  log.add('error', 'Failed to fetch'); log.add('error', 'Failed to fetch');
  assert.equal(log.list().length, 1);
  assert.equal(log.list()[0].count, 2);
  for (const n of [1, 2, 3, 4]) log.add('warn', `предупреждение ${n}`);
  assert.equal(log.list().length, 3);
  assert.equal(log.add('error', ''), null);
  const report = formatConsoleReport(log.list());
  assert.match(report, /401\/403/);
  assert.ok(report.indexOf('предупреждение 2') < report.indexOf('предупреждение 4'));
  assert.match(formatConsoleReport([]), /пуст/);
});

test('когда автор говорит о поломке', () => {
  for (const text of ['почему ошибка 429', 'пост оборвался на полуслове', 'не работает API', 'что в консоли F12?', 'пустой ответ']) assert.ok(looksLikeProblem(text), text);
  for (const text of ['как мне сыграть сцену в кафе', 'придумай имя', '']) assert.ok(!looksLikeProblem(text), text);
});

test('ассистент получает журнал только когда он передан; настройка включена по умолчанию и выключается', () => {
  assert.equal(normalizeGmSettings({}).seeConsole, true);
  assert.equal(normalizeGmSettings({ seeConsole: false }).seeConsole, false);
  const withReport = buildGmRequest({ prompt: '', gm: { messages: [] }, chat: [], consoleReport: '12:00:00 запрос: POST /api/x → 500' })[0].content;
  assert.match(withReport, /журнал ошибок браузера/);
  assert.match(withReport, /POST \/api\/x → 500/);
  assert.doesNotMatch(buildGmRequest({ prompt: '', gm: { messages: [] }, chat: [] })[0].content, /журнал ошибок браузера/);
});

test('слежение: пишет ошибки консоли, сбои запросов и красные уведомления, ничего не ломает и снимается', async () => {
  const seen = [];
  const win = {
    console: { error: (...args) => seen.push(['error', ...args]), warn: () => {} },
    location: { origin: 'http://localhost:8000' },
    toastr: { error: (message) => seen.push(['toastr', message]), warning: () => {} },
    addEventListener: () => {}, removeEventListener: () => {},
    fetch: async url => (String(url).includes('bad') ? { ok: false, status: 429, statusText: 'Too Many', clone: () => ({ text: async () => '{"error":"rate limit key=ZZZ"}' }) } : { ok: true, status: 200 }),
  };
  const log = createConsoleLog();
  const stop = startConsoleWatch(log, win);
  win.console.error('Что-то упало', new Error('boom'));
  win.toastr.error('Не удалось', 'API');
  await win.fetch('/api/good');
  const bad = await win.fetch('/api/bad?key=SECRET');
  assert.equal(bad.status, 429, 'ответ отдаётся как есть');
  await new Promise(resolve => setTimeout(resolve, 10));
  await win.fetch('/api/x').catch(() => {});
  const text = log.list().map(entry => `${entry.kind} ${entry.message} ${entry.details}`).join('\n');
  assert.match(text, /error Что-то упало Error: boom/);
  assert.match(text, /toast Ошибка «API»: Не удалось/);
  assert.match(text, /request GET \/api\/bad → 429 Too Many/);
  assert.doesNotMatch(text, /SECRET|ZZZ|\/api\/good/);
  assert.equal(seen[0][0], 'error', 'исходный console.error вызван');
  assert.equal(seen.at(-1)[0], 'toastr', 'исходное уведомление показано');
  stop();
  assert.equal(win.__zakulisieConsoleWatch, undefined);
});
