/**
 * «Настроение» героев: у каждого героя сцены свой ряд плашек-настроений, текущее подсвечено. Настроение меняется рукой
 * (клик по плашке) и отслеживается моделью: после ответов она читает чат и расставляет настроение каждому герою.
 * Персоне (героине автора) настроение не задаётся: модель читает его по постам автора сама.
 * Данные сцены (кто на сцене) приходят из моста Кулис: bridge.scene. Тема по настроению сцены вынесена в ui/mood-theme.js.
 */
import { report } from '../core/guard.js';
import { readMeta, writeMeta, setPromptBlock } from '../core/meta.js';
import { moodOf, normalizeMoods, setMood, moodsBlock, buildMoodMessages, parseMoodAnswer, moodList, normalizeMoodConfig, newCustomMood, MOODS, MOOD_EMOJI_LIMIT, MOOD_CUSTOM_LIMIT } from '../core/moods.js';
import { tidyMessage } from '../core/peek.js';
import { askModel, helperProfile } from '../integration/peek-api.js';
import { watchRail } from './rail-extras.js';
import { iconFromFile } from './icon-studio.js';

export const MOODS_PROMPT_KEY = 'pud-moods';
export const STRIP_CLASS = 'pud-mood-strip';
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const pillsHtml = (name, current, list) => list.map(item => `<button type="button" class="pud-mood-pill${item.id === current ? ' on' : ''}" data-name="${escapeHtml(name)}" data-mood="${item.id}"${item.color ? ` style="--mood-c:${item.color}"` : ''} title="${escapeHtml(`${name}: ${item.label}`)}" aria-pressed="${item.id === current}">${item.image ? `<img class="pud-mood-img" src="${item.image}" alt="" draggable="false">` : item.emoji}</button>`).join('');

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, shared?: any, bridge?: any }} deps
 */
