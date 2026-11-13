/** Меню «палочки»: пункты расширений можно спрятать галочкой, сами расширения остаются; новые пункты подхватываются. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { startWandMenu, wandItems, WAND_HIDDEN_CLASS } from '../src/pud/ui/wand-menu.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('меню палочки: снять галочку — пункт спрятан, вернуть — виден; новый пункт тоже можно спрятать; откат всё возвращает', async () => {
  const dom = new JSDOM('<!doctype html><body><div id="extensionsMenu"><div id="bank" class="list-group-item"><i></i> Open Data Bank</div><div class="extension_container"><div class="list-group-item">Show Gallery</div></div></div></body>', { pretendToBeVisual: true, url: 'http://localhost/' });
  const { document } = dom.window;
  const pane = document.createElement('section');
  document.body.append(pane);
  let removed = 0;
  let saved = 0;
  const settings = { wandHidden: [] };
  const undo = startWandMenu(document, { settings, save: () => { saved += 1; }, hub: { addTab: () => ({ pane, remove: () => { removed += 1; } }) } });
  assert.deepEqual(wandItems(document).map(item => item.key), ['bank', 'Show Gallery']);
  assert.equal(pane.querySelectorAll('input[data-key]').length, 2);
  assert.ok([...pane.querySelectorAll('input')].every(box => box.checked), 'по умолчанию всё видно');

  const gallery = pane.querySelector('input[data-key="Show Gallery"]');
  gallery.checked = false;
  gallery.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(settings.wandHidden, ['Show Gallery']);
  assert.equal(saved, 1);
  const galleryNode = [...document.querySelectorAll('.list-group-item')].find(node => node.textContent.includes('Gallery'));
  assert.ok(galleryNode.classList.contains(WAND_HIDDEN_CLASS));
  assert.ok(!document.getElementById('bank').classList.contains(WAND_HIDDEN_CLASS), 'остальные на месте');

  // расширение добавило пункт позже: он в списке
  const late = document.createElement('div');
  late.className = 'list-group-item';
  late.textContent = 'Narrate All Chat';
  document.getElementById('extensionsMenu').append(late);
  await wait(120);
  assert.equal(pane.querySelectorAll('input[data-key]').length, 3);

  pane.querySelector('[data-act="show-all"]').click();
  assert.deepEqual(settings.wandHidden, []);
  assert.ok(!galleryNode.classList.contains(WAND_HIDDEN_CLASS));

  gallery.checked = false;
  pane.querySelector('input[data-key="Show Gallery"]').checked = false;
  pane.querySelector('input[data-key="Show Gallery"]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  undo();
  assert.ok(!galleryNode.classList.contains(WAND_HIDDEN_CLASS), 'откат вернул пункт');
  assert.equal(removed, 1);
});
