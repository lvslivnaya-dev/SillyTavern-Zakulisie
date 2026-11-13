/** Свои иконки: что проверяется до того, как попасть в разметку, и как это встаёт на место. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ICON_LIMITS, customIcon, isIconData, normalizeIcons, setCustomIcons } from '../src/shared/custom-icons.js';
import { applyCustomIcons, injectSprite } from '../src/pud/ui/icons.js';
import { ICON_COPYRIGHT, startIconStudio } from '../src/pud/ui/icon-studio.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('своя иконка: только маленькая png/webp/jpeg в base64, svg, скрипты и чужие ссылки не проходят', () => {
  assert.equal(isIconData(PNG), true);
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'javascript:alert(1)', 'https://example.com/a.png', 'data:image/png;base64,AAAA"onload="x', `data:image/png;base64,${'A'.repeat(ICON_LIMITS.bytes)}`, 5, null]) {
    assert.equal(isIconData(bad), false, String(bad).slice(0, 30));
  }
  const map = normalizeIcons({ pud: { gear: PNG, 'bad name': PNG, user: 'https://x/y.png' }, studio: { chevron: PNG }, other: { a: PNG } });
  assert.deepEqual(Object.keys(map.pud), ['gear']);
  assert.deepEqual(Object.keys(map.studio), ['chevron']);
  setCustomIcons(map);
  assert.equal(customIcon('studio', 'chevron'), PNG);
  setCustomIcons(null);
  assert.equal(customIcon('studio', 'chevron'), '');
});

test('спрайт: своя картинка встаёт на место рисунка в символе, сброс возвращает рисунок', () => {
  const { document } = new JSDOM('<body></body>').window;
  injectSprite(document);
  const symbol = () => document.getElementById('pud-i-gear');
  const original = symbol().innerHTML;
  applyCustomIcons(document, { gear: PNG });
  assert.match(symbol().innerHTML, /<image/);
  assert.ok(symbol().innerHTML.includes(PNG));
  applyCustomIcons(document, {});
  assert.equal(symbol().innerHTML, original);
  applyCustomIcons(document, { gear: 'javascript:alert(1)' });
  assert.equal(symbol().innerHTML, original, 'непроверенная ссылка в разметку не попадает');
});

test('вкладка «Иконки»: подпись про авторское право, плитки обоих наборов, сброс одной и всех', () => {
  const { document } = new JSDOM('<body></body>').window;
  injectSprite(document);
  const settings = { icons: { pud: { gear: PNG }, studio: { chevron: PNG } } };
  let saved = 0;
  const pane = document.createElement('div');
  const hub = { addTab: () => ({ pane, remove() {} }) };
  const undo = startIconStudio(document, { settings, save: () => { saved += 1; }, hub });
  assert.ok(pane.textContent.includes(ICON_COPYRIGHT.slice(0, 40)), 'авторское право упомянуто');
  assert.ok(pane.querySelectorAll('.pud-icotile').length > 80, 'иконки Закулисья и окна Кулис');
  assert.equal(pane.querySelectorAll('.pud-icotile.own').length, 2);
  assert.match(document.getElementById('pud-i-gear').innerHTML, /<image/, 'своя иконка сразу в спрайте');
  pane.querySelector('[data-reset="pud:gear"]').click();
  assert.equal(settings.icons.pud.gear, undefined);
  assert.equal(saved, 1);
  assert.ok(!document.getElementById('pud-i-gear').innerHTML.includes('<image'));
  pane.querySelector('[data-reset-all]').click();
  assert.deepEqual(settings.icons, { pud: {}, studio: {} });
  undo();
});
