import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CHAT_LORE_ID, MENU_HEAD_ID, startInputBar } from '../src/pud/ui/inputbar.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('одна лапка: меню расширений внутри меню чата, палочка спрятана, откат всё возвращает', async () => {
  const { window } = new JSDOM(`<!doctype html><body>
    <div id="leftSendForm"><div id="options_button" class="fa-solid fa-bars"></div></div>
    <div id="options" style="display: none;"><div class="options-content"><a id="option_start_new_chat">Новый чат</a></div></div>
  </body>`, { pretendToBeVisual: true });
  const { document } = window;
  const lore = { ready: async () => {}, hasChat: () => true, chatBook: () => 'Бонтен', worldNames: () => ['Бонтен'] };
  const undo = startInputBar(document, { lore });
  // таверна создаёт меню расширений позже
  document.body.insertAdjacentHTML('beforeend', '<div id="extensionsMenu" class="options-content" style="display: none;"><div id="dice_wand_container" class="extension_container"><div id="roll_dice">Кубик</div></div><div id="x_item">Пункт</div></div>');
  document.getElementById('leftSendForm').insertAdjacentHTML('beforeend', '<div id="extensionsMenuButton" style="display: flex;"></div>');
  await wait(20);

  const menu = document.getElementById('extensionsMenu');
  assert.ok(menu.closest('#options .options-content'), 'меню расширений внутри меню чата');
  assert.ok(document.getElementById(MENU_HEAD_ID), 'есть заголовок «Расширения»');
  assert.equal(menu.hasAttribute('style'), false, 'родной display:none и позиция Popper сняты');
  assert.equal(document.getElementById('extensionsMenuButton').closest('[hidden]')?.id, 'pud-stash');
  assert.ok(document.querySelector('#options_button .pud-menupaw'));

  // пункт расширения закрывает общее меню, кубик (своё подменю) — нет
  document.getElementById('options').style.display = 'flex';
  let toggles = 0;
  document.getElementById('options_button').addEventListener('click', () => { toggles++; });
  document.getElementById('roll_dice').click();
  await wait(10);
  assert.equal(toggles, 0);
  document.getElementById('x_item').click();
  await wait(10);
  assert.equal(toggles, 1);

  assert.ok(document.getElementById(CHAT_LORE_ID), 'в меню есть «Лорбуки чата»');
  await wait(10);
  assert.equal(document.querySelector(`#${CHAT_LORE_ID} span`).textContent, 'Лорбуки чата · свой: Бонтен');
  undo();
  assert.equal(document.getElementById('extensionsMenuButton').parentElement.id, 'leftSendForm');
  assert.equal(menu.parentElement, document.body);
  assert.equal(menu.style.display, 'none');
  assert.equal(document.querySelector('.pud-menupaw'), null);
  assert.equal(document.getElementById(MENU_HEAD_ID), null);
});
