/**
 * Окно «Расширения» вместо родной шторки.
 * Слева фильтры и папки, в середине список (включить, выключить, удалить в одном месте), справа выбранное:
 * его родной блок настроек переезжает сюда, пока оно выбрано, и возвращается на шторку потом.
 * Extras API, уведомления об обновлениях и родное «Manage extensions» — под маленькой кнопкой с ключом.
 * Включение и выключение копятся, страница перезагружается одной кнопкой, когда все переключения сделаны.
 */
import { report } from '../core/guard.js';
import {
  NOBODY, OFF, ORPHANS, UPDATE, assignBlocks, buildExtensions, extensionCounts, filterExtensions,
} from '../core/extensions.js';
import { ALL, NO_FOLDER, createFolder, deleteFolder, folderOf, moveToFolder, renameFolder } from '../core/personas.js';
import { extensionApi } from '../integration/extensions-api.js';
import { skipSameHtml } from './dom.js';
import { icon } from './icons.js';
import { REPLACED_EXTENSIONS } from './theme.js';
import { createWindow } from './window.js';

export const EXT_BUTTON_ID = 'pud-ext-button';
export const NATIVE_EXT_DRAWER = 'extensions-settings-button';
const KIND = 'extensions';
const SETTINGS_ROOTS = ['extensions_settings', 'extensions_settings2'];

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, api?: typeof extensionApi }} deps
 */
