/**
 * Окно «Лорбуки»: библиотека с обложками, вложенными папками, глобальным включением, поиском,
 * созданием, импортом, экспортом, переименованием двойным кликом и выбором нескольких.
 * Вид (галерея или список) запоминается для каждой папки отдельно. Галерея — фиксированная сетка 5×2 со страницами.
 * Карандаш открывает своё окно редактора (lore-editor.js). Общие настройки активации таверны лежат здесь под кнопкой.
 */
import { report } from '../core/guard.js';
import {
  ALL, GLOBAL, GRID_PAGE, LIST_PAGE, NO_FOLDER, bookCounts, buildBooks, canNest, createBookFolder, deleteBookFolder,
  filterBooks, folderTree, forgetBook, importLegacyLorebooks, moveBook, paginate, renameBookFolder, renameBookMarks, viewOf,
} from '../core/lorebooks.js';
import { plural } from '../core/library.js';
import { loreApi } from '../integration/lorebooks-api.js';
import { skipSameHtml } from './dom.js';
import { icon } from './icons.js';
import { createWindow } from './window.js';

export const LORE_BUTTON_ID = 'pud-lore-button';
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, api?: typeof loreApi, shared?: any }} deps
 */
export function startLorebooks(doc, { context, settings, save, api = loreApi, shared = {} }) {
  const holder = doc.getElementById('top-settings-holder');
  if (!holder) return () => {};
  const view = doc.defaultView;
  const undo = [];
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const state = { view: ALL, query: '', page: 0, select: false, checked: new Set(), counts: {}, ready: false, renaming: '' };

  const win = createWindow(doc, {
    id: 'lorebooks', title: 'Лорбуки', icon: 'book', width: 1180, height: 700, store: settings.windows, save,
    onToggle: open => { button.firstElementChild.classList.toggle('pud-open', open); if (open) { boot(); schedule(); } },
  });
  undo.push(() => win.destroy());
  win.element.classList.add('pud-lore');
  // the editor docked to the library follows it when the library is moved or resized
  const follow = new view.MutationObserver(() => shared.loreEditor?.follow?.());
  follow.observe(win.element, { attributes: true, attributeFilter: ['style'] });
  undo.push(() => follow.disconnect());
  win.body.innerHTML = `
    <aside class="pud-exside pud-ltree"></aside>
    <section class="pud-lmain">
      <div class="pud-ptools">
        <label class="pud-search">${icon('search')}<input type="search" placeholder="Искать лорбук" aria-label="Поиск лорбуков"></label>
        <div class="pud-seg pud-lview" role="tablist">
          <button type="button" data-mode="grid" title="Галерея">${icon('grid')}</button>
          <button type="button" data-mode="list" title="Список">${icon('list')}</button>
        </div>
        <button type="button" class="pud-padd" data-tool="create">${icon('plus')}<span>Создать</span></button>
        <button type="button" class="pud-ptool" data-tool="import" title="Импорт (JSON, PNG, несколько сразу)">${icon('import')}</button>
        <button type="button" class="pud-ptool" data-tool="select" title="Выбрать несколько">${icon('checks')}</button>
        <button type="button" class="pud-ptool" data-tool="activation" title="Общие настройки активации лорбуков">${icon('sliders')}</button>
        <input type="file" class="pud-limport" accept=".json,.lorebook,.png" multiple hidden>
        <input type="file" class="pud-lcover-input" accept="image/*" hidden>
      </div>
      <div class="pud-lact" hidden><h4>Общие настройки активации</h4><div class="pud-lact-body"></div></div>
      <h3 class="pud-lib-title pud-ltitle"></h3>
      <div class="pud-lbooks"></div>
      <nav class="pud-pager pud-lpager" aria-label="Страницы"></nav>
      <div class="pud-bulk" hidden></div>
    </section>`;
  const tree = skipSameHtml(win.body.querySelector('.pud-ltree'));
  const books = skipSameHtml(win.body.querySelector('.pud-lbooks'));
  const pager = skipSameHtml(win.body.querySelector('.pud-lpager'));
  const bulk = skipSameHtml(win.body.querySelector('.pud-bulk'));
  const title = win.body.querySelector('.pud-ltitle');
  const search = win.body.querySelector('.pud-ptools input[type="search"]');
  const importInput = win.body.querySelector('.pud-limport');
  const coverInput = win.body.querySelector('.pud-lcover-input');
  const activation = win.body.querySelector('.pud-lact');
  shared.lorebooks = { open: () => win.open() };
  undo.push(() => { delete shared.lorebooks; });

  // общие настройки активации переезжают сюда из родной шторки (обработчики таверны висят на id и работают дальше)
  const nativeActivation = doc.getElementById('wiActivationSettings');
  if (nativeActivation) {
    const home = { parent: nativeActivation.parentElement, next: nativeActivation.nextSibling };
    activation.querySelector('.pud-lact-body').append(nativeActivation);
    undo.push(() => home.parent?.insertBefore(nativeActivation, home.next?.parentNode === home.parent ? home.next : null));
  }

  // кнопка на верхней панели (родную шторку прячет редактор лорбука)
  const button = doc.createElement('div');
  button.id = LORE_BUTTON_ID;
  button.className = 'drawer';
  button.innerHTML = `<div class="drawer-icon closedIcon" title="Лорбуки" tabindex="0" role="button">${icon('book')}</div>`;
  const nativeWi = doc.getElementById('WI-SP-button');
  if (nativeWi?.parentElement === holder) nativeWi.before(button); else holder.append(button);
  undo.push(() => button.remove());
  const onButton = event => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    win.toggle();
  };
  button.firstElementChild.addEventListener('click', onButton);
  button.firstElementChild.addEventListener('keydown', onButton);

  // ── данные ──
  const all = () => buildBooks(api.names(), api.selected(), settings, live().characters ?? [], state.counts);
  const folderKey = () => (state.view === GLOBAL ? GLOBAL : state.view);
  const mode = () => viewOf(settings, folderKey());
  const coverOf = book => book.cover || (book.owner ? `/thumbnail?type=avatar&file=${encodeURIComponent(book.owner)}` : '');
  const countEntries = async names => {
    const missing = names.filter(name => !Object.hasOwn(state.counts, name));
    if (!missing.length) return;
    await Promise.all(missing.map(async name => {
      try { state.counts[name] = await api.entries(name); } catch { state.counts[name] = 0; }
    }));
    schedule();
  };

  const render = () => {
    if (!win.isOpen || !state.ready) return;
    try {
      const list = all();
      const counts = bookCounts(list, settings);
      const known = new Set(settings.folders.lorebooks.map(folder => folder.id));
      if (![ALL, GLOBAL, NO_FOLDER].includes(state.view) && !known.has(state.view)) state.view = ALL;
      const it = (id, name, iconName, count, cls = '', depth = 0) => `<button type="button" class="pud-shelf-it${state.view === id ? ' on' : ''} ${cls}" data-view="${escapeHtml(id)}" style="--pud-depth:${depth}" ${cls.includes('pud-ex-fold') && id !== NO_FOLDER ? 'title="Двойной клик — переименовать"' : ''}>${icon(iconName)}<span>${escapeHtml(name)}</span><span class="pud-n">${count ?? 0}</span></button>`;
      const active = settings.folders.lorebooks.find(folder => folder.id === state.view);
      tree.innerHTML = it(ALL, 'Все', 'book', counts[ALL])
        + it(GLOBAL, 'Включены глобально', 'globe', counts[GLOBAL], 'pud-l-glob')
        + '<div class="pud-shelf-sub">Папки</div>'
        + folderTree(settings).map(({ folder, depth }) => it(folder.id, folder.name, 'folder', counts[folder.id], 'pud-ex-fold pud-l-sub', depth)).join('')
        + it(NO_FOLDER, 'Без папки', 'folder', counts[NO_FOLDER], 'pud-ex-fold')
        + `<button type="button" class="pud-shelf-it pud-ex-newfold" data-tool="folder-add">${icon('folderplus')}<span>${active ? `Папка внутри «${escapeHtml(active.name)}»` : 'Новая папка'}</span></button>`
        + (active ? `<button type="button" class="pud-shelf-it" data-tool="folder-move">${icon('move')}<span>Перенести папку</span></button><button type="button" class="pud-shelf-it pud-ex-delfold" data-tool="folder-del">${icon('trash')}<span>Удалить папку</span></button>` : '');

      title.textContent = state.view === ALL ? 'Все лорбуки' : state.view === GLOBAL ? 'Включены глобально' : state.view === NO_FOLDER ? 'Без папки' : (active?.name ?? '');
      for (const buttonEl of win.body.querySelectorAll('[data-mode]')) buttonEl.classList.toggle('on', buttonEl.dataset.mode === mode());

      const shown = filterBooks(list, settings, { view: state.view, query: state.query });
      const size = mode() === 'grid' ? GRID_PAGE : LIST_PAGE;
      const { items, page, pages } = paginate(shown, state.page, size);
      state.page = page;
      countEntries(items.map(book => book.name));
      books.className = `pud-lbooks pud-l${mode()}${state.select ? ' pud-selmode' : ''}`;
      const entries = book => (book.entries === null ? 'считаю записи' : plural(book.entries, 'запись', 'записи', 'записей'));
      const nameEl = book => `<div class="pud-lname" title="Двойной клик — переименовать">${escapeHtml(book.name)}</div>`;
      const acts = () => `<div class="pud-lacts">
          <button type="button" class="pud-crow-btn" data-act="open" title="Открыть лорбук">${icon('pencil')}</button>
          <button type="button" class="pud-crow-btn" data-act="cover" title="Обложка">${icon('image')}</button>
          <button type="button" class="pud-crow-btn" data-act="move" title="В папку">${icon('move')}</button>
          <button type="button" class="pud-crow-btn" data-act="export" title="Экспорт">${icon('export')}</button>
          <button type="button" class="pud-crow-btn pud-danger" data-act="delete" title="Удалить">${icon('trash')}</button>
        </div>`;
      const sw = book => `<input type="checkbox" class="pud-exsw" ${book.global ? 'checked' : ''} title="${book.global ? 'Выключить глобально' : 'Включить глобально'}" aria-label="Включён глобально">`;
      books.innerHTML = items.length ? items.map(book => {
        const cover = coverOf(book);
        const checked = state.checked.has(book.name) ? ' checked' : '';
        return mode() === 'grid'
          ? `<article class="pud-lcard${checked}" data-name="${escapeHtml(book.name)}">
              <div class="pud-lcov"${cover ? ` style="background-image:url('${escapeHtml(cover).replace(/'/g, '%27')}')"` : ''}>
                <span class="pud-ck" aria-hidden="true"></span>
                ${cover ? '' : icon('book', 'pud-lcov-ic')}
                ${book.global ? `<span class="pud-lglob">${icon('globe')}глобально</span>` : ''}
                ${sw(book)}
                <span class="pud-lcnt">${entries(book)}</span>
                ${book.cover ? `<button type="button" class="pud-lnocover" data-act="nocover" title="Убрать обложку">×</button>` : ''}
              </div>
              ${nameEl(book)}
              ${acts(book)}
            </article>`
          : `<div class="pud-lrow${checked}" data-name="${escapeHtml(book.name)}">
              <span class="pud-ck" aria-hidden="true"></span>
              ${sw(book)}
              <div class="pud-lrow-cov"${cover ? ` style="background-image:url('${escapeHtml(cover).replace(/'/g, '%27')}')"` : ''}>${cover ? '' : icon('book')}</div>
              <div class="pud-lrow-info">${nameEl(book)}<span class="pud-tech">${entries(book)}</span></div>
              ${book.global ? '<span class="pud-ptag pud-ptag-now">глобально</span>' : '<span></span>'}
              ${acts(book)}
            </div>`;
      }).join('') : `<p class="pud-lib-empty">${state.query ? 'Ничего не нашлось.' : state.view === GLOBAL ? 'Глобально ничего не включено.' : 'Здесь пока пусто.'}</p>`;
      pager.innerHTML = pages > 1
        ? `<button type="button" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''} title="Назад">‹</button>`
          + Array.from({ length: pages }, (_, index) => `<button type="button" data-page="${index}" class="${index === page ? 'on' : ''}">${index + 1}</button>`).join('')
          + `<button type="button" data-page="${page + 1}" ${page === pages - 1 ? 'disabled' : ''} title="Дальше">›</button>`
        : '';

      bulk.hidden = !state.select;
      bulk.innerHTML = state.select ? `<span>Выбрано <b>${state.checked.size}</b></span>
        <button type="button" class="menu_button" data-bulk="all">Все на странице</button>
        <button type="button" class="menu_button" data-bulk="on" ${state.checked.size ? '' : 'disabled'}>${icon('globe')}Включить</button>
        <button type="button" class="menu_button" data-bulk="off" ${state.checked.size ? '' : 'disabled'}>${icon('moon')}Выключить</button>
        <button type="button" class="menu_button" data-bulk="move" ${state.checked.size ? '' : 'disabled'}>${icon('move')}В папку</button>
        <button type="button" class="menu_button pud-danger" data-bulk="delete" ${state.checked.size ? '' : 'disabled'}>${icon('trash')}Удалить</button>
        <button type="button" class="menu_button" data-bulk="done">Готово</button>` : '';
      win.body.querySelector('[data-tool="select"]').classList.toggle('on', state.select);
    } catch (error) { report('лорбуки', error); }
  };
  let queued = false;
  const schedule = () => {
    if (queued || state.renaming) return;
    queued = true;
    (view.requestAnimationFrame ?? setTimeout)(() => { queued = false; render(); });
  };

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
  const popup = async (content, type = 'CONFIRM', value) => live().callGenericPopup(content, live().POPUP_TYPE[type], value);
  const askFolder = async (heading, { exclude = '' } = {}) => {
    const box = doc.createElement('div');
    box.className = 'pud-ask';
    const options = folderTree(settings)
      .filter(({ folder }) => !exclude || canNest(settings, exclude, folder.id))
      .map(({ folder, depth }) => `<option value="${escapeHtml(folder.id)}">${'  '.repeat(depth)}${depth ? '└ ' : ''}${escapeHtml(folder.name)}</option>`).join('');
    box.innerHTML = `<h3>${escapeHtml(heading)}</h3><select class="text_pole"><option value="">${exclude ? 'На верхний уровень' : 'Без папки'}</option>${options}</select>`;
    if (!await popup(box)) return null;
    return box.querySelector('select').value;
  };
  const deleteBooks = async names => {
    if (!await popup(names.length > 1 ? `Удалить ${plural(names.length, 'лорбук', 'лорбука', 'лорбуков')}? Файлы удалятся насовсем.` : `Удалить лорбук «${names[0]}»? Файл удалится насовсем.`)) return;
    let done = 0;
    for (const name of names) {
      await shared.loreEditor?.flush?.();
      if (await api.remove(name)) { forgetBook(settings, name); shared.loreEditor?.removed?.(name); state.checked.delete(name); delete state.counts[name]; done++; }
    }
    save();
    if (names.length > 1) globalThis.toastr?.success?.(`Удалено: ${done}.`, 'Пудреница');
  };

  let coverTarget = '';
  const onAction = (act, name) => {
    if (act === 'open') {
      if (shared.loreEditor?.toggleDocked) shared.loreEditor.toggleDocked(name, win).catch(error => report('Открыть лорбук', error));
      else if (shared.loreEditor) shared.loreEditor.open(name);
      else run('Открыть лорбук', async () => api.open(name));
    }
    else if (act === 'cover') { coverTarget = name; coverInput.click(); }
    else if (act === 'nocover') { delete settings.covers.lorebooks[name]; save(); schedule(); }
    else if (act === 'export') run('Экспорт лорбука', async () => { await shared.loreEditor?.flush?.(); await api.exportBook(doc, name); });
    else if (act === 'delete') run('Удалить лорбук', () => deleteBooks([name]));
    else if (act === 'move') {
      run('Перенос в папку', async () => {
        const target = await askFolder(`Куда положить «${name}»?`);
        if (target !== null) { moveBook(settings, name, target); save(); }
      });
    }
  };

  // переименование двойным кликом: правка прямо в названии, сохраняется по Enter или клику мимо
  const startRename = nameEl => {
    const holderEl = nameEl.closest('[data-name]');
    const oldName = holderEl?.dataset.name;
    if (!oldName || state.renaming) return;
    state.renaming = oldName;
    nameEl.contentEditable = 'true';
    nameEl.classList.add('pud-editing');
    nameEl.focus();
    const range = doc.createRange();
    range.selectNodeContents(nameEl);
    const selection = view.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    let finished = false;
    const finish = async keep => {
      if (finished) return;
      finished = true;
      nameEl.contentEditable = 'false';
      nameEl.classList.remove('pud-editing');
      nameEl.removeEventListener('keydown', onKey);
      nameEl.removeEventListener('blur', onBlur);
      const newName = nameEl.textContent.replace(/\s+/g, ' ').trim();
      state.renaming = '';
      if (!keep || !newName || newName === oldName) { nameEl.textContent = oldName; schedule(); return; }
      if (newName.toLowerCase() === oldName.toLowerCase() || api.names().some(item => item.toLowerCase() === newName.toLowerCase())) {
        globalThis.toastr?.warning?.('Лорбук с таким именем уже есть.', 'Пудреница');
        nameEl.textContent = oldName;
        schedule();
        return;
      }
      await run('Переименовать лорбук', async () => {
        await shared.loreEditor?.flush?.();
        await api.rename(doc, oldName, newName);
        renameBookMarks(settings, oldName, newName);
        shared.loreEditor?.renamed?.(oldName, newName);
        if (Object.hasOwn(state.counts, oldName)) { state.counts[newName] = state.counts[oldName]; delete state.counts[oldName]; }
        if (state.checked.delete(oldName)) state.checked.add(newName);
        save();
        globalThis.toastr?.success?.(`Теперь «${newName}». Ссылки персонажей, персон и чата перевязаны.`, 'Пудреница');
      });
    };
    const onKey = event => {
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    };
    const onBlur = () => finish(true);
    nameEl.addEventListener('keydown', onKey);
    nameEl.addEventListener('blur', onBlur);
  };

  books.addEventListener('dblclick', event => {
    const nameEl = event.target.closest('.pud-lname');
    if (nameEl) startRename(nameEl);
  });
  books.addEventListener('click', event => {
    const item = event.target.closest('[data-name]');
    if (!item) return;
    const name = item.dataset.name;
    if (event.target.closest('.pud-exsw')) return;
    if (event.target.closest('.pud-lname.pud-editing')) return;
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act) { onAction(act, name); return; }
    if (state.select) {
      if (state.checked.has(name)) state.checked.delete(name); else state.checked.add(name);
      schedule();
    }
  });
  books.addEventListener('change', event => {
    const sw = event.target.closest('.pud-exsw');
    const name = sw?.closest('[data-name]')?.dataset.name;
    if (name) run('Глобальное включение', async () => api.setGlobal(doc, name, sw.checked));
  });
  coverInput.addEventListener('change', () => {
    const file = coverInput.files?.[0];
    const name = coverTarget;
    coverInput.value = '';
    if (!file || !name) return;
    run('Обложка', async () => {
      settings.covers.lorebooks[name] = await api.uploadCover(file, name);
      save();
    });
  });
  importInput.addEventListener('change', () => {
    const files = [...(importInput.files ?? [])];
    importInput.value = '';
    if (!files.length) return;
    run('Импорт лорбуков', async () => {
      const before = new Set(api.names());
      for (const file of files) await api.importFile(file);
      const target = ![ALL, GLOBAL, NO_FOLDER].includes(state.view) ? state.view : '';
      if (target) for (const name of api.names()) if (!before.has(name)) moveBook(settings, name, target);
      save();
    });
  });

  win.body.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { state.view = viewButton.dataset.view; state.page = 0; schedule(); return; }
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) { settings.views.lorebooks[folderKey()] = modeButton.dataset.mode; state.page = 0; save(); schedule(); return; }
    const pageButton = event.target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) { state.page = Number(pageButton.dataset.page); schedule(); return; }
    const tool = event.target.closest('[data-tool]')?.dataset.tool;
    const bulkAct = event.target.closest('[data-bulk]')?.dataset.bulk;
    const active = settings.folders.lorebooks.find(folder => folder.id === state.view);
    if (tool === 'select') { state.select = !state.select; state.checked.clear(); schedule(); }
    else if (tool === 'activation') { activation.hidden = !activation.hidden; event.target.closest('[data-tool]').classList.toggle('on', !activation.hidden); }
    else if (tool === 'import') importInput.click();
    else if (tool === 'create') {
      run('Новый лорбук', async () => {
        const answer = await popup('Название нового лорбука', 'INPUT', '');
        const name = typeof answer === 'string' ? answer.trim() : '';
        if (!name) return;
        const created = await api.create(name);
        if (created && active) moveBook(settings, created, active.id);
        save();
      });
    } else if (tool === 'folder-add') {
      run('Новая папка', async () => {
        const answer = await popup(active ? `Новая папка внутри «${active.name}»` : 'Название новой папки', 'INPUT', '');
        const folder = typeof answer === 'string' && answer.trim() ? createBookFolder(settings, answer, active?.id ?? null) : null;
        if (folder) { save(); state.view = folder.id; }
      });
    } else if (tool === 'folder-move' && active) {
      run('Перенести папку', async () => {
        const target = await askFolder(`Куда перенести папку «${active.name}»?`, { exclude: active.id });
        if (target === null) return;
        if (target && !canNest(settings, active.id, target)) return;
        active.parent = target || null;
        save();
      });
    } else if (tool === 'folder-del' && active) {
      run('Удалить папку', async () => {
        if (!await popup(`Удалить папку «${active.name}»? Лорбуки и вложенные папки поднимутся на уровень выше, сами файлы останутся.`)) return;
        deleteBookFolder(settings, active.id);
        save();
        state.view = ALL;
      });
    } else if (bulkAct === 'done') { state.select = false; state.checked.clear(); schedule(); }
    else if (bulkAct === 'all') { for (const item of books.querySelectorAll('[data-name]')) state.checked.add(item.dataset.name); schedule(); }
    else if (bulkAct === 'on' || bulkAct === 'off') {
      run('Глобальное включение', async () => { for (const name of state.checked) api.setGlobal(doc, name, bulkAct === 'on'); });
    } else if (bulkAct === 'move') {
      run('Перенос в папку', async () => {
        const target = await askFolder(`Куда перенести (${state.checked.size})?`);
        if (target === null) return;
        for (const name of state.checked) moveBook(settings, name, target);
        state.checked.clear();
        save();
      });
    } else if (bulkAct === 'delete') run('Удалить лорбуки', () => deleteBooks([...state.checked]));
  });
  tree.addEventListener('dblclick', event => {
    const folder = settings.folders.lorebooks.find(item => item.id === event.target.closest('[data-view]')?.dataset.view);
    if (!folder) return;
    run('Переименовать папку', async () => {
      const answer = await popup('Новое название папки', 'INPUT', folder.name);
      if (typeof answer === 'string' && renameBookFolder(settings, folder.id, answer)) save();
    });
  });
  search.addEventListener('input', () => { state.query = search.value; state.page = 0; schedule(); });

  // ── синхронизация ──
  const types = context.eventTypes ?? {};
  const onUpdated = name => { if (typeof name === 'string') delete state.counts[name]; schedule(); };
  for (const name of ['WORLDINFO_SETTINGS_UPDATED', 'WORLDINFO_UPDATED', 'CHARACTER_EDITED', 'CHAT_CHANGED']) {
    const type = types[name];
    if (!type || !context.eventSource?.on) continue;
    context.eventSource.on(type, onUpdated);
    undo.push(() => context.eventSource.removeListener?.(type, onUpdated));
  }
  // список лорбуков таверна держит в #world_info: следим за ним (создание, удаление, импорт, переименование)
  const nativeList = doc.getElementById('world_info');
  if (nativeList) {
    const observer = new view.MutationObserver(() => schedule());
    observer.observe(nativeList, { childList: true, attributes: true, subtree: true, attributeFilter: ['selected'] });
    undo.push(() => observer.disconnect());
  }

  // модули таверны грузятся при первом открытии окна
  let booting = null;
  const boot = () => (booting ??= api.ready()
    .then(async () => {
      if (!settings.library.lorebooksImported) {
        try {
          const moved = importLegacyLorebooks(settings, live().extensionSettings?.lorebookManager, await api.files());
          save();
          if (moved) globalThis.toastr?.info?.('Папки и обложки из My lorebook manager перенесены в окно лорбуков.', 'Пудреница');
        } catch (error) { report('перенос из My lorebook manager', error); }
      }
      state.ready = true;
      schedule();
    })
    .catch(error => report('лорбуки', error)));
  return () => { for (const fn of undo.reverse()) fn(); };
}
