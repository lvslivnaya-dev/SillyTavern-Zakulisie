/**
 * Окно «Персоны» вместо родной шторки Persona Management.
 * Слева выбранная персона и её настройки (правится любая, не только надетая), справа библиотека:
 * папки, избранное, архив, поиск, сортировка по привязке, выбор нескольких.
 * Описание открывается в своём окне. Клик по карточке только выбирает её; надеть персону — отдельная кнопка.
 * Родная шторка остаётся в DOM скрытой: её код рисует список и хранит формы загрузки.
 */
import { report } from '../core/guard.js';
import {
  ALL, NO_FOLDER, POSITIONS, ROLES, buildPersonas, connect, createFolder, deleteFolder, disconnect, exportPayload,
  filterPersonas, folderCounts, folderOf, forgetPersona, importLegacyPersonas, moveToFolder, parsePersonaFile,
  personaStats, renameFolder,
} from '../core/personas.js';
import { plural, toggleIn } from '../core/library.js';
import { personaApi } from '../integration/personas-api.js';
import { icon } from './icons.js';
import { createWindow } from './window.js';
import { skipSameHtml } from './dom.js';
import { startPersonaLook } from './persona-look.js';

export const PERSONA_BUTTON_ID = 'pud-persona-button';
export const NATIVE_PERSONA_DRAWER = 'persona-management-button';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const words = text => String(text ?? '').match(/\S+/g)?.length ?? 0;

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, api?: typeof personaApi, storage?: { getItem(key: string): string | null } }} deps
 */
