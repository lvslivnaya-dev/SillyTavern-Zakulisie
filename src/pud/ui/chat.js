/** Чат: таймскипы превращаются в разделитель, рядом с «отправить» появляется кнопка перегенерации. Текст сообщений не меняется, только их отображение. */
import { report } from '../core/guard.js';

export const SKIP_CLASS = 'pud-skip';
export const REGEN_ID = 'pud-regen';

/** [Timeskip …], [Time skip …], [Timeskeep …], [Таймскип …], [Тайм-скип …] */
export const SKIP_PATTERN = /\[(?:time[\s-]?sk(?:i|ee)p|тайм[\s-]?скип)(?!\p{L})[^\]\n]*\]/giu;

/** Оборачивает таймскипы в span.pud-skip. Возвращает, сколько нашлось. Уже обёрнутые не трогает. */
export function markTimeskips(root) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode: node => (node.parentElement?.closest(`.${SKIP_CLASS}, code, pre, textarea`) ? 2 /* REJECT */ : 1 /* ACCEPT */),
  });
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    SKIP_PATTERN.lastIndex = 0;
    if (SKIP_PATTERN.test(node.nodeValue)) nodes.push(node);
  }
  let count = 0;
  for (const node of nodes) {
    const text = node.nodeValue;
    const parts = doc.createDocumentFragment();
    let last = 0;
    SKIP_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(SKIP_PATTERN)) {
      if (match.index > last) parts.append(text.slice(last, match.index));
      const span = doc.createElement('span');
      span.className = SKIP_CLASS;
      span.textContent = match[0].slice(1, -1).trim();
      parts.append(span);
      last = match.index + match[0].length;
      count++;
    }
    if (last < text.length) parts.append(text.slice(last));
    node.replaceWith(parts);
  }
  return count;
}

/** Возвращает таймскипам исходный вид «[…]». */
export function unmarkTimeskips(root) {
  for (const span of root.querySelectorAll(`.${SKIP_CLASS}`)) span.replaceWith(`[${span.textContent}]`);
}

/** Следит за чатом: новые, перерисованные и стримящиеся сообщения обрабатываются сразу. */
function watchTimeskips(doc) {
  const chat = doc.getElementById('chat');
  if (!chat) return () => {};
  // Только сообщения, в которых что-то поменялось: при стриминге чат меняется на каждом токене,
  // и обход всех сообщений на каждый кадр давал подлагивания в длинных чатах.
  const dirty = new Set();
  const mark = text => { if (text.textContent.includes('[')) markTimeskips(text); };
  const scan = () => {
    try { for (const text of chat.querySelectorAll('.mes_text')) mark(text); } catch (error) { report('таймскипы', error); }
  };
  const flush = () => {
    const texts = [...dirty];
    dirty.clear();
    try { for (const text of texts) if (text.isConnected) mark(text); } catch (error) { report('таймскипы', error); }
  };
  let queued = false;
  const view = doc.defaultView;
  const schedule = records => {
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const own = target?.closest('.mes_text');
      if (own) { dirty.add(own); continue; }
      // выше текста сообщения: добавили сами сообщения (новое, подгрузка истории, смена чата)
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('.mes_text')) dirty.add(node);
        for (const text of node.querySelectorAll('.mes_text')) dirty.add(text);
      }
    }
    if (queued || !dirty.size) return;
    queued = true;
    (view?.requestAnimationFrame ?? setTimeout)(() => { queued = false; flush(); });
  };
  const observer = new view.MutationObserver(schedule);
  observer.observe(chat, { childList: true, subtree: true, characterData: true });
  scan();
  return () => {
    observer.disconnect();
    unmarkTimeskips(chat);
  };
}

/** Кнопка перегенерации рядом с «продолжить»: нажимает родной пункт меню таверны. */
function addRegenerateButton(doc) {
  const form = doc.getElementById('rightSendForm');
  const native = () => doc.getElementById('option_regenerate');
  if (!form || !native()) return () => {};
  const button = doc.createElement('div');
  button.id = REGEN_ID;
  button.className = 'fa-solid fa-rotate-right interactable';
  button.title = 'Перегенерировать';
  button.tabIndex = 0;
  const run = event => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    native()?.click();
  };
  button.addEventListener('click', run);
  button.addEventListener('keydown', run);
  const before = doc.getElementById('mes_continue');
  if (before?.parentElement === form) before.before(button);
  else form.prepend(button);
  return () => button.remove();
}

export function startChat(doc) {
  const undo = [watchTimeskips(doc), addRegenerateButton(doc)];
  return () => { for (const fn of undo.reverse()) fn(); };
}
