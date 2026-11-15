/**
 * Вкладка «Нити»: незавершённые нити сюжета (обещания, вопросы, тайны). Записываются рукой или находятся моделью по чату.
 * Открытые нити уходят модели короткой напоминалкой, чтобы не терялись и не решались сами собой.
 */
import { report } from '../core/guard.js';
import { readMeta, writeMeta, setPromptBlock } from '../core/meta.js';
import {
  THREAD_STATUS, THREAD_LIMITS, normalizeThreads, addThread, setStatus, removeThread, threadsBlock, buildFindMessages, parseFound, isDuplicate,
} from '../core/threads.js';
import { tidyMessage } from '../core/peek.js';
import { askModel, helperProfile } from '../integration/peek-api.js';

export const THREADS_PROMPT_KEY = 'pud-threads';
const SCAN_MESSAGES = 24;
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, shared?: any }} deps
 */
export function startThreads(doc, { context, settings, save, shared = {} }) {
  const tab = shared.hub?.addTab?.('threads', 'Нити', 'check');
  if (!tab) return () => {};
  const view = doc.defaultView;
  const pane = tab.pane;
  settings.threads = { send: settings.threads?.send !== false, max: Math.min(10, Math.max(1, Number(settings.threads?.max) || THREAD_LIMITS.prompt)) };
  const cfg = () => settings.threads;
  const persist = () => { try { save(); } catch (error) { report('нити: сохранение', error); } };
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const list = () => normalizeThreads(readMeta(live(), 'threads', []));
  const store = next => { writeMeta(live(), 'threads', next); applyPrompt(); render(); shared.quick?.refresh('threads'); };
  const applyPrompt = () => setPromptBlock(live(), THREADS_PROMPT_KEY, cfg().send ? threadsBlock(list(), cfg().max) : '');
  let status = '';
  let busy = false;

  const row = item => `
    <li class="pud-thread ${item.status}">
      <span class="pud-thread-text">${item.who ? `<b>${escapeHtml(item.who)}:</b> ` : ''}${escapeHtml(item.text)}</span>
      <span class="pud-thread-acts">
        ${item.status !== 'closed' ? `<button type="button" class="menu_button" data-act="close" data-id="${escapeHtml(item.id)}" title="Нить закрыта: больше не напоминать">Закрыть</button>` : ''}
        ${item.status === 'open' ? `<button type="button" class="menu_button" data-act="snooze" data-id="${escapeHtml(item.id)}" title="Пока не напоминать модели">Отложить</button>` : ''}
        ${item.status !== 'open' ? `<button type="button" class="menu_button" data-act="open" data-id="${escapeHtml(item.id)}">Вернуть</button>` : ''}
        <button type="button" class="menu_button" data-act="remove" data-id="${escapeHtml(item.id)}" title="Удалить совсем">✕</button>
      </span>
    </li>`;

  function render() {
    const all = list();
    const part = status => all.filter(item => item.status === status);
    const section = (title, items, tail = '') => `<div class="pud-card pud-card-col"><b>${title} (${items.length})</b>${items.length ? `<ul class="pud-thread-list">${items.map(row).join('')}</ul>` : '<p class="pud-lib-empty">Пусто.</p>'}${tail}</div>`;
    pane.innerHTML = `
      <h3>Нити</h3>
      <p class="pud-hint">Нить — то, что повисло в сюжете: обещание («расскажу про шрам»), вопрос без ответа, тайна. Открытые нити модель получает напоминанием и не решает их сама. Нити хранятся в этом чате.</p>
      <div class="pud-card pud-card-col">
        <label class="pud-opt"><span><b>Напоминать модели про открытые нити</b></span><input type="checkbox" data-field="send"${cfg().send ? ' checked' : ''}></label>
        <label class="pud-peek-fields"><span>Не больше нитей в напоминании</span><input type="number" data-field="max" min="1" max="10" value="${cfg().max}"></label>
        <div class="pud-peek-city"><input type="text" data-field="who" placeholder="Кто (необязательно)" style="max-width:34%"><input type="text" data-field="text" placeholder="Что повисло, например: обещал рассказать про шрам"><button type="button" class="menu_button" data-act="add">Добавить</button></div>
        <div class="pud-peek-city"><button type="button" class="menu_button" data-act="find"${busy ? ' disabled' : ''}>Найти нити в чате (модель)</button><span class="pud-hint" data-status>${escapeHtml(status)}</span></div>
        <p class="pud-hint">Поиск идёт той же моделью, что комментарии Сливы (вкладка «Слива» → «Чем писать»). Текст последних сообщений чата уходит ей.</p>
      </div>
      ${section(THREAD_STATUS.open, part('open'))}
      ${section(THREAD_STATUS.snoozed, part('snoozed'))}
      <details class="pud-card pud-card-col"><summary><b>${THREAD_STATUS.closed} (${part('closed').length})</b></summary>${part('closed').length ? `<ul class="pud-thread-list">${part('closed').map(row).join('')}</ul>` : '<p class="pud-lib-empty">Пусто.</p>'}</details>`;
  }

  const readChat = ctx => (ctx.chat ?? [])
    .filter(item => item && !item.is_system && String(item.mes ?? '').trim())
    .slice(-SCAN_MESSAGES)
    .map(item => ({ name: item.name, text: tidyMessage(item.mes, 500), isUser: Boolean(item.is_user) }))
    .filter(item => item.text);

  async function find() {
    if (busy) return;
    busy = true;
    status = 'Читаю чат…';
    render();
    try {
      const ctx = live();
      const chat = readChat(ctx);
      if (!chat.length) throw new Error('В чате пока нечего читать.');
      const existing = list();
      const raw = await askModel(ctx, helperProfile(settings), buildFindMessages({ chat, existing }), 700);
      let next = existing;
      let added = 0;
      for (const item of parseFound(raw)) {
        if (isDuplicate(item.text, next)) continue;
        const result = addThread(next, item);
        if (result.thread) { next = result.list; added += 1; }
      }
      status = added ? `Найдено нитей: ${added}.` : 'Новых нитей не нашлось.';
      if (added) writeMeta(ctx, 'threads', next);
      applyPrompt();
    } catch (error) {
      status = `Не вышло: ${String(error?.message ?? error)}`;
      report('нити: поиск', error);
    } finally {
      busy = false;
      render();
      shared.quick?.refresh('threads');
    }
  }

  /** Быстрая панель в шторке: открытые нити, добавить, закрыть, отложить, найти моделью. */
  function renderQuick(el) {
    const open = list().filter(item => item.status === 'open');
    el.innerHTML = `
      <div class="pud-peek-city"><input type="text" data-q="text" placeholder="Что повисло в сюжете"><button type="button" class="menu_button" data-q="add">Добавить</button></div>
      <div class="pud-peek-city"><button type="button" class="menu_button" data-q="find"${busy ? ' disabled' : ''}>Найти нити в чате (модель)</button></div>
      <div class="pud-hint">${escapeHtml(status)}</div>
      ${open.length ? `<ul class="pud-quick-list">${open.map(item => `<li><span class="pud-quick-text">${item.who ? `<b>${escapeHtml(item.who)}:</b> ` : ''}${escapeHtml(item.text)}</span><button type="button" class="menu_button" data-q="close" data-id="${escapeHtml(item.id)}" title="Закрыть">✓</button><button type="button" class="menu_button" data-q="snooze" data-id="${escapeHtml(item.id)}" title="Отложить">💤</button></li>`).join('')}</ul>` : '<p class="pud-lib-empty">Открытых нитей нет.</p>'}`;
    const add = () => {
      const result = addThread(list(), { text: el.querySelector('[data-q="text"]')?.value ?? '' });
      if (result.thread) store(result.list);
    };
    el.onclick = event => {
      const target = event.target.closest?.('[data-q]');
      if (!target) return;
      const id = target.dataset.id;
      if (target.dataset.q === 'add') add();
      else if (target.dataset.q === 'find') find();
      else if (target.dataset.q === 'close') store(setStatus(list(), id, 'closed'));
      else if (target.dataset.q === 'snooze') store(setStatus(list(), id, 'snoozed'));
    };
    el.onkeydown = event => { if (event.key === 'Enter' && event.target.dataset?.q === 'text') { event.preventDefault(); add(); } };
  }
  const unregisterQuick = shared.quick?.register({ id: 'threads', icon: '🧵', title: 'Нити', render: renderQuick });

  const onClick = event => {
    const target = event.target.closest?.('[data-act]');
    if (!target) return;
    const id = target.dataset.id;
    const act = target.dataset.act;
    if (act === 'find') { find(); return; }
    if (act === 'add') {
      const text = pane.querySelector('[data-field="text"]')?.value ?? '';
      const who = pane.querySelector('[data-field="who"]')?.value ?? '';
      const result = addThread(list(), { text, who });
      if (!result.thread) { status = 'Пустая или уже записанная нить.'; render(); return; }
      status = '';
      store(result.list);
      return;
    }
    if (act === 'close') store(setStatus(list(), id, 'closed'));
    else if (act === 'snooze') store(setStatus(list(), id, 'snoozed'));
    else if (act === 'open') store(setStatus(list(), id, 'open'));
    else if (act === 'remove') store(removeThread(list(), id));
  };
  const onChange = event => {
    const field = event.target.dataset?.field;
    if (field === 'send') cfg().send = event.target.checked;
    else if (field === 'max') cfg().max = Math.min(10, Math.max(1, Number(event.target.value) || THREAD_LIMITS.prompt));
    else return;
    persist();
    applyPrompt();
  };
  pane.addEventListener('click', onClick);
  pane.addEventListener('change', onChange);
  const paneObserver = new view.MutationObserver(() => { if (!pane.hidden) render(); });
  paneObserver.observe(pane, { attributes: true, attributeFilter: ['hidden'] });

  const types = context.eventTypes ?? {};
  const events = context.eventSource;
  const onChat = () => { status = ''; applyPrompt(); if (!pane.hidden) render(); };
  if (types.CHAT_CHANGED && events?.on) events.on(types.CHAT_CHANGED, onChat);
  applyPrompt();
  render();

  return () => {
    unregisterQuick?.();
    paneObserver.disconnect();
    pane.removeEventListener('click', onClick);
    pane.removeEventListener('change', onChange);
    if (types.CHAT_CHANGED) events?.removeListener?.(types.CHAT_CHANGED, onChat);
    setPromptBlock(live(), THREADS_PROMPT_KEY, '');
    tab.remove();
  };
}
