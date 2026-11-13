/**
 * Библиотека чатов на стартовом экране вместо приветствия таверны (ассистент, кнопки, недавние чаты).
 * Пока чат не открыт, таверна рисует своё приветствие в #chat как обычно, а Пудреница прячет #chat и поле ввода
 * и показывает полку с карточками. Клик по карточке только выделяет её, чат открывает кнопка «Открыть».
 * Окно «Все чаты» — список чатов владельца: открыть, переименовать, избранное, архив, удалить, новый.
 */
import { report } from '../core/guard.js';
import {
  PAGE_SIZE, chatKey, groupChats, importLegacy, latestChat, marks, paginate, plural,
  renameMarks, renameOwner, shelfEntries, shelfTags, shortDate, toggleIn, visibleChats,
} from '../core/library.js';
import { tavernApi } from '../integration/tavern.js';
import { icon } from './icons.js';
import { createWindow } from './window.js';
import { EQ_SPOT } from './backstage.js';

export const HOME_ID = 'pud-home';
export const HOME_CLASS = 'pud-home-on';
export const CLOSE_ID = 'pud-close-chat';

const SHELVES = [
  { id: 'recent', title: 'Продолжить', icon: 'heart', head: 'Недавние' },
  { id: 'pinned', title: 'Закреплённые', icon: 'pin', head: 'Закреплённые' },
  { id: 'frequent', title: 'Частые', icon: 'chart', head: 'Частые: больше всего сообщений' },
  { id: 'archive', title: 'Архив', icon: 'archive', head: 'Архив: спрятаны с полки, файлы на месте' },
];

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
/** Превью последнего сообщения: без разметки и лишних пробелов. Длина режется по слову, без многоточия. */
function preview(text, limit = 240) {
  const plain = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/[*_`~#>]+/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), limit * 0.6));
}

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, api?: typeof tavernApi, storage?: { getItem(key: string): string | null }, shared?: any }} deps
 */
export function startHome(doc, { context, settings, save, api = tavernApi, storage = globalThis.localStorage, shared = {} }) {
  const chatEl = doc.getElementById('chat');
  if (!chatEl?.parentElement) return () => {};
  const view = doc.defaultView;
  const undo = [];
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const lib = settings.library;

  try {
    if (importLegacy(settings, key => storage?.getItem(key) ?? null)) {
      globalThis.toastr?.info?.('Закреплённые и архив из Character Chat Pills перенесены в библиотеку.', 'Пудреница');
    }
    save();
  } catch (error) { report('перенос из Character Chat Pills', error); }

  const state = { entries: [], loaded: false, loading: false, error: '', page: 0, query: '', selected: '', busy: false };
  if (!SHELVES.some(shelf => shelf.id === lib.shelf) && !String(lib.shelf).startsWith('tag:')) lib.shelf = 'recent';

  // ── разметка ──
  const home = doc.createElement('section');
  home.id = HOME_ID;
  home.setAttribute('aria-label', 'Библиотека чатов');
  home.innerHTML = `
    <aside class="pud-shelf">
      <h4>Полка</h4>
      <div class="pud-shelf-main"></div>
      <button type="button" class="pud-shelf-it pud-open-chars" title="Все нарраторы: библиотека, папки, описание, лорбуки">${icon('card')}<span>Нарраторы</span></button>
      <div class="pud-shelf-sub pud-shelf-tags-head">Фандомы</div>
      <div class="pud-shelf-tags"></div>
      <div class="pud-shelf-sub">Новый</div>
      <button type="button" class="pud-shelf-it pud-temp" title="Чат с ассистентом, который не сохраняется в файл">${icon('moon')}<span>Временный чат</span></button>
      <button type="button" class="pud-shelf-it pud-newchar" title="Новый нарратор: имя, папка, промпт из библиотеки">${icon('plus')}<span>Новый нарратор</span></button>
      ${EQ_SPOT}
    </aside>
    <main class="pud-lib">
      <header class="pud-lib-head">
        <h3 class="pud-lib-title"></h3>
        <label class="pud-search">${icon('search')}<input type="search" placeholder="Найти персонажа или чат" aria-label="Поиск по библиотеке"></label>
        <button type="button" class="pud-lib-reload" title="Обновить список">${icon('update')}</button>
      </header>
      <div class="pud-polas" role="list"></div>
      <nav class="pud-pager" aria-label="Страницы"></nav>
    </main>`;
  chatEl.after(home);
  undo.push(() => home.remove());
  const shelfMain = home.querySelector('.pud-shelf-main');
  const shelfTagsEl = home.querySelector('.pud-shelf-tags');
  const shelfTagsHead = home.querySelector('.pud-shelf-tags-head');
  const title = home.querySelector('.pud-lib-title');
  const grid = home.querySelector('.pud-polas');
  const pager = home.querySelector('.pud-pager');
  const search = home.querySelector('.pud-search input');

  // кнопка «закрыть чат» на верхней панели: из чата обратно в библиотеку
  const holder = doc.getElementById('top-settings-holder');
  const close = doc.createElement('div');
  close.id = CLOSE_ID;
  close.className = 'drawer';
  close.hidden = true;
  close.innerHTML = `<div class="drawer-icon closedIcon" title="Закрыть чат и вернуться в библиотеку" tabindex="0" role="button">${icon('home')}</div>`;
  if (holder) {
    const hubButton = doc.getElementById('pud-hub-button');
    if (hubButton?.parentElement === holder) hubButton.after(close); else holder.prepend(close);
    undo.push(() => close.remove());
  }
  const onClose = event => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    api.closeChat(doc);
  };
  close.firstElementChild.addEventListener('click', onClose);
  close.firstElementChild.addEventListener('keydown', onClose);

  // окно «Все чаты»
  const chatsWin = createWindow(doc, { id: 'chats', title: 'Все чаты', icon: 'list', width: 720, height: 560, store: settings.windows, save });
  undo.push(() => chatsWin.destroy());
  chatsWin.element.classList.add('pud-chats');
  chatsWin.body.innerHTML = `
    <div class="pud-chats-inner">
      <header class="pud-chats-head">
        <img class="pud-chats-ph" alt="">
        <div class="pud-chats-who"><b></b><span class="pud-tech"></span></div>
        <div class="pud-seg" role="tablist">
          <button type="button" data-arch="0" class="on">Чаты</button>
          <button type="button" data-arch="1">${icon('archive')}Архив</button>
        </div>
      </header>
      <div class="pud-chats-tools">
        <label class="pud-search">${icon('search')}<input type="search" placeholder="Найти по названию или тексту" aria-label="Поиск по чатам"></label>
        <button type="button" class="menu_button pud-chats-new">${icon('plus')}<span>Новый чат</span></button>
      </div>
      <div class="pud-chats-list"></div>
    </div>`;
  const chatsState = { owner: '', archived: false, query: '' };
  const chatsList = chatsWin.body.querySelector('.pud-chats-list');
  const chatsSearch = chatsWin.body.querySelector('.pud-chats-tools input');

  // ── данные ──
  const entryByKey = key => state.entries.find(entry => entry.key === key);
  const imageOf = entry => entry.kind === 'group'
    ? (entry.image || '')
    : `characters/${encodeURIComponent(entry.avatar)}`;

  let generation = 0;
  const load = async () => {
    const mine = ++generation;
    state.loading = true;
    state.error = '';
    render();
    try {
      const ctx = live();
      const recent = await api.fetchRecent(ctx);
      if (mine !== generation) return;
      state.entries = groupChats(recent, ctx.characters, ctx.groups, ctx.tagMap);
      state.loaded = true;
    } catch (error) {
      if (mine !== generation) return;
      report('библиотека чатов', error);
      state.error = 'Не получилось загрузить чаты. Подробности в консоли (F12).';
    } finally {
      if (mine === generation) {
        state.loading = false;
        render();
        renderChats();
      }
    }
  };

  // ── полка ──
  const renderShelf = mark => {
    const count = id => shelfEntries(state.entries, id, mark).length;
    shelfMain.innerHTML = SHELVES.map(shelf => `<button type="button" class="pud-shelf-it${lib.shelf === shelf.id ? ' on' : ''}" data-shelf="${shelf.id}">${icon(shelf.icon)}<span>${shelf.title}</span><span class="pud-n">${state.loaded ? count(shelf.id) : ''}</span></button>`).join('');
    const tags = shelfTags(state.entries, mark, live().tags ?? []);
    shelfTagsHead.hidden = !tags.length;
    shelfTagsEl.innerHTML = tags.map(tag => `<button type="button" class="pud-shelf-it${lib.shelf === `tag:${tag.id}` ? ' on' : ''}" data-shelf="tag:${escapeHtml(tag.id)}">${icon('tag')}<span>${escapeHtml(tag.name)}</span><span class="pud-n">${tag.count}</span></button>`).join('');
  };

  const card = (entry, mark, newest) => {
    const latest = latestChat(entry, mark);
    const count = entry.chats.filter(chat => !mark.archivedChats.has(chatKey(entry.key, chat.file))).length;
    const pinned = mark.pinned.has(entry.key);
    const archived = mark.archived.has(entry.key);
    const image = imageOf(entry);
    return `<article class="pud-pola${state.selected === entry.key ? ' on' : ''}${pinned ? ' pinned' : ''}" role="listitem" data-key="${escapeHtml(entry.key)}" tabindex="0">
      ${newest ? '<span class="pud-pola-last" title="Последний чат"></span>' : ''}
      <span class="pud-pola-cnt" title="${plural(count, 'чат', 'чата', 'чатов')}">${count}</span>
      <div class="pud-pola-ph">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">` : icon('cat')}</div>
      <b class="pud-pola-name">${escapeHtml(entry.name)}</b>
      <span class="pud-pola-date">${escapeHtml(shortDate(entry.last))}${entry.kind === 'group' ? ' · группа' : ''}</span>
      <div class="pud-pola-acts">
        <button type="button" class="pud-pola-open" data-act="open" ${latest ? '' : 'disabled'} title="${latest ? `Открыть «${escapeHtml(latest.name)}»` : 'Все чаты в архиве'}">${icon('chat')}<span>Открыть</span></button>
        <button type="button" class="pud-pola-btn" data-act="all" title="Все чаты">${icon('list')}</button>
        <button type="button" class="pud-pola-btn${pinned ? ' on' : ''}" data-act="pin" title="${pinned ? 'Открепить' : 'Закрепить наверху'}">${icon('pin')}</button>
        <button type="button" class="pud-pola-btn" data-act="archive" title="${archived ? 'Вернуть на полку' : 'Убрать в архив (файлы останутся)'}">${icon(archived ? 'redo' : 'archive')}</button>
        ${entry.kind === 'char' ? `<button type="button" class="pud-pola-btn" data-act="edit" title="Править нарратора: имя, описание, лорбуки">${icon('pencil')}</button>` : ''}
      </div>
    </article>`;
  };

  const render = () => {
    try {
      const mark = marks(settings);
      renderShelf(mark);
      const shelf = SHELVES.find(item => item.id === lib.shelf);
      const tag = lib.shelf.startsWith('tag:') ? (live().tags ?? []).find(item => String(item.id) === lib.shelf.slice(4)) : null;
      title.textContent = shelf?.head ?? (tag ? `Фандом: ${tag.name}` : 'Недавние');
      if (!state.loaded) {
        grid.innerHTML = `<p class="pud-lib-empty">${state.error ? escapeHtml(state.error) : 'Котик собирает чаты…'}</p>`;
        pager.replaceChildren();
        return;
      }
      const list = shelfEntries(state.entries, lib.shelf, mark, state.query);
      const { items, page, pages } = paginate(list, state.page, PAGE_SIZE);
      state.page = page;
      const newest = state.entries.find(entry => !mark.archived.has(entry.key))?.key;
      grid.innerHTML = items.length
        ? items.map(entry => card(entry, mark, entry.key === newest)).join('')
        : `<p class="pud-lib-empty">${state.query ? 'Ничего не нашлось.' : lib.shelf === 'archive' ? 'В архиве пусто.' : lib.shelf === 'pinned' ? 'Закрепи карточку булавкой, и она будет здесь.' : 'Чатов пока нет. Выбери персонажа в списке справа и начни.'}</p>`;
      pager.innerHTML = pages > 1
        ? `<button type="button" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''} title="Назад">‹</button>`
          + Array.from({ length: pages }, (_, index) => `<button type="button" data-page="${index}" class="${index === page ? 'on' : ''}">${index + 1}</button>`).join('')
          + `<button type="button" data-page="${page + 1}" ${page === pages - 1 ? 'disabled' : ''} title="Дальше">›</button>`
        : '';
      if (pages > 1) pager.insertAdjacentHTML('beforeend', `<span class="pud-tech">${PAGE_SIZE} на странице</span>`);
    } catch (error) { report('библиотека чатов', error); }
  };

  // ── окно «Все чаты» ──
  const renderChats = () => {
    if (!chatsWin.isOpen && !chatsState.owner) return;
    const entry = entryByKey(chatsState.owner);
    const inner = chatsWin.body;
    if (!entry) {
      chatsList.innerHTML = '<p class="pud-lib-empty">У этого персонажа больше нет чатов.</p>';
      return;
    }
    const mark = marks(settings);
    const image = imageOf(entry);
    const ph = inner.querySelector('.pud-chats-ph');
    ph.hidden = !image;
    if (image && ph.getAttribute('src') !== image) ph.setAttribute('src', image);
    inner.querySelector('.pud-chats-who b').textContent = entry.name;
    const total = entry.chats.length;
    const archivedCount = entry.chats.filter(chat => mark.archivedChats.has(chatKey(entry.key, chat.file))).length;
    inner.querySelector('.pud-chats-who .pud-tech').textContent = `${plural(total, 'чат', 'чата', 'чатов')} · ${plural(entry.messages, 'сообщение', 'сообщения', 'сообщений')}`;
    for (const button of inner.querySelectorAll('[data-arch]')) button.classList.toggle('on', (button.dataset.arch === '1') === chatsState.archived);
    inner.querySelector('[data-arch="1"]').lastChild.textContent = archivedCount ? `Архив ${archivedCount}` : 'Архив';
    inner.querySelector('.pud-chats-new').hidden = chatsState.archived;
    const chats = visibleChats(entry, mark, { archived: chatsState.archived, query: chatsState.query });
    const newest = latestChat(entry, mark)?.file;
    chatsList.innerHTML = chats.length ? chats.map(chat => {
      const key = chatKey(entry.key, chat.file);
      const fav = mark.favorite.has(key);
      return `<div class="pud-crow${fav ? ' fav' : ''}" data-file="${escapeHtml(chat.file)}">
        <div class="pud-crow-main">
          <div class="pud-crow-title"><b>${escapeHtml(chat.name)}</b>${chat.file === newest ? '<span class="pud-crow-last">последний</span>' : ''}</div>
          <span class="pud-tech">${escapeHtml(shortDate(chat.last))} · ${plural(chat.items, 'сообщение', 'сообщения', 'сообщений')}${chat.size ? ` · ${escapeHtml(chat.size)}` : ''}</span>
          <p class="pud-crow-mes">${escapeHtml(preview(chat.mes))}</p>
        </div>
        <div class="pud-crow-acts">
          <button type="button" class="pud-crow-open" data-act="open" title="Открыть этот чат">${icon('chat')}<span>Открыть</span></button>
          <button type="button" class="pud-crow-btn${fav ? ' on' : ''}" data-act="fav" title="${fav ? 'Убрать из избранного' : 'В избранное (будет сверху)'}">${icon('star')}</button>
          <button type="button" class="pud-crow-btn" data-act="rename" title="Переименовать">${icon('pencil')}</button>
          <button type="button" class="pud-crow-btn" data-act="archive" title="${chatsState.archived ? 'Вернуть из архива' : 'В архив (файл останется)'}">${icon(chatsState.archived ? 'redo' : 'archive')}</button>
          <button type="button" class="pud-crow-btn pud-danger" data-act="delete" title="Удалить файл чата">${icon('trash')}</button>
        </div>
      </div>`;
    }).join('') : `<p class="pud-lib-empty">${chatsState.query ? 'Ничего не нашлось.' : chatsState.archived ? 'В архиве пусто.' : 'Все чаты в архиве.'}</p>`;
  };

  const openChats = key => {
    chatsState.owner = key;
    chatsState.archived = false;
    chatsState.query = '';
    chatsSearch.value = '';
    renderChats();
    chatsWin.open();
  };

  // ── действия ──
  const run = async (what, task) => {
    if (state.busy) return;
    state.busy = true;
    home.classList.add('pud-busy');
    try { await task(); } catch (error) {
      report(what, error);
      globalThis.toastr?.error?.(`${what}: не получилось. Подробности в консоли (F12).`, 'Пудреница');
    } finally {
      state.busy = false;
      home.classList.remove('pud-busy');
    }
  };
  const popup = () => live();
  const ask = async (text, value) => {
    const ctx = popup();
    const answer = await ctx.callGenericPopup(text, ctx.POPUP_TYPE.INPUT, value);
    return typeof answer === 'string' ? answer.trim() : '';
  };
  const confirm = async text => {
    const ctx = popup();
    return Boolean(await ctx.callGenericPopup(text, ctx.POPUP_TYPE.CONFIRM));
  };

  const openEntry = (entry, file) => run('Открыть чат', async () => {
    chatsWin.close();
    await api.openChat(entry, file);
  });

  grid.addEventListener('click', event => {
    const cardEl = event.target.closest('.pud-pola');
    if (!cardEl) return;
    const entry = entryByKey(cardEl.dataset.key);
    if (!entry) return;
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act) {
      state.selected = entry.key;
      for (const item of grid.querySelectorAll('.pud-pola')) item.classList.toggle('on', item === cardEl);
      return;
    }
    const mark = marks(settings);
    if (act === 'open') {
      const latest = latestChat(entry, mark);
      if (latest) openEntry(entry, latest.file);
    } else if (act === 'all') {
      openChats(entry.key);
    } else if (act === 'pin') {
      toggleIn(lib.pinned, entry.key);
      save();
      render();
    } else if (act === 'edit') {
      shared.characters?.open?.(entry.avatar);
    } else if (act === 'archive') {
      toggleIn(settings.archive.characters, entry.key);
      save();
      render();
    }
  });
  grid.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const cardEl = event.target.closest('.pud-pola');
    if (!cardEl || event.target !== cardEl) return;
    event.preventDefault();
    cardEl.click();
  });
  // картинка не загрузилась: миниатюра таверны, потом котик
  grid.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof view.HTMLImageElement)) return;
    const entry = entryByKey(img.closest('.pud-pola')?.dataset.key);
    if (entry?.kind === 'char' && !img.dataset.fallback) {
      img.dataset.fallback = '1';
      img.src = live().getThumbnailUrl?.('avatar', entry.avatar) ?? '/img/ai4.png';
    } else {
      img.replaceWith(doc.createRange().createContextualFragment(icon('cat')));
    }
  }, true);

  home.querySelector('.pud-shelf').addEventListener('click', event => {
    const it = event.target.closest('[data-shelf]');
    if (it) {
      lib.shelf = it.dataset.shelf;
      state.page = 0;
      save();
      render();
      return;
    }
    if (event.target.closest('.pud-temp')) run('Временный чат', () => api.temporaryChat());
    else if (event.target.closest('.pud-newchar')) shared.characters?.add?.();
    else if (event.target.closest('.pud-open-chars')) shared.characters?.open?.();
  });
  pager.addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;
    state.page = Number(button.dataset.page);
    render();
  });
  search.addEventListener('input', () => { state.query = search.value; state.page = 0; render(); });
  home.querySelector('.pud-lib-reload').addEventListener('click', () => load());

  chatsWin.body.addEventListener('click', event => {
    const arch = event.target.closest('[data-arch]');
    if (arch) { chatsState.archived = arch.dataset.arch === '1'; renderChats(); return; }
    const entry = entryByKey(chatsState.owner);
    if (!entry) return;
    if (event.target.closest('.pud-chats-new')) {
      run('Новый чат', async () => { chatsWin.close(); await api.newChat(entry); });
      return;
    }
    const row = event.target.closest('.pud-crow');
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!row || !act) return;
    const chat = entry.chats.find(item => item.file === row.dataset.file);
    if (!chat) return;
    const key = chatKey(entry.key, chat.file);
    if (act === 'open') openEntry(entry, chat.file);
    else if (act === 'fav') { toggleIn(lib.favoriteChats, key); save(); renderChats(); }
    else if (act === 'archive') { toggleIn(lib.archivedChats, key); save(); renderChats(); render(); }
    else if (act === 'rename') {
      run('Переименовать чат', async () => {
        const name = await ask('Новое название чата', chat.name);
        if (!name || name === chat.name) return;
        await api.renameChat(entry, chat.file, name);
        await load();
      });
    } else if (act === 'delete') {
      run('Удалить чат', async () => {
        if (!await confirm(`Удалить чат «${chat.name}»? Файл удалится насовсем.`)) return;
        await api.deleteChat(entry, chat.file);
        toggleIn(lib.favoriteChats, key, false);
        toggleIn(lib.archivedChats, key, false);
        save();
        await load();
      });
    }
  });
  chatsSearch.addEventListener('input', () => { chatsState.query = chatsSearch.value; renderChats(); });

  // ── когда показывать ──
  /** Стартовый экран: чат не выбран, а в #chat либо пусто, либо приветствие таверны. Временный чат — уже чат. */
  const isHome = () => {
    const ctx = live();
    if (ctx.getCurrentChatId?.() !== undefined) return false;
    if (!ctx.chat?.length) return true;
    return Boolean(chatEl.querySelector('.welcomePanel'));
  };
  let shown = null;
  const sync = () => {
    try {
      const on = isHome();
      close.hidden = on;
      if (on === shown) return;
      shown = on;
      doc.body.classList.toggle(HOME_CLASS, on);
      if (on) load();
    } catch (error) { report('библиотека чатов', error); }
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    (view.requestAnimationFrame ?? setTimeout)(() => { queued = false; sync(); });
  };
  undo.push(() => doc.body.classList.remove(HOME_CLASS));

  const observer = new view.MutationObserver(schedule);
  observer.observe(chatEl, { childList: true });
  undo.push(() => observer.disconnect());

  const types = context.eventTypes ?? {};
  const on = (name, handler) => {
    const type = types[name];
    if (!type || !context.eventSource?.on) return;
    context.eventSource.on(type, handler);
    undo.push(() => context.eventSource.removeListener?.(type, handler));
  };
  const reloadIfVisible = () => { if (shown || chatsWin.isOpen) load(); };
  on('CHAT_CHANGED', schedule);
  on('APP_READY', schedule);
  for (const name of ['CHAT_DELETED', 'GROUP_CHAT_DELETED', 'CHARACTER_DELETED', 'GROUP_UPDATED']) on(name, reloadIfVisible);
  on('CHAT_RENAMED', data => {
    try {
      const owner = data?.groupId ? `group:${data.groupId}` : data?.avatarId;
      if (owner && data.oldFileName && data.newFileName) { renameMarks(settings, owner, data.oldFileName, data.newFileName); save(); }
    } catch (error) { report('библиотека чатов', error); }
  });
  on('CHARACTER_RENAMED', (oldAvatar, newAvatar) => {
    try {
      if (oldAvatar && newAvatar && oldAvatar !== newAvatar) { renameOwner(settings, oldAvatar, newAvatar); save(); }
      reloadIfVisible();
    } catch (error) { report('библиотека чатов', error); }
  });

  // окно «Все чаты» нужно и окну персонажей
  shared.chats = {
    async open(key) {
      if (!state.loaded) await load();
      openChats(key);
    },
  };
  undo.push(() => { delete shared.chats; });

  sync();
  return () => { for (const fn of undo.reverse()) fn(); };
}
