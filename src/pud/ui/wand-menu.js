/**
 * Вкладка «Меню палочки» в окне настроек Закулисья: спрятать пункты расширений из меню «палочки» у поля ввода,
 * не удаляя сами расширения. Список берётся прямо из меню таверны; новые пункты, которые расширения добавят позже, подхватываются.
 */
import { report } from '../core/guard.js';
import { icon } from './icons.js';

export const WAND_HIDDEN_CLASS = 'pud-wand-hidden';
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Пункт меню → ключ и подпись (id надёжнее текста, но есть не у всех). */
export function wandItems(doc) {
  const menu = doc.getElementById('extensionsMenu');
  if (!menu) return [];
  const seen = new Set();
  const out = [];
  for (const node of menu.querySelectorAll('.list-group-item')) {
    const label = String(node.textContent ?? '').replace(/\s+/g, ' ').trim();
    const key = node.id || label;
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label, node });
  }
  return out;
}

/**
 * @param {Document} doc
 * @param {{ settings: any, save: () => void, hub?: { addTab: Function } }} deps
 */
export function startWandMenu(doc, { settings, save, hub }) {
  const menu = doc.getElementById('extensionsMenu');
  const tab = hub?.addTab('wand', 'Меню палочки', 'puzzle');
  if (!tab) return () => {};
  const pane = tab.pane;
  const view = doc.defaultView;
  const hidden = () => (Array.isArray(settings.wandHidden) ? settings.wandHidden : (settings.wandHidden = []));
  const apply = () => { for (const { key, node } of wandItems(doc)) node.classList.toggle(WAND_HIDDEN_CLASS, hidden().includes(key)); };

  const render = () => {
    const items = wandItems(doc);
    pane.innerHTML = `
      <div class="pud-card">
        <div>
          <b>Пункты меню «палочки»</b>
          <p class="pud-hint">Снимите галочку у расширения, которым не пользуетесь: пункт исчезнет из меню у поля ввода. Само расширение остаётся установленным и работает.</p>
        </div>
      </div>
      <div class="pud-wand-list">${items.length ? items.map(item => `
        <label class="pud-opt"><span>${escapeHtml(item.label)}</span><input type="checkbox" data-key="${escapeHtml(item.key)}" ${hidden().includes(item.key) ? '' : 'checked'}></label>`).join('')
    : '<p class="pud-lib-empty">В меню пока нет пунктов расширений.</p>'}</div>
      ${hidden().length ? `<div class="pud-wand-foot"><button type="button" class="menu_button" data-act="show-all">${icon('redo')}<span>Вернуть все пункты</span></button></div>` : ''}`;
  };
  const onChange = event => {
    const box = event.target.closest?.('input[data-key]');
    if (!box) return;
    const key = box.dataset.key;
    const next = hidden().filter(item => item !== key);
    if (!box.checked) next.push(key);
    settings.wandHidden = next;
    try { save(); } catch (error) { report('меню палочки: сохранение', error); }
    apply();
    render();
  };
  const onClick = event => {
    if (!event.target.closest?.('[data-act="show-all"]')) return;
    settings.wandHidden = [];
    try { save(); } catch (error) { report('меню палочки: сохранение', error); }
    apply();
    render();
  };
  pane.addEventListener('change', onChange);
  pane.addEventListener('click', onClick);

  // расширения добавляют свои пункты позже и по одному: прячем и обновляем список
  let timer = 0;
  const observer = menu ? new view.MutationObserver(() => {
    view.clearTimeout(timer);
    timer = view.setTimeout(() => { apply(); if (!pane.hidden) render(); }, 60);
  }) : null;
  observer?.observe(menu, { childList: true, subtree: true });
  // вкладку открыли: список свежий
  const paneObserver = new view.MutationObserver(() => { if (!pane.hidden) render(); });
  paneObserver.observe(pane, { attributes: true, attributeFilter: ['hidden'] });
  apply();
  render();

  return () => {
    view.clearTimeout(timer);
    observer?.disconnect();
    paneObserver.disconnect();
    pane.removeEventListener('change', onChange);
    pane.removeEventListener('click', onClick);
    for (const { node } of wandItems(doc)) node.classList.remove(WAND_HIDDEN_CLASS);
    tab.remove();
  };
}
