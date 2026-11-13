/**
 * Окно «Персонажи»: та же библиотека, что у персон, но выбранный персонаж справа.
 * Клик по карточке только выбирает. Чат открывает кнопка «Открыть чат», карточка правится без открытия чата.
 * Под шестерёнкой: расширенное описание с первым сообщением, экспорт, клон, в персону и пункты родного «Ещё…»
 * (их таверна умеет только для открытого персонажа). Родная панель персонажей остаётся доступной из окна:
 * там группы и всё, чего нет здесь.
 */
import { report } from '../core/guard.js';
import { CHAR_FIELDS, EXTENDED_FIELDS, buildCharacters, characterStats, fieldValue, filterCharacters, forgetCharacter } from '../core/characters.js';
import { ALL, NO_FOLDER, createFolder, deleteFolder, folderCounts, folderOf, moveToFolder, renameFolder } from '../core/personas.js';
import { plural, toggleIn } from '../core/library.js';
import { normalizePrompts } from '../core/prompts.js';
import { characterApi } from '../integration/characters-api.js';
import { personaApi } from '../integration/personas-api.js';
import { icon } from './icons.js';
import { createWindow } from './window.js';
import { skipSameHtml } from './dom.js';

export const CHAR_BUTTON_ID = 'pud-char-button';
export const NATIVE_CHAR_DRAWER = 'rightNavHolder';
const KIND = 'characters';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const words = text => String(text ?? '').match(/\S+/g)?.length ?? 0;

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, api?: typeof characterApi, lore?: typeof personaApi, shared?: any }} deps
 */
