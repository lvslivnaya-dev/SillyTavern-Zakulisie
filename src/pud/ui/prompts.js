/**
 * Вкладка «Промпты» в окне настроек Закулисья: библиотека встроенных промптов нарратора.
 * Карточки с названием и началом текста; клик открывает окно правки поверх. Правки сохраняются сами.
 * Промпт «по умолчанию» подставляется в описание нового нарратора.
 */
import { report } from '../core/guard.js';
import { addPrompt, duplicatePrompt, normalizePrompts, promptTokens, removePrompt, setDefaultPrompt, updatePrompt } from '../core/prompts.js';
import { icon } from './icons.js';
import { createWindow } from './window.js';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const preview = (text, limit = 140) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
};

/**
 * @param {Document} doc
 * @param {{ settings: any, save: () => void, hub?: { addTab: Function } }} deps
 */
export function startPrompts(doc, { settings, save, hub }) {
  const tab = hub?.addTab('prompts', 'Промпты', 'doc');
  if (!tab) return () => {};
  const undo = [() => tab.remove()];
  const list = () => (settings.prompts = normalizePrompts(settings.prompts));
  const commit = next => { settings.prompts = next; try { save(); } catch (error) { report('промпты: сохранение', error); } };

  const edit = createWindow(doc, { id: 'prompt-edit', title: 'Промпт', icon: 'doc', width: 640, height: 560, store: settings.windows, save });
  undo.push(() => edit.destroy());
  edit.element.classList.add('pud-prompt-win');
  edit.body.innerHTML = `
    <div class="pud-prompt-inner">
      <label class="pud-tech">Название</label>
      <input class="text_pole pud-prompt-name" maxlength="80" placeholder="Например: Нарратор, сильный">
      <label class="pud-tech">Промпт</label>
      <textarea class="text_pole pud-prompt-text" spellcheck="true" placeholder="Текст, который встанет в описание нового нарратора"></textarea>
      <div class="pud-prompt-foot"><span class="pud-tech pud-prompt-count"></span><span class="pud-tech">Сохраняется само.</span></div>
    </div>`;
  const nameInput = edit.body.querySelector('.pud-prompt-name');
  const textInput = edit.body.querySelector('.pud-prompt-text');
  const count = edit.body.querySelector('.pud-prompt-count');
  let editing = '';

  const refreshCount = () => { count.textContent = `${textInput.value.length} зн. · ≈${promptTokens(textInput.value)} ток.`; };
  const render = () => {
    const prompts = list();
    const cards = prompts.map(item => `
      <div class="pud-prompt-card${item.isDefault ? ' on' : ''}" data-id="${escapeHtml(item.id)}" tabindex="0" role="button">
        <div class="pud-prompt-head"><b>${escapeHtml(item.name || 'Без названия')}</b>${item.isDefault ? '<span class="pud-tag">по умолчанию</span>' : ''}</div>
        <div class="pud-prompt-prev">${escapeHtml(preview(item.text)) || '<i>пусто</i>'}</div>
        <div class="pud-prompt-tools">
          <span class="pud-tech">≈${promptTokens(item.text)} ток.</span>
          <button type="button" class="pud-prompt-def" data-act="default" title="${item.isDefault ? 'Не подставлять в новых нарраторов' : 'Подставлять в новых нарраторов'}">${icon('heart')}</button>
          <button type="button" data-act="copy" title="Дублировать">${icon('copy')}</button>
          <button type="button" data-act="del" title="Удалить">${icon('trash')}</button>
        </div>
      </div>`).join('');
    tab.pane.innerHTML = `
      <h3>Промпты</h3>
      <p class="pud-hint">Встроенные промпты нарратора. Тот, что отмечен сердечком, подставляется в описание каждого нового нарратора при создании; остальные можно выбрать вручную.</p>
      <div class="pud-prompt-bar"><button type="button" class="menu_button pud-prompt-add">${icon('plus')} Новый промпт</button></div>
      <div class="pud-prompt-grid">${cards || '<p class="pud-hint">Пока ничего нет. Нажмите «Новый промпт» и вставьте свой текст нарратора: он будет лежать здесь одним экземпляром.</p>'}</div>`;
  };

  const openEditor = id => {
    const item = list().find(prompt => prompt.id === id);
    if (!item) return;
    editing = id;
    nameInput.value = item.name;
    textInput.value = item.text;
    refreshCount();
    edit.open();
  };
  const onNameInput = () => { if (editing) { commit(updatePrompt(list(), editing, { name: nameInput.value })); render(); } };
  const onTextInput = () => { if (editing) { commit(updatePrompt(list(), editing, { text: textInput.value })); refreshCount(); render(); } };
  nameInput.addEventListener('input', onNameInput);
  textInput.addEventListener('input', onTextInput);

  const onClick = event => {
    try {
      if (event.target.closest('.pud-prompt-add')) {
        const added = addPrompt(list(), { name: 'Новый промпт' });
        commit(added.prompts);
        render();
        openEditor(added.id);
        return;
      }
      const card = event.target.closest('.pud-prompt-card');
      if (!card) return;
      const id = card.dataset.id;
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'default') { commit(setDefaultPrompt(list(), id)); render(); }
      else if (act === 'copy') { commit(duplicatePrompt(list(), id).prompts); render(); }
      else if (act === 'del') {
        if (editing === id) { editing = ''; edit.close(); }
        commit(removePrompt(list(), id));
        render();
      } else openEditor(id);
    } catch (error) { report('промпты', error); }
  };
  tab.pane.addEventListener('click', onClick);
  undo.push(() => tab.pane.removeEventListener('click', onClick));
  render();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат промптов', error); } } };
}
