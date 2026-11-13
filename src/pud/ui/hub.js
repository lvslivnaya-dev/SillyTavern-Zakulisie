/**
 * Окно «Пудреница»: одна кнопка на верхней панели вместо пяти.
 * Родные шторки таверны переезжают во вкладки окна целиком (с их полями и сохранением), а при откате возвращаются на место.
 * Если таверна или другое расширение открывает такую шторку само (клик по скрытой кнопке, кнопки на приветственном экране),
 * Пудреница перехватывает это и открывает нужную вкладку.
 */
import { icon } from './icons.js';
import { createWindow } from './window.js';
import { EQ_SPOT } from './backstage.js';

export const HUB_BUTTON_ID = 'pud-hub-button';
export const HUB_CLASS = 'pud-hub-on';

export const HUB_TABS = [
  { id: 'ai', title: 'Ответ ИИ', icon: 'sliders', drawer: 'ai-config-button', content: 'left-nav-panel' },
  { id: 'api', title: 'Соединение', icon: 'plug', drawer: 'sys-settings-button', content: 'rm_api_block' },
  { id: 'format', title: 'Формат ответа', icon: 'type', drawer: 'advanced-formatting-button', content: 'AdvancedFormatting' },
  { id: 'user', title: 'Пользователь', icon: 'user', drawer: 'user-settings-button', content: 'user-settings-block' },
  { id: 'bg', title: 'Фон', icon: 'image', drawer: 'backgrounds-button', content: 'Backgrounds' },
];

export const HUB_LINKS = [
  { title: 'Документация', icon: 'doc', href: 'https://docs.sillytavern.app/' },
  { title: 'GitHub', icon: 'git', href: 'https://github.com/SillyTavern/SillyTavern' },
  { title: 'Discord', icon: 'discord', href: 'https://discord.gg/sillytavern' },
];

/**
 * @param {Document} doc
 * @param {{ settings: object, save: () => void, stopAll: () => void }} deps
 */
