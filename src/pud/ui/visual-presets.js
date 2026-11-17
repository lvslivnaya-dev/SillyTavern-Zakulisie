/**
 * «Визуальные пресеты» (блок «Визуал» окна Закулисья): сохранить нынешний вид (фон, палитру, свои иконки, тему по настроению)
 * под именем и потом вернуть одним нажатием. В пресет можно положить любые части: что не отмечено, того в нём нет и при применении оно не меняется.
 * Сами части живут в своих вкладках; они отдают и принимают свои данные через shared.visual.{palette, icons, mood}.
 */
import { report } from '../core/guard.js';
import { PART_IDS, PART_LABELS, addPreset, changeParts, describe, normalizePresets, removePreset, renamePreset } from '../core/visual-presets.js';
import { applyBackground, currentBackground } from '../integration/background-api.js';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const HINTS = {
  background: 'Какой фон стоит в таверне',
  palette: 'Цвета Закулисья и лапки (своя палитра кладётся в пресет целиком)',
  icons: 'Свои иконки, которые вы загрузили (они делают пресет тяжелее)',
  mood: 'Правила «темы по настроению»: часы, накал, погода, цвета',
};

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, shared?: any }} deps
 */
export function startVisualPresets(doc, { settings, save, shared = {}, background = { current: currentBackground, apply: applyBackground } }) {
  const tab = shared.hub?.addTab?.('vpresets', 'Визуальные пресеты', 'wand');
  if (!tab) return () => {};
  const pane = tab.pane;
  settings.visualPresets = normalizePresets(settings.visualPresets);
  const list = () => settings.visualPresets;
  const persist = () => { try { save(); } catch (error) { report('визуальные пресеты: сохранение', error); } };
  const include = new Set(PART_IDS);
  let name = '';
  let notice = '';
  let armedDelete = '';

  /** What is on now, as the presets keep it. A part that cannot be read is simply missing. */
  async function nowLook() {
    const visual = shared.visual ?? {};
    const read = (id, work) => { try { return work(); } catch (error) { report(`визуальные пресеты: ${id}`, error); return null; } };
    return {
      background: await background.current(),
      palette: read('палитра', () => visual.palette?.get?.() ?? null),
      icons: read('иконки', () => visual.icons?.get?.() ?? null),
      mood: read('тема', () => visual.mood?.get?.() ?? null),
    };
  }

  const partChips = preset => describe(preset).map(item => `<span class="pud-vp-part" title="${escapeHtml(HINTS[item.id])}"><b>${escapeHtml(item.label)}</b> ${escapeHtml(item.note)}</span>`).join('');

  const presetRow = preset => `<li class="pud-vp" data-id="${escapeHtml(preset.id)}">
      <div class="pud-vp-head">
        <input type="text" class="text_pole" data-vp-name value="${escapeHtml(preset.name)}" maxlength="60" aria-label="Название пресета">
        <button type="button" class="menu_button" data-vp="apply">Применить</button>
      </div>
      <div class="pud-vp-parts">${partChips(preset)}</div>
      <div class="pud-vp-edit">
        <span class="pud-hint">В пресете:</span>
        ${PART_IDS.map(id => `<label class="pud-vp-toggle" title="${escapeHtml(preset.parts[id] ? 'Убрать эту часть из пресета' : 'Добавить эту часть: возьмётся то, что стоит сейчас')}"><input type="checkbox" data-vp-part="${id}"${preset.parts[id] ? ' checked' : ''}><span>${escapeHtml(PART_LABELS[id])}</span></label>`).join('')}
        <button type="button" class="menu_button" data-vp="refresh" title="Записать в пресет то, что стоит сейчас, для его частей">Обновить из текущего</button>
        <button type="button" class="menu_button${armedDelete === preset.id ? ' armed' : ''}" data-vp="delete">${armedDelete === preset.id ? 'Точно удалить?' : 'Удалить'}</button>
      </div>
    </li>`;

  function render() {
    pane.innerHTML = `
      <h3>Визуальные пресеты</h3>
      <p class="pud-hint">Сохраните нынешний вид под именем: фон, палитру, свои иконки и тему по настроению. Потом одним нажатием вернёте весь набор. Заполнять все части не обязательно: что не отмечено, в пресет не попадёт и при применении не изменится.</p>
      <div class="pud-card pud-card-col">
        <b>Сохранить текущий вид</b>
        <input type="text" class="text_pole" data-vp-new value="${escapeHtml(name)}" maxlength="60" placeholder="Название: например, «Вечерний лаванд»">
        <div class="pud-vp-include">${PART_IDS.map(id => `<label class="checkbox_label" title="${escapeHtml(HINTS[id])}"><input type="checkbox" data-vp-inc="${id}"${include.has(id) ? ' checked' : ''}><span>${escapeHtml(PART_LABELS[id])}</span></label>`).join('')}</div>
        <div class="pud-peek-city"><button type="button" class="menu_button" data-vp="save">Сохранить пресет</button></div>
      </div>
      ${notice ? `<p class="pud-hint pud-vp-note" role="status">${escapeHtml(notice)}</p>` : ''}
      <div class="pud-card pud-card-col">
        <b>Мои пресеты · ${list().length}</b>
        ${list().length ? `<ul class="pud-vp-list">${list().map(presetRow).join('')}</ul>` : '<p class="pud-lib-empty">Пока пусто: настройте вид во вкладках «Фон», «Палитра», «Иконки», «Тема по настроению» и сохраните его выше.</p>'}
      </div>`;
  }

  async function apply(preset) {
    const visual = shared.visual ?? {};
    const done = [];
    const failed = [];
    const run = async (id, work) => {
      try { await work(); done.push(PART_LABELS[id]); } catch (error) { report(`пресет «${preset.name}»: ${id}`, error); failed.push(`${PART_LABELS[id]} (${error?.message ?? error})`); }
    };
    const parts = preset.parts;
    if (parts.palette) await run('palette', () => { if (!visual.palette) throw new Error('вкладка палитры не запущена'); visual.palette.set(parts.palette); });
    if (parts.icons) await run('icons', () => { if (!visual.icons) throw new Error('вкладка иконок не запущена'); visual.icons.set(parts.icons); });
    if (parts.mood) await run('mood', () => { if (!visual.mood) throw new Error('вкладка темы не запущена'); visual.mood.set(parts.mood); });
    if (parts.background) await run('background', () => background.apply(parts.background.name));
    notice = `«${preset.name}»: применено ${done.length ? done.join(', ').toLocaleLowerCase('ru-RU') : 'ничего'}${failed.length ? `. Не вышло: ${failed.join('; ')}` : '.'}`;
  }

  const onClick = async event => {
    const button = event.target.closest?.('[data-vp]');
    if (!button) return;
    const row = button.closest('[data-id]');
    const id = row?.dataset.id ?? '';
    const act = button.dataset.vp;
    try {
      if (act === 'save') {
        settings.visualPresets = addPreset(list(), name, await nowLook(), [...include]);
        name = '';
        notice = 'Пресет сохранён.';
        persist();
      } else if (act === 'apply') {
        const preset = list().find(item => item.id === id);
        if (preset) await apply(preset);
      } else if (act === 'refresh') {
        const preset = list().find(item => item.id === id);
        if (preset) { settings.visualPresets = changeParts(list(), id, await nowLook(), { add: PART_IDS.filter(part => preset.parts[part]) }); notice = `«${preset.name}» обновлён по тому, что стоит сейчас.`; persist(); }
      } else if (act === 'delete') {
        if (armedDelete !== id) { armedDelete = id; render(); return; }
        settings.visualPresets = removePreset(list(), id);
        armedDelete = '';
        notice = 'Пресет удалён.';
        persist();
      }
    } catch (error) {
      notice = error?.message ?? String(error);
    }
    render();
  };

  const onChange = async event => {
    const target = event.target;
    try {
      if (target.matches?.('[data-vp-inc]')) { if (target.checked) include.add(target.dataset.vpInc); else include.delete(target.dataset.vpInc); return; }
      if (target.matches?.('[data-vp-name]')) {
        settings.visualPresets = renamePreset(list(), target.closest('[data-id]').dataset.id, target.value);
        persist();
        render();
        return;
      }
      if (target.matches?.('[data-vp-part]')) {
        const id = target.closest('[data-id]').dataset.id;
        const part = target.dataset.vpPart;
        const before = list();
        settings.visualPresets = changeParts(before, id, await nowLook(), target.checked ? { add: [part] } : { drop: [part] });
        const preset = list().find(item => item.id === id);
        notice = target.checked && !preset?.parts[part] ? `Часть «${PART_LABELS[part]}» сейчас пуста: нечего добавить.` : (!target.checked && preset?.parts[part] ? 'В пресете должна остаться хотя бы одна часть.' : '');
        persist();
        render();
      }
    } catch (error) { notice = error?.message ?? String(error); render(); }
  };
  const onInput = event => { if (event.target.matches?.('[data-vp-new]')) name = event.target.value; };
  pane.addEventListener('click', onClick);
  pane.addEventListener('change', onChange);
  pane.addEventListener('input', onInput);
  const observer = new doc.defaultView.MutationObserver(() => { if (!pane.hidden) render(); });
  observer.observe(pane, { attributes: true, attributeFilter: ['hidden'] });
  render();

  return () => {
    observer.disconnect();
    pane.removeEventListener('click', onClick);
    pane.removeEventListener('change', onChange);
    pane.removeEventListener('input', onInput);
    tab.remove?.();
  };
}
