/**
 * Окно «Редактор лорбука» вместо родной шторки.
 * Слева записи (поиск, сортировка, тумблер), справа выбранная запись. Всё сохраняется само.
 * Вторичные ключи стоят под основными, между ними — логика. Закрывается только крестиком.
 * Родная шторка спрятана: если таверна или другое расширение открывает её, открывается это окно.
 */
import { report } from '../core/guard.js';
import {
  AT_DEPTH, LOGIC, MATCH_SOURCES, OUTLET, POSITIONS, ROLES, SORTS, TRIGGERS,
  duplicateEntry, entryList, entryTitle, filterEntries, keysOf, originalTarget, parseField, sortEntries,
  strategyOf, strategyPatch,
} from '../core/lore-entries.js';
import { plural } from '../core/library.js';
import { loreApi } from '../integration/lorebooks-api.js';
import { skipSameHtml } from './dom.js';
import { icon } from './icons.js';
import { createWindow } from './window.js';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const SAVE_DELAY = 700;
const STRATEGIES = [
  { value: 'normal', icon: 'key', title: 'По ключам' },
  { value: 'constant', icon: 'pin', title: 'Всегда' },
  { value: 'vector', icon: 'link', title: 'По смыслу' },
];

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, api?: typeof loreApi, shared?: any }} deps
 */
export function startLoreEditor(doc, deps) {
  return createLoreEditor(doc, deps).destroy;
}

/** The second tab of the editor (the first one is the docked one); it keeps no settings of its own. */
const DOCK_GAP = 8;
const DOCK_MIN = 420;

