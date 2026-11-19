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

/**
 * Кнопки меню, внутри которых вкладки: одна кнопка слева, а сами страницы переключаются рядом, вверху.
 * Страницы остаются прежними (их делают другие модули), группа только собирает их под одну кнопку.
 * labels: как назвать вкладку внутри группы, если на странице название другое.
 */
export const HUB_GROUPS = [
  { id: 'tavern', block: 'native', title: 'Таверна', icon: 'sliders', hint: 'Родные настройки таверны', members: ['ai', 'api', 'format', 'user', 'wand'] },
  { id: 'helpers', block: 'sliva', title: 'Помощники', icon: 'chat', hint: 'Ассистенты, кнопки пресета, промпты, повторы', members: ['assistants', 'chips', 'prompts', 'repeats', 'k-names'] },
  { id: 'diag', block: 'sliva', title: 'Диагностика и проверки', icon: 'chart', hint: 'История, диагностика, проверка ответов', members: ['k-journal', 'k-diagnostics', 'k-checks'] },
  { id: 'look', block: 'visual', title: 'Оформление', icon: 'wand', hint: 'Пресеты, фон, палитра, иконки', members: ['vpresets', 'bg', 'palette', 'icons'] },
];

/** Блок «Родные настройки»: то, что есть в самой таверне (порядок — как здесь). */
export const NATIVE_TABS = ['ai', 'api', 'format', 'user', 'wand'];
/** Блок «Сливовые приблуды»: всё своё от Закулисья. Неизвестные вкладки попадают сюда же, в конец. */
export const SLIVA_TABS = ['assistants', 'chips', 'prompts', 'repeats', 'k-names', 'k-modules', 'k-journal', 'k-diagnostics', 'k-checks', 'k-models', 'k-prompt', 'k-data', 'k-dice', 'relgraph', 'threads', 'mood', 'peek'];
/** Блок «Визуал»: идёт после своих приблуд и перед ссылками. */
export const VISUAL_TABS = ['vpresets', 'bg', 'palette', 'icons'];



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
  const shownHooks = new Map(); // page id -> what to do when the page comes on show

  const hub = createWindow(doc, {
    id: 'hub', title: 'Закулисье', icon: 'compact', width: 940,
    store: settings.windows, save,
    // своя метка pud-open, а не openIcon: таверна снимает openIcon со всех иконок, когда открывает свою шторку
    onToggle: open => {
      doc.getElementById(HUB_BUTTON_ID)?.firstElementChild.classList.toggle('pud-open', open);
      if (open) shownHooks.get(tabs.querySelector('[data-tab].on')?.dataset.tab)?.();
    },
  });
  undo.push(() => hub.destroy());
  hub.element.classList.add('pud-hub');
  hub.body.innerHTML = `<nav class="pud-tabs" role="tablist"></nav><div class="pud-panes"><div class="pud-subbar" role="tablist" hidden></div></div>`;
  const tabs = hub.body.querySelector('.pud-tabs');
  const panes = hub.body.querySelector('.pud-panes');
  const subbar = panes.querySelector('.pud-subbar');
  const lastOf = new Map(); // group → the page that was open in it last
  const folds = new Map(); // folded page id → { into, details }
  const hosts = new Map(); // page id → the element where its folds stand
  const placeFolds = into => {
    const host = hosts.get(into);
    if (!host) return;
    for (const fold of folds.values()) if (fold.into === into) host.append(fold.details);
  };

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
    for (const pane of panes.children) if (pane.dataset?.pane) pane.hidden = pane.dataset.pane !== id;
    // a button with tabs inside: lit while one of its pages is open; the pages are listed on the bar above them
    const group = groupOfTab(id);
    for (const head of tabs.querySelectorAll('[data-group]')) {
      const on = head.dataset.group === group?.id;
      head.classList.toggle('on', on);
      head.setAttribute('aria-selected', String(on));
    }
    if (group) lastOf.set(group.id, id);
    drawSubbar(group, id);
    if (!hub.element.hidden) shownHooks.get(id)?.();
  };
  const groupOfTab = id => HUB_GROUPS.find(group => group.members.includes(id)) ?? null;
  const presentMembers = group => group.members.filter(member => tabs.querySelector(`[data-tab="${member}"]`));
  const drawSubbar = (group, active) => {
    const list = group ? presentMembers(group) : [];
    subbar.hidden = list.length < 2;
    subbar.replaceChildren(...(list.length < 2 ? [] : list.map(member => {
      const item = doc.createElement('button');
      item.type = 'button';
      item.dataset.sub = member;
      item.classList.toggle('on', member === active);
      item.setAttribute('role', 'tab');
      item.textContent = group.labels?.[member] ?? tabs.querySelector(`[data-tab="${member}"] span`)?.textContent ?? member;
      item.addEventListener('click', () => select(member));
      return item;
    })));
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
    // вкладки других модулей встают перед ссылками (порядок по блокам расставляет regroup), панели — перед панелью «Закулисья»
    const linksNode = tabs.querySelector('.pud-links');
    tabs.insertBefore(tab, linksNode);
    const ownPane = panes.querySelector('[data-pane="pud"]');
    if (ownPane) panes.insertBefore(pane, ownPane); else panes.append(pane);
    return pane;
  };

  // родные шторки → вкладки
  for (const tab of HUB_TABS) {
    const drawer = doc.getElementById(tab.drawer);
    const content = doc.getElementById(tab.content);
    if (!drawer || !content) continue;
    const pane = addTab(tab.id, tab.title, tab.icon);
    const home = { parent: content.parentElement, next: content.nextSibling };
    if (tab.id === 'user') {
      // Тема и окна Закулисья рассчитаны на родной вид таверны: чужие темы здесь никто не проверял
      const warn = doc.createElement('div');
      warn.className = 'pud-warnbox';
      warn.setAttribute('role', 'note');
      warn.innerHTML = '<b>⚠ Темы не тестировались</b><span>Закулисье проверялось только со своей темой. С другими темами таверны (User Settings → Theme) окна могут выглядеть криво или работать странно. Меняйте тему на свой страх и риск.</span>';
      pane.append(warn);
    }
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
  const ownTab = tabs.querySelector('[data-tab="pud"]');
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

  // ссылки: три маленькие кнопки-значки в одну строку, название — при наведении
  const links = doc.createElement('div');
  links.className = 'pud-links';
  links.innerHTML = HUB_LINKS.map(link => `<a href="${link.href}" target="_blank" rel="noopener noreferrer" title="${link.title}" aria-label="${link.title}">${icon(link.icon)}</a>`).join('');
  tabs.append(links);
  const eqSpot = doc.createElement('div');
  eqSpot.innerHTML = EQ_SPOT;
  const eq = eqSpot.firstElementChild;
  if (eq) tabs.append(eq);
  // «Закулисье» — кнопкой-значком в ряду ссылок, а не отдельной строкой списка
  if (ownTab) {
    ownTab.title = 'Закулисье';
    ownTab.setAttribute('aria-label', 'Закулисье');
    links.append(ownTab);
  }

  select(tabs.querySelector('[data-tab]')?.dataset.tab ?? 'pud');
  doc.body.classList.add(HUB_CLASS);
  undo.push(() => doc.body.classList.remove(HUB_CLASS));

  // Порядок слева: «Родные настройки» → «Сливовые приблуды» → «Визуал» → ссылки → «Закулисье» (самым последним).
  // Заголовка нет, если во вкладках блока пусто.
  const heads = new Map();
  const headFor = (key, title) => {
    if (!heads.has(key)) {
      const head = doc.createElement('div');
      head.className = 'pud-tabs-sub';
      head.dataset.groupHead = key;
      head.textContent = title;
      heads.set(key, head);
    }
    return heads.get(key);
  };
  /** The buttons with tabs inside: they stand in the place of their first page, the pages' own buttons are hidden. */
  const groupHeads = new Map();
  const headOfGroup = group => {
    if (!groupHeads.has(group.id)) {
      const head = doc.createElement('button');
      head.type = 'button';
      head.dataset.group = group.id;
      head.setAttribute('role', 'tab');
      head.title = group.hint;
      head.innerHTML = `${icon(group.icon)}<span></span>`;
      head.querySelector('span').textContent = group.title;
      head.addEventListener('click', () => {
        const list = presentMembers(group);
        select(list.includes(lastOf.get(group.id)) ? lastOf.get(group.id) : list[0]);
      });
      groupHeads.set(group.id, head);
    }
    return groupHeads.get(group.id);
  };
  const regroup = () => {
    const all = [...tabs.children].filter(el => el.dataset?.tab);
    const byId = id => all.find(tab => tab.dataset.tab === id);
    const known = new Set([...NATIVE_TABS, ...VISUAL_TABS, ...SLIVA_TABS, 'pud']);
    const groups = [
      ['native', 'Родные настройки', NATIVE_TABS.map(byId).filter(Boolean)],
      ['sliva', 'Сливовые приблуды', [...SLIVA_TABS.map(byId).filter(Boolean), ...all.filter(tab => !known.has(tab.dataset.tab))]],
      ['visual', 'Визуал', VISUAL_TABS.map(byId).filter(Boolean)],
    ];
    for (const [key, title, list] of groups) {
      const head = headFor(key, title);
      if (!list.length) { head.remove(); continue; }
      tabs.insertBefore(head, links);
      for (const tab of list) tabs.insertBefore(tab, links);
    }
    // each group: one button at the place of its first page
    for (const group of HUB_GROUPS) {
      const present = presentMembers(group).map(byId);
      const head = headOfGroup(group);
      for (const tab of present) tab.classList.add('pud-grouped');
      if (!present.length) { head.remove(); continue; }
      tabs.insertBefore(head, present[0]);
    }
    // the open page may have joined a group after all: show the bar
    const current = tabs.querySelector('[data-tab].on')?.dataset.tab;
    if (current) { const group = groupOfTab(current); for (const head of tabs.querySelectorAll('[data-group]')) head.classList.toggle('on', head.dataset.group === group?.id); drawSubbar(group, current); }
  };
  regroup();

  // другие модули добавляют сюда свои вкладки
  shared.hub = {
    addTab(id, title, iconName) {
      const pane = addTab(id, title, iconName);
      const tab = tabs.querySelector(`[data-tab="${id}"]`);
      regroup();
      return { pane, remove: () => { tab?.remove(); pane.remove(); regroup(); } };
    },
    open(tabId) { if (tabId) select(tabId); hub.open(); },
    /**
     * A drawer inside another page (like «Кнопки и значки» inside the palette) instead of a tab of its own.
     * The page `into` says where its drawers stand (mountFolds); the drawer's body is `pane`.
     */
    addFold(id, title, into) {
      const details = doc.createElement('details');
      details.className = 'pud-palgroup pud-foldpage';
      details.dataset.foldPage = id;
      const summary = doc.createElement('summary');
      summary.textContent = title;
      const pane = doc.createElement('section');
      pane.className = 'pud-fold-body';
      details.append(summary, pane);
      folds.set(id, { into, details });
      placeFolds(into);
      return { pane, remove: () => { folds.delete(id); details.remove(); } };
    },
    /** The page `into` says where the drawers that belong to it stand (call again after redrawing the page). */
    mountFolds(into, host) { hosts.set(into, host); placeFolds(into); },
    /** What to do when a page comes on show (a page that is drawn only while it is looked at). */
    onShow(id, fn) { shownHooks.set(id, fn); },
    /** The page is on show now: its tab is open and the window is not hidden. */
    isShown: id => !hub.element.hidden && panes.querySelector(`[data-pane="${id}"]`)?.hidden === false,
  };
  undo.push(() => { delete shared.hub; });

  return () => { for (const fn of undo.reverse()) fn(); };
}