export function startMood(doc, { context, settings, save, shared = {}, bridge = null, imageFromFile = iconFromFile }) {
  const tab = shared.hub?.addTab?.('mood', 'Настроение', 'theater');
  const view = doc.defaultView;
  const pane = tab?.pane;
  const old = settings.moods ?? {};
  settings.moods = {
    ...normalizeMoodConfig(old),
    // Плашки настроения в шторке во вкладке «Кто» убраны (настроение живёт во вкладке «Эмоции»): один раз выключаем, дальше можно вернуть галочкой.
    strips: old.stripsHidden ? old.strips !== false && old.badges !== false : false,
    stripsHidden: true,
    send: old.send !== false,
    auto: old.auto !== false,
    autoEvery: clamp(Math.round(Number(old.autoEvery) || 2), 1, 20),
  };
  const persist = () => { try { save(); } catch (error) { report('настроение: сохранение', error); } };
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const scene = () => { try { return bridge?.scene?.read?.() ?? null; } catch { return null; } };
  const list = () => moodList(settings.moods);
  const moods = () => normalizeMoods(readMeta(live(), 'moods', {}), list());
  /** Герои сцены без персоны автора. */
  const castNames = () => {
    const fromBridge = scene()?.cast;
    if (Array.isArray(fromBridge) && fromBridge.length) return fromBridge;
    return [...doc.querySelectorAll('#ku-scene-chips .ku-chip.on')]
      .filter(chip => !chip.querySelector('.ku-chip-note'))
      .map(chip => chip.querySelector('.ku-chip-name')?.textContent.trim())
      .filter(Boolean);
  };
  let status = '';
  let busy = false;
  let generating = false;
  let replies = 0;
  const timers = [];

  const applyPrompt = () => setPromptBlock(live(), MOODS_PROMPT_KEY, settings.moods.send ? moodsBlock(moods(), castNames(), list()) : '');
  const store = next => { writeMeta(live(), 'moods', next); applyPrompt(); decorate(); render(); shared.quick?.refresh('mood'); };

  // ───────── плашки под героями в шторке
  function decorate(rail = doc.getElementById('ku-scene-chips')) {
    if (!rail) return;
    const current = moods();
    for (const chip of rail.querySelectorAll('.ku-chip')) {
      const name = chip.querySelector('.ku-chip-name')?.textContent.trim();
      const next = chip.nextElementSibling;
      const strip = next?.classList?.contains(STRIP_CLASS) ? next : null;
      // персона автора и те, кого нет на сцене, плашек не получают
      const wanted = settings.moods.strips && name && chip.classList.contains('on') && !chip.querySelector('.ku-chip-note');
      if (!wanted) { strip?.remove(); continue; }
      const mood = current[name]?.mood ?? '';
      const sig = list().map(item => `${item.id}${item.emoji}${item.color ?? ''}${item.image ? item.image.length : ''}`).join('|');
      if (strip && strip.dataset.name === name && strip.dataset.mood === mood && strip.dataset.sig === sig) continue;
      const node = strip ?? doc.createElement('div');
      node.className = STRIP_CLASS;
      node.dataset.name = name;
      node.dataset.mood = mood;
      node.dataset.sig = sig;
      node.innerHTML = pillsHtml(name, mood, list());
      if (!strip) chip.after(node);
    }
  }
  const stopRail = watchRail(doc, decorate, bridge?.scene);

  const onDocClick = event => {
    const pill = event.target.closest?.(`.${STRIP_CLASS} .pud-mood-pill`);
    if (!pill) return;
    event.preventDefault();
    event.stopPropagation();
    const { name, mood } = pill.dataset;
    store(setMood(moods(), name, moods()[name]?.mood === mood ? '' : mood, Date.now(), list()));
  };
  doc.addEventListener('click', onDocClick, true);

  // ───────── определение по чату
  const readChat = ctx => (ctx.chat ?? []).filter(item => item && !item.is_system && String(item.mes ?? '').trim()).slice(-12)
    .map(item => ({ name: item.name, text: tidyMessage(item.mes, 600), isUser: Boolean(item.is_user) })).filter(item => item.text);

  /** silent: автоматический вызов после ответа: молчит о неудаче. */
  async function detect({ silent = false } = {}) {
    if (busy) return;
    busy = true;
    if (!silent) { status = 'Читаю чат…'; render(); shared.quick?.refresh('mood'); }
    try {
      const names = castNames();
      if (!names.length) throw new Error('На сцене пока нет героев (кроме вашей персоны).');
      const ctx = live();
      const chat = readChat(ctx);
      if (!chat.length) throw new Error('В чате пока нечего читать.');
      const raw = await askModel(ctx, helperProfile(settings), buildMoodMessages({ chat, names, list: list() }), 400);
      const found = parseMoodAnswer(raw, names, list());
      let next = moods();
      for (const [name, id] of Object.entries(found)) next = setMood(next, name, id, Date.now(), list());
      status = Object.keys(found).length ? `Настроение определено: ${Object.keys(found).length}.` : 'По тексту настроение не видно.';
      store(next);
    } catch (error) {
      if (!silent) status = `Не вышло: ${String(error?.message ?? error)}`;
      else status = '';
      report('настроение: определение', error);
    } finally {
      busy = false;
      render();
      shared.quick?.refresh('mood');
    }
  }
  /** После каждого N-го ответа модели настроение обновляется само. Для «модели чата» ждёт конца ответа. */
  const afterReply = () => {
    replies += 1;
    if (!settings.moods.auto || replies < settings.moods.autoEvery) return;
    if (!settings.peek?.commentProfile) return;
    replies = 0;
    timers.push(view.setTimeout(() => { if (!(settings.peek.commentProfile === 'main' && generating)) detect({ silent: true }); }, 1500));
  };

  // ───────── большая настройка: значки и свои настроения
  const HELP = {
    icons: 'Нажмите на значок настроения, чтобы выбрать для него картинку (файл). Картинку можно и вставить (Ctrl+V) или перетащить на значок. Эмодзи: выберите настроение (нажмите на его название), потом нажмите нужный эмодзи в ряду или впишите свой в поле. Картинка важнее эмодзи.',
    custom: 'Настроение, которого нет в списке, например «тихо ревнует». Появится рядом со стандартными на плашках и в автоопределении.',
    name: 'Видно при наведении на плашку. По названию модель узнаёт настроение при автоопределении.',
    color: 'Цвет, которым подсвечивается плашка, когда это настроение выбрано.',
    en: 'Необязательно. Если оставить пустым, ИИ получит просто название. Если нужно точнее, напишите своими словами, как это выглядит («ревнует, но молчит и язвит»). Можно по-русски.',
  };
  const helpOpen = new Set();
  const dot = key => `<button type="button" class="pud-info-dot" data-help="${key}" aria-expanded="${helpOpen.has(key)}" title="Пояснение" aria-label="Пояснение">?</button>`;
  const note = key => `<p class="pud-hint pud-info-note" data-note="${key}"${helpOpen.has(key) ? '' : ' hidden'}>${HELP[key]}</p>`;
  let selMood = '';
  const moodItem = id => list().find(item => item.id === id) ?? null;
  const faceOf = item => (item.image ? `<img src="${item.image}" alt="">` : escapeHtml(item.emoji));
  /** Значок настроения: сама кнопка выбора картинки; × убирает картинку. */
  const iconButton = item => `<span class="pud-mood-iconwrap"><button type="button" class="pud-mood-prev${item.image ? ' has-img' : ''}" data-act="mood-img" data-mid="${escapeHtml(item.id)}" title="Нажмите, чтобы выбрать картинку. Её можно и вставить (Ctrl+V) или перетащить сюда" aria-label="Выбрать картинку для «${escapeHtml(item.label)}»">${faceOf(item)}</button>${item.image ? `<button type="button" class="pud-mood-imgx" data-act="mood-img-clear" data-mid="${escapeHtml(item.id)}" title="Убрать картинку" aria-label="Убрать картинку">×</button>` : ''}</span>`;
  const PALETTE = ["😊", "😄", "🥰", "😍", "😘", "😏", "😳", "😌", "😢", "😭", "😠", "😡", "😤", "😨", "😱", "😒", "😬", "🥵", "🔥", "😴", "🥱", "😶", "🙄", "🤔", "😎", "🥺", "😈", "🤨", "😮", "😐", "😔", "💔", "❤️", "💞", "✨", "🌧️", "🍵", "🖤"];
  const editorHtml = () => {
    const all = list();
    const builtIn = all.slice(0, MOODS.length);
    const custom = settings.moods.custom.map(item => ({ ...item, image: settings.moods.images[item.id] }));
    const chosen = moodItem(selMood);
    return `<div class="pud-card pud-card-col">
        <div class="pud-inforow"><b>Значки настроений</b>${dot('icons')}</div>${note('icons')}
        <div class="pud-emoji-bar">
          <span class="pud-emoji-for">Эмодзи для: <b data-emoji-for>${escapeHtml(chosen?.label ?? 'выберите настроение ниже')}</b></span>
          <input type="text" data-emoji-shared maxlength="${MOOD_EMOJI_LIMIT}" placeholder="впишите или вставьте эмодзи" value="${escapeHtml(chosen?.emoji ?? '')}"${chosen ? '' : ' disabled'} aria-label="Эмодзи выбранного настроения">
          <button type="button" class="menu_button" data-act="emoji-reset"${chosen ? '' : ' disabled'} title="Вернуть стандартный эмодзи">Стандартный</button>
        </div>
        <div class="pud-emoji-pal">${PALETTE.map(item => `<button type="button" data-pal="${item}" title="Поставить выбранному настроению">${item}</button>`).join('')}</div>
        <div class="pud-mood-icons">${builtIn.map(item => `<div class="pud-mood-tile${item.id === selMood ? ' sel' : ''}" data-pick="${item.id}">${iconButton(item)}<span class="pud-mood-tname">${escapeHtml(item.label)}</span></div>`).join('')}</div>
      </div>
      <div class="pud-card pud-card-col">
        <div class="pud-inforow"><b>Свои настроения</b>${dot('custom')}</div>${note('custom')}
        ${custom.map(item => `<div class="pud-mood-custom${item.id === selMood ? ' sel' : ''}" data-cid="${escapeHtml(item.id)}" data-pick="${escapeHtml(item.id)}">
          ${iconButton(item)}
          <div class="pud-mood-f"><span class="pud-mood-fl">Название ${dot('name')}</span><input type="text" data-cf="label" maxlength="24" value="${escapeHtml(item.label)}" placeholder="например: ревнует тихо" aria-label="Название"></div>
          <div class="pud-mood-f pud-mood-fcolor"><span class="pud-mood-fl">Цвет ${dot('color')}</span><input type="color" data-cf="color" value="${escapeHtml(item.color)}" aria-label="Цвет"></div>
          <button type="button" class="menu_button pud-mood-del" data-act="mood-del" data-cid="${escapeHtml(item.id)}" title="Удалить настроение" aria-label="Удалить">×</button>
          <div class="pud-mood-f pud-mood-fen"><span class="pud-mood-fl">Пояснение для ИИ ${dot('en')}</span><input type="text" data-cf="en" maxlength="80" value="${escapeHtml(item.en)}" placeholder="необязательно: как это выглядит" aria-label="Пояснение для ИИ"></div>
          ${['name', 'color', 'en'].map(key => note(key)).join('')}
        </div>`).join('') || '<p class="pud-lib-empty">Своих настроений пока нет.</p>'}
        <div class="pud-peek-city"><button type="button" class="menu_button" data-act="mood-add"${settings.moods.custom.length >= MOOD_CUSTOM_LIMIT ? ' disabled' : ''}>Добавить настроение</button></div>
      </div>`;
  };

  // ───────── вкладка и быстрая панель
  function render() {
    if (!pane) return;
    const names = castNames();
    const current = moods();
    pane.innerHTML = `
      <h3>Настроение</h3>
      <p class="pud-hint">У каждого героя сцены свой ряд плашек с настроением: текущее подсвечено, нажмите на плашку, чтобы поменять. Персоне (вашему герою) настроение не задаётся: модель читает его по вашим постам. Цветом экрана по настроению сцены управляет вкладка «Тема по настроению» в блоке «Визуал».</p>
      <div class="pud-card pud-card-col">
        <label class="pud-opt"><span>Показывать плашки настроения в шторке</span><input type="checkbox" data-field="strips"${settings.moods.strips ? ' checked' : ''}></label>
        <label class="pud-opt"><span>Говорить модели о настроении героев</span><input type="checkbox" data-field="send"${settings.moods.send ? ' checked' : ''}></label>
        <label class="pud-opt"><span><b>Следить за настроением автоматически</b> (модель читает чат после ответов)</span><input type="checkbox" data-field="auto"${settings.moods.auto ? ' checked' : ''}></label>
        <label class="pud-peek-fields"><span>Обновлять после каждых N сообщений (ваших и ответов)</span><input type="number" data-field="autoEvery" min="1" max="20" value="${settings.moods.autoEvery}"></label>
        <p class="pud-hint">Следит той же моделью, что комментарии Сливы (вкладка «Слива» → «Чем писать»); без выбранной модели автоматика молчит. Текст последних сообщений уходит ей.</p>
      </div>
      <div class="pud-card pud-card-col">
        <b>Герои сцены</b>
        ${names.length ? names.map(name => `<div class="pud-mood-row"><span class="pud-mood-name">${escapeHtml(name)}</span><span class="pud-mood-row-pills ${STRIP_CLASS}" data-name="${escapeHtml(name)}">${pillsHtml(name, current[name]?.mood ?? '', list())}</span><span class="pud-hint">${escapeHtml(moodOf(current[name]?.mood, list())?.label ?? 'не задано')}</span></div>`).join('') : '<p class="pud-lib-empty">На сцене пока нет героев (кроме вашей персоны).</p>'}
        <div class="pud-peek-city"><button type="button" class="menu_button" data-act="detect"${busy ? ' disabled' : ''}>Определить по чату (модель)</button><span class="pud-hint">${escapeHtml(status)}</span></div>
      </div>
      ${editorHtml()}
      <input type="file" accept="image/*" hidden data-mood-file>`;
  }
  const afterListChange = () => { persist(); applyPrompt(); decorate(); shared.quick?.refresh('mood'); };
  let pickId = '';
  /** Картинка → значок настроения id (сжимается в маленькую, как в «Иконках»). */
  async function setImage(id, file) {
    try {
      const data = await imageFromFile(file, doc);
      settings.moods.images = normalizeMoodConfig({ ...settings.moods, images: { ...settings.moods.images, [id]: data } }).images;
      status = '';
      afterListChange();
    } catch (error) {
      status = String(error?.message ?? error);
      report('настроение: картинка', error);
      globalThis.toastr?.error?.(status, 'Закулисье');
    }
    render();
  }
  const imageOf = transfer => [...(transfer?.files ?? [])].find(item => /^image\//.test(item.type || ''))
    ?? [...(transfer?.items ?? [])].find(item => item.kind === 'file' && /^image\//.test(item.type || ''))?.getAsFile?.();
  const idAt = node => node.closest?.('[data-pick]')?.dataset?.pick ?? '';
  /** Выбрать настроение для эмодзи: без перерисовки, чтобы не сбивать набор текста. */
  function select(id) {
    selMood = id;
    for (const node of pane.querySelectorAll('[data-pick]')) node.classList.toggle('sel', node.dataset.pick === id);
    const item = moodItem(id);
    const label = pane.querySelector('[data-emoji-for]');
    if (label) label.textContent = item?.label ?? 'выберите настроение ниже';
    const input = pane.querySelector('[data-emoji-shared]');
    if (input) { input.disabled = !item; input.value = item?.emoji ?? ''; }
    const reset = pane.querySelector('[data-act="emoji-reset"]');
    if (reset) reset.disabled = !item;
  }
  /** Поставить эмодзи настроению id (пусто: стандартный). */
  function applyEmoji(id, raw) {
    const value = String(raw ?? '').trim().slice(0, MOOD_EMOJI_LIMIT);
    if (MOODS.some(item => item.id === id)) {
      const icons = { ...settings.moods.icons };
      if (value) icons[id] = value; else delete icons[id];
      settings.moods.icons = normalizeMoodConfig({ icons }).icons;
    } else {
      settings.moods.custom = normalizeMoodConfig({ custom: settings.moods.custom.map(item => (item.id === id ? { ...item, emoji: value || '🙂' } : item)) }).custom;
    }
    afterListChange();
    const item = moodItem(id);
    for (const face of pane.querySelectorAll(`[data-pick="${id}"] .pud-mood-prev:not(.has-img)`)) face.textContent = item?.emoji ?? '';
    const input = pane.querySelector('[data-emoji-shared]');
    if (input && selMood === id && document.activeElement !== input) input.value = item?.emoji ?? '';
  }
  const onPaste = event => {
    const file = imageOf(event.clipboardData);
    const id = idAt(event.target) || selMood;
    if (!file || !id) return;
    event.preventDefault();
    setImage(id, file);
  };
  const onDragOver = event => { if (idAt(event.target)) event.preventDefault(); };
  const onDrop = event => {
    const file = imageOf(event.dataTransfer);
    const id = idAt(event.target);
    if (!file || !id) return;
    event.preventDefault();
    setImage(id, file);
  };
  const applyField = target => {
    const row = target.closest?.('[data-cid]');
    if (row && target.dataset?.cf) {
      // пока название пустое, не трогаем: пустое значение отбросило бы настроение
      if (!String(target.value).trim() && target.dataset.cf === 'label') return true;
      const custom = settings.moods.custom.map(item => (item.id === row.dataset.cid ? { ...item, [target.dataset.cf]: target.value } : item));
      settings.moods.custom = normalizeMoodConfig({ custom }).custom;
      afterListChange();
      return true;
    }
    return false;
  };
  const onInput = event => {
    const target = event.target;
    if (target.matches?.('[data-emoji-shared]')) { if (selMood) applyEmoji(selMood, target.value); return; }
    if (target.matches?.('[data-cf]')) applyField(target);
  };
  const onFocusIn = event => { const id = idAt(event.target); if (id && id !== selMood && event.target.matches?.('input')) select(id); };
  const onChange = event => {
    const target = event.target;
    if (target.matches?.('[data-mood-file]')) {
      const file = target.files?.[0];
      target.value = '';
      if (file && pickId) setImage(pickId, file);
      return;
    }
    if (applyField(target)) return;
    const field = target.dataset?.field;
    if (!field) return;
    if (field === 'autoEvery') settings.moods.autoEvery = clamp(Math.round(Number(event.target.value) || 2), 1, 20);
    else settings.moods[field] = event.target.checked;
    persist();
    applyPrompt();
    decorate();
  };
  const onClick = event => {
    const help = event.target.closest?.('[data-help]');
    if (help) {
      const key = help.dataset.help;
      if (helpOpen.has(key)) helpOpen.delete(key); else helpOpen.add(key);
      for (const node of pane.querySelectorAll(`[data-note="${key}"]`)) node.hidden = !helpOpen.has(key);
      for (const node of pane.querySelectorAll(`[data-help="${key}"]`)) node.setAttribute('aria-expanded', String(helpOpen.has(key)));
      return;
    }
    const pick = event.target.closest?.('[data-act="mood-img"]');
    if (pick) { pickId = pick.dataset.mid; select(pick.dataset.mid); pane.querySelector('[data-mood-file]')?.click(); return; }
    const clear = event.target.closest?.('[data-act="mood-img-clear"]');
    if (clear) {
      const images = { ...settings.moods.images };
      delete images[clear.dataset.mid];
      settings.moods.images = images;
      afterListChange();
      render();
      return;
    }
    const pal = event.target.closest?.('[data-pal]');
    if (pal) {
      if (selMood) applyEmoji(selMood, pal.dataset.pal);
      else { const label = pane.querySelector('[data-emoji-for]'); if (label) label.textContent = 'сначала выберите настроение ниже'; }
      return;
    }
    if (event.target.closest?.('[data-act="emoji-reset"]')) { if (selMood) applyEmoji(selMood, ''); return; }
    if (event.target.closest?.('[data-act="detect"]')) { detect(); return; }
    if (event.target.closest?.('[data-act="mood-add"]')) {
      settings.moods.custom = normalizeMoodConfig({ custom: [...settings.moods.custom, newCustomMood()] }).custom;
      afterListChange();
      render();
      return;
    }
    const del = event.target.closest?.('[data-act="mood-del"]');
    if (del) {
      const gone = del.dataset.cid;
      settings.moods.custom = settings.moods.custom.filter(item => item.id !== gone);
      settings.moods.images = normalizeMoodConfig(settings.moods).images;
      if (selMood === gone) selMood = '';
      const meta = moods();
      const kept = Object.fromEntries(Object.entries(meta).filter(([, value]) => value.mood !== gone));
      if (Object.keys(kept).length !== Object.keys(meta).length) writeMeta(live(), 'moods', kept);
      afterListChange();
      render();
      return;
    }
    // остальное: нажатие на название или карточку выбирает настроение для эмодзи
    const id = idAt(event.target);
    if (id) select(id);
  };
  pane?.addEventListener('change', onChange);
  pane?.addEventListener('input', onInput);
  pane?.addEventListener('paste', onPaste);
  pane?.addEventListener('dragover', onDragOver);
  pane?.addEventListener('drop', onDrop);
  pane?.addEventListener('focusin', onFocusIn);
  pane?.addEventListener('click', onClick);
  const paneObserver = pane ? new view.MutationObserver(() => { if (!pane.hidden) render(); }) : null;
  paneObserver?.observe(pane, { attributes: true, attributeFilter: ['hidden'] });

  /** Быстрая панель в шторке: плашки каждого героя и кнопка «определить». */
  function renderQuick(el) {
    const names = castNames();
    const current = moods();
    el.innerHTML = `
      ${names.length ? names.map(name => `<div class="pud-mood-row"><span class="pud-mood-name">${escapeHtml(name)}</span><span class="pud-mood-row-pills ${STRIP_CLASS}" data-name="${escapeHtml(name)}">${pillsHtml(name, current[name]?.mood ?? '', list())}</span></div>`).join('') : '<p class="pud-lib-empty">На сцене пока нет героев (кроме вашей персоны).</p>'}
      <div class="pud-peek-city"><button type="button" class="menu_button" data-q="detect"${busy ? ' disabled' : ''}>Определить по чату</button></div>
      <div class="pud-hint">${escapeHtml(status)}</div>
      <label class="pud-opt"><span>Следить автоматически</span><input type="checkbox" data-q="auto"${settings.moods.auto ? ' checked' : ''}></label>`;
    el.onclick = event => { if (event.target.closest?.('[data-q="detect"]')) detect(); };
    el.onchange = event => {
      if (event.target.dataset?.q !== 'auto') return;
      settings.moods.auto = event.target.checked;
      persist();
      render();
    };
  }
  const unregisterQuick = shared.quick?.register({ id: 'mood', icon: '🎭', title: 'Настроение героев', render: renderQuick });

  const types = context.eventTypes ?? {};
  const events = context.eventSource;
  const listeners = [];
  const listen = (name, fn) => { if (types[name] && events?.on) { events.on(types[name], fn); listeners.push([types[name], fn]); } };
  listen('CHAT_CHANGED', () => { status = ''; replies = 0; applyPrompt(); decorate(); if (pane && !pane.hidden) render(); });
  listen('MESSAGE_RECEIVED', afterReply);
  listen('MESSAGE_SENT', afterReply);
  listen('GENERATION_STARTED', () => { generating = true; });
  for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) listen(name, () => { generating = false; });
  const unsubscribeScene = bridge?.scene?.subscribe?.(() => { applyPrompt(); }) ?? (() => {});
  applyPrompt();
  render();

  return () => {
    unregisterQuick?.();
    stopRail();
    unsubscribeScene();
    for (const id of timers) view.clearTimeout(id);
    paneObserver?.disconnect();
    pane?.removeEventListener('change', onChange);
    pane?.removeEventListener('input', onInput);
    pane?.removeEventListener('paste', onPaste);
    pane?.removeEventListener('dragover', onDragOver);
    pane?.removeEventListener('drop', onDrop);
    pane?.removeEventListener('focusin', onFocusIn);
    pane?.removeEventListener('click', onClick);
    doc.removeEventListener('click', onDocClick, true);
    for (const [type, fn] of listeners) events?.removeListener?.(type, fn);
    setPromptBlock(live(), MOODS_PROMPT_KEY, '');
    for (const strip of doc.querySelectorAll(`#ku-scene-chips > .${STRIP_CLASS}, .${STRIP_CLASS}[data-mood]`)) strip.remove();
    tab?.remove?.();
  };
}
