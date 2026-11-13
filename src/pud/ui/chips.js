/**
 * Кнопки пресета: полоска закреплённых тогглов над чатом и вкладка «Кнопки пресета» в окне Пудреницы.
 * Набор свой у каждой пары «пресет + профиль соединения». Нажатие переключает родной тоггл Prompt Manager.
 */
import { LABEL_MAX, barItems, isPinned, plainName, setLabel, togglePin, chipsFor } from '../core/chips.js';
import { report } from '../core/guard.js';
import { PM_CONTAINER_ID, currentSet, readPrompts, togglePrompt, usesPromptManager } from '../integration/prompts.js';
import { icon } from './icons.js';

export const BAR_ID = 'pud-chips';

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, hub?: { addTab: Function, open: Function } }} deps
 */
export function startChips(doc, { context, settings, save, hub }) {
  const view = doc.defaultView;
  const undo = [];
  // getContext() отдаёт снимок (mainApi, пресет), поэтому беру свежий при каждом чтении
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;

  // полоска над чатом (в общем потоке, как у других расширений: чат просто становится чуть ниже)
  const bar = doc.createElement('div');
  bar.id = BAR_ID;
  bar.hidden = true;
  const chat = doc.getElementById('chat');
  if (chat?.parentElement) {
    chat.before(bar);
    undo.push(() => bar.remove());
  }

  // вкладка в окне Пудреницы
  const tab = hub?.addTab('chips', 'Кнопки пресета', 'pin');
  if (tab) undo.push(() => tab.remove());

  const renderBar = (items, set) => {
    if (!usesPromptManager(live()) || !items.length) { bar.hidden = true; bar.replaceChildren(); return; }
    bar.hidden = false;
    bar.innerHTML = items.map(item => `<button type="button" class="pud-chip${item.enabled ? ' on' : ''}" data-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title)}${item.enabled ? ' — включён' : ' — выключен'}"><span class="pud-chip-dot"></span><span class="pud-chip-label">${escapeHtml(item.label)}</span></button>`).join('')
      + `<button type="button" class="pud-chip-edit" title="Выбрать кнопки для «${escapeHtml(set.preset)}»">${icon('pencil')}</button>`;
  };

  const renderTab = (prompts, set) => {
    if (!tab) return;
    const pane = tab.pane;
    if (!usesPromptManager(live())) {
      pane.innerHTML = '<h3>Кнопки пресета</h3><p class="pud-hint">Кнопки пресета работают с Chat Completion: у других API нет списка промптов с тогглами.</p>';
      return;
    }
    const rows = prompts.map(prompt => {
      const pinned = isPinned(settings, set.key, prompt.id);
      const label = chipsFor(settings, set.key).find(chip => chip.id === prompt.id)?.label ?? '';
      return `<div class="pud-tg${pinned ? ' pinned' : ''}" data-id="${escapeHtml(prompt.id)}">
        <span class="pud-tg-state${prompt.enabled ? ' on' : ''}" title="${prompt.enabled ? 'Включён' : 'Выключен'}"></span>
        <span class="pud-tg-name">${escapeHtml(prompt.name)}</span>
        <input class="text_pole pud-tg-label" maxlength="${LABEL_MAX}" placeholder="${escapeHtml(plainName(prompt.name))}" value="${escapeHtml(label)}" ${pinned ? '' : 'disabled'} title="Короткая подпись на кнопке. Сам промпт не меняется.">
        <button type="button" class="pud-tg-pin${pinned ? ' on' : ''}" title="${pinned ? 'Убрать с панели' : 'На панель'}">${icon('heart')}</button>
      </div>`;
    }).join('');
    pane.innerHTML = `
      <h3>Кнопки пресета</h3>
      <p class="pud-hint">Отметь сердечком тогглы, которые хочешь видеть над чатом. Подпись можно сделать короткой: она живёт только на кнопке, сам промпт и его название не меняются. Набор свой для каждой пары «пресет + профиль соединения».</p>
      <div class="pud-set"><span>Набор для</span><b>${escapeHtml(set.preset || 'без пресета')}</b><span>+</span><b>${escapeHtml(set.profileName || 'без профиля')}</b></div>
      <div class="pud-tg-list">${rows || '<p class="pud-hint">В этом пресете нет тогглов.</p>'}</div>`;
  };

  const refresh = () => {
    try {
      const set = currentSet(live());
      const prompts = readPrompts(doc, live());
      renderBar(barItems(settings, set.key, prompts), set);
      // пока человек печатает подпись, вкладку не перерисовываю, чтобы курсор не прыгал
      if (!tab?.pane.contains(doc.activeElement) || doc.activeElement?.tagName !== 'INPUT') renderTab(prompts, set);
    } catch (error) { report('кнопки пресета', error); }
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    (view.requestAnimationFrame ?? setTimeout)(() => { queued = false; refresh(); });
  };

  // нажатия
  bar.addEventListener('click', event => {
    const chip = event.target.closest('.pud-chip');
    if (chip) {
      if (!togglePrompt(doc, chip.dataset.id)) globalThis.toastr?.warning?.('Этого тоггла нет в открытом пресете.', 'Пудреница');
      schedule();
      return;
    }
    if (event.target.closest('.pud-chip-edit')) hub?.open('chips');
  });
  tab?.pane.addEventListener('click', event => {
    const row = event.target.closest('.pud-tg');
    if (!row || !event.target.closest('.pud-tg-pin')) return;
    togglePin(settings, currentSet(live()).key, row.dataset.id);
    save();
    refresh();
  });
  tab?.pane.addEventListener('input', event => {
    const input = event.target.closest('.pud-tg-label');
    if (!input) return;
    setLabel(settings, currentSet(live()).key, input.closest('.pud-tg').dataset.id, input.value);
    save();
    renderBar(barItems(settings, currentSet(live()).key, readPrompts(doc, live())), currentSet(live()));
  });
  tab?.pane.addEventListener('focusout', () => setTimeout(schedule, 0));

  // следим за списком промптов (перерисовывается при любом переключении и смене пресета) и за событиями таверны
  const pm = doc.getElementById(PM_CONTAINER_ID);
  if (pm) {
    const observer = new view.MutationObserver(schedule);
    observer.observe(pm, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    undo.push(() => observer.disconnect());
  }
  const types = context.eventTypes ?? {};
  for (const name of ['OAI_PRESET_CHANGED_AFTER', 'CONNECTION_PROFILE_LOADED', 'MAIN_API_CHANGED', 'SETTINGS_LOADED_AFTER']) {
    const type = types[name];
    if (!type || !context.eventSource?.on) continue;
    context.eventSource.on(type, schedule);
    undo.push(() => context.eventSource.removeListener?.(type, schedule));
  }

  refresh();
  return () => { for (const fn of undo.reverse()) fn(); };
}