export function startHub(doc, { settings, save, stopAll, shared = {} }) {
  const holder = doc.getElementById('top-settings-holder');
  if (!holder) return () => {};
  const view = doc.defaultView;
  const undo = [];

  const hub = createWindow(doc, {
    id: 'hub', title: 'Закулисье', icon: 'compact', width: 940,
    store: settings.windows, save,
    // своя метка pud-open, а не openIcon: таверна снимает openIcon со всех иконок, когда открывает свою шторку
    onToggle: open => doc.getElementById(HUB_BUTTON_ID)?.firstElementChild.classList.toggle('pud-open', open),
  });
  undo.push(() => hub.destroy());
  hub.element.classList.add('pud-hub');
  hub.body.innerHTML = `<nav class="pud-tabs" role="tablist"></nav><div class="pud-panes"></div>`;
  const tabs = hub.body.querySelector('.pud-tabs');
  const panes = hub.body.querySelector('.pud-panes');

  // кнопка на верхней панели
  const button = doc.createElement('div');
  button.id = HUB_BUTTON_ID;
  button.className = 'drawer';
  button.innerHTML = `<div class="drawer-icon closedIcon pud-hub-icon" title="Закулисье: настройки, ИИ, соединение, формат, ты, фон" tabindex="0" role="button">${icon('compact')}</div>`;
  holder.prepend(button);
  undo.push(() => button.remove());
  const onButton = event => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    hub.toggle();
  };
  button.firstElementChild.addEventListener('click', onButton);
  button.firstElementChild.addEventListener('keydown', onButton);

  const select = id => {
    for (const tab of tabs.querySelectorAll('[data-tab]')) {
      const on = tab.dataset.tab === id;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-selected', String(on));
    }
    for (const pane of panes.children) pane.hidden = pane.dataset.pane !== id;
  };
  const addTab = (id, title, iconName) => {
    const tab = doc.createElement('button');
    tab.type = 'button';
    tab.dataset.tab = id;
    tab.setAttribute('role', 'tab');
    tab.innerHTML = `${icon(iconName)}<span></span>`;
    tab.querySelector('span').textContent = title;
    tab.addEventListener('click', () => select(id));
    const pane = doc.createElement('section');
    pane.className = 'pud-pane';
    pane.dataset.pane = id;
    pane.hidden = true;
    // вкладки других модулей встают перед своей вкладкой «Пудреница» и ссылками
    const ownTab = tabs.querySelector('[data-tab="pud"]');
    if (ownTab) {
      ownTab.before(tab);
      panes.querySelector('[data-pane="pud"]').before(pane);
    } else {
      tabs.append(tab);
      panes.append(pane);
    }
    return pane;
  };

  // родные шторки → вкладки
  for (const tab of HUB_TABS) {
    const drawer = doc.getElementById(tab.drawer);
    const content = doc.getElementById(tab.content);
    if (!drawer || !content) continue;
    const pane = addTab(tab.id, tab.title, tab.icon);
    const home = { parent: content.parentElement, next: content.nextSibling };
    pane.append(content);
    drawer.classList.add('pud-moved');
    undo.push(() => {
      home.parent.insertBefore(content, home.next?.parentNode === home.parent ? home.next : null);
      drawer.classList.remove('pud-moved');
    });

    // таверна открывает шторку → открываем вкладку (её иконка становится openIcon при любом способе открытия)
    const nativeIcon = drawer.querySelector('.drawer-icon');
    if (nativeIcon) {
      const observer = new view.MutationObserver(() => {
        if (!nativeIcon.classList.contains('openIcon')) return;
        nativeIcon.classList.replace('openIcon', 'closedIcon');
        select(tab.id);
        hub.open();
      });
      observer.observe(nativeIcon, { attributes: true, attributeFilter: ['class'] });
      undo.push(() => observer.disconnect());
    }
  }

  // своя вкладка
  const own = addTab('pud', 'Закулисье', 'theater');
  own.innerHTML = `
    <h3>Закулисье</h3>
    <p class="pud-hint">Тема, окна и всё остальное для таверны. Цвета меняются во вкладке «Палитра», кнопки пресета во вкладке «Кнопки пресета», встроенные промпты нарратора во вкладке «Промпты».</p>
    <div class="pud-card">
      <div>
        <b>Выключить до перезагрузки</b>
        <p class="pud-hint">Снимает тему и окна прямо сейчас, всё родное возвращается на место. После F5 Закулисье включится снова. Насовсем выключают в «Расширения → Manage extensions».</p>
      </div>
      <button type="button" class="menu_button pud-off">Выключить</button>
    </div>
    <div class="pud-card">
      <div>
        <b>Родные панели таверны</b>
        <p class="pud-hint">На случай редкого действия, которого нет в окнах Закулисья: группы персонажей, чужие настройки персон. Закрываются так же, как в самой таверне.</p>
      </div>
      <div class="pud-native-btns">
        <button type="button" class="menu_button pud-native-personas">Персоны таверны</button>
        <button type="button" class="menu_button pud-native-chars">Персонажи таверны</button>
      </div>
    </div>`;
  own.querySelector('.pud-off').addEventListener('click', () => stopAll());
  own.querySelector('.pud-native-personas').addEventListener('click', () => { hub.close(); shared.personas?.openNative?.(); });
  own.querySelector('.pud-native-chars').addEventListener('click', () => { hub.close(); shared.characters?.openNative?.(); });

  // ссылки
  const links = doc.createElement('div');
  links.className = 'pud-links';
  links.innerHTML = `<div class="pud-tabs-sub">Ссылки</div>${HUB_LINKS.map(link => `<a href="${link.href}" target="_blank" rel="noopener noreferrer">${icon(link.icon)}<span>${link.title}</span></a>`).join('')}
    ${EQ_SPOT}`;
  tabs.append(links);

  select(tabs.querySelector('[data-tab]')?.dataset.tab ?? 'pud');
  doc.body.classList.add(HUB_CLASS);
  undo.push(() => doc.body.classList.remove(HUB_CLASS));

  // другие модули добавляют сюда свои вкладки
  shared.hub = {
    addTab(id, title, iconName) {
      const pane = addTab(id, title, iconName);
      const tab = tabs.querySelector(`[data-tab="${id}"]`);
      return { pane, remove: () => { tab?.remove(); pane.remove(); } };
    },
    open(tabId) { if (tabId) select(tabId); hub.open(); },
  };
  undo.push(() => { delete shared.hub; });

  return () => { for (const fn of undo.reverse()) fn(); };
}
