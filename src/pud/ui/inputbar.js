/**
 * Поле ввода: одна кнопка-лапка вместо «≡» и волшебной палочки.
 * Родное меню расширений (#extensionsMenu) переезжает целиком внутрь родного меню чата (#options),
 * под заголовок «Расширения». Элемент с тем же id остаётся живым, поэтому расширения находят его как раньше.
 * Кнопка палочки уходит в скрытый контейнер (таверна сама показывает и прячет её через inline-стиль).
 */
import { report } from '../core/guard.js';
import { personaApi } from '../integration/personas-api.js';
import { openChatLore } from './chat-lore.js';

export const MENU_HEAD_ID = 'pud-optext-head';
const STASH_ID = 'pud-stash';
// пункты, которые открывают своё подменю: после них меню не закрываем (как у таверны)
const KEEP_OPEN = '#roll_dice, #sd_gen';

export const CHAT_LORE_ID = 'pud-opt-chatlore';
export function startInputBar(doc, { lore = personaApi, shared = {}, openLore = openChatLore } = {}) {
  const view = doc.defaultView;
  const undo = [];
  let done = false;

  const setup = () => {
    const optionsButton = doc.getElementById('options_button');
    const optionsContent = doc.querySelector('#options .options-content');
    const menu = doc.getElementById('extensionsMenu');
    const wand = doc.getElementById('extensionsMenuButton');
    if (!optionsButton || !optionsContent || !menu || !wand) return false;
    done = true;
    try {
      // кнопка «≡» становится лапкой
      optionsButton.classList.add('pud-menubtn');
      const oldTitle = optionsButton.getAttribute('title');
      optionsButton.title = 'Меню чата и расширений';
      const paw = doc.createElement('span');
      paw.className = 'pud-menupaw';
      paw.setAttribute('aria-hidden', 'true');
      optionsButton.append(paw);
      undo.push(() => {
        paw.remove();
        optionsButton.classList.remove('pud-menubtn');
        if (oldTitle === null) optionsButton.removeAttribute('title'); else optionsButton.title = oldTitle;
      });

      // палочка прячется в скрытый контейнер, на своё место вернётся при откате
      const stash = doc.createElement('div');
      stash.id = STASH_ID;
      stash.hidden = true;
      doc.body.append(stash);
      const wandHome = { parent: wand.parentElement, next: wand.nextSibling };
      stash.append(wand);
      undo.push(() => {
        wandHome.parent?.insertBefore(wand, wandHome.next?.parentNode === wandHome.parent ? wandHome.next : null);
        stash.remove();
      });

      // «Лорбуки чата»: все лорбуки открытого чата, через кого подключены, и правка тут же
      const chatLore = doc.createElement('a');
      chatLore.id = CHAT_LORE_ID;
      chatLore.innerHTML = '<i class="fa-lg fa-solid fa-book-atlas"></i><span>Лорбуки чата</span>';
      optionsContent.append(chatLore);
      undo.push(() => chatLore.remove());
      const label = chatLore.querySelector('span');
      const refreshLabel = async () => {
        try {
          await lore.ready();
          const name = lore.hasChat() ? lore.chatBook() : '';
          label.textContent = name ? `Лорбуки чата · свой: ${name}` : 'Лорбуки чата';
        } catch (error) { report('лорбук чата', error); }
      };
      optionsButton.addEventListener('click', refreshLabel);
      undo.push(() => optionsButton.removeEventListener('click', refreshLabel));
      chatLore.addEventListener('click', () => Promise.resolve(openLore(doc, { shared })).catch(error => report('лорбуки чата', error)));

      // меню расширений — внутрь меню чата
      const head = doc.createElement('div');
      head.id = MENU_HEAD_ID;
      head.innerHTML = '<hr><span>Расширения</span>';
      const menuHome = { parent: menu.parentElement, next: menu.nextSibling, style: menu.getAttribute('style') };
      optionsContent.append(head, menu);
      // Popper таверны пишет меню позицию в style; внутри нашего меню она не нужна
      menu.removeAttribute('style');
      const styleObserver = new view.MutationObserver(() => { if (menu.hasAttribute('style')) menu.removeAttribute('style'); });
      styleObserver.observe(menu, { attributes: true, attributeFilter: ['style'] });
      undo.push(() => {
        styleObserver.disconnect();
        head.remove();
        menuHome.parent?.insertBefore(menu, menuHome.next?.parentNode === menuHome.parent ? menuHome.next : null);
        menu.setAttribute('style', menuHome.style ?? 'display: none;');
      });

      // клик по пункту расширения закрывает общее меню (пункты таверны закрывают его сами)
      const onPick = event => {
        const item = event.target.closest('#extensionsMenu > .extension_container > div, #extensionsMenu > div:not(.extension_container)');
        if (!item || item.closest(KEEP_OPEN)) return;
        view.setTimeout(() => {
          const options = doc.getElementById('options');
          if (!options || view.getComputedStyle(options).display === 'none') return;
          const $ = globalThis.jQuery;
          if ($) $(optionsButton).trigger('click'); else optionsButton.click();
        }, 0);
      };
      menu.addEventListener('click', onPick);
      undo.push(() => menu.removeEventListener('click', onPick));
    } catch (error) { report('кнопки поля ввода', error); }
    return true;
  };

  // меню расширений таверна создаёт сама, иногда позже нас: ждём его появления
  if (!setup()) {
    const observer = new view.MutationObserver(() => { if (!done && setup()) observer.disconnect(); });
    observer.observe(doc.body, { childList: true, subtree: true });
    undo.push(() => observer.disconnect());
  }
  return () => { for (const fn of undo.reverse()) fn(); };
}
