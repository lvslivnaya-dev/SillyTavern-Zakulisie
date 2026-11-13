/** Иконки и шрифты: всё, на что ссылается код, на месте и в правильном формате. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { ICONS } from '../src/pud/ui/icon-data.js';
import { icon, injectSprite, spriteMarkup, SPRITE_ID } from '../src/pud/ui/icons.js';
import { FONT_FACES, FONT_ROLES, fontFaceCss, injectFonts } from '../src/pud/ui/fonts.js';

const FONT_DIR = new URL('../assets/fonts/', import.meta.url);

test('у каждой иконки корректный viewBox и непустое тело', () => {
  for (const [name, [viewBox, body]] of Object.entries(ICONS)) {
    assert.match(viewBox, /^\d+ \d+ \d+ \d+$/, name);
    assert.ok(body.length > 10, name);
    assert.ok(!body.includes('<script'), name);
  }
});

test('нужные для макета иконки есть', () => {
  for (const name of ['compact', 'gear', 'cat', 'sleepcat', 'heart', 'x', 'send', 'redo', 'cont', 'book', 'persona', 'card', 'puzzle', 'upload']) {
    assert.ok(Object.hasOwn(ICONS, name), name);
  }
});

test('icon() даёт ссылку на спрайт, неизвестное имя — пустую строку', () => {
  assert.match(icon('gear'), /href="#pud-i-gear"/);
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try { assert.equal(icon('nope'), ''); } finally { console.warn = warn; }
  assert.equal(warned, 1);
});

test('спрайт разбирается как SVG и вставляется один раз', () => {
  const { document } = new JSDOM('<!doctype html><body></body>').window;
  const undo = injectSprite(document);
  injectSprite(document);
  assert.equal(document.querySelectorAll(`#${SPRITE_ID}`).length, 1);
  assert.equal(document.querySelectorAll('symbol').length, Object.keys(ICONS).length);
  undo();
  assert.equal(document.getElementById(SPRITE_ID), null);
  assert.ok(spriteMarkup().startsWith('<svg'));
});

test('каждый файл шрифта на месте и это woff2', () => {
  assert.ok(FONT_FACES.length > 10);
  for (const { file } of FONT_FACES) {
    const url = new URL(file, FONT_DIR);
    assert.ok(existsSync(url), file);
    assert.equal(readFileSync(url).subarray(0, 4).toString('latin1'), 'wOF2', file);
  }
});

test('у каждого семейства есть кириллица и латиница, у каждого шрифта лежит лицензия OFL', () => {
  for (const family of Object.keys(FONT_ROLES)) {
    const faces = FONT_FACES.filter(face => face.family === family);
    assert.ok(faces.some(face => face.file.includes('-cyrillic-')), `${family}: кириллица`);
    assert.ok(faces.some(face => /-latin-\d/.test(face.file)), `${family}: латиница`);
    for (const face of faces) {
      const pkg = face.file.replace(/-(cyrillic|latin)(-ext)?-\d+\.woff2$/, '');
      const license = new URL(`licenses/${pkg}-OFL.txt`, FONT_DIR);
      assert.ok(existsSync(license), `${pkg}: лицензия`);
      assert.match(readFileSync(license, 'utf8'), /SIL Open Font License/);
    }
  }
});

test('@font-face ссылается на файлы рядом с расширением и делит их по наборам символов', () => {
  const css = fontFaceCss(new URL('http://localhost/scripts/extensions/third-party/pudrenitsa/assets/fonts/'));
  for (const face of FONT_FACES) assert.ok(css.includes(`/pudrenitsa/assets/fonts/${face.file}`), face.file);
  for (const family of Object.keys(FONT_ROLES)) assert.ok(css.includes(`font-family:'${family}'`), family);
  assert.equal((css.match(/unicode-range:/g) ?? []).length, FONT_FACES.length);
  const { document } = new JSDOM('<!doctype html><head></head><body></body>').window;
  const undo = injectFonts(document, new URL('http://localhost/f/'));
  injectFonts(document, new URL('http://localhost/f/'));
  assert.equal(document.querySelectorAll('#pud-fonts').length, 1);
  undo();
  assert.equal(document.getElementById('pud-fonts'), null);
});