export function createLoreEditor(doc, { context, settings, save, api = loreApi, shared = {}, secondary = false }) {
  const view = doc.defaultView;
  const undo = [];
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const prefs = secondary ? { book: '', sort: settings.loreEditor.sort } : settings.loreEditor;
  let second = null; // the second tab, made on demand
  let library = null; // the window of the library the editor is docked to
  const state = { name: '', data: null, uid: null, query: '', dirty: false, timer: 0, saving: null, missing: false, moreOpen: false };
  // открытие лорбука: номер последнего запроса и флаг, чтобы onToggle окна не открыл другой лорбук поверх
  let tickets = 0;
  let opening = false;

  const win = createWindow(doc, {
    id: secondary ? 'loreeditor2' : 'loreeditor', title: secondary ? 'Редактор лорбука · 2' : 'Редактор лорбука', icon: 'pencil', width: 1180, height: 760, store: settings.windows, save,
    // taking the window by the head by hand detaches it from the library
    onDragEnd: () => { library = null; },
    onToggle: open => {
      if (!open) { flush(); return; }
      // окно вернули из дока без загруженного лорбука — открываем последний
      if (!opening && !state.data && prefs.book && !state.missing) openBook(prefs.book);
      scheduleList();
    },
  });
  undo.push(() => win.destroy());
  win.element.classList.add('pud-lored');
  win.body.innerHTML = `
    <div class="pud-letools">
      <label class="pud-field pud-lebook"><span>Лорбук</span><select class="text_pole" data-tool="book" aria-label="Какой лорбук править"></select></label>
      <label class="pud-leglob" title="Включён для всех чатов"><input type="checkbox" class="pud-exsw" data-tool="global"><span>глобально</span></label>
      <span class="pud-lestatus" aria-live="polite"></span>
      ${secondary ? '' : `<button type="button" class="pud-ptool" data-tool="second" title="Открыть этот лорбук во 2 вкладке">${icon('copy')}</button>`}
      ${secondary ? '' : `<button type="button" class="pud-ptool" data-tool="library" title="Библиотека лорбуков">${icon('book')}</button>`}
    </div>
    <div class="pud-lebody">
      <aside class="pud-leside">
        <label class="pud-search">${icon('search')}<input type="search" placeholder="Искать в записях" aria-label="Поиск по записям"></label>
        <div class="pud-lesort">
          <select class="text_pole" data-tool="sort" aria-label="Сортировка записей">${SORTS.map(item => `<option value="${item.value}">${item.title}</option>`).join('')}</select>
          <button type="button" class="pud-padd" data-tool="new">${icon('plus')}<span>Запись</span></button>
        </div>
        <small class="pud-tech pud-lecnt"></small>
        <div class="pud-lelist" role="listbox" aria-label="Записи"></div>
      </aside>
      <section class="pud-leedit"></section>
    </div>`;
  const bookSelect = win.body.querySelector('[data-tool="book"]');
  const globalSw = win.body.querySelector('[data-tool="global"]');
  const status = win.body.querySelector('.pud-lestatus');
  const list = skipSameHtml(win.body.querySelector('.pud-lelist'));
  const edit = win.body.querySelector('.pud-leedit');
  const search = win.body.querySelector('.pud-leside input[type="search"]');
  const count = win.body.querySelector('.pud-lecnt');
  const sortSelect = win.body.querySelector('[data-tool="sort"]');
  sortSelect.value = SORTS.some(item => item.value === prefs.sort) ? prefs.sort : 'native';

  const toast = (kind, text) => globalThis.toastr?.[kind]?.(text, 'Пудреница');
  const setStatus = text => { status.textContent = text; };
  const current = () => (state.data && state.uid !== null ? state.data.entries[state.uid] ?? null : null);

  // ── сохранение: само, через паузу после последней правки ──
  const persist = async () => {
    view.clearTimeout(state.timer);
    if (state.saving) await state.saving;
    if (!state.dirty || !state.data) return;
    state.dirty = false;
    const { name, data } = state;
    setStatus('сохраняю');
    state.saving = (async () => {
      try {
        await api.save(name, data);
        if (state.name === name) setStatus('сохранено');
      } catch (error) {
        state.dirty = true;
        report('сохранение лорбука', error);
        setStatus('не сохранилось');
        toast('error', 'Лорбук не сохранился. Подробности в консоли (F12).');
      }
    })();
    await state.saving;
    state.saving = null;
  };
  const flush = () => persist().catch(error => report('сохранение лорбука', error));
  const touch = () => {
    state.dirty = true;
    setStatus('правлю');
    view.clearTimeout(state.timer);
    state.timer = view.setTimeout(flush, SAVE_DELAY);
    scheduleList();
  };
  const setField = (field, value) => {
    const entry = current();
    if (!entry) return;
    entry[field] = value;
    const target = originalTarget(field, value, api.keyMap());
    if (target) api.setOriginal(state.data, entry.uid, target[0], target[1]);
    touch();
  };

  // ── список записей ──
  const strategyIcon = entry => STRATEGIES.find(item => item.value === strategyOf(entry));
  const renderList = () => {
    if (!win.isOpen) return;
    try {
      const names = api.names();
      // select не перерисовываем без нужды: иначе он закрывается под мышкой
      const options = `<option value="">выбери лорбук</option>${names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
      if (bookSelect.dataset.html !== options) { bookSelect.innerHTML = options; bookSelect.dataset.html = options; }
      bookSelect.value = names.includes(state.name) ? state.name : '';
      globalSw.disabled = !state.name;
      globalSw.checked = Boolean(state.name) && api.selected().includes(state.name);
      if (!state.data) {
        list.innerHTML = `<p class="pud-lib-empty">${state.missing ? 'Этого лорбука больше нет.' : 'Выбери лорбук сверху.'}</p>`;
        count.textContent = '';
        return;
      }
      const all = entryList(state.data);
      const shown = sortEntries(filterEntries(all, state.query), sortSelect.value);
      list.innerHTML = shown.length ? shown.map(entry => {
        const strategy = strategyIcon(entry);
        return `<div class="pud-lerow${entry.uid === state.uid ? ' on' : ''}${entry.disable ? ' off' : ''}" data-uid="${entry.uid}" role="option" aria-selected="${entry.uid === state.uid}">
            <input type="checkbox" class="pud-exsw" ${entry.disable ? '' : 'checked'} title="${entry.disable ? 'Включить запись' : 'Выключить запись'}" aria-label="Запись включена">
            <span class="pud-lestrat pud-lestrat-${strategy.value}" title="${strategy.title}">${icon(strategy.icon)}</span>
            <div class="pud-lerow-info">
              <b>${escapeHtml(entryTitle(entry))}</b>
            </div>
          </div>`;
      }).join('') : `<p class="pud-lib-empty">${state.query ? 'Ничего не нашлось.' : 'Записей пока нет.'}</p>`;
      count.textContent = state.query ? `найдено ${shown.length} из ${all.length}` : plural(all.length, 'запись', 'записи', 'записей');
    } catch (error) { report('редактор лорбука', error); }
  };
  let queued = false;
  const scheduleList = () => {
    if (queued) return;
    queued = true;
    (view.requestAnimationFrame ?? setTimeout)(() => { queued = false; renderList(); });
  };

  // ── форма записи ──
  const chips = (field, values, placeholder) => `<div class="pud-keys" data-keys="${field}">
      ${values.map((value, index) => `<span class="pud-key${/^\/.+\/[a-z]*$/i.test(value) ? ' pud-key-re' : ''}">${escapeHtml(value)}<button type="button" data-unkey="${index}" title="Убрать" aria-label="Убрать ${escapeHtml(value)}">×</button></span>`).join('')}
      <input class="pud-keyin" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" ${field === 'cfnames' ? 'list="pud-lechars"' : ''}>
    </div>`;
  const filterOf = entry => entry.characterFilter ?? { isExclude: false, names: [], tags: [] };
  const valuesOf = (entry, field) => (field === 'cfnames' ? [...(filterOf(entry).names ?? [])] : keysOf(entry, field));
  const checkbox = (field, title, entry, hint = '') => `<label class="checkbox_label pud-lecheck"${hint ? ` title="${escapeHtml(hint)}"` : ''}><input type="checkbox" data-f="${field}" ${entry[field] ? 'checked' : ''}><span>${title}</span></label>`;
  const tristate = (field, title, entry) => `<label class="pud-field"><span>${title}</span><select class="text_pole" data-f="${field}">
      <option value="" ${entry[field] === null || entry[field] === undefined ? 'selected' : ''}>как в общих настройках</option>
      <option value="true" ${entry[field] === true ? 'selected' : ''}>да</option>
      <option value="false" ${entry[field] === false ? 'selected' : ''}>нет</option>
    </select></label>`;
  const number = (field, title, value, extra = '') => `<label class="pud-field"><span>${title}</span><input class="text_pole" type="number" min="0" data-f="${field}" value="${value === null || value === undefined ? '' : escapeHtml(value)}" ${extra}></label>`;

  const renderForm = () => {
    try {
      const entry = current();
      if (!state.data) { edit.innerHTML = '<p class="pud-lib-empty">Здесь появится запись, когда выберешь лорбук.</p>'; return; }
      if (!entry) { edit.innerHTML = '<p class="pud-lib-empty">Выбери запись слева или создай новую.</p>'; return; }
      const strategy = strategyOf(entry);
      const position = Number(entry.position) || 0;
      const filter = filterOf(entry);
      const characters = (live().characters ?? []).map(character => String(character?.avatar ?? '').replace(/\.[^.]+$/, '')).filter(Boolean);
      const otherBooks = api.names().filter(name => name !== state.name);
      edit.innerHTML = `<div class="pud-leform" data-uid="${entry.uid}">
        <div class="pud-lehead">
          <label class="pud-field pud-lename"><span>Название записи</span><input class="text_pole" data-f="comment" value="${escapeHtml(entry.comment ?? '')}" placeholder="для себя, в промпт не идёт"></label>
          <label class="pud-leon"><input type="checkbox" class="pud-exsw" data-f="disable" ${entry.disable ? '' : 'checked'}><span>${entry.disable ? 'выключена' : 'включена'}</span></label>
        </div>
        <div class="pud-field"><span>Когда срабатывает</span>
          <div class="pud-seg pud-lestrats" role="tablist">${STRATEGIES.map(item => `<button type="button" data-strategy="${item.value}" class="${item.value === strategy ? 'on' : ''}">${icon(item.icon)}<span>${item.title}</span></button>`).join('')}</div>
        </div>
        <div class="pud-lekeys">
          <div class="pud-field"><span>Основные ключи</span>${chips('key', valuesOf(entry, 'key'), 'ключ, Enter или запятая')}</div>
          <label class="pud-lelogic"><span>Основной ключ</span><select class="text_pole" data-f="selectiveLogic">${LOGIC.map(item => `<option value="${item.value}" ${Number(entry.selectiveLogic) === item.value ? 'selected' : ''}>${item.title}</option>`).join('')}</select></label>
          <div class="pud-field"><span>Вторичные ключи</span>${chips('keysecondary', valuesOf(entry, 'keysecondary'), 'вторичный ключ')}</div>
        </div>
        <label class="pud-field pud-lecontent"><span>Содержимое</span><textarea class="text_pole" data-f="content" rows="12">${escapeHtml(entry.content ?? '')}</textarea></label>
        <small class="pud-tech pud-lecount"></small>
        <div class="pud-lepos">
          <label class="pud-field pud-lepos-where"><span>Куда вставлять</span><select class="text_pole" data-f="position">${POSITIONS.map(item => `<option value="${item.value}" ${position === item.value ? 'selected' : ''}>${item.title}</option>`).join('')}</select></label>
          <span class="pud-lepos-depth" ${position === AT_DEPTH ? '' : 'hidden'}>${number('depth', 'Глубина', entry.depth ?? 4)}</span>
          <label class="pud-field pud-lepos-depth" ${position === AT_DEPTH ? '' : 'hidden'}><span>Роль</span><select class="text_pole" data-f="role">${ROLES.map(item => `<option value="${item.value}" ${Number(entry.role) === item.value ? 'selected' : ''}>${item.title}</option>`).join('')}</select></label>
          <label class="pud-field pud-lepos-outlet" ${position === OUTLET ? '' : 'hidden'}><span>Имя выхода</span><input class="text_pole" data-f="outletName" value="${escapeHtml(entry.outletName ?? '')}"></label>
          ${number('order', 'Порядок', entry.order ?? 100)}
          ${number('probability', 'Вероятность, %', entry.probability ?? 100, 'max="100"')}
        </div>
        <details class="pud-lemore">
          <summary>${icon('sliders')}<span>Тонкие настройки</span></summary>
          <div class="pud-lemore-grid">
            <fieldset><legend>Поиск ключей</legend>
              ${number('scanDepth', 'Глубина сканирования (пусто — общая)', entry.scanDepth)}
              ${tristate('caseSensitive', 'Учитывать регистр', entry)}
              ${tristate('matchWholeWords', 'Только целые слова', entry)}
              ${tristate('useGroupScoring', 'Групповой счёт', entry)}
            </fieldset>
            <fieldset><legend>Группа</legend>
              <label class="pud-field"><span>Название группы</span><input class="text_pole" data-f="group" value="${escapeHtml(entry.group ?? '')}" placeholder="несколько через запятую"></label>
              ${number('groupWeight', 'Вес в группе', entry.groupWeight ?? 100)}
              ${checkbox('groupOverride', 'приоритет в группе', entry, 'Из группы выбирается запись с наибольшим порядком, а не случайная')}
            </fieldset>
            <fieldset><legend>Таймеры, в сообщениях</legend>
              ${number('sticky', 'Держится (пусто — нет)', entry.sticky)}
              ${number('cooldown', 'Перерыв (пусто — нет)', entry.cooldown)}
              ${number('delay', 'Задержка (пусто — нет)', entry.delay)}
            </fieldset>
            <fieldset><legend>Рекурсия и бюджет</legend>
              ${checkbox('excludeRecursion', 'не включается от других записей', entry)}
              ${checkbox('preventRecursion', 'не включает другие записи', entry)}
              ${number('delayUntilRecursion', 'Ждать шаг рекурсии (0 — нет)', Number(entry.delayUntilRecursion) || 0)}
              ${checkbox('ignoreBudget', 'не считать в бюджет', entry)}
            </fieldset>
            <fieldset><legend>Искать ключи ещё и в</legend>
              ${MATCH_SOURCES.map(item => checkbox(item.field, item.title, entry)).join('')}
            </fieldset>
            <fieldset><legend>Срабатывает при (ничего — всегда)</legend>
              ${TRIGGERS.map(item => `<label class="checkbox_label pud-lecheck"><input type="checkbox" data-trigger="${item.value}" ${(entry.triggers ?? []).includes(item.value) ? 'checked' : ''}><span>${item.title}</span></label>`).join('')}
            </fieldset>
            <fieldset class="pud-lemore-wide"><legend>Только для персонажей</legend>
              ${chips('cfnames', valuesOf(entry, 'cfnames'), 'имя файла персонажа')}
              <datalist id="pud-lechars">${characters.map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
              <label class="checkbox_label pud-lecheck"><input type="checkbox" data-cf="exclude" ${filter.isExclude ? 'checked' : ''}><span>наоборот: для всех, кроме них</span></label>
              ${filter.tags?.length ? `<small class="pud-tech">Ещё задан фильтр по тегам (${filter.tags.length}), он сохраняется как есть.</small>` : ''}
            </fieldset>
            <fieldset><legend>Прочее</legend>
              <label class="pud-field"><span>ID автоматизации</span><input class="text_pole" data-f="automationId" value="${escapeHtml(entry.automationId ?? '')}"></label>
            </fieldset>
          </div>
        </details>
        <div class="pud-lefoot">
          <span class="pud-tech">UID ${entry.uid}</span>
          <button type="button" class="menu_button" data-entry="duplicate">${icon('copy')}Дублировать</button>
          ${otherBooks.length ? `<button type="button" class="menu_button" data-entry="move">${icon('move')}В другой лорбук</button>` : ''}
          <button type="button" class="menu_button pud-danger" data-entry="delete">${icon('trash')}Удалить запись</button>
        </div>
      </div>`;
      const details = edit.querySelector('.pud-lemore');
      if (details) details.open = Boolean(state.moreOpen);
      countTokens();
    } catch (error) { report('редактор лорбука', error); }
  };

  let tokenTimer = 0;
  const countTokens = () => {
    view.clearTimeout(tokenTimer);
    const entry = current();
    const out = edit.querySelector('.pud-lecount');
    if (!entry || !out) return;
    const text = String(entry.content ?? '');
    out.textContent = plural(text.length, 'символ', 'символа', 'символов');
    tokenTimer = view.setTimeout(async () => {
      try {
        const tokens = await api.tokens(text);
        if (typeof tokens === 'number' && current() === entry) out.textContent = `${plural(text.length, 'символ', 'символа', 'символов')} · ${plural(tokens, 'токен', 'токена', 'токенов')}`;
      } catch (error) { report('подсчёт токенов', error); }
    }, 500);
  };

  // ── открыть лорбук ──
  const openBook = async (name, uid = null) => {
    const ticket = ++tickets;
    opening = true;
    try {
      await api.ready();
      await persist();
      if (ticket !== tickets) return;
      win.open();
      if (!name || !api.names().includes(name)) {
        state.name = ''; state.data = null; state.uid = null; state.missing = Boolean(name);
      } else {
        const data = await api.load(name);
        if (ticket !== tickets) return;
        if (!data?.entries) throw new Error(`не загрузился лорбук ${name}`);
        state.name = name; state.data = data; state.missing = false;
        const uids = entryList(data).map(entry => entry.uid);
        state.uid = uid !== null && uids.includes(uid) ? uid : (state.uid !== null && uids.includes(state.uid) && prefs.book === name ? state.uid : (sortEntries(entryList(data), sortSelect.value)[0]?.uid ?? null));
        prefs.book = name;
        save();
      }
      setStatus(state.data ? 'сохранено' : '');
      renderForm();
      renderList();
    } catch (error) {
      report('открыть лорбук', error);
      toast('error', 'Лорбук не открылся. Подробности в консоли (F12).');
    } finally {
      if (ticket === tickets) opening = false;
    }
  };
  const selectEntry = uid => {
    if (uid === state.uid) return;
    state.uid = uid;
    renderForm();
    scheduleList();
  };

  // ── события окна ──
  win.body.addEventListener('change', event => {
    const target = event.target;
    if (target === bookSelect) { openBook(bookSelect.value); return; }
    if (target === sortSelect) { prefs.sort = sortSelect.value; save(); scheduleList(); return; }
    if (target === globalSw) {
      try { api.setGlobal(doc, state.name, globalSw.checked); } catch (error) { report('глобальное включение', error); }
      return;
    }
    const rowSwitch = target.closest('.pud-lerow .pud-exsw');
    if (rowSwitch) {
      const entry = state.data?.entries[Number(rowSwitch.closest('[data-uid]').dataset.uid)];
      if (!entry) return;
      const keep = state.uid;
      state.uid = entry.uid;
      setField('disable', !rowSwitch.checked);
      state.uid = keep;
      if (entry.uid === state.uid) renderForm();
      return;
    }
    const entry = current();
    if (!entry || !edit.contains(target)) return;
    if (target.dataset.trigger) {
      const triggers = [...edit.querySelectorAll('[data-trigger]')].filter(box => box.checked).map(box => box.dataset.trigger);
      setField('triggers', triggers);
    } else if (target.dataset.cf === 'exclude') {
      setField('characterFilter', { ...filterOf(entry), isExclude: target.checked });
    } else if (target.dataset.f && (target.type === 'checkbox' || target.tagName === 'SELECT')) {
      const field = target.dataset.f;
      if (field === 'disable') {
        setField('disable', !target.checked);
        target.nextElementSibling.textContent = target.checked ? 'включена' : 'выключена';
      } else {
        setField(field, parseField(field, target.type === 'checkbox' ? target.checked : target.value, target.type === 'checkbox' ? 'checkbox' : 'text'));
      }
      if (field === 'position') {
        const position = Number(target.value);
        for (const el of edit.querySelectorAll('.pud-lepos-depth')) el.hidden = position !== AT_DEPTH;
        for (const el of edit.querySelectorAll('.pud-lepos-outlet')) el.hidden = position !== OUTLET;
      }
    }
  });
  win.body.addEventListener('input', event => {
    const target = event.target;
    if (target === search) { state.query = search.value; scheduleList(); return; }
    const field = target.dataset?.f;
    if (!field || target.type === 'checkbox' || target.tagName === 'SELECT' || !current()) return;
    setField(field, parseField(field, target.value));
    if (field === 'probability') setField('useProbability', true);
    if (field === 'content') countTokens();
  });
  // числа приводим к виду, который записался (например, вероятность больше 100)
  win.body.addEventListener('focusout', event => {
    const target = event.target;
    if (target.type !== 'number' || !target.dataset.f || !current()) return;
    const value = current()[target.dataset.f];
    target.value = value === null || value === undefined ? '' : String(value);
  });

  // ключи-чипсы: Enter или запятая добавляет, × убирает, Backspace в пустом поле убирает последний
  const setKeys = (field, values) => {
    const entry = current();
    if (!entry) return;
    const clean = [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
    if (field === 'cfnames') setField('characterFilter', { ...filterOf(entry), names: clean });
    else {
      setField(field, clean);
      if (field === 'keysecondary' && clean.length && !entry.selective) setField('selective', true);
    }
    const box = edit.querySelector(`[data-keys="${field}"]`);
    if (!box) return;
    const placeholder = box.querySelector('.pud-keyin')?.placeholder ?? '';
    const holderEl = doc.createElement('div');
    holderEl.innerHTML = chips(field, valuesOf(entry, field), placeholder);
    box.replaceWith(holderEl.firstElementChild);
    edit.querySelector(`[data-keys="${field}"] .pud-keyin`)?.focus();
  };
  const split = text => {
    try { return api.splitKeys(text); } catch { return String(text).split(','); }
  };
  const commitKeys = (input, extra = '') => {
    const box = input.closest('[data-keys]');
    const text = `${input.value}${extra}`.trim();
    if (!box || !text) return false;
    input.value = '';
    const field = box.dataset.keys;
    setKeys(field, [...valuesOf(current(), field), ...split(text)]);
    return true;
  };
  edit.addEventListener('keydown', event => {
    const input = event.target.closest?.('.pud-keyin');
    if (!input) return;
    const field = input.closest('[data-keys]').dataset.keys;
    // запятая внутри регулярки (/a,b/) — часть ключа
    const inRegex = /^\/(?:[^/\\]|\\.)*$/.test(input.value);
    if (event.key === 'Enter' || (event.key === ',' && !inRegex)) {
      event.preventDefault();
      commitKeys(input);
    } else if (event.key === 'Backspace' && !input.value) {
      const values = valuesOf(current(), field);
      if (values.length) { event.preventDefault(); setKeys(field, values.slice(0, -1)); }
    }
  });
  edit.addEventListener('focusout', event => {
    const input = event.target.closest?.('.pud-keyin');
    if (input && input.value.trim() && !edit.contains(event.relatedTarget?.closest?.('[data-unkey]') ?? null)) {
      // не перерисовываем на потере фокуса, чтобы клик по другому полю не терялся
      const box = input.closest('[data-keys]');
      const field = box.dataset.keys;
      const entry = current();
      const values = [...valuesOf(entry, field), ...split(input.value)];
      input.value = '';
      const clean = [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
      if (field === 'cfnames') setField('characterFilter', { ...filterOf(entry), names: clean });
      else setField(field, clean);
      const holderEl = doc.createElement('div');
      holderEl.innerHTML = chips(field, valuesOf(entry, field), input.placeholder);
      box.replaceWith(holderEl.firstElementChild);
    }
  });
  edit.addEventListener('paste', event => {
    const input = event.target.closest?.('.pud-keyin');
    const text = event.clipboardData?.getData('text') ?? '';
    if (!input || !/[,\n]/.test(text)) return;
    event.preventDefault();
    commitKeys(input, text.replace(/\n+/g, ','));
  });
  edit.addEventListener('toggle', event => { if (event.target.classList?.contains('pud-lemore')) state.moreOpen = event.target.open; }, true);

  win.body.addEventListener('click', event => {
    const unkey = event.target.closest('[data-unkey]');
    if (unkey) {
      const field = unkey.closest('[data-keys]').dataset.keys;
      const values = valuesOf(current(), field);
      values.splice(Number(unkey.dataset.unkey), 1);
      setKeys(field, values);
      return;
    }
    const strategyButton = event.target.closest('[data-strategy]');
    if (strategyButton && current()) {
      const patch = strategyPatch(strategyButton.dataset.strategy);
      setField('constant', patch.constant);
      setField('vectorized', patch.vectorized);
      for (const buttonEl of edit.querySelectorAll('[data-strategy]')) buttonEl.classList.toggle('on', buttonEl === strategyButton);
      return;
    }
    const row = event.target.closest('.pud-lerow');
    if (row && !event.target.closest('.pud-exsw')) { selectEntry(Number(row.dataset.uid)); return; }
    const tool = event.target.closest('[data-tool]')?.dataset.tool;
    if (tool === 'library') { shared.lorebooks?.open?.(); return; }
    if (tool === 'second') { openSecond(state.name, state.uid); return; }
    if (tool === 'new') { addEntry(); return; }
    const act = event.target.closest('[data-entry]')?.dataset.entry;
    if (act === 'duplicate') duplicate();
    else if (act === 'delete') removeEntry();
    else if (act === 'move') moveEntry();
  });

  const addEntry = () => {
    try {
      if (!state.data) return;
      const entry = api.newEntry(state.name, state.data);
      if (!entry) throw new Error('таверна не выдала uid для новой записи');
      const top = Math.max(-1, ...entryList(state.data).filter(item => item !== entry).map(item => Number(item.displayIndex ?? item.uid) || 0));
      entry.displayIndex = top + 1;
      state.uid = entry.uid;
      touch();
      renderForm();
      edit.querySelector('[data-f="comment"]')?.focus();
    } catch (error) { report('новая запись', error); toast('error', 'Запись не создалась. Подробности в консоли (F12).'); }
  };
  const duplicate = () => {
    const copy = state.data && state.uid !== null ? duplicateEntry(state.data, state.uid) : null;
    if (!copy) return;
    state.uid = copy.uid;
    touch();
    renderForm();
  };
  const popup = async (content, type = 'CONFIRM', value) => live().callGenericPopup(content, live().POPUP_TYPE[type], value);
  const removeEntry = async () => {
    const entry = current();
    if (!entry) return;
    try {
      if (!await popup(`Удалить запись «${entryTitle(entry)}»? Вернуть её не получится.`)) return;
      const order = sortEntries(filterEntries(entryList(state.data), state.query), sortSelect.value).map(item => item.uid);
      const index = order.indexOf(entry.uid);
      delete state.data.entries[entry.uid];
      api.deleteOriginal(state.data, entry.uid);
      state.uid = order[index + 1] ?? order[index - 1] ?? null;
      state.dirty = true;
      await persist();
      renderForm();
      renderList();
    } catch (error) { report('удалить запись', error); }
  };
  const moveEntry = async () => {
    const entry = current();
    if (!entry) return;
    try {
      const box = doc.createElement('div');
      box.className = 'pud-ask';
      box.innerHTML = `<h3>Куда отправить «${escapeHtml(entryTitle(entry))}»?</h3>
        <select class="text_pole">${api.names().filter(name => name !== state.name).map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}</select>
        <label class="checkbox_label"><input type="checkbox" data-copy><span>оставить и здесь (копия)</span></label>`;
      if (!await popup(box)) return;
      const target = box.querySelector('select').value;
      const copy = box.querySelector('[data-copy]').checked;
      if (!target) return;
      await persist();
      const ok = await api.moveEntry(state.name, target, entry.uid, copy);
      if (!ok) return;
      await openBook(state.name, copy ? entry.uid : null);
      toast('success', copy ? `Копия лежит в «${target}».` : `Запись теперь в «${target}».`);
    } catch (error) { report('перенос записи', error); }
  };

  // ── связь с библиотекой и таверной ──
  /** Docked: stands beside the library window (to the right if there is room, else to the left), same height. */
  const layoutDock = () => {
    if (!library || !library.isOpen || !win.isOpen) return;
    const lib = library.rect;
    const room = win.viewport;
    const wanted = Math.max(DOCK_MIN, Math.min(prefs.dockWidth ?? 640, 820));
    const right = lib.left + lib.width + DOCK_GAP;
    const spaceRight = room.width - right - DOCK_GAP;
    const spaceLeft = lib.left - DOCK_GAP * 2;
    let left; let width;
    if (spaceRight >= DOCK_MIN) { left = right; width = Math.min(wanted, spaceRight); }
    else if (spaceLeft >= DOCK_MIN) { width = Math.min(wanted, spaceLeft); left = lib.left - DOCK_GAP - width; }
    else { width = Math.min(wanted, room.width - DOCK_GAP * 2); left = room.width - width - DOCK_GAP; }
    win.place({ left, top: lib.top, width, height: lib.height });
  };
  const openSecond = async (name, uid = null) => {
    if (secondary) return;
    await persist();
    second ??= createLoreEditor(doc, { context, settings, save, api, shared: {}, secondary: true });
    await second.controller.open(name, uid);
  };
  const controller = {
    open: (name, uid = null) => { library = null; return openBook(name, uid); },
    /** A click on «править» in the library: opens beside it, the same book again closes it, another book replaces it. */
    async toggleDocked(name, libraryWindow) {
      if (win.isOpen && state.name === name && library) { library = null; win.close(); return false; }
      library = libraryWindow;
      await openBook(name);
      layoutDock();
      return true;
    },
    /** The library moved or changed size: follow it while docked. */
    follow: () => layoutDock(),
    isDocked: () => Boolean(library) && win.isOpen,
    flush: () => Promise.all([persist(), second?.controller.flush()]),
    /** Библиотека переименовала лорбук. */
    renamed(oldName, newName) {
      second?.controller.renamed(oldName, newName);
      if (state.name !== oldName) return;
      state.name = newName;
      prefs.book = newName;
      save();
      if (win.isOpen) openBook(newName, state.uid);
      else { state.data = null; state.uid = null; }
    },
    /** Библиотека удалила лорбук. */
    removed(name) {
      second?.controller.removed(name);
      if (state.name !== name) return;
      view.clearTimeout(state.timer);
      state.dirty = false;
      state.name = ''; state.data = null; state.uid = null; state.missing = true;
      renderForm();
      scheduleList();
    },
  };
  if (!secondary) shared.loreEditor = controller;
  undo.push(() => { if (shared.loreEditor === controller) delete shared.loreEditor; second?.destroy(); });

  const types = context.eventTypes ?? {};
  // чужая правка открытого лорбука (другое расширение, слэш-команда): перечитываем, если у нас нет несохранённого
  const onUpdated = (name, data) => {
    if (name !== state.name || data === state.data || state.dirty || state.saving) return;
    const focused = edit.contains(doc.activeElement);
    api.load(name).then(fresh => {
      if (!fresh?.entries || state.name !== name || state.dirty) return;
      state.data = fresh;
      if (!focused) renderForm();
      scheduleList();
    }).catch(error => report('редактор лорбука', error));
  };
  if (types.WORLDINFO_UPDATED && context.eventSource?.on) {
    context.eventSource.on(types.WORLDINFO_UPDATED, onUpdated);
    undo.push(() => context.eventSource.removeListener?.(types.WORLDINFO_UPDATED, onUpdated));
  }
  if (types.WORLDINFO_SETTINGS_UPDATED && context.eventSource?.on) {
    context.eventSource.on(types.WORLDINFO_SETTINGS_UPDATED, scheduleList);
    undo.push(() => context.eventSource.removeListener?.(types.WORLDINFO_SETTINGS_UPDATED, scheduleList));
  }
  const nativeList = doc.getElementById('world_info');
  if (nativeList) {
    const observer = new view.MutationObserver(() => {
      if (state.name && !api.names().includes(state.name)) controller.removed(state.name);
      scheduleList();
    });
    observer.observe(nativeList, { childList: true, attributes: true, subtree: true, attributeFilter: ['selected'] });
    undo.push(() => observer.disconnect());
  }

  // родная шторка спрятана; кто бы её ни открыл — открываем этот редактор с тем же лорбуком
  const native = secondary ? null : doc.getElementById('WI-SP-button');
  if (native) {
    native.classList.add('pud-replaced');
    undo.push(() => native.classList.remove('pud-replaced'));
    const nativeIcon = native.querySelector('.drawer-icon');
    if (nativeIcon) {
      const observer = new view.MutationObserver(() => {
        if (!nativeIcon.classList.contains('openIcon')) return;
        nativeIcon.classList.replace('openIcon', 'closedIcon');
        native.querySelector('.drawer-content')?.classList.replace('openDrawer', 'closedDrawer');
        // таверна выбирает лорбук в своём списке сразу после клика по иконке
        view.setTimeout(() => {
          const name = api.editorBook(doc);
          try { api.closeNativeEditor(doc); } catch (error) { report('родной редактор', error); }
          if (name) openBook(name);
          else if (shared.lorebooks?.open) shared.lorebooks.open();
          else openBook(prefs.book);
        }, 0);
      });
      observer.observe(nativeIcon, { attributes: true, attributeFilter: ['class'] });
      undo.push(() => observer.disconnect());
    }
  }

  const onUnload = () => { if (state.dirty) flush(); };
  view.addEventListener('beforeunload', onUnload);
  undo.push(() => view.removeEventListener('beforeunload', onUnload));
  renderForm();

  return {
    controller,
    destroy() {
      flush();
      for (const fn of undo.reverse()) fn();
    },
  };
}
