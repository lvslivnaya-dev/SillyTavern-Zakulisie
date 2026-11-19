/**
 * Окно выбора персоны при заходе в чат. Таверна спрашивает сама только когда к персонажу подвязано несколько персон,
 * а здесь окно показывается всегда, даже если подвязана одна: «во избежание». Если не подвязано ни одной, большое предупреждение.
 * Окно не мешает: закрыть его можно, персона останется надета как была.
 */
import { report } from '../core/guard.js';
import { personaApi } from '../integration/personas-api.js';
import { PERSONA_BUTTON_ID } from './personas.js';

export const ENTRY_ID = 'pud-persona-entry';
const LAUNCH_QUIET_MS = 8000; // сразу после загрузки страницы чат открывается сам: не спрашиваем
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Аватары персон, подвязанных к этому чату (персонаж или группа), в порядке имён. */
export function connectedPersonas(power, connection) {
  if (!connection) return [];
  const names = power?.personas ?? {};
  return Object.entries(power?.persona_descriptions ?? {})
    .filter(([avatar, descriptor]) => names[avatar] !== undefined && (descriptor?.connections ?? []).some(link => link.type === connection.type && link.id === connection.id))
    .map(([avatar]) => ({ avatar, name: String(names[avatar] ?? avatar) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * @param {Document} doc
 * @param {{ context: any, api?: typeof personaApi }} deps
 */
export function startPersonaEntry(doc, { context, api = personaApi, quietMs = LAUNCH_QUIET_MS }) {
  const view = doc.defaultView;
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const startedAt = Date.now();
  let lastChat = '';
  let box = null;

  const close = () => { box?.remove(); box = null; };

  async function show() {
    await api.ready();
    const connection = api.connection();
    if (!connection) return;
    const list = connectedPersonas(api.power(), connection);
    // Несколько подвязанных и включено «несколько персон»: таверна спросит сама, второй раз не нужно.
    if (list.length > 1 && api.allowMulti()) return;
    close();
    const current = api.current();
    box = doc.createElement('div');
    box.id = ENTRY_ID;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.className = list.length ? 'pud-pentry' : 'pud-pentry warn';
    box.innerHTML = list.length
      ? `<div class="pud-pentry-card"><h3>Кем ты будешь в этом чате?</h3>
          <div class="pud-pq-grid">${list.map(item => `<button type="button" class="pud-pq-it${item.avatar === current ? ' on' : ''}" data-avatar="${escapeHtml(item.avatar)}"><img src="${escapeHtml(api.thumbUrl(item.avatar))}" alt=""><span>${escapeHtml(item.name)}</span></button>`).join('')}</div>
          <button type="button" class="menu_button" data-close>Оставить как есть</button></div>`
      : `<div class="pud-pentry-card"><h3>⚠ Нет подвязанных персон</h3>
          <p>К этому чату не подвязано ни одной персоны. Сейчас на тебе та, что надета в таверне, а подвязка к карточке персоны не сработает.</p>
          <button type="button" class="menu_button" data-open>Открыть окно персон</button> <button type="button" class="menu_button" data-close>Понятно</button></div>`;
    box.addEventListener('click', async event => {
      if (event.target === box || event.target.closest('[data-close]')) { close(); return; }
      if (event.target.closest('[data-open]')) { close(); doc.querySelector(`#${PERSONA_BUTTON_ID} .drawer-icon`)?.click(); return; }
      const avatar = event.target.closest('[data-avatar]')?.dataset.avatar;
      if (!avatar) return;
      close();
      if (avatar === api.current()) return;
      try { await api.wear(avatar); } catch (error) { report('выбор персоны при входе в чат', error); globalThis.toastr?.error?.('Персона не наделась. Подробности в консоли (F12).', 'Закулисье'); }
    });
    doc.body.append(box);
  }

  const onChat = () => {
    try {
      const id = String(live().getCurrentChatId?.() ?? '');
      const changed = id && id !== lastChat;
      lastChat = id;
      if (!id) { close(); return; }
      if (changed && Date.now() - startedAt > quietMs) show().catch(error => report('выбор персоны при входе в чат', error));
    } catch (error) { report('выбор персоны при входе в чат', error); }
  };
  const type = context.eventTypes?.CHAT_CHANGED;
  if (type) context.eventSource?.on?.(type, onChat);
  const onKey = event => { if (event.key === 'Escape' && box) close(); };
  doc.addEventListener('keydown', onKey);
  lastChat = String(live().getCurrentChatId?.() ?? '');

  return () => {
    if (type) context.eventSource?.removeListener?.(type, onChat);
    doc.removeEventListener('keydown', onKey);
    close();
  };
}
