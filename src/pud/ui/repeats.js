/**
 * Вкладка «Повторы»: какими оборотами рассказчик пользуется слишком часто. Считается на месте, без модели.
 * Фразу можно запретить одним щелчком (запреты уходят модели короткой заметкой) или перестать считать.
 */
import { report } from '../core/guard.js';
import { findRepeats, normalizeRepeats, banBlock } from '../core/repeats.js';
import { setPromptBlock } from '../core/meta.js';

export const REPEATS_PROMPT_KEY = 'pud-repeats';
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, shared?: any }} deps
 */
export function startRepeats(doc, { context, settings, save, shared = {} }) {
  const tab = shared.hub?.addTab?.('repeats', 'Повторы', 'list');
  if (!tab) return () => {};
  const view = doc.defaultView;
  const pane = tab.pane;
  settings.repeats = normalizeRepeats(settings.repeats);
  const cfg = () => settings.repeats;
  const persist = () => { try { save(); } catch (error) { report('повторы: сохранение', error); } };
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;

  const messages = () => (live().chat ?? [])
    .filter(item => item && !item.is_user && !item.is_system && String(item.mes ?? '').trim())
    .slice(-cfg().lastMessages)
    .map(item => item.mes);
  // выбор галочками для массовой чистки: общий для вкладки и страницы шторки
  const sel = { found: new Set(), bans: new Set(), ignored: new Set() };
  const prune = (kind, list) => { for (const item of [...sel[kind]]) if (!list.includes(item)) sel[kind].delete(item); };
  const check = (kind, phrase) => `<input type="checkbox" class="pud-rep-check" data-sel="${kind}" data-phrase="${escapeHtml(phrase)}"${sel[kind].has(phrase) ? ' checked' : ''} aria-label="Выбрать">`;
  /** Полоса «выбрать все» и массовых действий над списком kind; actions: [[act, текст, подсказка]]. */
  const toolbar = (kind, list, actions, q = false) => {
    const n = sel[kind].size;
    const attr = q ? 'data-q' : 'data-act';
    return `<div class="pud-rep-bar"><label class="pud-rep-all"><input type="checkbox" data-selall="${kind}"${list.length && n === list.length ? ' checked' : ''}> все</label>${actions.map(([act, text, hint]) => `<button type="button" class="menu_button" ${attr}="${act}" title="${hint}"${n ? '' : ' disabled'}>${text}${n ? ` (${n})` : ''}</button>`).join('')}</div>`;
  };
  const applyPrompt = () => setPromptBlock(live(), REPEATS_PROMPT_KEY, cfg().send ? banBlock(cfg().bans) : '');

  function render() {
    const c = cfg();
    const all = messages();
    const found = findRepeats(all, { minMessages: c.minMessages, ignored: c.ignored });
    const banned = new Set(c.bans.map(item => item.toLowerCase()));
    prune('found', found.map(item => item.phrase));
    prune('bans', c.bans);
    prune('ignored', c.ignored);
    const keep = pane.scrollTop;
    pane.innerHTML = `
      <h3>Повторы</h3>
      <p class="pud-hint">Здесь видно, какие обороты рассказчик повторяет чаще всего («сердце пропустило удар», «воздух сгустился»). Всё считается на вашем компьютере, модель не нужна. Запрещённые фразы уходят модели короткой заметкой: «не используй их и их близкие пересказы».</p>
      <div class="pud-card pud-card-col">
        <label class="pud-opt"><span><b>Отправлять запреты модели</b></span><input type="checkbox" data-field="send"${c.send ? ' checked' : ''}></label>
        <div class="pud-peek-fields">
          <label>Смотреть последних ответов<input type="number" data-field="lastMessages" min="10" max="300" value="${c.lastMessages}"></label>
          <label>Штамп, если встретился минимум в (сообщений)<input type="number" data-field="minMessages" min="2" max="20" value="${c.minMessages}"></label>
        </div>
        <div class="pud-hint">Просмотрено ответов: ${all.length}.</div>
      </div>
      <div class="pud-card pud-card-col">
        <b>Частые обороты</b>
        ${found.length ? `${toolbar('found', found.map(item => item.phrase), [['bulk-ban', 'Запретить выбранные', 'Запретить все отмеченные обороты'], ['bulk-ignore', 'Это нормально', 'Не считать отмеченные обороты штампом']])}<ul class="pud-rep-list">${found.map(item => `
          <li>${check('found', item.phrase)}<span class="pud-rep-count" title="в скольких сообщениях встретилось">×${item.count}</span>
          <span class="pud-rep-phrase">«${escapeHtml(item.phrase)}»</span>
          ${banned.has(item.phrase) ? '<em class="pud-hint">запрещена</em>' : `<button type="button" class="menu_button" data-act="ban" data-phrase="${escapeHtml(item.phrase)}">Запретить</button>`}
          <button type="button" class="menu_button" data-act="ignore" data-phrase="${escapeHtml(item.phrase)}" title="Не считать эту фразу штампом">Это нормально</button></li>`).join('')}</ul>`
    : '<p class="pud-lib-empty">Пока ничего не повторяется. Штампы появятся, когда в чате наберётся побольше ответов.</p>'}
      </div>
      <div class="pud-card pud-card-col">
        <b>Запрещённые фразы (${c.bans.length})</b>
        ${c.bans.length ? `${toolbar('bans', c.bans, [['bulk-unban', 'Снять выбранные', 'Снять запрет с отмеченных'], ['clear-bans', 'Снять все', 'Снять все запреты']].map(([a, t, h]) => [a, t, h]))}<ul class="pud-rep-list">${c.bans.map(item => `<li>${check('bans', item)}<span class="pud-rep-phrase">«${escapeHtml(item)}»</span><button type="button" class="menu_button" data-act="unban" data-phrase="${escapeHtml(item)}">Снять запрет</button></li>`).join('')}</ul>` : '<p class="pud-lib-empty">Запретов нет.</p>'}
        <div class="pud-peek-city"><input type="text" data-field="newban" placeholder="Своя фраза для запрета"><button type="button" class="menu_button" data-act="addban">Запретить</button></div>
      </div>
      ${c.ignored.length ? `<details class="pud-card pud-card-col"><summary><b>Не считаются (${c.ignored.length})</b></summary>${toolbar('ignored', c.ignored, [['bulk-unignore', 'Считать снова выбранные', 'Вернуть отмеченные фразы в подсчёт'], ['clear-ignored', 'Считать все', 'Вернуть все фразы в подсчёт']])}<ul class="pud-rep-list">${c.ignored.map(item => `<li>${check('ignored', item)}<span class="pud-rep-phrase">«${escapeHtml(item)}»</span><button type="button" class="menu_button" data-act="unignore" data-phrase="${escapeHtml(item)}">Считать снова</button></li>`).join('')}</ul></details>` : ''}`;
    pane.scrollTop = keep;
  }

  const update = patch => {
    settings.repeats = normalizeRepeats({ ...cfg(), ...patch });
    persist();
    applyPrompt();
    render();
    shared.quick?.refresh('repeats');
  };

  /** Массовые действия над отмеченным; true — обработано. */
  function bulk(act) {
    const c = cfg();
    const mark = kind => [...sel[kind]];
    if (act === 'bulk-ban') { const list = mark('found'); sel.found.clear(); update({ bans: [...c.bans, ...list] }); }
    else if (act === 'bulk-ignore') { const list = mark('found'); sel.found.clear(); update({ ignored: [...c.ignored, ...list] }); }
    else if (act === 'bulk-unban') { const gone = new Set(mark('bans')); sel.bans.clear(); update({ bans: c.bans.filter(item => !gone.has(item)) }); }
    else if (act === 'clear-bans') { sel.bans.clear(); update({ bans: [] }); }
    else if (act === 'bulk-unignore') { const gone = new Set(mark('ignored')); sel.ignored.clear(); update({ ignored: c.ignored.filter(item => !gone.has(item)) }); }
    else if (act === 'clear-ignored') { sel.ignored.clear(); update({ ignored: [] }); }
    else return false;
    return true;
  }
  /** Галочка у строки или «все» над списком. */
  function selectBox(box, lists) {
    if (box.dataset?.sel) {
      const kind = box.dataset.sel;
      if (box.checked) sel[kind].add(box.dataset.phrase); else sel[kind].delete(box.dataset.phrase);
      return true;
    }
    if (box.dataset?.selall) {
      const kind = box.dataset.selall;
      sel[kind].clear();
      if (box.checked) for (const item of lists[kind]()) sel[kind].add(item);
      return true;
    }
    return false;
  }
  const foundNow = () => findRepeats(messages(), { minMessages: cfg().minMessages, ignored: cfg().ignored }).map(item => item.phrase);
  const lists = { found: foundNow, bans: () => cfg().bans, ignored: () => cfg().ignored };

  /** Быстрая панель в шторке: вписать запрет и запретить самые частые обороты. */
  function renderQuick(el) {
    const c = cfg();
    const found = findRepeats(messages(), { minMessages: c.minMessages, ignored: c.ignored }).slice(0, 8);
    const banned = new Set(c.bans.map(item => item.toLowerCase()));
    el.innerHTML = `
      <div class="pud-peek-city"><input type="text" data-q="newban" placeholder="Новый запрет: фраза"><button type="button" class="menu_button" data-q="addban">Запретить</button></div>
      <p class="pud-hint">Запрещённые фразы модель получает заметкой «не используй».</p>
      ${found.length ? `${toolbar('found', found.map(item => item.phrase), [['bulk-ban', 'Запретить выбранные', 'Запретить отмеченные'], ['bulk-ignore', 'Это нормально', 'Не считать отмеченные']], true)}<ul class="pud-quick-list">${found.map(item => `<li>${check('found', item.phrase)}<span class="pud-rep-count">×${item.count}</span><span class="pud-quick-text">«${escapeHtml(item.phrase)}»</span>${banned.has(item.phrase) ? '<em class="pud-hint">запрещена</em>' : `<button type="button" class="menu_button" data-q="ban" data-phrase="${escapeHtml(item.phrase)}">Запретить</button>`}</li>`).join('')}</ul>` : '<p class="pud-lib-empty">Штампов пока нет.</p>'}
      ${c.bans.length ? `<b>Запрещено (${c.bans.length})</b> <button type="button" class="menu_button" data-q="clear-bans" title="Снять все запреты">Снять все</button><div class="pud-quick-chips">${c.bans.map(item => `<span class="pud-quick-chip">«${escapeHtml(item)}» <button type="button" data-q="unban" data-phrase="${escapeHtml(item)}" aria-label="Снять запрет">×</button></span>`).join('')}</div>` : ''}`;
    const add = () => {
      const text = String(el.querySelector('[data-q="newban"]')?.value ?? '').trim();
      if (text) update({ bans: [...cfg().bans, text] });
    };
    el.onchange = event => { if (selectBox(event.target, lists)) { renderQuick(el); render(); } };
    el.onclick = event => {
      const target = event.target.closest?.('[data-q]');
      if (!target) return;
      if (bulk(target.dataset.q)) return;
      const phrase = target.dataset.phrase ?? '';
      if (target.dataset.q === 'addban') add();
      else if (target.dataset.q === 'ban') update({ bans: [...cfg().bans, phrase] });
      else if (target.dataset.q === 'unban') update({ bans: cfg().bans.filter(item => item !== phrase) });
    };
    el.onkeydown = event => { if (event.key === 'Enter' && event.target.dataset?.q === 'newban') { event.preventDefault(); add(); } };
  }
  const unregisterQuick = shared.quick?.register({ id: 'repeats', icon: '🔁', title: 'Повторы', render: renderQuick });
  const onClick = event => {
    const target = event.target.closest?.('[data-act]');
    if (!target) return;
    if (bulk(target.dataset.act)) return;
    const phrase = target.dataset.phrase ?? '';
    const c = cfg();
    if (target.dataset.act === 'ban') update({ bans: [...c.bans, phrase] });
    else if (target.dataset.act === 'unban') update({ bans: c.bans.filter(item => item !== phrase) });
    else if (target.dataset.act === 'ignore') update({ ignored: [...c.ignored, phrase] });
    else if (target.dataset.act === 'unignore') update({ ignored: c.ignored.filter(item => item !== phrase) });
    else if (target.dataset.act === 'addban') {
      const input = pane.querySelector('[data-field="newban"]');
      const text = String(input?.value ?? '').trim();
      if (text) update({ bans: [...c.bans, text] });
    }
  };
  const onChange = event => {
    if (selectBox(event.target, lists)) { render(); shared.quick?.refresh('repeats'); return; }
    const field = event.target.dataset?.field;
    if (!field || field === 'newban') return;
    if (field === 'send') update({ send: event.target.checked });
    else if (field === 'lastMessages') update({ lastMessages: clamp(Number(event.target.value) || 60, 10, 300) });
    else if (field === 'minMessages') update({ minMessages: clamp(Number(event.target.value) || 3, 2, 20) });
  };
  pane.addEventListener('click', onClick);
  pane.addEventListener('change', onChange);
  const paneObserver = new view.MutationObserver(() => { if (!pane.hidden) render(); });
  paneObserver.observe(pane, { attributes: true, attributeFilter: ['hidden'] });

  const types = context.eventTypes ?? {};
  const events = context.eventSource;
  const listeners = [];
  if (types.CHAT_CHANGED && events?.on) {
    const onChat = () => { applyPrompt(); if (!pane.hidden) render(); };
    events.on(types.CHAT_CHANGED, onChat);
    listeners.push([types.CHAT_CHANGED, onChat]);
  }
  applyPrompt();
  render();

  return () => {
    unregisterQuick?.();
    paneObserver.disconnect();
    pane.removeEventListener('click', onClick);
    pane.removeEventListener('change', onChange);
    for (const [type, fn] of listeners) events?.removeListener?.(type, fn);
    setPromptBlock(live(), REPEATS_PROMPT_KEY, '');
    tab.remove();
  };
}
