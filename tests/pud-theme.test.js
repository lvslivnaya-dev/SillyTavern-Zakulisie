import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { PLACEHOLDER, activeReplacedExtensions, hasCustomCss, startTheme, themeWarnings } from '../src/pud/ui/theme.js';

const CSS = readFileSync(new URL('../style/pud.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Селекторы правил верхнего уровня и внутри @media (без @font-face). */
function selectors(css) {
  const out = [];
  const walk = text => {
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) {
          const head = text.slice(start, i).trim();
          const end = matching(text, i);
          if (head.startsWith('@media')) walk(text.slice(i + 1, end));
          else if (!head.startsWith('@')) out.push(head);
          i = end; start = i + 1; continue;
        }
      }
    }
  };
  const matching = (text, open) => { let d = 0; for (let j = open; j < text.length; j++) { if (text[j] === '{') d++; else if (text[j] === '}' && --d === 0) return j; } return text.length; };
  walk(css);
  return out;
}

test('каждое правило темы живёт под body.pud-on: выключила расширение, и тема ушла', () => {
  const list = selectors(CSS);
  assert.ok(list.length > 30);
  for (const group of list) {
    for (const selector of group.split(',').map(s => s.trim()).filter(Boolean)) {
      assert.ok(selector.startsWith('body.pud-on'), `без области: ${selector}`);
    }
  }
});

test('!important только для выключения анимаций, остальное берётся специфичностью', () => {
  const lines = CSS.split('\n').filter(line => line.includes('!important'));
  for (const line of lines) assert.match(line, /transition: none/, line.trim());
});

test('мост в переменные таверны на месте, цвета текста по умолчанию', () => {
  for (const name of ['--SmartThemeBodyColor', '--SmartThemeEmColor', '--SmartThemeQuoteColor', '--SmartThemeBlurTintColor', '--SmartThemeBorderColor', '--mainFontFamily']) {
    assert.ok(CSS.includes(`${name}:`), name);
  }
  assert.match(CSS, /--pud-narr: #bd6d9d/);
  assert.match(CSS, /--pud-speech: #99ba52/);
  assert.match(CSS, /--pud-think: #69318E/);
});

function page(extra = '') {
  return new JSDOM(`<!doctype html><head>${extra}</head><body><textarea id="send_textarea" placeholder="Type a message" connected_text="Type a message"></textarea></body>`).window.document;
}

test('заменяемые расширения находятся по их подключённому style.css', () => {
  const doc = page('<link rel="stylesheet" href="/scripts/extensions/third-party/MistraelSL-PersonaPanel/style.css"><link rel="stylesheet" href="/scripts/extensions/third-party/SillyTavern-Kulisy/style.css">');
  assert.deepEqual(activeReplacedExtensions(doc), ['MistraelSL Persona Panel']);
  assert.deepEqual(activeReplacedExtensions(page()), []);
});

test('свой CSS пользователя даёт предупреждение, пустой нет', () => {
  assert.equal(hasCustomCss({ powerUserSettings: { custom_css: '  ' } }), false);
  assert.equal(hasCustomCss({ powerUserSettings: { custom_css: 'body{}' } }), true);
  assert.equal(hasCustomCss(undefined), false);
  assert.equal(themeWarnings(page(), { powerUserSettings: { custom_css: 'x' } }).length, 1);
});

test('тема ставит метку и плейсхолдер, откат возвращает родной текст', () => {
  const doc = page();
  const warn = console.warn; console.warn = () => {};
  let undo;
  try { undo = startTheme(doc, {}); } finally { console.warn = warn; }
  const textarea = doc.getElementById('send_textarea');
  assert.ok(doc.body.classList.contains('pud-on'));
  assert.equal(textarea.getAttribute('placeholder'), PLACEHOLDER);
  assert.equal(textarea.getAttribute('connected_text'), PLACEHOLDER, 'таверна не вернёт свой текст при подключении к API');
  undo();
  assert.equal(doc.body.classList.contains('pud-on'), false);
  assert.equal(textarea.getAttribute('placeholder'), 'Type a message');
  assert.equal(textarea.getAttribute('connected_text'), 'Type a message');
});
