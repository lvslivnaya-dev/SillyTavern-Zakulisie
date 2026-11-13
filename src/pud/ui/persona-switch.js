/**
 * Быстрая смена персоны: у поля ввода круглое фото надетой персоны, по нажатию — фотографии всех персон.
 * Нажала на фото — персона надета (родной setUserAvatar). Архивные не показываются, избранные первыми.
 */
import { report } from '../core/guard.js';
import { personaApi } from '../integration/personas-api.js';
import { PERSONA_BUTTON_ID } from './personas.js';

export const QUICK_ID = 'pud-persona-quick';
export const POP_ID = 'pud-persona-pop';
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Персоны для выбора: избранные первыми, потом по имени; архивные убраны. */
export function quickPersonas(names = {}, settings) {
  const favorites = new Set(settings.favorites.personas);
  const archived = new Set(settings.archive.personas);
  return Object.entries(names)
    .filter(([avatar]) => !archived.has(avatar))
    .map(([avatar, name]) => ({ avatar, name: String(name ?? avatar), fav: favorites.has(avatar) }))
    .sort((a, b) => Number(b.fav) - Number(a.fav) || a.name.localeCompare(b.name, 'ru'));
}

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, api?: typeof personaApi }} deps
 */
export function startPersonaSwitch(doc, { context, settings, api = personaApi }) {
  const left = doc.getElementById('leftSendForm');
  if (!left) return () => {};
  const view = doc.defaultView;
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  const names = () => live().powerUserSettings?.personas ?? {};

  const button = doc.createElement('div');
  button.id = QUICK_ID;
  button.className = 'interactable';
  button.tabIndex = 0;
  button.setAttribute('role', 'button');
  button.setAttribute('aria-haspopup', 'true');
  button.innerHTML = '<img alt="">';
  left.append(button);
  const img = button.querySelector('img');

  const pop = doc.createElement('div');
  pop.id = POP_ID;
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Сменить персону');
  doc.body.append(pop);

  const refresh = async () => {
    try {
      await api.ready();
      const avatar = api.current();
      const name = names()[avatar] ?? 'персона не выбрана';
      if (avatar) img.src = api.thumbUrl(avatar); else img.removeAttribute('src');
      button.title = `Персона: ${name}. Нажми, чтобы сменить`;
      button.setAttribute('aria-label', button.title);
    } catch (error) { report('быстрая смена персоны', error); }
  };

  const render = () => {
    const current = api.current();
    const list = quickPersonas(names(), settings);
    pop.innerHTML = `<div class="pud-pq-head"><b>Персона</b><button type="button" class="pud-pq-all" data-all>Все персоны</button></div>
      <div class="pud-pq-grid">${list.map(persona => `<button type="button" class="pud-pq-it${persona.avatar === current ? ' on' : ''}" data-avatar="${escapeHtml(persona.avatar)}" title="${escapeHtml(persona.name)}" aria-pressed="${persona.avatar === current}">
          <img src="${escapeHtml(api.thumbUrl(persona.avatar))}" alt="" loading="lazy"><span>${escapeHtml(persona.name)}</span>${persona.fav ? '<i class="pud-pq-fav" aria-hidden="true"></i>' : ''}
        </button>`).join('') || '<p class="pud-hint">Персон пока нет.</p>'}</div>`;
  };
  const place = () => {
    const rect = button.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(rect.left, view.innerWidth - pop.offsetWidth - 8))}px`;
    pop.style.bottom = `${Math.max(8, view.innerHeight - rect.top + 10)}px`;
  };
  const close = () => { pop.hidden = true; button.classList.remove('on'); };
  const open = async () => {
    try {
      await api.ready();
      render();
      pop.hidden = false;
      button.classList.add('on');
      place();
      pop.querySelector('.pud-pq-it.on')?.scrollIntoView?.({ block: 'nearest' });
    } catch (error) { report('быстрая смена персоны', error); }
  };
  const onButton = event => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (pop.hidden) open(); else close();
  };
  button.addEventListener('click', onButton);
  button.addEventListener('keydown', onButton);

  pop.addEventListener('click', async event => {
    if (event.target.closest('[data-all]')) {
      close();
      doc.querySelector(`#${PERSONA_BUTTON_ID} .drawer-icon`)?.click();
      return;
    }
    const avatar = event.target.closest('[data-avatar]')?.dataset.avatar;
    if (!avatar) return;
    close();
    if (avatar === api.current()) return;
    try {
      await api.wear(avatar);
      await refresh();
    } catch (error) {
      report('надеть персону', error);
      globalThis.toastr?.error?.('Персона не наделась. Подробности в консоли (F12).', 'Пудреница');
    }
  });
  const onOutside = event => { if (!pop.hidden && !pop.contains(event.target) && !button.contains(event.target)) close(); };
  const onKey = event => { if (event.key === 'Escape' && !pop.hidden) close(); };
  doc.addEventListener('pointerdown', onOutside, true);
  doc.addEventListener('keydown', onKey);

  const types = context.eventTypes ?? {};
  const events = ['PERSONA_CHANGED', 'PERSONA_UPDATED', 'PERSONA_RENAMED', 'PERSONA_DELETED', 'CHAT_CHANGED', 'SETTINGS_LOADED'].map(name => types[name]).filter(Boolean);
  for (const type of events) context.eventSource?.on?.(type, refresh);
  refresh();

  return () => {
    for (const type of events) context.eventSource?.removeListener?.(type, refresh);
    doc.removeEventListener('pointerdown', onOutside, true);
    doc.removeEventListener('keydown', onKey);
    pop.remove();
    button.remove();
  };
}
