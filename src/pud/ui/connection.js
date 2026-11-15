/**
 * «Соединение»: профили соединения плашками, как значки на телефоне.
 * Родной блок таверны (расширение Connection Manager) переключает профиль выпадающим списком, а править и удалять
 * умеет только выбранный, то есть сначала приходится переключиться. Здесь профили лежат плашками одного размера:
 * нажал — профиль включился; у каждой в уголке свои ✎ (править) и 🗑 (удалить), и профиль при этом не включается.
 * В ✎ правятся название, подпись плашки, API и пресет (выпадающими списками из того, что есть в таверне), адрес сервера
 * (с библиотекой сохранённых адресов), модель, ключ и всё остальное, что хранит профиль; есть «Проверить подключение».
 *
 * Родной список остаётся и делает всю работу: переключаем, выставляя его значение и посылая «change» (так же
 * поступает команда /profile), а значки ➕, 💾, ⟳, ⓘ нажимают родные кнопки. Если Connection Manager выключен,
 * модуль ничего не делает.
 *
 * Подпись плашки — только для этого окна (settings.connectionLabels: id профиля → текст): в самом профиле её нет.
 * Библиотека адресов — settings.connectionUrls: [{ id, label, url }], общая для всех профилей.
 */
import { report } from '../core/guard.js';

const NONE = '<None>';
const NATIVE_OFF = 'pud-conn-native-off';
const LABEL_LIMIT = 40;
/** Старые названия-синонимы API: в списке выбора не нужны (но если профиль уже на таком, он остаётся в списке). */
const API_ALIASES = new Set(['oai', 'kcpp', 'google']);
/** Источники Chat Completion, которые таверна не умеет проверять запросом списка моделей (только тестовым сообщением). */
const NO_VALIDATE_SOURCES = ['claude', 'ai21', 'vertexai', 'perplexity', 'zai', 'minimax'];
const TEST_TIMEOUT_MS = 20000;
const isUrl = text => { try { return /^https?:$/.test(new URL(String(text)).protocol); } catch { return false; } };
const hostOf = text => { try { return new URL(String(text)).host; } catch { return String(text).slice(0, 30); } };