export function startCharacters(doc, { context, settings, save, api = characterApi, lore = personaApi, shared = {} }) {
  const holder = doc.getElementById('top-settings-holder');
  const native = doc.getElementById(NATIVE_CHAR_DRAWER);
  if (!holder || !native) return () => {};
  const view = doc.defaultView;
  const undo = [];
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const state = { picked: '', view: 'all', folder: ALL, query: '', sort: 'name', select: false, checked: new Set(), gear: false, forceSide: true };

  // ── окна ──
  const win = createWindow(doc, { id: 'characters', title: 'Нарраторы', icon: 'card', width: 1100, height: 680, store: settings.windows, save, onToggle: open => { button.firstElementChild.classList.toggle('pud-open', open); if (open) { state.forceSide = true; schedule(); } } });
  undo.push(() => win.destroy());
  win.element.classList.add('pud-personas', 'pud-chars');
  win.body.innerHTML = `
    <section class="pud-pright">
      <div class="pud-ptools">
        <label class="pud-search">${icon('search')}<input type="search" placeholder="Искать: имя, тег, автор, описание" aria-label="Поиск персонажей"></label>
        <button type="button" class="pud-padd" data-tool="add">${icon('plus')}<span>Добавить</span></button>
        <button type="button" class="pud-ptool" data-tool="import" title="Импорт карточек (PNG, JSON, CharX…)">${icon('import')}</button>
        <button type="button" class="pud-ptool" data-tool="stats" title="Статистика">${icon('chart')}</button>
        <button type="button" class="pud-ptool" data-tool="select" title="Выбрать несколько">${icon('checks')}</button>
        <button type="button" class="pud-ptool" data-tool="native" title="Родная панель персонажей: группы и всё остальное">${icon('theater')}</button>
      </div>
      <div class="pud-prow2">
        <div class="pud-seg pud-pview"></div>
        <label class="pud-psort">${icon('sort')}<select class="text_pole" aria-label="Сортировка">
          <option value="name">По имени</option>
          <option value="recent">Недавние чаты</option>
          <option value="added">Новые</option>
        </select></label>
      </div>
      <div class="pud-folders"></div>
      <div class="pud-plist" role="list"></div>
      <div class="pud-bulk" hidden></div>
    </section>
    <aside class="pud-pleft pud-side-right"></aside>
    <input type="file" class="pud-cimg" accept="image/*" hidden>`;
  const side = win.body.querySelector('.pud-side-right');
  const list = win.body.querySelector('.pud-plist');
  const views = win.body.querySelector('.pud-pview');
  const folders = win.body.querySelector('.pud-folders');
  const bulk = win.body.querySelector('.pud-bulk');
  const search = win.body.querySelector('.pud-ptools input[type="search"]');
  const sortSelect = win.body.querySelector('.pud-psort select');
  const imageInput = win.body.querySelector('.pud-cimg');
  for (const el of [side, list, views, folders, bulk]) skipSameHtml(el);

  const extWin = createWindow(doc, { id: 'char-ext', title: 'Расширенное описание', icon: 'doc', width: 720, height: 640, store: settings.windows, save });
  undo.push(() => extWin.destroy());
  extWin.element.classList.add('pud-cext');
  extWin.body.innerHTML = `<div class="pud-cext-inner">
      <div class="pud-pdesc-who"></div>
      ${EXTENDED_FIELDS.map(field => `<label class="pud-field"><span>${CHAR_FIELDS[field].title}</span><textarea class="text_pole" data-ext="${field}" rows="${field === 'first_mes' ? 8 : 4}"></textarea></label>`).join('')}
      <p class="pud-tech">Сохраняется само. Альтернативные приветствия и глубинный промпт — в родной панели персонажа.</p>
    </div>`;
  const extWho = extWin.body.querySelector('.pud-pdesc-who');
  let extAvatar = '';

  // ── кнопка на верхней панели; родная прячется, но шторка доступна из окна ──
  const button = doc.createElement('div');
  button.id = CHAR_BUTTON_ID;
  button.className = 'drawer';
  button.innerHTML = `<div class="drawer-icon closedIcon" title="Нарраторы" tabindex="0" role="button">${icon('card')}</div>`;
  native.before(button);
  // the button lives on the shelf of the chats now («Нарраторы», under the archive); the top bar keeps the Zakulisie ones
  button.style.display = 'none';
  native.classList.add('pud-toggle-hidden');
  undo.push(() => { button.remove(); native.classList.remove('pud-toggle-hidden'); });
  const onButton = event => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    win.toggle();
  };
  button.firstElementChild.addEventListener('click', onButton);
  button.firstElementChild.addEventListener('keydown', onButton);

  // ── данные ──
  const ctx = () => live();
  const all = () => buildCharacters(ctx().characters, ctx().tagMap, ctx().tags);
  const raw = avatar => ctx().characters?.find(character => character.avatar === avatar);

  // ── правая часть: выбранный персонаж ──
  const renderSide = () => {
    const character = raw(state.picked);
    if (!character) {
      side.innerHTML = '<p class="pud-lib-empty">Выбери персонажа слева или добавь нового.</p>';
      return;
    }
    const entry = buildCharacters([character], ctx().tagMap, ctx().tags)[0];
    const current = api.isCurrent(character.avatar);
    const lorebooks = lore.worldNames();
    const extras = lore.extraBooks?.(character.avatar) ?? [];
    const chatBook = current ? (lore.chatBook?.() ?? '') : '';
    const description = fieldValue(character, 'description');
    const natives = current ? api.nativeOptions(doc) : [];
    side.innerHTML = `
      <div class="pud-pleft-ph">
        <img src="${escapeHtml(api.imageUrl(character.avatar))}" alt="">
        <button type="button" class="pud-pleft-img" data-act="image" title="Сменить картинку">${icon('image')}</button>
      </div>
      <div class="pud-cname">
        <h3>${escapeHtml(entry.name)}</h3>
        <button type="button" class="pud-gear${state.gear ? ' on' : ''}" data-act="gear" title="Ещё: расширенное описание, экспорт, клон…" aria-expanded="${state.gear}">${icon('gear')}</button>
      </div>
      <div class="pud-gearpop" ${state.gear ? '' : 'hidden'}>
        <button type="button" data-gear="ext">${icon('doc')}<span>Расширенное описание и первое сообщение</span></button>
        <button type="button" data-gear="png">${icon('export')}<span>Экспорт PNG</span></button>
        <button type="button" data-gear="json">${icon('export')}<span>Экспорт JSON</span></button>
        <button type="button" data-gear="clone">${icon('copy')}<span>Клонировать</span></button>
        <button type="button" data-gear="persona">${icon('persona')}<span>Преобразовать в персону</span></button>
        <hr>
        ${natives.length ? natives.map(item => `<button type="button" data-native="${escapeHtml(item.id)}">${icon('sliders')}<span>${escapeHtml(item.title)}</span></button>`).join('')
          : '<p class="pud-tech">Остальные пункты «Ещё…» (лор, переименование, замена карточки, теги) таверна даёт только открытому персонажу. Открой его чат, и они появятся здесь.</p>'}
        <button type="button" data-gear="native">${icon('theater')}<span>Родная панель персонажа</span></button>
      </div>
      <div class="pud-pleft-tags">
        ${current ? '<span class="pud-ptag pud-ptag-now">чат открыт</span>' : ''}
        ${entry.fav ? '<span class="pud-ptag pud-ptag-fav">избранный</span>' : ''}
        ${entry.tags.map(tag => `<span class="pud-ptag">${escapeHtml(tag)}</span>`).join('')}
        <span class="pud-tech pud-cwords">${plural(words(description), 'слово', 'слова', 'слов')}</span>
      </div>
      <div class="pud-cacts">
        <button type="button" class="pud-pola-open" data-act="open">${icon('chat')}<span>Открыть чат</span></button>
        <button type="button" class="pud-ptool" data-act="chats" title="Все чаты персонажа">${icon('list')}</button>
        <button type="button" class="pud-ptool${entry.fav ? ' on' : ''}" data-act="fav" title="${entry.fav ? 'Убрать из избранного' : 'В избранное'}">${icon('star')}</button>
        <button type="button" class="pud-ptool pud-danger" data-act="delete" title="Удалить персонажа">${icon('trash')}</button>
      </div>
      <div class="pud-field pud-clore"><span>Лорбуки</span>
        <div class="pud-clore-row"><small>Основной</small>
          <div class="pud-field-row">
            <select class="text_pole" data-field="world" aria-label="Основной лорбук">
              <option value="">Нет</option>
              ${lorebooks.map(name => `<option value="${escapeHtml(name)}" ${entry.world === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
              ${entry.world && !lorebooks.includes(entry.world) ? `<option value="${escapeHtml(entry.world)}" selected>${escapeHtml(entry.world)} (нет файла)</option>` : ''}
            </select>
            ${entry.world ? `<button type="button" class="pud-ptool" data-act="lore" data-book="${escapeHtml(entry.world)}" title="Открыть лорбук">${icon('book')}</button>` : ''}
          </div>
        </div>
        <div class="pud-clore-row"><small>Дополнительные</small>
          ${extras.length ? `<div class="pud-clore-chips">${extras.map(name => `<span class="pud-clore-chip"><button type="button" class="pud-clore-name" data-act="lore" data-book="${escapeHtml(name)}" title="Открыть лорбук">${escapeHtml(name)}</button><button type="button" class="pud-clore-x" data-act="extra-del" data-book="${escapeHtml(name)}" title="Отвязать" aria-label="Отвязать ${escapeHtml(name)}">×</button></span>`).join('')}</div>` : ''}
          <select class="text_pole" data-field="extra-add" aria-label="Добавить дополнительный лорбук">
            <option value="">+ добавить лорбук</option>
            ${lorebooks.filter(name => name !== entry.world && !extras.includes(name)).map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}
          </select>
        </div>
        ${current ? `<div class="pud-clore-row"><small>Этого чата</small>
          <div class="pud-field-row">
            <select class="text_pole" data-field="chat-book" aria-label="Лорбук этого чата">
              <option value="">Нет</option>
              ${lorebooks.map(name => `<option value="${escapeHtml(name)}" ${chatBook === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
              ${chatBook && !lorebooks.includes(chatBook) ? `<option value="${escapeHtml(chatBook)}" selected>${escapeHtml(chatBook)} (нет файла)</option>` : ''}
            </select>
            ${chatBook ? `<button type="button" class="pud-ptool" data-act="lore" data-book="${escapeHtml(chatBook)}" title="Открыть лорбук">${icon('book')}</button>` : ''}
          </div>
        </div>` : ''}
      </div>
      <label class="pud-field"><span>Папка</span><select class="text_pole" data-field="folder">
        <option value="">Без папки</option>
        ${settings.folders.characters.map(folder => `<option value="${escapeHtml(folder.id)}" ${folderOf(settings, character.avatar, KIND) === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('')}
      </select></label>
      <label class="pud-field pud-cdesc"><span>Описание</span><textarea class="text_pole" data-field="description" rows="10">${escapeHtml(description)}</textarea></label>
      <p class="pud-tech">Первое сообщение, личность, сценарий и примеры — в «Расширенном описании» под шестерёнкой.</p>`;
  };

  // ── левая часть: библиотека ──
  const renderList = characters => {
    const archivedCount = characters.filter(character => settings.archive.characters.includes(character.avatar)).length;
    views.innerHTML = [
      { id: 'all', title: 'Все' },
      { id: 'chats', title: 'С чатами' },
      { id: 'fav', title: `${icon('star')}Избранные` },
      { id: 'archive', title: `${icon('archive')}Архив${archivedCount ? ` <span class="pud-n">${archivedCount}</span>` : ''}` },
    ].map(item => `<button type="button" data-view="${item.id}" class="${state.view === item.id ? 'on' : ''}">${item.title}</button>`).join('');

    const counts = folderCounts(characters, settings, KIND);
    if (state.folder !== ALL && state.folder !== NO_FOLDER && !settings.folders.characters.some(folder => folder.id === state.folder)) state.folder = ALL;
    const chip = (id, name, count) => `<button type="button" class="pud-fold${state.folder === id ? ' on' : ''}" data-folder="${escapeHtml(id)}" ${id !== ALL && id !== NO_FOLDER ? 'title="Двойной клик — переименовать"' : ''}>${icon('folder')}<span>${escapeHtml(name)}</span><span class="pud-n">${count ?? 0}</span></button>`;
    const active = settings.folders.characters.find(folder => folder.id === state.folder);
    folders.innerHTML = chip(ALL, 'Все', counts[ALL])
      + settings.folders.characters.map(folder => chip(folder.id, folder.name, counts[folder.id])).join('')
      + chip(NO_FOLDER, 'Без папки', counts[NO_FOLDER])
      + `<button type="button" class="pud-fold-add" data-tool="folder-add" title="Новая папка">${icon('folderplus')}</button>`
      + (active ? `<button type="button" class="pud-ptool pud-danger" data-tool="folder-del" title="Удалить папку «${escapeHtml(active.name)}» (персонажи останутся)">${icon('trash')}</button>` : '');

    const shown = filterCharacters(characters, settings, { view: state.view, folder: state.folder, query: state.query, sort: state.sort });
    const archived = new Set(settings.archive.characters);
    list.classList.toggle('pud-selmode', state.select);
    list.innerHTML = shown.length ? shown.map(character => `<article class="pud-prow${character.avatar === state.picked ? ' on' : ''}${state.checked.has(character.avatar) ? ' checked' : ''}" role="listitem" tabindex="0" data-avatar="${escapeHtml(character.avatar)}">
        <span class="pud-ck" aria-hidden="true"></span>
        <img class="pud-prow-ph" src="${escapeHtml(api.thumbUrl(character.avatar))}" alt="" loading="lazy" decoding="async">
        <div class="pud-prow-info">
          <b class="pud-prow-name">${escapeHtml(character.name)}</b>
          <span class="pud-prow-sub">${icon('tag')}<span>${character.tags.length ? escapeHtml(character.tags.join(', ')) : 'без тегов'}</span></span>
          <span class="pud-prow-sub">${icon('book')}<span>${character.world ? escapeHtml(character.world) : 'без лорбука'}</span></span>
        </div>
        <div class="pud-prow-marks">
          ${api.isCurrent(character.avatar) ? '<span class="pud-ptag pud-ptag-now">чат</span>' : ''}
          ${character.fav ? `<span class="pud-prow-star" title="Избранный">${icon('star')}</span>` : ''}
        </div>
        <div class="pud-prow-acts">
          <button type="button" class="pud-crow-open pud-crow-open-ic" data-act="open" title="Открыть чат">${icon('chat')}</button>
          <button type="button" class="pud-crow-btn" data-act="clone" title="Клонировать">${icon('copy')}</button>
          <button type="button" class="pud-crow-btn" data-act="png" title="Экспорт PNG">${icon('export')}</button>
          <button type="button" class="pud-crow-btn${character.fav ? ' on' : ''}" data-act="fav" title="${character.fav ? 'Убрать из избранного' : 'В избранное'}">${icon('star')}</button>
          <button type="button" class="pud-crow-btn" data-act="archive" title="${archived.has(character.avatar) ? 'Вернуть из архива' : 'В архив (файлы останутся)'}">${icon(archived.has(character.avatar) ? 'redo' : 'archive')}</button>
          <button type="button" class="pud-crow-btn pud-danger" data-act="delete" title="Удалить">${icon('trash')}</button>
        </div>
      </article>`).join('') : `<p class="pud-lib-empty">${state.query ? 'Никого не нашлось.' : state.view === 'archive' ? 'В архиве пусто.' : state.view === 'fav' ? 'Отметь звёздочкой любимых, и они будут здесь.' : 'Здесь пока никого.'}</p>`;

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
      const characters = all();
      if (!characters.some(character => character.avatar === state.picked)) {
        const id = ctx().characterId;
        state.picked = (id !== undefined && ctx().characters?.[Number(id)]?.avatar) || '';
        state.forceSide = true;
      }
      for (const avatar of [...state.checked]) if (!characters.some(character => character.avatar === avatar)) state.checked.delete(avatar);
      const typing = side.contains(doc.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(doc.activeElement.tagName);
      if (state.forceSide || !typing) renderSide();
      state.forceSide = false;
      renderList(characters);
      if (extWin.isOpen && extAvatar) renderExtHead();
    } catch (error) { report('персонажи', error); }
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    (view.requestAnimationFrame ?? setTimeout)(() => { queued = false; refresh(); });
  };

  // ── действия ──
  let busy = false;
  const run = async (what, task) => {
    if (busy) return;
    busy = true;
    win.element.classList.add('pud-busy');
    try { await Promise.all([api.ready(), lore.ready()]); await task(); } catch (error) {
      report(what, error);
      globalThis.toastr?.error?.(`${what}: не получилось. Подробности в консоли (F12).`, 'Пудреница');
    } finally {
      busy = false;
      win.element.classList.remove('pud-busy');
      schedule();
    }
  };
  const popup = async (content, type = 'CONFIRM', value) => ctx().callGenericPopup(content, ctx().POPUP_TYPE[type], value);
  const askText = async (text, value = '') => {
    const answer = await popup(text, 'INPUT', value);
    return typeof answer === 'string' ? answer.trim() : '';
  };
  const folderOptions = selected => settings.folders.characters.map(folder => `<option value="${escapeHtml(folder.id)}" ${folder.id === selected ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('');

  const pick = avatar => {
    state.picked = avatar;
    state.gear = false;
    state.forceSide = true;
    // полные данные (в ленивом режиме описания у таверны нет, пока карточку не открыли)
    run('Карточка персонажа', () => api.full(avatar));
  };

  const askDelete = async avatars => {
    const box = doc.createElement('div');
    box.className = 'pud-ask';
    const names = avatars.map(avatar => raw(avatar)?.name).filter(Boolean);
    box.innerHTML = `<h3>${avatars.length > 1 ? `Удалить ${plural(avatars.length, 'персонажа', 'персонажей', 'персонажей')}?` : `Удалить «${escapeHtml(names[0] ?? '')}»?`}</h3>
      <p>Карточка удалится насовсем.${avatars.length > 1 ? ` ${escapeHtml(names.join(', '))}.` : ''}</p>
      <label class="checkbox_label"><input type="checkbox" class="pud-del-chats" checked><span>И все их чаты</span></label>`;
    if (!await popup(box)) return;
    const done = await api.remove(avatars, box.querySelector('.pud-del-chats').checked);
    if (done) for (const avatar of avatars) { forgetCharacter(settings, avatar); state.checked.delete(avatar); }
    save();
  };

  const doAction = (act, avatar, book = '') => {
    const character = raw(avatar);
    if (!character) return;
    // окно уходит в док сразу, не дожидаясь, пока таверна загрузит чат
    if (act === 'open') { win.minimize(); run('Открыть чат', () => api.openChat(avatar)); }
    else if (act === 'chats') run('Все чаты', async () => { if (!shared.chats) throw new Error('окно чатов не запущено'); await shared.chats.open(avatar); });
    else if (act === 'fav') run('Избранное', () => api.toggleFav(doc, avatar));
    else if (act === 'archive') { toggleIn(settings.archive.characters, avatar); save(); schedule(); }
    else if (act === 'clone') {
      run('Клонировать', async () => {
        const copy = await api.duplicate(avatar);
        const folder = folderOf(settings, avatar, KIND);
        if (folder) moveToFolder(settings, copy, folder, KIND);
        save();
        state.picked = copy;
        state.forceSide = true;
        globalThis.toastr?.success?.(`Копия «${character.name}» готова.`, 'Пудреница');
      });
    } else if (act === 'png' || act === 'json') run('Экспорт', () => api.exportCard(doc, avatar, act));
    else if (act === 'delete') run('Удалить персонажа', () => askDelete([avatar]));
    else if (act === 'persona') run('В персону', () => api.toPersona(avatar));
    else if (act === 'ext') run('Расширенное описание', () => openExt(avatar));
    else if (act === 'image') { imageInput.dataset.avatar = avatar; imageInput.click(); }
    else if (act === 'lore') {
      const name = book || fieldWorld(avatar);
      if (shared.loreEditor) shared.loreEditor.open(name); else run('Лорбук', () => lore.openLorebook(name));
    } else if (act === 'extra-del') {
      run('Дополнительный лорбук', async () => { lore.setExtraBooks(avatar, lore.extraBooks(avatar).filter(item => item !== book)); state.forceSide = true; });
    }
  };
  const fieldWorld = avatar => String(raw(avatar)?.data?.extensions?.world ?? '');

  list.addEventListener('click', event => {
    const row = event.target.closest('.pud-prow');
    if (!row) return;
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act) { doAction(act, row.dataset.avatar); return; }
    if (state.select) {
      if (state.checked.has(row.dataset.avatar)) state.checked.delete(row.dataset.avatar); else state.checked.add(row.dataset.avatar);
      schedule();
      return;
    }
    pick(row.dataset.avatar);
  });
  list.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('pud-prow')) { event.preventDefault(); event.target.click(); }
  });

  side.addEventListener('click', event => {
    const avatar = state.picked;
    if (!avatar) return;
    const gearItem = event.target.closest('[data-gear]')?.dataset.gear;
    const nativeItem = event.target.closest('[data-native]')?.dataset.native;
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'gear') { state.gear = !state.gear; state.forceSide = true; schedule(); return; }
    if (gearItem || nativeItem) { state.gear = false; state.forceSide = true; }
    if (gearItem === 'native') { api.openNativePanel(doc); schedule(); return; }
    if (gearItem) { doAction(gearItem === 'clone' ? 'clone' : gearItem, avatar); return; }
    if (nativeItem) { run('Ещё…', () => api.runNative(doc, nativeItem)); return; }
    if (act) doAction(act, avatar, event.target.closest('[data-act]')?.dataset.book ?? '');
  });
  let descTimer = 0;
  const saveDescription = textarea => run('Описание', async () => {
    view.clearTimeout(descTimer);
    descTimer = 0;
    if (fieldValue(raw(state.picked), 'description') === textarea.value) return;
    await api.setField(doc, state.picked, 'description', textarea.value);
  });
  side.addEventListener('input', event => {
    const textarea = event.target.closest('textarea[data-field="description"]');
    if (!textarea) return;
    side.querySelector('.pud-cwords').textContent = plural(words(textarea.value), 'слово', 'слова', 'слов');
    view.clearTimeout(descTimer);
    descTimer = view.setTimeout(() => saveDescription(textarea), 700);
  });
  side.addEventListener('focusout', event => {
    const textarea = event.target.closest?.('textarea[data-field="description"]');
    if (textarea && descTimer) saveDescription(textarea);
  });
  side.addEventListener('change', event => {
    const field = event.target.dataset.field;
    const avatar = state.picked;
    if (!avatar || !field || field === 'description') return;
    state.forceSide = true;
    if (field === 'folder') { moveToFolder(settings, avatar, event.target.value, KIND); save(); schedule(); }
    else if (field === 'world') run('Лорбук персонажа', () => api.setWorld(avatar, event.target.value));
    else if (field === 'extra-add' && event.target.value) {
      const name = event.target.value;
      run('Дополнительный лорбук', async () => { lore.setExtraBooks(avatar, [...lore.extraBooks(avatar), name]); });
    } else if (field === 'chat-book') run('Лорбук чата', () => lore.setChatBook(doc, event.target.value));
  });
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    const avatar = imageInput.dataset.avatar;
    imageInput.value = '';
    if (!file || !avatar) return;
    run('Картинка персонажа', async () => {
      if (await api.changeImage(avatar, file)) {
        // новые адреса картинок с меткой, чтобы браузер точно взял свежую
        const key = encodeURIComponent(avatar);
        for (const img of win.element.querySelectorAll('img')) {
          const src = img.getAttribute('src') ?? '';
          if (!src.includes(key)) continue;
          const base = src.replace(/[?&]v=\d+$/, '');
          img.setAttribute('src', `${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`);
        }
      }
    });
  });

  // расширенное описание
  const renderExtHead = () => {
    const character = raw(extAvatar);
    if (!character) { extWin.close(); return; }
    extWho.innerHTML = `<img src="${escapeHtml(api.thumbUrl(character.avatar))}" alt=""><b>${escapeHtml(character.name)}</b>`;
  };
  const openExt = async avatar => {
    await api.full(avatar);
    extAvatar = avatar;
    const character = raw(avatar);
    for (const textarea of extWin.body.querySelectorAll('[data-ext]')) textarea.value = fieldValue(character, textarea.dataset.ext);
    renderExtHead();
    extWin.open();
  };
  const extTimers = new Map();
  const saveExt = textarea => {
    view.clearTimeout(extTimers.get(textarea));
    extTimers.delete(textarea);
    const avatar = extAvatar;
    const field = textarea.dataset.ext;
    if (!avatar || fieldValue(raw(avatar), field) === textarea.value) return;
    api.setField(doc, avatar, field, textarea.value).catch(error => {
      report('расширенное описание', error);
      globalThis.toastr?.error?.('Не сохранилось. Подробности в консоли (F12).', 'Пудреница');
    });
  };
  extWin.body.addEventListener('input', event => {
    const textarea = event.target.closest('[data-ext]');
    if (!textarea) return;
    view.clearTimeout(extTimers.get(textarea));
    extTimers.set(textarea, view.setTimeout(() => saveExt(textarea), 700));
  });
  extWin.body.addEventListener('focusout', event => {
    const textarea = event.target.closest?.('[data-ext]');
    if (textarea && extTimers.has(textarea)) saveExt(textarea);
  });
  undo.push(() => { view.clearTimeout(descTimer); for (const timer of extTimers.values()) view.clearTimeout(timer); });

  /** «Новый нарратор»: the name, the folder and (if the library of prompts has any) the prompt that goes into the description. */
  const addCharacter = () => run('Новый нарратор', async () => {
    const box = doc.createElement('div');
    box.className = 'pud-ask';
    const promptList = normalizePrompts(settings.prompts);
    const preset = state.folder !== ALL && state.folder !== NO_FOLDER ? state.folder : '';
    box.innerHTML = `<h3>Новый нарратор</h3>
      <label class="pud-field"><span>Имя</span><input class="text_pole" data-new="name" maxlength="120"></label>
      <label class="pud-field"><span>Папка</span><select class="text_pole" data-new="folder"><option value="">Без папки</option>${folderOptions(preset)}</select></label>
      ${promptList.length ? `<label class="pud-field"><span>Промпт нарратора</span><select class="text_pole" data-new="prompt"><option value="">Без промпта</option>${promptList.map(item => `<option value="${escapeHtml(item.id)}" ${item.isDefault ? 'selected' : ''}>${escapeHtml(item.name || 'Без названия')}</option>`).join('')}</select></label>` : ''}
      <p class="pud-tech">Картинку, описание и первое сообщение можно задать сразу после создания.</p>`;
    view.setTimeout(() => box.querySelector('input')?.focus(), 50);
    if (!await popup(box)) return;
    const name = box.querySelector('[data-new="name"]').value.trim();
    if (!name) return;
    const promptId = box.querySelector('[data-new="prompt"]')?.value ?? '';
    const promptText = promptId ? (promptList.find(item => item.id === promptId)?.text ?? '') : '';
    const avatar = await api.create(name, promptText);
    // a card that came back without the text (an older tavern) gets it by the second way
    if (promptText) {
      const made = await api.full?.(avatar);
      if (!made || fieldValue(made, 'description') !== promptText) await api.setField(doc, avatar, 'description', promptText);
    }
    moveToFolder(settings, avatar, box.querySelector('[data-new="folder"]').value, KIND);
    save();
    state.view = 'all';
    state.picked = avatar;
    state.forceSide = true;
  });

  // the shelf of the chats (home.js) edits a narrator and makes new ones through this window
  shared.characters = { open: avatar => { if (avatar && raw(avatar)) pick(avatar); win.open(); }, add: () => { win.open(); addCharacter(); }, openNative: () => api.openNativePanel(doc) };
  undo.push(() => { delete shared.characters; });
  win.body.querySelector('.pud-pright').addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { state.view = viewButton.dataset.view; state.checked.clear(); schedule(); return; }
    const folderButton = event.target.closest('[data-folder]');
    if (folderButton) { state.folder = folderButton.dataset.folder; schedule(); return; }
    const tool = event.target.closest('[data-tool]')?.dataset.tool;
    const bulkAct = event.target.closest('[data-bulk]')?.dataset.bulk;
    if (tool === 'select') { state.select = !state.select; state.checked.clear(); schedule(); }
    else if (tool === 'native') api.openNativePanel(doc);
    else if (tool === 'import') api.importFiles(doc);
    else if (tool === 'add') addCharacter();
    else if (tool === 'stats') {
      run('Статистика', async () => {
        const stats = characterStats(all(), settings);
        const rows = [['Всего персонажей', stats.total], ['С чатами', stats.withChats], ['Избранных', stats.favorites], ['В архиве', stats.archived], ['С лорбуком', stats.withLorebook], ['Папок', stats.folders]];
        const box = doc.createElement('div');
        box.className = 'pud-ask pud-stats';
        box.innerHTML = `<h3>Статистика персонажей</h3><dl>${rows.map(([title, value]) => `<dt>${title}</dt><dd>${value}</dd>`).join('')}</dl>`;
        await popup(box, 'TEXT');
      });
    } else if (tool === 'folder-add') {
      run('Новая папка', async () => {
        const name = await askText('Название новой папки');
        const folder = name ? createFolder(settings, name, KIND) : null;
        if (folder) { save(); state.folder = folder.id; }
      });
    } else if (tool === 'folder-del') {
      const folder = settings.folders.characters.find(item => item.id === state.folder);
      if (folder) {
        run('Удалить папку', async () => {
          if (!await popup(`Удалить папку «${folder.name}»? Персонажи из неё останутся, просто без папки.`)) return;
          deleteFolder(settings, folder.id, KIND);
          save();
          state.folder = ALL;
        });
      }
    } else if (bulkAct === 'done') { state.select = false; state.checked.clear(); schedule(); }
    else if (bulkAct === 'all') { for (const row of list.querySelectorAll('.pud-prow')) state.checked.add(row.dataset.avatar); schedule(); }
    else if (bulkAct === 'archive') {
      const back = state.view === 'archive';
      for (const avatar of state.checked) toggleIn(settings.archive.characters, avatar, !back);
      state.checked.clear();
      save();
      schedule();
    } else if (bulkAct === 'move') {
      run('Перенос в папку', async () => {
        const box = doc.createElement('div');
        box.className = 'pud-ask';
        box.innerHTML = `<h3>Куда перенести (${state.checked.size})?</h3><select class="text_pole"><option value="">Без папки</option>${folderOptions('')}</select>`;
        if (!await popup(box)) return;
        for (const avatar of state.checked) moveToFolder(settings, avatar, box.querySelector('select').value, KIND);
        state.checked.clear();
        save();
      });
    } else if (bulkAct === 'delete') run('Удалить персонажей', () => askDelete([...state.checked]));
  });
  folders.addEventListener('dblclick', event => {
    const folder = settings.folders.characters.find(item => item.id === event.target.closest('[data-folder]')?.dataset.folder);
    if (!folder) return;
    run('Переименовать папку', async () => {
      const name = await askText('Новое название папки', folder.name);
      if (name && renameFolder(settings, folder.id, name, KIND)) save();
    });
  });
  search.addEventListener('input', () => { state.query = search.value; schedule(); });
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; schedule(); });

  // ── синхронизация ──
  const types = context.eventTypes ?? {};
  const onEvent = () => { state.forceSide = !side.contains(doc.activeElement); schedule(); };
  for (const name of ['CHARACTER_EDITED', 'CHARACTER_DUPLICATED', 'CHARACTER_RENAMED', 'CHARACTER_PAGE_LOADED', 'CHAT_CHANGED', 'WORLDINFO_SETTINGS_UPDATED']) {
    const type = types[name];
    if (!type || !context.eventSource?.on) continue;
    context.eventSource.on(type, onEvent);
    undo.push(() => context.eventSource.removeListener?.(type, onEvent));
  }
  if (types.CHARACTER_DELETED && context.eventSource?.on) {
    const onDeleted = data => { const avatar = data?.character?.avatar; if (avatar) { forgetCharacter(settings, avatar); save(); } onEvent(); };
    context.eventSource.on(types.CHARACTER_DELETED, onDeleted);
    undo.push(() => context.eventSource.removeListener?.(types.CHARACTER_DELETED, onDeleted));
  }
  return () => { for (const fn of undo.reverse()) fn(); };
}