export function startExtensions(doc, { context, settings, save, api = extensionApi }) {
  const holder = doc.getElementById('top-settings-holder');
  const native = doc.getElementById(NATIVE_EXT_DRAWER);
  if (!holder || !native) return () => {};
  const view = doc.defaultView;
  const undo = [];
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const state = { view: ALL, query: '', picked: '', updates: {}, checked: false, checking: false, pending: new Set(), extras: false, ready: false };

  // ── окно ──
  const win = createWindow(doc, {
    id: 'extensions', title: 'Расширения', icon: 'puzzle', width: 1140, height: 680, store: settings.windows, save,
    onToggle: open => {
      button.firstElementChild.classList.toggle('pud-open', open);
      if (open) { schedule(); if (!state.checked) checkUpdates(); } else returnBlocks();
    },
  });
  undo.push(() => win.destroy());
  win.element.classList.add('pud-exts');
  win.actions.innerHTML = `
    <button type="button" class="pud-ptool" data-tool="extras" title="Extras API, уведомления, родное управление">${icon('key')}</button>
    <button type="button" class="pud-ptool" data-tool="check" title="Проверить обновления">${icon('update')}</button>
    <button type="button" class="pud-padd" data-tool="install">${icon('plus')}<span>Установить</span></button>`;
  win.body.innerHTML = `
    <aside class="pud-exside"></aside>
    <section class="pud-exlist">
      <label class="pud-search">${icon('search')}<input type="search" placeholder="Искать расширение" aria-label="Поиск расширений"></label>
      <div class="pud-exrows" role="list"></div>
      <div class="pud-reload" hidden></div>
    </section>
    <section class="pud-exdetail"><div class="pud-exhead"></div><div class="pud-exslot"></div><div class="pud-exfoot"></div></section>
    <div class="pud-extras" hidden><h4>Под ключиком</h4><div class="pud-extras-body"></div></div>`;
  const sideEl = skipSameHtml(win.body.querySelector('.pud-exside'));
  const rows = skipSameHtml(win.body.querySelector('.pud-exrows'));
  const reloadBar = skipSameHtml(win.body.querySelector('.pud-reload'));
  const head = skipSameHtml(win.body.querySelector('.pud-exhead'));
  const slot = win.body.querySelector('.pud-exslot');
  const foot = skipSameHtml(win.body.querySelector('.pud-exfoot'));
  const extras = win.body.querySelector('.pud-extras');
  const extrasBody = win.body.querySelector('.pud-extras-body');
  const search = win.body.querySelector('.pud-exlist input');

  // ── кнопка на верхней панели вместо родной ──
  const button = doc.createElement('div');
  button.id = EXT_BUTTON_ID;
  button.className = 'drawer';
  button.innerHTML = `<div class="drawer-icon closedIcon" title="Расширения" tabindex="0" role="button">${icon('puzzle')}</div>`;
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
  const nativeIcon = native.querySelector('.drawer-icon');
  if (nativeIcon) {
    const observer = new view.MutationObserver(() => {
      if (!nativeIcon.classList.contains('openIcon')) return;
      nativeIcon.classList.replace('openIcon', 'closedIcon');
      native.querySelector('.drawer-content')?.classList.replace('openDrawer', 'closedDrawer');
      win.open();
    });
    observer.observe(nativeIcon, { attributes: true, attributeFilter: ['class'] });
    undo.push(() => observer.disconnect());
  }

  // ── под ключиком: Extras API и прочее с родной шторки ──
  const movedHome = [];
  const moveIn = (node, target) => {
    if (!node) return;
    movedHome.push({ node, parent: node.parentElement, next: node.nextSibling });
    target.append(node);
  };
  const extrasRow = doc.getElementById('extensions_url')?.closest('.flex-container');
  moveIn(extrasRow?.previousElementSibling?.querySelector('#extensions_status') ? extrasRow.previousElementSibling : null, extrasBody);
  moveIn(extrasRow, extrasBody);
  moveIn(doc.getElementById('extensions_notify_updates')?.closest('label'), extrasBody);
  moveIn(doc.getElementById('extensions_details'), extrasBody);
  undo.push(() => {
    for (const { node, parent, next } of movedHome.reverse()) parent?.insertBefore(node, next?.parentNode === parent ? next : null);
  });

  // ── блоки настроек ──
  /** ключ блока → элемент; блоки, уехавшие в окно, тоже здесь */
  const blocks = new Map();
  const blockTitle = el => (el.querySelector('.inline-drawer-header b, .inline-drawer-toggle b, .inline-drawer-header, h3, h4, b')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const scanBlocks = () => {
    const seen = new Set();
    const consider = el => {
      if (!el.childElementCount && !el.textContent.trim()) return;
      const title = blockTitle(el);
      let key = el.dataset.pudKey;
      if (!key) {
        key = el.id ? `#${el.id}` : title ? `t:${title}` : `c:${el.className}`;
        while (seen.has(key)) key += '+';
        el.dataset.pudKey = key;
      }
      seen.add(key);
      blocks.set(key, el);
    };
    for (const id of SETTINGS_ROOTS) for (const el of doc.getElementById(id)?.children ?? []) consider(el);
    for (const el of slot.children) if (el.dataset.pudKey) consider(el);
    for (const key of [...blocks.keys()]) if (!seen.has(key)) blocks.delete(key);
  };
  const blockList = () => [...blocks.entries()].map(([key, el]) => ({
    key,
    title: blockTitle(el),
    ids: [el.id, el.className, el.querySelector('[id]')?.id].filter(Boolean).join(' '),
  }));

  const shownHome = new Map();
  const returnBlocks = () => {
    for (const [el, home] of shownHome) home.parent?.insertBefore(el, home.next?.parentNode === home.parent ? home.next : null);
    shownHome.clear();
  };
  undo.push(returnBlocks);
  const showBlocks = keys => {
    const want = keys.map(key => blocks.get(key)).filter(Boolean);
    if (want.length === shownHome.size && want.every(el => shownHome.has(el))) return;
    returnBlocks();
    for (const el of want) {
      shownHome.set(el, { parent: el.parentElement, next: el.nextSibling });
      slot.append(el);
      // родные выпадашки настроек раскрываю, чтобы не кликать дважды
      const drawer = el.matches('.inline-drawer') ? el : el.querySelector(':scope > .inline-drawer');
      const content = drawer?.querySelector(':scope > .inline-drawer-content');
      if (content && view.getComputedStyle(content).display === 'none') drawer.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header')?.click();
    }
  };

  // ── данные ──
  const items = () => buildExtensions(api.names(), api.manifest, api.disabled(), api.types(), state.updates);
  const byId = id => items().find(item => item.id === id);
  const replacedTitle = item => REPLACED_EXTENSIONS[item.folder];

  const render = () => {
    if (!win.isOpen || !state.ready) return;
    try {
      scanBlocks();
      const list = items();
      const { owners, orphans } = assignBlocks(blockList(), list, settings.extensionLinks);
      const counts = extensionCounts(list, settings);
      if (![ALL, UPDATE, OFF, NO_FOLDER, ORPHANS].includes(state.view) && !settings.folders.extensions.some(folder => folder.id === state.view)) state.view = ALL;
      const it = (id, title, iconName, count, cls = '') => `<button type="button" class="pud-shelf-it${state.view === id ? ' on' : ''} ${cls}" data-view="${escapeHtml(id)}">${icon(iconName)}<span>${escapeHtml(title)}</span><span class="pud-n">${count ?? 0}</span></button>`;
      const active = settings.folders.extensions.find(folder => folder.id === state.view);
      sideEl.innerHTML = it(ALL, 'Все', 'puzzle', counts[ALL])
        + it(UPDATE, state.checking ? 'Нужно обновить…' : 'Нужно обновить', 'update', counts[UPDATE], 'pud-ex-upd')
        + it(OFF, 'Отключённые', 'moon', counts[OFF], 'pud-ex-off')
        + (orphans.length ? it(ORPHANS, 'Настройки без хозяина', 'link', orphans.length) : '')
        + '<div class="pud-shelf-sub">Папки</div>'
        + settings.folders.extensions.map(folder => it(folder.id, folder.name, 'folder', counts[folder.id], 'pud-ex-fold')).join('')
        + it(NO_FOLDER, 'Без папки', 'folder', counts[NO_FOLDER], 'pud-ex-fold')
        + `<button type="button" class="pud-shelf-it pud-ex-newfold" data-tool="folder-add">${icon('folderplus')}<span>Новая папка</span></button>`
        + (active ? `<button type="button" class="pud-shelf-it pud-ex-delfold" data-tool="folder-del">${icon('trash')}<span>Удалить папку</span></button>` : '');

      const shown = state.view === ORPHANS ? [] : filterExtensions(list, settings, { view: state.view, query: state.query });
      rows.innerHTML = state.view === ORPHANS
        ? '<p class="pud-lib-empty">Эти блоки настроек Пудреница не смогла приписать ни одному расширению. Справа выбери, чьи они.</p>'
        : shown.length ? shown.map(item => {
          const replaced = replacedTitle(item);
          return `<div class="pud-exrow${item.id === state.picked ? ' on' : ''}${item.enabled ? '' : ' off'}" role="listitem" tabindex="0" data-id="${escapeHtml(item.id)}">
            <input type="checkbox" class="pud-exsw" ${item.enabled ? 'checked' : ''} title="${item.enabled ? 'Выключить' : 'Включить'}" aria-label="Включено">
            <div class="pud-exrow-info">
              <b>${escapeHtml(item.name)}</b>
              <span class="pud-tech">${[item.version, item.author, item.system ? 'встроенное' : item.type === 'global' ? 'для всех' : ''].filter(Boolean).map(escapeHtml).join(' · ')}</span>
            </div>
            <div class="pud-exrow-tags">
              ${item.update ? '<span class="pud-ptag pud-ptag-upd">обновление</span>' : ''}
              ${replaced ? '<span class="pud-ptag">заменено Пудреницей</span>' : ''}
              ${state.pending.has(item.id) ? '<span class="pud-ptag pud-ptag-now">после перезагрузки</span>' : ''}
            </div>
            ${item.system ? '<span></span>' : `<button type="button" class="pud-crow-btn pud-danger" data-act="delete" title="Удалить расширение">${icon('trash')}</button>`}
          </div>`;
        }).join('') : `<p class="pud-lib-empty">${state.query ? 'Ничего не нашлось.' : state.view === UPDATE ? (state.checking ? 'Проверяю обновления…' : 'Все расширения свежие.') : state.view === OFF ? 'Всё включено.' : 'Здесь пусто.'}</p>`;

      reloadBar.hidden = !state.pending.size;
      reloadBar.innerHTML = state.pending.size ? `<span>Изменения заработают после перезагрузки (${state.pending.size}).</span><button type="button" class="menu_button" data-tool="reload">${icon('redo')}Перезагрузить</button>` : '';

      renderDetail(list, owners, orphans);
    } catch (error) { report('расширения', error); }
  };

  const renderDetail = (list, owners, orphans) => {
    if (state.view === ORPHANS) {
      head.innerHTML = '<h3>Настройки без хозяина</h3>';
      showBlocks(orphans);
      const options = list.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
      foot.innerHTML = orphans.map(key => `<label class="pud-field pud-orphan"><span>«${escapeHtml(blockTitle(blocks.get(key)) || key)}» — чьи?</span><select class="text_pole" data-link="${escapeHtml(key)}"><option value="">Не знаю</option>${options}</select></label>`).join('');
      return;
    }
    const item = list.find(entry => entry.id === state.picked);
    if (!item) {
      head.innerHTML = '<p class="pud-lib-empty">Выбери расширение в списке: здесь появятся его настройки.</p>';
      showBlocks([]);
      foot.innerHTML = '';
      return;
    }
    const mine = owners[item.id] ?? [];
    const replaced = replacedTitle(item);
    head.innerHTML = `
      <div class="pud-exhead-row"><h3>${escapeHtml(item.name)}</h3>
        <label class="pud-exswitch"><input type="checkbox" class="pud-exsw" data-id="${escapeHtml(item.id)}" ${item.enabled ? 'checked' : ''}><span>${item.enabled ? 'включено' : 'выключено'}</span></label></div>
      <span class="pud-tech">${[item.version && `версия ${item.version}`, item.author, item.system ? 'встроенное, обновляется вместе с таверной' : item.folder].filter(Boolean).map(escapeHtml).join(' · ')}</span>
      ${replaced ? '<p class="pud-hint">Его работу делает Пудреница, его можно выключить.</p>' : ''}
      <div class="pud-exhead-acts">
        ${item.update ? `<button type="button" class="menu_button pud-exupd" data-act="update">${icon('update')}Обновить</button>` : ''}
        <label class="pud-field pud-exfold"><span>Папка</span><select class="text_pole" data-field="folder"><option value="">Без папки</option>${settings.folders.extensions.map(folder => `<option value="${escapeHtml(folder.id)}" ${folderOf(settings, item.id, KIND) === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('')}</select></label>
        ${item.system ? '' : `<button type="button" class="pud-ptool pud-danger" data-act="delete" title="Удалить расширение">${icon('trash')}</button>`}
      </div>`;
    showBlocks(mine);
    const others = orphans.map(key => `<option value="${escapeHtml(key)}">${escapeHtml(blockTitle(blocks.get(key)) || key)}</option>`).join('');
    foot.innerHTML = `${mine.length ? '' : `<p class="pud-hint">${item.enabled ? 'Своих настроек на шторке у него нет (или они живут в другом месте, например в меню палочки).' : 'Расширение выключено, поэтому его настроек нет. Включи и перезагрузи.'}</p>`}
      ${mine.length ? `<button type="button" class="pud-linkfix" data-act="unlink">Это не его настройки</button>` : ''}
      ${others ? `<label class="pud-field"><span>Его настройки не нашлись? Выбери блок</span><select class="text_pole" data-link-to="${escapeHtml(item.id)}"><option value="">—</option>${others}</select></label>` : ''}`;
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    (view.requestAnimationFrame ?? setTimeout)(() => { queued = false; render(); });
  };

  // ── обновления ──
  const checkUpdates = async () => {
    if (state.checking) return;
    state.checking = true;
    state.checked = true;
    schedule();
    try {
      await api.ready();
      const ids = api.names().filter(id => id.startsWith('third-party/'));
      let next = 0;
      const worker = async () => {
        while (next < ids.length) {
          const id = ids[next++];
          state.updates[id] = await api.hasUpdate(id);
          schedule();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      const count = Object.values(state.updates).filter(Boolean).length;
      if (count) globalThis.toastr?.info?.(`Есть обновления: ${count}. Они в «Нужно обновить».`, 'Пудреница');
    } catch (error) { report('проверка обновлений', error); } finally {
      state.checking = false;
      schedule();
    }
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

  const toggle = (id, on) => run(on ? 'Включить расширение' : 'Выключить расширение', async () => {
    await api.setEnabled(id, on);
    if (state.pending.has(id)) state.pending.delete(id); else state.pending.add(id);
  });
  const remove = id => run('Удалить расширение', async () => {
    const item = byId(id);
    if (!item || item.system) return;
    if (!await popup(`Удалить «${item.name}»? Папка расширения удалится с диска, потом таверна перезагрузится.`)) return;
    returnBlocks();
    await api.remove(id);
  });

  win.body.addEventListener('change', event => {
    const target = event.target;
    if (target.classList.contains('pud-exsw')) {
      const id = target.dataset.id ?? target.closest('.pud-exrow')?.dataset.id;
      if (id) toggle(id, target.checked);
      return;
    }
    if (target.dataset.field === 'folder' && state.picked) { moveToFolder(settings, state.picked, target.value, KIND); save(); schedule(); return; }
    if (target.dataset.link !== undefined && target.value) { settings.extensionLinks[target.dataset.link] = target.value; save(); schedule(); return; }
    if (target.dataset.linkTo && target.value) { settings.extensionLinks[target.value] = target.dataset.linkTo; save(); schedule(); }
  });
  win.body.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { state.view = viewButton.dataset.view; schedule(); return; }
    const tool = event.target.closest('[data-tool]')?.dataset.tool;
    if (tool === 'reload') { api.reload(); return; }
    if (tool === 'folder-add') {
      run('Новая папка', async () => {
        const answer = await popup('Название новой папки', 'INPUT', '');
        const folder = typeof answer === 'string' && answer.trim() ? createFolder(settings, answer, KIND) : null;
        if (folder) { save(); state.view = folder.id; }
      });
      return;
    }
    if (tool === 'folder-del') {
      const folder = settings.folders.extensions.find(item => item.id === state.view);
      if (folder) run('Удалить папку', async () => {
        if (!await popup(`Удалить папку «${folder.name}»? Расширения из неё останутся.`)) return;
        deleteFolder(settings, folder.id, KIND);
        save();
        state.view = ALL;
      });
      return;
    }
    const row = event.target.closest('.pud-exrow');
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'delete') { remove(row?.dataset.id ?? state.picked); return; }
    if (act === 'update') {
      const id = state.picked;
      run('Обновить расширение', async () => {
        const hash = await api.update(id);
        state.updates[id] = false;
        state.pending.add(id);
        globalThis.toastr?.success?.(hash ? `${byId(id)?.name} обновлено (${hash}). Перезагрузи страницу.` : 'Уже свежее.', 'Пудреница');
      });
      return;
    }
    if (act === 'unlink') {
      for (const [el] of shownHome) settings.extensionLinks[el.dataset.pudKey] = NOBODY;
      save();
      schedule();
      return;
    }
    if (row && !event.target.closest('input')) { state.picked = row.dataset.id; schedule(); }
  });
  win.body.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('pud-exrow')) { event.preventDefault(); event.target.click(); }
  });
  win.body.addEventListener('dblclick', event => {
    const folder = settings.folders.extensions.find(item => item.id === event.target.closest('[data-view]')?.dataset.view);
    if (!folder) return;
    run('Переименовать папку', async () => {
      const answer = await popup('Новое название папки', 'INPUT', folder.name);
      if (typeof answer === 'string' && renameFolder(settings, folder.id, answer, KIND)) save();
    });
  });
  win.actions.addEventListener('click', event => {
    const tool = event.target.closest('[data-tool]')?.dataset.tool;
    if (tool === 'extras') { state.extras = !state.extras; extras.hidden = !state.extras; event.target.closest('button').classList.toggle('on', state.extras); }
    else if (tool === 'check') { state.updates = {}; state.view = UPDATE; checkUpdates(); }
    else if (tool === 'install') run('Установить расширение', () => api.install());
  });
  search.addEventListener('input', () => { state.query = search.value; schedule(); });

  // расширения дописывают свои блоки на шторку позже нас
  for (const id of SETTINGS_ROOTS) {
    const root = doc.getElementById(id);
    if (!root) continue;
    const observer = new view.MutationObserver(schedule);
    observer.observe(root, { childList: true });
    undo.push(() => observer.disconnect());
  }

  api.ready().then(() => { state.ready = true; schedule(); }).catch(error => report('расширения', error));
  return () => { for (const fn of undo.reverse()) fn(); };
}