/** Что умеет хранить профиль, по-русски; тип поля подсказывает, чем его править. Ключи — как в Connection Manager. */
const FIELDS = {
  api: { label: 'API', apiList: true },
  'api-url': { label: 'Адрес сервера (endpoint)', url: true },
  model: { label: 'Модель' },
  preset: { label: 'Пресет настроек', presetList: true },
  proxy: { label: 'Прокси-пресет' },
  'secret-id': { label: 'Ключ', secret: true },
  'sysprompt-state': { label: 'Системный промпт: включён', bool: true },
  sysprompt: { label: 'Системный промпт' },
  'instruct-state': { label: 'Instruct: включён', bool: true },
  instruct: { label: 'Шаблон Instruct' },
  context: { label: 'Шаблон контекста' },
  tokenizer: { label: 'Токенайзер' },
  'stop-strings': { label: 'Стоп-строки', long: true },
  'start-reply-with': { label: 'Начало ответа', long: true },
  'reasoning-template': { label: 'Шаблон размышлений' },
  'prompt-post-processing': { label: 'Постобработка промпта' },
  'regex-preset': { label: 'Пресет регэкспов (id)' },
};
/** Какие поля бывают у профиля Chat Completion (cc) и Text Completion (tc). */
const MODE_FIELDS = {
  cc: ['api', 'api-url', 'model', 'preset', 'proxy', 'secret-id', 'stop-strings', 'start-reply-with', 'reasoning-template', 'prompt-post-processing', 'regex-preset'],
  tc: ['api', 'api-url', 'model', 'preset', 'secret-id', 'sysprompt-state', 'sysprompt', 'instruct-state', 'instruct', 'context', 'tokenizer', 'stop-strings', 'start-reply-with', 'reasoning-template', 'regex-preset'],
};

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const cssEscape = value => (globalThis.CSS?.escape ? globalThis.CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&'));
const shorten = (text, max) => (String(text).length > max ? `${String(text).slice(0, max - 1)}…` : String(text));

/**
 * @param {Document} doc
 * @param {{ context: any, settings?: any, save?: () => void }} deps context — SillyTavern.getContext(); settings — настройки Закулисья
 * @returns {() => void} откат
 */
export function startConnection(doc, { context, settings = {}, save = () => {} }) {
  const view = doc.defaultView;
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const store = () => live().extensionSettings?.connectionManager;
  let teardown = () => {};
  let waitObserver = null;
  let gaveUp = 0;

  const labels = () => (settings.connectionLabels && typeof settings.connectionLabels === 'object' ? settings.connectionLabels : (settings.connectionLabels = {}));
  const urls = () => (Array.isArray(settings.connectionUrls) ? settings.connectionUrls : (settings.connectionUrls = []));
  const saveLabels = () => { try { save(); } catch (error) { report('соединение: подписи', error); } };

  const secretsRequest = async (path, body) => {
    const headers = body ? live().getRequestHeaders() : live().getRequestHeaders({ omitContentType: true });
    const response = await fetch(`/api/secrets/${path}`, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) throw new Error(`/api/secrets/${path}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  };

  const mount = select => {
    const row = select.closest('.flex-container');
    if (!row?.parentElement) return () => {};

    const panel = doc.createElement('div');
    panel.className = 'pud-conn pud-conn-panel';
    row.before(panel);
    row.classList.add(NATIVE_OFF);

    const profiles = () => (Array.isArray(store()?.profiles) ? [...store().profiles].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru')) : []);
    const selectedId = () => store()?.selectedProfile ?? '';
    const press = id => { const button = doc.getElementById(id); if (button && !button.classList.contains('disabled')) button.click(); };
    const titleOf = profile => (labels()[profile.id] || profile.name);
    const initialOf = profile => (Array.from(titleOf(profile).trim())[0] ?? '?').toUpperCase();

    const render = () => {
      const list = profiles();
      const current = selectedId();
      const active = list.find(item => item.id === current);
      const tile = (id, title, sub, letter, extra = '') => `
        <div class="pud-conn-tile${id === current ? ' on' : ''}${extra}" data-id="${escapeHtml(id)}">
          <button type="button" class="pud-conn-pick" data-act="pick" data-id="${escapeHtml(id)}" title="${escapeHtml(title)}${sub ? ` · ${escapeHtml(sub)}` : ''}">
            <span class="pud-conn-ico">${escapeHtml(letter)}</span>
            <span class="pud-conn-name">${escapeHtml(title)}</span>
            <span class="pud-conn-sub">${escapeHtml(sub)}</span>
          </button>
          ${id ? `<button type="button" class="pud-conn-mini pud-conn-edit-btn" data-act="edit" data-id="${escapeHtml(id)}" title="Править профиль (он не включается)" aria-label="Править «${escapeHtml(title)}»"><i class="fa-solid fa-pencil"></i></button>
          <button type="button" class="pud-conn-mini pud-conn-del" data-act="del" data-id="${escapeHtml(id)}" title="Удалить профиль (он не включается)" aria-label="Удалить «${escapeHtml(title)}»"><i class="fa-solid fa-trash-can"></i></button>` : ''}
        </div>`;
      panel.innerHTML = `
        <div class="pud-conn-bar">
          <span class="pud-conn-cap">Профили соединения</span>
          <span class="pud-conn-tools">
            <button type="button" class="pud-conn-tool" data-act="create" title="Новый профиль: записать текущее соединение" aria-label="Новый профиль"><i class="fa-solid fa-plus"></i></button>
            <button type="button" class="pud-conn-tool${active ? '' : ' disabled'}" data-act="update" title="Обновить выбранный: записать в него текущие настройки соединения" aria-label="Обновить выбранный"><i class="fa-solid fa-floppy-disk"></i></button>
            <button type="button" class="pud-conn-tool${active ? '' : ' disabled'}" data-act="reload" title="Применить заново выбранный профиль" aria-label="Применить заново"><i class="fa-solid fa-rotate"></i></button>
            <button type="button" class="pud-conn-tool" data-act="details" title="Подробности: что записано в выбранном профиле" aria-label="Подробности"><i class="fa-solid fa-circle-info"></i></button>
          </span>
        </div>
        <div class="pud-conn-grid" role="group" aria-label="Профили соединения">
          ${tile('', 'Без профиля', 'настройки как есть', '∅', ' pud-conn-none')}
          ${list.map(item => tile(item.id, titleOf(item), labels()[item.id] ? item.name : (item.model || item.api || ''), initialOf(item))).join('')}
        </div>
        ${list.length ? '' : '<p class="pud-hint">Профилей пока нет. Значок «+» запишет в профиль то соединение, которое включено сейчас.</p>'}`;
    };

    const switchTo = id => {
      if (!select.querySelector(`option[value="${cssEscape(id)}"]`) && id) return;
      if ((select.value ?? '') === id && selectedId() === id) return;
      select.value = id;
      select.dispatchEvent(new view.Event('change'));
    };

    const popup = async (content, kind, value = '', options = {}) => live().callGenericPopup(content, live().POPUP_TYPE[kind], value, options);

    const removeProfile = async id => {
      const state = store();
      const index = state?.profiles?.findIndex(item => item.id === id) ?? -1;
      if (index < 0) return;
      const profile = state.profiles[index];
      const ok = await popup(`<h3>Удалить профиль?</h3><p>«${escapeHtml(profile.name)}»${profile.id === selectedId() ? ' — он сейчас выбран; настройки соединения останутся как есть' : ''}.</p>`, 'CONFIRM', '', { okButton: 'Удалить', cancelButton: 'Отмена' });
      if (!ok) return;
      const wasSelected = profile.id === selectedId();
      state.profiles.splice(index, 1);
      delete labels()[id];
      saveLabels();
      select.querySelector(`option[value="${cssEscape(id)}"]`)?.remove();
      if (wasSelected) {
        state.selectedProfile = null;
        select.value = '';
        // как «Без профиля»: родной блок сам обновит сведения и кнопки, настройки соединения не трогаются
        select.dispatchEvent(new view.Event('change'));
      }
      live().saveSettingsDebounced?.();
      await live().eventSource?.emit?.(live().eventTypes?.CONNECTION_PROFILE_DELETED, profile);
      render();
    };

    /** Список API для выбора: то, что таверна знает (CONNECT_API_MAP), по виду профиля; текущий остаётся, даже если он псевдоним. */
    const apiOptions = (mode, current) => {
      const map = live().CONNECT_API_MAP ?? {};
      const seen = new Set();
      const out = [];
      for (const [key, config] of Object.entries(map)) {
        if (key !== current) {
          if (API_ALIASES.has(key)) continue;
          if (mode === 'cc' ? config.selected !== 'openai' : config.selected !== 'textgenerationwebui') continue;
        }
        const sig = `${config.selected}|${config.source ?? ''}|${config.type ?? ''}`;
        if (seen.has(sig) && key !== current) continue;
        seen.add(sig);
        out.push(key);
      }
      if (current && !out.includes(current)) out.unshift(current);
      return out;
    };

    /** Пресеты, которые есть в таверне для этого API (те же, что в её списке пресетов). */
    const presetNames = api => {
      try {
        const selected = live().CONNECT_API_MAP?.[api]?.selected;
        const names = selected ? live().getPresetManager?.(selected)?.getAllPresets?.() : null;
        return Array.isArray(names) ? names.filter(Boolean) : [];
      } catch (error) { report('соединение: список пресетов', error); return []; }
    };
    const optionsHtml = (names, current) => {
      const list = current && !names.includes(current) ? [current, ...names] : names;
      return list.map(name => `<option value="${escapeHtml(name)}"${name === current ? ' selected' : ''}>${escapeHtml(name)}${names.includes(name) ? '' : ' (такого нет)'}</option>`).join('');
    };
    const urlLibraryOptions = current => `<option value="">— свой адрес —</option>${urls().map(item => `<option value="${escapeHtml(item.id)}"${item.url === current ? ' selected' : ''}>${escapeHtml(item.label)} — ${escapeHtml(shorten(item.url, 46))}</option>`).join('')}`;

    /** Поле формы: что править и чем. */
    const fieldHtml = (key, value, ctx = {}) => {
      const meta = FIELDS[key];
      let body;
      if (meta.apiList) {
        body = `<select class="text_pole" data-value="${key}">${apiOptions(ctx.mode, value).map(name => `<option value="${escapeHtml(name)}"${name === value ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select>`;
      } else if (meta.presetList) {
        const names = presetNames(ctx.api);
        body = names.length || value
          ? `<select class="text_pole" data-value="${key}">${optionsHtml(names, String(value ?? ''))}</select>`
          : `<input type="text" class="text_pole" data-value="${key}" value="" spellcheck="false" autocomplete="off">`;
      } else if (meta.url) {
        body = `<div class="pud-conn-urlrow"><select class="text_pole" data-urlpick>${urlLibraryOptions(String(value ?? ''))}</select><button type="button" class="pud-conn-mini2" data-urldel title="Убрать выбранный адрес из библиотеки" aria-label="Убрать адрес из библиотеки"><i class="fa-solid fa-trash-can"></i></button></div>
          <input type="text" class="text_pole" data-value="${key}" value="${escapeHtml(value)}" spellcheck="false" autocomplete="off" placeholder="http://127.0.0.1:5001">
          <div class="pud-conn-urlrow"><input type="text" class="text_pole" data-urllabel placeholder="Подпись в библиотеке (необязательно)" maxlength="40"><button type="button" class="menu_button" data-urlsave title="Запомнить этот адрес в библиотеке адресов"><i class="fa-regular fa-star"></i><span>В библиотеку</span></button></div>`;
      } else if (meta.bool) {
        body = `<select class="text_pole" data-value="${key}"><option value="true"${String(value) === 'true' ? ' selected' : ''}>да</option><option value="false"${String(value) === 'false' ? ' selected' : ''}>нет</option></select>`;
      } else if (meta.long) {
        body = `<textarea class="text_pole" rows="2" data-value="${key}">${escapeHtml(value)}</textarea>`;
      } else {
        body = `<input type="text" class="text_pole" data-value="${key}" value="${escapeHtml(value)}" spellcheck="false" autocomplete="off"${key === 'model' ? ' list="pud-conn-models"' : ''}>${key === 'model' ? '<datalist id="pud-conn-models"></datalist>' : ''}`;
      }
      return `<div class="pud-conn-field" data-field="${key}">
        <span class="pud-conn-flabel">${meta.label}${meta.apiList ? '' : `<label class="pud-conn-drop" title="Профиль перестанет менять эту настройку"><input type="checkbox" data-drop="${key}"> не хранить</label>`}</span>
        ${body}
      </div>`;
    };

    /** Проверка подключения по тому, что сейчас в форме. Ключ — через secret_id: сервер берёт именно его, активный ключ не меняется. */
    const testConnection = async draft => {
      const config = live().CONNECT_API_MAP?.[draft.api];
      if (!config) return { ok: false, text: `Таверна не знает API «${draft.api}».` };
      const controller = new view.AbortController();
      const timer = view.setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
      try {
        let path;
        let body;
        if (config.selected === 'openai') {
          if (NO_VALIDATE_SOURCES.includes(config.source)) {
            return { ok: null, text: `У «${draft.api}» таверна проверяет ключ только тестовым сообщением: список моделей без него не отдаётся. Включи профиль и напиши в чат.` };
          }
          path = '/api/backends/chat-completions/status';
          body = { chat_completion_source: config.source, secret_id: draft.secretId || undefined };
          if (config.source === 'custom') {
            if (!isUrl(draft.url)) return { ok: false, text: 'Адрес сервера не похож на адрес (нужен http:// или https://).' };
            body.custom_url = draft.url;
            body.custom_include_headers = live().chatCompletionSettings?.custom_include_headers ?? '';
          }
        } else if (config.selected === 'textgenerationwebui') {
          if (!isUrl(draft.url)) return { ok: false, text: 'Впиши адрес сервера (http:// или https://).' };
          path = '/api/backends/text-completions/status';
          body = { api_server: draft.url, api_type: config.type, secret_id: draft.secretId || undefined };
        } else {
          return { ok: null, text: `Для «${draft.api}» проверка отсюда не поддерживается: подключись к нему обычным способом.` };
        }
        const response = await fetch(path, { method: 'POST', headers: live().getRequestHeaders(), body: JSON.stringify(body), cache: 'no-cache', signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.error) {
          return { ok: false, text: `Не отвечает или отказывает${response.ok ? '' : ` (код ${response.status})`}${data?.message ? `: ${data.message}` : ''}. Проверь адрес и ключ.` };
        }
        const models = (Array.isArray(data?.data) ? data.data : []).map(item => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
        const note = !draft.model || !models.length ? '' : models.includes(draft.model) ? ` Модель «${draft.model}» на месте.` : ` ⚠ Модели «${draft.model}» в списке сервера нет.`;
        return { ok: true, models, text: `Работает${models.length ? `, моделей: ${models.length}` : ''}.${note}` };
      } catch (error) {
        return { ok: false, text: error?.name === 'AbortError' ? `Нет ответа за ${TEST_TIMEOUT_MS / 1000} с.` : `Не получилось: ${error?.message ?? error}` };
      } finally {
        view.clearTimeout(timer);
      }
    };

    const editProfile = async id => {
      const state = store();
      const profile = state?.profiles?.find(item => item.id === id);
      if (!profile) return;
      const mode = profile.mode === 'tc' ? 'tc' : 'cc';

      // ключи, сохранённые в таверне: нужна группа, в которой лежит ключ этого профиля
      let secrets = {};
      try { secrets = (await secretsRequest('read')) ?? {}; } catch (error) { report('соединение: список ключей', error); }
      const group = profile['secret-id'] ? Object.keys(secrets).find(key => Array.isArray(secrets[key]) && secrets[key].some(item => item.id === profile['secret-id'])) : '';
      const saved = group ? secrets[group] : [];

      const present = MODE_FIELDS[mode].filter(key => key !== 'secret-id' && profile[key] !== undefined && profile[key] !== null);
      const absent = MODE_FIELDS[mode].filter(key => key !== 'secret-id' && !present.includes(key));

      const box = doc.createElement('div');
      box.className = 'pud-conn-editbox';
      box.innerHTML = `
        <h3>Профиль «${escapeHtml(profile.name)}»</h3>
        <div class="pud-conn-field"><span class="pud-conn-flabel">Название профиля</span><input type="text" class="text_pole" data-name value="${escapeHtml(profile.name)}" maxlength="120"></div>
        <div class="pud-conn-field"><span class="pud-conn-flabel">Подпись плашки</span><input type="text" class="text_pole" data-caption value="${escapeHtml(labels()[id] ?? '')}" maxlength="${LABEL_LIMIT}" placeholder="${escapeHtml(profile.name)}"><span class="pud-hint">Только для плашки в Закулисье, в самом профиле её нет. Пусто — на плашке название профиля.</span></div>
        ${group ? `<div class="pud-conn-field" data-field="secret-id"><span class="pud-conn-flabel">Ключ</span>
          <select class="text_pole" data-secret>${saved.map(item => `<option value="${escapeHtml(item.id)}"${item.id === profile['secret-id'] ? ' selected' : ''}>${escapeHtml(item.label || 'без подписи')} (${escapeHtml(item.value)})</option>`).join('')}<option value="__new__">＋ Новый ключ…</option></select>
          <div class="pud-conn-newkey" hidden>
            <input type="password" class="text_pole" data-newkey placeholder="Вставь ключ" autocomplete="off" spellcheck="false">
            <input type="text" class="text_pole" data-newlabel placeholder="Подпись ключа (необязательно)" maxlength="60">
            <span class="pud-hint">Ключ сохранится в хранилище таверны, как в «Подключении к API»; активным ключом API он не станет, он закрепится только за этим профилем.</span>
          </div></div>` : ''}
        ${present.map(key => fieldHtml(key, profile[key], { mode, api: profile.api })).join('')}
        <div class="pud-conn-testrow"><button type="button" class="menu_button" data-test><i class="fa-solid fa-plug-circle-check"></i><span>Проверить подключение</span></button><span class="pud-conn-testout" role="status" aria-live="polite"></span></div>
        ${absent.length ? `<div class="pud-conn-add"><select class="text_pole" data-add><option value="">＋ Добавить в профиль настройку…</option>${absent.map(key => `<option value="${key}">${FIELDS[key].label}</option>`).join('')}</select></div>` : ''}
        <p class="pud-hint">«Не хранить»: профиль перестанет менять эту настройку при включении. Включённый профиль после сохранения применится заново.</p>`;
      const valueOf = key => box.querySelector(`[data-value="${key}"]`)?.value ?? '';
      const syncUrlPick = () => {
        const pick = box.querySelector('[data-urlpick]');
        if (!pick) return;
        pick.innerHTML = urlLibraryOptions(valueOf('api-url'));
      };
      box.addEventListener('change', event => {
        const target = event.target;
        if (target.matches('[data-secret]')) box.querySelector('.pud-conn-newkey').hidden = target.value !== '__new__';
        if (target.matches('[data-add]') && target.value) {
          const key = target.value;
          target.querySelector(`option[value="${key}"]`)?.remove();
          target.value = '';
          box.querySelector('.pud-conn-testrow').insertAdjacentHTML('afterend', fieldHtml(key, key.endsWith('-state') ? 'true' : '', { mode, api: valueOf('api') || profile.api }));
          box.querySelector(`[data-value="${key}"]`)?.focus();
        }
        // другой API: пресеты берутся из его списка; прежний пресет остаётся, только если такой есть и там
        if (target.matches('[data-value="api"]')) {
          const field = box.querySelector('[data-field="preset"]');
          if (field) {
            const old = valueOf('preset');
            const names = presetNames(target.value);
            field.outerHTML = fieldHtml('preset', names.includes(old) ? old : (names[0] ?? ''), { mode, api: target.value });
          }
        }
        if (target.matches('[data-urlpick]')) {
          const item = urls().find(entry => entry.id === target.value);
          const input = box.querySelector('[data-value="api-url"]');
          if (item && input) input.value = item.url;
        }
      });
      box.addEventListener('input', event => {
        if (event.target.matches('[data-value="api-url"]')) syncUrlPick();
      });
      box.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.matches('[data-urlsave]')) {
          const url = valueOf('api-url').trim();
          if (!isUrl(url)) { globalThis.toastr?.warning?.('Сначала впиши адрес (http:// или https://).', 'Закулисье'); return; }
          const label = String(box.querySelector('[data-urllabel]')?.value ?? '').trim() || hostOf(url);
          const known = urls().find(item => item.url === url);
          if (known) known.label = label;
          else urls().push({ id: `url-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label, url });
          saveLabels();
          syncUrlPick();
          globalThis.toastr?.success?.(`Адрес сохранён в библиотеку: ${label}`, 'Закулисье');
        } else if (button.matches('[data-urldel]')) {
          const pick = box.querySelector('[data-urlpick]');
          const index = urls().findIndex(item => item.id === pick?.value);
          if (index < 0) { globalThis.toastr?.info?.('Выбери в списке адрес из библиотеки, который убрать.', 'Закулисье'); return; }
          const [gone] = urls().splice(index, 1);
          saveLabels();
          syncUrlPick();
          globalThis.toastr?.info?.(`Убрано из библиотеки: ${gone.label}`, 'Закулисье');
        } else if (button.matches('[data-test]')) {
          const out = box.querySelector('.pud-conn-testout');
          const choice = box.querySelector('[data-secret]')?.value;
          if (choice === '__new__') { out.className = 'pud-conn-testout warn'; out.textContent = 'Новый ключ ещё не сохранён. Сохрани профиль, потом проверь, или выбери ключ из списка.'; return; }
          out.className = 'pud-conn-testout busy';
          out.textContent = 'Проверяю…';
          button.disabled = true;
          testConnection({ api: valueOf('api') || profile.api, url: valueOf('api-url').trim(), model: valueOf('model').trim(), secretId: group ? (choice || profile['secret-id']) : '' })
            .then(result => {
              out.className = `pud-conn-testout ${result.ok === true ? 'ok' : result.ok === false ? 'bad' : 'warn'}`;
              out.textContent = `${result.ok === true ? '✓ ' : result.ok === false ? '✗ ' : 'ⓘ '}${result.text}`;
              const list = box.querySelector('#pud-conn-models');
              if (list && result.models?.length) list.innerHTML = result.models.slice(0, 400).map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
            })
            .catch(error => { report('соединение: проверка', error); out.className = 'pud-conn-testout bad'; out.textContent = '✗ Не получилось. Подробности в консоли (F12).'; })
            .finally(() => { button.disabled = false; });
        }
      });

      const ok = await popup(box, 'CONFIRM', '', { okButton: 'Сохранить', cancelButton: 'Отмена', wide: true, allowVerticalScrolling: true });
      if (!ok) return;

      const sanitize = globalThis.DOMPurify?.sanitize ? text => globalThis.DOMPurify.sanitize(text) : text => text;
      const name = sanitize(String(box.querySelector('[data-name]')?.value ?? '').trim());
      if (!name || name === NONE) { globalThis.toastr?.error?.('Название не может быть пустым.', 'Закулисье'); return; }
      if (name !== profile.name && state.profiles.some(item => item.id !== id && item.name === name)) { globalThis.toastr?.error?.('Профиль с таким названием уже есть.', 'Закулисье'); return; }

      const before = structuredClone(profile);
      const exclude = new Set(Array.isArray(profile.exclude) ? profile.exclude : []);
      for (const input of box.querySelectorAll('[data-value]')) {
        const key = input.dataset.value;
        if (box.querySelector(`[data-drop="${key}"]`)?.checked) { delete profile[key]; exclude.add(key); continue; }
        const value = String(input.value);
        // пустое значение хранят только те поля, которым пустота законна
        if (!value.trim() && !['stop-strings', 'start-reply-with'].includes(key)) { delete profile[key]; exclude.add(key); continue; }
        profile[key] = value;
        exclude.delete(key);
      }

      // ключ: выбрать другой из сохранённых или записать новый
      const choice = box.querySelector('[data-secret]')?.value;
      if (group && choice) {
        if (choice === '__new__') {
          const value = String(box.querySelector('[data-newkey]')?.value ?? '').trim();
          if (value) {
            try {
              const wasActive = saved.find(item => item.active)?.id;
              const written = await secretsRequest('write', { key: group, value, label: String(box.querySelector('[data-newlabel]')?.value ?? '').trim() || `${name}` });
              if (written?.id) {
                profile['secret-id'] = written.id;
                exclude.delete('secret-id');
                // запись делает новый ключ активным для API: возвращаем прежний, пусть он меняется только вместе с профилем
                if (wasActive && wasActive !== written.id) await secretsRequest('rotate', { key: group, id: wasActive }).catch(error => report('соединение: вернуть активный ключ', error));
              }
            } catch (error) {
              report('соединение: новый ключ', error);
              globalThis.toastr?.error?.('Ключ не сохранился. Подробности в консоли (F12).', 'Закулисье');
            }
          }
        } else if (choice !== profile['secret-id']) {
          profile['secret-id'] = choice;
          exclude.delete('secret-id');
        }
      }
      profile.exclude = [...exclude];

      if (name !== profile.name) {
        profile.name = name;
        const option = select.querySelector(`option[value="${cssEscape(id)}"]`);
        if (option) option.textContent = name;
      }
      const caption = String(box.querySelector('[data-caption]')?.value ?? '').replace(/\s+/g, ' ').trim().slice(0, LABEL_LIMIT);
      if (caption) labels()[id] = caption; else delete labels()[id];
      saveLabels();

      live().saveSettingsDebounced?.();
      await live().eventSource?.emit?.(live().eventTypes?.CONNECTION_PROFILE_UPDATED, before, profile);
      render();
      // правили включённый профиль: пусть изменения сразу вступят в силу
      if (id === selectedId()) press('reload_connection_profile');
    };

    const onClick = event => {
      const target = event.target.closest?.('[data-act]');
      if (!target || !panel.contains(target) || target.classList.contains('disabled')) return;
      const act = target.dataset.act;
      const id = target.dataset.id ?? '';
      Promise.resolve().then(async () => {
        if (act === 'pick') switchTo(id);
        else if (act === 'edit') await editProfile(id);
        else if (act === 'del') await removeProfile(id);
        else if (act === 'create') press('create_connection_profile');
        else if (act === 'details') press('view_connection_profile');
        else if (act === 'reload') press('reload_connection_profile');
        else if (act === 'update') {
          const active = store()?.profiles?.find(item => item.id === selectedId());
          if (!active) return;
          const ok = await popup(`<h3>Обновить профиль?</h3><p>В «${escapeHtml(active.name)}» запишутся текущие настройки соединения вместо прежних.</p>`, 'CONFIRM', '', { okButton: 'Обновить', cancelButton: 'Отмена' });
          if (ok) press('update_connection_profile');
        }
      }).catch(error => { report(`соединение: ${act}`, error); globalThis.toastr?.error?.('Не получилось. Подробности в консоли (F12).', 'Закулисье'); });
    };
    panel.addEventListener('click', onClick);

    // профили меняет и родной блок, и команды, и другие расширения: обновляемся по их событиям
    const types = live().eventTypes ?? {};
    const names = [types.CONNECTION_PROFILE_LOADED, types.CONNECTION_PROFILE_CREATED, types.CONNECTION_PROFILE_DELETED, types.CONNECTION_PROFILE_UPDATED].filter(Boolean);
    let timer = 0;
    const later = () => { view.clearTimeout(timer); timer = view.setTimeout(() => { try { render(); } catch (error) { report('соединение: перерисовка', error); } }, 30); };
    for (const name of names) live().eventSource?.on?.(name, later);
    select.addEventListener('change', later);
    render();

    return () => {
      view.clearTimeout(timer);
      for (const name of names) live().eventSource?.removeListener?.(name, later);
      select.removeEventListener('change', later);
      panel.removeEventListener('click', onClick);
      panel.remove();
      row.classList.remove(NATIVE_OFF);
    };
  };

  // Connection Manager достраивает свой блок уже после запуска страницы: ждём его список профилей
  const find = () => doc.getElementById('connection_profiles');
  const first = find();
  if (first) {
    try { teardown = mount(first); } catch (error) { report('соединение', error); }
  } else {
    waitObserver = new view.MutationObserver(() => {
      const select = find();
      if (!select) return;
      waitObserver.disconnect();
      waitObserver = null;
      try { teardown = mount(select); } catch (error) { report('соединение', error); }
    });
    waitObserver.observe(doc.body, { childList: true, subtree: true });
    // не вечно: если расширения нет, перестаём следить
    gaveUp = view.setTimeout(() => { waitObserver?.disconnect(); waitObserver = null; }, 60000);
  }

  return () => {
    view.clearTimeout(gaveUp);
    waitObserver?.disconnect();
    teardown();
  };
}