export function startPersonas(doc, { context, settings, save, api = personaApi, storage = globalThis.localStorage, bridge = null, shared = {} }) {
  const holder = doc.getElementById('top-settings-holder');
  const native = doc.getElementById(NATIVE_PERSONA_DRAWER);
  if (!holder || !native) return () => {};
  const view = doc.defaultView;
  const undo = [];
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;

  try {
    if (importLegacyPersonas(settings, key => storage?.getItem(key) ?? null)) {
      globalThis.toastr?.info?.('Избранное и папки из Persona Panel перенесены в окно персон.', 'Пудреница');
    }
    save();
  } catch (error) { report('перенос из Persona Panel', error); }

  const state = { leftMode: 'card', picked: '', view: 'all', folder: ALL, query: '', sort: 'name', select: false, checked: new Set(), linkOpen: false, paneOpen: false, ready: false };

  // ── окна ──
  const win = createWindow(doc, { id: 'personas', title: 'Персоны', icon: 'persona', width: 1080, height: 660, store: settings.windows, save, onToggle: open => { button.firstElementChild.classList.toggle('pud-open', open); if (open) refresh(); } });
  undo.push(() => win.destroy());
  win.element.classList.add('pud-personas');
  undo.push(() => { editor?.destroy?.(); editor = null; });
  win.body.innerHTML = `
    <aside class="pud-pleft"></aside>
    <section class="pud-pright">
      <div class="pud-ptools">
        <label class="pud-search">${icon('search')}<input type="search" placeholder="Искать персону: имя, титул, описание" aria-label="Поиск персон"></label>
        <button type="button" class="pud-padd" data-tool="add">${icon('plus')}<span>Добавить</span></button>
        <button type="button" class="pud-ptool" data-tool="import" title="Импорт: файл одной персоны или бэкап всех">${icon('import')}</button>
        <button type="button" class="pud-ptool" data-tool="export" title="Экспорт всех персон (родной бэкап таверны)">${icon('export')}</button>
        <button type="button" class="pud-ptool" data-tool="stats" title="Статистика">${icon('chart')}</button>
        <button type="button" class="pud-ptool" data-tool="select" title="Выбрать несколько">${icon('checks')}</button>
        <input type="file" class="pud-pimport" accept=".json,application/json" hidden>
      </div>
      <div class="pud-prow2">
        <div class="pud-seg pud-pview"></div>
        <label class="pud-psort">${icon('sort')}<select class="text_pole" aria-label="Сортировка">
          <option value="name">По имени</option>
          <option value="linked">Сначала привязанные к персонажу</option>
        </select></label>
      </div>
      <div class="pud-folders"></div>
      <div class="pud-plist" role="list"></div>
      <div class="pud-bulk" hidden></div>
    </section>`;
  const left = win.body.querySelector('.pud-pleft');
  const list = win.body.querySelector('.pud-plist');
  const views = win.body.querySelector('.pud-pview');
  const folders = win.body.querySelector('.pud-folders');
  const bulk = win.body.querySelector('.pud-bulk');
  const search = win.body.querySelector('.pud-ptools input[type="search"]');
  const sortSelect = win.body.querySelector('.pud-psort select');
  const importInput = win.body.querySelector('.pud-pimport');
  for (const el of [left, list, views, folders, bulk]) skipSameHtml(el);

  const descWin = createWindow(doc, { id: 'persona-desc', title: 'Описание персоны', icon: 'doc', width: 640, height: 560, store: settings.windows, save });
  undo.push(() => descWin.destroy());
  descWin.element.classList.add('pud-pdesc');
  descWin.body.innerHTML = `
    <div class="pud-pdesc-inner">
      <div class="pud-pdesc-who"></div>
      <textarea class="text_pole pud-pdesc-text" spellcheck="true" placeholder="Кто она, как выглядит, как говорит…"></textarea>
      <div class="pud-pdesc-foot"><span class="pud-tech pud-pdesc-count"></span><span class="pud-tech">Сохраняется само.</span></div>
    </div>`;
  const descText = descWin.body.querySelector('textarea');
  const descWho = descWin.body.querySelector('.pud-pdesc-who');
  const descCount = descWin.body.querySelector('.pud-pdesc-count');
  let descAvatar = '';

  // ── «Внешность по картинке» ──
  const lookWin = startPersonaLook(doc, { context, settings, save, api });
  undo.push(() => lookWin.destroy());

  // ── кнопка на верхней панели вместо родной ──
  const button = doc.createElement('div');
  button.id = PERSONA_BUTTON_ID;
  button.className = 'drawer';
  button.innerHTML = `<div class="drawer-icon closedIcon" title="Персоны" tabindex="0" role="button">${icon('persona')}</div>`;
  native.before(button);
  native.classList.add('pud-replaced');
  undo.push(() => { button.remove(); native.classList.remove('pud-replaced'); });
  const onButton = event => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    win.toggle();
  };
  button.firstElementChild.addEventListener('click', onButton);
  button.firstElementChild.addEventListener('keydown', onButton);
  // таверна сама открывает шторку персон (из меню, команд) → открываю окно
  let allowNative = false;
  shared.personas = { openNative: () => { allowNative = true; native.querySelector('.drawer-toggle')?.click(); } };
  undo.push(() => { delete shared.personas; });
  const nativeIcon = native.querySelector('.drawer-icon');
  if (nativeIcon) {
    const observer = new view.MutationObserver(() => {
      if (!nativeIcon.classList.contains('openIcon')) return;
      // asked for on purpose (the settings of Zakulisie): the tavern's own panel stays open
      if (allowNative) { allowNative = false; return; }
      nativeIcon.classList.replace('openIcon', 'closedIcon');
      native.querySelector('.drawer-content')?.classList.replace('openDrawer', 'closedDrawer');
      win.open();
    });
    observer.observe(nativeIcon, { attributes: true, attributeFilter: ['class'] });
    undo.push(() => observer.disconnect());
  }

  // ── данные ──
  // Кулисы открывают это окно на нужной персоне (бывшая страница «Персоны»)
  if (bridge?.personaWindow) {
    bridge.personaWindow.open = avatar => { if (avatar && byAvatar(avatar)) { state.picked = avatar; state.leftMode = 'card'; } state.forceLeft = true; win.open(); schedule(); };
    undo.push(() => { bridge.personaWindow.open = null; });
  }
  const all = () => buildPersonas(api.power(), live());
  const byAvatar = avatar => all().find(persona => persona.avatar === avatar);
  // большая картинка — полный файл, в списке — миниатюра таверны (после смены картинки таверна сама обновляет их кэш)
  const img = avatar => api.imageUrl(avatar);
  // файл миниатюры сохраняет имя, когда картинку меняют: браузер держит старую (в том числе «силуэт» без картинки). Метка в адресе
  // своя на каждую загрузку страницы, а после нажатия «сменить картинку» минуту обновляется при каждой перерисовке.
  const pageStamp = Date.now();
  let freshUntil = 0;
  const thumb = avatar => `${api.thumbUrl(avatar)}&t=${Date.now() < freshUntil ? Date.now() : pageStamp}`;
  // у карточки персоны может быть свой портрет (его ставят в окне карточки): в списке он важнее заглушки аватара таверны
  const rowPicture = avatar => { try { return bridge?.cardImageFor?.(avatar) || thumb(avatar); } catch { return thumb(avatar); } };
  const nameOf = connection => {
    const ctx = live();
    return connection.type === 'group'
      ? ctx.groups?.find(group => group.id === connection.id)?.name
      : ctx.characters?.find(character => character.avatar === connection.id)?.name;
  };

  // ── левая часть: выбранная персона ──
  // Карточка Закулисья (редактор Кулис, встроенный) — основной вид; шестерёнка в её шапке открывает настройки таверны.
  let editor = null;
  let cardHost = null;
  let shown = '';
  const renderCardLeft = persona => {
    win.element.classList.add('pud-cardmode');
    // the card is always there: a persona that has none gets an empty one at the first click
    const cardId = bridge.cardIdFor(persona.avatar) || bridge.ensureCard({ avatar: persona.avatar, name: persona.name });
    if (!editor) {
      cardHost = doc.createElement('div');
      cardHost.className = 'pud-cardhost';
      editor = bridge.createEditor(cardHost, { onGear: () => { state.paneOpen = !state.paneOpen; state.forceLeft = true; schedule(); } });
    }
    if (!tavPane) {
      tavBar = doc.createElement('div');
      tavBar.className = 'pud-tavbar';
      tavPane = doc.createElement('div');
      tavPane.className = 'pud-tavpane';
    }
    if (left.firstElementChild !== tavBar) { left.innerHTML = ''; left.append(tavBar, tavPane, cardHost); shown = ''; }
    const current = api.current() === persona.avatar;
    tavBar.innerHTML = `${current ? '<span class="pud-ptag pud-ptag-now">сейчас ты</span>' : `<button type="button" class="pud-pwear" data-act="wear">${icon('persona')}<span>Надеть</span></button>`}
      <button type="button" class="pud-pdescbtn pud-tavtoggle${state.paneOpen ? ' on' : ''}" data-act="pane" aria-expanded="${state.paneOpen}">${icon('gear')}<span>Связи и настройки таверны</span></button>`;
    tavPane.hidden = !state.paneOpen;
    tavPane.innerHTML = state.paneOpen ? tavernHtml(persona, { card: true }) : '';
    const key = `${persona.avatar}|${cardId}`;
    if (shown !== key) { editor.showCard(cardId); shown = key; }
  };
  let tavBar = null;
  let tavPane = null;
  const renderLeft = persona => {
    if (!persona) {
      win.element.classList.remove('pud-cardmode');
      left.innerHTML = '<p class="pud-lib-empty">Выбери персону справа или добавь новую.</p>';
      tavPane = null; shown = '';
      return;
    }
    if (bridge) { renderCardLeft(persona); return; }
    win.element.classList.remove('pud-cardmode');
    left.innerHTML = tavernHtml(persona, { card: false });
  };
  /** The tavern's own settings of a persona: links to characters, default, folder, position, lorebook. */
  const tavernHtml = (persona, { card }) => {
    const current = api.current() === persona.avatar;
    const isDefault = api.defaultAvatar() === persona.avatar;
    const connection = api.connection();
    const linkedHere = connection && persona.connections.some(item => item.type === connection.type && item.id === connection.id);
    const chatOpen = live().getCurrentChatId?.() !== undefined;
    const ctx = live();
    const options = [
      ...(ctx.characters ?? []).map(character => ({ type: 'character', id: character.avatar, name: character.name })),
      ...(ctx.groups ?? []).map(group => ({ type: 'group', id: group.id, name: `${group.name} (группа)` })),
    ].filter(item => !persona.connections.some(link => link.type === item.type && link.id === item.id))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
    const lorebooks = api.worldNames();
    return `
      <div class="pud-pleft-ph">
        <img src="${escapeHtml(img(persona.avatar))}" alt="">
        <button type="button" class="pud-pleft-img" data-act="image" title="Сменить картинку">${icon('image')}</button>
      </div>
      <div class="pud-pleft-tags">
        ${card ? '' : current ? '<span class="pud-ptag pud-ptag-now">сейчас ты</span>' : `<button type="button" class="pud-pwear" data-act="wear">${icon('persona')}<span>Надеть</span></button>`}
        ${isDefault ? '<span class="pud-ptag">по умолчанию</span>' : ''}
      </div>
      <label class="pud-field"><span>Имя</span><input class="text_pole" data-field="name" value="${escapeHtml(persona.name)}" maxlength="120"></label>
      <label class="pud-field"><span>Титул (виден только здесь)</span><input class="text_pole" data-field="title" value="${escapeHtml(persona.title)}" maxlength="120" placeholder="например, «бариста из Сибуи»"></label>
      <button type="button" class="pud-pdescbtn" data-act="desc">${icon('doc')}<span>Описание</span><span class="pud-tech">${plural(words(persona.description), 'слово', 'слова', 'слов')}</span></button>
      <button type="button" class="pud-pdescbtn" data-act="look" title="Описать внешность по картинке и перевести описание на английский">${icon('image')}<span>Внешность по картинке</span></button>
      <div class="pud-field"><span>Привязана к персонажам</span>
        <div class="pud-conn">
          ${persona.connections.map(link => `<span class="pud-conn-chip" data-type="${link.type}" data-id="${escapeHtml(link.id)}">${escapeHtml(link.name ?? nameOf(link) ?? link.id)}<button type="button" data-act="unlink" title="Отвязать">×</button></span>`).join('')}
          ${connection && !linkedHere ? `<button type="button" class="pud-conn-add" data-act="link-here">${icon('link')}<span>к открытому</span></button>` : ''}
          <button type="button" class="pud-conn-add" data-act="link-open">${icon('plus')}<span>персонаж</span></button>
        </div>
        <div class="pud-conn-pick" ${state.linkOpen ? '' : 'hidden'}>
          <select class="text_pole" aria-label="Кого привязать">${options.map(item => `<option value="${item.type}|${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select>
          <button type="button" class="menu_button" data-act="link-add">Привязать</button>
        </div>
      </div>
      <label class="pud-opt"><span>Персона по умолчанию<small>для новых чатов</small></span><input type="checkbox" data-opt="default" ${isDefault ? 'checked' : ''}></label>
      ${current && chatOpen ? `<label class="pud-opt"><span>Только в этом чате<small>чат всегда открывается с ней</small></span><input type="checkbox" data-opt="chat" ${api.isLocked('chat') ? 'checked' : ''}></label>` : ''}
      <label class="pud-opt"><span>Несколько персон на одного персонажа<small>общая настройка: при входе спросит, кем быть</small></span><input type="checkbox" data-opt="multi" ${api.allowMulti() ? 'checked' : ''}></label>
      <label class="pud-field"><span>Папка</span><select class="text_pole" data-field="folder">
        <option value="">Без папки</option>
        ${settings.folders.personas.map(folder => `<option value="${escapeHtml(folder.id)}" ${folderOf(settings, persona.avatar) === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('')}
      </select></label>
      <label class="pud-field"><span>Позиция описания</span><select class="text_pole" data-field="position">
        ${POSITIONS.map(item => `<option value="${item.value}" ${persona.position === item.value ? 'selected' : ''}>${item.title}</option>`).join('')}
      </select></label>
      ${persona.position === 4 ? `<div class="pud-field-row">
        <label class="pud-field"><span>Глубина</span><input class="text_pole" type="number" min="0" max="999" data-field="depth" value="${persona.depth}"></label>
        <label class="pud-field"><span>Роль</span><select class="text_pole" data-field="role">${ROLES.map(item => `<option value="${item.value}" ${persona.role === item.value ? 'selected' : ''}>${item.title}</option>`).join('')}</select></label>
      </div>` : ''}
      <div class="pud-field"><span>Лорбук персоны</span>
        <div class="pud-field-row">
          <select class="text_pole" data-field="lorebook">
            <option value="">Нет</option>
            ${lorebooks.map(name => `<option value="${escapeHtml(name)}" ${persona.lorebook === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
            ${persona.lorebook && !lorebooks.includes(persona.lorebook) ? `<option value="${escapeHtml(persona.lorebook)}" selected>${escapeHtml(persona.lorebook)} (нет файла)</option>` : ''}
          </select>
          ${persona.lorebook ? `<button type="button" class="pud-ptool" data-act="lore" title="Открыть лорбук">${icon('book')}</button>` : ''}
        </div>
      </div>`;
  };

  // ── правая часть: библиотека ──
  const renderRight = personas => {
    const connection = api.connection();
    const archivedCount = personas.filter(persona => settings.archive.personas.includes(persona.avatar)).length;
    const viewsList = [
      { id: 'all', title: 'Все' },
      ...(connection ? [{ id: 'linked', title: 'К этому персонажу' }] : []),
      { id: 'fav', title: `${icon('star')}Избранные` },
      { id: 'archive', title: `${icon('archive')}Архив${archivedCount ? ` <span class="pud-n">${archivedCount}</span>` : ''}` },
    ];
    if (state.view === 'linked' && !connection) state.view = 'all';
    views.innerHTML = viewsList.map(item => `<button type="button" data-view="${item.id}" class="${state.view === item.id ? 'on' : ''}">${item.title}</button>`).join('');

    const counts = folderCounts(personas, settings);
    if (state.folder !== ALL && state.folder !== NO_FOLDER && !settings.folders.personas.some(folder => folder.id === state.folder)) state.folder = ALL;
    const chip = (id, name, count) => `<button type="button" class="pud-fold${state.folder === id ? ' on' : ''}" data-folder="${escapeHtml(id)}" ${id !== ALL && id !== NO_FOLDER ? 'title="Двойной клик — переименовать"' : ''}>${icon('folder')}<span>${escapeHtml(name)}</span><span class="pud-n">${count ?? 0}</span></button>`;
    const active = settings.folders.personas.find(folder => folder.id === state.folder);
    folders.innerHTML = chip(ALL, 'Все', counts[ALL])
      + settings.folders.personas.map(folder => chip(folder.id, folder.name, counts[folder.id])).join('')
      + chip(NO_FOLDER, 'Без папки', counts[NO_FOLDER])
      + `<button type="button" class="pud-fold-add" data-tool="folder-add" title="Новая папка">${icon('folderplus')}</button>`
      + (active ? `<button type="button" class="pud-ptool pud-danger" data-tool="folder-del" title="Удалить папку «${escapeHtml(active.name)}» (персоны останутся)">${icon('trash')}</button>` : '');

    const shown = filterPersonas(personas, settings, { view: state.view, folder: state.folder, query: state.query, sort: state.sort, connection });
    const current = api.current();
    const fav = new Set(settings.favorites.personas);
    const archived = new Set(settings.archive.personas);
    list.classList.toggle('pud-selmode', state.select);
    list.innerHTML = shown.length ? shown.map(persona => {
      const links = persona.connections.map(link => link.name ?? nameOf(link)).filter(Boolean);
      return `<article class="pud-prow${persona.avatar === state.picked ? ' on' : ''}${state.checked.has(persona.avatar) ? ' checked' : ''}" role="listitem" tabindex="0" data-avatar="${escapeHtml(persona.avatar)}">
        <span class="pud-ck" aria-hidden="true"></span>
        <img class="pud-prow-ph" src="${escapeHtml(rowPicture(persona.avatar))}" alt="" loading="lazy" decoding="async">
        <div class="pud-prow-info">
          <b class="pud-prow-name">${escapeHtml(persona.name)}</b>
          ${persona.title ? `<span class="pud-prow-title">${escapeHtml(persona.title)}</span>` : ''}
          <span class="pud-prow-sub">${icon('book')}<span>${persona.lorebook ? escapeHtml(persona.lorebook) : 'без лорбука'}</span></span>
          <span class="pud-prow-sub">${icon('link')}<span>${links.length ? escapeHtml(links.join(', ')) : 'ни к кому'}</span></span>
        </div>
        <div class="pud-prow-marks">
          ${persona.avatar === current ? '<span class="pud-ptag pud-ptag-now">ты</span>' : ''}
          ${fav.has(persona.avatar) ? `<span class="pud-prow-star" title="Избранная">${icon('star')}</span>` : ''}
        </div>
        <div class="pud-prow-acts">
          <button type="button" class="pud-crow-btn" data-act="edit" title="Редактировать описание">${icon('pencil')}</button>
          <button type="button" class="pud-crow-btn" data-act="copy" title="Копия">${icon('copy')}</button>
          <button type="button" class="pud-crow-btn" data-act="export" title="Экспорт в файл">${icon('export')}</button>
          <button type="button" class="pud-crow-btn${fav.has(persona.avatar) ? ' on' : ''}" data-act="fav" title="${fav.has(persona.avatar) ? 'Убрать из избранного' : 'В избранное'}">${icon('star')}</button>
          <button type="button" class="pud-crow-btn" data-act="archive" title="${archived.has(persona.avatar) ? 'Вернуть из архива' : 'В архив'}">${icon(archived.has(persona.avatar) ? 'redo' : 'archive')}</button>
          <button type="button" class="pud-crow-btn pud-danger" data-act="delete" title="Удалить">${icon('trash')}</button>
        </div>
      </article>`;
    }).join('') : `<p class="pud-lib-empty">${state.query ? 'Никого не нашлось.' : state.view === 'archive' ? 'В архиве пусто.' : state.view === 'fav' ? 'Отметь звёздочкой любимых, и они будут здесь.' : 'Здесь пока никого.'}</p>`;

    bulk.hidden = !state.select;
    if (state.select) {
      const inArchive = state.view === 'archive';
      bulk.innerHTML = `<span>Выбрано <b>${state.checked.size}</b></span>
        <button type="button" class="menu_button" data-bulk="all">Все на экране</button>
        <button type="button" class="menu_button" data-bulk="move" ${state.checked.size ? '' : 'disabled'}>${icon('move')}В папку</button>
        <button type="button" class="menu_button" data-bulk="archive" ${state.checked.size ? '' : 'disabled'}>${icon(inArchive ? 'redo' : 'archive')}${inArchive ? 'Из архива' : 'В архив'}</button>
        <button type="button" class="menu_button pud-danger" data-bulk="delete" ${state.checked.size ? '' : 'disabled'}>${icon('trash')}Удалить</button>
        <button type="button" class="menu_button" data-bulk="done">Готово</button>`;
    }
    win.body.querySelector('[data-tool="select"]').classList.toggle('on', state.select);
  };

  const refresh = () => {
    if (!win.isOpen) return;
    try {
      const personas = all();
      if (!personas.some(persona => persona.avatar === state.picked)) state.picked = api.current() || personas[0]?.avatar || '';
      for (const avatar of [...state.checked]) if (!personas.some(persona => persona.avatar === avatar)) state.checked.delete(avatar);
      // пока печатают в левой части, её не перерисовываю
      const typing = left.contains(doc.activeElement) && (/^(INPUT|SELECT|TEXTAREA)$/.test(doc.activeElement.tagName) || doc.activeElement === cardHost?.firstElementChild);
      if (state.forceLeft || !typing) renderLeft(personas.find(persona => persona.avatar === state.picked));
      state.forceLeft = false;
      renderRight(personas);
      if (descWin.isOpen && descAvatar) renderDescHead();
    } catch (error) { report('персоны', error); }
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    (view.requestAnimationFrame ?? setTimeout)(() => { queued = false; refresh(); });
  };

  // ── окно описания ──
  const renderDescHead = () => {
    const persona = byAvatar(descAvatar);
    if (!persona) { descWin.close(); return; }
    descWho.innerHTML = `<img src="${escapeHtml(img(persona.avatar))}" alt=""><b>${escapeHtml(persona.name)}</b>${persona.title ? `<span class="pud-tech">${escapeHtml(persona.title)}</span>` : ''}`;
    descCount.textContent = plural(words(descText.value), 'слово', 'слова', 'слов');
  };
  let descTimer = 0;
  const flushDesc = async ({ quiet = true } = {}) => {
    view.clearTimeout(descTimer);
    descTimer = 0;
    const persona = byAvatar(descAvatar);
    if (!persona || persona.description === descText.value) return;
    await api.update(descAvatar, { description: descText.value }, { quiet });
  };
  const openDesc = async avatar => {
    if (descAvatar && descAvatar !== avatar) await flushDesc({ quiet: false });
    descAvatar = avatar;
    const persona = byAvatar(avatar);
    descText.value = persona?.description ?? '';
    renderDescHead();
    descWin.open();
    descText.focus();
  };
  descText.addEventListener('input', () => {
    descCount.textContent = plural(words(descText.value), 'слово', 'слова', 'слов');
    view.clearTimeout(descTimer);
    descTimer = view.setTimeout(() => run('Описание персоны', () => flushDesc()), 500);
  });
  descText.addEventListener('blur', () => run('Описание персоны', async () => { await flushDesc({ quiet: false }); schedule(); }));
  undo.push(() => view.clearTimeout(descTimer));

  // ── действия ──
  let busy = false;
  const run = async (what, task) => {
    if (busy) return;
    busy = true;
    win.element.classList.add('pud-busy');
    try { await api.ready(); await task(); } catch (error) {
      report(what, error);
      globalThis.toastr?.error?.(`${what}: не получилось. Подробности в консоли (F12).`, 'Пудреница');
    } finally {
      busy = false;
      win.element.classList.remove('pud-busy');
      schedule();
    }
  };
  const popup = async (content, type = 'CONFIRM', value) => {
    const ctx = live();
    return ctx.callGenericPopup(content, ctx.POPUP_TYPE[type], value);
  };
  const askText = async (text, value = '') => {
    const answer = await popup(text, 'INPUT', value);
    return typeof answer === 'string' ? answer.trim() : '';
  };
  const askFolder = async (title, withNone = true) => {
    const box = doc.createElement('div');
    box.className = 'pud-ask';
    box.innerHTML = `<h3>${escapeHtml(title)}</h3><select class="text_pole">${withNone ? '<option value="">Без папки</option>' : ''}${settings.folders.personas.map(folder => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`).join('')}</select>`;
    if (!await popup(box)) return null;
    return box.querySelector('select').value;
  };
  const download = (name, data) => {
    const blob = new view.Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = doc.createElement('a');
    link.href = view.URL.createObjectURL(blob);
    link.download = name;
    link.click();
    view.setTimeout(() => view.URL.revokeObjectURL(link.href), 1000);
  };

  const removeMany = async avatars => {
    let done = 0;
    for (const avatar of avatars) {
      if (await api.remove(avatar)) { forgetPersona(settings, avatar); state.checked.delete(avatar); done++; }
    }
    save();
    return done;
  };

  const onPersonaAction = (act, avatar) => {
    const persona = byAvatar(avatar);
    if (!persona) return;
    if (act === 'edit') { state.picked = avatar; run('Описание персоны', () => openDesc(avatar)); return; }
    if (act === 'fav') { toggleIn(settings.favorites.personas, avatar); save(); schedule(); return; }
    if (act === 'archive') { toggleIn(settings.archive.personas, avatar); save(); schedule(); return; }
    if (act === 'copy') {
      run('Копия персоны', async () => {
        const copy = await api.duplicate(avatar);
        if (copy) {
          const folder = folderOf(settings, avatar);
          if (folder) moveToFolder(settings, copy, folder);
          save();
          state.picked = copy;
          globalThis.toastr?.success?.(`Копия «${persona.name}» готова.`, 'Пудреница');
        }
      });
      return;
    }
    if (act === 'export') {
      run('Экспорт персоны', async () => {
        download(`${persona.name.replace(/[\\/:*?"<>|]+/g, '_')}.persona.json`, exportPayload(persona, await api.imageData(avatar)));
      });
      return;
    }
    if (act === 'delete') {
      run('Удалить персону', async () => {
        if (!await popup(`Удалить персону «${persona.name}»? Её картинка и описание удалятся насовсем.`)) return;
        await removeMany([avatar]);
      });
    }
  };

  list.addEventListener('click', event => {
    const row = event.target.closest('.pud-prow');
    if (!row) return;
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act) { onPersonaAction(act, row.dataset.avatar); return; }
    if (state.select) {
      if (state.checked.has(row.dataset.avatar)) state.checked.delete(row.dataset.avatar); else state.checked.add(row.dataset.avatar);
      schedule();
      return;
    }
    if (state.picked !== row.dataset.avatar) state.leftMode = 'card';
    state.picked = row.dataset.avatar;
    state.linkOpen = false;
    state.forceLeft = true;
    schedule();
  });
  list.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('pud-prow')) { event.preventDefault(); event.target.click(); }
  });

  left.addEventListener('click', event => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    const avatar = state.picked;
    if (!act || !avatar) return;
    if (act === 'wear') run('Надеть персону', () => api.wear(avatar));
    else if (act === 'pane') { state.paneOpen = !state.paneOpen; state.forceLeft = true; schedule(); }
    else if (act === 'to-card') { state.leftMode = 'card'; state.forceLeft = true; schedule(); }
    else if (act === 'make-card') run('Карточка персоны', async () => { bridge?.ensureCard({ avatar, name: byAvatar(avatar)?.name ?? '' }); state.leftMode = 'card'; state.forceLeft = true; });
    else if (act === 'desc') run('Описание персоны', () => openDesc(avatar));
    else if (act === 'look') lookWin.open(avatar);
    else if (act === 'image') { freshUntil = Date.now() + 60000; run('Картинка персоны', () => api.changeImage(doc, avatar)); }
    else if (act === 'lore') run('Лорбук персоны', () => api.openLorebook(byAvatar(avatar)?.lorebook));
    else if (act === 'link-open') { state.linkOpen = !state.linkOpen; schedule(); }
    else if (act === 'link-here' || act === 'link-add') {
      run('Привязка персоны', async () => {
        let connection = api.connection();
        if (act === 'link-add') {
          const [type, ...rest] = String(left.querySelector('.pud-conn-pick select')?.value ?? '').split('|');
          connection = type ? { type, id: rest.join('|') } : null;
        }
        if (!connection) return;
        const unlinked = connect(api.power().persona_descriptions, avatar, connection, api.allowMulti());
        await api.saveConnections();
        state.linkOpen = false;
        if (unlinked.length) {
          const names = unlinked.map(other => api.power().personas[other]).filter(Boolean).join(', ');
          globalThis.toastr?.info?.(`Несколько персон на одного персонажа выключено, поэтому отвязала: ${names}.`, 'Пудреница');
        }
      });
    } else if (act === 'unlink') {
      const chip = event.target.closest('.pud-conn-chip');
      run('Привязка персоны', async () => {
        disconnect(api.power().persona_descriptions, avatar, { type: chip.dataset.type, id: chip.dataset.id });
        await api.saveConnections();
      });
    }
  });
  left.addEventListener('change', event => {
    const avatar = state.picked;
    const target = event.target;
    if (!avatar) return;
    state.forceLeft = true;
    const field = target.dataset.field;
    const opt = target.dataset.opt;
    if (field === 'folder') { moveToFolder(settings, avatar, target.value); save(); schedule(); return; }
    if (field) {
      const value = ['position', 'depth', 'role'].includes(field) ? Number(target.value) : target.value;
      if (field === 'name' && !String(value).trim()) { target.value = byAvatar(avatar)?.name ?? ''; return; }
      run('Персона', () => api.update(avatar, { [field]: field === 'depth' ? Math.max(0, value || 0) : value }));
      return;
    }
    if (opt === 'default') run('Персона по умолчанию', () => api.setDefault(avatar, target.checked));
    else if (opt === 'chat') run('Привязка к чату', () => api.toggleLock('chat'));
    else if (opt === 'multi') run('Несколько персон', async () => api.setMulti(doc, target.checked));
  });
  left.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('input[data-field]')) event.target.blur();
  });

  win.body.querySelector('.pud-pright').addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { state.view = viewButton.dataset.view; state.checked.clear(); schedule(); return; }
    const folderButton = event.target.closest('[data-folder]');
    if (folderButton) { state.folder = folderButton.dataset.folder; schedule(); return; }
    const tool = event.target.closest('[data-tool]')?.dataset.tool;
    const bulkAct = event.target.closest('[data-bulk]')?.dataset.bulk;
    if (tool === 'select') { state.select = !state.select; state.checked.clear(); schedule(); }
    else if (tool === 'add') {
      run('Новая персона', async () => {
        const box = doc.createElement('div');
        box.className = 'pud-ask';
        const preset = state.folder !== ALL && state.folder !== NO_FOLDER ? state.folder : '';
        box.innerHTML = `<h3>Новая персона</h3>
          <label class="pud-field"><span>Имя</span><input class="text_pole" data-new="name" maxlength="120"></label>
          <label class="pud-field"><span>Папка</span><select class="text_pole" data-new="folder"><option value="">Без папки</option>${settings.folders.personas.map(folder => `<option value="${escapeHtml(folder.id)}" ${folder.id === preset ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('')}</select></label>
          <p class="pud-tech">Картинку и описание можно поменять сразу после создания.</p>`;
        view.setTimeout(() => box.querySelector('input')?.focus(), 50);
        if (!await popup(box)) return;
        const name = box.querySelector('[data-new="name"]').value.trim();
        if (!name) return;
        const avatar = await api.create({ name });
        bridge?.ensureCard({ avatar, name });
        state.leftMode = 'card';
        moveToFolder(settings, avatar, box.querySelector('[data-new="folder"]').value);
        save();
        state.picked = avatar;
        state.view = 'all';
      });
    } else if (tool === 'import') importInput.click();
    else if (tool === 'export') run('Экспорт персон', () => api.backup(doc));
    else if (tool === 'stats') {
      run('Статистика', async () => {
        const stats = personaStats(all(), settings);
        const rows = [
          ['Всего персон', stats.total], ['В архиве', stats.archived], ['Избранных', stats.favorites], ['Папок', stats.folders],
          ['С описанием', stats.withDescription], ['С лорбуком', stats.withLorebook], ['Привязаны к персонажам', stats.linked], ['Ни к кому не привязаны', stats.unlinked],
          ['Слов во всех описаниях', stats.words],
        ];
        const box = doc.createElement('div');
        box.className = 'pud-ask pud-stats';
        box.innerHTML = `<h3>Статистика персон</h3><dl>${rows.map(([title, value]) => `<dt>${title}</dt><dd>${value}</dd>`).join('')}</dl>`;
        await popup(box, 'TEXT');
      });
    } else if (tool === 'folder-add') {
      run('Новая папка', async () => {
        const name = await askText('Название новой папки');
        const folder = name ? createFolder(settings, name) : null;
        if (folder) { save(); state.folder = folder.id; }
      });
    } else if (tool === 'folder-del') {
      const folder = settings.folders.personas.find(item => item.id === state.folder);
      if (folder) {
        run('Удалить папку', async () => {
          if (!await popup(`Удалить папку «${folder.name}»? Персоны из неё останутся, просто без папки.`)) return;
          deleteFolder(settings, folder.id);
          save();
          state.folder = ALL;
        });
      }
    } else if (bulkAct === 'done') { state.select = false; state.checked.clear(); schedule(); }
    else if (bulkAct === 'all') {
      for (const row of list.querySelectorAll('.pud-prow')) state.checked.add(row.dataset.avatar);
      schedule();
    } else if (bulkAct === 'archive') {
      const back = state.view === 'archive';
      for (const avatar of state.checked) toggleIn(settings.archive.personas, avatar, !back);
      state.checked.clear();
      save();
      schedule();
    } else if (bulkAct === 'move') {
      run('Перенос в папку', async () => {
        const target = await askFolder(`Куда перенести (${state.checked.size})?`);
        if (target === null) return;
        for (const avatar of state.checked) moveToFolder(settings, avatar, target);
        state.checked.clear();
        save();
      });
    } else if (bulkAct === 'delete') {
      run('Удалить персоны', async () => {
        const count = state.checked.size;
        if (!await popup(`Удалить ${plural(count, 'персону', 'персоны', 'персон')}? Картинки и описания удалятся насовсем.`)) return;
        const done = await removeMany([...state.checked]);
        globalThis.toastr?.success?.(`Удалено: ${done}.`, 'Пудреница');
      });
    }
  });
  folders.addEventListener('dblclick', event => {
    const button = event.target.closest('[data-folder]');
    const folder = settings.folders.personas.find(item => item.id === button?.dataset.folder);
    if (!folder) return;
    run('Переименовать папку', async () => {
      const name = await askText('Новое название папки', folder.name);
      if (name && renameFolder(settings, folder.id, name)) save();
    });
  });
  search.addEventListener('input', () => { state.query = search.value; schedule(); });
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; schedule(); });
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    run('Импорт персоны', async () => {
      let data = null;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('файл не JSON'); }
      const persona = parsePersonaFile(data);
      if (!persona) { api.restore(doc, file); return; }
      const avatar = await api.create(persona);
      const folder = state.folder !== ALL && state.folder !== NO_FOLDER ? state.folder : '';
      if (folder) moveToFolder(settings, avatar, folder);
      save();
      state.picked = avatar;
      globalThis.toastr?.success?.(`Персона «${persona.name}» добавлена.`, 'Пудреница');
    });
  });

  // ── синхронизация с таверной ──
  const types = context.eventTypes ?? {};
  for (const name of ['PERSONA_CHANGED', 'PERSONA_CREATED', 'PERSONA_UPDATED', 'PERSONA_RENAMED', 'CHAT_CHANGED', 'WORLDINFO_SETTINGS_UPDATED']) {
    const type = types[name];
    if (!type || !context.eventSource?.on) continue;
    context.eventSource.on(type, schedule);
    undo.push(() => context.eventSource.removeListener?.(type, schedule));
  }
  if (types.PERSONA_DELETED && context.eventSource?.on) {
    const onDeleted = data => { if (data?.avatarId) { forgetPersona(settings, data.avatarId); save(); } schedule(); };
    context.eventSource.on(types.PERSONA_DELETED, onDeleted);
    undo.push(() => context.eventSource.removeListener?.(types.PERSONA_DELETED, onDeleted));
  }
  // родной список перерисовывается после смены картинки и восстановления бэкапа → обновляю окно
  const nativeList = doc.getElementById('user_avatar_block');
  if (nativeList) {
    const observer = new view.MutationObserver(schedule);
    observer.observe(nativeList, { childList: true });
    undo.push(() => observer.disconnect());
  }

  if (typeof bridge?.subscribe === 'function') undo.push(bridge.subscribe(() => schedule()));
  api.ready().then(() => { state.ready = true; state.picked = api.current() || state.picked; state.forceLeft = true; schedule(); }).catch(error => report('персоны', error));
  return () => { for (const fn of undo.reverse()) fn(); };
}
