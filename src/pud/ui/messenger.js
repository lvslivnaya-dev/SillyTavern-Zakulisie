/**
 * Мессенджер ассистента: маленькое окошко-чат, как смс на телефоне. Кнопка стоит справа от строки ввода, нажатие открывает чат
 * с ассистентом (его выбирают в настройках Закулисья, вкладка «Ассистенты»). Всё, что здесь написано, остаётся вне игрового чата.
 * Когда автор с ассистентом к чему-то пришли, под перепиской появляется плашка «Вывод» с кнопками Да / Нет / Ещё не всё.
 * Данные и ответы модели идут через bridge.assistant (index.js): здесь только окно.
 */
import { report } from '../core/guard.js';
import { icon } from './icons.js';
import { assistantAvatar } from './assistant-art.js';

export const MESSENGER_BUTTON_ID = 'pud-msgr-btn';
export const MESSENGER_ID = 'pud-msgr';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Картинка ассистента: своя из настроек или нарисованная по умолчанию. */
export const avatarOf = view => view?.settings?.avatars?.[view?.assistant?.id] || assistantAvatar(view?.assistant?.id);

/**
 * @param {Document} doc
 * @param {{ bridge?: any, shared?: any }} deps
 */
export function startMessenger(doc, { bridge, shared = {}, settings = null, save = () => {} }) {
  const api = bridge?.assistant;
  const form = doc.getElementById('send_form');
  if (!api || !form) return () => {};
  const view = doc.defaultView;
  const undo = [];
  let data = api.view();
  let open = false;
  let unread = false;
  let seen = data.messages.length;
  let draft = '';
  let notesOpen = false;
  let editing = '';
  let editText = '';
  let shownFace = '';
  let busySince = 0;
  let busyTimer = 0;

  // ── разметка ──
  const button = doc.createElement('div');
  button.id = MESSENGER_BUTTON_ID;
  button.className = 'pud-msgr-btn';
  button.tabIndex = 0;
  button.setAttribute('role', 'button');
  button.setAttribute('aria-label', 'Чат с ассистентом');
  button.innerHTML = '<img alt=""><span class="pud-msgr-dot" hidden></span>';
  doc.body.append(button);
  undo.push(() => button.remove());

  const win = doc.createElement('section');
  win.id = MESSENGER_ID;
  win.className = 'pud-msgr';
  win.hidden = true;
  win.setAttribute('role', 'dialog');
  win.innerHTML = `
    <header class="pud-msgr-head">
      <button type="button" class="pud-msgr-back" data-act="min" title="Свернуть чат"><span aria-hidden="true">‹</span><span>Сообщ.</span></button>
      <div class="pud-msgr-who"><img class="pud-msgr-ava" alt=""><b class="pud-msgr-name"></b></div>
      <button type="button" class="pud-msgr-gear" data-act="settings" title="Ассистент: кто это, картинка, API">${icon('gear')}</button>
    </header>
    <div class="pud-msgr-notes"></div>
    <div class="pud-msgr-thread" role="log" aria-live="polite"></div>
    <footer class="pud-msgr-foot">
      <textarea rows="1" class="pud-msgr-input" placeholder="Сообщение"></textarea>
      <button type="button" class="pud-msgr-send" data-act="send">Отпр.</button>
    </footer>`;
  doc.body.append(win);
  undo.push(() => win.remove());
  const thread = win.querySelector('.pud-msgr-thread');
  const notes = win.querySelector('.pud-msgr-notes');
  const input = win.querySelector('.pud-msgr-input');
  const sendButton = win.querySelector('.pud-msgr-send');

  // ── место кнопки: справа от строки ввода, а если не помещается, над ней у правого края ──
  const place = () => {
    const rect = (doc.getElementById('form_sheld') ?? form).getBoundingClientRect();
    const size = 44;
    const rail = Number.parseFloat(doc.documentElement.style.getPropertyValue('--ku-rail-right')) || 0;
    const roomRight = view.innerWidth - rect.right - rail;
    if (rect.width && roomRight >= size + 16) {
      button.style.left = `${Math.round(rect.right + 10)}px`;
      button.style.top = `${Math.round(rect.bottom - size - 6)}px`;
    } else {
      button.style.left = `${Math.max(8, Math.round(view.innerWidth - size - 12 - rail))}px`;
      button.style.top = `${Math.max(8, Math.round((rect.top || view.innerHeight) - size - 10))}px`;
    }
    // окно встаёт над кнопкой
    const left = Number.parseFloat(button.style.left) || 0;
    const top = Number.parseFloat(button.style.top) || 0;
    const width = Math.min(340, view.innerWidth - 16);
    // the window was carried somewhere: it stays there
    const kept = settings?.messengerPos;
    if (kept && Number.isFinite(kept.left) && Number.isFinite(kept.top)) {
      win.style.left = `${Math.max(0, Math.min(view.innerWidth - 60, kept.left))}px`;
      win.style.top = `${Math.max(0, Math.min(view.innerHeight - 60, kept.top))}px`;
      win.style.bottom = 'auto';
      return;
    }
    win.style.top = '';
    win.style.left = `${Math.max(8, Math.min(view.innerWidth - width - 8, left + size - width))}px`;
    win.style.bottom = `${Math.max(8, Math.round(view.innerHeight - top + 10))}px`;
  };
  const resizeObserver = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(() => place()) : null;
  resizeObserver?.observe(form);
  view.addEventListener('resize', place);
  undo.push(() => { resizeObserver?.disconnect(); view.removeEventListener('resize', place); });

  // ── отрисовка ──
  const renderHead = () => {
    win.querySelector('.pud-msgr-name').textContent = data.assistant?.name ?? 'Ассистент';
    const face = avatarOf(data);
    if (face !== shownFace) { shownFace = face; win.querySelector('.pud-msgr-ava').src = face; button.querySelector('img').src = face; }
    button.title = `Чат: ${data.assistant?.name ?? 'ассистент'}`;
    button.querySelector('.pud-msgr-dot').hidden = !unread;
  };
  const renderNotes = () => {
    const list = data.conclusions ?? [];
    const on = list.filter(item => item.on).length;
    notes.innerHTML = `<button type="button" class="pud-msgr-notes-head" data-act="notes" aria-expanded="${notesOpen}">Договорённости · ${on} из ${list.length}<span aria-hidden="true">${notesOpen ? '▴' : '▾'}</span></button>
      ${notesOpen ? `<div class="pud-msgr-notes-body">${list.length ? list.map(item => editing === item.id
    ? `<div class="pud-msgr-note"><textarea class="text_pole" data-edit="${escapeHtml(item.id)}" rows="3">${escapeHtml(editText)}</textarea><div class="pud-msgr-row"><button type="button" class="menu_button" data-act="note-save" data-id="${escapeHtml(item.id)}">Сохранить</button><button type="button" class="menu_button" data-act="note-cancel">Отмена</button></div></div>`
    : `<div class="pud-msgr-note${item.on ? '' : ' off'}"><label><input type="checkbox" data-toggle="${escapeHtml(item.id)}" ${item.on ? 'checked' : ''}><span>${escapeHtml(item.text)}</span></label><span class="pud-msgr-row"><button type="button" class="pud-msgr-mini" data-act="note-edit" data-id="${escapeHtml(item.id)}" title="Поправить">${icon('pencil')}</button><button type="button" class="pud-msgr-mini" data-act="note-del" data-id="${escapeHtml(item.id)}" title="Удалить">${icon('trash')}</button></span></div>`).join('')
    : '<p class="pud-tech">Пока ничего. Когда вы к чему-то придёте, ассистент предложит вывод, и после «Да» он появится здесь и будет уходить рассказчику.</p>'}
        ${data.messages.length ? '<button type="button" class="pud-msgr-clear" data-act="clear">Очистить переписку (договорённости останутся)</button>' : ''}</div>` : ''}`;
  };
  const renderThread = () => {
    const name = data.assistant?.name ?? 'Ассистент';
    const lastUser = (() => { for (let i = data.messages.length - 1; i >= 0; i--) if (data.messages[i].role === 'user') return i; return -1; })();
    const bubbles = data.messages.map((message, index) => `<div class="pud-msgr-msg ${message.role}"><span>${escapeHtml(message.text)}</span>${index === lastUser ? `<small>${data.busy ? 'Доставлено' : 'Прочитано'}</small>` : ''}</div>`).join('');
    const hint = data.messages.length ? '' : `<p class="pud-msgr-hint">Это чат с «${escapeHtml(name)}», а не с героями: писать «OOC» не нужно. Ассистент видит последние сообщения игры и поможет разобраться, что и как вести дальше. В игровой чат отсюда ничего не попадает.</p>`;
    const waited = data.busy && busySince ? Math.round((Date.now() - busySince) / 1000) : 0;
    const typing = data.busy ? `<div class="pud-msgr-msg assistant typing"><span><i></i><i></i><i></i></span>${waited > 5 ? `<small>думает уже ${waited} с</small>` : ''}</div>` : '';
    const plaque = data.proposal ? `<div class="pud-msgr-plaque" role="group" aria-label="Вывод ассистента"><b>Вывод</b><p>${escapeHtml(data.proposal)}</p><p class="pud-tech">Отправляем в инъекцию? После «Да» это будет уходить рассказчику с каждым запросом, пока вы не выключите пункт в «Договорённостях».</p><div class="pud-msgr-row"><button type="button" class="menu_button" data-act="yes">Да</button><button type="button" class="menu_button" data-act="no">Нет</button><button type="button" class="menu_button" data-act="more">Ещё не всё</button></div></div>` : '';
    const last = data.messages.at(-1);
    const retry = !data.busy && last ? `<button type="button" class="pud-msgr-retry" data-act="retry">↻ ${last.role === 'user' ? 'Ответа нет, повторить' : 'Ответить заново'}</button>` : '';
    thread.innerHTML = hint + bubbles + typing + plaque + retry;
    thread.scrollTop = thread.scrollHeight;
  };
  const renderAll = () => {
    renderHead(); renderNotes(); renderThread();
    sendButton.disabled = Boolean(data.busy);
  };
  const setOpen = next => {
    open = next;
    win.hidden = !open;
    button.classList.toggle('on', open);
    if (open) { unread = false; seen = data.messages.length; place(); renderAll(); view.setTimeout(() => input.focus(), 30); } else renderHead();
  };
  const toggle = () => setOpen(!open);

  // ── перетаскивание за шапку (размер не меняется) ──
  let carry = null;
  const head = win.querySelector('.pud-msgr-head');
  head.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const rect = win.getBoundingClientRect();
    carry = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    head.setPointerCapture?.(event.pointerId);
    win.classList.add('pud-msgr-carried');
  });
  head.addEventListener('pointermove', event => {
    if (!carry) return;
    win.style.bottom = 'auto';
    win.style.left = `${Math.max(0, Math.min(view.innerWidth - 60, event.clientX - carry.dx))}px`;
    win.style.top = `${Math.max(0, Math.min(view.innerHeight - 60, event.clientY - carry.dy))}px`;
  });
  const letGo = () => {
    if (!carry) return;
    carry = null;
    win.classList.remove('pud-msgr-carried');
    if (settings) { settings.messengerPos = { left: Number.parseFloat(win.style.left) || 0, top: Number.parseFloat(win.style.top) || 0 }; try { save(); } catch (error) { report('мессенджер: сохранение места', error); } }
  };
  head.addEventListener('pointerup', letGo);
  head.addEventListener('pointercancel', letGo);

  // ── действия ──
  const run = async (what, task) => {
    try { await task(); } catch (error) { report(`ассистент: ${what}`, error); globalThis.toastr?.error?.(error?.message || 'Не получилось. Подробности в консоли (F12).', 'Закулисье'); }
  };
  const send = () => {
    const text = input.value.trim();
    if (!text || data.busy) return;
    input.value = '';
    draft = '';
    fit();
    run('отправка', () => api.send(text));
  };
  const fit = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 110)}px`; };
  input.addEventListener('input', () => { draft = input.value; fit(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
  });
  win.addEventListener('click', event => {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const act = target.dataset.act;
    const id = target.dataset.id;
    if (act === 'min') setOpen(false);
    else if (act === 'send') send();
    else if (act === 'settings') shared.hub?.open?.('assistants');
    else if (act === 'yes' || act === 'no' || act === 'more') run('вывод', () => api.answer(act === 'yes' ? 'yes' : act === 'more' ? 'more' : 'no'));
    else if (act === 'notes') { notesOpen = !notesOpen; renderNotes(); }
    else if (act === 'note-edit') { editing = id; editText = (data.conclusions.find(item => item.id === id)?.text) ?? ''; renderNotes(); }
    else if (act === 'note-cancel') { editing = ''; renderNotes(); }
    else if (act === 'note-save') run('правка', async () => { await api.conclusion({ id, op: 'edit', text: win.querySelector('[data-edit]')?.value ?? '' }); editing = ''; });
    else if (act === 'note-del') run('удаление', () => api.conclusion({ id, op: 'remove' }));
    else if (act === 'retry') run('повтор', () => api.retry());
    else if (act === 'clear') run('очистка', () => api.clear());
  });
  win.addEventListener('change', event => {
    const box = event.target.closest?.('[data-toggle]');
    if (box) run('договорённость', () => api.conclusion({ id: box.dataset.toggle, op: 'toggle' }));
  });
  win.addEventListener('input', event => { const area = event.target.closest?.('[data-edit]'); if (area) editText = area.value; });
  const onButton = event => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle();
  };
  button.addEventListener('click', onButton);
  button.addEventListener('keydown', onButton);
  shared.messenger = { open: () => setOpen(true), close: () => setOpen(false), toggle };
  undo.push(() => { delete shared.messenger; });

  // ── обновления из Закулисья ──
  const stop = api.subscribe(next => {
    const wasLength = data.messages.length;
    data = next;
    if (data.busy && !busySince) { busySince = Date.now(); busyTimer = view.setInterval(() => { if (open && data.busy) renderThread(); }, 3000); }
    if (!data.busy && busySince) { busySince = 0; view.clearInterval(busyTimer); }
    if (open) { seen = data.messages.length; renderAll(); } else {
      if (data.messages.length > seen && data.messages.length >= wasLength) unread = true;
      renderHead();
    }
  });
  undo.push(stop);
  renderHead();
  place();
  // строка ввода появляется и двигается позже старта: переставляем кнопку на следующем кадре и после загрузки
  view.requestAnimationFrame?.(place);
  view.setTimeout(place, 800);

  undo.push(() => view.clearInterval(busyTimer));
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат мессенджера', error); } } };
}
