/**
 * Ручная страховка к Кулисам: кнопка над полем ввода скрывает (или возвращает) сообщения с № по №.
 * Скрытое остаётся в чате, но ИИ его не читает — это родное is_system таверны (как /hide 0-15).
 */
import { report } from '../core/guard.js';
import { plural } from '../core/library.js';

export const HIDER_ID = 'pud-hider';
const live = () => globalThis.SillyTavern?.getContext?.();

let chats = null;
export const hiderApi = {
  async hideRange(start, end, unhide) {
    chats ??= await import('../../../../../../chats.js');
    await chats.hideChatMessageRange(start, end, unhide);
  },
};

/** Разбирает «с» и «по». Возвращает [с, по] или текст ошибки. */
export function parseRange(fromRaw, toRaw, length) {
  const from = Number(String(fromRaw).trim());
  const to = Number(String(toRaw).trim() === '' ? fromRaw : toRaw);
  if (!length) return 'В чате пока нет сообщений.';
  if (!Number.isInteger(from) || !Number.isInteger(to)) return 'Номера должны быть целыми числами.';
  if (from < 0 || to < 0) return 'Номера начинаются с 0.';
  const last = length - 1;
  if (from > last) return `Последнее сообщение — № ${last}.`;
  return from <= to ? [from, Math.min(to, last)] : [to, Math.min(from, last)];
}

/**
 * @param {Document} doc
 * @param {{ context: any, api?: typeof hiderApi }} deps
 */
export function startHider(doc, { context, api = hiderApi }) {
  const form = doc.getElementById('send_form');
  if (!form) return () => {};
  const view = doc.defaultView;
  const ctx = () => live() ?? context;

  const button = doc.createElement('div');
  button.id = HIDER_ID;
  button.className = 'pud-hidebtn interactable';
  button.tabIndex = 0;
  button.setAttribute('role', 'button');
  button.title = 'Скрыть сообщения от ИИ (с № по №)';
  button.innerHTML = '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i>';

  // место: в ряду кнопок Guided Generations справа, иначе рядом с «перегенерировать»
  const place = () => {
    const target = doc.getElementById('gg-regular-buttons-container');
    if (target) { if (button.parentElement !== target) target.prepend(button); return; }
    const right = doc.getElementById('rightSendForm');
    if (right && button.parentElement !== right) right.prepend(button);
  };
  place();
  const observer = new view.MutationObserver(() => {
    const target = doc.getElementById('gg-regular-buttons-container');
    if (!button.isConnected || (target && button.parentElement !== target)) place();
  });
  observer.observe(form, { childList: true, subtree: true });

  const ask = async () => {
    const c = ctx();
    const chat = c.chat ?? [];
    if (!chat.length) { globalThis.toastr?.info?.('В чате пока нет сообщений.', 'Пудреница'); return; }
    const hidden = chat.filter(message => message?.is_system).length;
    const box = doc.createElement('div');
    box.className = 'pud-ask pud-hider';
    box.innerHTML = `<h3>Скрыть от ИИ</h3>
      <p class="pud-hint">Номера как у сообщений в чате: от 0 до ${chat.length - 1}. Скрытые остаются на экране, но ИИ их не читает. Сейчас скрыто: ${plural(hidden, 'сообщение', 'сообщения', 'сообщений')}.</p>
      <div class="pud-hider-range">
        <label class="pud-field"><span>С №</span><input class="text_pole" type="number" min="0" max="${chat.length - 1}" data-from value="0"></label>
        <label class="pud-field"><span>По №</span><input class="text_pole" type="number" min="0" max="${chat.length - 1}" data-to value="${Math.max(0, chat.length - 6)}"></label>
      </div>
      <div class="pud-seg pud-hider-mode" role="radiogroup">
        <label><input type="radio" name="pud-hider-mode" value="hide" checked><span>скрыть</span></label>
        <label><input type="radio" name="pud-hider-mode" value="show"><span>вернуть</span></label>
      </div>`;
    const ok = await c.callGenericPopup(box, c.POPUP_TYPE.CONFIRM, '', { okButton: 'Готово', cancelButton: 'Отмена' });
    if (!ok) return;
    const range = parseRange(box.querySelector('[data-from]').value, box.querySelector('[data-to]').value, chat.length);
    if (typeof range === 'string') { globalThis.toastr?.warning?.(range, 'Пудреница'); return; }
    const unhide = box.querySelector('input[name="pud-hider-mode"]:checked')?.value === 'show';
    await api.hideRange(range[0], range[1], unhide);
    const count = range[1] - range[0] + 1;
    globalThis.toastr?.success?.(`${unhide ? 'Возвращено' : 'Скрыто'}: ${plural(count, 'сообщение', 'сообщения', 'сообщений')}, с № ${range[0]} по № ${range[1]}.`, 'Пудреница');
  };
  const run = event => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    ask().catch(error => {
      report('скрыть сообщения', error);
      globalThis.toastr?.error?.('Не получилось скрыть. Подробности в консоли (F12).', 'Пудреница');
    });
  };
  button.addEventListener('click', run);
  button.addEventListener('keydown', run);

  return () => { observer.disconnect(); button.remove(); };
}
